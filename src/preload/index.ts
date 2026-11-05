import electron from 'electron';
import { promises as fs } from 'node:fs';

import loc from '../../dist/libOpenCOR/Release/libOpenCOR.node';

import type { OpenCORTheme } from '../renderer/index';
import type { ISettings } from '../renderer/src/common/common';

// A helper function to listen to a channel from the main process.
// Note: it returns a function to stop listening to that channel so that a listener can be removed (e.g., when the
//       component that registered it gets unmounted). Otherwise, a listener would remain registered (and keep its
//       callback, and therefore its component, alive) for the lifetime of the renderer process.

const onIpc = <T extends unknown[]>(channel: string, callback: (...args: T) => void): (() => void) => {
  const listener = (_event: electron.IpcRendererEvent, ...args: T): void => {
    callback(...args);
  };

  electron.ipcRenderer.on(channel, listener);

  return () => {
    electron.ipcRenderer.removeListener(channel, listener);
  };
};

let _operatingSystem: string | null = null;
const defaultOperatingSystem = `${process.platform} (${process.arch === 'x64' ? 'Intel' : 'ARM'})`;

const retrieveOperatingSystem = async (): Promise<string> => {
  // Note: we don't spawn any process (e.g., sw_vers on macOS or wmic on Windows, the latter not being available on
  //       recent versions of Windows 11) to retrieve the operating system since it would slow down our startup.
  //       Instead, we use Electron's process.getSystemVersion() on macOS and Windows, and read /etc/os-release on
  //       Linux.

  let operatingSystem: string = '';

  if (process.platform === 'win32') {
    // Note: Windows 11 still reports itself as Windows 10.0, but with a build number of 22000 or above.

    const [major, , build] = process.getSystemVersion().split('.').map(Number);

    operatingSystem = major === 10 && (build ?? 0) >= 22000 ? 'Windows 11' : major === 10 ? 'Windows 10' : 'Windows';
  } else if (process.platform === 'linux') {
    let res: string | null = null;

    try {
      res = await fs.readFile('/etc/os-release', 'utf8');
    } catch {}

    const match = res?.match(/^PRETTY_NAME=(?:")?(.*?)(?:")?$|^NAME=(?:")?(.*?)(?:")?$/m) || null;

    if (match) {
      operatingSystem = (match[1] || match[2] || '').replace(/"/g, '').trim();
    }

    operatingSystem = operatingSystem || 'Linux';
  } else if (process.platform === 'darwin') {
    operatingSystem = `macOS ${process.getSystemVersion()}`.trim();
  }

  return operatingSystem ? `${operatingSystem} (${process.arch === 'x64' ? 'Intel' : 'ARM'})` : defaultOperatingSystem;
};

// Retrieve the version of the operating system.

retrieveOperatingSystem()
  .then((operatingSystem) => {
    _operatingSystem = operatingSystem;
  })
  .catch(() => {
    _operatingSystem = defaultOperatingSystem;
  });

// Some bridging between our main process and renderer process.
// Note: this must be in sync with src/electronApi.ts.

electron.contextBridge.exposeInMainWorld('electronApi', {
  // Some general methods.

  operatingSystem: () => {
    // Return a cached version of the operating system if we have it, otherwise return a default value.

    return _operatingSystem || defaultOperatingSystem;
  },

  // Renderer process asking the main process to do something for it.

  applyTheme: (theme: OpenCORTheme) => electron.ipcRenderer.invoke('apply-theme', theme),
  checkForUpdates: (atStartup: boolean) => electron.ipcRenderer.invoke('check-for-updates', atStartup),
  clearGitHubCache: (): Promise<void> => electron.ipcRenderer.invoke('clear-github-cache'),
  deleteGitHubAccessToken: (): Promise<boolean> => electron.ipcRenderer.invoke('delete-github-access-token'),
  downloadAndInstallUpdate: () => electron.ipcRenderer.invoke('download-and-install-update'),
  enableDisableMainMenu: (enable: boolean) => electron.ipcRenderer.invoke('enable-disable-main-menu', enable),
  enableDisableFileCloseAndCloseAllMenuItems: (enable: boolean) =>
    electron.ipcRenderer.invoke('enable-disable-file-close-and-close-all-menu-items', enable),
  fileClosed: (filePath: string) => electron.ipcRenderer.invoke('file-closed', filePath),
  fileIssue: (filePath: string, canonicalFilePath: string) =>
    electron.ipcRenderer.invoke('file-issue', filePath, canonicalFilePath),
  fileOpened: (filePath: string, canonicalFilePath: string) =>
    electron.ipcRenderer.invoke('file-opened', filePath, canonicalFilePath),
  filePath: (file: File) => electron.webUtils.getPathForFile(file),
  fileSelected: (filePath: string) => electron.ipcRenderer.invoke('file-selected', filePath),
  filesOpened: (filePaths: string[]) => electron.ipcRenderer.invoke('files-opened', filePaths),
  installUpdateAndRestart: () => electron.ipcRenderer.invoke('install-update-and-restart'),
  loadGitHubAccessToken: (): Promise<string | null> => electron.ipcRenderer.invoke('load-github-access-token'),
  loadSettings: (): Promise<ISettings> => electron.ipcRenderer.invoke('load-settings'),
  recentFilePathCanonicalised: (filePath: string, canonicalFilePath: string) =>
    electron.ipcRenderer.invoke('recent-file-path-canonicalised', filePath, canonicalFilePath),
  rendererReady: () => electron.ipcRenderer.invoke('renderer-ready'),
  resetAll: () => electron.ipcRenderer.invoke('reset-all'),
  saveGitHubAccessToken: (token: string): Promise<boolean> =>
    electron.ipcRenderer.invoke('save-github-access-token', token),
  saveSettings: (settings: ISettings) => electron.ipcRenderer.invoke('save-settings', settings),

  // Renderer process listening to the main process.

  onAbout: (callback: () => void) => onIpc('about', callback),
  onAction: (callback: (action: string) => void) => onIpc('action', callback),
  onCanonicaliseRecentFilePaths: (callback: (filePaths: string[]) => void) =>
    onIpc('canonicalise-recent-file-paths', callback),
  onChangelog: (callback: () => void) => onIpc('changelog', callback),
  onCheckForUpdates: (callback: () => void) => onIpc('check-for-updates', callback),
  onEnableDisableUi: (callback: (enable: boolean) => void) => onIpc('enable-disable-ui', callback),
  onOpen: (callback: (filePath: string) => void) => onIpc('open', callback),
  onOpenRemote: (callback: () => void) => onIpc('open-remote', callback),
  onOpenSampleLorenz: (callback: () => void) => onIpc('open-sample-lorenz', callback),
  onClose: (callback: () => void) => onIpc('close', callback),
  onCloseAll: (callback: () => void) => onIpc('close-all', callback),
  onResetAll: (callback: () => void) => onIpc('reset-all', callback),
  onSelect: (callback: (filePath: string) => void) => onIpc('select', callback),
  onSettings: (callback: () => void) => onIpc('settings', callback),
  onUpdateAvailable: (callback: (version: string) => void) => onIpc('update-available', callback),
  onUpdateCheckError: (callback: (issue: string) => void) => onIpc('update-check-error', callback),
  onUpdateDownloaded: (callback: () => void) => onIpc('update-downloaded', callback),
  onUpdateDownloadError: (callback: (issue: string) => void) => onIpc('update-download-error', callback),
  onUpdateInstallError: (callback: (issue: string) => void) => onIpc('update-install-error', callback),
  onUpdateDownloadProgress: (callback: (percent: number) => void) => onIpc('update-download-progress', callback),
  onUpdateNotAvailable: (callback: () => void) => onIpc('update-not-available', callback)
});

// Give our renderer process access to the native node module for libOpenCOR.
// Note: this must be in sync with src/libopencor/src/main.cpp.

electron.contextBridge.exposeInMainWorld('locApi', {
  // Some general methods.

  version: () => loc.version(),

  // FileManager API.

  fileManagerCanonicalPath: (path: string) => loc.fileManagerCanonicalPath(path),
  fileManagerHasFile: (path: string) => loc.fileManagerHasFile(path),
  fileManagerUnmanage: (path: string) => loc.fileManagerUnmanage(path),

  // File API.

  fileContents: (path: string) => loc.fileContents(path),
  fileCreate: (path: string, contents: object) => loc.fileCreate(path, contents),
  fileIssues: (path: string) => loc.fileIssues(path),
  fileType: (path: string) => loc.fileType(path),
  fileUiJson: (path: string) => loc.fileUiJson(path),

  // SedDocument API.

  sedDocumentCreate: (path: string) => loc.sedDocumentCreate(path),
  sedDocumentInstantiate: (documentId: number) => loc.sedDocumentInstantiate(documentId),
  sedDocumentRelease: (documentId: number) => loc.sedDocumentRelease(documentId),
  sedDocumentIssues: (documentId: number) => loc.sedDocumentIssues(documentId),
  sedDocumentModelCount: (documentId: number) => loc.sedDocumentModelCount(documentId),
  sedDocumentSimulationCount: (documentId: number) => loc.sedDocumentSimulationCount(documentId),
  sedDocumentSimulationType: (documentId: number, index: number) => loc.sedDocumentSimulationType(documentId, index),
  sedDocumentSerialise: (documentId: number) => loc.sedDocumentSerialise(documentId),
  sedModelFilePath: (documentId: number, index: number) => loc.sedModelFilePath(documentId, index),
  sedModelAddChange: (
    documentId: number,
    index: number,
    componentName: string,
    variableName: string,
    newValue: string
  ) => loc.sedModelAddChange(documentId, index, componentName, variableName, newValue),
  sedModelRemoveAllChanges: (documentId: number, index: number) => loc.sedModelRemoveAllChanges(documentId, index),
  sedOneStepStep: (documentId: number, index: number) => loc.sedOneStepStep(documentId, index),
  sedUniformTimeCourseInitialTime: (documentId: number, index: number) =>
    loc.sedUniformTimeCourseInitialTime(documentId, index),
  sedUniformTimeCourseSetInitialTime: (documentId: number, index: number, value: number) =>
    loc.sedUniformTimeCourseSetInitialTime(documentId, index, value),
  sedUniformTimeCourseOutputStartTime: (documentId: number, index: number) =>
    loc.sedUniformTimeCourseOutputStartTime(documentId, index),
  sedUniformTimeCourseSetOutputStartTime: (documentId: number, index: number, value: number) =>
    loc.sedUniformTimeCourseSetOutputStartTime(documentId, index, value),
  sedUniformTimeCourseOutputEndTime: (documentId: number, index: number) =>
    loc.sedUniformTimeCourseOutputEndTime(documentId, index),
  sedUniformTimeCourseSetOutputEndTime: (documentId: number, index: number, value: number) =>
    loc.sedUniformTimeCourseSetOutputEndTime(documentId, index, value),
  sedUniformTimeCourseNumberOfSteps: (documentId: number, index: number) =>
    loc.sedUniformTimeCourseNumberOfSteps(documentId, index),
  sedUniformTimeCourseSetNumberOfSteps: (documentId: number, index: number, value: number) =>
    loc.sedUniformTimeCourseSetNumberOfSteps(documentId, index, value),

  // SolverCvode API.
  // TODO: this is only temporary until we have full support for our different solvers.

  solverCvodeExists: (documentId: number, index: number) => loc.solverCvodeExists(documentId, index),
  solverCvodeMaximumStep: (documentId: number, index: number) => loc.solverCvodeMaximumStep(documentId, index),
  solverCvodeSetMaximumStep: (documentId: number, index: number, value: number) =>
    loc.solverCvodeSetMaximumStep(documentId, index, value),

  // SedInstance API.

  sedInstanceHasIssues: (instanceId: number) => loc.sedInstanceHasIssues(instanceId),
  sedInstanceIssues: (instanceId: number) => loc.sedInstanceIssues(instanceId),
  sedInstanceStatus: (instanceId: number) => loc.sedInstanceStatus(instanceId),
  sedInstanceProgress: (instanceId: number) => loc.sedInstanceProgress(instanceId),
  sedInstanceStartRun: (instanceId: number) => loc.sedInstanceStartRun(instanceId),
  sedInstanceWaitForRun: (instanceId: number) => loc.sedInstanceWaitForRun(instanceId),
  sedInstancePauseRun: (instanceId: number) => loc.sedInstancePauseRun(instanceId),
  sedInstanceResumeRun: (instanceId: number) => loc.sedInstanceResumeRun(instanceId),
  sedInstanceStopRun: (instanceId: number) => loc.sedInstanceStopRun(instanceId),
  sedInstanceRelease: (instanceId: number) => loc.sedInstanceRelease(instanceId),

  // SedInstanceTask API.

  sedInstanceTaskVoiName: (instanceId: number, index: number) => loc.sedInstanceTaskVoiName(instanceId, index),
  sedInstanceTaskVoiUnit: (instanceId: number, index: number) => loc.sedInstanceTaskVoiUnit(instanceId, index),
  sedInstanceTaskVoi: (instanceId: number, index: number, start?: number, end?: number) =>
    loc.sedInstanceTaskVoi(instanceId, index, start, end),
  sedInstanceTaskStateCount: (instanceId: number, index: number) => loc.sedInstanceTaskStateCount(instanceId, index),
  sedInstanceTaskStateName: (instanceId: number, index: number, stateIndex: number) =>
    loc.sedInstanceTaskStateName(instanceId, index, stateIndex),
  sedInstanceTaskStateUnit: (instanceId: number, index: number, stateIndex: number) =>
    loc.sedInstanceTaskStateUnit(instanceId, index, stateIndex),
  sedInstanceTaskState: (instanceId: number, index: number, stateIndex: number, start?: number, end?: number) =>
    loc.sedInstanceTaskState(instanceId, index, stateIndex, start, end),
  sedInstanceTaskRateCount: (instanceId: number, index: number) => loc.sedInstanceTaskRateCount(instanceId, index),
  sedInstanceTaskRateName: (instanceId: number, index: number, rateIndex: number) =>
    loc.sedInstanceTaskRateName(instanceId, index, rateIndex),
  sedInstanceTaskRateUnit: (instanceId: number, index: number, rateIndex: number) =>
    loc.sedInstanceTaskRateUnit(instanceId, index, rateIndex),
  sedInstanceTaskRate: (instanceId: number, index: number, rateIndex: number, start?: number, end?: number) =>
    loc.sedInstanceTaskRate(instanceId, index, rateIndex, start, end),
  sedInstanceTaskConstantCount: (instanceId: number, index: number) =>
    loc.sedInstanceTaskConstantCount(instanceId, index),
  sedInstanceTaskConstantName: (instanceId: number, index: number, constantIndex: number) =>
    loc.sedInstanceTaskConstantName(instanceId, index, constantIndex),
  sedInstanceTaskConstantUnit: (instanceId: number, index: number, constantIndex: number) =>
    loc.sedInstanceTaskConstantUnit(instanceId, index, constantIndex),
  sedInstanceTaskConstant: (instanceId: number, index: number, constantIndex: number, start?: number, end?: number) =>
    loc.sedInstanceTaskConstant(instanceId, index, constantIndex, start, end),
  sedInstanceTaskComputedConstantCount: (instanceId: number, index: number) =>
    loc.sedInstanceTaskComputedConstantCount(instanceId, index),
  sedInstanceTaskComputedConstantName: (instanceId: number, index: number, computedConstantIndex: number) =>
    loc.sedInstanceTaskComputedConstantName(instanceId, index, computedConstantIndex),
  sedInstanceTaskComputedConstantUnit: (instanceId: number, index: number, computedConstantIndex: number) =>
    loc.sedInstanceTaskComputedConstantUnit(instanceId, index, computedConstantIndex),
  sedInstanceTaskComputedConstant: (
    instanceId: number,
    index: number,
    computedConstantIndex: number,
    start?: number,
    end?: number
  ) => loc.sedInstanceTaskComputedConstant(instanceId, index, computedConstantIndex, start, end),
  sedInstanceTaskAlgebraicVariableCount: (instanceId: number, index: number) =>
    loc.sedInstanceTaskAlgebraicVariableCount(instanceId, index),
  sedInstanceTaskAlgebraicVariableName: (instanceId: number, index: number, algebraicVariableIndex: number) =>
    loc.sedInstanceTaskAlgebraicVariableName(instanceId, index, algebraicVariableIndex),
  sedInstanceTaskAlgebraicVariableUnit: (instanceId: number, index: number, algebraicVariableIndex: number) =>
    loc.sedInstanceTaskAlgebraicVariableUnit(instanceId, index, algebraicVariableIndex),
  sedInstanceTaskAlgebraicVariable: (
    instanceId: number,
    index: number,
    algebraicVariableIndex: number,
    start?: number,
    end?: number
  ) => loc.sedInstanceTaskAlgebraicVariable(instanceId, index, algebraicVariableIndex, start, end)
});
