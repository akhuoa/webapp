import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';

import { toShadowCssAst } from './shadow.css.plugin.ts';

// A Vite plugin that provides PrimeVue's CSS for our OpenCOR component as a virtual module.
// Note #1: PrimeVue normally injects its CSS (i.e. its theme's CSS variables and the styles of its components) into the
//          host document's head at run time, which means that it would leak into a host application and that it
//          wouldn't apply within our shadow root. So, instead, we tell PrimeVue not to inject anything (see
//          src/element.ts) and generate its CSS at build time, using the same APIs that PrimeVue uses for server-side
//          rendering, so that we can inject it into our shadow root ourselves.
// Note #2: we generate the CSS of the PrimeVue components that we use, as well as that of the PrimeVue components and
//          directives that they use themselves (e.g., PrimeVue's Select component uses its InputText component), which
//          we determine by following their imports. So, if we start using a new PrimeVue component, it must be added
//          to PRIMEVUE_COMPONENTS (we warn about it in development mode, see src/element.ts).
// Note #3: the virtual module also exports the PrimeVue style modules for which we generate some CSS, so that we can
//          tell PrimeVue not to inject their CSS into the host document's head (see src/element.ts).
// Note #4: our theme must be in sync with the one we use at run time (see src/element.ts).

const PRIMEVUE_COMPONENTS = [
  // The PrimeVue components that we use.

  'blockui',
  'button',
  'checkbox',
  'column',
  'contextmenu',
  'datatable',
  'dialog',
  'fieldset',
  'floatlabel',
  'iconfield',
  'inputicon',
  'inputnumber',
  'inputtext',
  'keyfilter',
  'menubar',
  'message',
  'popover',
  'progressbar',
  'scrollpanel',
  'select',
  'slider',
  'splitter',
  'splitterpanel',
  'tab',
  'tablist',
  'tabpanel',
  'tabpanels',
  'tabs',
  'tag',
  'toast',
  'togglebutton',
  'toggleswitch',
  'toolbar',

  // The PrimeVue components that CellDL Editor uses (see src/celldl/runtime.ts) and that we don't use ourselves.
  // Note: CellDL Editor comes with its own copy of PrimeVue, but its components use our PrimeVue configuration, i.e.
  //       no theme (see src/element.ts), so they rely on the styles that we generate.

  'accordion',
  'accordioncontent',
  'accordionheader',
  'accordionpanel',
  'card',
  'divider'
];

// Note: PrimeVue defines its theme's CSS variables on `:root` (i.e. on our shadow host, see src/common/shadowCss.ts) and
//       their dark version on the element that matches its dark mode selector. That element must be the same one, since
//       CSS variables that reference other CSS variables (e.g., `--p-menubar-background: var(--p-content-background)`)
//       get resolved where they are defined. So, we use the data-opencor-theme attribute of our shadow host (see
//       OpenCORCore.vue) rather than the opencor-dark-mode class (which is set on the root element of our shadow root).

export const PRIMEVUE_DARK_MODE_SELECTOR = ':host([data-opencor-theme="dark"]){[CSS]}';

const VIRTUAL_MODULE_ID = 'virtual:opencor-primevue-css';
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;
const IMPORT_REGEX = /from\s*['"]((?:primevue|@primevue\/(?:core|icons))\/[\w/-]+)['"]/g;
const STYLE_REGEX = /<style[^>]*>([\s\S]*?)<\/style>/g;

interface IPrimeVueStyle {
  getStyleSheet: () => string;
  getThemeStyleSheet: () => string;
  getCommonThemeStyleSheet: () => string;
}

const styleSheetCss = (styleSheet: string): string => {
  return [...styleSheet.matchAll(STYLE_REGEX)].map((match) => match[1]).join('\n');
};

export const primeVueCssPlugin = (): Plugin => {
  let importer = '';
  let virtualModule: Promise<string> | undefined;

  return {
    name: 'opencor-primevue-css',
    configResolved(config) {
      // Note: we resolve PrimeVue's modules from our renderer's root, i.e. the same way that our OpenCOR component
      //       resolves them.

      importer = path.join(config.root, 'index.ts');
    },
    resolveId(id) {
      return id === VIRTUAL_MODULE_ID ? RESOLVED_VIRTUAL_MODULE_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_MODULE_ID) {
        return null;
      }

      virtualModule ??= (async () => {
        // Determine the PrimeVue style modules that we need by following the imports of the PrimeVue components that we
        // use.

        // Note: we use Node.js's module resolution rather than Vite's since, in development mode, Vite resolves
        //       dependencies to their pre-bundled version. This is fine since we only need PrimeVue's modules to
        //       generate some CSS, while the imports of our virtual module (see below) are resolved by Vite.

        const nodeRequire = createRequire(importer);

        const resolve = async (specifier: string): Promise<string> => {
          return nodeRequire.resolve(specifier);
        };

        const visited = new Set<string>();
        const styleSpecifiers = new Set<string>(['@primevue/core/basecomponent/style']);

        const visit = async (specifier: string): Promise<void> => {
          if (visited.has(specifier)) {
            return;
          }

          visited.add(specifier);

          const code = fs.readFileSync(await resolve(specifier), 'utf-8');

          for (const match of code.matchAll(IMPORT_REGEX)) {
            const importSpecifier = match[1] as string;

            if (importSpecifier.endsWith('/style')) {
              styleSpecifiers.add(importSpecifier);
            } else {
              await visit(importSpecifier);
            }
          }
        };

        for (const component of PRIMEVUE_COMPONENTS) {
          await visit(`primevue/${component}`);
        }

        // Set up PrimeVue with our theme, so that PrimeVue's style modules can generate their CSS.
        // Note: we import everything using resolved paths, so that we use the same instances of PrimeVue's modules as
        //       the ones that PrimeVue's style modules use. As for Vue, we only need it to create an app (which never
        //       gets mounted).

        const importModule = async <T>(specifier: string): Promise<T> => {
          return ((await import(pathToFileURL(await resolve(specifier)).href)) as { default: T }).default;
        };

        const vue = nodeRequire('vue') as typeof import('vue');
        const primeVueConfig = await importModule<import('vue').Plugin>('primevue/config');
        const primeVueAuraTheme = await importModule<object>('@primeuix/themes/aura');

        vue.createApp({}).use(primeVueConfig, {
          theme: {
            preset: primeVueAuraTheme,
            options: {
              darkModeSelector: PRIMEVUE_DARK_MODE_SELECTOR
            }
          }
        });

        // Generate PrimeVue's CSS, starting with its common CSS (i.e. its theme's CSS variables and global styles) and
        // its base CSS, and then the CSS of its components (and directives).

        const allStyleSpecifiers = ['@primevue/core/base/style', ...[...styleSpecifiers].sort()];
        const baseStyle = await importModule<IPrimeVueStyle>('@primevue/core/base/style');
        const css = [styleSheetCss(baseStyle.getCommonThemeStyleSheet())];

        for (const styleSpecifier of allStyleSpecifiers) {
          const style = await importModule<IPrimeVueStyle>(styleSpecifier);

          css.push(styleSheetCss(style.getStyleSheet()), styleSheetCss(style.getThemeStyleSheet()));
        }

        // Export our CSS, as well as PrimeVue's style modules (so that we can tell PrimeVue not to inject their CSS into
        // the host document's head, see src/element.ts).

        return [
          ...allStyleSpecifiers.map((styleSpecifier, index) => `import style${index} from '${styleSpecifier}';`),
          `export const css = ${JSON.stringify(toShadowCssAst(css.filter((cssPart) => cssPart).join('\n')))};`,
          `export const styles = [${allStyleSpecifiers.map((_styleSpecifier, index) => `style${index}`).join(', ')}];`
        ].join('\n');
      })();

      return virtualModule;
    }
  };
};
