import * as vue from 'vue';

// Our current version.
// Note: it is injected at build time (see vite.config.ts, vite.lib.config.ts, and electron.vite.config.ts) rather than
//       imported from our package.json file since the whole of our package.json file would otherwise end up in our
//       bundle.

const currentVersion = __OPENCOR_VERSION__;

// State to track whether an update is available and the latest version.

const updateAvailable = vue.ref(false);
const latestVersion = vue.ref<string>('');

// Check if a new version is available.

interface IVersionInfo {
  version: string;
}

const checkForUpdates = async (): Promise<boolean> => {
  // Get the latest version information from the server and compare it with the current version.

  try {
    // Fetch the version.json file from the server with cache busting (i.e. by adding a timestamp query parameter to the
    // URL so that the browser doesn't serve a cached version).

    const response = await fetch(`./assets/version.json?t=${Date.now()}`);

    if (!response.ok) {
      console.warn(`OpenCOR: failed to fetch the version information (${response.status}: ${response.statusText}).`);

      updateAvailable.value = false;
      latestVersion.value = '';

      return false;
    }

    const versionInfo: IVersionInfo = await response.json();

    latestVersion.value = versionInfo.version;

    // Compare versions.

    const isNewer = isNewerVersion(latestVersion.value, currentVersion);

    updateAvailable.value = isNewer;

    return isNewer;
  } catch (_error: unknown) {
    updateAvailable.value = false;
    latestVersion.value = '';

    return false;
  }
};

// Return whether the first version is newer than the second version.

const isNewerVersion = (versionA: string, versionB: string): boolean => {
  const partsA = versionA.split('.').map(Number);
  const partsB = versionB.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); ++i) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;

    if (partA > partB) {
      return true;
    }

    if (partA < partB) {
      return false;
    }
  }

  return false;
};

// Start periodic version checking (every 5 minutes).

let checkInterval: number | null = null;

const startCheck = (): void => {
  // Check immediately on start.

  checkForUpdates();

  // Then check every 5 minutes.

  if (!checkInterval) {
    checkInterval = window.setInterval(
      () => {
        checkForUpdates();
      },
      5 * 60 * 1000 // Every 5 minutes.
    );
  }
};

// Force reload the Web app.
// Note: there is no standard way to force reload a page (location.reload(true) is non-standard and ignored by modern
//       browsers). So, we first fetch the page with cache: 'reload', which bypasses the HTTP cache and updates it, and
//       then we reload the page. (Our assets have a hash in their file names (see vite.config.ts), so the new version
//       of the page references new assets, which cannot be stale.) We do this within a given amount of time after
//       which we reload the page anyway, so that the user is never left waiting forever.

const FORCE_RELOAD_TIMEOUT = 30 * 1000; // 30 seconds.

let forceReloading = false;

const forceReload = async (): Promise<void> => {
  if (forceReloading) {
    return;
  }

  forceReloading = true;

  // Create an AbortController to abort the fetch request if it takes too long.

  const abortController = new AbortController();
  const timeoutId = window.setTimeout(() => {
    abortController.abort();
  }, FORCE_RELOAD_TIMEOUT);

  try {
    // Refresh the page in the HTTP cache.
    // Note: we need to read the body since the HTTP cache is only updated once the body has been fully received.

    const response = await fetch(window.location.href, { cache: 'reload', signal: abortController.signal });

    await response.blob();
  } catch (_error: unknown) {
    // Ignore any error (including a timeout) and reload the page anyway.
  } finally {
    window.clearTimeout(timeoutId);
  }

  window.location.reload();
};

// Export the version checking functions and state.

export { currentVersion, forceReload, isNewerVersion, latestVersion, startCheck, updateAvailable };
