import electron from 'electron';
import { autoUpdater, type ProgressInfo, type UpdateCheckResult } from 'electron-updater';
import fs from 'node:fs';
import path from 'node:path';

import type { OpenCORTheme } from '../renderer/index';
import { formatError, isDataUrlFileName, type ISettings, isUrl } from '../renderer/src/common/common';
import { FULL_URI_SCHEME, LONG_DELAY } from '../renderer/src/common/constants';
import { appImagePath, isMacOs, isPackaged } from '../renderer/src/common/electron';
/* TODO: enable once our GitHub integration is fully ready.
import { deleteGitHubAccessToken } from '../renderer/src/common/gitHubIntegration';
*/

import icon from './assets/icon.png?asset';
import { ApplicationWindow, backgroundColor } from './ApplicationWindow';
import { electronConf, type IElectronConfState, takeElectronConfBackupFileName } from './index';
import { enableDisableFileCloseAndCloseAllMenuItems, enableDisableMainMenu, updateReopenMenu } from './MainMenu';
import type { SplashScreenWindow } from './SplashScreenWindow';

autoUpdater.autoDownload = false;
autoUpdater.logger = null;

// Determine whether we can check for updates.
// Note: we can only check for updates if OpenCOR is packaged and has some update information, i.e. an app-update.yml
//       file next to its app.asar file, which electron-builder only generates when building a release (e.g., not when
//       building an unpacked version of OpenCOR using electron-builder --dir).

let _canCheckForUpdates: boolean | null = null;

export const canCheckForUpdates = (): boolean => {
  _canCheckForUpdates ??= isPackaged() && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'));

  return _canCheckForUpdates;
};

// Keep track of the state of an update, i.e. whether it is being downloaded, has been downloaded, or is being installed.
// Note: our renderer process may be reloaded while an update is being downloaded or installed (e.g., after it crashed),
//       in which case we must not check for updates (e.g., at startup) since an issue with checking for updates could
//       get forwarded as an issue with installing the update (see below) and the update could be offered (and
//       downloaded) again. Instead, we let our renderer know about the update (see resendUpdateState()).

type UpdateState = 'idle' | 'downloading' | 'downloaded' | 'installing';

let updateState: UpdateState = 'idle';
let updateDownloadPercent = 0;

export const checkForUpdates = (atStartup: boolean): void => {
  // Check for updates, if we can and if requested (i.e. at startup, if the user wants us to, or by the user), and if we
  // are not already dealing with an update.

  if (
    canCheckForUpdates() &&
    (!atStartup || electronConf.get('settings.general.checkForUpdatesAtStartup')) &&
    updateState === 'idle'
  ) {
    autoUpdater
      .checkForUpdates()
      .then((result: UpdateCheckResult | null) => {
        const updateAvailable = result?.isUpdateAvailable ?? false;

        if (updateAvailable) {
          MainWindow.instance?.send('update-available', result?.updateInfo.version);
        } else if (!atStartup) {
          MainWindow.instance?.send('update-not-available');
        }
      })
      .catch((error: unknown) => {
        MainWindow.instance?.send('update-check-error', formatError(error));
      });
  }
};

autoUpdater.on('download-progress', (info: ProgressInfo) => {
  if (updateState === 'downloading') {
    updateDownloadPercent = info.percent;

    MainWindow.instance?.send('update-download-progress', info.percent);
  }
});

// Forward any issue with installing an update.
// Note: on macOS, electron-updater hands a downloaded update over to Squirrel.Mac, which reports any issue (e.g., the
//       update couldn't be staged or its signature is invalid) only through an error event, i.e. after downloadUpdate()
//       has resolved, so our renderer would otherwise wait forever for the update to be installed. Other issues are
//       reported through the promises returned by checkForUpdates() and downloadUpdate() (as well as through an error
//       event), so we only forward error events once an update has been downloaded, to avoid reporting an issue twice.
//       Once forwarded, the installation of the update has failed, so we are done with it (and any subsequent error
//       event, e.g., from checking for updates again, must not be forwarded as an issue with installing an update).

autoUpdater.on('error', (error: Error) => {
  if (updateState === 'downloaded' || updateState === 'installing') {
    updateState = 'idle';

    MainWindow.instance?.send('update-install-error', formatError(error));
  }
});

export const downloadAndInstallUpdate = (): void => {
  updateState = 'downloading';
  updateDownloadPercent = 0;

  autoUpdater
    .downloadUpdate()
    .then(() => {
      updateState = 'downloaded';
      updateDownloadPercent = 100;

      MainWindow.instance?.send('update-downloaded');
    })
    .catch((error: unknown) => {
      updateState = 'idle';

      MainWindow.instance?.send('update-download-error', formatError(error));
    });
};

export const installUpdateAndRestart = (): void => {
  // Install the update and restart OpenCOR.
  // Note: our renderer may ask us to install the update more than once (see resendUpdateState()), but electron-updater
  //       must only be asked once (e.g., on macOS, it would otherwise install the update once Squirrel.Mac has fetched it
  //       as many times as it was asked to).

  if (updateState !== 'downloaded') {
    return;
  }

  updateState = 'installing';

  autoUpdater.quitAndInstall(true, true);
};

const resendUpdateState = (): void => {
  // Let our renderer know about the update that is being downloaded or installed, if any.
  // Note: this is needed when our renderer has been reloaded (e.g., after it crashed), so that it can show the progress
  //       of the update (and block its UI) and ask us to install the update once it has been downloaded (in case our
  //       previous renderer didn't get a chance to do so).

  if (updateState === 'idle') {
    return;
  }

  MainWindow.instance?.send('update-download-progress', updateDownloadPercent);

  if (updateState === 'downloaded') {
    MainWindow.instance?.send('update-downloaded');
  }
};

export const loadSettings = (): ISettings => {
  return electronConf.get('settings');
};

export const saveSettings = (settings: ISettings): void => {
  electronConf.set('settings', settings);
};

export const applyTheme = (theme: OpenCORTheme = electronConf.get('settings.general.theme')): void => {
  // Apply the given theme (or the one in our settings if none is given) to OpenCOR, so that it is used by our renderer
  // and by Electron (e.g., for its dialogs).

  electron.nativeTheme.themeSource = theme === 'light' || theme === 'dark' ? theme : 'system';
};

let _resetAll = false;

export const resetAll = (): void => {
  _resetAll = true;

  /* TODO: enable once our GitHub integration is fully ready.
  deleteGitHubAccessToken();
*/

  // Note: when running as an AppImage, process.execPath (which Electron relaunches by default) is within the AppImage's
  //       temporary mount point, which disappears once OpenCOR exits, so we relaunch the AppImage itself instead (see
  //       appImagePath() and the creation of our desktop file in index.ts). In that case, we must also pass our
  //       original arguments (e.g., --no-sandbox, which may be needed for OpenCOR to start at all) since, unlike by
  //       default, Electron doesn't relaunch us with them when we specify the path to relaunch.

  const appImage = appImagePath();

  electron.app.relaunch(appImage ? { execPath: appImage, args: process.argv.slice(1) } : undefined);
  electron.app.quit();
};

// Our recent files, as well as the files that are opened and the file that is selected, are identified by their
// canonical path, as determined by libOpenCOR (and given to us by our renderer), so that a file is only listed once
// even if it was opened using different paths (e.g., "/tmp/model.cellml" and "/private/tmp/model.cellml" on macOS).

let recentFilePaths: string[] = [];

const removeRecentFilePath = (filePath: string): boolean => {
  // Remove the given file path from our recent file paths and return whether it was removed (in which case our Reopen
  // menu needs to be updated).

  let res = false;

  for (let i = recentFilePaths.length - 1; i >= 0; --i) {
    if (recentFilePaths[i] === filePath) {
      recentFilePaths.splice(i, 1);

      res = true;
    }
  }

  return res;
};

export const clearRecentFiles = (): void => {
  recentFilePaths = [];

  updateReopenMenu(recentFilePaths);
};

export const fileClosed = (filePath: string): void => {
  // Make sure that the file was not opened using a data URL (see isDataUrlFileName()).

  if (isDataUrlFileName(filePath)) {
    return;
  }

  removeRecentFilePath(filePath);

  recentFilePaths.unshift(filePath);

  if (recentFilePaths.length > 10) {
    recentFilePaths.length = 10;
  }

  updateReopenMenu(recentFilePaths);
};

export const recentFilePathCanonicalised = (filePath: string, canonicalFilePath: string): void => {
  // Replace the given (non-canonical) file path with its canonical version in our recent file paths (see
  // MainWindow.rendererReady()), unless it is no longer there (e.g., if our Reopen menu got cleared in the meantime),
  // making sure that the canonical file path is only listed once.

  const index = recentFilePaths.indexOf(filePath);

  if (filePath === canonicalFilePath || index === -1) {
    return;
  }

  recentFilePaths[index] = canonicalFilePath;

  for (let i = recentFilePaths.length - 1; i >= 0; --i) {
    if (i !== index && recentFilePaths[i] === canonicalFilePath) {
      recentFilePaths.splice(i, 1);
    }
  }

  updateReopenMenu(recentFilePaths);
};

// Note: for fileIssue() and fileOpened(), filePath is the path that was used to (try to) open the file, which may be
//       the path that we asked our renderer to open (see reopenFilePathsAndSelectFilePath()).

const removeRecentFilePaths = (filePath: string, canonicalFilePath: string): void => {
  // Remove both the canonical path of the file and the path that was used to (try to) open it from our recent file
  // paths.
  // Note: our recent file paths are normally canonical, but they may also include some paths that we couldn't
  //       canonicalise (see onRenderProcessGone()), in which case the canonical path of such a file is only known once
  //       our renderer has canonicalised it (see recentFilePathCanonicalised()) or (tried to) open it.

  const filePathRemoved = filePath !== canonicalFilePath && removeRecentFilePath(filePath);
  const canonicalFilePathRemoved = removeRecentFilePath(canonicalFilePath);

  if (filePathRemoved || canonicalFilePathRemoved) {
    updateReopenMenu(recentFilePaths);
  }
};

export const fileIssue = (filePath: string, canonicalFilePath: string): void => {
  removeRecentFilePaths(filePath, canonicalFilePath);

  // A file couldn't be opened, possibly while reopening files during OpenCOR startup, in which case we need to make sure
  // that it doesn't get selected and reopen the next file.

  MainWindow.instance?.fileOpenedOrNot(filePath, false);
};

export const fileOpened = (filePath: string, canonicalFilePath: string): void => {
  removeRecentFilePaths(filePath, canonicalFilePath);

  // A file has been opened, possibly while reopening files during OpenCOR startup, in which case we need to reopen the
  // next file.

  MainWindow.instance?.fileOpenedOrNot(filePath, true);
};

let openedFilePaths: string[] = [];

export const filesOpened = (filePaths: string[]): void => {
  openedFilePaths = filePaths;

  if (!filePaths.length) {
    selectedFilePath = null;
  }
};

let selectedFilePath: string | null = null;

export const fileSelected = (filePath: string): void => {
  selectedFilePath = filePath;
};

// Retrieve the files that are currently open and the file that is currently selected, so that they can be reopened and
// selected (e.g., the next time OpenCOR is started or after our renderer has crashed).
// Note: a file that was opened using a data URL only exists in memory (under a made-up name, e.g., "OMEX #1", see
//       isDataUrlFileName()), so it cannot be reopened. Hence, we don't reopen such a file and, if it is the selected
//       file, we select the first file that is to be reopened instead.

interface IFilesToReopen {
  opened: string[];
  selected: string;
}

const currentFilesToReopen = (): IFilesToReopen => {
  const opened = openedFilePaths.filter((filePath) => !isDataUrlFileName(filePath));
  const selected = selectedFilePath && !isDataUrlFileName(selectedFilePath) ? selectedFilePath : (opened[0] ?? '');

  return { opened, selected };
};

// Determine whether the given argument is an OpenCOR action (i.e. an opencor:// link).

const isAction = (argument: string | undefined): boolean => {
  return argument?.startsWith(FULL_URI_SCHEME) ?? false;
};

// Normalise the given command line (i.e. the process.argv of an instance of OpenCOR), so that it only contains the
// files to open and the OpenCOR actions to handle, with files given as absolute paths.
// Note: this is used both for our own command line and for the command line of another instance of OpenCOR that was
//       started while we were running (see the second-instance event in src/main/index.ts), in which case relative
//       paths must be resolved against the working directory of that other instance.

export const normaliseCommandLine = (commandLine: string[], workingDirectory: string): string[] => {
  const res = [...commandLine];

  // The command line can either be a classical command line or an OpenCOR action (i.e. an opencor:// link). In the
  // former case, we need to remove the path to OpenCOR and, if we are not packaged, the path to our app, while, in the
  // latter case, nothing should be removed.

  if (!isAction(res[0])) {
    res.shift();

    if (!isPackaged() && res.length) {
      res.shift();
    }
  }

  // Ignore any switch (e.g., --updated when auto-updating OpenCOR on Windows and macOS, --no-sandbox on Linux, or any
  // switch added by Electron or Chromium) and make sure that local files are given as absolute paths.

  return res
    .filter((argument) => !argument.startsWith('--'))
    .map((argument) =>
      isAction(argument) || isUrl(argument) || path.isAbsolute(argument)
        ? argument
        : path.resolve(workingDirectory, argument)
    );
};

// Retrieve the message to let the user know that our configuration file couldn't be loaded, and that our default
// configuration is therefore used instead, if needed (see createElectronConf()).
// Note: the backup of our configuration file is only retrieved once (see takeElectronConfBackupFileName()), so the user
//       is only told about it once, whichever way they are told about it.

const electronConfResetMessage = (): { message: string; detail: string } | null => {
  const backupFileName = takeElectronConfBackupFileName();

  if (!backupFileName) {
    return null;
  }

  return {
    message: 'OpenCOR could not read its configuration file, so it has been reset.',
    detail: `The position and size of the window, the files that were open, the recent files, and the settings have been reset to their defaults.\n\nThe configuration file that could not be read has been kept as:\n${backupFileName}`
  };
};

// Report a fatal error (e.g., OpenCOR couldn't be started) and quit.
// Note: our splash screen window is always on top, so we must close it first. Otherwise, it would hide our error dialog
//       and remain shown forever.

export const reportFatalErrorAndQuit = (message: string, splashScreenWindow?: SplashScreenWindow | null): void => {
  console.error(`OpenCOR: ${message}`);

  if (splashScreenWindow && !splashScreenWindow.isDestroyed()) {
    splashScreenWindow.close();
  }

  // Let the user know if our configuration file had to be reset since we are about to quit, i.e. they wouldn't be told
  // about it otherwise.

  const confResetMessage = electronConfResetMessage();

  electron.dialog.showErrorBox(
    'OpenCOR',
    confResetMessage ? `${message}\n\n${confResetMessage.message} ${confResetMessage.detail}` : message
  );

  electron.app.quit();
};

export class MainWindow extends ApplicationWindow {
  // Properties.

  static instance: MainWindow | null = null;

  private _splashScreenWindow: SplashScreenWindow | null = null;
  private _rendererReady = false;
  private _closing = false;
  private _rendererGone = false;
  private _rendererGoneCount = 0;
  private _pendingArguments: string[] = [];
  private _recentFilePathsToCanonicalise: string[] = [];
  private _filesToReopen: IFilesToReopen | null = null;
  private _openedFilePaths: string[] = [];
  private _openedFilePathIndex = 0;
  private _reopeningFilePath: string | null = null;
  private _selectedFilePath = '';

  // Constructor.

  constructor(commandLine: string[], splashScreenWindow: SplashScreenWindow, rendererUrl: string) {
    // Initialise ourselves.

    const state: IElectronConfState = electronConf.get('app.state');

    super({
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
      minWidth: 640,
      minHeight: 480,
      ...(isMacOs() ? {} : { icon: icon })
    });

    // Keep track of the current isntance.

    MainWindow.instance = this;

    this.on('closed', () => {
      if (MainWindow.instance === this) {
        MainWindow.instance = null;
      }
    });

    // Set our dock icon (macOS only).

    if (!isPackaged() && isMacOs()) {
      electron.app.dock?.setIcon(icon);
    }

    // Close our splash screen window with a short delay once we are visible.
    // Note: we must do this before restoring our state since maximising a window may also show it (on Windows and
    //       Linux), in which case we would otherwise miss the show event and never close our splash screen window.

    this._splashScreenWindow = splashScreenWindow;

    this.once('show', () => {
      setTimeout(() => {
        this.closeSplashScreenWindow();
      }, LONG_DELAY);
    });

    // Restore our state, if needed.

    if (state.isMaximized) {
      this.maximize();
    } else if (state.isFullScreen) {
      this.setFullScreen(true);
    }

    // Retrieve the recently opened files and our Reopen menu.

    recentFilePaths = electronConf.get('app.files.recent');

    updateReopenMenu(recentFilePaths);

    // Handle our command line, which will effectively be done once our renderer is ready (see rendererReady()).

    this.handleArguments(normaliseCommandLine(commandLine, process.cwd()));

    // Keep track of our settings unless we are resetting all.

    this.on('close', () => {
      if (_resetAll) {
        electronConf.clear();
      } else {
        // Main window state.

        if (!this.isMaximized() && !this.isMinimized() && !this.isFullScreen()) {
          const [stateX, stateY] = this.getPosition();
          const [stateWidth, stateHeight] = this.getContentSize();

          if (typeof stateX === 'number' && typeof stateY === 'number') {
            state.x = stateX;
            state.y = stateY;
          }

          if (typeof stateWidth === 'number' && typeof stateHeight === 'number') {
            state.width = stateWidth;
            state.height = stateHeight;
          }
        }

        state.isMaximized = this.isMaximized();
        state.isFullScreen = this.isFullScreen();

        electronConf.set('app.state', state);

        // Recent files.

        electronConf.set('app.files.recent', recentFilePaths);

        // Opened files and selected file.
        // Note: if our renderer is not ready, then either it crashed and we are being closed before it could be
        //       reloaded (or instead of being reloaded), in which case we save the files that were open (and selected)
        //       at the time of the crash, unless the user chose not to reopen them (see onRenderProcessGone()), or it
        //       never was ready (e.g., OpenCOR couldn't be loaded), in which case it never told us about the files that
        //       are open, so we keep the files that were open when OpenCOR was last closed.

        const filesToReopen = this._rendererReady ? this.filesToReopen() : this._filesToReopen;

        if (filesToReopen) {
          electronConf.set('app.files.opened', filesToReopen.opened);
          electronConf.set('app.files.selected', filesToReopen.selected);
        }
      }
    });

    // Disable our main menu.
    // Note: our renderer enables/disables our main menu depending on whether its UI is enabled (see compUiEnabled in
    //       src/renderer/src/components/OpenCORCore.vue), so we keep it disabled until then. Otherwise, it could be used
    //       before our renderer is able to handle it (e.g., while it is being loaded or initialised).

    enableDisableMainMenu(false);

    // Make sure that our menu bar is always visible.

    this.setAutoHideMenuBar(false);
    this.setMenuBarVisibility(true);

    // Open links in the default browser, unless it is a Firebase OAuth popup in which case we open it in a new window
    // so that the OAuth flow can proceed.

    this.webContents.setWindowOpenHandler((details) => {
      const isFirebaseOauthPopup = (url: string): boolean => {
        try {
          const parsedUrl = new URL(url);

          return (
            (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') &&
            parsedUrl.host === 'opencorapp.firebaseapp.com' &&
            parsedUrl.pathname === '/__/auth/handler'
          );
        } catch {
          return false;
        }
      };

      if (isFirebaseOauthPopup(details.url)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            parent: this,
            modal: false,
            autoHideMenuBar: true,
            width: 600,
            height: 700,
            backgroundColor: backgroundColor(),
            webPreferences: {
              preload: undefined,
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false
            }
          }
        };
      }

      if (isUrl(details.url)) {
        electron.shell.openExternal(details.url).catch((error: unknown) => {
          console.warn(`OpenCOR: failed to open external URL (${details.url}):`, formatError(error));
        });
      } else {
        console.warn(`OpenCOR: blocked attempt to open unsupported URL (${details.url}).`);
      }

      return {
        action: 'deny'
      };
    });

    // Prevent our renderer from navigating away from OpenCOR (e.g., if a file is dropped outside of the area where we
    // handle drag and drop, in which case Chromium would replace OpenCOR with that file). Not only would the user lose
    // their work, but the page we would navigate to would also have access to our preload API.
    // Note #1: our renderer never needs to navigate to another origin (links are opened through our window open handler
    //          above), so we only allow navigations within our renderer's origin (e.g., a reload).
    // Note #2: will-redirect is also emitted for subframes (unlike will-navigate), which may legitimately be redirected
    //          to another origin (e.g., the iframe used by Firebase for authentication), so we only check the
    //          navigations of our main frame.

    const rendererOrigin = new URL(rendererUrl).origin;
    const preventNavigationAway = (
      event: electron.Event<electron.WebContentsWillNavigateEventParams | electron.WebContentsWillRedirectEventParams>
    ): void => {
      if (!event.isMainFrame) {
        return;
      }

      let origin: string | null = null;

      try {
        origin = new URL(event.url).origin;
      } catch {
        // The URL is invalid, so we block the navigation.
      }

      if (origin !== rendererOrigin) {
        console.warn(`OpenCOR: blocked attempt to navigate to ${event.url}.`);

        event.preventDefault();
      }
    };

    this.webContents.on('will-navigate', preventNavigationAway);
    this.webContents.on('will-redirect', preventNavigationAway);

    // Handle our renderer process crashing (or being killed).

    this.webContents.on('render-process-gone', (_event, details) => {
      this.onRenderProcessGone(details);
    });

    // Load the renderer URL.
    // Note #1: a navigation that gets interrupted by another navigation (e.g., our renderer being reloaded after it
    //          crashed) results in an ERR_ABORTED error while one that gets interrupted by us being closed (e.g.,
    //          because OpenCOR is being quit) or destroyed results in an ERR_FAILED error. Neither is fatal, but since
    //          Electron rejects the navigation after we have been asked to close but before we have been destroyed, we
    //          need to keep track of whether we are being closed.
    // Note #2: a navigation that gets interrupted by our renderer crashing (e.g., because of the native libOpenCOR
    //          module) also results in an ERR_FAILED error. This is not fatal either since onRenderProcessGone() lets
    //          the user reload OpenCOR (or quit it). However, Electron rejects the navigation before it emits
    //          render-process-gone and even before our Web contents is flagged as crashed, so we cannot tell straight
    //          away whether our renderer has crashed. So, rather than reporting the error straight away, we give our
    //          renderer some time to be reported as gone (in practice, it is a matter of milliseconds).
    // Note #3: any other error means that OpenCOR cannot be used, so we report it and quit.

    const RENDERER_GONE_GRACE_PERIOD = 1000;

    this.once('close', () => {
      this._closing = true;
    });

    electron.app.once('before-quit', () => {
      this._closing = true;
    });

    // Note: on Windows, before-quit doesn't get emitted when the session ends (i.e. when shutting down or restarting
    //       the system, or when logging off), and our renderer may get killed before we get closed, so we also rely on
    //       session-end. We don't rely on query-session-end though since the session may not end after all (e.g., if
    //       another application prevents it from ending), in which case we would ignore our renderer crashing (see
    //       onRenderProcessGone()) for the rest of our lifetime.

    this.once('session-end', () => {
      this._closing = true;
    });

    const loadingWasInterrupted = (error: unknown): boolean => {
      if (
        (error as { code?: string }).code === 'ERR_ABORTED' ||
        this._closing ||
        this.isDestroyed() ||
        this.webContents.isDestroyed() ||
        this._rendererGone ||
        this.webContents.isCrashed()
      ) {
        console.warn(`OpenCOR: loading of URL (${rendererUrl}) was interrupted:`, formatError(error));

        return true;
      }

      return false;
    };

    this.loadURL(rendererUrl).catch((error: unknown) => {
      if (loadingWasInterrupted(error)) {
        return;
      }

      setTimeout(() => {
        if (loadingWasInterrupted(error)) {
          return;
        }

        reportFatalErrorAndQuit(`OpenCOR could not be loaded (${formatError(error)}).`, this._splashScreenWindow);
      }, RENDERER_GONE_GRACE_PERIOD);
    });
  }

  // Close our splash screen window, if it is still shown.

  closeSplashScreenWindow(): void {
    if (this._splashScreenWindow && !this._splashScreenWindow.isDestroyed()) {
      this._splashScreenWindow.close();
    }

    this._splashScreenWindow = null;

    this.reportElectronConfReset();
  }

  // Let the user know that our configuration file couldn't be loaded, and that our default configuration is therefore
  // used instead, if needed (see createElectronConf()).
  // Note #1: we wait for our splash screen window to be closed, so that our message box isn't hidden by it (it is
  //          always on top).
  // Note #2: we don't wait for our renderer to be ready since it may never be (e.g., if its initialisation fails), in
  //          which case the user would never be told about it. If our renderer crashes or OpenCOR cannot be loaded,
  //          then the user is told about it as part of the error that gets reported (see onRenderProcessGone() and
  //          reportFatalErrorAndQuit()).

  private reportElectronConfReset(): void {
    if ((this._splashScreenWindow && !this._splashScreenWindow.isDestroyed()) || this._closing || this.isDestroyed()) {
      return;
    }

    const confResetMessage = electronConfResetMessage();

    if (!confResetMessage) {
      return;
    }

    electron.dialog
      .showMessageBox(this, {
        type: 'warning',
        title: 'OpenCOR',
        ...confResetMessage,
        buttons: ['OK']
      })
      .catch((error: unknown) => {
        console.warn('OpenCOR: failed to report that the configuration file has been reset:', formatError(error));
      });
  }

  // Our renderer process is gone (e.g., it crashed because of the native libOpenCOR module), so let the user know and
  // either reload our renderer (and reopen the files that were open, or not) or quit.
  // Note: our renderer may crash because of one of the files that are open (e.g., a model that crashes libOpenCOR when
  //       it gets simulated, which happens as soon as it is opened if it has a UI JSON). Reopening that file would then
  //       crash our renderer again, and again each time it is reloaded. We cannot reliably tell which file (if any)
  //       caused our renderer to crash, so we let the user choose between reloading our renderer with or without the
  //       files that were open, the latter allowing them to break such a cycle.

  onRenderProcessGone(details: electron.RenderProcessGoneDetails): void {
    // Ignore our renderer being gone if we are being closed (e.g., because OpenCOR is being quit), whatever the reason.
    // Indeed, our renderer will normally exit cleanly in that case, but it may also be killed (e.g., when logging off or
    // shutting down the system) or crash while being torn down. Either way, there is nothing to recover since we are
    // going away, so we must not offer to reload OpenCOR.
    // Note: our renderer may also exit cleanly on its own (e.g., if the native libOpenCOR module calls exit(0)), in
    //       which case it is gone just as if it had crashed, so we handle it as such.

    if (this._closing || this.isDestroyed() || this.webContents.isDestroyed()) {
      return;
    }

    // Let our loading of the renderer URL know that our renderer is gone, so that it doesn't report it as a fatal error
    // (see the constructor).
    // Note: this must be done before showing our message box below since it blocks.

    this._rendererGone = true;

    ++this._rendererGoneCount;

    console.error(`OpenCOR: the renderer process is gone (${details.reason}, exit code ${details.exitCode}).`);

    // Let the user know if our configuration file had to be reset, as part of our message box below, so that they get
    // told about it even if they choose to quit OpenCOR.
    // Note: this must be done before closing our splash screen window since it would otherwise be reported in a message
    //       box of its own (see reportElectronConfReset()).

    const confResetMessage = electronConfResetMessage();

    // Make sure that our splash screen window doesn't hide our message box and that we are visible.

    this.closeSplashScreenWindow();

    if (!this.isVisible()) {
      this.show();
    }

    const RELOAD = 0;
    const RELOAD_WITHOUT_FILES = 1;
    const QUIT = 2;

    const choice = electron.dialog.showMessageBoxSync(this, {
      type: 'error',
      title: 'OpenCOR',
      message: 'OpenCOR has encountered a problem and needs to be reloaded.',
      detail: `Reason: ${details.reason} (exit code ${details.exitCode}).\n\nIf the problem keeps happening, reload OpenCOR without reopening the files that were open. Those files won't be reopened either if you quit OpenCOR, but they will be available from File|Reopen.${confResetMessage ? `\n\n${confResetMessage.message} ${confResetMessage.detail}` : ''}`,
      buttons: ['Reload', 'Reload Without Files', 'Quit'],
      defaultId: RELOAD,
      cancelId: QUIT
    });

    // Discard the files that we would have reopened if the user wants to reload our renderer without them or to quit
    // OpenCOR, or keep track of them so that they can be reopened once our renderer is ready again.
    // Note #1: if the user wants to quit OpenCOR, then the files that we would have reopened would otherwise be saved
    //          and therefore reopened the next time OpenCOR is started, crashing our renderer again if one of them
    //          caused the crash.
    // Note #2: if our renderer was ready, then we keep track of the files that were open (as well as those that we had
    //          yet to reopen, see filesToReopen()) and of the selected file, so that they can be reopened and selected
    //          once our renderer is ready again. If it wasn't ready, then it never told us about the files that are
    //          open, so we keep the files that we were going to reopen (i.e. those from a previous crash, if any, or
    //          those that were open when OpenCOR was last closed, see rendererReady()), as well as the arguments that
    //          we were asked to handle (e.g., our command line), which were never handled. Either way, the files to
    //          reopen are what gets saved should OpenCOR be quit before our renderer is ready again, so the next time
    //          OpenCOR is started, it won't reopen the files that might have caused the crash either.

    if (choice === RELOAD_WITHOUT_FILES || choice === QUIT) {
      this.discardFilesToReopen();
    } else if (this._rendererReady) {
      this._filesToReopen = this.filesToReopen();
    }

    // Forget about the files that our (crashed) renderer told us were open (and selected).
    // Note #1: our reloaded renderer will tell us about the files that are open, but only once it has opened some, so
    //          we would otherwise save the files that were open at the time of the crash (see currentFilesToReopen())
    //          should OpenCOR be quit before any file gets opened, i.e. reopen the files that might have caused the
    //          crash the next time OpenCOR is started.
    // Note #2: similarly, our reloaded renderer has no files to start with, so our File|Close and File|Close All menu
    //          items must be disabled (they will get enabled again once a file gets (re)opened).

    filesOpened([]);

    enableDisableFileCloseAndCloseAllMenuItems(false);

    this._rendererReady = false;
    this._openedFilePaths = [];
    this._openedFilePathIndex = 0;
    this._reopeningFilePath = null;
    this._selectedFilePath = '';

    // Quit OpenCOR or reload our renderer, making sure that our main menu is disabled until our reloaded renderer
    // enables it (see the constructor) and that we reopen our files once our renderer is ready again (see
    // rendererReady()).
    // Note: we only quit OpenCOR now since our files to reopen get saved when we are closed (see the constructor), and
    //       we want the ones that we have just discarded to be saved, not the ones that our (crashed) renderer told us
    //       were open.

    enableDisableMainMenu(false);

    if (choice === QUIT) {
      electron.app.quit();

      return;
    }

    this.webContents.reload();
  }

  // Discard the files that we would have reopened and the arguments that we were asked to handle since one of them
  // might have caused our renderer to crash (see onRenderProcessGone()).

  private discardFilesToReopen(): void {
    // Add the files that we would have reopened (as well as the files that we were asked to open, e.g., through our
    // command line) to our recent files, so that the user can still reopen them, one by one, if they want to.
    // Note #1: we add them in reverse order and the selected file last, so that the selected file ends up being the
    //          most recent one, followed by the other files in their original order (see fileClosed()).
    // Note #2: unlike the files that we would have reopened, the files that we were asked to open were never given to
    //          our renderer, so their path may not be canonical (only libOpenCOR, i.e. our renderer, can canonicalise
    //          a path). So, we ask our reloaded renderer to canonicalise them once it is ready (see rendererReady()).
    //          We still add them straight away though, so that they don't get lost should OpenCOR be quit before
    //          then (or instead of reloading our renderer).

    const filesNotToReopen = this._rendererReady
      ? this.filesToReopen()
      : (this._filesToReopen ?? {
          opened: electronConf.get('app.files.opened'),
          selected: electronConf.get('app.files.selected')
        });
    const filesNotToOpen = this._pendingArguments.filter((argument) => !isAction(argument));

    for (const filePath of [...filesNotToReopen.opened, ...filesNotToOpen].reverse()) {
      fileClosed(filePath);
    }

    this._recentFilePathsToCanonicalise.push(...filesNotToOpen);

    if (filesNotToReopen.selected) {
      fileClosed(filesNotToReopen.selected);
    }

    // Discard the files that we were going to reopen and the arguments that we were asked to handle, so that neither our
    // reloaded renderer nor OpenCOR, the next time it is started, reopens the files that might have caused the crash
    // or handles the arguments that our (crashed) renderer never handled.

    this._filesToReopen = { opened: [], selected: '' };
    this._pendingArguments = [];
  }

  // Our renderer is ready, so reopen previously opened files, if any, select the previously selected file, and handle
  // any arguments that we were asked to handle until now (e.g., our command line).
  // Note: our renderer may get reloaded (e.g., during development), in which case it will let us know again that it is
  //       ready, but there is nothing more for us to do then.

  rendererReady(): void {
    if (this._rendererReady) {
      return;
    }

    this._rendererReady = true;

    // If our renderer has been reloaded following a crash, then we reopen the files that were open at the time rather
    // than those that were open when OpenCOR was last closed.

    const filesToReopen = this._filesToReopen ?? {
      opened: electronConf.get('app.files.opened'),
      selected: electronConf.get('app.files.selected')
    };

    this._filesToReopen = null;

    this._openedFilePaths = filesToReopen.opened;
    this._openedFilePathIndex = 0;
    this._selectedFilePath = filesToReopen.selected;

    this.reopenFilePathsAndSelectFilePath();

    this.handleArguments(this._pendingArguments.splice(0));

    // Ask our renderer to canonicalise the recent file paths that we couldn't get from it (see onRenderProcessGone()).

    if (this._recentFilePathsToCanonicalise.length) {
      this.send('canonicalise-recent-file-paths', this._recentFilePathsToCanonicalise.splice(0));
    }

    // Let our renderer know about the update that is being downloaded or installed, if any.

    resendUpdateState();
  }

  // Retrieve the files to reopen and the file to select (e.g., because we are being closed or because our renderer has
  // crashed).
  // Note: if we are still reopening files (see reopenFilePathsAndSelectFilePath()), then our renderer has only told us
  //       about the files that it has opened so far, so we must also account for the file that we are reopening and for
  //       those that we have yet to reopen. Similarly, our renderer selects each file that it opens, so the file that
  //       it has told us is selected is not necessarily the one that we have yet to select.

  private filesToReopen(): IFilesToReopen {
    const res = currentFilesToReopen();

    if (this._reopeningFilePath === null) {
      return res;
    }

    const opened = new Set(res.opened);

    for (const filePath of [this._reopeningFilePath, ...this._openedFilePaths.slice(this._openedFilePathIndex)]) {
      if (filePath && !isDataUrlFileName(filePath)) {
        opened.add(filePath);
      }
    }

    const openedFilePaths = [...opened];

    return {
      opened: openedFilePaths,
      selected:
        this._selectedFilePath && opened.has(this._selectedFilePath)
          ? this._selectedFilePath
          : res.selected || (openedFilePaths[0] ?? '')
    };
  }

  // A file has been opened or not (e.g., because it couldn't be retrieved).
  // Note: we only reopen the next file if the given file is the one that we are reopening. Indeed, other files may be
  //       opened while we are reopening files (e.g., files passed on the command line or files opened by the user)
  //       and they must not result in us reopening the next file before the file that we are reopening has been opened
  //       (or not) since we would otherwise end up reopening several files at once and selecting the previously
  //       selected file before it has been reopened.

  fileOpenedOrNot(filePath: string, opened: boolean): void {
    // Make sure that we don't select a file that couldn't be (re)opened.

    if (!opened && filePath === this._selectedFilePath) {
      this._selectedFilePath = '';
    }

    // Reopen the next file, if any, if the given file is the one that we are reopening.

    if (filePath === this._reopeningFilePath) {
      this._reopeningFilePath = null;

      this.reopenFilePathsAndSelectFilePath();
    }
  }

  // Reopen previously opened files, if any, and select the previously selected file.
  // Note: we reopen one file at a time since a file may be a remote file which means that it may take some time to
  //       reopen. So, we only reopen the next file once our renderer has told us that the previous file has been
  //       opened (or couldn't be opened), see fileOpenedOrNot().

  reopenFilePathsAndSelectFilePath(): void {
    // Reopen the next file, if any.

    while (this._openedFilePathIndex < this._openedFilePaths.length) {
      const filePath = this._openedFilePaths[this._openedFilePathIndex];

      ++this._openedFilePathIndex;

      if (filePath) {
        this._reopeningFilePath = filePath;

        this.send('open', filePath);

        return;
      }
    }

    this._openedFilePaths = [];
    this._openedFilePathIndex = 0;

    // All the files have been reopened (or couldn't be reopened), so we can now select the previously selected file.

    if (this._selectedFilePath) {
      this.send('select', this._selectedFilePath);

      this._selectedFilePath = '';
    }
  }

  // Handle the given (normalised) command line arguments (see normaliseCommandLine()).

  handleArguments(commandLine: string[]): void {
    if (!commandLine.length) {
      return;
    }

    // Wait for our renderer to be ready, if needed.

    if (!this._rendererReady) {
      this._pendingArguments.push(...commandLine);

      return;
    }

    for (const argument of commandLine) {
      if (isAction(argument)) {
        this.send('action', argument.slice(FULL_URI_SCHEME.length));
      } else {
        this.send('open', argument);
      }
    }
  }

  // Enable/disable our UI.

  enableDisableUi(enable: boolean): void {
    enableDisableMainMenu(enable);

    this.send('enable-disable-ui', enable);
  }

  // Handle our File|Open menu.
  // Note: our renderer may get reloaded while our open dialog is shown (e.g., if it crashed and the user chose to
  //       reload it), in which case we must wait for it to be ready before asking it to open the selected files (see
  //       handleArguments()). Similarly, we must not enable our UI in that case since our reloaded renderer will enable
  //       it once it is ready (see onRenderProcessGone()). Otherwise, we must enable our UI, even if our renderer isn't
  //       ready, i.e. if its initialisation failed (in which case it never tells us that it is ready), or our UI would
  //       remain disabled.

  open(): void {
    this.enableDisableUi(false);

    const rendererGoneCount = this._rendererGoneCount;
    const enableUiIfRendererNotGone = (): void => {
      if (this._rendererGoneCount === rendererGoneCount) {
        this.enableDisableUi(true);
      }
    };

    electron.dialog
      .showOpenDialog({
        properties: ['openFile', 'multiSelections']
      })
      .then(({ filePaths }) => {
        this.handleArguments(filePaths);

        enableUiIfRendererNotGone();
      })
      .catch((error: unknown) => {
        console.warn('OpenCOR: failed to open file(s):', formatError(error));

        enableUiIfRendererNotGone();
      });
  }
}
