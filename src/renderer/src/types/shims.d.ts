// TypeScript shims for Vite-style imports.
// Note: `vue-tsc` needs to know how to treat `.vue` files and Vite-style asset imports.

/// <reference types="vite/client" />

declare const __LIBOPENCOR_VERSION__: string;
declare const __OPENCOR_VERSION__: string;

declare module '*.vue' {
  const component: import('vue').DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;

  export default component;
}

declare module '*.css';

declare module '*?asset' {
  const source: string;

  export default source;
}

declare module '*.woff2?inline' {
  const source: string;

  export default source;
}

declare module '*.css?inline' {
  const source: string;

  export default source;
}

declare module 'virtual:opencor-primevue-css' {
  export const css: string;
  export const styles: { css?: unknown }[];
}
