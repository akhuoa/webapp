import * as vue from 'vue';

import * as common from './common';
import * as dependencies from './dependencies';
import { electronApi } from './electronApi';
import { toShadowCss } from './shadowCss';

import * as locApi from '../libopencor/locApi';
import type { MainModule as IWasmLocApi } from '@opencor/libopencor-types';

type WasmFactory = (options?: unknown) => Promise<IWasmLocApi>;

// Our different external dependencies.

type ExternalDependency = {
  name: string;
  url: string;
  set: (module: dependencies.Module) => void;
  cssUrl?: string;
};

const externalDependencies: ExternalDependency[] = [
  {
    name: 'jsonschema',
    url: 'https://cdn.jsdelivr.net/npm/jsonschema@1.5.0/+esm',
    set: (m) => dependencies.setJsonSchema(m)
  },
  {
    name: 'JSZip',
    url: 'https://cdn.jsdelivr.net/npm/jszip@3.10.2/+esm',
    set: (m) => dependencies.setJsZip(m)
  },
  {
    name: 'Math.js',
    url: 'https://cdn.jsdelivr.net/npm/mathjs@15.2.0/+esm',
    set: (m) => dependencies.setMathJs(m)
  },
  {
    // Note: the version of uPlot must be the same as the one of our uplot devDependency (which we use for its types)
    //       in both package.json files, hence we pin the latter (so that bun run dependencies:update doesn't update
    //       it on its own).

    name: 'uPlot',
    url: 'https://cdn.jsdelivr.net/npm/uplot@1.6.32/+esm',
    set: (m) => dependencies.setUPlot(m),
    cssUrl: 'https://cdn.jsdelivr.net/npm/uplot@1.6.32/dist/uPlot.min.css'
  }
];

// Some variables to keep track of the initialisation progress.
// Note: the 2 initial steps are to import libOpenCOR's WASM and to instantiate it. We then have one or two steps per
//       external dependency, depending on whether it has an associated CSS file or not. Finally, we have one step to
//       initialise xxHash.

const crtNbOfSteps = vue.ref<number>(0);
const totalNbOfSteps =
  (electronApi ? 0 : 2) +
  externalDependencies.reduce((res, dependency) => res + (dependency.url ? 1 : 0) + (dependency.cssUrl ? 1 : 0), 0) +
  1;

// The base URL for libOpenCOR's files.

const libOpenCORWasmBaseUrl = `https://opencor.ws/libopencor/downloads/wasm/${__LIBOPENCOR_VERSION__}`;

// A helper function to retry an asynchronous operation (e.g., importing an external dependency from a CDN) a few times,
// with an increasing delay, before giving up. This way, a transient network issue doesn't prevent OpenCOR from being
// initialised (and therefore require the user to reload the page).

const NB_OF_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

const withRetries = async <T>(name: string, operation: (attempt: number) => Promise<T>): Promise<T> => {
  for (let attempt = 1; ; ++attempt) {
    try {
      return await operation(attempt);
    } catch (error: unknown) {
      if (attempt >= NB_OF_ATTEMPTS) {
        throw error;
      }

      console.warn(
        `OpenCOR: failed to load ${name} (attempt ${attempt} of ${NB_OF_ATTEMPTS}), retrying:`,
        common.formatError(error)
      );

      await common.sleep(attempt * RETRY_DELAY);
    }
  }
};

// A helper function to return the URL to use for the given attempt at loading a resource.
// Note #1: browsers remember that a module failed to be imported from a given URL and will fail to import it again from
//          that same URL without even trying. So, from our second attempt onwards, we add a query string to the URL,
//          which is ignored when serving static files (e.g., by https://opencor.ws), so that our browser considers it
//          to be a different URL. Note that this doesn't apply to blob URLs, which wouldn't be valid anymore with a
//          query string (and which don't involve the network anyway).
// Note #2: a module from jsDelivr may import other modules from jsDelivr (e.g., Math.js imports typed-function, using
//          /npm/typed-function@x.y.z/+esm), and if one of them fails to be imported, then a query string won't help
//          since it only applies to the module itself. So, from our second attempt onwards, we instead use an
//          alternative jsDelivr host (each served by a different CDN provider), which the imported modules'
//          (root-relative) URLs resolve against, so that our browser considers all of them to be different URLs.

const JSDELIVR_HOST = 'cdn.jsdelivr.net';
const JSDELIVR_ALTERNATIVE_HOSTS = ['fastly.jsdelivr.net', 'gcore.jsdelivr.net'];
// Note: these hosts must be allowed by our Content Security Policy (see index.html).

const attemptUrl = (url: string, attempt: number): string => {
  if (attempt === 1 || url.startsWith('blob:')) {
    return url;
  }

  const jsDelivrAlternativeHost = JSDELIVR_ALTERNATIVE_HOSTS[attempt - 2];

  if (jsDelivrAlternativeHost && url.startsWith(`https://${JSDELIVR_HOST}/`)) {
    return `https://${jsDelivrAlternativeHost}/${url.slice(`https://${JSDELIVR_HOST}/`.length)}`;
  }

  return `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}`;
};

// Import libOpenCOR's glue (i.e. its JavaScript loader), retrying if needed.
// Note: we don't retry importing it from a blob URL since our browser would fail to import it again without even trying
//       (see attemptUrl()).

const importLibOpenCOR = async (libOpenCORJSUrl: string): Promise<WasmFactory> => {
  const importGlue = async (attempt: number): Promise<WasmFactory> =>
    (await import(/* @vite-ignore */ attemptUrl(libOpenCORJSUrl, attempt))).default as WasmFactory;
  const res = libOpenCORJSUrl.startsWith('blob:') ? await importGlue(1) : await withRetries('libOpenCOR', importGlue);

  ++crtNbOfSteps.value;

  return res;
};

// Instantiate libOpenCOR (which fetches its WASM), retrying if needed.

const instantiateLibOpenCOR = async (libOpenCOR: WasmFactory): Promise<void> => {
  locApi.setWasmLocApi(
    await withRetries('libOpenCOR', () =>
      libOpenCOR({
        locateFile: (path: string) => {
          // Note: the only file that is loaded by libOpenCOR is its threaded WASM, hence fetching it directly from
          //       https://opencor.ws.

          return `${libOpenCORWasmBaseUrl}/${path}`;
        }
      })
    )
  );

  ++crtNbOfSteps.value;
};

// Retrieve the version of libOpenCOR that is to be used. Two options:
//  - OpenCOR: libOpenCOR can be accessed using window.locApi, which references our C++ API.
//  - OpenCOR's Web app: libOpenCOR can be accessed using our WebAssembly module.

export const initialiseLocApi = async (): Promise<void> => {
  // @ts-expect-error (window.locApi may or may not be defined which is why we test it)
  if (window.locApi) {
    // We are running OpenCOR, so libOpenCOR can be accessed using window.locApi.

    // @ts-expect-error (window.locApi is defined)
    locApi.setCppLocApi(window.locApi);

    return;
  }

  // We are running OpenCOR's Web app, so we must import libOpenCOR's WebAssembly module and instantiate it.

  try {
    await instantiateLibOpenCOR(await importLibOpenCORGlue());
  } catch (error: unknown) {
    console.error('OpenCOR: failed to load libOpenCOR:', common.formatError(error));

    throw error;
  }
};

// Import libOpenCOR's glue from wherever it is served.
// Note: libOpenCOR's glue can be served from various places, depending on the host application:
//        - OpenCOR's Web app serves it from a same-origin URL (from its public folder in development and from its own
//          Web root in production). This is required by its Content Security Policy which only allows scripts and
//          workers from 'self'.
//        - Other host applications (e.g., a third-party app using @opencor/opencor as an npm package) don't serve it at
//          all, in which case we import it from https://opencor.ws. To make the worker same-origin (cross-origin
//          workers are not always allowed, e.g., under COEP or in restricted embedders), we fetch the glue's source,
//          patch its worker-script URL so that it points to a same-origin blob URL, and import the patched source from
//          that blob URL.
//       We therefore first try to import the glue from a same-origin URL, and only fall back on importing it from
//       https://opencor.ws if the host application doesn't serve it (or we couldn't import it from there).

const importLibOpenCORGlue = async (): Promise<WasmFactory> => {
  // The relative URL, with respect to the host application, from which the glue might be served. It matches both
  // OpenCOR's Web app in production (https://opencor.ws serves libOpenCOR from /libopencor/downloads/wasm/...) and a
  // copy of libOpenCOR's files at the root of the host application (e.g., in OpenCOR's Web app's public folder, which
  // mirrors the same path).
  // Note: document.baseURI is used rather than window.location.href, since the former doesn't change with client-side
  //       routing.

  const url = new URL(`libopencor/downloads/wasm/${__LIBOPENCOR_VERSION__}`, document.baseURI).href;

  // Check whether the glue is served from this URL, retrying if we cannot tell (e.g., because of a network error or a
  // temporary server error).
  // Note: we use a HEAD request to check that the glue is served from this URL before actually importing it. We only
  //       consider that the host application doesn't serve it when this is clear: a 405 (Method Not Allowed) response
  //       means that the glue is served but HEAD requests are not supported, so we try to import it anyway, and the
  //       content-type check is only meant to detect an HTML or XHTML fallback page (some host applications return one
  //       for any URL), since the content-type of a statically served JavaScript file is not always reported as such.

  let sameOriginError: unknown = null;
  let glueIsServed = false;

  try {
    glueIsServed = await withRetries('libOpenCOR', async () => {
      const response = await fetch(`${url}/libopencor.js`, { method: 'HEAD' });

      if (response.status === 408 || response.status === 429 || response.status >= 500) {
        throw new Error(
          `Failed to check whether libOpenCOR's glue is served from ${url} (${response.status}: ${response.statusText}).`
        );
      }

      const contentType = response.headers.get('content-type') ?? '';

      return (
        response.status === 405 ||
        (response.ok && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml'))
      );
    });
  } catch (error: unknown) {
    // We still cannot tell whether the glue is served from this URL, so try to import it from https://opencor.ws
    // instead, but keep track of the error in case that fails too.

    sameOriginError = error;
  }

  // Import the glue from this URL, if it is served from there.

  if (glueIsServed) {
    try {
      return await importLibOpenCOR(`${url}/libopencor.js`);
    } catch (error: unknown) {
      // We couldn't import the glue from this URL, so try to import it from https://opencor.ws instead, but keep track
      // of the error in case that fails too.

      sameOriginError = error;
    }
  }

  // Import the glue from https://opencor.ws.
  // Note: if this fails and something went wrong with this URL, then we report both errors. Indeed, the error with this
  //       URL is likely to be the actual cause (e.g., OpenCOR's Web app serves the glue, but its Content Security
  //       Policy doesn't allow importing the glue from a blob URL, see importLibOpenCORGlueFromOpencorWs()).

  try {
    return await importLibOpenCORGlueFromOpencorWs();
  } catch (error: unknown) {
    if (sameOriginError === null) {
      throw error;
    }

    throw new Error(
      `libOpenCOR's glue could not be imported from ${url} (${common.formatError(sameOriginError)}) nor from ${libOpenCORWasmBaseUrl} (${common.formatError(error)}).`,
      { cause: sameOriginError }
    );
  }
};

// Import libOpenCOR's glue from https://opencor.ws, for a host application that doesn't serve it itself (see
// importLibOpenCORGlue()).
// Note: to make its pthread workers same-origin, we fetch the glue's source and import it from a same-origin blob URL.
//       Indeed, on the Web, the glue spawns each of its pthread workers from a blob that imports the glue's own URL
//       (i.e. import.meta.url), so that the workers import the glue from our same-origin blob URL. This also means that
//       the blob URL must remain valid since libOpenCOR spawns its pthread workers lazily (on the first simulation run,
//       and again whenever no worker is available), so revoking it would prevent the workers from being spawned.

const importLibOpenCORGlueFromOpencorWs = async (): Promise<WasmFactory> => {
  const libOpenCORSource = await withRetries('libOpenCOR', async (attempt) => {
    const response = await fetch(attemptUrl(`${libOpenCORWasmBaseUrl}/libopencor.js`, attempt));

    if (!response.ok) {
      throw new Error(
        `Failed to load libOpenCOR's glue from ${libOpenCORWasmBaseUrl} (${response.status}: ${response.statusText}).`
      );
    }

    return response.text();
  });

  const libOpenCORUrl = URL.createObjectURL(new Blob([libOpenCORSource], { type: 'text/javascript' }));

  try {
    return await importLibOpenCOR(libOpenCORUrl);
  } catch (error: unknown) {
    // The glue couldn't be imported, so its blob URL is no longer needed and can be revoked.

    URL.revokeObjectURL(libOpenCORUrl);

    throw error;
  }
};

// A method to create a lazy initialiser, which imports an external dependency and optionally its CSS.

const injectedCss = new Set<string>();

// The CSS of our external dependencies.
// Note: we don't inject that CSS into the host document's head since it would then leak into a host application (and
//       wouldn't apply within our shadow root anyway). Instead, each instance of OpenCOR injects it into its shadow root
//       (see shadowStyles.ts).

export const dependenciesCss = vue.shallowRef<string[]>([]);

const createLazyInitialiser = (
  name: string,
  url: string,
  set: (module: dependencies.Module) => void,
  cssUrl?: string
) => {
  return async (): Promise<void> => {
    try {
      // Import the external dependency (retrying if needed) and set it.

      const module = await withRetries(name, (attempt) => import(/* @vite-ignore */ attemptUrl(url, attempt)));

      set((module as dependencies.Module).default ?? module);

      ++crtNbOfSteps.value;

      // Fetch any CSS for the module and keep track of it (see dependenciesCss) if we haven't already done so.

      if (cssUrl) {
        if (!injectedCss.has(cssUrl)) {
          // Note: we report a failure to load the CSS as such since, unlike a failure to import a module, its error
          //       (e.g., "Failed to fetch") doesn't otherwise tell what failed.

          let cssText: string;

          try {
            cssText = await withRetries(`${name}'s stylesheet`, async (attempt) => {
              const response = await fetch(/* @vite-ignore */ attemptUrl(cssUrl, attempt), { mode: 'cors' });

              if (!response.ok) {
                throw new Error(`${response.status}: ${response.statusText}`);
              }

              return response.text();
            });
          } catch (error: unknown) {
            throw new Error(`Failed to load ${name}'s stylesheet from ${cssUrl} (${common.formatError(error)}).`, {
              cause: error
            });
          }

          dependenciesCss.value = [...dependenciesCss.value, toShadowCss(cssText)];

          injectedCss.add(cssUrl);
        }

        ++crtNbOfSteps.value;
      }
    } catch (error: unknown) {
      console.error(`OpenCOR: failed to import ${name ?? url}:`, common.formatError(error));

      throw error;
    }
  };
};

// A method to handle any error that occurs during initialisation.

const initialisationError = (error: unknown): void => {
  if (!issues.value.length) {
    issues.value.push({
      type: locApi.EIssueType.INFORMATION,
      description: 'An error occurred while initialising OpenCOR. Please check your setup and reload the page.'
    });
  }

  issues.value.splice(Math.max(0, issues.value.length - 1), 0, {
    type: locApi.EIssueType.ERROR,
    description: common.formatMessage(common.formatError(error))
  });

  failed.value = true;
};

// Initialise libOpenCOR, our external dependencies, and xxHash.

initialiseLocApi().catch((error: unknown) => {
  initialisationError(error);
});

for (const externalDependency of externalDependencies) {
  createLazyInitialiser(
    externalDependency.name,
    externalDependency.url,
    externalDependency.set,
    externalDependency.cssUrl
  )().catch((error: unknown) => {
    initialisationError(error);
  });
}

dependencies
  .initialiseXxhash()
  .then(() => {
    ++crtNbOfSteps.value;
  })
  .catch((error: unknown) => {
    initialisationError(error);
  });

// Let people know whether initialisation is done and how it's progressing.

export const done = vue.computed<boolean>(() => {
  return progress.value >= 100;
});
export const failed = vue.ref<boolean>(false);
export const issues = vue.ref<locApi.IIssue[]>([]);
export const progress = vue.computed<number>(() => {
  return Math.round((100 * crtNbOfSteps.value) / totalNbOfSteps);
});
