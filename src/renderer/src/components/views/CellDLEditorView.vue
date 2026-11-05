<template>
  <div class="toolbar-based-view relative h-full flex flex-col">
    <Toolbar class="p-1! shrink-0">
      <template #end>
        <div class="flex gap-1">
          <Button class="p-1! toolbar-button"
            icon="pi pi-chart-line"
            text severity="secondary"
            title="Standard simulation"
            :disabled="!client.loaded"
            @click="onExportCombineArchive(EXPORT_KIND_SIMULATE)"
          />
          <Button class="p-1! toolbar-button"
            icon="pi pi-download"
            text severity="secondary"
            title="Export COMBINE archive"
            :disabled="!client.loaded"
            @click="onExportCombineArchive(EXPORT_KIND_DOWNLOAD)"
          />
        </div>
      </template>
    </Toolbar>
    <div class="grow min-h-0 relative">
      <IssuesView v-if="client.issues.length" class="m-4" style="height: calc(100% - 2rem);" :issues="client.issues" />
      <div v-show="!client.issues.length" ref="containerRef" class="celldl-editor h-full" />
      <BlockingMessageComponent v-if="!client.loaded && !client.issues.length" message="Loading CellDL Editor..." />
    </div>
    <BaseDialog v-model:visible="exportIssuesVisible" header="Generating CellML" style="width: 39rem">
      <IssuesView :issues="exportIssues" />
      <template #footer>
        <Button autofocus label="OK" @click="exportIssuesVisible = false" />
      </template>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import * as vue from 'vue';

import * as celldl from '../../common/celldl';
import { type ICellDLEditorClient, useCellDLEditorHost } from '../../common/celldlEditorHost';
import { loadCellDLRuntime } from '../../common/celldlRuntime';
import * as common from '../../common/common';
import { LONG_DELAY } from '../../common/constants';
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

const host = useCellDLEditorHost();
const opencorMessage = useOpenCORMessage();
const containerRef = vue.shallowRef<HTMLElement | null>(null);
const exportIssues = vue.ref<locApi.IIssue[]>([]);
const exportIssuesVisible = vue.ref<boolean>(false);
const celldlFileName = common.fileName(props.file.canonicalPath());

// Our view is kept alive, so keep track of whether it is active, i.e. whether it is visible in its file tab.

const isActiveView = vue.ref<boolean>(true);

vue.onActivated(() => {
  isActiveView.value = true;
});

vue.onDeactivated(() => {
  isActiveView.value = false;
});

// Use our shared CellDL Editor (see common/celldlEditorHost.ts), which shows our diagram when we are visible.

const client = vue.reactive({
  name: celldlFileName,
  container: null,
  data: new TextDecoder().decode(props.file.contents()),
  active: vue.computed<boolean>(() => props.isActiveFile && isActiveView.value),
  activation: 0,
  loaded: false,
  issues: [],
  theme: vueCommon.useTheme().theme
}) as ICellDLEditorClient;

// Let our shared CellDL Editor know whenever we become visible or our OpenCOR instance becomes active while we are
// visible, so that it shows our diagram if another OpenCOR instance also has a visible CellDL Editor view.

const { isActiveApp } = useOpenCORContext();

vue.watch(
  [() => client.active, isActiveApp],
  ([active, activeApp], [prevActive, prevActiveApp]) => {
    if (active && (!prevActive || (activeApp && !prevActiveApp))) {
      host.activate(client);
    }
  },
  { immediate: true }
);

// Load our CellDL runtime (see common/celldlRuntime.ts) and then register ourselves with our shared CellDL Editor,
// unless our CellDL runtime couldn't be loaded, in which case we report the issue.
// Note: we may get unmounted while our CellDL runtime is being loaded, in which case we must not register ourselves.

let unmounted = false;
const appContext = vue.getCurrentInstance()?.appContext ?? null;

vue.onMounted(async () => {
  try {
    await loadCellDLRuntime();
  } catch (error: unknown) {
    client.issues.push({
      type: locApi.EIssueType.ERROR,
      description: common.formatError(error)
    });

    return;
  }

  if (unmounted) {
    return;
  }

  client.container = containerRef.value;

  host.register(client, appContext);
});

vue.onBeforeUnmount(() => {
  unmounted = true;

  host.unregister(client);
});

// Export our (possibly edited) diagram to a COMBINE archive, which we can then either simulate or download.

const onExportCombineArchive = async (kind: string): Promise<void> => {
  try {
    // Get the CellDL data from the editor, which may have been edited by the user.

    const celldlData = await host.clientData(client);

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
