import * as electronToolkitUtils from '@electron-toolkit/utils';

import electron from 'electron';
import { Conf as ElectronConf } from 'electron-conf';
import * as childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import type { OpenCORTheme } from '../renderer/index';
import { formatError, type ISettings, isObject } from '../renderer/src/common/common';
import { SHORT_DELAY, URI_SCHEME } from '../renderer/src/common/constants';
import { appImagePath, isLinux, isPackaged, isWindows } from '../renderer/src/common/electron';
/* TODO: enable once our GitHub integration is fully ready.
import {
  clearGitHubCache,
  deleteGitHubAccessToken,
  loadGitHubAccessToken,
  saveGitHubAccessToken
} from '../renderer/src/common/gitHubIntegration';
 */
import { startRendererServer, stopRendererServer } from '../renderer/src/common/rendererServer';

import {
  enableDisableFileCloseAndCloseAllMenuItems,
  enableDisableFileSaveAndSaveAsMenuItems,
  enableDisableMainMenu
} from './MainMenu';
import {
  allowSavingFile,
  applyTheme,
  canSaveFile,
  checkForUpdates,
  closeConfirmed,
  closeRequestReceived,
  disallowSavingFile,
  downloadAndInstallUpdate,
  fileClosed,
  fileIssue,
  fileOpened,
  fileSelected,
  filesModified,
  filesOpened,
  installUpdateAndRestart,
  isTrustedFilePath,
  loadSettings,
  MainWindow,
  normaliseCommandLine,
  recentFilePathCanonicalised,
  reopenRecentFile,
  reportFatalErrorAndQuit,
  resetAll,
  saveFile,
  saveFileAs,
  saveSettings
} from './MainWindow';
import { SplashScreenWindow } from './SplashScreenWindow';

// Electron store.

export interface IElectronConfState {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
  isFullScreen: boolean;
}

interface IElectronConf {
  app: {
    files: {
      opened: string[];
      recent: string[];
      selected: string;
    };
    rendererServerPort: number;
    state: IElectronConfState;
  };
  settings: ISettings;
}

export let electronConf: ElectronConf<IElectronConf>;

// A helper function to sanitise a (loaded) configuration value against its default value, i.e. to use the default
// value for whatever is missing or of the wrong type.
// Note #1: electron-conf only merges our default configuration at the top level, so a configuration file that was saved
//          by an older version of OpenCOR or edited by hand may lack some (nested) values or have values of the wrong
//          type (e.g., a string rather than an array of file paths), which would otherwise prevent OpenCOR from
//          starting.
// Note #2: our only arrays are arrays of file paths, so we only keep their strings.
// Note #3: we keep the values for which we don't have a default value (e.g., values saved by a newer version of
//          OpenCOR).

const sanitisedConfValue = (value: unknown, defaultValue: unknown): unknown => {
  if (Array.isArray(defaultValue)) {
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [...defaultValue];
  }

  if (isObject(defaultValue)) {
    const res: Record<string, unknown> = isObject(value) ? { ...value } : {};

    for (const [key, keyDefaultValue] of Object.entries(defaultValue)) {
      res[key] = sanitisedConfValue(res[key], keyDefaultValue);
    }

    return res;
  }

  return typeof value === typeof defaultValue ? value : defaultValue;
};

// The backup of our configuration file, if it couldn't be loaded (see createElectronConf()).

let electronConfBackupFileName: string | null = null;

// Retrieve the backup of our configuration file, if any, so that the user can be told about it (see
// electronConfResetMessage() in MainWindow.ts).
// Note: we only return it once, so that the user is only told about it once.

export const takeElectronConfBackupFileName = (): string | null => {
  const res = electronConfBackupFileName;

  electronConfBackupFileName = null;

  return res;
};

// A helper function to create our Electron store.
// Note #1: electron-conf throws if our configuration file cannot be parsed (e.g., if it is empty or truncated because
//          it couldn't be fully written, or if it was edited by hand), in which case OpenCOR would never be able to
//          start again. So, we back it up (so that it can be inspected or recovered), use our default configuration
//          instead, and let the user know about it once OpenCOR is shown (or as part of the error that gets reported,
//          if any, see MainWindow.reportElectronConfReset()). If that fails too, then there is nothing more that we can
//          do, so we let the error through.
// Note #2: electron-conf also throws if our configuration file cannot be read (e.g., because it is temporarily locked
//          by an antivirus or a file synchronisation service on Windows, or because of its permissions), in which case
//          our configuration file is most likely fine, so we must not reset it. Instead, we let the error through (so
//          that OpenCOR reports it and quits), leaving our configuration file as is.

const createElectronConf = (defaults: IElectronConf): ElectronConf<IElectronConf> => {
  const options = {
    dir: electron.app.getPath('userData'),
    name: 'config',
    defaults
  };
  let res: ElectronConf<IElectronConf>;

  try {
    res = new ElectronConf<IElectronConf>(options);
  } catch (error: unknown) {
    const fileName = path.join(options.dir, `${options.name}.json`);

    if (!(error instanceof SyntaxError) || !fs.existsSync(fileName)) {
      throw error;
    }

    const backupFileName = `${fileName}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;

    fs.renameSync(fileName, backupFileName);

    console.error(
      `OpenCOR: the configuration file (${fileName}) could not be loaded (${formatError(error)}), so it has been backed up (as ${backupFileName}) and the default configuration is used instead.`
    );

    res = new ElectronConf<IElectronConf>(options);

    electronConfBackupFileName = backupFileName;
  }

  // Sanitise our configuration and save it, if needed.

  const store = res.store;
  const sanitisedStore = sanitisedConfValue(store, defaults) as IElectronConf;

  if (JSON.stringify(sanitisedStore) !== JSON.stringify(store)) {
    res.store = sanitisedStore;
  }

  return res;
};

// Allow only one instance of OpenCOR.
// Note #1: we pass our command line and working directory to the instance that is already running (see the
//          second-instance event below).
// Note #2: app.quit() doesn't stop the rest of this module from being executed, so we must make sure that we don't do
//          anything else if we are not the primary instance (e.g., register our URI scheme or create our splash screen
//          window).

const isPrimaryInstance = electron.app.requestSingleInstanceLock({ argv: process.argv, cwd: process.cwd() });

if (!isPrimaryInstance) {
  electron.app.quit();
}

// Take over if another instance of OpenCOR is started.

export let mainWindow: MainWindow | null = null;

// Note: another instance of OpenCOR may be started, or a file or an opencor:// link may be opened, before our main
//       window has been created (i.e. while our splash screen is shown), in which case we keep track of the arguments
//       so that they can be handled once our main window has been created.

const pendingArguments: string[][] = [];

// A helper function to handle the given (normalised) command line arguments, i.e. let our main window handle them (and
// bring it to the front) or, if it hasn't been created yet, keep track of them so that they can be handled once it has.

const handleArguments = (commandLine: string[]): void => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();

    mainWindow.handleArguments(commandLine);
  } else {
    pendingArguments.push(commandLine);
  }
};

electron.app.on('second-instance', (_event, argv, workingDirectory, additionalData) => {
  // Use the command line and working directory that the other instance passed to us, if available, since, according to
  // Electron's documentation, argv may have been reordered and have additional switches.

  const otherInstanceData = additionalData as { argv?: string[]; cwd?: string } | undefined;

  handleArguments(normaliseCommandLine(otherInstanceData?.argv ?? argv, otherInstanceData?.cwd ?? workingDirectory));
});

// Handle a file being opened with OpenCOR on macOS (e.g., by dropping it on OpenCOR's Dock icon or by using
// `open -a OpenCOR <file>`).
// Note #1: on macOS, the file is not passed on the command line, not even when OpenCOR gets started by opening it, in
//          which case this event is emitted before OpenCOR is ready, hence we register our handler straight away.
// Note #2: we must prevent the default behaviour to let macOS know that we handle the file.

electron.app.on('open-file', (event, filePath) => {
  event.preventDefault();

  handleArguments([filePath]);
});

// Handle the clicking of an opencor:// link on macOS.
// Note #1: on macOS, the link is not passed on the command line, not even when OpenCOR gets started by clicking it, in
//          which case this event is emitted before OpenCOR is ready, hence we register our handler straight away. Also,
//          several links may be clicked in a row, hence we handle each of them (see handleArguments()).
// Note #2: we must prevent the default behaviour to let macOS know that we handle the link.

electron.app.on('open-url', (event, url) => {
  event.preventDefault();

  handleArguments([url]);
});

// Register our URI scheme.

if (isPrimaryInstance) {
  electron.app.setAsDefaultProtocolClient(URI_SCHEME, isWindows() ? process.execPath : undefined);
}

// Set up Linux desktop integration by creating a desktop file and making our application icon available.
// Note: this is not needed on Windows and macOS since they automatically pick up the necessary information from
//       OpenCOR.

const setupLinuxDesktopIntegration = async (): Promise<void> => {
  try {
    // Make our application icon available so that it can be referenced by our desktop file.

    const localShareFolder = path.join(electron.app.getPath('home'), '.local/share');
    const localShareOpencorFolder = path.join(localShareFolder, URI_SCHEME);
    const iconSourcePath = path.join(import.meta.dirname, '../../src/main/assets/icon.png');
    const iconTargetPath = path.join(localShareOpencorFolder, 'icon.png');

    await fs.promises.mkdir(localShareOpencorFolder, { recursive: true });
    await fs.promises.copyFile(iconSourcePath, iconTargetPath);

    // Create a desktop file for OpenCOR and its URI scheme.

    const localApplicationsFolder = path.join(localShareFolder, 'applications');

    await fs.promises.mkdir(localApplicationsFolder, { recursive: true });

    // Note #1: when running as an AppImage, process.execPath is the path of OpenCOR within the AppImage's temporary
    //          mount point (e.g., /tmp/.mount_OpenCOxxxxxx/OpenCOR), which disappears once OpenCOR exits, so we must
    //          use the path of the AppImage itself (see appImagePath()).
    // Note #2: the path of OpenCOR may contain spaces or other special characters, so we quote it as required by the
    //          Desktop Entry specification (see
    //          https://specifications.freedesktop.org/desktop-entry-spec/latest/exec-variables.html), i.e. we escape
    //          '"', '`', '$', and '\' with a backslash, double that backslash (since the general escape rule for string
    //          values is applied before the quoting rule), and double `%` (since it introduces a field code).

    const executablePath = appImagePath() ?? process.execPath;
    const quotedExecutablePath = `"${executablePath
      .replace(/["`$\\]/g, (character) => (character === '\\' ? '\\\\\\\\' : `\\\\${character}`))
      .replace(/%/g, '%%')}"`;
    const desktopFilePath = path.join(localApplicationsFolder, `${URI_SCHEME}.desktop`);
    const desktopFileContents = `[Desktop Entry]
Type=Application
Name=OpenCOR
Exec=${quotedExecutablePath} %u
Icon=${iconTargetPath}
Terminal=false
MimeType=x-scheme-handler/${URI_SCHEME}`;
    let updateDesktopDatabase: boolean = false;

    try {
      const currentDesktopFileContents = await fs.promises.readFile(desktopFilePath, { encoding: 'utf8' });

      if (currentDesktopFileContents !== desktopFileContents) {
        await fs.promises.writeFile(desktopFilePath, desktopFileContents);

        updateDesktopDatabase = true;
      }
    } catch {
      await fs.promises.writeFile(desktopFilePath, desktopFileContents);

      updateDesktopDatabase = true;
    }

    // Update the desktop database.

    if (updateDesktopDatabase) {
      childProcess.exec(
        'update-desktop-database ~/.local/share/applications',
        (error: childProcess.ExecException | null) => {
          if (error) {
            console.warn('OpenCOR: failed to update the desktop database:', formatError(error));
          }
        }
      );
    }
  } catch (error: unknown) {
    console.warn('OpenCOR: failed to set up Linux desktop integration:', formatError(error));
  }
};

// The app is ready, so finalise its initialisation.

electron.app
  .whenReady()
  .then(() => {
    // Nothing to do if we are not the primary instance (see above).

    if (!isPrimaryInstance) {
      return;
    }

    // Set up Linux desktop integration.

    if (isLinux()) {
      setupLinuxDesktopIntegration();
    }

    // Set process.env.NODE_ENV to 'production' if we are not the default app.
    // Note: we do this because some packages rely on the value of process.env.NODE_ENV to determine whether they
    //       should run in development mode (default) or production mode.

    if (!process.defaultApp) {
      process.env.NODE_ENV = 'production';
    }

    // Initialise our Electron store.

    const workAreaSize = electron.screen.getPrimaryDisplay().workAreaSize;
    const horizontalSpace = Math.round(workAreaSize.width / 13);
    const verticalSpace = Math.round(workAreaSize.height / 13);
    const defaultState: IElectronConfState = {
      x: horizontalSpace,
      y: verticalSpace,
      width: workAreaSize.width - 2 * horizontalSpace,
      height: workAreaSize.height - 2 * verticalSpace,
      isMaximized: false,
      isFullScreen: false
    };

    electronConf = createElectronConf({
      app: {
        files: {
          opened: [],
          recent: [],
          selected: ''
        },
        rendererServerPort: 0,
        state: defaultState
      },
      settings: {
        general: {
          checkForUpdatesAtStartup: true,
          theme: 'system'
        }
      }
    });

    // Make sure that our saved window state is (still) visible on one of our displays. Indeed, a display may have been
    // disconnected (or its resolution changed) since OpenCOR was last closed, in which case our main window (and our
    // splash screen window, which is centred on it) would be shown off-screen. So, if our saved window state is not
    // sufficiently visible on any of our displays, we reset its position and size (but keep whether it was maximised or
    // in full-screen mode).

    const MIN_VISIBLE_SIZE = 100;
    const state: IElectronConfState = electronConf.get('app.state');
    const stateIsVisible = electron.screen.getAllDisplays().some(({ workArea }) => {
      const visibleWidth = Math.min(state.x + state.width, workArea.x + workArea.width) - Math.max(state.x, workArea.x);
      const visibleHeight =
        Math.min(state.y + state.height, workArea.y + workArea.height) - Math.max(state.y, workArea.y);

      return visibleWidth >= MIN_VISIBLE_SIZE && visibleHeight >= MIN_VISIBLE_SIZE;
    });

    if (!stateIsVisible) {
      electronConf.set('app.state', {
        ...defaultState,
        isMaximized: state.isMaximized,
        isFullScreen: state.isFullScreen
      });
    }

    // Apply our theme, so that our splash screen window and main window use it from the start.

    applyTheme();

    // Create our splash window.

    const splashScreenWindow = new SplashScreenWindow();

    // Start our renderer server straight away (rather than once our splash screen window has been shown), so that it is
    // ready by the time we create our main window.
    // Note: any error is handled when creating our main window, but we need to handle it here too, so that it isn't
    //       reported as an unhandled rejection in the meantime.

    // Note: we want our renderer server to always use the same port (if possible), so that the origin of our renderer
    //       remains the same from one launch to another. This means that our renderer's HTTP cache can be used across
    //       launches and that our renderer's origin-scoped storage doesn't get orphaned (and accumulate) on each
    //       launch. So, we ask our renderer server to try the port it used last time and keep track of the port it ends
    //       up using.

    const rendererUrl = process.env.ELECTRON_RENDERER_URL
      ? Promise.resolve(process.env.ELECTRON_RENDERER_URL)
      : startRendererServer(electronConf.get('app.rendererServerPort')).then((url: string) => {
          electronConf.set('app.rendererServerPort', Number(new URL(url).port));

          return url;
        });

    rendererUrl.catch(() => {});

    // Set our app user model id for Windows.

    electronToolkitUtils.electronApp.setAppUserModelId('ws.opencor.app');

    // Wait for the splash screen to be ready before creating the main window.

    splashScreenWindow.once('ready-to-show', () => {
      // Show the splash screen.

      splashScreenWindow.show();

      // Give the splash screen a moment to render before creating the main window.

      setTimeout(async () => {
        // Enable the F12 shortcut (to show/hide the developer tools) if we are not packaged.

        if (!isPackaged()) {
          electron.app.on('browser-window-created', (_event, window) => {
            electronToolkitUtils.optimizer.watchWindowShortcuts(window);
          });
        }

        // Handle some requests from our renderer process.

        electron.ipcMain.handle('allow-saving-dropped-file', (_event, filePath: string) => {
          allowSavingFile(filePath);
        });
        electron.ipcMain.handle('apply-theme', (_event, theme: OpenCORTheme) => {
          applyTheme(theme);
        });
        electron.ipcMain.handle('can-save-file', (_event, filePath: string): boolean => {
          return canSaveFile(filePath);
        });
        electron.ipcMain.handle('check-for-updates', (_event, atStartup: boolean) => {
          checkForUpdates(atStartup);
        });
        electron.ipcMain.handle('close-confirmed', () => {
          closeConfirmed();
        });
        electron.ipcMain.handle('close-request-received', () => {
          closeRequestReceived();
        });
        /* TODO: enable once our GitHub integration is fully ready.
        electron.ipcMain.handle('clear-github-cache', async (): Promise<void> => {
          await clearGitHubCache();
        });
        electron.ipcMain.handle('delete-github-access-token', async (): Promise<boolean> => {
          return deleteGitHubAccessToken();
        });
*/
        electron.ipcMain.handle('disallow-saving-file', (_event, filePath: string) => {
          disallowSavingFile(filePath);
        });
        electron.ipcMain.handle('download-and-install-update', () => {
          downloadAndInstallUpdate();
        });
        electron.ipcMain.handle('enable-disable-main-menu', (_event, enable: boolean) => {
          enableDisableMainMenu(enable);
        });
        electron.ipcMain.handle('enable-disable-file-close-and-close-all-menu-items', (_event, enable: boolean) => {
          enableDisableFileCloseAndCloseAllMenuItems(enable);
        });
        electron.ipcMain.handle(
          'enable-disable-file-save-and-save-as-menu-items',
          (_event, enableSave: boolean, enableSaveAs: boolean) => {
            enableDisableFileSaveAndSaveAsMenuItems(enableSave, enableSaveAs);
          }
        );
        electron.ipcMain.handle('file-closed', (_event, filePath: string) => {
          if (isTrustedFilePath(filePath)) {
            fileClosed(filePath);
          }

          disallowSavingFile(filePath);
        });
        electron.ipcMain.handle('file-issue', (_event, filePath: string, canonicalFilePath: string) => {
          fileIssue(filePath, canonicalFilePath);
          disallowSavingFile(filePath);
          disallowSavingFile(canonicalFilePath);
        });
        electron.ipcMain.handle('file-opened', (_event, filePath: string, canonicalFilePath: string) => {
          fileOpened(filePath, canonicalFilePath);
        });
        electron.ipcMain.handle('file-selected', (_event, filePath: string) => {
          fileSelected(filePath);
        });
        electron.ipcMain.handle('files-modified', (_event, filePaths: string[]) => {
          filesModified(filePaths);
        });
        electron.ipcMain.handle('files-opened', (_event, filePaths: string[]) => {
          filesOpened(filePaths.filter(isTrustedFilePath));
        });
        electron.ipcMain.handle('install-update-and-restart', (): boolean => {
          return installUpdateAndRestart();
        });
        /* TODO: enable once our GitHub integration is fully ready.
        electron.ipcMain.handle('load-github-access-token', async (): Promise<string | null> => {
          return loadGitHubAccessToken();
        });
*/
        electron.ipcMain.handle('load-settings', (): ISettings => {
          return loadSettings();
        });
        electron.ipcMain.handle(
          'recent-file-path-canonicalised',
          (_event, filePath: string, canonicalFilePath: string) => {
            recentFilePathCanonicalised(filePath, canonicalFilePath);
          }
        );
        electron.ipcMain.handle('reopen-recent-file', (_event, filePath: string) => {
          reopenRecentFile(filePath);
        });
        electron.ipcMain.handle('renderer-ready', () => {
          MainWindow.instance?.rendererReady();
        });
        electron.ipcMain.handle('reset-all', resetAll);
        electron.ipcMain.handle('save-file', (_event, filePath: string, contents: Uint8Array): Promise<void> => {
          return saveFile(filePath, contents);
        });
        electron.ipcMain.handle('save-file-as', (_event, defaultFilePath: string): Promise<string | null> => {
          return saveFileAs(defaultFilePath);
        });
        /* TODO: enable once our GitHub integration is fully ready.
        electron.ipcMain.handle('save-github-access-token', async (_event, token: string): Promise<boolean> => {
          return saveGitHubAccessToken(token);
        });
*/
        electron.ipcMain.handle('save-settings', (_event, settings: ISettings) => {
          saveSettings(settings);
        });
        electron.ipcMain.handle('show-open-dialog', () => {
          MainWindow.instance?.showOpenDialog();
        });

        // Create our main window and pass to it our command line arguments.
        // Note: if that fails (e.g., our renderer server couldn't be started), then OpenCOR cannot be used, so we
        //       report the error and quit (rather than leave our splash screen window shown forever).

        try {
          mainWindow = new MainWindow(process.argv, splashScreenWindow, await rendererUrl);

          // Forget about our main window once it has been closed (and therefore destroyed), so that we don't try to
          // use it (e.g., from our main menu or when another instance of OpenCOR is started).

          mainWindow.on('closed', () => {
            mainWindow = null;
          });
        } catch (error: unknown) {
          reportFatalErrorAndQuit(`OpenCOR could not be started (${formatError(error)}).`, splashScreenWindow);

          return;
        }

        // Handle the arguments of any instance of OpenCOR that was started, or any file or opencor:// link that was
        // opened while our splash screen was being shown.

        for (const argv of pendingArguments.splice(0)) {
          mainWindow.handleArguments(argv);
        }
      }, SHORT_DELAY);
    });
  })
  .catch((error: unknown) => {
    reportFatalErrorAndQuit(`OpenCOR could not be started (${formatError(error)}).`);
  });

// Ensure that the renderer server is stopped when quitting.

electron.app.on('will-quit', () => {
  stopRendererServer().catch((error: unknown) => {
    console.warn('OpenCOR: failed to stop the renderer server:', formatError(error));
  });
});
