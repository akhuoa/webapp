import * as vue from 'vue';

import { css as primeVueCss } from 'virtual:opencor-primevue-css';

import appCss from '../assets/app.css?inline';

import { dependenciesCss } from './initialisation';

// A composable to inject our global styles into the given shadow root, i.e. our own global styles (incl. Tailwind CSS),
// PrimeVue's styles, and the styles of our external dependencies (e.g., uPlot).
// Note #1: the styles of our components are injected by Vue itself (since they are compiled as custom element styles,
//          see the customElement option of our Vue plugin in our Vite configurations).
// Note #2: we want PrimeVue's styles and those of our external dependencies to come after our own styles and those of
//          our components, like when they were injected into the host document's head, so that they keep the same
//          precedence. Vue injects the styles of our components before the first non-style node of our shadow root,
//          i.e. before our root element, so we inject our global styles at the beginning of our shadow root and the
//          other styles at its end, once our root element has been mounted.

const createStyleElement = (css: string, name: string): HTMLStyleElement => {
  const res = document.createElement('style');

  res.setAttribute('data-opencor-style', name);
  res.textContent = css;

  return res;
};

export const useShadowStyles = (shadowRoot: ShadowRoot | null): void => {
  if (!shadowRoot) {
    return;
  }

  shadowRoot.prepend(createStyleElement(appCss, 'app'));

  vue.onMounted(() => {
    shadowRoot.append(createStyleElement(primeVueCss, 'primevue'));

    let nbOfInjectedDependenciesCss = 0;

    vue.watch(
      dependenciesCss,
      (newDependenciesCss: string[]) => {
        for (const dependencyCss of newDependenciesCss.slice(nbOfInjectedDependenciesCss)) {
          shadowRoot.append(createStyleElement(dependencyCss, 'dependency'));
        }

        nbOfInjectedDependenciesCss = newDependenciesCss.length;
      },
      { immediate: true }
    );
  });
};
