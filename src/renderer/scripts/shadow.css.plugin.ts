import * as postcss from 'postcss';
import type { Plugin } from 'vite';
import type { CompilerOptions } from 'vue/compiler-sfc';

import { toShadowSelector, toShadowValue } from '../src/common/shadowCss.ts';

// Make the given CSS suitable for our shadow root (see src/common/shadowCss.ts), processing its selectors and its
// declaration values separately.
// Note: Tailwind CSS registers its custom properties (e.g., --tw-shadow) using @property rules, so that they have an
//       initial value, but @property rules don't apply within a shadow root. For browsers that don't support @property
//       rules, Tailwind CSS also sets those initial values in a `properties` layer, within an @supports rule that only
//       matches those browsers. So, we unwrap that @supports rule, so that those initial values are always set (or
//       utilities such as `shadow-*` wouldn't work).

export const toShadowCssAst = (css: string): string => {
  const root = postcss.parse(css);

  root.walkAtRules('layer', (layer) => {
    if (layer.params.trim() === 'properties') {
      layer.each((node) => {
        if (node.type === 'atrule' && node.name === 'supports' && node.nodes) {
          node.replaceWith(...node.nodes);
        }
      });
    }
  });

  root.walkRules((rule) => {
    rule.selector = toShadowSelector(rule.selector);
  });

  root.walkDecls((decl) => {
    decl.value = toShadowValue(decl.value);
  });

  return root.toString();
};

// A Vite plugin to make the CSS of our OpenCOR component suitable for its shadow root (see toShadowCssAst()).
// Note #1: this plugin must not be enforced as 'pre' or 'post'. Indeed, it must run after Vite has processed our CSS
//          (i.e. after Tailwind CSS has generated our utilities and after @import rules have been inlined), but before
//          Vite turns our CSS into a JavaScript module (e.g., a string for `?inline` CSS and the styles of our custom
//          element's components).
// Note #2: we only process the CSS of our OpenCOR component and that of CellDL Editor (see src/celldl/runtime.ts), i.e.
//          not the CSS of our demo host applications (e.g., src/App.vue), which doesn't end up in our shadow root.

const OPENCOR_CSS_REGEX =
  /[\\/]src[\\/]renderer[\\/]src[\\/](?:assets|components)[\\/]|[\\/]@celldl[\\/]editor[\\/]dist[\\/]/;
const CSS_REGEX = /\.css(?:$|\?)|[?&]lang\.css(?:$|&)/;

// The components that are to be compiled as custom element components, i.e. those of our OpenCOR component (but not
// those of our demo host applications, e.g., src/App.vue), so that Vue injects their styles into our shadow root rather
// than into the host document's head (see the customElement option of Vue's Vite plugin).

export const OPENCOR_CUSTOM_ELEMENT_COMPONENTS = /[\\/]src[\\/]renderer[\\/]src[\\/]components[\\/].+\.vue$/;

export const shadowCssPlugin = (): Plugin => {
  return {
    name: 'opencor-shadow-css',
    transform(code, id) {
      if (!OPENCOR_CSS_REGEX.test(id) || !CSS_REGEX.test(id)) {
        return null;
      }

      return {
        code: toShadowCssAst(code),
        map: null
      };
    }
  };
};

// A Vue template compiler transform to make the static style attributes of our OpenCOR component's templates suitable
// for its shadow root (see toShadowValue()), e.g., `style="width: 39rem;"` becomes `style="width: 624px;"`.
// Note: dynamic styles (e.g., `:style="..."`) are not processed, so they should not use `rem` units.

type NodeTransform = NonNullable<CompilerOptions['nodeTransforms']>[number];

const ELEMENT_NODE = 1;
const ATTRIBUTE_NODE = 6;

export const shadowStyleNodeTransform: NodeTransform = (node, context) => {
  if (node.type !== ELEMENT_NODE || !OPENCOR_CUSTOM_ELEMENT_COMPONENTS.test(context.filename)) {
    return;
  }

  for (const prop of node.props) {
    if (prop.type === ATTRIBUTE_NODE && prop.name === 'style' && prop.value) {
      prop.value.content = toShadowValue(prop.value.content);
    }
  }
};
