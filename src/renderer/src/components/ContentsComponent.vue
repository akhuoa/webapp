<template>
  <div v-if="simulationOnly" class="h-full">
    <template v-for="fileTab in fileTabs" :key="`tabPanel_${fileTab.file.path()}`">
      <KeepAlive>
        <component
          :is="view(fileTab).component"
          :ref="view(fileTab).component === SimulationExperimentInteractiveView ? captureSimulationExperimentInteractiveViewRef : undefined"
          class="h-full"
          v-bind="view(fileTab).props"
          @simulationData="$emit('simulationData')"
        />
      </KeepAlive>
    </template>
  </div>
  <div v-else class="h-full flex flex-col"
    @dragover.prevent="onDragOver"
    @drop="onDrop"
  >
    <BackgroundComponent v-show="!fileTabs.length" actions
      :recentFilePaths="recentFilePaths"
      @open="$emit('open')"
      @openRecentFile="$emit('openRecentFile', $event)"
      @openLocation="$emit('openLocation')"
      @openSampleLorenz="$emit('openSampleLorenz')"
    />
    <div v-show="fileTabs.length" class="file-tab-bar-container shrink-0">
      <div ref="fileTabBarRef" class="file-tab-bar flex overflow-x-auto"
        @wheel.prevent="onWheel"
        @scroll="updateFileTabBarOverflow"
      >
        <div v-show="dropIndicatorLeft !== null" class="file-tab-drop-indicator"
          :style="{ left: `${dropIndicatorLeft}px` }"
        />
        <div v-for="fileTab in fileTabs" :key="`tab_${fileTab.file.path()}`" :ref="(element) => setFileTabRef(fileTab.file.path(), element as HTMLElement | null)"
          class="file-tab"
          :class="{
            'file-tab-active': fileTab.file.path() === activeFile,
            'file-tab-modified': isModified(fileTab),
            'file-tab-dragging': dragState?.filePath === fileTab.file.path()
          }"
          v-hint="fileTab.file.canonicalPath()"
          :draggable="true"
          @click="selectFile(fileTab.file.path())"
          @mousedown.middle.prevent
          @auxclick.middle.prevent="closeFile(fileTab.file.path())"
          @contextmenu.prevent="onFileTabContextMenu($event, fileTab.file.path())"
          @dragstart="onDragStart($event, fileTab.file.path())"
          @dragend="onDragEnd"
        >
          <i :class="fileTabIcon(fileTab)" class="file-tab-icon" />
          <span class="file-tab-label">{{ common.fileName(fileTab.file.canonicalPath()) }}</span>
          <span class="file-tab-end">
            <span v-if="isModified(fileTab)" class="file-tab-modified-indicator pi pi-circle-fill" role="img" aria-label="Modified" />
            <!--
            Note: our close button's hint is only "Close" (since it is shown next to the name of our file), but its
                  accessible name says which file it closes, so that the close buttons of our file tabs can be told
                  apart (e.g., by a screen reader).
            -->
            <button class="file-tab-close-button pi pi-times"
              type="button"
              :aria-label="`Close ${common.fileName(fileTab.file.canonicalPath())}`"
              v-hint="'Close'"
              @mousedown.prevent
              @click.stop="onCloseButtonClick(fileTab.file.path())"
            />
          </span>
        </div>
      </div>
      <div v-show="fileTabBarOverflow.left" class="file-tab-bar-fade file-tab-bar-fade-left" />
      <div v-show="fileTabBarOverflow.right" class="file-tab-bar-fade file-tab-bar-fade-right" />
    </div>
    <ContextMenuWidget ref="fileTabContextMenuRef" :model="fileTabContextMenuItems" :appendTo="appendTarget" />
    <div class="grow min-h-0 relative">
      <template v-for="fileTab in fileTabs" :key="`panel_${fileTab.file.path()}`">
        <div class="absolute inset-0 flex h-full" :class="{ 'invisible pointer-events-none': fileTab.file.path() !== activeFile }">
          <ViewSwitcherComponent
            :activeViewId="fileTab.activeViewId"
            @selectView="onSelectView(fileTab, $event)"
          />
          <div class="grow min-w-0">
            <KeepAlive>
              <component
                :is="view(fileTab).component"
                v-bind="view(fileTab).props"
                @error="$emit('error', $event)"
                @openFile="$emit('openFile', $event)"
              />
            </KeepAlive>
          </div>
        </div>
      </template>
    </div>
    <YesNoQuestionDialog :visible="questionVisible && !questionCancellable"
      :title="questionTitle"
      :question="questionText"
      :yesLabel="questionYesLabel"
      :noLabel="questionNoLabel"
      @update:visible="onQuestionVisibilityUpdated"
      @yes="onQuestionAnswered('yes')"
      @no="onQuestionAnswered('no')"
    />
    <YesNoCancelQuestionDialog :visible="questionVisible && questionCancellable"
      :title="questionTitle"
      :question="questionText"
      :yesLabel="questionYesLabel"
      :noLabel="questionNoLabel"
      @update:visible="onQuestionVisibilityUpdated"
      @yes="onQuestionAnswered('yes')"
      @no="onQuestionAnswered('no')"
      @cancel="onQuestionAnswered('cancel')"
    />
  </div>
</template>

<script setup lang="ts">
import type { MenuItem } from 'primevue/menuitem';
import * as vue from 'vue';

import type { IOpenCORExternalDataEvent, IOpenCORSimulationDataEvent } from '../../index';

import * as common from '../common/common';
import { electronApi } from '../common/electronApi';
import { vHint } from '../common/hint';
import * as locCommon from '../common/locCommon';
import { type IFileEditor, useViewRegistry, ViewCategory } from '../common/viewRegistry';
import * as vueCommon from '../common/vueCommon';
import * as locApi from '../libopencor/locApi';

import SimulationExperimentInteractiveView from './views/SimulationExperimentInteractiveView.vue';
import UnsupportedFileTypeView from './views/UnsupportedFileTypeView.vue';
import ContextMenuWidget from './widgets/ContextMenuWidget.vue';
import { useOpenCORContext, useOpenCORKeyStroke } from './OpenCORContext';

interface IFileTab {
  file: locApi.File;
  uiJson?: locApi.IUiJson;
  activeViewId: string;
  fileHandle?: FileSystemFileHandle; // Only used in OpenCOR's Web app, to save a file where it is (see saveFile()).
}

withDefaults(
  defineProps<{
    recentFilePaths?: string[];
  }>(),
  {
    recentFilePaths: () => []
  }
);

const emit = defineEmits<{
  error: [message: string];
  fileClosed: [filePath: string, fileHandle?: FileSystemFileHandle];
  fileOpened: [filePath: string];
  open: [];
  openFile: [fileFilePathOrFileContents: string];
  openRecentFile: [filePath: string];
  openLocation: [];
  openSampleLorenz: [];
  simulationData: [];
}>();

const { simulationOnly, uiEnabled } = useOpenCORContext();

const viewRegistry = useViewRegistry();
const simulationExperimentInteractiveViewRef = vue.ref<InstanceType<typeof SimulationExperimentInteractiveView> | null>(
  null
);
const fileTabs = vue.ref<IFileTab[]>([]) as vue.Ref<IFileTab[]>;
// Note: we cast our ref since Vue's ref type would otherwise unwrap our file tabs' locApi.File instances, which would
//       lose their private members and therefore not be considered locApi.File instances anymore.
const fileTabRefs: Record<string, HTMLElement | null> = {};
const activeFile = vue.ref<string>('');

const filePaths = vue.computed<string[]>(() => {
  const res: string[] = [];

  for (const fileTab of fileTabs.value) {
    res.push(fileTab.file.path());
  }

  return res;
});

interface IDragState {
  filePath: string;
  dropPosition: 'before' | 'after' | null;
  dropTarget: string | null;
}

const dragState = vue.ref<IDragState | null>(null);
const fileTabBarRef = vue.shallowRef<HTMLElement | null>(null);
const dropIndicatorLeft = vue.ref<number | null>(null);

// Icon of a file tab, based on the type of its file.

const fileTabIcon = (fileTab: IFileTab): string => {
  switch (fileTab.file.type()) {
    case locApi.EFileType.COMBINE_ARCHIVE:
      return 'pi pi-box';
    case locApi.EFileType.SEDML_FILE:
      return 'pi pi-list';
    default:
      return 'pi pi-file';
  }
};

const captureSimulationExperimentInteractiveViewRef = (element: unknown): void => {
  simulationExperimentInteractiveViewRef.value = element as InstanceType<
    typeof SimulationExperimentInteractiveView
  > | null;
};

interface IView {
  component: vue.Component | null;
  props: Record<string, unknown>;
}

const view = (fileTab: IFileTab): IView => {
  // Resolve the view to show for a file, along with the props to pass to it.
  // Note: if the view does not support the file's type, then we show a view saying so.

  const viewDescriptor = viewRegistry.resolve(fileTab.activeViewId);

  if (!viewDescriptor) {
    return {
      component: null,
      props: {}
    };
  }

  if (!viewRegistry.isApplicable(viewDescriptor, fileTab.file)) {
    return {
      component: UnsupportedFileTypeView,
      props: {
        viewName: viewDescriptor.label,
        viewCategory: viewDescriptor.category,
        supportingViews: Object.values(ViewCategory)
          .flatMap((viewCategory) => viewRegistry.descriptors(viewCategory))
          .filter((descriptor) => viewRegistry.isApplicable(descriptor, fileTab.file)),
        onSelectView: (viewId: string) => {
          onSelectView(fileTab, viewId);
        }
      }
    };
  }

  switch (viewDescriptor.id) {
    case 'celldl-editor':
      return {
        component: viewDescriptor.component,
        props: {
          file: fileTab.file,
          isActiveFile: fileTab.file.path() === activeFile.value
        }
      };
    case 'simulation-experiment-standard':
      return {
        component: viewDescriptor.component,
        props: {
          file: fileTab.file,
          isActiveFile: simulationOnly.value || fileTab.file.path() === activeFile.value
        }
      };
    case 'simulation-experiment-interactive':
      return {
        component: viewDescriptor.component,
        props: {
          file: fileTab.file,
          uiJson: fileTab.uiJson
        }
      };
    default:
      return {
        component: viewDescriptor.component,
        props: {}
      };
  }
};

// Note: our contents are only inert while our UI is blocked and no dialog is shown (see OpenCOR.vue), so the buttons of
//       our file tabs, of our view switchers, and of our Unsupported file type view may still get activated while our
//       UI is not enabled, in which case we ignore them (as for our keyboard shortcuts, see useOpenCORKeyStroke()).

const onSelectView = (fileTab: IFileTab, viewId: string): void => {
  if (!uiEnabled.value) {
    return;
  }

  fileTab.activeViewId = viewId;
};

const findFileTab = (filePath: string): IFileTab | undefined => {
  // Retrieve the file tab for the given file path.
  // Note: a file may be referred to using different paths (e.g., through a symbolic link), hence we also compare
  //       canonical paths, but only if needed since it is more costly.

  if (simulationOnly.value) {
    return undefined;
  }

  const res = fileTabs.value.find((fileTab) => fileTab.file.path() === filePath);

  if (res) {
    return res;
  }

  const canonicalFilePath = locApi.fileManager.canonicalPath(filePath);

  return fileTabs.value.find((fileTab) => fileTab.file.canonicalPath() === canonicalFilePath);
};

const hasFile = (filePath: string): boolean => {
  return findFileTab(filePath) !== undefined;
};

const hasFiles = (): boolean => {
  if (simulationOnly.value) {
    return false;
  }

  return fileTabs.value.length > 0;
};

const waitForTabsUpdate = async (): Promise<void> => {
  // Wait a bit to ensure that the file tabs are properly updated.
  // Note: although a bit of a hack, this is needed when opening multiple files. Indeed, without this, the file tab may
  //       not be fully initialised when opening the next file. This means that when we select the file tab, it may try
  //       to finish initialising itself and, when it comes to our simulation experiment view, this means resizing the
  //       plots.

  await vue.nextTick();

  for (let i = 0; i < 3; ++i) {
    await common.waitForNextAnimationFrame();
  }
};

const selectFile = async (filePath: string, wait: boolean = false): Promise<void> => {
  // Note: we can only select a file that has a file tab (findFileTab() also returns undefined in simulation-only mode),
  //       and the given file path may not be the one of that file tab (see findFileTab()).

  const selectedFileTab = findFileTab(filePath);

  if (!selectedFileTab) {
    return;
  }

  activeFile.value = selectedFileTab.file.path();

  if (wait) {
    await waitForTabsUpdate();
  }
};

const selectNextFile = async (): Promise<void> => {
  const fileTabIndex = fileTabs.value.findIndex((fileTab) => fileTab.file.path() === activeFile.value);
  const fileTabName = fileTabs.value[(fileTabIndex + 1) % fileTabs.value.length]?.file.path() || '';

  if (fileTabName !== '') {
    await selectFile(fileTabName);
  }
};

const selectPreviousFile = async (): Promise<void> => {
  const fileTabIndex = fileTabs.value.findIndex((fileTab) => fileTab.file.path() === activeFile.value);
  const fileTabName =
    fileTabs.value[(fileTabIndex - 1 + fileTabs.value.length) % fileTabs.value.length]?.file.path() || '';

  if (fileTabName !== '') {
    await selectFile(fileTabName);
  }
};

const openFile = async (file: locApi.File, wait: boolean = false, fileHandle?: FileSystemFileHandle): Promise<void> => {
  const filePath = file.path();
  const prevActiveFile = activeFile.value;
  const uiJson = file.uiJson();

  fileTabs.value.splice(fileTabs.value.findIndex((fileTab) => fileTab.file.path() === prevActiveFile) + 1, 0, {
    file: file,
    uiJson: uiJson,
    activeViewId: locCommon.isCellDLFile(file)
      ? 'celldl-editor'
      : uiJson
        ? 'simulation-experiment-interactive'
        : 'simulation-experiment-standard',
    fileHandle: fileHandle ? vue.markRaw(fileHandle) : undefined
  });

  // Select the file and let people know that it has been opened.
  // Note: we let people know before waiting for our file tabs to be updated (see selectFile()) since the file may get
  //       closed in the meantime (e.g., using File|Close), in which case people would otherwise be told that it has
  //       been opened after having been told that it has been closed (and, in the case of Electron, it wouldn't be
  //       listed in our recent files).

  const fileSelected = selectFile(filePath, wait);

  electronApi?.fileOpened(filePath, file.canonicalPath());

  emit('fileOpened', filePath);

  await fileSelected;
};

const closeFile = async (
  filePath: string,
  force: boolean = false,
  save: (fileTab: IFileTab) => Promise<SaveOutcome> = saveFile
): Promise<boolean> => {
  // Close the given file and return whether it was closed (or had no file tab), i.e. whether the user didn't cancel its
  // closing.
  // Note #1: there is nothing to close if the file has no file tab, so we don't want to let people know that it has
  //          been closed (and, in the case of Electron, have it added to our list of recent files).
  // Note #2: if the file has been modified, then we ask the user whether to save it first, unless we are forced to
  //          close it (see doSaveFileAs()). Saving the file may result in it being saved under another name (see
  //          doSaveFileAs()), so we retrieve the index and file path of its file tab once we are done. Its file tab may
  //          also have been closed in the meantime, in which case there is nothing left to close.
  // Note #3: the file gets saved using the given function, which must be doSaveFile() if we are called while a file is
  //          being saved (see enqueueSaveOperation()).
  // Note #4: the file may be being saved, in which case we wait for it to be saved before closing it. Otherwise, it may
  //          still be being written once closed, i.e. once our main process doesn't let us save it anymore (see
  //          canSaveFile() in src/main/MainWindow.ts). It may then not be modified anymore, so we only determine
  //          whether it is once it has been saved (by which time its file tab may also have been closed). If we are
  //          called while a file is being saved (see Note #3), then that file is not the given one, so we don't wait
  //          for ourselves.

  const fileTab = fileTabs.value.find((fileTab) => fileTab.file.path() === filePath);

  if (!fileTab) {
    return true;
  }

  await fileSaved(fileTab);

  if (!fileTabs.value.includes(fileTab)) {
    return true;
  }

  if (!force && isModified(fileTab) && (await askToSaveFile(fileTab, 'Close', save)) === null) {
    return false;
  }

  const fileTabIndex = fileTabs.value.indexOf(fileTab);

  if (fileTabIndex === -1) {
    return true;
  }

  filePath = fileTab.file.path();

  const canonicalFilePath = fileTab.file.canonicalPath();

  locApi.fileManager.unmanage(filePath);

  fileTabs.value.splice(fileTabIndex, 1);

  // Release the file once its views have been unmounted (and have therefore released their own resources).

  void vue.nextTick().then(() => {
    fileTab.file.release();
  });

  if (activeFile.value === filePath && fileTabs.value.length) {
    const nextFileTab = fileTabs.value[Math.min(fileTabIndex, fileTabs.value.length - 1)];

    if (nextFileTab) {
      await selectFile(nextFileTab.file.path());
    }
  }

  electronApi?.fileClosed(canonicalFilePath);

  emit('fileClosed', filePath, fileTab.fileHandle);

  return true;
};

const closeCurrentFile = async (): Promise<void> => {
  if (simulationOnly.value) {
    return;
  }

  await closeFile(activeFile.value);
};

const closeAllFiles = async (): Promise<void> => {
  if (simulationOnly.value) {
    return;
  }

  // Close the files from a snapshot of our file tabs, so that we are guaranteed to terminate, and close the current
  // file last, so that closing the other files doesn't result in a new file being selected each time.
  // Note: we stop as soon as the user cancels the closing of a (modified) file.

  const currentFilePath = activeFile.value;
  const otherFilePaths = filePaths.value.filter((filePath) => filePath !== currentFilePath);

  for (const filePath of [...otherFilePaths, currentFilePath]) {
    if (!(await closeFile(filePath))) {
      return;
    }
  }
};

const closeOtherFiles = async (filePath: string): Promise<void> => {
  // Select the given file and then close the other files (from a snapshot of our file paths, see closeAllFiles()).
  // Note #1: the given file may have been closed in the meantime (e.g., using a keyboard shortcut while our file tab
  //          context menu was shown), in which case we do nothing (rather than close all our files).
  // Note #2: we stop as soon as the user cancels the closing of a (modified) file.

  if (!findFileTab(filePath)) {
    return;
  }

  await selectFile(filePath);

  for (const otherFilePath of filePaths.value.filter((path) => path !== filePath)) {
    if (!(await closeFile(otherFilePath))) {
      return;
    }
  }
};

// Context menu of our file tabs.

const fileTabContextMenuRef = vue.ref<InstanceType<typeof ContextMenuWidget> | null>(null);
const fileTabContextMenuFilePath = vue.ref<string>('');
const appendTarget = vueCommon.useAppendTarget(fileTabBarRef);

const fileTabContextMenuItems = vue.computed<MenuItem[]>(() => {
  const filePath = fileTabContextMenuFilePath.value;

  return [
    {
      label: 'Close',
      icon: 'pi pi-times',
      command: () => {
        void closeFile(filePath);
      }
    },
    {
      label: 'Close Others',
      icon: 'pi pi-clone',
      disabled: fileTabs.value.length < 2,
      command: () => {
        void closeOtherFiles(filePath);
      }
    },
    {
      label: 'Close All',
      icon: 'pi pi-times-circle',
      command: () => {
        void closeAllFiles();
      }
    },
    {
      separator: true
    },
    {
      label: 'Copy Path',
      icon: 'pi pi-copy',
      command: () => {
        const canonicalPath = findFileTab(filePath)?.file.canonicalPath();

        // Note: navigator.clipboard is undefined in an insecure context (e.g., if we are embedded in a page served over
        //       HTTP), in which case calling navigator.clipboard.writeText() would throw synchronously, hence we call
        //       it from an async function.

        if (canonicalPath) {
          (async () => {
            await navigator.clipboard.writeText(canonicalPath);
          })().catch((error: unknown) => {
            emit(
              'error',
              `The path of the file could not be copied (${common.formatMessage(common.formatError(error), false)}).`
            );
          });
        }
      }
    }
  ];
});

// Close the given file when the close button of its file tab is clicked, unless our UI is not enabled (see
// onSelectView()).

const onCloseButtonClick = (filePath: string): void => {
  if (uiEnabled.value) {
    void closeFile(filePath);
  }
};

// Show the context menu of the given file tab, unless our UI is not enabled.
// Note: the context menu may also be shown using the keyboard (e.g., using Shift+F10 when the close button of a file
//       tab has the keyboard focus), hence we check that our UI is enabled (see onSelectView()).

const onFileTabContextMenu = (event: MouseEvent, filePath: string): void => {
  if (!uiEnabled.value) {
    return;
  }

  fileTabContextMenuFilePath.value = filePath;

  fileTabContextMenuRef.value?.show(event);
};

// Hide the context menu of our file tabs, if shown, when our UI gets disabled (e.g., when a file is opened from outside
// of OpenCOR while it is shown).
// Note: our context menu is appended to our overlay container, which is not part of our contents, so it is not made
//       inert while our UI is blocked (see OpenCOR.vue) and its commands could otherwise still be used (e.g., using the
//       keyboard) while our UI is not enabled.

vue.watch(uiEnabled, (enabled: boolean) => {
  if (!enabled) {
    fileTabContextMenuRef.value?.hide();
  }
});

// Fade the edges of our file tab bar when some file tabs are hidden past them (since our file tab bar has no visible
// scrollbar), so that the user can tell that there are more file tabs.

const fileTabBarOverflow = vue.reactive({ left: false, right: false });

const updateFileTabBarOverflow = (): void => {
  const fileTabBar = fileTabBarRef.value;

  if (!fileTabBar) {
    return;
  }

  fileTabBarOverflow.left = fileTabBar.scrollLeft > 1;
  fileTabBarOverflow.right = fileTabBar.scrollLeft + fileTabBar.clientWidth < fileTabBar.scrollWidth - 1;
};

// Note: we observe both our file tab bar and our file tabs (see setFileTabRef()), since the width of a file tab may
//       change without the size of our file tab bar or the number of our file tabs changing (e.g., when a file is
//       saved under a longer name).

const fileTabBarResizeObserver = new ResizeObserver(updateFileTabBarOverflow);

vue.onMounted(() => {
  if (fileTabBarRef.value) {
    fileTabBarResizeObserver.observe(fileTabBarRef.value);
  }
});

vue.onUnmounted(() => {
  fileTabBarResizeObserver.disconnect();
});

vue.watch(
  () => fileTabs.value.length,
  () => {
    void vue.nextTick().then(updateFileTabBarOverflow);
  }
);

// Ask the user a (yes/no or yes/no/cancel) question and return their answer.
// Note #1: our yes and no buttons are labelled with what they do (see YesNoQuestionDialog.vue).
// Note #2: BaseDialog emits a cancel event whenever it gets hidden, including after the user has answered our question,
//          so rather than relying on such an event, we rely on our dialogs' visibility being updated to know when the
//          user has dismissed our question (e.g., using the Escape key), in which case we consider that they have
//          cancelled it.

type QuestionAnswer = 'yes' | 'no' | 'cancel';

const questionVisible = vue.ref<boolean>(false);
const questionTitle = vue.ref<string>('');
const questionText = vue.ref<string>('');
const questionCancellable = vue.ref<boolean>(false);
const questionYesLabel = vue.ref<string>('');
const questionNoLabel = vue.ref<string>('');
let questionAnswered: ((answer: QuestionAnswer) => void) | null = null;

const askQuestion = (
  title: string,
  question: string,
  yesLabel: string,
  noLabel: string,
  cancellable: boolean = false
): Promise<QuestionAnswer> => {
  // Cancel the question that we are already asking, if any (e.g., if the user tries to quit OpenCOR while we are asking
  // them whether to save a file that they are closing), since we can only ask one question at a time.

  questionAnswered?.('cancel');

  return new Promise((resolve) => {
    questionAnswered = resolve;
    questionTitle.value = title;
    questionText.value = question;
    questionCancellable.value = cancellable;
    questionYesLabel.value = yesLabel;
    questionNoLabel.value = noLabel;
    questionVisible.value = true;
  });
};

const onQuestionAnswered = (answer: QuestionAnswer): void => {
  const resolve = questionAnswered;

  questionAnswered = null;
  questionVisible.value = false;

  resolve?.(answer);
};

const onQuestionVisibilityUpdated = (visible: boolean): void => {
  if (!visible) {
    onQuestionAnswered('cancel');
  }
};

// Save a file.
// Note #1: only a file that has an editor (i.e. that is open in a view that can edit it) can be modified and therefore
//          saved, but any file can be saved under another name (e.g., a remote file can be saved as a local file).
// Note #2: in OpenCOR, a local file can only be saved where it is if our main process lets us save it (i.e. if the user
//          opened it in some way, or saved it using File|Save As, but not if it was opened using an OpenCOR action, see
//          canSaveFile() in src/main/MainWindow.ts), while in OpenCOR's Web app, a file can only be saved where it is
//          if we have a handle to it (i.e. if it was dropped onto OpenCOR's Web app or saved using File|Save As, and
//          only in Chromium-based Web browsers). Any other file (e.g., a remote file or a file opened using a data URL)
//          gets saved using File|Save As instead.

interface IFileSystemFileHandleWithPermission {
  queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
}

const fileEditor = (fileTab: IFileTab): IFileEditor | undefined => {
  return viewRegistry.fileEditor(fileTab.file);
};

// Determine whether the given file has been modified.
// Note: a file that has unsaved contents (see doSaveFileAs()) may not have an editor (yet), e.g., its views may not
//       have been created yet or its active view may not be one that can edit it, in which case it is still modified.

const isModified = (fileTab: IFileTab): boolean => {
  const editor = fileEditor(fileTab);

  return editor ? editor.modified() : viewRegistry.hasUnsavedContents(fileTab.file);
};

// Mark the given contents of the given file, as retrieved using fileContents(), as saved.
// Note: if the file had no editor when its contents were retrieved, then they are the contents of the file itself,
//       which may be unsaved contents (see doSaveFileAs()), but no longer are.

const markSaved = (file: locApi.File, editor: IFileEditor | undefined, contents: Uint8Array): void => {
  if (editor) {
    editor.markSaved(contents);
  } else {
    viewRegistry.clearUnsavedContents(file);
  }
};

// Determine whether the given contents are the same as the given other contents, i.e. whether they are the same object
// or, if not, whether they have the same length and the same bytes.

const sameContents = (contents: Uint8Array, otherContents: Uint8Array): boolean => {
  return (
    contents === otherContents ||
    (contents.length === otherContents.length && contents.every((byte, index) => byte === otherContents[index]))
  );
};

// Retrieve the contents of the given file, i.e. the contents of its file editor, if any, or the contents that it was
// opened with (e.g., a remote file cannot be edited, but it can still be saved as a local file).

const fileContents = async (
  fileTab: IFileTab,
  editor: IFileEditor | undefined = fileEditor(fileTab)
): Promise<Uint8Array> => {
  return editor ? editor.contents() : fileTab.file.contents();
};

// Determine the name under which to suggest saving the given file.
// Note: a remote file is named after the last part of its URL, which may include a query and/or a fragment, while a
//       COMBINE archive opened using a data URL is named "OMEX #<n>" (see common.OMEX_PREFIX), i.e. without extension.

const suggestedFileName = (fileTab: IFileTab): string => {
  const filePath = fileTab.file.canonicalPath();

  if (common.isUrl(filePath)) {
    return common.fileName(filePath.replace(/[?#].*$/, '')) || common.fileName(filePath);
  }

  if (filePath.startsWith(common.OMEX_PREFIX)) {
    return `${filePath}.omex`;
  }

  return common.fileName(filePath);
};

const isLocalFilePath = (filePath: string): boolean => {
  return (
    !!electronApi &&
    !common.isUrl(filePath) &&
    !common.isDataUrlFileName(filePath) &&
    (filePath.startsWith('/') || filePath.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(filePath))
  );
};

const canBeSavedInPlace = async (fileTab: IFileTab): Promise<boolean> => {
  const filePath = fileTab.file.path();

  return electronApi ? isLocalFilePath(filePath) && (await electronApi.canSaveFile(filePath)) : !!fileTab.fileHandle;
};

// Determine whether the given file tab is for the given file, knowing that its file has the same path (see
// findFileTab()).
// Note: in OpenCOR, a file is known by its (canonical) path, so it is the same file. In OpenCOR's Web app, however, a
//       local file is only known by its name, so it is only the same file if we have a handle to both files and they
//       are the same entry (e.g., two files with the same name may be in different folders).

const isSameFile = async (fileTab: IFileTab, fileHandle: FileSystemFileHandle | undefined): Promise<boolean> => {
  if (electronApi) {
    return true;
  }

  if (!fileTab.fileHandle || !fileHandle) {
    return false;
  }

  try {
    return await fileTab.fileHandle.isSameEntry(fileHandle);
  } catch (_error: unknown) {
    return false;
  }
};

// Determine whether we can write to the given file, asking the user for permission to do so, if needed.
// Note #1: we may only be able to read a file (e.g., if it was dropped onto OpenCOR's Web app, see OpenCOR.vue), in
//          which case the Web browser asks the user whether we can modify it (or, rather, save changes to it).
// Note #2: the Web browser may not support (asking for) permissions (they are only part of the File System Access API),
//          in which case we assume that we can write to the file and let writeFile() fail if we cannot.

const canWriteFile = async (fileHandle: FileSystemFileHandle): Promise<boolean> => {
  const fileHandleWithPermission = fileHandle as unknown as IFileSystemFileHandleWithPermission;

  if (!fileHandleWithPermission.queryPermission || !fileHandleWithPermission.requestPermission) {
    return true;
  }

  return (
    (await fileHandleWithPermission.queryPermission({ mode: 'readwrite' })) === 'granted' ||
    (await fileHandleWithPermission.requestPermission({ mode: 'readwrite' })) === 'granted'
  );
};

const writeFile = async (
  filePath: string,
  fileHandle: FileSystemFileHandle | undefined,
  contents: Uint8Array
): Promise<void> => {
  if (electronApi) {
    await electronApi.saveFile(filePath, contents);
  } else if (fileHandle) {
    const writable = await fileHandle.createWritable();

    try {
      await writable.write(contents as Uint8Array<ArrayBuffer>);
      await writable.close();
    } catch (error: unknown) {
      await writable.abort().catch(() => {});

      throw error;
    }
  }
};

const reportSaveIssue = (fileTab: IFileTab, error: unknown): void => {
  emit(
    'error',
    `${common.fileName(fileTab.file.canonicalPath())} could not be saved (${common.formatMessage(common.formatError(error), false)}).`
  );
};

const reportRenameIssue = (fileTab: IFileTab, newFilePath: string, error: unknown): void => {
  emit(
    'error',
    `${common.fileName(fileTab.file.canonicalPath())} was saved as ${common.fileName(newFilePath)}, but its file tab could not be renamed (${common.formatMessage(common.formatError(error), false)}).`
  );
};

// Outcome of saving a file, i.e. whether it was saved, downloaded (in which case we cannot know whether it was actually
// saved, see doSaveFileAs()), or not saved (e.g., because the user cancelled or an issue occurred).

type SaveOutcome = 'saved' | 'downloaded' | 'notSaved';

// Save the given file, either where it is or under a name of the user's choosing, and return the outcome.
// Note #1: a file may be saved while it is still being saved (e.g., while it is still being written), in which case
//          both saves would otherwise start from the same file tab and complete in any order. For instance, an older
//          version of the file could get written after a newer one (and after its file tab has been closed, i.e.
//          without the user knowing), or its file tab could get renamed using stale information (e.g., the file path of
//          our active file, see doSaveFileAs()). Similarly, a file may be saved under the name of a file which file tab
//          is still being saved. So, we save one file at a time, i.e. a file only gets saved once any other file has
//          been saved, at which point all our file tabs are up to date and no file is being written. A file's file tab
//          may also have been closed in the meantime, in which case there is nothing to save.
// Note #2: saving a file under another name may require saving the file which file tab is to be replaced (see
//          doSaveFileAs()), in which case that file must be saved straight away (using doSaveFile()) since it would
//          otherwise only get saved once our file has been saved, i.e. never.

let lastSaveOperation: Promise<unknown> = Promise.resolve();
let runningSaveOperation: { fileTab: IFileTab; operation: Promise<unknown> } | null = null;

const enqueueSaveOperation = (
  fileTab: IFileTab,
  operation: (fileTab: IFileTab) => Promise<SaveOutcome>
): Promise<SaveOutcome> => {
  const res = lastSaveOperation.then(() => {
    if (!fileTabs.value.includes(fileTab)) {
      return 'notSaved';
    }

    const savedFileTab = vue.toRaw(fileTab);
    const savingOperation = operation(fileTab);
    const done = (): void => {
      if (runningSaveOperation?.operation === savingOperation) {
        runningSaveOperation = null;
      }
    };

    runningSaveOperation = { fileTab: savedFileTab, operation: savingOperation };

    savingOperation.then(done, done);

    return savingOperation;
  });

  lastSaveOperation = res.catch(() => undefined);

  return res;
};

// Wait for the given file to be saved, if it is being saved.

const fileSaved = async (fileTab: IFileTab): Promise<void> => {
  if (runningSaveOperation?.fileTab === vue.toRaw(fileTab)) {
    await runningSaveOperation.operation.catch(() => undefined);
  }
};

const saveFile = (fileTab: IFileTab): Promise<SaveOutcome> => {
  return enqueueSaveOperation(fileTab, doSaveFile);
};

const saveFileAs = (fileTab: IFileTab): Promise<SaveOutcome> => {
  return enqueueSaveOperation(fileTab, doSaveFileAs);
};

const doSaveFile = async (fileTab: IFileTab): Promise<SaveOutcome> => {
  // Save the given file, if possible, and return the outcome.

  const file = fileTab.file;
  let editor = fileEditor(fileTab);

  if (!editor && !viewRegistry.hasUnsavedContents(file)) {
    return 'notSaved';
  }

  if (!(await canBeSavedInPlace(fileTab))) {
    return doSaveFileAs(fileTab);
  }

  // Note: we make sure that we can write to the file before retrieving its contents since a Web browser only lets us
  //       ask the user for permission to write to it while handling one of their actions (e.g., a menu item being
  //       clicked), i.e. not too long after it. The file may get an editor in the meantime (see isModified()), hence we
  //       retrieve its editor again.

  let contents: Uint8Array;

  try {
    if (fileTab.fileHandle && !(await canWriteFile(fileTab.fileHandle))) {
      throw new Error('permission to save changes to the file was not granted');
    }

    editor = fileEditor(fileTab);
    contents = await fileContents(fileTab, editor);

    await writeFile(file.path(), fileTab.fileHandle, contents);
  } catch (error: unknown) {
    reportSaveIssue(fileTab, error);

    return 'notSaved';
  }

  markSaved(file, editor, contents);

  return 'saved';
};

const doSaveFileAs = async (fileTab: IFileTab): Promise<SaveOutcome> => {
  // Save the given file under a name of the user's choosing and return the outcome.

  // Let the user choose where to save the file.
  // Note: in OpenCOR's Web app, we can only let the user choose where to save the file if the File System Access API
  //       is available (and allowed, e.g., it isn't in a cross-origin iframe). If it isn't, then we download the file
  //       instead, using its suggested name (see suggestedFileName()), since we cannot know where (and under which
  //       name) it will be downloaded. For the same reason, and since the download may not even happen (e.g., the Web
  //       browser may block it or the user may decline it), we don't consider the file saved, i.e. it remains modified
  //       if it was (but we let the user proceed, e.g., with closing it).

  const oldFilePath = fileTab.file.path();
  const oldFileName = suggestedFileName(fileTab);
  let newFilePath: string | null = null;
  let newFileHandle: FileSystemFileHandle | undefined;

  if (electronApi) {
    try {
      newFilePath = await electronApi.saveFileAs(isLocalFilePath(oldFilePath) ? oldFilePath : oldFileName);
    } catch (error: unknown) {
      reportSaveIssue(fileTab, error);

      return 'notSaved';
    }
  } else {
    const showSaveFilePicker = (window as unknown as common.IWindowWithSaveFilePicker).showSaveFilePicker;

    if (showSaveFilePicker) {
      try {
        newFileHandle = await showSaveFilePicker.call(window, { suggestedName: oldFileName });
        newFilePath = newFileHandle.name;
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return 'notSaved';
        }

        console.warn('OpenCOR: failed to show the save file picker:', common.formatError(error));
      }
    }

    if (!newFileHandle) {
      try {
        common.downloadFile(oldFileName, new Blob([(await fileContents(fileTab)) as Uint8Array<ArrayBuffer>]), '');
      } catch (error: unknown) {
        reportSaveIssue(fileTab, error);

        return 'notSaved';
      }

      return 'downloaded';
    }
  }

  if (!newFilePath) {
    return 'notSaved';
  }

  // Save the file to the chosen file.
  // Note: in OpenCOR, our main process lets us save the chosen file (see saveAs() in src/main/MainWindow.ts), but we
  //       should only be able to save a file that is open (see canSaveFile() in src/main/MainWindow.ts). So, we let our
  //       main process know that we shouldn't be able to save the chosen file if no file tab is for it once we are done
  //       (e.g., if the file couldn't be saved or its file tab was closed while it was being saved). If a file tab is
  //       for it, then it may also be another file tab than ours (e.g., if the user chose not to replace it), in which
  //       case we must still be able to save it.

  try {
    return await saveFileTo(fileTab, newFilePath, newFileHandle);
  } finally {
    if (electronApi && !findFileTab(newFilePath)) {
      electronApi.disallowSavingFile(newFilePath);
    }
  }
};

const saveFileTo = async (
  fileTab: IFileTab,
  newFilePath: string,
  newFileHandle: FileSystemFileHandle | undefined
): Promise<SaveOutcome> => {
  // Save the given file to the given file, which the user chose (see doSaveFileAs()), and return the outcome.

  const oldFilePath = fileTab.file.path();

  // Check whether the file is to be saved where it is or whether another file tab is for the file to which it is to be
  // saved, in which case we ask the user whether to replace it.

  const otherFileTab = findFileTab(newFilePath);

  if (fileTab === otherFileTab) {
    const file = fileTab.file;
    const editor = fileEditor(fileTab);
    let contents: Uint8Array;

    try {
      contents = await fileContents(fileTab, editor);

      await writeFile(newFilePath, newFileHandle, contents);
    } catch (error: unknown) {
      reportSaveIssue(fileTab, error);

      return 'notSaved';
    }

    if (newFileHandle) {
      fileTab.fileHandle = vue.markRaw(newFileHandle);
    }

    markSaved(file, editor, contents);

    return 'saved';
  }

  // Ask the user whether to replace the other file tab, if any.
  // Note: if the other file tab may not be for the file to which we are about to save (see isSameFile()), then we close
  //       it now, asking the user whether to save it if it has been modified (which we do straight away since we are
  //       already saving a file, see enqueueSaveOperation()), and we stop if the user cancels. Otherwise, we close it
  //       once our file has been saved (see below).

  if (otherFileTab) {
    if (
      (await askQuestion(
        'Save As',
        `${common.escapeHtml(common.fileName(otherFileTab.file.canonicalPath()))} is already open. Do you want to replace it?`,
        'Replace',
        'Cancel'
      )) !== 'yes'
    ) {
      return 'notSaved';
    }

    if (!(await isSameFile(otherFileTab, newFileHandle))) {
      if (!(await closeFile(otherFileTab.file.path(), false, doSaveFile))) {
        return 'notSaved';
      }

      await vue.nextTick();
    }
  }

  // Save the file.

  const contents = await fileContents(fileTab).catch((error: unknown) => {
    reportSaveIssue(fileTab, error);

    return null;
  });

  if (!contents) {
    return 'notSaved';
  }

  try {
    await writeFile(newFilePath, newFileHandle, contents);
  } catch (error: unknown) {
    reportSaveIssue(fileTab, error);

    return 'notSaved';
  }

  // Our file tab may have been closed while the file was being saved (e.g., using File|Close), in which case there is
  // nothing left to rename.

  if (!fileTabs.value.includes(fileTab)) {
    return 'saved';
  }

  // Close the other file tab, if it is still open (see above), without asking the user whether to save it since it is
  // for the file that we have just saved and the user wants it replaced.
  // Note: closing a file tab releases its file on the next tick (see closeFile()), so we wait for it to be released
  //       since it has the same path as the file that we are about to create (and, with the C++ version of libOpenCOR,
  //       releasing it would otherwise unmanage our new file).

  if (otherFileTab && fileTabs.value.includes(otherFileTab)) {
    await closeFile(otherFileTab.file.path(), true);
    await vue.nextTick();
  }

  // Replace the file of our file tab with the saved file, which renames our file tab.
  // Note #1: our file tab's views are keyed by the path of its file, so they get recreated for the saved file (and get
  //          unmounted before we release the old file, see closeFile()). This means that we don't need to mark the
  //          file as saved and that, should we fail to replace it, our file tab, which is still for the old file,
  //          remains modified if it was.
  // Note #2: our file may have been edited while it was being saved, in which case those edits would be lost when our
  //          views get recreated from the saved file. So, we create the saved file using the latest contents of our
  //          file (rather than have libOpenCOR retrieve them from disk in OpenCOR, see locCommon.file()) and mark it as
  //          having unsaved contents, so that our file tab remains modified. Our file may also be edited while we
  //          retrieve its latest contents, hence we keep retrieving them until it hasn't been. From there, we must not
  //          await anything until our file has been replaced, so that it cannot be edited in the meantime. Also, our
  //          file may have got an editor since we retrieved the contents that we saved (see isModified()), so we always
  //          use its current editor. Such an editor doesn't know about the contents that we saved, so it considers them
  //          possibly not the latest ones (see IFileEditor), which is why we compare them with the latest contents
  //          rather than check whether they are the same object.
  // Note #3: the old file gets closed and the new file gets opened, as far as people are concerned (and, in the case of
  //          Electron, the old file gets added to our list of recent files).
  // Note #4: the reference to our file tab's element is keyed by the path of its file (see setFileTabRef()), which is
  //          only retrieved when Vue lets us know that the element has been unmounted, i.e. once our file tab has been
  //          renamed. So, the reference for the old path would never be removed (and its element would never stop being
  //          observed by our file tab bar resize observer), hence we remove it (and stop observing it) ourselves.

  let newContents = contents;

  try {
    for (let editor = fileEditor(fileTab); editor?.editedSince(newContents); editor = fileEditor(fileTab)) {
      newContents = await editor.contents();
    }
  } catch (error: unknown) {
    reportRenameIssue(fileTab, newFilePath, error);

    return 'notSaved';
  }

  // Our file tab may have been closed while we were retrieving the latest contents of our file (see above).

  if (!fileTabs.value.includes(fileTab)) {
    return 'saved';
  }

  // Another file tab may have been opened for the saved file since we checked (see above), e.g., the user may have
  // opened it or saved another file under its name, in which case we cannot rename our file tab (since a file can only
  // have one file tab).

  const destinationFileTab = findFileTab(newFilePath);

  if (destinationFileTab && destinationFileTab !== fileTab) {
    reportRenameIssue(fileTab, newFilePath, new Error('the file is already open in another file tab'));

    return 'notSaved';
  }

  let newFile: locApi.File;

  try {
    newFile = new locApi.File(newFilePath, newContents);
  } catch (error: unknown) {
    reportRenameIssue(fileTab, newFilePath, error);

    return 'notSaved';
  }

  if (!sameContents(newContents, contents)) {
    viewRegistry.markUnsavedContents(newFile);
  }

  const oldFile = fileTab.file;
  const oldCanonicalFilePath = oldFile.canonicalPath();
  const oldFileHandle = fileTab.fileHandle;

  locApi.fileManager.unmanage(oldFilePath);

  const oldFileTabElement = fileTabRefs[oldFilePath];

  if (oldFileTabElement) {
    fileTabBarResizeObserver.unobserve(oldFileTabElement);
  }

  delete fileTabRefs[oldFilePath];

  fileTab.file = newFile;
  fileTab.uiJson = newFile.uiJson();
  fileTab.fileHandle = newFileHandle ? vue.markRaw(newFileHandle) : undefined;

  if (activeFile.value === oldFilePath) {
    activeFile.value = newFilePath;
  }

  void vue.nextTick().then(() => {
    oldFile.release();
  });

  electronApi?.fileClosed(oldCanonicalFilePath);

  emit('fileClosed', oldFilePath, oldFileHandle);

  electronApi?.fileOpened(newFilePath, newFile.canonicalPath());

  emit('fileOpened', newFilePath);

  return 'saved';
};

const activeFileTab = (): IFileTab | undefined => {
  return fileTabs.value.find((fileTab) => fileTab.file.path() === activeFile.value);
};

const saveCurrentFile = async (): Promise<void> => {
  const fileTab = activeFileTab();

  if (fileTab && isModified(fileTab)) {
    await saveFile(fileTab);
  }
};

const saveCurrentFileAs = async (): Promise<void> => {
  const fileTab = activeFileTab();

  if (fileTab) {
    await saveFileAs(fileTab);
  }
};

// Ask the user whether to save the given (modified) file and return whether it was saved or the user chose not to save
// it, or null if they cancelled or if the file couldn't be saved.
// Note #1: the file may get edited while it is being saved (our question dialog is then closed), in which case it is
//          still modified once saved. So, we ask again, so that those edits don't get lost (e.g., when closing the file
//          or quitting OpenCOR) without the user having been asked about them.
// Note #2: in OpenCOR's Web app, a file may get downloaded rather than saved (see doSaveFileAs()), in which case it
//          remains modified. There is therefore no point in asking again, so we consider that the user chose not to
//          save it, i.e. that they accept to lose its changes should they not have downloaded it after all.
// Note #3: we determine whether the file is still modified straight after it has been saved, i.e. without awaiting
//          anything, so that it cannot be edited before our caller proceeds (e.g., closes the file).
// Note #4: same as for closeFile() when it comes to the function used to save the file.

type SaveDecision = 'saved' | 'leftUnsaved';

const askToSaveFile = async (
  fileTab: IFileTab,
  title: string,
  save: (fileTab: IFileTab) => Promise<SaveOutcome> = saveFile
): Promise<SaveDecision | null> => {
  const fileName = common.escapeHtml(common.fileName(fileTab.file.canonicalPath()));
  let question = `${fileName} has been modified. Do you want to save it?`;

  for (;;) {
    const answer = await askQuestion(title, question, 'Save', "Don't Save", true);

    if (answer === 'cancel') {
      return null;
    }

    if (answer === 'no') {
      return 'leftUnsaved';
    }

    const outcome = await save(fileTab);

    if (outcome === 'notSaved') {
      return null;
    }

    if (outcome === 'downloaded') {
      return 'leftUnsaved';
    }

    if (!fileTabs.value.includes(fileTab) || !isModified(fileTab)) {
      return 'saved';
    }

    question = `${common.escapeHtml(common.fileName(fileTab.file.canonicalPath()))} has been modified while it was being saved. Do you want to save it again?`;
  }
};

// Return the path of the files that have been modified.

const modifiedFilePaths = (): string[] => {
  return fileTabs.value.filter((fileTab) => isModified(fileTab)).map((fileTab) => fileTab.file.path());
};

// Ask the user whether to save the files that have been modified, one after the other, and return the path of the files
// that are still modified (i.e. that the user chose not to save, see askToSaveFile()), or null as soon as the user
// cancels or a file couldn't be saved (e.g., so that OpenCOR doesn't get quit).
// Note #1: we select a file before asking about it, so that the user can see which file we are asking about.
// Note #2: we don't ask about the given files, which the user has already chosen not to save (e.g., before a previous
//          call), even if they have been edited since.
// Note #3: a file may get edited while we are saving another one, so we keep looking for a file to ask about until all
//          the files that are still modified are files that the user chose not to save. We look for such a file in our
//          current file tabs since saving a file under another name may replace (i.e. close) another file tab and
//          rename its own file tab (see doSaveFileAs()).
// Note #4: we return straight after having found that there is no file left to ask about, i.e. without awaiting
//          anything, so that no file can be edited before our caller proceeds (e.g., quits OpenCOR).

const saveModifiedFiles = async (title: string, leftUnsavedFilePaths: string[] = []): Promise<string[] | null> => {
  const leftUnsavedFilePathsSet = new Set(leftUnsavedFilePaths);

  for (;;) {
    const fileTab = fileTabs.value.find(
      (fileTab) => isModified(fileTab) && !leftUnsavedFilePathsSet.has(fileTab.file.path())
    );

    if (!fileTab) {
      return modifiedFilePaths();
    }

    await selectFile(fileTab.file.path());

    const decision = await askToSaveFile(fileTab, title);

    if (decision === null) {
      return null;
    }

    if (decision === 'leftUnsaved') {
      leftUnsavedFilePathsSet.add(fileTab.file.path());
    }
  }
};

const canSaveCurrentFile = (): boolean => {
  const fileTab = activeFileTab();

  return !!fileTab && isModified(fileTab);
};

const canSaveCurrentFileAs = (): boolean => {
  return !!activeFileTab();
};

const setFileTabRef = (filePath: string, element: HTMLElement | null): void => {
  const oldElement = fileTabRefs[filePath];

  if (oldElement && oldElement !== element) {
    fileTabBarResizeObserver.unobserve(oldElement);
  }

  if (element) {
    fileTabRefs[filePath] = element;

    fileTabBarResizeObserver.observe(element);
  } else {
    // The file tab has been unmounted, so remove the reference to avoid keeping stale keys (and elements) around.

    delete fileTabRefs[filePath];
  }
};

const onDragStart = (event: DragEvent, filePath: string): void => {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', filePath);
  }

  if (activeFile.value !== filePath) {
    // Make sure that the dragged file tab is selected.

    activeFile.value = filePath;
  }

  dragState.value = {
    filePath,
    dropTarget: null,
    dropPosition: null
  };
};

const onDragOver = (event: DragEvent): void => {
  if (!dragState.value || !event.dataTransfer) {
    return;
  }

  event.dataTransfer.dropEffect = 'move';

  // Only show the drop indicator when the mouse is within the file tab bar bounds.

  const fileTabBar = fileTabBarRef.value;
  const fileTabBarRect = fileTabBar?.getBoundingClientRect();

  if (fileTabBarRect) {
    const tolerance = 4;

    if (event.clientY < fileTabBarRect.top - tolerance || event.clientY > fileTabBarRect.bottom + tolerance) {
      dragState.value = {
        ...dragState.value,
        dropPosition: null,
        dropTarget: null
      };
      dropIndicatorLeft.value = null;

      return;
    }
  }

  // Find the file tab which horizontal centre is closest to the mouse.

  const draggedFilePath = dragState.value.filePath;
  let closestFileTab: string | null = null;
  let closestDistance = Infinity;
  let dropPosition: 'before' | 'after' = 'before';

  for (const fileTab of fileTabs.value) {
    const filePath = fileTab.file.path();

    if (filePath === draggedFilePath) {
      continue;
    }

    const element = fileTabRefs[filePath];

    if (!element) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    const middleX = rect.left + 0.5 * rect.width;
    const distance = Math.abs(event.clientX - middleX);

    if (distance < closestDistance) {
      closestFileTab = filePath;
      closestDistance = distance;
      dropPosition = event.clientX < middleX ? 'before' : 'after';
    }
  }

  dragState.value = {
    ...dragState.value,
    dropPosition: closestFileTab ? dropPosition : null,
    dropTarget: closestFileTab
  };

  // Compute the pixel position for the standalone drop indicator.

  if (fileTabBar && fileTabBarRect && closestFileTab) {
    const targetElement = fileTabRefs[closestFileTab];

    if (targetElement) {
      const targetRect = targetElement.getBoundingClientRect();

      dropIndicatorLeft.value =
        (dropPosition === 'before' ? targetRect.left : targetRect.right) - fileTabBarRect.left + fileTabBar.scrollLeft;
    }
  } else {
    dropIndicatorLeft.value = null;
  }
};

const onDrop = (event: DragEvent): void => {
  event.preventDefault();

  if (!dragState.value) {
    return;
  }

  const { filePath: draggedFilePath, dropPosition, dropTarget } = dragState.value;

  dragState.value = null;
  dropIndicatorLeft.value = null;

  if (!draggedFilePath || !dropPosition || !dropTarget || draggedFilePath === dropTarget) {
    return;
  }

  const draggedIndex = fileTabs.value.findIndex((fileTab) => {
    return fileTab.file.path() === draggedFilePath;
  });
  let targetIndex = fileTabs.value.findIndex((fileTab) => {
    return fileTab.file.path() === dropTarget;
  });

  if (draggedIndex === -1 || targetIndex === -1) {
    return;
  }

  // Remove the dragged item.

  const [draggedItem] = fileTabs.value.splice(draggedIndex, 1);

  // Recalculate the target index after the removal.

  targetIndex = fileTabs.value.findIndex((fileTab) => {
    return fileTab.file.path() === dropTarget;
  });

  // Insert the dragged item at the correct position.

  fileTabs.value.splice(dropPosition === 'before' ? targetIndex : targetIndex + 1, 0, draggedItem);
};

const onDragEnd = (): void => {
  dragState.value = null;
  dropIndicatorLeft.value = null;
};

const onWheel = (event: WheelEvent): void => {
  const fileTabBar = fileTabBarRef.value;

  if (!fileTabBar) {
    return;
  }

  fileTabBar.scrollLeft += event.deltaY;
};

// Add some external data to the current simulation experiment view.

const addExternalData = async (
  csv: string,
  voiExpression: string | undefined,
  modelParameters: string[]
): Promise<IOpenCORExternalDataEvent> => {
  const simulationExperimentInteractiveView = simulationExperimentInteractiveViewRef.value;

  if (!simulationExperimentInteractiveView) {
    return Promise.resolve({
      type: 'issue',
      csv,
      issues: ['No simulation experiment view available.']
    });
  }

  return simulationExperimentInteractiveView
    .addExternalData(csv, voiExpression, modelParameters)
    .catch((error: unknown) => {
      return {
        type: 'issue',
        csv,
        issues: [common.formatError(error)]
      };
    });
};

// Retrieve some simulation data from the current simulation experiment view.

const simulationData = (modelParameters: string[]): Promise<IOpenCORSimulationDataEvent> => {
  if (!simulationOnly.value) {
    return Promise.resolve({
      type: 'issue',
      simulationData: common.emptySimulationData(modelParameters),
      issues: ['Simulation data can only be retrieved in simulation-only mode.']
    });
  }

  const simulationExperimentInteractiveView = simulationExperimentInteractiveViewRef.value;

  if (!simulationExperimentInteractiveView) {
    return Promise.resolve({
      type: 'issue',
      simulationData: common.emptySimulationData(modelParameters),
      issues: ['No simulation experiment view available.']
    });
  }

  return simulationExperimentInteractiveView.simulationData(modelParameters).catch((error: unknown) => {
    return {
      type: 'issue',
      simulationData: common.emptySimulationData(modelParameters),
      issues: [common.formatError(error)]
    };
  });
};

// Some exposed methods.

defineExpose({
  // General methods.

  openFile,

  // Full OpenCOR methods.

  canSaveCurrentFile,
  canSaveCurrentFileAs,
  closeAllFiles,
  closeCurrentFile,
  hasFile,
  hasFiles,
  modifiedFilePaths,
  saveCurrentFile,
  saveCurrentFileAs,
  saveModifiedFiles,
  selectFile,

  // Simulation-only methods.

  addExternalData,
  simulationData
});

// Release the files that are still open once we (and therefore their views) have been unmounted.

vue.onUnmounted(() => {
  for (const fileTab of fileTabs.value) {
    locApi.fileManager.unmanage(fileTab.file.path());

    fileTab.file.release();
  }
});

// Some watchers to let people know about changes to the opened files and the selected file.
// Note: our main process identifies files by their canonical path (see MainWindow.ts).

vue.watch(filePaths, () => {
  electronApi?.filesOpened(fileTabs.value.map((fileTab) => fileTab.file.canonicalPath()));
});

vue.watch(activeFile, (newActiveFile: string) => {
  // Note: activeFile can get updated by clicking on a tab or by calling selectFile(), hence we need to watch it to let
  //       people know that a file has been selected.

  electronApi?.fileSelected(findFileTab(newActiveFile)?.file.canonicalPath() ?? newActiveFile);

  if (!dragState.value) {
    // Make sure that the selected file tab is visible in the file tab bar.

    void vue.nextTick().then(() => {
      const fileTabBar = fileTabBarRef.value;
      const activeFileTab = fileTabRefs[newActiveFile];

      if (!fileTabBar || !activeFileTab) {
        return;
      }

      const fileTabBarRect = fileTabBar.getBoundingClientRect();
      const activeFileTabRect = activeFileTab.getBoundingClientRect();

      if (activeFileTabRect.left < fileTabBarRect.left) {
        fileTabBar.scrollLeft += activeFileTabRect.left - fileTabBarRect.left;
      } else if (activeFileTabRect.right > fileTabBarRect.right) {
        fileTabBar.scrollLeft += activeFileTabRect.right - fileTabBarRect.right;
      }
    });
  }
});

// Keyboard shortcuts.

useOpenCORKeyStroke((event: KeyboardEvent) => {
  if (!fileTabs.value.length) {
    return;
  }

  if (event.ctrlKey && !event.shiftKey && event.code === 'Tab') {
    event.preventDefault();

    selectNextFile();
  } else if (event.ctrlKey && event.shiftKey && event.code === 'Tab') {
    event.preventDefault();

    selectPreviousFile();
  }
});

// Show the name of the selected file, if any, in our window's title (or our browser tab's title), so that the user can
// tell which file is selected when switching between windows (or browser tabs).
// Note #1: we only do this if the title of our document is ours to change (i.e. if OpenCOR is not used as a library,
//          see common.ownDocumentTitle()), and only for full OpenCOR (i.e. not in simulation-only mode).
// Note #2: OpenCOR's window title is that of its renderer's document (since our main process doesn't override it).

if (common.isDocumentTitleOwned() && !simulationOnly.value) {
  const originalTitle = document.title;

  vue.watchEffect(() => {
    const activeFileTab = fileTabs.value.find((fileTab) => fileTab.file.path() === activeFile.value);

    document.title = activeFileTab
      ? `${common.fileName(activeFileTab.file.canonicalPath())} — ${originalTitle}`
      : originalTitle;
  });

  vue.onUnmounted(() => {
    document.title = originalTitle;
  });
}
</script>

<style scoped>
/**
 * File tab bar, which bottom border is drawn using an inset box shadow (rather than a border) so that the active file
 * tab can be drawn over it and therefore look like it is part of the view below it.
 */

.file-tab-bar-container {
  --file-tab-bar-background: var(--p-surface-50);

  position: relative;
}

.opencor-dark-mode .file-tab-bar-container {
  --file-tab-bar-background: var(--p-surface-950);
}

.file-tab-bar {
  position: relative;
  padding: 0.25rem 0.375rem 0;
  background-color: var(--file-tab-bar-background);
  box-shadow: inset 0 -1px 0 var(--p-content-border-color);
  scrollbar-width: none;
}

.file-tab-bar::-webkit-scrollbar {
  display: none;
}

/**
 * Fades at the edges of the file tab bar, to indicate that there are more tabs available.
 * Note: our fades stop just above the bottom border of our file tab bar, so that it doesn't look faded.
 */

.file-tab-bar-fade {
  position: absolute;
  top: 0;
  bottom: 1px;
  z-index: 2;
  width: 2rem;
  pointer-events: none;
}

.file-tab-bar-fade-left {
  left: 0;
  background: linear-gradient(to right, var(--file-tab-bar-background), transparent);
}

.file-tab-bar-fade-right {
  right: 0;
  background: linear-gradient(to left, var(--file-tab-bar-background), transparent);
}

.file-tab {
  position: relative;
  display: flex;
  gap: 0.375rem;
  align-items: center;
  flex-shrink: 0;
  max-width: 16rem;
  height: 1.875rem;
  padding: 0 0.375rem 0 0.75rem;
  border: 1px solid transparent;
  border-top-width: 2px;
  border-bottom: none;
  border-radius: 0.5rem 0.5rem 0 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.file-tab:not(.file-tab-active):hover {
  background-color: color-mix(in srgb, var(--p-text-color) 6%, transparent);
  color: var(--p-text-color);
}

/**
 * Divider between two inactive file tabs, unless one of them is hovered.
 */

.file-tab:not(.file-tab-active) + .file-tab:not(.file-tab-active)::before {
  position: absolute;
  top: 25%;
  bottom: 25%;
  left: -1px;
  width: 1px;
  background-color: var(--p-content-border-color);
  content: "";
}

.file-tab:hover::before,
.file-tab:hover + .file-tab::before {
  opacity: 0;
}

/**
 * Active file tab, which top border is used as an accent (rather than, say, a pseudo-element on top of it) so that it
 * follows the rounded corners of the file tab and blends into its side borders.
 */

.file-tab-active {
  border-color: var(--p-content-border-color);
  border-top-color: var(--p-primary-color);
  background-color: var(--p-content-background);
  color: var(--p-text-color);
}

.file-tab-icon {
  font-size: 0.8125rem;
}

.file-tab-active .file-tab-icon {
  color: var(--p-primary-color);
}

.file-tab-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/**
 * The end of a file tab, which shows our close button and, if our file is modified, a modified indicator. The modified
 * indicator takes the place of our close button, except when our file tab is hovered (or our close button has the
 * keyboard focus), so that our file can still be closed.
 */

.file-tab-end {
  position: relative;
  display: flex;
  flex-shrink: 0;
}

.file-tab-modified-indicator {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.5rem;
  pointer-events: none;
}

.file-tab:hover .file-tab-modified-indicator,
.file-tab-end:has(.file-tab-close-button:focus-visible) .file-tab-modified-indicator {
  visibility: hidden;
}

.file-tab-close-button {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  border: none;
  border-radius: 0.25rem;
  background-color: transparent;
  color: inherit;
  font-size: 0.625rem;
  cursor: pointer;
  opacity: 0;
  transition: background-color 0.15s ease;
}

.file-tab:hover .file-tab-close-button,
.file-tab-active:not(.file-tab-modified) .file-tab-close-button,
.file-tab-close-button:focus-visible {
  opacity: 1;
}

.file-tab-close-button:hover {
  background-color: color-mix(in srgb, var(--p-text-color) 12%, transparent);
  color: var(--p-text-color);
}

.file-tab-close-button:focus-visible {
  box-shadow: 0 0 0 2px var(--p-primary-color);
}

/**
 * Note: on a device without hover (e.g., a tablet), our close button couldn't be revealed before being tapped, yet it
 *       would still be tappable (since it is only transparent), i.e. tapping the end of a file tab could close its file
 *       without our close button ever being seen. So, we always show our close button and, if our file is modified,
 *       our modified indicator next to it (rather than in its place).
 */

@media (hover: none) {
  .file-tab-modified-indicator {
    position: static;
    width: 0.75rem;
  }

  .file-tab:hover .file-tab-modified-indicator,
  .file-tab-end:has(.file-tab-close-button:focus-visible) .file-tab-modified-indicator {
    visibility: visible;
  }

  .file-tab-close-button {
    opacity: 1;
  }
}

.file-tab-dragging {
  opacity: 0.4;
}

.file-tab-drop-indicator {
  position: absolute;
  top: 0.25rem;
  bottom: 0;
  width: 2px;
  border-radius: 1px;
  background-color: var(--p-primary-color);
  pointer-events: none;
  z-index: 10;
}
</style>
