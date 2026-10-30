import primeVueConfig from 'primevue/config';
import primeVueConfirmationService from 'primevue/confirmationservice';
import primeVueToastService from 'primevue/toastservice';
import * as vue from 'vue';

import { css as primeVueCss, styles as primeVueStyles } from 'virtual:opencor-primevue-css';

import type { IOpenCORExpose } from '../index';

import './assets/primeicons-assets';
import OpenCORCore from './components/OpenCORCore.vue';

// Our OpenCOR component (see components/OpenCOR.vue) is a wrapper around a custom element, which renders OpenCOR within
// a shadow root, so that a host application's styles don't affect OpenCOR and OpenCOR's styles don't affect a host
// application. A custom element also has its own Vue app, so OpenCOR has its own PrimeVue configuration, i.e. it uses
// its own theme, even if a host application uses PrimeVue with another theme.
// Note: the name of our custom element is an implementation detail (a host application uses our OpenCOR component, not
//       our custom element), so it can be changed here if needed.

export const OPENCOR_ELEMENT_TAG = 'opencor-app';

export interface IOpenCORElement extends HTMLElement, IOpenCORExpose {}

// Tell PrimeVue not to inject its styles into the host document's head.
// Note #1: PrimeVue's styles are generated at build time and injected into our shadow root (see
//          scripts/primevue.css.plugin.ts and src/common/shadowStyles.ts).
// Note #2: PrimeVue injects two kinds of styles: those of its theme and those of its style modules (e.g., the base
//          styles of its components). We disable the former by disabling PrimeVue's theme (see configureApp() below) and
//          the latter by removing the CSS of PrimeVue's style modules, since PrimeVue doesn't inject empty styles.
// Note #3: this only affects our copy of PrimeVue, which is bundled with our OpenCOR component, i.e. not the copy of
//          PrimeVue that a host application may use.

for (const primeVueStyle of primeVueStyles) {
  primeVueStyle.css = undefined;
}

// Let PrimeVue know about the gutter of its overlays (e.g., the gap between a Select and its dropdown).
// Note: PrimeVue looks for a rule that defines a `--*-anchor-gutter` CSS variable in the host document's stylesheets
//       (see absolutePosition() in @primeuix/utils), which don't include those of our shadow root. So, we add such a
//       rule to the host document, using a selector that never matches anything, so that it doesn't affect a host
//       application.

const primeVueAnchorGutter = /--p-anchor-gutter:\s*([^;}]+)/.exec(primeVueCss)?.[1]?.trim();

if (primeVueAnchorGutter && !document.head.querySelector('style[data-opencor-style="primevue-anchor-gutter"]')) {
  const style = document.createElement('style');

  style.setAttribute('data-opencor-style', 'primevue-anchor-gutter');
  style.textContent = `${OPENCOR_ELEMENT_TAG}:not(*) { --p-anchor-gutter: ${primeVueAnchorGutter}; }`;

  document.head.appendChild(style);
}

// In development mode, warn if PrimeVue injects some styles into the host document's head, which means that we use a
// PrimeVue component for which we don't generate any styles (see PRIMEVUE_COMPONENTS in scripts/primevue.css.plugin.ts).

if (import.meta.env.DEV) {
  new MutationObserver((mutations: MutationRecord[]) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLStyleElement && node.hasAttribute('data-primevue-style-id')) {
          console.warn(
            `OpenCOR: PrimeVue injected some styles (${node.getAttribute('data-primevue-style-id')}) into the document's head. Please add the corresponding PrimeVue component to PRIMEVUE_COMPONENTS in scripts/primevue.css.plugin.ts.`
          );
        }
      }
    }
  }).observe(document.head, { childList: true });
}

const OpenCORElement = vue.defineCustomElement(OpenCORCore, {
  shadowRoot: true,
  configureApp: (app: vue.App) => {
    app.use(primeVueConfig as unknown as vue.Plugin, {
      theme: 'none'
    });
    app.use(primeVueConfirmationService as unknown as vue.Plugin);
    app.use(primeVueToastService as unknown as vue.Plugin);
  }
});

export const ensureOpenCORElement = (): void => {
  if (!customElements.get(OPENCOR_ELEMENT_TAG)) {
    customElements.define(OPENCOR_ELEMENT_TAG, OpenCORElement);
  }
};
