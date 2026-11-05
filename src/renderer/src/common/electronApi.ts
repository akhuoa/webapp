import type { OpenCORTheme } from '../../index';

import type { ISettings } from './common';

interface IElectronApi {
  // Note: this must be in sync with src/preload/index.ts.

  // Some general methods.

  operatingSystem: () => string;

  // Renderer process asking the main process to do something for it.

  applyTheme: (theme: OpenCORTheme) => void;
  checkForUpdates: (atStartup: boolean) => void;
  clearGitHubCache: () => Promise<void>;
  deleteGitHubAccessToken: () => Promise<boolean>;
  downloadAndInstallUpdate: () => void;
  enableDisableMainMenu: (enable: boolean) => void;
  enableDisableFileCloseAndCloseAllMenuItems: (enable: boolean) => void;
  fileClosed: (filePath: string) => void;
  fileIssue: (filePath: string, canonicalFilePath: string) => void;
  fileOpened: (filePath: string, canonicalFilePath: string) => void;
  filePath: (file: File) => string;
  fileSelected(filePath: string): void;
  filesOpened(filePaths: string[]): void;
  installUpdateAndRestart: () => void;
  loadGitHubAccessToken: () => Promise<string | null>;
  loadSettings: () => Promise<ISettings>;
  recentFilePathCanonicalised: (filePath: string, canonicalFilePath: string) => void;
  rendererReady: () => Promise<void>;
  resetAll: () => void;
  saveGitHubAccessToken: (token: string) => Promise<boolean>;
  saveSettings: (settings: ISettings) => void;

  // Renderer process listening to the main process.

  onAbout: (callback: () => void) => () => void;
  onAction: (callback: (action: string) => void) => () => void;
  onCanonicaliseRecentFilePaths: (callback: (filePaths: string[]) => void) => () => void;
  onChangelog: (callback: () => void) => () => void;
  onCheckForUpdates: (callback: () => void) => () => void;
  onEnableDisableUi: (callback: (enable: boolean) => void) => () => void;
  onOpen: (callback: (filePath: string) => void) => () => void;
  onOpenRemote: (callback: () => void) => () => void;
  onOpenSampleLorenz: (callback: () => void) => () => void;
  onClose: (callback: () => void) => () => void;
  onCloseAll: (callback: () => void) => () => void;
  onResetAll: (callback: () => void) => () => void;
  onSelect: (callback: (filePath: string) => void) => () => void;
  onSettings: (callback: () => void) => () => void;
  onUpdateAvailable: (callback: (version: string) => void) => () => void;
  onUpdateCheckError: (callback: (issue: string) => void) => () => void;
  onUpdateDownloaded: (callback: () => void) => () => void;
  onUpdateDownloadError: (callback: (issue: string) => void) => () => void;
  onUpdateInstallError: (callback: (issue: string) => void) => () => void;
  onUpdateDownloadProgress: (callback: (percent: number) => void) => () => void;
  onUpdateNotAvailable: (callback: () => void) => () => void;
}

interface IWindow {
  electronApi: IElectronApi;
}

export const electronApi: IElectronApi | undefined =
  typeof window !== 'undefined' ? (window as unknown as IWindow).electronApi : undefined;
