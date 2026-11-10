import type { OpenCORTheme } from '../../index';

import type { ISettings, ISystemDetails } from './common';

interface IElectronApi {
  // Note: this must be in sync with src/preload/index.ts.

  // Some general methods.

  operatingSystem: () => string;
  systemDetails: () => ISystemDetails;

  // Renderer process asking the main process to do something for it.

  applyTheme: (theme: OpenCORTheme) => void;
  canSaveFile: (filePath: string) => Promise<boolean>;
  checkForUpdates: (atStartup: boolean) => void;
  closeConfirmed: () => void;
  closeRequestReceived: () => void;
  clearGitHubCache: () => Promise<void>;
  deleteGitHubAccessToken: () => Promise<boolean>;
  disallowSavingFile: (filePath: string) => void;
  downloadAndInstallUpdate: () => void;
  enableDisableMainMenu: (enable: boolean) => void;
  enableDisableFileCloseAndCloseAllMenuItems: (enable: boolean) => void;
  enableDisableFileSaveAndSaveAsMenuItems: (enableSave: boolean, enableSaveAs: boolean) => void;
  fileClosed: (filePath: string) => void;
  fileIssue: (filePath: string, canonicalFilePath: string) => void;
  fileOpened: (filePath: string, canonicalFilePath: string) => void;
  filePath: (file: File) => string;
  fileSelected(filePath: string): void;
  filesModified(filePaths: string[]): void;
  filesOpened(filePaths: string[]): void;
  installUpdateAndRestart: () => Promise<boolean>;
  loadGitHubAccessToken: () => Promise<string | null>;
  loadSettings: () => Promise<ISettings>;
  recentFilePathCanonicalised: (filePath: string, canonicalFilePath: string) => void;
  rendererReady: () => Promise<void>;
  reopenRecentFile: (filePath: string) => void;
  resetAll: () => void;
  saveFile: (filePath: string, contents: Uint8Array) => Promise<void>;
  saveFileAs: (defaultFilePath: string) => Promise<string | null>;
  saveGitHubAccessToken: (token: string) => Promise<boolean>;
  saveSettings: (settings: ISettings) => void;
  showOpenDialog: () => void;

  // Renderer process listening to the main process.

  onAbout: (callback: () => void) => () => void;
  onAction: (callback: (action: string) => void) => () => void;
  onCanonicaliseRecentFilePaths: (callback: (filePaths: string[]) => void) => () => void;
  onChangelog: (callback: () => void) => () => void;
  onCheckForUpdates: (callback: () => void) => () => void;
  onClearRecentFiles: (callback: () => void) => () => void;
  onEnableDisableUi: (callback: (enable: boolean) => void) => () => void;
  onOpenFile: (callback: (filePath: string) => void) => () => void;
  onOpenLocation: (callback: () => void) => () => void;
  onOpenSampleLorenz: (callback: () => void) => () => void;
  onRecentFiles: (callback: (filePaths: string[]) => void) => () => void;
  onClose: (callback: () => void) => () => void;
  onCloseAll: (callback: () => void) => () => void;
  onConfirmClose: (callback: () => void) => () => void;
  onResetAll: (callback: () => void) => () => void;
  onSave: (callback: () => void) => () => void;
  onSaveAs: (callback: () => void) => () => void;
  onSelect: (callback: (filePath: string) => void) => () => void;
  onSettings: (callback: () => void) => () => void;
  onUpdateAvailable: (callback: (version: string) => void) => () => void;
  onUpdateCheckError: (callback: (issue: string) => void) => () => void;
  onUpdateDownloaded: (callback: () => void) => () => void;
  onUpdateDownloadError: (callback: (issue: string) => void) => () => void;
  onUpdateInstallError: (callback: (issue: string) => void) => () => void;
  onUpdateInstalling: (callback: () => void) => () => void;
  onUpdateDownloadProgress: (callback: (percent: number, transferred: number, total: number) => void) => () => void;
  onUpdateNotAvailable: (callback: () => void) => () => void;
}

interface IWindow {
  electronApi: IElectronApi;
}

export const electronApi: IElectronApi | undefined =
  typeof window !== 'undefined' ? (window as unknown as IWindow).electronApi : undefined;
