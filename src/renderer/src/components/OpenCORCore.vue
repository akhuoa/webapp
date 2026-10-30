<template>
  <div class="opencor-shadow-root" :class="[theme.useDarkMode() ? 'opencor-dark-mode' : 'opencor-light-mode', hostFont ? 'opencor-host-font' : '']">
    <SafeBlockUIWidget ref="safeBlockUiRef" class="opencor" :class="isFullWebApp ? 'with-main-menu' : ''"
      :blocked="compBlockUiEnabled"
      @click="activateInstance"
      @focus="activateInstance"
      @focusin="activateInstance"
      @keydown="activateInstance"
      @mousedown="activateInstance"
    >
      <ToastWidget :id="toastId" :class="compIsActiveApp ? 'visible' : 'invisible'"
        :group="toastId"
        :pt:root:style="{ position: 'absolute' }"
      />
      <BackgroundComponent v-show="compBackgroundVisible" />
      <IssuesView v-if="compIssues.length" class="m-4" style="height: calc(100% - 2rem);" :issues="compIssues" />
      <div v-else class="h-full flex flex-col"
        @dragenter="onDragEnter"
        @dragover.prevent
        @drop.prevent="onDrop"
        @dragleave="onDragLeave"
      >
        <input ref="filesRef" type="file" multiple style="display: none;" @change="onChange" />
        <Transition
          enter-active-class="transition-opacity duration-200"
          leave-active-class="transition-opacity duration-200"
          enter-from-class="opacity-0"
          enter-to-class="opacity-100"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <DragNDropComponent v-if="dragAndDropCounter" />
        </Transition>
        <MainMenu ref="mainMenuRef" v-if="isFullWebApp"
          :hasFiles="hasFiles"
          @about="onAboutMenu"
          @open="onOpenMenu"
          @openRemote="onOpenRemoteMenu"
          @openSampleLorenz="onOpenSampleLorenzMenu"
          @close="onCloseMenu"
          @closeAll="onCloseAllMenu"
          @settings="onSettingsMenu"
          @updateAvailable="onUpdateAvailable"
        />
        <!-- TODO: enable once our GitHub integration is fully ready.
        <div v-if="firebaseConfig && !omex">
          <div class="absolute top-1 right-1 z-999">
            <Button icon="pi pi-github" outlined severity="secondary" :class="octokit ? 'connected-to-github' : 'disconnected-from-github'" rounded @click="onGitHubButtonClick" />
          </div>
          <YesNoQuestionDialog
            v-model:visible="disconnectFromGitHubVisible"
            title="Disconnect from GitHub..."
            question="You are about to disconnect from GitHub. Do you want to proceed?"
            @yes="onDisconnectFromGitHub"
            @no="disconnectFromGitHubVisible = false"
          />
        </div>
        -->
        <ContentsComponent ref="contentsRef" class="grow min-h-0"
          @error="onError"
          @fileClosed="onFileClosed"
          @fileOpened="onFileOpened"
          @simulationData="emitSimulationData"
        />
        <BlockingMessageComponent v-show="initialisingOpencorMessageVisible" message="Initialising OpenCOR..." :progress="initialisation.progress.value" />
        <BlockingMessageComponent v-if="loadingModelMessageVisible" message="Loading model..." />
        <BlockingMessageComponent v-show="loadingExternalDataVisible" message="Loading external data..." />
        <BlockingMessageComponent v-show="progressMessageVisible" :message="progressMessageMessage" :progress="progressMessageProgress" />
        <OkMessageDialog v-model:visible="updateErrorVisible"
          :title="updateErrorTitle"
          :message="updateErrorIssue"
          @ok="onUpdateErrorDialogClose"
        />
        <YesNoQuestionDialog v-model:visible="desktopUpdateAvailableVisible"
          title="Check for Updates..."
          :question="'Version ' + updateVersion + ' is available. Do you want to download it and install it?'"
          @yes="onDownloadAndInstall"
          @no="desktopUpdateAvailableVisible = false"
        />
        <UpdateDownloadProgressDialog v-model:visible="updateDownloadProgressVisible"
          :percent="updateDownloadPercent"
        />
        <OkMessageDialog v-model:visible="updateNotAvailableVisible"
          title="Check for Updates..."
          message="No updates are available at this time."
          @ok="updateNotAvailableVisible = false"
        />
        <OpenRemoteDialog v-model:visible="openRemoteVisible"
          @openRemote="onOpenRemote"
          @close="openRemoteVisible = false"
        />
        <SettingsDialog v-model:visible="settingsVisible"
          @close="settingsVisible = false"
        />
        <YesNoQuestionDialog v-model:visible="resetAllVisible"
          title="Reset All..."
          question="You are about to reset all of your settings. Do you want to proceed?"
          severity="danger"
          @yes="onResetAll"
          @no="resetAllVisible = false"
        />
        <AboutDialog v-model:visible="aboutVisible"
          @close="aboutVisible = false"
        />
        <UpdateAvailableDialog v-model:visible="webUpdateAvailableVisible"
          @close="webUpdateAvailableVisible = false"
        />
      </div>
    </SafeBlockUIWidget>
  </div>
</template>

<script setup lang="ts">
/* TODO: enable once our GitHub integration is fully ready.
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { Octokit } from 'octokit';
*/
import { useToast } from 'primevue/usetoast';
import * as vue from 'vue';

import type {
  IOpenCOREmits,
  IOpenCORExternalDataEvent,
  IOpenCORProps,
  IOpenCORSimulationDataEvent,
  OpenCORTheme
} from '../../index';

import * as common from '../common/common';
import { FULL_URI_SCHEME, LONG_DELAY, SHORT_DELAY, TOAST_LIFE } from '../common/constants';
import { electronApi } from '../common/electronApi';
/* TODO: enable once our GitHub integration is fully ready.
import firebaseConfig, { missingFirebaseKeys } from '../common/firebaseConfig';
*/
import * as initialisation from '../common/initialisation';
import * as locCommon from '../common/locCommon';
import { settings } from '../common/settings';
import { useShadowCompat } from '../common/shadowCompat';
import { useShadowStyles } from '../common/shadowStyles';
import * as version from '../common/version';
import { useViewRegistry, ViewCategory } from '../common/viewRegistry';
import * as vueCommon from '../common/vueCommon';
import ContentsComponent from '../components/ContentsComponent.vue';
import { provideOpenCORContext } from '../components/OpenCORContext';
import { provideOpenCORProgressMessage } from '../components/OpenCORProgressMessage';
import { provideOpenCORToast } from '../components/OpenCORToast';
import * as locApi from '../libopencor/locApi';

import { provideDialogState } from './dialogs/BaseDialog.vue';
import IssuesView from './views/IssuesView.vue';
import SimulationExperimentInteractiveView from './views/SimulationExperimentInteractiveView.vue';
import SimulationExperimentStandardView from './views/SimulationExperimentStandardView.vue';
import SafeBlockUIWidget from './widgets/SafeBlockUIWidget.vue';
import ToastWidget from './widgets/ToastWidget.vue';
import MainMenu from './MainMenu.vue';

const props = defineProps<IOpenCORProps>();

const emit = defineEmits<IOpenCOREmits>();

const contentsRef = vue.ref<InstanceType<typeof ContentsComponent> | null>(null);

// Methods to handle external data.

const addExternalData = (csv: string, voiExpression: string | undefined, modelParameters: string[]): void => {
  const contents = contentsRef.value;

  if (!contents) {
    emit('externalData', {
      type: 'issue',
      csv,
      issues: ['No contents available.']
    });

    return;
  }

  const isRemoteExternalData = common.isUrl(csv);

  if (isRemoteExternalData) {
    ++externalDataLoadsCount.value;

    loadingExternalDataVisible.value = true;
  }

  contents
    .addExternalData(csv, voiExpression, modelParameters)
    .then((res: IOpenCORExternalDataEvent) => {
      emit('externalData', res);
    })
    .finally(() => {
      if (isRemoteExternalData) {
        --externalDataLoadsCount.value;

        loadingExternalDataVisible.value = externalDataLoadsCount.value > 0;
      }
    });
};

// Methods to handle simulation data tracking.

const trackedSimulationData = vue.ref<string[]>([]);

const trackSimulationData = (modelParameters: string[]): void => {
  if (!props.omex) {
    return;
  }

  for (const modelParameter of modelParameters) {
    if (!trackedSimulationData.value.includes(modelParameter)) {
      trackedSimulationData.value.push(modelParameter);
    }
  }

  emitSimulationData();
};

const untrackSimulationData = (modelParameters: string[]): void => {
  if (!props.omex) {
    return;
  }

  trackedSimulationData.value = trackedSimulationData.value.filter((mp) => !modelParameters.includes(mp));
};

const untrackAllSimulationData = (): void => {
  if (!props.omex) {
    return;
  }

  trackedSimulationData.value = [];
};

const emitSimulationData = (): void => {
  if (!trackedSimulationData.value.length) {
    return;
  }

  const contents = contentsRef.value;

  if (!contents) {
    emit('simulationData', {
      type: 'issue',
      simulationData: common.emptySimulationData(trackedSimulationData.value),
      issues: ['No contents available.']
    });

    return;
  }

  contents.simulationData(trackedSimulationData.value).then((res: IOpenCORSimulationDataEvent) => {
    emit('simulationData', res);
  });
};

// Methods to handle files.

const onFileOpened = (filePath: string): void => {
  emit('file', { type: 'opened', filePath, issues: [] });
};

const onFileClosed = (filePath: string): void => {
  emit('file', { type: 'closed', filePath, issues: [] });
};

// Exposed methods.

defineExpose({
  // Simulation-only methods.

  addExternalData,
  trackSimulationData,
  untrackSimulationData,
  untrackAllSimulationData
});

// Internal methods.

const { isDialogActive } = provideDialogState();

const safeBlockUiRef = vue.ref<InstanceType<typeof SafeBlockUIWidget> | null>(null);
const mainMenuRef = vue.ref<InstanceType<typeof MainMenu> | null>(null);
const filesRef = vue.shallowRef<HTMLElement | null>(null);
const issues = vue.ref<locApi.IIssue[]>([]);
const compIssues = vue.computed<locApi.IIssue[]>(() => {
  return [...initialisation.issues.value, ...issues.value];
});
const activeInstanceUid = vueCommon.activeInstanceUid();
const connectingToGitHub = vue.ref<boolean>(false);
/* TODO: enable once our GitHub integration is fully ready.
const octokit = vue.ref<Octokit | null>(null);
*/
const initialisingOpencorMessageVisible = vue.ref<boolean>(true);
const loadingModelMessageVisible = vue.ref<boolean>(false);
const remoteModelLoadsCount = vue.ref<number>(0);
const loadingExternalDataVisible = vue.ref<boolean>(false);
const externalDataLoadsCount = vue.ref<number>(0);

// Keep track of which instance of OpenCOR is currently active.

const activateInstance = (): void => {
  activeInstanceUid.value = crtInstanceUid;
};

const compIsActiveApp = vue.computed<boolean>(() => {
  return activeInstanceUid.value === crtInstanceUid;
});

// Keep track of what needs to be cleaned up when we get unmounted (e.g., when OpenCOR is used as a library or during
// development with hot module replacement), i.e. our Electron API listeners (which would otherwise keep us alive and
// get called for an unmounted instance), our timers, and our watchers that are not bound to our component.

const cleanups: (() => void)[] = [];

const trackCleanup = (cleanup: (() => void) | undefined): void => {
  if (cleanup) {
    cleanups.push(cleanup);
  }
};

const setTrackedTimeout = (callback: () => void, delay: number): void => {
  const timeoutId = window.setTimeout(callback, delay);

  trackCleanup(() => {
    window.clearTimeout(timeoutId);
  });
};

vue.onUnmounted(() => {
  for (const cleanup of cleanups) {
    cleanup();
  }

  cleanups.length = 0;
});

// Enable/disable the UI from Electron.

const electronUiEnabled = vue.ref<boolean>(true);

trackCleanup(
  electronApi?.onEnableDisableUi((enable: boolean) => {
    electronUiEnabled.value = enable;

    // Note: our main process enables/disables our main menu itself before letting us know, but whether our main menu
    //       should be enabled also depends on our own UI (see compUiEnabled below), so we enable/disable it accordingly
    //       (our watcher below wouldn't do it if compUiEnabled didn't change, e.g., if our UI is still blocked).

    common.enableDisableMainMenu(compUiEnabled.value);
  })
);

// Provide access to our progress message features.
// Note: this must be done before compBlockUiEnabled is computed below since it relies on progressMessageVisible.

const {
  visible: progressMessageVisible,
  message: progressMessageMessage,
  progress: progressMessageProgress
} = provideOpenCORProgressMessage();

// Determine whether the component UI should be blocked/enabled.
// Note: compBlockUiEnabled is used to determine whether PrimeVue's BlockUI component should be enabled, whereas
//       compUiEnabled is used to determine whether the UI should be enabled (it checks whether various dialogs are
//       visible since those dialogs block the UI). Whether a dialog is visible or not is tracked in compUiEnabled
//       rather than compBlockUiEnabled because we don't want to show the BlockUI's overlay when a dialog is open
//       since a dialog already has some overlaying effect and the BlockUI's overlay would just make things look darker
//       and worse.

const compBlockUiEnabled = vue.computed<boolean>(() => {
  return (
    !electronUiEnabled.value ||
    initialisingOpencorMessageVisible.value ||
    loadingModelMessageVisible.value ||
    loadingExternalDataVisible.value ||
    progressMessageVisible.value ||
    connectingToGitHub.value
  );
});

const compUiEnabled = vue.computed<boolean>(() => {
  return !compBlockUiEnabled.value && !isDialogActive.value;
});

// Enable/disable our main menu (in OpenCOR) whenever our UI gets enabled/disabled.
// Note: our main menu must not be usable while our UI is blocked (e.g., while a remote model is being loaded) or while
//       a dialog is open. Local files, however, don't block our UI while they are being opened, so a local file may get
//       closed while it is being opened as part of several files (see openFiles()), something that
//       ContentsComponent.openFile() handles.

vue.watch(
  compUiEnabled,
  (newCompUiEnabled: boolean) => {
    common.enableDisableMainMenu(newCompUiEnabled);
  },
  { immediate: true }
);

// Remove any leftover SafeBlockUIWidget masks when unblocking.
// Note: this is to ensure that we don't end up with leftover masks if the block event is emitted multiple times before
//       the unblock event is emitted, which can lead to multiple masks being created and not properly removed.

vue.watch(
  compBlockUiEnabled,
  (newCompBlockUiEnabled: boolean) => {
    if (!newCompBlockUiEnabled) {
      const safeBlockUi = safeBlockUiRef.value as unknown as InstanceType<typeof SafeBlockUIWidget> | null;

      if (!safeBlockUi) {
        return;
      }

      safeBlockUi.cleanupMasks();
    }
  },
  { immediate: true }
);

// Determine whether we are running the full Web app (i.e. not in isolation).

const isFullWebApp = vue.computed<boolean>(() => {
  return !electronApi && !props.omex;
});

// Determine whether the background should be visible.

const compBackgroundVisible = vue.computed<boolean>(() => {
  return (initialisingOpencorMessageVisible.value || loadingModelMessageVisible.value) && !!props.omex;
});

// Get the UID of our instance.

const crtInstance = vue.getCurrentInstance();
const crtInstanceUid = String(crtInstance?.uid);

// Get ready to render ourselves within our shadow root, i.e. inject our styles into it and restore the behaviour that
// code relying on the host document expects (see shadowCompat.ts).
// Note: our styles don't apply to our shadow host, which is in the host document, so we let a host application know
//       about our theme and whether we use its font through some data attributes on our shadow host (e.g., so that our
//       Web app can use our theme for its body, see index.html).

const host = vue.useHost();
const shadowRoot = vue.useShadowRoot();

useShadowStyles(shadowRoot);
useShadowCompat(host, shadowRoot);

// Set our theme.
// Note #1: the user can only change our theme if none was given to us and we are not running in isolation (i.e. if we
//          are running the desktop version of OpenCOR or the full Web app), in which case we use the theme from our
//          settings.
// Note #2: a host application may change our theme at any time (e.g., when the user switches it between light mode and
//          dark mode), hence we watch it.

const themeCanBeChanged = props.theme === undefined && !props.omex;
const theme = vueCommon.provideTheme();

theme.setTheme(props.theme);

if (themeCanBeChanged) {
  settings.onInitialised(() => {
    theme.setTheme(settings.general.theme);
  });
}

vue.watch(
  () => props.theme,
  (newTheme: OpenCORTheme | undefined) => {
    if (newTheme !== undefined) {
      theme.setTheme(newTheme);
    }
  }
);

vue.watchEffect(() => {
  if (host) {
    host.dataset.opencorTheme = theme.useDarkMode() ? 'dark' : 'light';
  }
});

// Use the font of our host application, if requested.
// Note: this only applies to our UI in general, not to our graphs, which always use their own font (see
//       GraphPanelWidget.vue), so that their layout doesn't depend on the font of a host application.

vue.watchEffect(() => {
  host?.toggleAttribute('data-opencor-host-font', !!props.hostFont);
});

// Provide our context to our components.

provideOpenCORContext({
  isActiveApp: compIsActiveApp,
  uiEnabled: compUiEnabled,
  simulationOnly: vue.computed<boolean>(() => {
    return !!props.omex;
  }),
  themeCanBeChanged
});

// Get ready to show toasts and provide a helper to show them that ensures that the proper group id is used and that the
// instance becomes active before the message is pushed.

const toast = useToast();
const toastId = vue.ref(`opencorToast${crtInstanceUid}`);

const addToast = (options: Parameters<typeof toast.add>[0]) => {
  activateInstance();

  toast.add({ ...options, group: toastId.value });
};

provideOpenCORToast(addToast);

// Finish initialising OpenCOR.

let postInitialisationDone = false;

vue.watch(
  initialisation.done,
  async (newInitialisationDone: boolean) => {
    if (newInitialisationDone && !postInitialisationDone) {
      postInitialisationDone = true;

      // Now, we can hide the loading message (but after a long delay so that the user gets a chance to see that the
      // initialisation has reached 100%).

      await common.sleep(LONG_DELAY);

      // Let our main process know that we are ready, i.e. that we have registered our listeners and that we can now
      // open files, handle actions, etc.
      // Note #1: we don't do this if our initialisation failed since we wouldn't be able to open files, handle actions,
      //          etc. anyway.
      // Note #2: our main process may then ask us to open some files (e.g., the files to reopen or those passed on the
      //          command line). Its requests reach us before its reply and, for a remote file, our loading message is
      //          shown straight away. So, we wait for that reply before hiding our initialising message, so that our UI
      //          doesn't get briefly unblocked in between (and our main menu briefly enabled, see compUiEnabled).

      try {
        await electronApi?.rendererReady();
      } catch (error: unknown) {
        console.error(
          'OpenCOR: failed to let the main process know that the renderer is ready:',
          common.formatError(error)
        );
      }

      initialisingOpencorMessageVisible.value = false;

      // We are all done, so let's start checking for a newer version of OpenCOR, but only if we are running the Web app
      // and not in isolation mode (i.e. with a COMBINE archive) since in those cases we don't want to let the user know
      // about a newer version of OpenCOR.

      if (isFullWebApp.value) {
        version.startCheck();
      }
    }
  },
  { immediate: true }
);

vue.watch(
  initialisation.failed,
  (newInitialisationFailed: boolean) => {
    if (newInitialisationFailed) {
      initialisingOpencorMessageVisible.value = false;
    }
  },
  { immediate: true }
);

/* TODO: enable once our GitHub integration is fully ready.
// Initialise Firebase.
// Note: we check whether a Firebase app is already initialised to avoid issues when hot-reloading during development
//       and/or using OpenCOR as a Vue component within another application that also uses Firebase.

if (firebaseConfig) {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
} else if (!props.omex) {
  const items = missingFirebaseKeys();
  const formatList = (items: string[]): string => {
    if (items.length === 1) {
      return `${items[0]}`;
    }

    if (items.length === 2) {
      return `${items[0]} and ${items[1]}`;
    }

    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
  };

  console.warn(
    `OpenCOR: the Firebase configuration is missing. Please ensure that the following environment variables are set: ${formatList(items)}.`
  );
}

loadGitHubAccessToken();
*/

// Handle an external request, i.e. a request that comes from outside of our UI (e.g., a file opened from the file
// explorer, from another instance of OpenCOR, or through an opencor:// link).
// Note: a dialog is modal, so an external request must wait for all our dialogs to be closed. Otherwise, a file could,
//       for instance, get opened (and selected) while a dialog is open in the current file tab, hiding that dialog and
//       leaving our UI disabled. So, we queue our external requests and handle them, in order, once no dialog is open.
//       Also, an external request may open a dialog (e.g., opencor://openAboutDialog), so we wait for our UI to be
//       updated after handling an external request to know whether we can handle the next one.

const pendingExternalRequests: (() => void)[] = [];
let handlingPendingExternalRequests = false;

const handlePendingExternalRequests = async (): Promise<void> => {
  if (handlingPendingExternalRequests) {
    return;
  }

  handlingPendingExternalRequests = true;

  try {
    while (pendingExternalRequests.length && !isDialogActive.value) {
      pendingExternalRequests.shift()?.();

      await vue.nextTick();
    }
  } finally {
    handlingPendingExternalRequests = false;
  }
};

const handleExternalRequest = (externalRequest: () => void): void => {
  pendingExternalRequests.push(externalRequest);

  void handlePendingExternalRequests();
};

vue.watch(isDialogActive, (newIsDialogActive: boolean) => {
  if (!newIsDialogActive) {
    void handlePendingExternalRequests();
  }
});

// Handle an action.

trackCleanup(
  electronApi?.onAction((action: string) => {
    handleExternalRequest(() => {
      handleAction(action);
    });
  })
);

const handleAction = (action: string): void => {
  const isAction = (actionName: string, expectedActionName: string): boolean => {
    return actionName.localeCompare(expectedActionName, undefined, { sensitivity: 'base' }) === 0;
  };

  const index = action.indexOf('/');
  const actionName = index !== -1 ? action.substring(0, index) : action;
  const actionArguments = index !== -1 ? action.substring(index + 1) : '';

  if (isAction(actionName, 'openAboutDialog')) {
    onAboutMenu();
  } else if (isAction(actionName, 'openSettingsDialog')) {
    onSettingsMenu();
  } else {
    const filePaths = actionArguments.split('%7C');

    if (
      (isAction(actionName, 'openFile') && filePaths.length === 1) ||
      (isAction(actionName, 'openFiles') && filePaths.length > 1)
    ) {
      openFiles(filePaths);
    } else {
      addToast({
        severity: 'error',
        summary: 'Handling an action',
        detail: `${action}\n\nThe action could not be handled.`,
        life: TOAST_LIFE
      });
    }
  }
};

// Enable/disable some menu items.
// Note: we let our main process know straight away whether we have files since our main menu may still reflect a
//       previous instance of our renderer (e.g., if we got reloaded while some files were open).

const hasFiles = vue.computed<boolean>(() => {
  return contentsRef.value?.hasFiles() ?? false;
});

vue.watch(
  hasFiles,
  (newHasFiles: boolean) => {
    electronApi?.enableDisableFileCloseAndCloseAllMenuItems(newHasFiles);
  },
  { immediate: true }
);

// Auto update.

trackCleanup(
  electronApi?.onCheckForUpdates(() => {
    electronApi?.checkForUpdates(false);
  })
);

const updateErrorVisible = vue.ref<boolean>(false);
const updateErrorTitle = vue.ref<string>('');
const updateErrorIssue = vue.ref<string>('');

const onUpdateErrorDialogClose = (): void => {
  updateErrorVisible.value = false;
  updateDownloadProgressVisible.value = false;
};

const desktopUpdateAvailableVisible = vue.ref<boolean>(false);
const updateDownloadProgressVisible = vue.ref<boolean>(false);
const updateVersion = vue.ref<string>('');
const updateDownloadPercent = vue.ref<number>(0);

trackCleanup(
  electronApi?.onUpdateAvailable((version: string) => {
    desktopUpdateAvailableVisible.value = true;
    updateVersion.value = version;
  })
);

const onDownloadAndInstall = (): void => {
  updateDownloadPercent.value = 0; // Just to be on the safe side.
  updateDownloadProgressVisible.value = true;
  desktopUpdateAvailableVisible.value = false;

  electronApi?.downloadAndInstallUpdate();
};

trackCleanup(
  electronApi?.onUpdateDownloadError((issue: string) => {
    updateErrorTitle.value = 'Downloading Update...';
    updateErrorIssue.value = `An error occurred while downloading the update (${common.formatMessage(issue, false)}).`;
    updateErrorVisible.value = true;
  })
);

trackCleanup(
  electronApi?.onUpdateInstallError((issue: string) => {
    updateErrorTitle.value = 'Installing Update...';
    updateErrorIssue.value = `An error occurred while installing the update (${common.formatMessage(issue, false)}).`;
    updateErrorVisible.value = true;
  })
);

// Note: we show our update download progress dialog in case it is not already visible, i.e. if we have been reloaded
//       (e.g., after a crash) while an update was being downloaded or installed (see resendUpdateState() in
//       MainWindow.ts).

trackCleanup(
  electronApi?.onUpdateDownloadProgress((percent: number) => {
    updateDownloadPercent.value = percent;
    updateDownloadProgressVisible.value = true;
  })
);

trackCleanup(
  electronApi?.onUpdateDownloaded(() => {
    updateDownloadPercent.value = 100; // Just to be on the safe side.

    electronApi?.installUpdateAndRestart();
  })
);

const updateNotAvailableVisible = vue.ref<boolean>(false);

trackCleanup(
  electronApi?.onUpdateNotAvailable(() => {
    updateNotAvailableVisible.value = true;
  })
);

trackCleanup(
  electronApi?.onUpdateCheckError((issue: string) => {
    updateErrorTitle.value = 'Checking For Updates...';
    updateErrorIssue.value = `An error occurred while checking for updates (${common.formatMessage(issue, false)}).`;
    updateErrorVisible.value = true;
  })
);

// Handle errors.

const onError = (message: string): void => {
  addToast({
    severity: 'error',
    summary: 'Error',
    detail: message,
    life: TOAST_LIFE
  });
};

// About dialog.

const aboutVisible = vue.ref<boolean>(false);

trackCleanup(
  electronApi?.onAbout(() => {
    onAboutMenu();
  })
);

const onAboutMenu = (): void => {
  if (props.omex) {
    return;
  }

  aboutVisible.value = true;
};

// Settings dialog.

const settingsVisible = vue.ref<boolean>(false);

trackCleanup(
  electronApi?.onSettings(() => {
    onSettingsMenu();
  })
);

const onSettingsMenu = (): void => {
  if (props.omex) {
    return;
  }

  settingsVisible.value = true;
};

// Update available dialog.

const webUpdateAvailableVisible = vue.ref(false);

const onUpdateAvailable = () => {
  webUpdateAvailableVisible.value = true;
};

// Open a file.

// The files that are being opened, keyed by their canonical path, each with a promise that gets resolved once the file
// has been opened (or not).

interface IFileBeingOpened {
  promise: Promise<void>;
  resolve: () => void;
}

const filesBeingOpened = new Map<string, IFileBeingOpened>();

const fileBeingOpened = (canonicalFilePath: string): void => {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  filesBeingOpened.set(canonicalFilePath, { promise, resolve });
};

const fileNoLongerBeingOpened = (canonicalFilePath: string): void => {
  filesBeingOpened.get(canonicalFilePath)?.resolve();
  filesBeingOpened.delete(canonicalFilePath);
};

interface IFileInfo {
  alreadyOpen: boolean;
  beingOpened?: Promise<void>;
  // Note: if the file is already being opened (i.e. it doesn't have a file tab yet), then a promise that gets resolved
  //       once the file has been opened (or not).
  file: locApi.File | null;
  filePath: string;
  canonicalFilePath: string;
}

// A helper function to describe a file for which we don't (yet) have a file path.

const fileDescription = (fileFilePathOrFileContents: string | Uint8Array | File): string => {
  return typeof fileFilePathOrFileContents === 'string'
    ? fileFilePathOrFileContents
    : fileFilePathOrFileContents instanceof File
      ? fileFilePathOrFileContents.name
      : 'Unknown file';
};

// A helper function to report an issue with a file that couldn't be opened.

const reportFileIssue = (filePath: string, issueMessage: string, canonicalFilePath: string = ''): void => {
  // Let our main process know about the issue first since it may be waiting for the file (e.g., if the file is being
  // reopened at startup, see MainWindow.fileOpenedOrNot()), so that it doesn't wait forever should reporting the issue
  // to the user fail.
  // Note: the canonical path of the file may not be known (e.g., if libOpenCOR couldn't determine it), in which case we
  //       use the path that was used to (try to) open the file.

  electronApi?.fileIssue(filePath, canonicalFilePath || filePath);

  if (props.omex) {
    void vue.nextTick().then(() => {
      issues.value.push({ type: locApi.EIssueType.ERROR, description: issueMessage });
    });
  } else {
    // Note: a data URL can be very long, so we don't show it (the issue message says that it is a data URL anyway).

    addToast({
      severity: 'error',
      summary: 'Opening a file',
      detail:
        filePath.startsWith('data:') || filePath.startsWith('#data:') ? issueMessage : `${filePath}\n\n${issueMessage}`,
      life: TOAST_LIFE
    });
  }

  emit('file', { type: 'issue', filePath, issues: [issueMessage] });
};

const processFile = async (fileFilePathOrFileContents: string | Uint8Array | File): Promise<IFileInfo | null> => {
  // Check whether we were passed a ZIP-CellML data URL.

  let cellmlDataUrlFileName: string = '';
  let omexDataUrlCounter: number = 0;

  const zipCellmlDataUriInfo = await locCommon.zipCellmlDataUrl(fileFilePathOrFileContents);

  if (zipCellmlDataUriInfo.res) {
    if (zipCellmlDataUriInfo.error) {
      reportFileIssue(fileDescription(fileFilePathOrFileContents), zipCellmlDataUriInfo.error);

      return null;
    }

    // Note: we only use the name of the CellML file, not its path within the ZIP file. Indeed, its path may contain
    //       path separators that JSZip doesn't resolve (e.g., "..\model.cellml"), in which case the canonical path of
    //       our CellML file could end up without its prefix (e.g., "model.cellml" rather than "CellML #1/model.cellml"
    //       on Windows), i.e. it wouldn't be recognised as a data URL file anymore (see common.isDataUrlFileName()).

    const zipCellmlFileName = zipCellmlDataUriInfo.fileName as string;

    cellmlDataUrlFileName = `${common.CELLML_PREFIX}${common.nextCellmlDataUrlNumber()}/${common.fileName(zipCellmlFileName) || zipCellmlFileName}`;
    fileFilePathOrFileContents = zipCellmlDataUriInfo.data as Uint8Array;
  } else {
    // Check whether we were passed a COMBINE archive data URL.

    const combineArchiveDataUriInfo = locCommon.combineArchiveDataUrl(fileFilePathOrFileContents);

    if (combineArchiveDataUriInfo.res) {
      if (combineArchiveDataUriInfo.error) {
        reportFileIssue(fileDescription(fileFilePathOrFileContents), combineArchiveDataUriInfo.error);

        return null;
      }

      omexDataUrlCounter = common.nextOmexDataUrlNumber();
      fileFilePathOrFileContents = combineArchiveDataUriInfo.data as Uint8Array;
    }
  }

  // Check whether the file is already open or being opened and if so then select it.
  // Note: a file may be opened more than once at the same time (e.g., by dropping the same file twice or by selecting
  //       the same sample file twice). Since a file is only considered open once it has a file tab, we also need to
  //       keep track of the files that are being opened, so that we don't end up with several file tabs for the same
  //       file (and, with the C++ version of libOpenCOR, several File objects sharing, and therefore releasing, the
  //       same native file). Also, a file may be referred to using different paths (e.g., through a symbolic link),
  //       hence we keep track of the canonical path of the files that are being opened (our contents component does
  //       the same for the files that are open, see ContentsComponent.findFileTab()).
  // Note: this may fail (e.g., if the file path cannot be determined), in which case we report the issue so that the
  //       user knows about it and our main process doesn't wait for the file forever (e.g., if the file is being
  //       reopened at startup, see MainWindow.fileOpenedOrNot()).

  let filePath = '';
  let canonicalFilePath = '';
  let fileIsOpen = false;

  try {
    filePath = locCommon.filePath(fileFilePathOrFileContents, cellmlDataUrlFileName, omexDataUrlCounter);
    canonicalFilePath = locApi.fileManager.canonicalPath(filePath);
    fileIsOpen = contentsRef.value?.hasFile(filePath) ?? false;
  } catch (error: unknown) {
    reportFileIssue(
      filePath || fileDescription(fileFilePathOrFileContents),
      common.formatMessage(common.formatError(error))
    );

    return null;
  }

  const beingOpened = fileIsOpen ? undefined : filesBeingOpened.get(canonicalFilePath)?.promise;

  if (fileIsOpen || beingOpened) {
    return {
      alreadyOpen: true,
      beingOpened,
      file: null,
      filePath,
      canonicalFilePath
    };
  }

  fileBeingOpened(canonicalFilePath);

  // Retrieve a locApi.File object for the given file or file path.

  const isRemoteFilePath = common.isUrl(filePath);

  if (isRemoteFilePath) {
    ++remoteModelLoadsCount.value;

    loadingModelMessageVisible.value = true;
  }

  let file: locApi.File | null = null;
  let fileToBeOpened = false;

  try {
    file = await locCommon.file(fileFilePathOrFileContents, cellmlDataUrlFileName, omexDataUrlCounter);
    // Note: to retrieve the type of the file may fail (e.g., if libOpenCOR throws an exception), in which case we must
    //       release the file since nothing else would (see the catch block below).

    const fileType = file.type();

    if (
      fileType === locApi.EFileType.IRRETRIEVABLE_FILE ||
      (props.omex && fileType !== locApi.EFileType.COMBINE_ARCHIVE)
    ) {
      reportFileIssue(
        filePath,
        fileType === locApi.EFileType.IRRETRIEVABLE_FILE
          ? 'The file could not be retrieved.'
          : 'Only COMBINE archives are supported.',
        canonicalFilePath
      );

      file.release();

      return null;
    }

    fileToBeOpened = true;

    return {
      alreadyOpen: false,
      file,
      filePath,
      canonicalFilePath
    };
  } catch (error: unknown) {
    try {
      file?.release();
    } catch (error: unknown) {
      console.warn(`OpenCOR: failed to release file (${filePath}):`, common.formatError(error));
    }

    reportFileIssue(filePath, common.formatMessage(common.formatError(error)), canonicalFilePath);

    return null;
  } finally {
    // The file is no longer being opened, unless it is to be opened, in which case openFileInContents() will take care
    // of it.
    // Note: we do this here so that it gets done whatever happens (e.g., if reporting an issue fails). Otherwise, the
    //       file would be considered as being opened forever, i.e. it could never be opened again, and our main process
    //       might wait for it forever (see fileAlreadyOpen()).

    if (!fileToBeOpened) {
      fileNoLongerBeingOpened(canonicalFilePath);
    }

    if (isRemoteFilePath) {
      --remoteModelLoadsCount.value;

      loadingModelMessageVisible.value = remoteModelLoadsCount.value > 0;
    }
  }
};

const openFileInContents = async (
  file: locApi.File,
  canonicalFilePath: string,
  wait: boolean = false
): Promise<void> => {
  // Open the given file in our contents component or release it if we can't (e.g., we got unmounted in the meantime).
  // Note #1: to open a file may fail (e.g., if libOpenCOR throws an exception), in which case we report the issue and
  //          release the file, unless it got opened (i.e. it has a file tab), in which case it is now managed by our
  //          contents component. Either way, the issue doesn't stop other files from being opened.
  // Note #2: either way, the file is no longer being opened once we are done (see processFile()).

  const filePath = file.path();

  try {
    if (!contentsRef.value) {
      file.release();

      return;
    }

    await contentsRef.value.openFile(file, wait);
  } catch (error: unknown) {
    if (!contentsRef.value?.hasFile(filePath)) {
      file.release();
    }

    reportFileIssue(filePath, common.formatMessage(common.formatError(error)), canonicalFilePath);
  } finally {
    fileNoLongerBeingOpened(canonicalFilePath);
  }
};

const fileAlreadyOpen = async (fileInfo: IFileInfo, wait: boolean = false): Promise<void> => {
  // Let our main process know whether the file is open since it may be waiting for it (e.g., if the file is being
  // reopened at startup, see MainWindow.fileOpenedOrNot()), and select it.
  // Note: if the file is being opened, then we can only let our main process know once it has been opened (or not), in
  //       which case it will also have been selected (see ContentsComponent.openFile()). However, we must not wait for
  //       that here since we may be called from openFiles() and the file may be opened after us in its chain, in which
  //       case we would wait forever.

  const beingOpened = fileInfo.beingOpened;

  if (beingOpened) {
    void beingOpened.then(() => {
      if (contentsRef.value?.hasFile(fileInfo.filePath)) {
        electronApi?.fileOpened(fileInfo.filePath, fileInfo.canonicalFilePath);
      } else {
        electronApi?.fileIssue(fileInfo.filePath, fileInfo.canonicalFilePath);
      }
    });

    return;
  }

  electronApi?.fileOpened(fileInfo.filePath, fileInfo.canonicalFilePath);

  await contentsRef.value?.selectFile(fileInfo.filePath, wait);
};

const openProcessedFile = async (
  fileFilePathOrFileContents: string | Uint8Array | File,
  fileInfoPromise: Promise<IFileInfo | null>,
  wait: boolean
): Promise<void> => {
  // Open the given processed file (see processFile()) or select it if it is already open.
  // Note: we never reject. Indeed, processFile() and the functions we call report the issues that they come across, but
  //       should something unexpected go wrong, then we still need to report it so that the user knows about it, our
  //       main process doesn't wait for the file forever (e.g., if the file is being reopened at startup, see
  //       MainWindow.fileOpenedOrNot()), and the next files can still be opened (see openFiles()).

  let fileInfo: IFileInfo | null = null;

  try {
    fileInfo = await fileInfoPromise;

    if (!fileInfo) {
      return;
    }

    if (fileInfo.alreadyOpen) {
      await fileAlreadyOpen(fileInfo, wait);

      return;
    }

    if (fileInfo.file) {
      await openFileInContents(fileInfo.file, fileInfo.canonicalFilePath, wait);
    }
  } catch (error: unknown) {
    console.error('OpenCOR: an unexpected error occurred while opening a file:', common.formatError(error));

    reportFileIssue(
      fileInfo?.filePath || fileDescription(fileFilePathOrFileContents),
      common.formatMessage(common.formatError(error)),
      fileInfo?.canonicalFilePath
    );
  }
};

const openFile = (fileFilePathOrFileContents: string | Uint8Array | File): void => {
  void openProcessedFile(fileFilePathOrFileContents, processFile(fileFilePathOrFileContents), false);
};

const openFiles = (filesFilePathsOrFileContents: (string | Uint8Array | File)[]): void => {
  // Start processing all files in parallel but open their tabs in the original order.
  // Note: openProcessedFile() never rejects, so an issue with a file doesn't prevent the next files from being opened
  //       (and therefore from no longer being considered as being opened, see processFile()).

  const processedFiles = filesFilePathsOrFileContents.map((fileFilePathOrFileContents) => {
    return {
      fileFilePathOrFileContents,
      fileInfoPromise: processFile(fileFilePathOrFileContents)
    };
  });

  void processedFiles.reduce(async (previousFilesOpened, processedFile) => {
    await previousFilesOpened;

    await openProcessedFile(processedFile.fileFilePathOrFileContents, processedFile.fileInfoPromise, true);
  }, Promise.resolve());
};

// Open file(s) dialog.

const onChange = (event: Event): void => {
  // Open the selected file(s).

  const input = event.target as HTMLInputElement;

  if (input.files) {
    openFiles(Array.from(input.files));
  }

  // Reset the input.
  // Note: this is needed to ensure that selecting the same file(s) again will trigger the change event.

  input.value = '';
};

// Drag and drop.

const dragAndDropCounter = vue.ref<number>(0);

const onDragEnter = (event: DragEvent): void => {
  if (!compUiEnabled.value || props.omex) {
    return;
  }

  // Only react to external (file) drags, not internal ones (e.g., tab reorder drags).

  if (!event.dataTransfer?.types.includes('Files')) {
    return;
  }

  ++dragAndDropCounter.value;
};

const onDrop = (event: DragEvent): void => {
  if (!dragAndDropCounter.value) {
    return;
  }

  dragAndDropCounter.value = 0;

  const files = event.dataTransfer?.files;

  if (files) {
    openFiles(Array.from(files));
  }
};

const onDragLeave = (): void => {
  if (!dragAndDropCounter.value) {
    return;
  }

  dragAndDropCounter.value -= 1;
};

// Open.

trackCleanup(
  electronApi?.onOpen((filePath: string) => {
    handleExternalRequest(() => {
      openFile(filePath);
    });
  })
);

// Canonicalise some recent file paths for our main process.
// Note: our main process can't canonicalise a file path itself (only libOpenCOR can), so it asks us to do it for the
//       recent file paths that it couldn't get from us (see MainWindow.onRenderProcessGone()). A file path that can't
//       be canonicalised is left as it is.

trackCleanup(
  electronApi?.onCanonicaliseRecentFilePaths((filePaths: string[]) => {
    for (const filePath of filePaths) {
      try {
        const canonicalFilePath = locApi.fileManager.canonicalPath(filePath);

        if (canonicalFilePath !== filePath) {
          electronApi?.recentFilePathCanonicalised(filePath, canonicalFilePath);
        }
      } catch (error: unknown) {
        console.warn(`OpenCOR: failed to canonicalise a recent file path (${filePath}):`, common.formatError(error));
      }
    }
  })
);

const onOpenMenu = (): void => {
  if (props.omex) {
    return;
  }

  filesRef.value?.click();
};

// Open remote.

const openRemoteVisible = vue.ref<boolean>(false);

trackCleanup(
  electronApi?.onOpenRemote(() => {
    openRemoteVisible.value = true;
  })
);

const onOpenRemoteMenu = (): void => {
  if (props.omex) {
    return;
  }

  openRemoteVisible.value = true;
};

const onOpenRemote = (url: string): void => {
  // Note: no matter whether this is OpenCOR or OpenCOR's Web app, we always retrieve the file contents of a remote
  //       file. We could, in OpenCOR, rely on libOpenCOR to retrieve it for us, but this would block the UI. To
  //       retrieve the file here means that it is done asynchronously, which in turn means that the UI is not blocked
  //       and that we can show a spinning wheel to indicate that something is happening.

  openFile(url);
};

// Open sample Lorenz.

trackCleanup(
  electronApi?.onOpenSampleLorenz(() => {
    onOpenSampleLorenzMenu();
  })
);

const onOpenSampleLorenzMenu = (): void => {
  if (props.omex) {
    return;
  }

  openFile('https://github.com/opencor/webapp/raw/refs/heads/main/tests/models/ui/lorenz.omex');
};

// Close.

trackCleanup(
  electronApi?.onClose(() => {
    onCloseMenu();
  })
);

const onCloseMenu = (): void => {
  if (props.omex) {
    return;
  }

  contentsRef.value?.closeCurrentFile();
};

// Close all.

trackCleanup(
  electronApi?.onCloseAll(() => {
    onCloseAllMenu();
  })
);

const onCloseAllMenu = (): void => {
  if (props.omex) {
    return;
  }

  contentsRef.value?.closeAllFiles();
};

// Reset all.

const resetAllVisible = vue.ref<boolean>(false);

trackCleanup(
  electronApi?.onResetAll(() => {
    resetAllVisible.value = true;
  })
);

const onResetAll = (): void => {
  electronApi?.resetAll();
};

// Select.

trackCleanup(
  electronApi?.onSelect((filePath: string) => {
    handleExternalRequest(() => {
      contentsRef.value?.selectFile(filePath);
    });
  })
);

// A few things that can only be done when the component is mounted.

vue.onMounted(() => {
  // Make ourselves the active instance.

  setTrackedTimeout(() => {
    activateInstance();
  }, SHORT_DELAY);

  // Register our views with the view registry.
  // Note: this must be done in onMounted so that all components are available.

  const viewRegistry = useViewRegistry();

  viewRegistry.register({
    id: 'simulation-experiment-standard',
    category: ViewCategory.Simulation,
    label: 'Standard Simulation Experiment',
    icon: 'pi pi-chart-line',
    component: SimulationExperimentStandardView,
    fileTypes: [locApi.EFileType.CELLML_FILE, locApi.EFileType.SEDML_FILE, locApi.EFileType.COMBINE_ARCHIVE]
  });

  viewRegistry.register({
    id: 'simulation-experiment-interactive',
    category: ViewCategory.Simulation,
    label: 'Interactive Simulation Experiment',
    icon: 'pi pi-sliders-h',
    component: SimulationExperimentInteractiveView,
    fileTypes: [locApi.EFileType.CELLML_FILE, locApi.EFileType.SEDML_FILE, locApi.EFileType.COMBINE_ARCHIVE]
  });
});

// Track the height of our main menu.

let stopTrackingMainMenuHeight: (() => void) | null = null;

vue.onMounted(() => {
  if (!isFullWebApp.value) {
    return;
  }

  void vue.nextTick().then(() => {
    const mainMenuElement = (mainMenuRef.value as unknown as { $el: HTMLElement })?.$el;
    const safeBlockUiElement = (safeBlockUiRef.value as unknown as { $el: HTMLElement })?.$el;

    if (mainMenuElement && safeBlockUiElement) {
      stopTrackingMainMenuHeight = vueCommon.trackElementHeight(
        mainMenuElement,
        safeBlockUiElement,
        '--main-menu-height'
      );
    }
  });
});

vue.onBeforeUnmount(() => {
  if (stopTrackingMainMenuHeight) {
    stopTrackingMainMenuHeight();

    stopTrackingMainMenuHeight = null;
  }
});

// If a COMBINE archive is provided then open it (and then the Simulation Experiment view will be shown in isolation) or
// carry on as normal (i.e. the whole OpenCOR UI will be shown).

if (props.omex) {
  vue.watch(initialisingOpencorMessageVisible, (newInitialisingOpencorMessageVisible: boolean) => {
    if (!newInitialisingOpencorMessageVisible && props.omex) {
      openFile(props.omex);
    }
  });
} else {
  // A few additional things that can only be done when the component is mounted.

  vue.onMounted(() => {
    // Do what follows with a bit of a delay to give our background (with the OpenCOR logo) time to be renderered.

    setTrackedTimeout(() => {
      if (electronApi) {
        // Check for updates.
        // Note: the main process will actually check for updates if requested and if OpenCOR is packaged.

        electronApi.checkForUpdates(true);
      } else {
        // Handle the action passed to our Web app, if any.
        // Note #1: to use vue.nextTick() doesn't do the trick, so we have no choice but to use setTimeout().
        // Note #2: our watcher is created outside of our component's setup, so it is not automatically stopped when we
        //          get unmounted, hence we keep track of it.

        trackCleanup(
          vue.watch(initialisingOpencorMessageVisible, (newInitialisingOpencorMessageVisible: boolean) => {
            if (!newInitialisingOpencorMessageVisible && window.location.search) {
              // Retrieve the action from the URL.
              // Note: we also include the hash since it is used to pass a model that is encoded as a data URL.

              let action = window.location.search.substring(1);

              if (window.location.hash) {
                action += window.location.hash;
              }

              // Ensure that the URL is cleaned up.

              window.history.replaceState({}, document.title, window.location.pathname);

              if (action.startsWith(FULL_URI_SCHEME)) {
                handleAction(action.slice(FULL_URI_SCHEME.length));
              } else {
                addToast({
                  severity: 'error',
                  summary: 'Handling an action',
                  detail: `${action}\n\nThe action could not be handled.`,
                  life: TOAST_LIFE
                });
              }
            }
          })
        );
      }
    }, SHORT_DELAY);
  });
}

/* TODO: enable once our GitHub integration is fully ready.
// GitHub integration.

const disconnectFromGitHubVisible = vue.ref<boolean>(false);

const deleteGitHubAccessToken = async (silent: boolean = false): Promise<void> => {
  if (!electronApi) {
    return;
  }

  try {
    await electronApi.deleteGitHubAccessToken();
  } catch (error: unknown) {
    if (silent) {
      console.warn('OpenCOR: failed to remove the stored GitHub access token:', common.formatError(error));
    } else {
      toast.add({
        severity: 'warn',
        group: toastId.value,
        summary: 'Removing GitHub access token',
        detail: common.formatMessage(common.formatError(error)),
        life: TOAST_LIFE
      });
    }
  }
};

const loadGitHubAccessToken = async (): Promise<void> => {
  if (!electronApi || props.omex || !firebaseConfig) {
    return;
  }

  let gitHubAccessToken: string | null;

  try {
    gitHubAccessToken = await electronApi.loadGitHubAccessToken();
  } catch (error: unknown) {
    console.warn('OpenCOR: failed to load the GitHub access token:', common.formatError(error));

    return;
  }

  if (!gitHubAccessToken) {
    return;
  }

  connectingToGitHub.value = true;

  try {
    await checkGitHubAccessToken(gitHubAccessToken);
  } catch (error: unknown) {
    console.warn('OpenCOR: stored GitHub access token is no longer valid. Clearing it.', common.formatError(error));

    await deleteGitHubAccessToken(true);
  } finally {
    connectingToGitHub.value = false;
  }
};

const saveGitHubAccessToken = async (accessToken: string): Promise<void> => {
  if (!electronApi) {
    return;
  }

  try {
    const stored = await electronApi.saveGitHubAccessToken(accessToken);

    if (!stored) {
      addToast({
        severity: 'warn',
        summary: 'Remembering GitHub access token',
        detail: 'The token could not be stored securely, so you will need to sign in again next time.',
        life: TOAST_LIFE
      });
    }
  } catch (error: unknown) {
    addToast({
      severity: 'warn',
      summary: 'Remembering GitHub access token',
      detail: common.formatMessage(common.formatError(error)),
      life: TOAST_LIFE
    });
  }
};

const checkGitHubAccessToken = async (accessToken: string): Promise<void> => {
  const client = new Octokit({ auth: accessToken });
  const user = await client.rest.users.getAuthenticated();

  octokit.value = client;

  if (electronApi) {
    await saveGitHubAccessToken(accessToken);
  }

  try {
    const reposResponse = await client.rest.repos.listForAuthenticatedUser({ affiliation: 'owner' });

    console.log(`Repositories for user ${user.data.login}:`);

    for (const repo of reposResponse.data) {
      console.log(`- ${repo.name} (${repo.private ? 'private' : 'public'}): ${repo.html_url}`);
    }
  } catch (error: unknown) {
    console.warn(`OpenCOR: failed to retrieve repositories for user ${user.data.login}:`, common.formatError(error));
  }
};

const onDisconnectFromGitHub = async (): Promise<void> => {
  try {
    await firebase.auth().signOut();

    octokit.value = null;

    await deleteGitHubAccessToken();

    if (electronApi) {
      await electronApi.clearGitHubCache();
    }
  } catch (error: unknown) {
    addToast({
      severity: 'error',
      summary: 'GitHub sign-out',
      detail: common.formatMessage(common.formatError(error)),
      life: TOAST_LIFE
    });
  } finally {
    disconnectFromGitHubVisible.value = false;
  }
};

const onGitHubButtonClick = async (): Promise<void> => {
  if (octokit.value) {
    disconnectFromGitHubVisible.value = true;

    return;
  }

  connectingToGitHub.value = true;

  try {
    // Note: the signing with popup will generate some messages in the console:
    //         Cross-Origin-Opener-Policy policy would block the window.closed call.
    //       Apparently, there is no way to avoid these messages (see
    //       https://reddit.com/r/Firebase/comments/146zcld/crossoriginopenerpolicy_policy_would_block_the/ for
    //       instance).

    const gitHubAuthProvider = new firebase.auth.GithubAuthProvider();

    gitHubAuthProvider.addScope('repo');

    const res = await firebase.auth().signInWithPopup(gitHubAuthProvider);
    const credential = res.credential as firebase.auth.OAuthCredential | null;

    if (!credential?.accessToken) {
      throw new Error('GitHub OAuth flow did not return an access token.');
    }

    const accessToken = credential.accessToken;

    await checkGitHubAccessToken(accessToken);
  } catch (error: unknown) {
    addToast({
      severity: 'error',
      summary: 'GitHub sign-in',
      detail: common.formatMessage(common.formatError(error)),
      life: TOAST_LIFE
    });
  } finally {
    connectingToGitHub.value = false;
  }
}
*/
</script>

<style scoped>
.connected-to-github,
:deep(.connected-to-github .pi-github) {
  background-color: var(--p-green-100);
  border-color: var(--p-green-100);
  color: var(--p-green-600);
}

.connected-to-github:hover,
:deep(.connected-to-github:hover .pi-github) {
  background-color: var(--p-green-200) !important;
  border-color: var(--p-green-200) !important;
  color: var(--p-green-700);
}

.disconnected-from-github,
:deep(.disconnected-from-github .pi-github) {
  background-color: var(--p-red-100);
  border-color: var(--p-red-100);
  color: var(--p-red-600);
}

.disconnected-from-github:hover,
:deep(.disconnected-from-github:hover .pi-github) {
  background-color: var(--p-red-200) !important;
  border-color: var(--p-red-200) !important;
  color: var(--p-red-700);
}

.opencor-dark-mode .connected-to-github,
.opencor-dark-mode .opencor :deep(.connected-to-github .pi-github) {
  background-color: var(--p-green-800);
  border-color: var(--p-green-800);
  color: var(--p-green-300);
}

.opencor-dark-mode .connected-to-github:hover,
.opencor-dark-mode .opencor :deep(.connected-to-github:hover .pi-github) {
  background-color: var(--p-green-700) !important;
  border-color: var(--p-green-700) !important;
  color: var(--p-green-200);
}

.opencor-dark-mode .disconnected-from-github,
.opencor-dark-mode .opencor :deep(.disconnected-from-github .pi-github) {
  background-color: var(--p-red-800);
  border-color: var(--p-red-800);
  color: var(--p-red-300);
}

.opencor-dark-mode .disconnected-from-github:hover,
.opencor-dark-mode .opencor :deep(.disconnected-from-github:hover .pi-github) {
  background-color: var(--p-red-700) !important;
  border-color: var(--p-red-700) !important;
  color: var(--p-red-200);
}

.opencor {
  height: 100%;
  overflow: hidden;
}

:deep(.p-overlay-mask) {
  border-radius: 0;
}

.with-main-menu {
  :deep(.p-dialog-mask) {
    padding-top: var(--main-menu-height) !important;
  }

  :deep(.p-message) {
    margin-top: calc(0.5 * var(--main-menu-height)) !important;
  }
}
</style>
