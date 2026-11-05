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
    <BackgroundComponent v-show="!fileTabs.length" class="h-full" />
    <div v-show="fileTabs.length" ref="fileTabBarRef" class="file-tab-bar shrink-0 border-b border-b-primary flex overflow-x-auto"
      @wheel.prevent="onWheel"
    >
      <div v-show="dropIndicatorLeft !== null" class="file-tab-drop-indicator"
        :style="{ left: `${dropIndicatorLeft}px` }"
      />
      <div v-for="fileTab in fileTabs" :key="`tab_${fileTab.file.path()}`" :ref="(element) => setFileTabRef(fileTab.file.path(), element as HTMLElement | null)"
        class="file-tab"
        :class="{
          'file-tab-active': fileTab.file.path() === activeFile,
          'file-tab-dragging': dragState?.filePath === fileTab.file.path()
        }"
        :draggable="true"
        @click="selectFile(fileTab.file.path())"
        @dragstart="onDragStart($event, fileTab.file.path())"
        @dragend="onDragEnd"
      >
        <span class="file-tab-label">{{ common.fileName(fileTab.file.canonicalPath()) }}</span>
        <div class="pi pi-times remove-button" @mousedown.prevent @click.stop="closeFile(fileTab.file.path())" />
      </div>
    </div>
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
  </div>
</template>

<script setup lang="ts">
import * as vue from 'vue';

import type { IOpenCORExternalDataEvent, IOpenCORSimulationDataEvent } from '../../index';

import * as common from '../common/common';
import { electronApi } from '../common/electronApi';
import * as locCommon from '../common/locCommon';
import { useViewRegistry } from '../common/viewRegistry';
import * as locApi from '../libopencor/locApi';

import SimulationExperimentInteractiveView from './views/SimulationExperimentInteractiveView.vue';
import UnsupportedFileTypeView from './views/UnsupportedFileTypeView.vue';
import { useOpenCORContext, useOpenCORKeyStroke } from './OpenCORContext';

interface IFileTab {
  file: locApi.File;
  uiJson?: locApi.IUiJson;
  activeViewId: string;
}

const emit = defineEmits<{
  error: [message: string];
  fileClosed: [filePath: string];
  fileOpened: [filePath: string];
  openFile: [fileFilePathOrFileContents: string];
  simulationData: [];
}>();

const { simulationOnly } = useOpenCORContext();

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
        viewCategory: viewDescriptor.category
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

const onSelectView = (fileTab: IFileTab, viewId: string): void => {
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

const openFile = async (file: locApi.File, wait: boolean = false): Promise<void> => {
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
        : 'simulation-experiment-standard'
  });

  // Select the file and let people know that it has been opened.
  // Note: we let people know before waiting for our file tabs to be updated (see selectFile()) since the file may get
  //       closed in the meantime (e.g., using File|Close), in which case people would otherwise be told that it has been
  //       opened after having been told that it has been closed (and, in the case of Electron, it wouldn't be listed in
  //       our recent files).

  const fileSelected = selectFile(filePath, wait);

  electronApi?.fileOpened(filePath, file.canonicalPath());

  emit('fileOpened', filePath);

  await fileSelected;
};

const closeFile = async (filePath: string): Promise<void> => {
  // Note: there is nothing to close if the file has no file tab, so we don't want to let people know that it has been
  //       closed (and, in the case of Electron, have it added to our list of recent files).

  const fileTabIndex = fileTabs.value.findIndex((fileTab) => fileTab.file.path() === filePath);
  const fileTab = fileTabs.value[fileTabIndex];

  if (!fileTab) {
    return;
  }

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

  emit('fileClosed', filePath);
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

  const currentFilePath = activeFile.value;
  const otherFilePaths = filePaths.value.filter((filePath) => filePath !== currentFilePath);

  for (const filePath of [...otherFilePaths, currentFilePath]) {
    await closeFile(filePath);
  }
};

const setFileTabRef = (filePath: string, element: HTMLElement | null): void => {
  if (element) {
    fileTabRefs[filePath] = element;
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

  closeAllFiles,
  closeCurrentFile,
  hasFile,
  hasFiles,
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
</script>

<style scoped>
.file-tab {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-right: 1px solid var(--p-content-border-color);
  color: var(--p-text-muted-color);
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  flex-shrink: 0;
}

.file-tab:first-of-type {
  border-left: 1px solid var(--p-content-border-color);
}

.file-tab:hover {
  background-color: var(--p-content-hover-background) !important;
}

.file-tab .remove-button {
  visibility: hidden;
}

.file-tab:hover .remove-button,
.file-tab-active .remove-button {
  visibility: visible;
}

.file-tab-active,
.file-tab-active:hover {
  background-color: var(--p-primary-color) !important;
  color: var(--p-primary-contrast-color);
}

.file-tab-bar {
  position: relative;
  scrollbar-width: none;
}

.file-tab-bar::-webkit-scrollbar {
  display: none;
}

.file-tab-dragging {
  opacity: 0.4;
}

.file-tab-drop-indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background-color: var(--p-primary-color);
  pointer-events: none;
  z-index: 10;
}

.remove-button {
  padding: 0.15rem;
  font-size: 0.75rem;
}

.remove-button:hover {
  border-radius: var(--p-border-radius-sm);
  background-color: var(--p-red-500);
  color: var(--p-red-50);
}

.opencor-dark-mode .remove-button:hover {
  background-color: var(--p-red-400);
}
</style>
