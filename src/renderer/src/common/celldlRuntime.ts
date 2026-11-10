import * as vue from 'vue';

import * as common from './common';
import { addDependencyCss, attemptUrl, withRetries } from './initialisation';

// Our CellDL runtime (see src/celldl/runtime.ts).

export type ICellDLRuntime = typeof import('../celldl/runtime');

// The URL from which our CellDL runtime is served by https://opencor.ws.

const opencorWsCellDLRuntimeUrl = `https://opencor.ws/app/${__CELLDL_RUNTIME_PATH__}/celldl.js`;

// Check whether our CellDL runtime is served from the given URL.
// Note: as for libOpenCOR's glue (see importLibOpenCORGlue()), a 405 (Method Not Allowed) response means that our
//       CellDL runtime is served but HEAD requests are not supported, and the content-type check is only meant to
//       detect an HTML or XHTML fallback page.

const isServed = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const contentType = response.headers.get('content-type') ?? '';

    return (
      response.status === 405 ||
      (response.ok && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml'))
    );
  } catch {
    return false;
  }
};

// Import our CellDL runtime.
// Note #1: OpenCOR includes our CellDL runtime, whereas OpenCOR's Web app and our library load a separate build of it
//          at runtime (see vite.celldl.config.ts). OpenCOR's Web app serves it from a same-origin URL (as for
//          libOpenCOR's glue, this is required by its Content Security Policy), whereas our library imports it from
//          https://opencor.ws, unless the host application serves it itself.
// Note #2: our CellDL runtime must use our copy of Vue, which we make available to it before importing it (see
//          sharedVuePlugin() in vite.celldl.config.ts).
// Note #3: our CellDL runtime imports its chunks and assets relative to its own URL, so, unlike libOpenCOR's glue, it
//          cannot be imported from a blob URL. This also means that retrying only helps if our CellDL runtime itself
//          fails to be imported since its chunks keep the same URL from one attempt to another (see attemptUrl()).

const importCellDLRuntime = async (): Promise<ICellDLRuntime> => {
  if (__CELLDL_RUNTIME_BUNDLED__) {
    return import('../celldl/runtime');
  }

  (globalThis as Record<symbol, unknown>)[Symbol.for('opencor.celldlRuntime.vue')] = vue;

  const sameOriginUrl = new URL(`${__CELLDL_RUNTIME_PATH__}/celldl.js`, document.baseURI).href;
  const url = (await isServed(sameOriginUrl)) ? sameOriginUrl : opencorWsCellDLRuntimeUrl;

  return withRetries(
    'CellDL Editor',
    (attempt) => import(/* @vite-ignore */ attemptUrl(url, attempt)) as Promise<ICellDLRuntime>
  );
};

// Load our CellDL runtime, if needed, and make CellDL Editor's stylesheet available to our shadow root(s).
// Note: if our CellDL runtime cannot be loaded (e.g., because of a network issue), then we allow for another attempt.

let cellDLRuntime: Promise<ICellDLRuntime> | null = null;

export const loadCellDLRuntime = (): Promise<ICellDLRuntime> => {
  cellDLRuntime ??= importCellDLRuntime()
    .then((runtime) => {
      // Note: we don't inject CellDL Editor's stylesheet into the host document's head since it would then leak into a
      //       host application (and wouldn't apply within our shadow root anyway). Instead, each instance of OpenCOR
      //       injects it into its shadow root (see shadowStyles.ts). That stylesheet is made suitable for our shadow root
      //       at build time (see shadowCssPlugin() in scripts/shadow.css.plugin.ts).

      addDependencyCss(runtime.celldlEditorCss);

      return runtime;
    })
    .catch((error: unknown) => {
      cellDLRuntime = null;

      throw new Error(`CellDL Editor could not be loaded (${common.formatError(error)}).`, { cause: error });
    });

  return cellDLRuntime;
};
