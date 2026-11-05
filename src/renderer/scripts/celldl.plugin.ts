import * as postcss from 'postcss';
import type { Plugin } from 'vite';

// A Vite plugin to scope CellDL Editor's global CSS rules.
// Note: CellDL Editor's stylesheet has some global rules that target PrimeVue's components (e.g.,
//       `.p-checkbox-checked .p-checkbox-icon { color: red !important; }`) or generic class names (e.g., `.error`),
//       which would otherwise affect the rest of OpenCOR (see https://github.com/CellDL/CellDLEditor/issues/9). So, we
//       scope those rules to the elements in which our CellDL Editor can be (see CellDLEditorView.vue and
//       CellDLEditorHostComponent.vue). We leave alone the rules that only target CellDL Editor's own elements (incl.
//       tippy.js' tooltips, which are appended to the document body), its icons (incl. PrimeIcons, which we also use),
//       or its CSS variables, as well as the rules in Tailwind CSS' layers (i.e. Tailwind CSS' variables and standard
//       utility classes, e.g., `.hidden`, which, being layered, lose to any unlayered rule) and in keyframes. Our
//       plugin must be enforced as 'pre', so that it processes CellDL Editor's stylesheet before Vite does.

const CELLDL_EDITOR_CSS = '/@celldl/editor/dist/';
const CELLDL_EDITOR_SCOPE = '.celldl-editor';
const UNSCOPED_SELECTOR =
  /^(:root|\[data-tippy-root\]|\.tippy-|\.tooltip-|\.pi\b|\.pi-|\.ci\b|\.ci-|\.lucide|#celldl-|\.celldl-|#svg-container|#status-)/;

export const scopeCellDLEditorCssPlugin = (): Plugin => {
  return {
    name: 'scope-celldl-editor-css',
    enforce: 'pre',
    transform(code, id) {
      const path = id.split('?')[0]?.replace(/\\/g, '/') ?? '';

      if (!path.includes(CELLDL_EDITOR_CSS) || !path.endsWith('.css')) {
        return null;
      }

      const root = postcss.parse(code);

      root.walkRules((rule) => {
        for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
          if (parent.type === 'atrule' && ['layer', 'keyframes'].includes((parent as postcss.AtRule).name)) {
            return;
          }
        }

        rule.selectors = rule.selectors.map((selector) => {
          return selector.includes('[data-v-') || UNSCOPED_SELECTOR.test(selector)
            ? selector
            : `${CELLDL_EDITOR_SCOPE} ${selector}`;
        });
      });

      return { code: root.toString(), map: null };
    }
  };
};
