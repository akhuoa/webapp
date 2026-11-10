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
        :pt="TOAST_PT"
        :onMouseEnter="onToastHover"
        :onMouseLeave="onToastHover"
      >
        <template #container="{ message, closeCallback }">
          <ToastMessageWidget :message="message" @close="closeCallback" />
        </template>
      </ToastWidget>
      <BackgroundComponent v-show="compBackgroundVisible" />
      <IssuesView v-if="compIssues.length" class="m-4" style="height: calc(100% - 2rem);" :issues="compIssues" />
      <div v-else class="h-full flex flex-col"
        @dragenter="onDragEnter"
        @dragover="onDragOver"
        @drop.prevent="onDrop"
      >
        <input ref="filesRef" type="file" multiple style="display: none;" @change="onChange" />
        <DragNDropComponent v-if="dragAndDropVisible" :fileCount="dragAndDropFileCount" @leave="dragAndDropVisible = false" />
        <MainMenu ref="mainMenuRef" v-if="isFullWebApp"
          :hasFiles="hasFiles"
          :canSave="canSave"
          :canSaveAs="canSaveAs"
          :recentFilePaths="recentFilePaths"
          @about="onAboutMenu"
          @changelog="onChangelogMenu"
          @open="onOpenMenu"
          @openLocation="onOpenLocationMenu"
          @openSampleLorenz="onOpenSampleLorenzMenu"
          @reopen="onReopenMenu"
          @clearRecentFiles="onClearRecentFilesMenu"
          @save="onSaveMenu"
          @saveAs="onSaveAsMenu"
          @download="onDownloadMenu"
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
            title="Disconnect from GitHub"
            question="You are about to disconnect from GitHub. Do you want to continue?"
            severity="danger"
            yesLabel="Disconnect"
            noLabel="Cancel"
            @yes="onDisconnectFromGitHub"
            @no="disconnectFromGitHubVisible = false"
          />
        </div>
        -->
        <ContentsComponent ref="contentsRef" class="grow min-h-0"
          @error="onError"
          @fileClosed="onFileClosed"
          @fileOpened="onFileOpened"
          :recentFilePaths="startScreenRecentFilePaths"
          @open="onStartScreenOpen"
          @openFile="openFile"
          @openRecentFile="onStartScreenOpenRecentFile"
          @openLocation="onStartScreenOpenLocation"
          @openSampleLorenz="onStartScreenOpenSampleLorenz"
          @simulationData="emitSimulationData"
        />
        <BlockingMessageComponent class="app-blocking-message initialising-opencor-message" v-show="initialisingOpencorMessageVisible" message="Initialising OpenCOR..." :progress="initialisation.progress.value" />
        <BlockingMessageComponent class="app-blocking-message" v-if="loadingModelMessageVisible" message="Loading model..." />
        <BlockingMessageComponent class="app-blocking-message" v-show="loadingExternalDataVisible" message="Loading external data..." />
        <BlockingMessageComponent class="app-blocking-message" v-show="opencorMessageVisible" :message="opencorMessageMessage" :progress="opencorMessageProgress" />
        <OkMessageDialog v-model:visible="updateErrorVisible"
          :title="updateErrorTitle"
          :message="updateErrorIssue"
          severity="danger"
          @ok="onUpdateErrorDialogClose"
        />
        <UpdateAvailableDialog v-model:visible="updateAvailableVisible"
          :version="updateVersion"
          :reloading="updateReloading"
          @downloadAndInstall="onDownloadAndInstall"
          @reload="onReload"
          @close="updateAvailableVisible = false"
        />
        <UpdateDownloadProgressDialog v-model:visible="updateDownloadProgressVisible"
          :version="updateVersion"
          :percent="updateDownloadPercent"
          :transferred="updateDownloadTransferred"
          :total="updateDownloadTotal"
          :installing="updateInstalling"
        />
        <OkMessageDialog v-model:visible="updateNotAvailableVisible"
          title="Check for Updates"
          message="You are using the latest version of OpenCOR."
          severity="success"
          @ok="updateNotAvailableVisible = false"
        />
        <OpenLocationDialog v-model:visible="openLocationVisible"
          @openLocation="onOpenLocation"
          @close="openLocationVisible = false"
        />
        <SettingsDialog v-model:visible="settingsVisible"
          @close="settingsVisible = false"
        />
        <YesNoQuestionDialog v-model:visible="resetAllVisible"
          title="Reset All"
          question="All of your settings will be reset and OpenCOR will restart. Do you want to continue?"
          severity="danger"
          yesLabel="Reset All"
          noLabel="Cancel"
          @yes="onResetAll"
          @no="resetAllVisible = false"
        />
        <ChangelogDialog v-model:visible="changelogVisible"
          @close="changelogVisible = false"
        />
        <AboutDialog v-model:visible="aboutVisible"
          @close="aboutVisible = false"
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

import celldlIcon from '../assets/celldl.svg?inline';
import * as changelog from '../common/changelog';
import * as common from '../common/common';
import { FULL_URI_SCHEME, LONG_DELAY, MAX_RECENT_FILES, SHORT_DELAY, TOAST_LIFE } from '../common/constants';
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
import { provideOpenCORMessage } from '../components/OpenCORMessage';
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
  removeRecentFile(filePath);

  emit('file', { type: 'opened', filePath, issues: [] });
};

const onFileClosed = (filePath: string, fileHandle?: FileSystemFileHandle): void => {
  addRecentFile(filePath, fileHandle);

  emit('file', { type: 'closed', filePath, issues: [] });
};

// Exposed methods.

defineExpose({
  // General methods.

  changelog: changelog.changelog,

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

// Provide access to our message features.
// Note: this must be done before compBlockUiEnabled is computed below since it relies on opencorMessageVisible.

const {
  visible: opencorMessageVisible,
  message: opencorMessageMessage,
  progress: opencorMessageProgress
} = provideOpenCORMessage();

// Block the user's input once the user has confirmed that OpenCOR can be quit (or restarted), until it actually is.
// Note #1: our main process doesn't quit OpenCOR straight away (e.g., on macOS, an update gets fetched by Squirrel.Mac
//          before being installed), and the user might otherwise modify a file in the meantime (e.g., by undoing
//          something in a CellDL file), in which case the modification would be lost without the user having been
//          asked whether to save it.
// Note #2: we intercept the user's input before anything else can handle it, i.e. during the capture phase of our
//          window, using listeners that are added before anything else gets a chance to add its own (since the
//          listeners of a given target and phase are called in the order in which they were added), e.g., before
//          CellDL Editor gets loaded. We also disable our main menu (see compUiEnabled below), so that the user cannot,
//          for instance, paste something using it.
// Note #3: our main process may not quit OpenCOR after all (e.g., if an update couldn't be installed), in which case we
//          unblock the user's input.

const USER_INPUT_EVENT_TYPES = [
  'auxclick',
  'beforeinput',
  'click',
  'contextmenu',
  'cut',
  'dblclick',
  'dragstart',
  'drop',
  'input',
  'keydown',
  'keypress',
  'keyup',
  'mousedown',
  'mousemove',
  'mouseup',
  'paste',
  'pointerdown',
  'pointermove',
  'pointerup',
  'touchend',
  'touchmove',
  'touchstart',
  'wheel'
];

const userInputBlocked = vue.ref<boolean>(false);

if (electronApi) {
  const blockUserInput = (event: Event): void => {
    if (userInputBlocked.value) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  for (const eventType of USER_INPUT_EVENT_TYPES) {
    window.addEventListener(eventType, blockUserInput, { capture: true, passive: false });
  }

  trackCleanup(() => {
    for (const eventType of USER_INPUT_EVENT_TYPES) {
      window.removeEventListener(eventType, blockUserInput, { capture: true });
    }
  });
}

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
    opencorMessageVisible.value ||
    connectingToGitHub.value
  );
});

const compUiEnabled = vue.computed<boolean>(() => {
  return !compBlockUiEnabled.value && !isDialogActive.value && !userInputBlocked.value;
});

// Make our main menu and our contents inert while our UI is blocked, so that they cannot be reached using the keyboard
// (e.g., using Tab) since our BlockUI's overlay only blocks the mouse.
// Note #1: our blocking messages are not made inert since they must remain visible to assistive technologies (so that
//          they can get announced, see BlockingMessageComponent.vue), but they cannot be interacted with anyway.
// Note #2: a dialog may be shown while our UI is blocked, in which case our main menu and our contents are not inert
//          since a dialog may be rendered within our contents (see BaseDialog.vue) and the descendants of an inert
//          element cannot be interacted with. A dialog is modal, so it keeps the keyboard focus within itself anyway.
// Note #3: a dialog gets focused as soon as it is shown, i.e. before Vue would update the DOM, so we make our main menu
//          and our contents inert (or not) synchronously (and therefore not through our template).
// Note #4: an element that gets inert loses the keyboard focus, so we give it back to the element that had it before
//          our UI got blocked (if that element is still there and visible, and the keyboard focus hasn't gone somewhere
//          else in the meantime) once our UI is unblocked, unless a dialog is shown (since it then has the keyboard
//          focus).

let elementFocusedBeforeUiBlocked: HTMLElement | null = null;

const inertElements = (): HTMLElement[] => {
  return [mainMenuRef.value?.$el, contentsRef.value?.$el].filter((element): element is HTMLElement => {
    return element instanceof HTMLElement;
  });
};

const restoreFocusAfterUiUnblocked = async (element: HTMLElement): Promise<void> => {
  await vue.nextTick();

  const activeElement = document.activeElement;

  if (
    (!activeElement || activeElement === document.body) &&
    element.isConnected &&
    element.getClientRects().length > 0 &&
    !element.matches(':disabled')
  ) {
    element.focus();
  }
};

const updateInertElements = (): void => {
  const elements = inertElements();
  const inert = compBlockUiEnabled.value && !isDialogActive.value;

  if (inert) {
    const activeElement = document.activeElement;

    if (
      !elementFocusedBeforeUiBlocked &&
      activeElement instanceof HTMLElement &&
      elements.some((element: HTMLElement) => element.contains(activeElement))
    ) {
      elementFocusedBeforeUiBlocked = activeElement;
    }
  }

  for (const element of elements) {
    element.inert = inert;
  }

  if (!compBlockUiEnabled.value) {
    const element = elementFocusedBeforeUiBlocked;

    elementFocusedBeforeUiBlocked = null;

    if (element && !isDialogActive.value) {
      void restoreFocusAfterUiUnblocked(element);
    }
  }
};

vue.watch([compBlockUiEnabled, isDialogActive], updateInertElements, { flush: 'sync' });

vue.onMounted(updateInertElements);

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

// Note: PrimeVue only pauses the life of a toast while it is hovered if it has some mouse enter and leave handlers, so
//       we give it some (that don't need to do anything), so that the user has time to read a toast that they hover.

const onToastHover = (): void => {};

// Our toasts are positioned within OpenCOR (rather than within the page) and shown/hidden without any animation, and
// their messages are rendered by ToastMessageWidget.vue, hence we remove the styling of PrimeVue's messages.
// Note: we must use a pt object (rather than some pt: attributes) since PrimeVue's Toast component only passes its pt
//       object to its messages.

const TOAST_PT = {
  root: {
    style: { position: 'absolute', top: '0.75rem', right: '0.75rem', width: 'min(24rem, calc(100% - 1.5rem))' }
  },
  message: {
    style: { margin: '0 0 0.5rem', border: 'none', background: 'none', boxShadow: 'none', backdropFilter: 'none' }
  },
  transition: {
    css: false
  }
};

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

const canSave = vue.computed<boolean>(() => {
  return contentsRef.value?.canSaveCurrentFile() ?? false;
});

const canSaveAs = vue.computed<boolean>(() => {
  return contentsRef.value?.canSaveCurrentFileAs() ?? false;
});

vue.watch(
  [canSave, canSaveAs],
  ([newCanSave, newCanSaveAs]: [boolean, boolean]) => {
    electronApi?.enableDisableFileSaveAndSaveAsMenuItems(newCanSave, newCanSaveAs);
  },
  { immediate: true }
);

// Keep track of the files that have been modified, so that the user can be asked whether to save them before OpenCOR
// gets quit or before the Web page gets unloaded (see below).
// Note: we get recomputed whenever a file gets edited (e.g., for every pointer move while an object is being moved in
//       our CellDL Editor view), so we return our previous value if the files that have been modified haven't changed,
//       so that our main process doesn't get told about them (again) for nothing.

const modifiedFilePaths = vue.computed<string[]>((oldModifiedFilePaths?: string[]) => {
  const res = contentsRef.value?.modifiedFilePaths() ?? [];

  if (
    oldModifiedFilePaths?.length === res.length &&
    res.every((filePath, index) => filePath === oldModifiedFilePaths[index])
  ) {
    return oldModifiedFilePaths;
  }

  return res;
});

vue.watch(
  modifiedFilePaths,
  (newModifiedFilePaths: string[]) => {
    electronApi?.filesModified(newModifiedFilePaths);
  },
  { immediate: true }
);

// Ask the user whether to save the files that have been modified, except the given ones, which the user has already
// chosen not to save, and return the path of the files that are still modified (i.e. that the user chose not to save),
// or null if the user cancelled or a file that they wanted to save couldn't be saved, i.e. if we cannot proceed (see
// ContentsComponent.saveModifiedFiles()).

const saveModifiedFiles = async (title: string, leftUnsavedFilePaths?: string[]): Promise<string[] | null> => {
  return contentsRef.value ? contentsRef.value.saveModifiedFiles(title, leftUnsavedFilePaths) : [];
};

// Ask the user whether to save the files that have been modified before OpenCOR gets quit, and then let our main
// process quit OpenCOR, unless the user cancelled.
// Note #1: we let our main process know straight away that we have received its request, even if we are going to ignore
//          it, so that it doesn't consider us as not responding (see MainWindow.ts).
// Note #2: we ignore a request while we are already handling one (e.g., if the user tries to quit OpenCOR twice in a
//          row).

let confirmingClose = false;

trackCleanup(
  electronApi?.onConfirmClose(async () => {
    electronApi?.closeRequestReceived();

    if (confirmingClose) {
      return;
    }

    confirmingClose = true;

    try {
      if ((await saveModifiedFiles('Quit')) !== null) {
        userInputBlocked.value = true;

        electronApi?.closeConfirmed();
      }
    } finally {
      confirmingClose = false;
    }
  })
);

// Warn the user that leaving the Web page will lose the changes made to the files that have been modified.
// Note #1: in the case of Electron, our main process asks us to ask the user whether to save those files (see above),
//          so we only do this for OpenCOR's Web app. Also, preventing our Web page from being unloaded would prevent
//          OpenCOR from being quit (without the user being told why).
// Note #2: unlike our main process, a Web browser doesn't let us ask the user whether to save those files, only whether
//          to leave the Web page.
// Note #3: we don't warn the user about the files that they have chosen not to save when asked whether to reload
//          OpenCOR's Web app (see onReload()), but we do about any other file that has been modified.

let leftUnsavedFilePathsOnUnload: string[] = [];

const onBeforeUnload = (event: BeforeUnloadEvent): void => {
  if (modifiedFilePaths.value.some((filePath) => !leftUnsavedFilePathsOnUnload.includes(filePath))) {
    event.preventDefault();
  }
};

if (!electronApi) {
  window.addEventListener('beforeunload', onBeforeUnload);

  trackCleanup(() => {
    window.removeEventListener('beforeunload', onBeforeUnload);
  });
}

// Remove the keyboard focus when the user presses the Escape key, so that whatever has it no longer looks focused
// (e.g., with a focus ring), unless something is open (e.g., a menu or a popover), in which case the Escape key is for
// closing it.
// Note #1: we only do this for our instance of OpenCOR, and only if it is active and its UI is enabled (i.e. our UI is
//          neither blocked nor showing a dialog, see compUiEnabled).
// Note #2: we listen to the Escape key during the capture phase of our window, i.e. before PrimeVue components get it,
//          since some of them (e.g., a select) stop its propagation even when they have nothing to close.
// Note #3: a text entry (e.g., the input of an input widget or the range editor of a graph panel) and CellDL Editor may
//          use the Escape key themselves (e.g., to discard a value being edited or to cancel what the user is doing),
//          so we leave the keyboard focus alone if it is within one of them. Otherwise, blurring a text entry could,
//          for instance, commit the value being edited rather than discard it.
// Note #4: an open element may have a fixed position (in which case its offsetParent is null), so we check whether it
//          is rendered using its client rects.

const ESCAPE_KEY_OPEN_ELEMENTS = '.p-popover, .p-select-overlay, .p-contextmenu, .p-menubar-submenu';
const ESCAPE_KEY_TEXT_ENTRIES =
  'textarea, input:not([type="button"], [type="checkbox"], [type="color"], [type="file"], [type="radio"], [type="range"], [type="reset"], [type="submit"])';

const onEscapeKeyDown = (event: KeyboardEvent): void => {
  if (
    event.key !== 'Escape' ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !compIsActiveApp.value ||
    !compUiEnabled.value
  ) {
    return;
  }

  const root = (safeBlockUiRef.value as unknown as { $el?: HTMLElement } | null)?.$el;
  const focusedElement = document.activeElement;

  if (
    !root ||
    !(focusedElement instanceof HTMLElement) ||
    !root.contains(focusedElement) ||
    !focusedElement.matches(':focus-visible') ||
    focusedElement.isContentEditable ||
    focusedElement.matches(ESCAPE_KEY_TEXT_ENTRIES) ||
    focusedElement.closest('.celldl-editor-container') ||
    Array.from(root.querySelectorAll<HTMLElement>(ESCAPE_KEY_OPEN_ELEMENTS)).some(
      (element) => element.getClientRects().length
    )
  ) {
    return;
  }

  focusedElement.blur();
};

window.addEventListener('keydown', onEscapeKeyDown, { capture: true });

trackCleanup(() => {
  window.removeEventListener('keydown', onEscapeKeyDown, { capture: true });
});

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

// Note: our update available dialog is used by both OpenCOR (when our main process lets us know that an update is
//       available) and OpenCOR's Web app (when the user clicks on our main menu's "New version available" button, see
//       onUpdateAvailable() below). We keep track of the version to update to, so that it doesn't change while our
//       dialog is shown (e.g., if an even newer version of OpenCOR's Web app gets released in the meantime), which
//       means that it always matches the changes that our dialog lists.

const updateAvailableVisible = vue.ref<boolean>(false);
const updateDownloadProgressVisible = vue.ref<boolean>(false);
const updateVersion = vue.ref<string>('');
const updateDownloadPercent = vue.ref<number>(0);
const updateDownloadTransferred = vue.ref<number>(0);
const updateDownloadTotal = vue.ref<number>(0);
const updateInstalling = vue.ref<boolean>(false);

trackCleanup(
  electronApi?.onUpdateAvailable((version: string) => {
    updateAvailableVisible.value = true;
    updateVersion.value = version;
  })
);

const onDownloadAndInstall = (): void => {
  updateDownloadPercent.value = 0; // Just to be on the safe side.
  updateDownloadTransferred.value = 0;
  updateDownloadTotal.value = 0;
  updateInstalling.value = false;
  updateDownloadProgressVisible.value = true;
  updateAvailableVisible.value = false;

  electronApi?.downloadAndInstallUpdate();
};

trackCleanup(
  electronApi?.onUpdateDownloadError((issue: string) => {
    // Note: our update download progress dialog can't be closed by the user, so we must close it ourselves.

    updateDownloadProgressVisible.value = false;

    updateErrorTitle.value = 'Downloading Update';
    updateErrorIssue.value = `An error occurred while downloading the update (${common.formatMessage(issue, false)}).`;
    updateErrorVisible.value = true;
  })
);

trackCleanup(
  electronApi?.onUpdateInstallError((issue: string) => {
    userInputBlocked.value = false;
    updateInstalling.value = false;
    updateDownloadProgressVisible.value = false;

    updateErrorTitle.value = 'Installing Update';
    updateErrorIssue.value = `An error occurred while installing the update (${common.formatMessage(issue, false)}).`;
    updateErrorVisible.value = true;
  })
);

// Note: we show our update download progress dialog in case it is not already visible, i.e. if we have been reloaded
//       (e.g., after a crash) while an update was being downloaded or installed (see resendUpdateState() in
//       MainWindow.ts).

trackCleanup(
  electronApi?.onUpdateDownloadProgress((percent: number, transferred: number, total: number) => {
    updateDownloadPercent.value = percent;
    updateDownloadTransferred.value = transferred;
    updateDownloadTotal.value = total;
    updateDownloadProgressVisible.value = true;
  })
);

trackCleanup(
  electronApi?.onUpdateDownloaded(async () => {
    // Just to be on the safe side, since the last download progress we were told about may not be for 100%.

    updateDownloadPercent.value = 100;
    updateDownloadTransferred.value = updateDownloadTotal.value;

    // Installing the update restarts OpenCOR, so ask the user whether to save the files that have been modified first.
    // If the user cancels, then the update will be installed when OpenCOR gets quit (see autoInstallOnAppQuit in
    // electron-updater) or once the user has checked for updates again (see checkForUpdates() in MainWindow.ts).

    if ((await saveModifiedFiles('Install Update')) !== null) {
      userInputBlocked.value = true;
      updateInstalling.value = true;

      if (!(await electronApi?.installUpdateAndRestart())) {
        userInputBlocked.value = false;
        updateInstalling.value = false;
        updateDownloadProgressVisible.value = false;
      }
    } else {
      updateDownloadProgressVisible.value = false;
    }
  })
);

// Note: we are told that an update is being installed if we have been reloaded (e.g., after a crash) after having asked
//       for it to be installed (see resendUpdateState() in MainWindow.ts), in which case OpenCOR is about to be quit,
//       so we only need to show it (and block our UI), as when we ask for an update to be installed (see above).

trackCleanup(
  electronApi?.onUpdateInstalling(() => {
    updateDownloadPercent.value = 100;
    updateDownloadTransferred.value = updateDownloadTotal.value;
    userInputBlocked.value = true;
    updateInstalling.value = true;
    updateDownloadProgressVisible.value = true;
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
    updateErrorTitle.value = 'Check for Updates';
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

// Changelog dialog.

const changelogVisible = vue.ref<boolean>(false);

trackCleanup(
  electronApi?.onChangelog(() => {
    onChangelogMenu();
  })
);

const onChangelogMenu = (): void => {
  if (props.omex) {
    return;
  }

  changelogVisible.value = true;
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

// Update available dialog (for OpenCOR's Web app).
// Note: we fetch the changes for a newer version as soon as we know about it, so that our update available dialog can
//       list them straightaway (see fetchChangelog() in changelog.ts).

vue.watch(
  [version.updateAvailable, version.latestVersion],
  ([newUpdateAvailable, newLatestVersion]: [boolean, string]) => {
    if (newUpdateAvailable) {
      void changelog.fetchChangelog(newLatestVersion);
    }
  }
);

const onUpdateAvailable = () => {
  updateVersion.value = version.latestVersion.value;
  updateAvailableVisible.value = true;
};

// Reload OpenCOR's Web app, after having asked the user whether to save the files that have been modified, since
// reloading it would otherwise lose the changes made to them (see onBeforeUnload()).
// Note #1: we only let our update available dialog know that we are reloading once we actually are since, otherwise, it
//          would be stuck in its reloading state, should the user cancel.
// Note #2: forceReload() first refreshes our Web page in the HTTP cache, which may take a while, during which some
//          files may get edited. So, right before our Web page gets reloaded, we ask the user whether to save the files
//          that have been modified since, if any, and we don't reload if the user cancels.

const updateReloading = vue.ref<boolean>(false);

const onReload = async (): Promise<void> => {
  if (updateReloading.value) {
    return;
  }

  let leftUnsavedFilePaths = await saveModifiedFiles('Reload');

  if (leftUnsavedFilePaths === null) {
    return;
  }

  updateReloading.value = true;

  const reloading = await version.forceReload(async () => {
    leftUnsavedFilePaths = await saveModifiedFiles('Reload', leftUnsavedFilePaths ?? []);
    leftUnsavedFilePathsOnUnload = leftUnsavedFilePaths ?? [];

    return leftUnsavedFilePaths !== null;
  });

  if (!reloading) {
    updateReloading.value = false;
  }
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
  dataUrlContents?: Uint8Array;
  // Note: the contents of the file if it was opened using a data URL (undefined otherwise). We keep them because such a
  //       file only exists in memory, so they are what we need to reopen it once it has been closed (see
  //       addRecentFile()).
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

const processFile = async (
  fileFilePathOrFileContents: string | Uint8Array | File,
  dataUrlFileName: string = ''
): Promise<IFileInfo | null> => {
  // Check whether we were passed a ZIP-CellML data URL.
  // Note: we may also have been passed the contents of a file that was opened using a data URL and then closed, along
  //       with its name, so that it can be reopened under that name (see onReopenMenu() and electronApi.onOpenFile()).

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

    dataUrlFileName = `${common.CELLML_PREFIX}${common.nextCellmlDataUrlNumber()}/${common.fileName(zipCellmlFileName) || zipCellmlFileName}`;
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
    filePath = locCommon.filePath(fileFilePathOrFileContents, dataUrlFileName, omexDataUrlCounter);
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
    file = await locCommon.file(fileFilePathOrFileContents, dataUrlFileName, omexDataUrlCounter);
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
      canonicalFilePath,
      dataUrlContents:
        (dataUrlFileName || omexDataUrlCounter) && fileFilePathOrFileContents instanceof Uint8Array
          ? fileFilePathOrFileContents
          : undefined
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
  wait: boolean = false,
  fileHandle?: FileSystemFileHandle
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

    await contentsRef.value.openFile(file, wait, fileHandle);
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
      await openFileInContents(
        fileInfo.file,
        fileInfo.canonicalFilePath,
        wait,
        fileFilePathOrFileContents instanceof File ? fileHandles.get(fileFilePathOrFileContents) : undefined
      );

      const source =
        fileInfo.dataUrlContents ??
        (fileFilePathOrFileContents instanceof File ? fileFilePathOrFileContents : undefined);

      if (source && contentsRef.value?.hasFile(fileInfo.filePath)) {
        openedFiles.set(fileInfo.filePath, source);
      }
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

const openFile = (fileFilePathOrFileContents: string | Uint8Array | File, dataUrlFileName: string = ''): void => {
  void openProcessedFile(fileFilePathOrFileContents, processFile(fileFilePathOrFileContents, dataUrlFileName), false);
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
// Note #1: once our drop zone is shown, it covers the whole of OpenCOR (including any overlay that is open) and its
//          contents ignore pointer events (see DragNDropComponent.vue), so it is normally the only target of our drag
//          events. This means that we normally know that the files being dragged have left OpenCOR (or that the drag
//          has been cancelled) as soon as our drop zone gets left, without having to keep track of the (nested)
//          elements that are being entered and left.
// Note #2: if the files being dragged leave OpenCOR straight after our drop zone has been shown (e.g., if they are
//          quickly dragged across a corner of OpenCOR), then it is the element that was entered (rather than our drop
//          zone) that gets left, meaning that our drop zone would remain shown (and block the mouse). So, we also hide
//          our drop zone if we haven't been told for a while that files are still being dragged over us (a dragover
//          event is normally fired every 350 ms ± 200 ms while files are being dragged over us, even if they are not
//          moved).
// Note #3: some browsers only fire a dragover event when the files being dragged are moved (e.g., Chromium on Linux),
//          in which case our drop zone gets hidden if the files are held still for a while. So, we show our drop zone
//          again as soon as the files are moved again, and we still open the files if they are dropped while our drop
//          zone is hidden (as long as they could have been dropped onto our drop zone, see canDropFiles()).

const DRAG_OVER_TIMEOUT = 1000;

const dragAndDropVisible = vue.ref<boolean>(false);
const dragAndDropFileCount = vue.ref<number>(0);
let dragOverTimer: number | undefined;

const restartDragOverTimer = (): void => {
  window.clearTimeout(dragOverTimer);

  dragOverTimer = window.setTimeout(() => {
    dragOverTimer = undefined;

    dragAndDropVisible.value = false;
  }, DRAG_OVER_TIMEOUT);
};

vue.watch(dragAndDropVisible, (visible: boolean) => {
  if (!visible) {
    window.clearTimeout(dragOverTimer);

    dragOverTimer = undefined;
  }
});

trackCleanup(() => {
  window.clearTimeout(dragOverTimer);
});

// Hide our drop zone if our UI gets disabled while files are being dragged (e.g., if a dialog gets opened), so that
// they don't get opened if they are then dropped.

vue.watch(compUiEnabled, (uiEnabled: boolean) => {
  if (!uiEnabled) {
    dragAndDropVisible.value = false;
  }
});

// Whether the files being dragged can be dropped onto us, i.e. whether our UI is enabled and it is an external (file)
// drag rather than an internal one (e.g., a tab reorder drag).

const canDropFiles = (event: DragEvent): boolean => {
  return compUiEnabled.value && !props.omex && !!event.dataTransfer?.types.includes('Files');
};

// Show our drop zone, keeping track of the number of files being dragged, if known (see DragNDropComponent.vue).

const showDropZone = (event: DragEvent): void => {
  dragAndDropFileCount.value = Array.from(event.dataTransfer?.items ?? []).filter(
    (item) => item.kind === 'file'
  ).length;
  dragAndDropVisible.value = true;

  restartDragOverTimer();
};

const onDragEnter = (event: DragEvent): void => {
  if (!dragAndDropVisible.value && canDropFiles(event)) {
    showDropZone(event);
  }
};

const onDragOver = (event: DragEvent): void => {
  event.preventDefault();

  // Show our drop zone again if it got hidden while files are still being dragged over us (see Note #3 above).

  if (!dragAndDropVisible.value && canDropFiles(event)) {
    showDropZone(event);
  }

  // Let the user know whether the files being dragged would get opened if they were to be dropped, i.e. whether we are
  // showing our drop zone (we are not if our UI is disabled, for instance).

  if (event.dataTransfer?.types.includes('Files')) {
    event.dataTransfer.dropEffect = dragAndDropVisible.value ? 'copy' : 'none';
  }

  // Our files are still being dragged over us, so make sure that our drop zone doesn't get hidden (see Note #2 above).

  if (dragAndDropVisible.value) {
    restartDragOverTimer();
  }
};

// Retrieve the file handle of a dropped file, if possible, so that the file can be saved where it is (see
// ContentsComponent.saveFile()).
// Note #1: this is only needed for OpenCOR's Web app since OpenCOR knows where a dropped file is (see
//          electronApi.filePath()).
// Note #2: DataTransferItem.getAsFileSystemHandle() is part of the File System Access API, which is only supported by
//          Chromium-based Web browsers, and it may return the handle of a directory.

interface IDataTransferItemWithFileSystemHandle {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
}

const fileHandles = new WeakMap<File, FileSystemFileHandle>();

const droppedFileHandle = (item: DataTransferItem): Promise<FileSystemFileHandle | null> => {
  const getAsFileSystemHandle = (item as unknown as IDataTransferItemWithFileSystemHandle).getAsFileSystemHandle;

  if (electronApi || !getAsFileSystemHandle) {
    return Promise.resolve(null);
  }

  return getAsFileSystemHandle
    .call(item)
    .then((fileHandle) => {
      return fileHandle?.kind === 'file' ? (fileHandle as FileSystemFileHandle) : null;
    })
    .catch(() => {
      return null;
    });
};

const onDrop = async (event: DragEvent): Promise<void> => {
  // Open the dropped files if our drop zone is shown or if it got hidden while the files were held still (see Note #3
  // above).

  if (!dragAndDropVisible.value && !canDropFiles(event)) {
    return;
  }

  dragAndDropVisible.value = false;

  // Retrieve the dropped files and their file handle.
  // Note: this must be done before we await anything since the dropped items can only be accessed while the drop
  //       event is being handled.

  const droppedFiles = Array.from(event.dataTransfer?.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => {
      return {
        file: item.getAsFile(),
        fileHandle: droppedFileHandle(item)
      };
    });
  const files: File[] = [];

  for (const droppedFile of droppedFiles) {
    if (droppedFile.file) {
      const fileHandle = await droppedFile.fileHandle;

      if (fileHandle) {
        fileHandles.set(droppedFile.file, fileHandle);
      }

      files.push(droppedFile.file);
    }
  }

  openFiles(files);
};

// Open.

trackCleanup(
  electronApi?.onOpenFile((filePath: string) => {
    handleExternalRequest(() => {
      // Note: our main process may ask us to reopen a file that was opened using a data URL (through its File|Reopen
      //       menu), in which case we reopen it using the contents that we kept for it (see addRecentFile()).

      const closedDataUrlFile = closedDataUrlFiles.get(filePath);

      if (closedDataUrlFile) {
        closedDataUrlFiles.delete(filePath);

        openFile(closedDataUrlFile.contents, closedDataUrlFile.filePath);
      } else {
        openFile(filePath);
      }
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

// Open action, i.e. from our background (see BackgroundComponent.vue).
// Note: OpenCOR shows its native open dialog (which allows it to keep track of the files that are opened), while
//       OpenCOR's Web app does the same as when using our main menu.

const onOpenAction = (): void => {
  if (electronApi) {
    electronApi.showOpenDialog();
  } else {
    onOpenMenu();
  }
};

// Open location.

const openLocationVisible = vue.ref<boolean>(false);

trackCleanup(
  electronApi?.onOpenLocation(() => {
    openLocationVisible.value = true;
  })
);

const onOpenLocationMenu = (): void => {
  if (props.omex) {
    return;
  }

  openLocationVisible.value = true;
};

const onOpenLocation = (url: string): void => {
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

// Reopen a file from the recent files menu.
// Note #1: OpenCOR's main process keeps track of OpenCOR's recent files (see MainWindow.fileClosed()), so we only need
//          to do it for OpenCOR's Web app, and only for the current session.
// Note #2: in OpenCOR's Web app, a local file is only known by its name, so we keep track of what is needed to reopen
//          it, i.e. its file handle, if any (see droppedFileHandle() and ContentsComponent.doSaveFileAs()), or its File
//          object. Similarly, a file opened using a data URL only exists in memory (see common.isDataUrlFileName()), so
//          we keep track of its contents, so that it can be reopened under the same name, but only for the current
//          session, including in OpenCOR where we keep them for the main process to ask us to reopen the file (see
//          closedDataUrlFiles). A file opened using some contents cannot be reopened.

interface IRecentFile {
  filePath: string;
  source: string | File | FileSystemFileHandle | Uint8Array;
}

interface IClosedDataUrlFile {
  filePath: string;
  contents: Uint8Array;
}

const openedFiles = new Map<string, File | Uint8Array>();
const closedDataUrlFiles = new Map<string, IClosedDataUrlFile>();
// Note: keyed by the canonical path of the file since that is what our main process refers to it by. It only lists up
//       to MAX_RECENT_FILES files, so we never need to keep more than that.
const recentFiles = vue.shallowRef<IRecentFile[]>([]);
const recentFilePaths = vue.computed<string[]>(() => {
  return recentFiles.value.map((recentFile) => recentFile.filePath);
});

const removeRecentFile = (filePath: string): void => {
  if (recentFilePaths.value.includes(filePath)) {
    recentFiles.value = recentFiles.value.filter((recentFile) => recentFile.filePath !== filePath);
  }
};

const addRecentFile = (filePath: string, fileHandle?: FileSystemFileHandle): void => {
  const file = openedFiles.get(filePath);

  openedFiles.delete(filePath);

  if (electronApi) {
    if (!(file instanceof Uint8Array)) {
      return;
    }

    let canonicalFilePath: string;

    try {
      canonicalFilePath = locApi.fileManager.canonicalPath(filePath);
    } catch (error: unknown) {
      console.warn(`OpenCOR: failed to canonicalise a file path (${filePath}):`, common.formatError(error));

      return;
    }

    closedDataUrlFiles.delete(canonicalFilePath);
    closedDataUrlFiles.set(canonicalFilePath, { filePath, contents: file });

    for (const oldCanonicalFilePath of closedDataUrlFiles.keys()) {
      if (closedDataUrlFiles.size <= MAX_RECENT_FILES) {
        break;
      }

      closedDataUrlFiles.delete(oldCanonicalFilePath);
    }

    return;
  }

  if (!isFullWebApp.value) {
    return;
  }

  const source = fileHandle ?? (common.isUrl(filePath) ? filePath : file);

  if (!source) {
    return;
  }

  recentFiles.value = [
    { filePath, source },
    ...recentFiles.value.filter((recentFile) => recentFile.filePath !== filePath)
  ].slice(0, MAX_RECENT_FILES);
};

const onReopenMenu = async (filePath: string): Promise<void> => {
  const recentFile = recentFiles.value.find((recentFile) => recentFile.filePath === filePath);

  if (!recentFile) {
    return;
  }

  removeRecentFile(filePath);

  if (recentFile.source instanceof Uint8Array) {
    openFile(recentFile.source, filePath);

    return;
  }

  if (typeof recentFile.source === 'string' || recentFile.source instanceof File) {
    openFile(recentFile.source);

    return;
  }

  // Retrieve the current contents of the file through its file handle, and keep track of its file handle so that it can
  // still be saved where it is.

  let file: File;

  try {
    file = await recentFile.source.getFile();
  } catch (error: unknown) {
    reportFileIssue(filePath, common.formatMessage(common.formatError(error)));

    return;
  }

  fileHandles.set(file, recentFile.source);

  openFile(file);
};

// Note: in OpenCOR, our main process clears its recent files itself, but it lets us know about it so that we can
//       release the contents of the files that were opened using a data URL and then closed (see addRecentFile()).

trackCleanup(
  electronApi?.onClearRecentFiles(() => {
    closedDataUrlFiles.clear();
  })
);

const onClearRecentFilesMenu = (): void => {
  recentFiles.value = [];
};

// Recent files, as listed on our start screen (see BackgroundComponent.vue).
// Note: in OpenCOR, our recent files are kept by our main process, which lets us know about them (see
//       recentFilePathsUpdated() in MainWindow.ts) and which must be the one to reopen them (as if they were reopened
//       using its Reopen menu, see reopenRecentFile() in MainWindow.ts). In OpenCOR's Web app, they are those of our
//       Reopen menu.

const mainProcessRecentFilePaths = vue.ref<string[]>([]);

trackCleanup(
  electronApi?.onRecentFiles((filePaths: string[]) => {
    mainProcessRecentFilePaths.value = filePaths;
  })
);

const startScreenRecentFilePaths = vue.computed<string[]>(() => {
  return electronApi ? mainProcessRecentFilePaths.value : recentFilePaths.value;
});

const onOpenRecentFileAction = (filePath: string): void => {
  if (electronApi) {
    electronApi.reopenRecentFile(filePath);
  } else {
    void onReopenMenu(filePath);
  }
};

// Actions of our start screen (see BackgroundComponent.vue).
// Note: unlike our main menu, our start screen is not disabled while our UI is not enabled, and our contents are only
//       inert while our UI is blocked and no dialog is shown (see updateInertElements()), so its actions may still get
//       triggered while our UI is not enabled, in which case we ignore them.

const startScreenAction = <T extends unknown[]>(action: (...args: T) => void): ((...args: T) => void) => {
  return (...args: T): void => {
    if (compUiEnabled.value) {
      action(...args);
    }
  };
};

const onStartScreenOpen = startScreenAction(onOpenAction);
const onStartScreenOpenRecentFile = startScreenAction(onOpenRecentFileAction);
const onStartScreenOpenLocation = startScreenAction(onOpenLocationMenu);
const onStartScreenOpenSampleLorenz = startScreenAction(onOpenSampleLorenzMenu);

// Save.

trackCleanup(
  electronApi?.onSave(() => {
    onSaveMenu();
  })
);

const onSaveMenu = (): void => {
  if (props.omex) {
    return;
  }

  contentsRef.value?.saveCurrentFile();
};

// Save as.

trackCleanup(
  electronApi?.onSaveAs(() => {
    onSaveAsMenu();
  })
);

const onSaveAsMenu = (): void => {
  if (props.omex) {
    return;
  }

  contentsRef.value?.saveCurrentFileAs();
};

// Download.
// Note: this is only offered in OpenCOR's Web app when the Web browser has no save file picker (see
//       common.hasSaveFilePicker()), in which case saving a file as another file downloads it.

const onDownloadMenu = (): void => {
  if (props.omex) {
    return;
  }

  contentsRef.value?.saveCurrentFileAs();
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

// Note: resetting all restarts OpenCOR, so we ask the user whether to save the files that have been modified first.

const onResetAll = async (): Promise<void> => {
  resetAllVisible.value = false;

  if ((await saveModifiedFiles('Reset All')) !== null) {
    userInputBlocked.value = true;

    electronApi?.resetAll();
  }
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

  // Note: the CellDL Editor is big, so we only load it when needed (see common/celldlRuntime.ts).

  viewRegistry.register({
    id: 'celldl-editor',
    category: ViewCategory.Editing,
    label: 'CellDL Editor',
    icon: { url: celldlIcon },
    component: vue.defineAsyncComponent(() => import('./views/CellDLEditorView.vue')),
    fileTypes: [locApi.EFileType.UNKNOWN_FILE],
    supportsFile: locCommon.isCellDLFile
  });

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

  /**
   * Note #1: only our own blocking messages are shifted down since they are centred over the whole of OpenCOR (i.e.
   *          also over our main menu), unlike the blocking message of a view (e.g., CellDL Editor's loading message),
   *          which is centred over the view itself (and therefore already below our main menu).
   * Note #2: our initialising message is not shifted down since it replaces the message that is shown until OpenCOR has
   *          been loaded (see index.html), which is centred over the whole window (since it cannot know whether there
   *          will be a main menu and, if so, how tall it will be), so that both look like a single step (rather than
   *          our message jumping down once OpenCOR has been loaded).
   */

  :deep(.app-blocking-message:not(.initialising-opencor-message)) {
    margin-top: calc(0.5 * var(--main-menu-height));
  }
}
</style>
