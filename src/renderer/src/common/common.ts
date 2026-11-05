import type { IOpenCORSimulationDataValue, OpenCORSimulationData, OpenCORTheme } from '../../index';

import * as dependencies from './dependencies';
import { electronApi } from './electronApi';

// Some interfaces.

export interface ISettingsGeneral {
  checkForUpdatesAtStartup: boolean;
  theme: OpenCORTheme;
}

export interface ISettings {
  general: ISettingsGeneral;
}

// Some methods to determine the operating system, whether the application is running on a mobile device, etc.
// Note: the order of the checks in osName() is important. For instance, we need to check for "iPhone" before checking
//       for "Mac" since the user agent of iPhones contains both "iPhone" and "Mac".

let _osName: string | null = null;

const osName = (): string => {
  if (_osName) {
    return _osName;
  }

  try {
    const userAgent = window.navigator.userAgent;

    if (/Android/i.test(userAgent)) {
      _osName = 'Android';
    } else if (/iPhone|iPad|iPod/i.test(userAgent)) {
      _osName = 'iOS';
    } else if (/Windows/i.test(userAgent)) {
      _osName = 'Windows';
    } else if (/Linux/i.test(userAgent)) {
      _osName = 'Linux';
    } else if (/Mac/i.test(userAgent)) {
      _osName = 'macOS';
    } else {
      _osName = 'Unknown';
    }
  } catch {
    _osName = 'Unknown';
  }

  return _osName;
};

export const isWindows = (): boolean => {
  return osName() === 'Windows';
};

export const isLinux = (): boolean => {
  return osName() === 'Linux';
};

export const isMacOs = (): boolean => {
  return osName() === 'macOS';
};

export const isDesktop = (): boolean => {
  const currentOSName = osName();

  return currentOSName === 'Windows' || currentOSName === 'Linux' || currentOSName === 'macOS';
};

// A method to determine whether the Ctrl or Cmd key is pressed, depending on the operating system.

export const isCtrlOrCmd = (event: KeyboardEvent): boolean => {
  return isMacOs() ? event.metaKey : event.ctrlKey;
};

// A method to enable/disable the main menu.

export const enableDisableMainMenu = (enable: boolean): void => {
  electronApi?.enableDisableMainMenu(enable);
};

// Some prefixes for the (made-up) name of a file opened using a data URL, and a method to determine whether a file name
// is such a name.
// Note #1: a file opened using a data URL only exists in memory, so it cannot be reopened (e.g., the next time OpenCOR
//          is started) and must therefore not be added to our recent files either.
// Note #2: a COMBINE archive is named "OMEX #<n>" while a CellML file (from a ZIP-CellML data URL) is named
//          "CellML #<n>/<file name>" where <file name> is the name of the CellML file, so that it is still shown under
//          its own name (see common.fileName()).

export const OMEX_PREFIX = 'OMEX #';
export const CELLML_PREFIX = 'CellML #';

// The number to use in the name of the next file opened using a data URL (i.e. <n> above).
// Note: libOpenCOR's file manager is shared by all the instances of OpenCOR (e.g., when OpenCOR is embedded more than
//       once in a Web page), so those numbers must be shared by all of them too. Otherwise, two instances could end up
//       with a file of the same name, in which case one instance would overwrite the file of the other instance and,
//       once unmounted, unmanage it.

let omexDataUrlCounter = 0;
let cellmlDataUrlCounter = 0;

export const nextOmexDataUrlNumber = (): number => {
  return ++omexDataUrlCounter;
};

export const nextCellmlDataUrlNumber = (): number => {
  return ++cellmlDataUrlCounter;
};

export const isDataUrlFileName = (fileName: string): boolean => {
  return fileName.startsWith(OMEX_PREFIX) || fileName.startsWith(CELLML_PREFIX);
};

// A method to determine whether the given value is an object (and not an array).

export const isObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

// A method to determine whether a URL is an HTTP or HTTPS URL.

export const isUrl = (filePath: string): boolean => {
  return filePath.startsWith('http://') || filePath.startsWith('https://');
};

// A method to get the CORS proxy URL for a URL.
// Note: the URL must be encoded since it is passed as a query parameter, which our CORS proxy decodes. Otherwise, the
//       URL would get truncated at its first "&" (e.g., https://example.com/export?format=csv&gid=123 would become
//       https://example.com/export?format=csv), lose its fragment, and have its "+" and percent-encoded characters
//       decoded (e.g., "%2F" would become "/").

export const corsProxyUrl = (url: string): string => {
  return `https://cors-proxy.opencor.workers.dev/?url=${encodeURIComponent(url)}`;
};

// A method to fetch a URL through our CORS proxy or, if that fails, directly.
// Note #1: our CORS proxy may not be reachable, not allow the content of the URL (HTTP 403 error), not find the URL
//          (HTTP 404 error), not be able to fetch the URL (HTTP 502 error; e.g., the URL is only reachable from the
//          user's network), be rate limited (HTTP 429 error), be unavailable (HTTP 5xx error), or get some other error
//          from the server of the URL (e.g., because it blocks requests from our CORS proxy), in which case fetching
//          the URL directly may still work. So, we fetch the URL directly whenever our CORS proxy doesn't give us an OK
//          response.
// Note #2: if fetching the URL directly also fails, then it is most likely because of CORS, about which a browser tells
//          us next to nothing (e.g., "Failed to fetch"), so we report why our CORS proxy failed instead.
// Note #3: we read the body of our CORS proxy's response before returning it, so that we can also fetch the URL
//          directly if reading it fails (e.g., if our CORS proxy aborts it because the content turns out to be too
//          large). This doesn't cost anything since our callers need the whole body anyway.

export const fetchThroughCorsProxy = async (url: string): Promise<Response> => {
  let corsProxyIssue: string;

  try {
    const response = await fetch(corsProxyUrl(url));

    if (response.ok) {
      const body = await response.arrayBuffer();

      // Note: a response with some statuses (e.g., 204) cannot have a body, not even an empty one.

      return new Response(body.byteLength ? body : null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }

    corsProxyIssue =
      (await response.text().catch(() => '')) || `The server responded with a status of ${response.status}.`;
  } catch (error: unknown) {
    corsProxyIssue = formatError(error);
  }

  try {
    const response = await fetch(url);

    if (response.ok) {
      return response;
    }
  } catch {
    // Fetching the URL directly failed, so we report why our CORS proxy failed (see Note #2).
  }

  throw new Error(corsProxyIssue);
};

// A method to compute the XXH64 value of some data.

export const xxh64 = (data: string | Uint8Array): string => {
  if (typeof data === 'string') {
    return dependencies._xxhash.h64(data).toString(16).padStart(16, '0');
  }

  return dependencies._xxhash.h64Raw(data).toString(16).padStart(16, '0');
};

// A method to format a number of milliseconds into a string.

export const formatTime = (time: number): string => {
  const ms = Math.floor(time % 1000);
  const s = Math.floor((time / 1000) % 60);
  const m = Math.floor((time / (1000 * 60)) % 60);
  const h = Math.floor((time / (1000 * 60 * 60)) % 24);
  const d = Math.floor((time / (1000 * 60 * 60 * 24)) % 24);
  let res = '';

  if (d) {
    res = `${d}d`;
  }

  if (h || ((m || s || ms) && res)) {
    res += `${res ? ' ' : ''}${h}h`;
  }

  if (m || ((s || ms) && res)) {
    res += `${res ? ' ' : ''}${m}m`;
  }

  if (s || (ms && res)) {
    res += `${res ? ' ' : ''}${s}s`;
  }

  if (ms || !res) {
    res += `${res ? ' ' : ''}${ms}ms`;
  }

  return res;
};

// A method to format an error into a string.

export const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

// A method to format a message, i.e. make sure that it starts with a capital letter and ends with a period, or not.

export const formatMessage = (message: string, selfContained: boolean = true): string => {
  message = selfContained
    ? message.charAt(0).toUpperCase() + message.slice(1)
    : message.charAt(0).toLowerCase() + message.slice(1);

  return message.endsWith('...')
    ? message
    : message.endsWith('.')
      ? selfContained
        ? message
        : message.slice(0, -1)
      : selfContained
        ? `${message}.`
        : message;
};

// A method to determine whether a number is divisible by another one.

export const isDivisible = (a: number, b: number): boolean => {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) {
    return false;
  }

  const quotient = a / b;
  const roundedQuotient = Math.round(quotient);

  return Math.abs(quotient - roundedQuotient) <= Number.EPSILON * Math.max(1, Math.abs(roundedQuotient));
};

// A method to trigger a browser download for a file.

const DOWNLOAD_OBJECT_URL_LIFETIME = 60000; // 60 seconds.

export const downloadFile = (filename: string, content: string | Blob, type: string): void => {
  const link = document.createElement('a');
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);

  // Revoke our object URL, but only once the download has started.
  // Note: some browsers start the download asynchronously, so revoking our object URL straight away may cancel it. In
  //       Safari, this may even be once the user has allowed downloads from our site (it asks the first time a site
  //       downloads a file), so we give the user plenty of time to do so (like FileSaver.js does).

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, DOWNLOAD_OBJECT_URL_LIFETIME);
};

// A method to get the base file name from a file name, i.e. the file name without its extension.

export const baseFileName = (fileName: string): string => {
  return fileName.replace(/\.[^/.]+$/, '');
};

// A method to get the file name from a file path.
// Note: the file path should be a canonical path (see locApi.File.canonicalPath()), i.e. a path that libOpenCOR has
//       already decoded, if needed (e.g., "https://example.com/my%20model.cellml" becomes
//       "https://example.com/my model.cellml" while "/path/to/my%20model.cellml" is a valid local file name).

export const fileName = (filePath: string): string => {
  return filePath.split(/(\\|\/)/g).pop() || '';
};

// A method to sleep for a number of milliseconds.

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

// A method to wait for the next animation frame.

export const waitForNextAnimationFrame = (): Promise<number> => {
  return new Promise((resolve: FrameRequestCallback) => {
    requestAnimationFrame(resolve);
  });
};

// Some constants related to simulation data values.

export const EMPTY_FLOAT64_ARRAY = Object.freeze(new Float64Array(0));
export const UNDEFINED_SIMULATION_DATA_VALUE = Object.freeze({
  data: EMPTY_FLOAT64_ARRAY,
  unit: ''
}) as Readonly<IOpenCORSimulationDataValue>;

// A method to get an object with an empty simulation data values for a list of model parameters.

export const emptySimulationData = (modelParameters: string[]): OpenCORSimulationData => {
  const res: OpenCORSimulationData = {};

  for (const modelParameter of modelParameters) {
    res[modelParameter] = { ...UNDEFINED_SIMULATION_DATA_VALUE };
  }

  return res;
};
