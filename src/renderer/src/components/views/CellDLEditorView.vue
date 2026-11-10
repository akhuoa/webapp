<template>
  <div class="toolbar-based-view relative h-full flex flex-col">
    <Toolbar class="shrink-0">
      <template #start>
        <ToolbarButtonWidget
          icon="pi pi-info-circle"
          label="Limitations"
          @click="limitationsVisible = true"
        />
      </template>
      <template #end>
        <div class="flex gap-1">
          <ToolbarButtonWidget
            icon="pi pi-chart-line"
            label="Standard simulation"
            :disabled="!client.loaded"
            @click="onExportCombineArchive(EXPORT_KIND_SIMULATE)"
          />
          <ToolbarButtonWidget
            icon="pi pi-download"
            label="Export COMBINE archive"
            :disabled="!client.loaded"
            @click="onExportCombineArchive(EXPORT_KIND_DOWNLOAD)"
          />
        </div>
      </template>
    </Toolbar>
    <div class="grow min-h-0 relative">
      <IssuesView v-if="issues.length" class="m-4" style="height: calc(100% - 2rem);" :issues="issues" />
      <div v-show="!issues.length" ref="containerRef" class="celldl-editor-container h-full" />
      <BlockingMessageComponent v-if="!client.loaded && !issues.length" message="Loading CellDL Editor..." />
    </div>
    <BaseDialog v-model:visible="exportIssuesVisible" :header="exportIssuesTitle" class="w-156">
      <p class="export-issues-text">The diagram couldn't be converted to CellML, so it couldn't be {{ exportIssuesKind === EXPORT_KIND_SIMULATE ? 'simulated' : 'exported' }}.</p>
      <div class="export-issues">
        <IssuesView :issues="exportIssues" :extraSpace="false" />
      </div>
      <template #footer>
        <Button autofocus label="OK" @click="exportIssuesVisible = false" />
      </template>
    </BaseDialog>
    <OkMessageDialog v-model:visible="limitationsVisible" title="Limitations" @ok="limitationsVisible = false">
      <p class="m-0">
        The CellDL Editor view has the following limitations, which come from the
        <a href="https://github.com/CellDL/CellDLEditorComponent" target="_blank" rel="noopener noreferrer">CellDL Editor component</a>:
      </p>
      <ul class="limitations-list">
        <li v-for="(limitation, index) in LIMITATIONS" :key="index">{{ limitation }}</li>
      </ul>
    </OkMessageDialog>
  </div>
</template>

<script setup lang="ts">
import * as vueusecore from '@vueuse/core';

import * as vue from 'vue';

import * as celldl from '../../common/celldl';
import { type ICellDLEditor, type ICellDLEditorClient, useCellDLEditorPool } from '../../common/celldlEditorPool';
import { loadCellDLRuntime } from '../../common/celldlRuntime';
import * as common from '../../common/common';
import { LONG_DELAY } from '../../common/constants';
import { type IFileEditor, useViewRegistry } from '../../common/viewRegistry';
import * as vueCommon from '../../common/vueCommon';
import * as locApi from '../../libopencor/locApi';

import { useOpenCORContext } from '../OpenCORContext';
import { useOpenCORMessage } from '../OpenCORMessage';

// Note: our toolbar-based view styles (see toolbar-based-view.css) are included in our global styles, which live in our
//       shadow root (see src/assets/app.css).

const EXPORT_KIND_DOWNLOAD = 'download';
const EXPORT_KIND_SIMULATE = 'simulate';

const props = defineProps<{
  file: locApi.File;
  isActiveFile: boolean;
}>();

const emit = defineEmits<{
  error: [message: string];
  openFile: [fileFilePathOrFileContents: string];
}>();

// Current limitations of the CellDL Editor view.

const LIMITATIONS = [
  'Only adding, deleting, and moving can be undone.',
  "Undoing all changes doesn't make a file unmodified."
];

const opencorMessage = useOpenCORMessage();
const containerRef = vue.shallowRef<HTMLElement | null>(null);
const issues = vue.ref<locApi.IIssue[]>([]);
const editCount = vue.ref<number>(0);
const exportIssues = vue.ref<locApi.IIssue[]>([]);
const exportIssuesKind = vue.ref<string>(EXPORT_KIND_DOWNLOAD);
const exportIssuesTitle = vue.computed<string>(() => {
  return exportIssuesKind.value === EXPORT_KIND_SIMULATE ? 'Standard Simulation' : 'Export COMBINE Archive';
});
const exportIssuesVisible = vue.ref<boolean>(false);
const limitationsVisible = vue.ref<boolean>(false);
const celldlFileName = common.fileName(props.file.canonicalPath());
const fileData = new TextDecoder().decode(props.file.contents());

// Our view is kept alive, so keep track of whether it is active, i.e. whether it is visible in its file tab.

const isActiveView = vue.ref<boolean>(true);

vue.onActivated(() => {
  isActiveView.value = true;
});

vue.onDeactivated(() => {
  isActiveView.value = false;
});

// Use a CellDL Editor from our pool of CellDL Editors (see common/celldlEditorPool.ts), which handles keyboard events
// whenever we are visible, once our diagram has been loaded (see onMounted() below).
// Note #1: CellDL Editor opens a diagram asynchronously, so it may report an error after we have considered our diagram
//          to be loaded, in which case we consider it unloaded again, i.e. we stop showing CellDL Editor (and stop it
//          from handling keyboard events), disable our export buttons, and stop counting edits.
// Note #2: we only count the edits made once our diagram has been loaded, i.e. not the ones that CellDL Editor might
//          report while opening our diagram.

const pool = useCellDLEditorPool();
const client = vue.reactive({
  container: null,
  active: vue.computed<boolean>(() => props.isActiveFile && isActiveView.value && !issues.value.length),
  activation: 0,
  loaded: false,
  theme: vueCommon.useTheme().theme,
  onError: (message: string): void => {
    client.loaded = false;

    issues.value.push({
      type: locApi.EIssueType.ERROR,
      description: message
    });
  },
  onFileEdited: (): void => {
    if (client.loaded) {
      ++editCount.value;
    }
  }
}) as ICellDLEditorClient;
let editor: ICellDLEditor | null = null;

// Return our (possibly edited) diagram.
// Note: if CellDL Editor couldn't open our diagram, then it doesn't (properly) hold it, so we return the contents of
//       our file instead.

const diagram = async (): Promise<string> => {
  return editor && client.loaded && !issues.value.length ? editor.data() : fileData;
};

// Also count undoing/redoing something as an edit.
// Note #1: CellDL Editor doesn't let us know when something gets undone/redone, so we mirror its handling of the
//          keyboard, i.e. Ctrl/Cmd+Z to undo and Ctrl/Cmd+Shift+Z to redo, but only if our CellDL Editor is to handle
//          keyboard events (see common/celldlEditorPool.ts).
// Note #2: CellDL Editor clears its undo history when it opens a diagram, so there is nothing to undo/redo unless our
//          diagram has been edited since it was loaded. Otherwise, we may still count an undo/redo that doesn't
//          actually do anything (e.g., if everything has already been undone), but we would rather consider our diagram
//          modified when it isn't than the other way round.

let loadedEditCount = 0;

vueusecore.useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (
    pool.targetClient.value === client &&
    editCount.value !== loadedEditCount &&
    common.isCtrlOrCmd(event) &&
    (event.key === 'z' || event.key === 'Z')
  ) {
    ++editCount.value;
  }
});

// Let people know that we can edit our file, so that it can be saved (see ContentsComponent.vue).
// Note: our diagram may get edited while it is being saved (e.g., while our file is being written), in which case it
//       must still be considered modified once saved, hence we keep track of the number of edits that had been made
//       when we asked for some contents, for each contents that we provide (since several of them may be being saved at
//       once, see IFileEditor). We do so before asking for them since an edit made while they are being retrieved may
//       or may not be part of them, in which case we would rather consider our diagram modified when it isn't than the
//       other way round. Also, our file may have unsaved contents (see viewRegistry.markUnsavedContents()), in which
//       case our diagram is modified until it gets saved, i.e. our initial number of saved edits must not match any
//       number of edits (which starts at zero).

const viewRegistry = useViewRegistry();
const savedEditCount = vue.ref<number>(viewRegistry.hasUnsavedContents(props.file) ? -1 : 0);
const contentsEditCounts = new WeakMap<Uint8Array, number>();
const fileEditor: IFileEditor = {
  modified: () => editCount.value !== savedEditCount.value,
  contents: async () => {
    const crtEditCount = editCount.value;
    const res = new TextEncoder().encode(await diagram());

    contentsEditCounts.set(res, crtEditCount);

    return res;
  },
  editedSince: (contents: Uint8Array) => editCount.value !== contentsEditCounts.get(contents),
  markSaved: (contents: Uint8Array) => {
    const contentsEditCount = contentsEditCounts.get(contents);

    if (contentsEditCount !== undefined) {
      savedEditCount.value = contentsEditCount;
    }
  }
};

viewRegistry.registerFileEditor(props.file, fileEditor);

// Let our client be the one that was activated last whenever we become visible or our OpenCOR instance becomes active
// while we are visible, so that our CellDL Editor handles keyboard events if another OpenCOR instance also has a
// visible CellDL Editor view.

const { isActiveApp } = useOpenCORContext();

vue.watch(
  [() => client.active, isActiveApp],
  ([active, activeApp], [prevActive, prevActiveApp]) => {
    if (active && (!prevActive || (activeApp && !prevActiveApp))) {
      pool.activate(client);
    }
  },
  { immediate: true }
);

// Load our CellDL runtime (see common/celldlRuntime.ts), acquire a CellDL Editor from our pool, and open our diagram in
// it, unless our CellDL runtime couldn't be loaded, in which case we report the issue. Release our CellDL Editor when
// we get unmounted.
// Note #1: we may get unmounted while our CellDL runtime is being loaded, in which case we must not acquire a CellDL
//          Editor.
// Note #2: if CellDL Editor fails to get ready, then our pool reports it to us (see setFailed() in
//          common/celldlEditorPool.ts), so there is nothing more for us to do.
// Note #3: Vue doesn't make DOM elements reactive, but we mark our container as raw to be safe since our client is
//          reactive.

let unmounted = false;
const appContext = vue.getCurrentInstance()?.appContext ?? null;

vue.onMounted(async () => {
  try {
    await loadCellDLRuntime();
  } catch (error: unknown) {
    issues.value.push({
      type: locApi.EIssueType.ERROR,
      description: common.formatError(error)
    });

    return;
  }

  if (unmounted) {
    return;
  }

  client.container = containerRef.value ? vue.markRaw(containerRef.value) : null;

  editor = pool.acquire(client, appContext);

  try {
    await editor.open(fileData, celldlFileName);
  } catch {
    return;
  }

  if (!unmounted && !issues.value.length) {
    client.loaded = true;
    loadedEditCount = editCount.value;
  }
});

vue.onBeforeUnmount(() => {
  unmounted = true;

  if (editor) {
    pool.release(editor);
  }

  viewRegistry.unregisterFileEditor(props.file, fileEditor);
});

// Export our (possibly edited) diagram to a COMBINE archive, which we can then either simulate or download.

const onExportCombineArchive = async (kind: string): Promise<void> => {
  try {
    // Get the CellDL data from the editor, which may have been edited by the user.

    const celldlData = await diagram();

    // Initialise our CellML converter, if needed, and then delay briefly so that the user can see that we reached 100%.

    if (!celldl.isConverterInitialised()) {
      opencorMessage.show('Initialising the CellML converter...');

      await celldl.initialiseConverter(opencorMessage.update);
      await common.sleep(LONG_DELAY);
    }

    // Generate the CellML from the CellDL.

    opencorMessage.show('Generating CellML...', false);

    const res = await celldl.cellmlFromCelldl(celldlData, celldlFileName);

    if (!res.cellml) {
      exportIssues.value = res.issues.map((issue) => {
        return {
          type: locApi.EIssueType.ERROR,
          description: issue
        };
      });
      exportIssuesKind.value = kind;
      exportIssuesVisible.value = true;

      return;
    }

    // Generate the COMBINE archive from the CellML and the CellDL, and then either simulate it or download it.

    const combineArchive = celldl.combineArchive(res.cellml, celldlData);

    if (kind === EXPORT_KIND_SIMULATE) {
      emit('openFile', `data:application/zip;base64,${await combineArchive.generateAsync({ type: 'base64' })}`);
    } else {
      common.downloadFile(
        `${common.baseFileName(celldlFileName)}.omex`,
        await combineArchive.generateAsync({ type: 'blob', compression: 'DEFLATE' }),
        'application/zip'
      );
    }
  } catch (error: unknown) {
    emit('error', `Failed to export the CellDL file to a COMBINE archive: ${common.formatError(error)}`);
  } finally {
    opencorMessage.hide();
  }
};
</script>

<style scoped>
.export-issues-text {
  margin: 0 0 0.75rem;
  color: var(--p-text-color);
  font-size: 0.875rem;
  line-height: 1.375rem;
}

/**
 * Note: there may be many issues, in which case they scroll rather than making our dialog taller than our window. Our
 *       issues view scrolls its issues when it is given a height, but not when it is only given a maximum height, so we
 *       let a container scroll it instead (as for the issues popover of our settings dialog, see
 *       SimulationExperimentInteractiveViewSettingsDialog.vue).
 */

.export-issues {
  max-height: min(20rem, 40vh);
  overflow-y: auto;
}

.limitations-list {
  margin: 0.5rem 0 0;
  padding-left: 1.25rem;
  list-style: disc;
}

.limitations-list li + li {
  margin-top: 0.25rem;
}
</style>
