<template>
  <div ref="rootRef" class="simulation-experiment-view toolbar-based-view h-full flex flex-col">
    <IssuesView v-if="issues.length" class="m-4 mb-0" style="height: calc(100% - 2rem);" :issues="issues" />
    <template v-else>
      <Toolbar class="p-1! shrink-0">
        <template #start>
          <Button class="p-1! toolbar-button"
            :icon="simulationStatus !== locSedApi.ESedInstanceStatus.RUNNING ? 'pi pi-play-circle' : 'pi pi-pause-circle'"
            text severity="secondary"
            :title="(simulationStatus === locSedApi.ESedInstanceStatus.IDLE ? 'Run' : simulationStatus === locSedApi.ESedInstanceStatus.RUNNING ? 'Pause' : 'Resume') + ' simulation (F9)'"
            @click="onRunPause"
          />
          <Button class="p-1! toolbar-button"
            icon="pi pi-stop-circle"
            text severity="secondary"
            title="Stop simulation"
            :disabled="simulationStatus === locSedApi.ESedInstanceStatus.IDLE"
            @click="onStop"
          />
        </template>
        <template #end>
          <div class="flex gap-1 invisible">
            <Button class="p-1! toolbar-button"
              icon="pi pi-download"
            />
            <Button class="p-1! toolbar-button"
              icon="pi pi-cog"
            />
          </div>
        </template>
      </Toolbar>
      <div class="grow flex flex-col min-h-0">
        <Splitter class="border-none! flex-1 m-0 min-h-0" layout="vertical">
          <SplitterPanel :size="simulationOnly ? 100 : 89">
            <Splitter>
              <SplitterPanel class="ml-4 mr-4 mb-4 min-w-fit" :size="25">
                <ScrollPanel class="h-full">
                  <SimulationPropertyEditor v-if="instanceTask && uniformTimeCourse" :uniformTimeCourse="uniformTimeCourse" :instanceTask="instanceTask" :disabled="simulationSettingsDisabled" />
                  <!-- <SolversPropertyEditor />
                  <GraphsPropertyEditor />
                  <ParametersPropertyEditor /> -->
                  <Fieldset legend="X Axis">
                    <Select
                      v-model="xParameter"
                      editable
                      filter
                      filterMode="lenient"
                      :options="parameters"
                      size="small"
                      class="w-full"
                      :appendTo="appendTarget"
                      @change="onParameterChange"
                    />
                  </Fieldset>
                  <Fieldset legend="Y Axis">
                    <Select
                      v-model="yParameter"
                      editable
                      filter
                      filterMode="lenient"
                      :options="parameters"
                      size="small"
                      class="w-full"
                      :appendTo="appendTarget"
                      @change="onParameterChange"
                    />
                  </Fieldset>
                </ScrollPanel>
              </SplitterPanel>
              <SplitterPanel :size="75">
                <GraphPanelWidget
                  :key="'standard-graph-panel'"
                  :data="data"
                  :showLegend="false"
                />
              </SplitterPanel>
            </Splitter>
          </SplitterPanel>
          <SplitterPanel v-if="!simulationOnly" :size="11">
            <div ref="editorRef" class="h-full console overflow-y-auto px-2 py-1 leading-[1.42] text-[13px]" v-html="consoleContents"></div>
          </SplitterPanel>
        </Splitter>
        <ProgressBar class="h-0.75!" :showValue="false" :value="progress" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import * as vue from 'vue';

import * as colors from '../../common/colors';
import * as common from '../../common/common';
import { MEDIUM_DELAY } from '../../common/constants';
import * as locCommon from '../../common/locCommon';
import * as vueCommon from '../../common/vueCommon';
import * as locApi from '../../libopencor/locApi';
import * as locSedApi from '../../libopencor/locSedApi';

import { useOpenCORContext, useOpenCORKeyStroke } from '../OpenCORContext';
import type { IGraphPanelData } from '../widgets/GraphPanelWidget.vue';

const props = defineProps<{
  file: locApi.File;
  isActiveFile: boolean;
}>();

const emit = defineEmits<{
  simulationData: [];
}>();

const { simulationOnly } = useOpenCORContext();

const rootRef = vue.shallowRef<HTMLElement | null>(null);
const editorRef = vue.shallowRef<HTMLElement | null>(null);
const document = props.file.document();
const documentIssues = document.issues();
const isDocumentValid = documentIssues.length === 0;
const uniformTimeCourse = isDocumentValid ? (document.simulation(0) as locApi.SedUniformTimeCourse) : null;
const instance = isDocumentValid ? document.instantiate() : null;
const issues = documentIssues.length > 0 ? documentIssues : (instance?.issues() ?? []);
const instanceTask = issues.length > 0 ? null : (instance?.task(0) ?? null);
const parameters = vue.ref<string[]>([]);
const xParameter = vue.ref(instanceTask ? instanceTask.voiName() : '');
const yParameter = vue.ref(instanceTask ? instanceTask.stateName(0) : '');

const data = vue.ref<IGraphPanelData>({
  xAxisTitle: instanceTask ? xParameter.value : undefined,
  yAxisTitle: instanceTask ? yParameter.value : undefined,
  traces: []
});

const consoleContents = vue.ref<string>(`<b>${props.file.path()}</b>`);
const progress = vue.ref<number>(0);
const simulationStatus = vue.ref<locSedApi.ESedInstanceStatus>(instance?.status() ?? locSedApi.ESedInstanceStatus.IDLE);

const simulationSettingsDisabled = vue.computed<boolean>(() => {
  return simulationStatus.value !== locSedApi.ESedInstanceStatus.IDLE;
});

const runAborted = vue.ref(false);
let progressResetCancel: (() => void) | undefined;
let abortProgressTimer: ReturnType<typeof setTimeout> | undefined;
const appendTarget = vueCommon.useAppendTarget(rootRef as unknown as vue.Ref<HTMLElement | null>);

if (instanceTask) {
  vueCommon.populateParameters(parameters, instanceTask);
}

const xInfo = vue.computed<locCommon.ISimulationDataInfo>(() => {
  return instanceTask ? locCommon.simulationDataInfo(instanceTask, xParameter.value) : locCommon.NoSimulationDataInfo;
});

const yInfo = vue.computed<locCommon.ISimulationDataInfo>(() => {
  return instanceTask ? locCommon.simulationDataInfo(instanceTask, yParameter.value) : locCommon.NoSimulationDataInfo;
});

// Our live data, i.e. the data that we have retrieved so far while a simulation is running.
// Note: while a simulation is running, we only retrieve the data that has been computed since our last update (rather
//       than all of it every time) and store it in some buffers, which we then plot using views of them (so no copy is
//       involved, while only providing GraphPanelWidget with the data that we have retrieved so far). Also, libOpenCOR
//       counts a step as completed just before storing its results, so the last point that we retrieved may not have
//       been stored at the time, which is why we always retrieve it again.

interface ILiveData {
  task: locSedApi.SedInstanceTask;
  xInfo: locCommon.ISimulationDataInfo;
  yInfo: locCommon.ISimulationDataInfo;
  x: Float64Array;
  y: Float64Array;
  size: number;
}

let liveData: ILiveData | null = null;

const retrieveLiveData = (task: locSedApi.SedInstanceTask, dataSize: number): ILiveData => {
  // (Re)create our buffers if needed (e.g., at the start of a simulation run or if the X or Y parameter has changed) or
  // grow them if they are too small.

  if (!liveData || liveData.task !== task || liveData.xInfo !== xInfo.value || liveData.yInfo !== yInfo.value) {
    const capacity = Math.max(dataSize, (uniformTimeCourse?.numberOfSteps() ?? 0) + 1);

    liveData = {
      task,
      xInfo: xInfo.value,
      yInfo: yInfo.value,
      x: new Float64Array(capacity),
      y: new Float64Array(capacity),
      size: 0
    };
  } else if (dataSize > liveData.x.length) {
    const x = new Float64Array(dataSize);
    const y = new Float64Array(dataSize);

    x.set(liveData.x);
    y.set(liveData.y);

    liveData.x = x;
    liveData.y = y;
  }

  // Retrieve the data that has been computed since our last update (as well as our last point, see above).

  const start = Math.max(0, liveData.size - 1);

  if (dataSize > start) {
    const x = locCommon.simulationDataValue(task, liveData.xInfo, start, dataSize).data;
    const y = locCommon.simulationDataValue(task, liveData.yInfo, start, dataSize).data;

    liveData.x.set(x, start);
    liveData.y.set(y, start);

    liveData.size = Math.max(liveData.size, start + Math.min(x.length, y.length));
  }

  return liveData;
};

const updatePlot = (dataSize: number = 0): void => {
  if (!instanceTask) {
    data.value = {
      xAxisTitle: undefined,
      yAxisTitle: undefined,
      traces: []
    };

    return;
  }

  // Specify the range of the X and Y axes if they are the variable of integration. Otherwise, leave the range undefined
  // so that GraphPanelWidget can automatically determine the range based on the data.

  const xAxisRange: [number, number] | undefined =
    uniformTimeCourse && xInfo.value.type === locCommon.ESimulationDataInfoType.VOI
      ? [uniformTimeCourse.outputStartTime(), uniformTimeCourse.outputEndTime()]
      : undefined;

  const yAxisRange: [number, number] | undefined =
    uniformTimeCourse && yInfo.value.type === locCommon.ESimulationDataInfoType.VOI
      ? [uniformTimeCourse.outputStartTime(), uniformTimeCourse.outputEndTime()]
      : undefined;

  // Retrieve the data for the selected X and Y parameters and update the plot.
  // Note: while a simulation is running (i.e. dataSize > 0), we use our live data (see retrieveLiveData()). Otherwise,
  //       we retrieve all the data. With the C++ version of libOpenCOR, that data is a copy that we own, so we can use
  //       it as is. With the WASM version of libOpenCOR, that data is a view of the WASM heap, so we need to copy it.

  let xData: Float64Array;
  let yData: Float64Array;

  if (dataSize > 0) {
    const live = retrieveLiveData(instanceTask, dataSize);

    xData = live.x.subarray(0, live.size);
    yData = live.y.subarray(0, live.size);
  } else {
    liveData = null;

    const ownData = (values: Float64Array): Float64Array => {
      return locApi.cppVersion() ? values : values.slice();
    };

    xData = ownData(locCommon.simulationDataValue(instanceTask, xInfo.value).data);
    yData = ownData(locCommon.simulationDataValue(instanceTask, yInfo.value).data);
  }

  data.value = {
    xAxisTitle: xParameter.value,
    yAxisTitle: yParameter.value,
    xAxisRange,
    yAxisRange,
    traces: [
      {
        name: vueCommon.traceName(undefined, xParameter.value, yParameter.value),
        xValue: xParameter.value,
        x: xData,
        yValue: yParameter.value,
        y: yData,
        color: colors.DEFAULT_COLOR
      }
    ]
  };
};

// Update the plot after the X or Y parameter has changed.
// Note: while a simulation is running or paused, only part of its data has been computed (the rest is either zeros or
//       the data of a previous run), so we only plot the data that has been computed so far (as we do while running,
//       see onRunPause()).

const onParameterChange = (): void => {
  if (instance && simulationStatus.value !== locSedApi.ESedInstanceStatus.IDLE) {
    updatePlot(Math.round(instance.progress() * (uniformTimeCourse?.numberOfSteps() ?? 0)) + 1);
  } else {
    updatePlot();
  }
};

// Release our instance (once it is idle) and our document.
// Note: an instance must not be released while it is running, hence we stop it and wait for it to be idle first.

let isUnmounted = false;
let isWaitingOnRun = false;

const releaseResources = async (): Promise<void> => {
  // Note: we always release our document, even if something goes wrong with our instance (e.g., if libOpenCOR throws an
  //       exception while we wait for it to be idle) since we would otherwise leak it.

  try {
    if (instance) {
      if (instance.status() !== locSedApi.ESedInstanceStatus.IDLE) {
        instance.stopRun();

        await vueCommon.waitWhileRunning(instance).promise;
      }

      instance.release();
    }
  } catch (error: unknown) {
    console.error('OpenCOR: an error occurred while releasing a simulation instance:', common.formatError(error));
  } finally {
    document.release();
  }
};

// A helper function to scroll our console to the bottom.

const scrollConsoleToBottom = (): void => {
  void vue.nextTick().then(() => {
    editorRef.value?.scrollTo({ top: editorRef.value.scrollHeight });
  });
};

// A helper function to report an error in our console.

const addConsoleError = (error: unknown): void => {
  consoleContents.value += `<br />&nbsp;&nbsp;<span style="color: ${colors.REVERTED_PALETTE.Red};"><strong>Error:</strong> ${common.formatMessage(common.formatError(error))}</span>`;

  scrollConsoleToBottom();
};

// Event handlers.

const onRunPause = async (): Promise<void> => {
  // Make sure that we have an instance (we don't if our document has issues).

  if (!instance) {
    return;
  }

  // Retrieve the status of our simulation.
  // Note: this may fail (e.g., if libOpenCOR throws an exception, see the handling of a run error below), in which case
  //       we report the error rather than let it go unnoticed.

  let status: locSedApi.ESedInstanceStatus;

  try {
    status = instance.status();
  } catch (error: unknown) {
    addConsoleError(error);

    return;
  }

  switch (status) {
    case locSedApi.ESedInstanceStatus.RUNNING:
      // Pause the simulation.

      instance.pauseRun();

      simulationStatus.value = locSedApi.ESedInstanceStatus.PAUSED;

      break;
    case locSedApi.ESedInstanceStatus.PAUSED:
      // Resume the simulation.

      instance.resumeRun();

      simulationStatus.value = locSedApi.ESedInstanceStatus.RUNNING;

      break;
    default: {
      // locSedApi.ESedInstanceStatus.IDLE:
      // Reset our abort flag and our live data.
      // Note: our live data is normally reset at the end of a simulation run (see updatePlot()), but not if the run was
      //       aborted or failed, in which case we would otherwise end up plotting (some of) the data of that run.

      runAborted.value = false;
      liveData = null;

      // Start the simulation.

      if (!instance?.startRun()) {
        simulationStatus.value = instance?.status() ?? locSedApi.ESedInstanceStatus.IDLE;

        return;
      }

      simulationStatus.value = instance?.status() ?? locSedApi.ESedInstanceStatus.IDLE;

      // Wait for the simulation to finish, handling pause/resume cycles asynchronously so that the UI remains responsive.

      const numberOfSteps = uniformTimeCourse?.numberOfSteps() ?? 0;
      let lastPlottingAreaUpdateTime = Date.now();

      const { promise: runPromise, cancel: runCancel } = vueCommon.waitWhileRunning(
        instance,
        (newProgress: number) => {
          // Update the progress bar.

          progress.value = newProgress;

          // Update the plotting area only if the progress has changed and a certain amount of time has passed since the
          // last update (to avoid excessive updates).

          if (newProgress === 0) {
            return;
          }

          const now = Date.now();

          if (now - lastPlottingAreaUpdateTime >= MEDIUM_DELAY) {
            updatePlot(Math.round(0.01 * newProgress * numberOfSteps) + 1);

            lastPlottingAreaUpdateTime = now;
          }
        },
        (status) => {
          simulationStatus.value = status;
        },
        runAborted
      );

      // We store the cancel function in a variable so that we can call it on component unmount to avoid writing to
      // stale references after the component is torn down.

      progressResetCancel = runCancel;

      isWaitingOnRun = true;

      let runError: unknown = null;

      try {
        await runPromise;
      } catch (error: unknown) {
        runError = error;
      } finally {
        isWaitingOnRun = false;

        progressResetCancel = undefined;
      }

      // Release our resources if we got unmounted while the simulation was running (see onUnmounted() below).

      if (isUnmounted) {
        await releaseResources();

        return;
      }

      // Handle any error that occurred while waiting for the simulation to finish (e.g., if libOpenCOR threw an
      // exception), in which case we cannot rely on our instance anymore.
      // Note #1: we only know that we couldn't retrieve the status (or progress) of the simulation, which may therefore
      //          still be running (or be paused). So, we try to stop it and wait for it to be idle. Otherwise, our next
      //          run would, for instance, end up pausing the simulation rather than starting a new one (see the
      //          RUNNING case above). If this fails too, then there is nothing more that we can do.
      // Note #2: the run is over either way, so we reset our progress bar and live data, but we keep our plot as is (as
      //          when a run is aborted) so that the user can see how far the simulation went.

      if (runError) {
        isWaitingOnRun = true;

        try {
          instance.stopRun();

          await vueCommon.waitWhileRunning(instance).promise;
        } catch {
          // Our instance cannot be relied upon anymore, so there is nothing more that we can do.
        } finally {
          isWaitingOnRun = false;
        }

        if (isUnmounted) {
          await releaseResources();

          return;
        }

        simulationStatus.value = locSedApi.ESedInstanceStatus.IDLE;
        progress.value = 0;
        liveData = null;

        addConsoleError(runError);

        return;
      }

      // Update the console with any issues that occurred during the simulation, or display the simulation time if it
      // completed successfully.

      if (instance.hasIssues()) {
        instance.issues().forEach((issue: locApi.IIssue) => {
          const color =
            issue.type === locApi.EIssueType.ERROR
              ? colors.REVERTED_PALETTE.Red
              : issue.type === locApi.EIssueType.WARNING
                ? colors.REVERTED_PALETTE.Orange
                : colors.REVERTED_PALETTE.Blue;
          const issueType =
            issue.type === locApi.EIssueType.ERROR
              ? 'Error'
              : issue.type === locApi.EIssueType.WARNING
                ? 'Warning'
                : 'Info';
          const issueDescription = issue.description.replace('Task | ', '');

          consoleContents.value += `<br />&nbsp;&nbsp;<span style="color: ${color};"><strong>${issueType}:</strong> ${issueDescription}</span>`;
        });
      } else {
        const simulationTime = instance.waitForRun();

        consoleContents.value += `<br />&nbsp;&nbsp;<strong>Simulation time:</strong> <span style="color: ${colors.REVERTED_PALETTE.Blue};">${common.formatTime(simulationTime)}</span>`;

        if (runAborted.value) {
          // Reset the progress bar after a short delay (mimicking the normal end of a simulation).

          abortProgressTimer = setTimeout(() => {
            abortProgressTimer = undefined;

            progress.value = 0;
          }, MEDIUM_DELAY);
        }
      }

      if (!runAborted.value) {
        updatePlot();
      }

      scrollConsoleToBottom();
    }
  }
};

const onStop = (): void => {
  runAborted.value = true;

  instance?.stopRun();

  // Note: the simulation status will be updated by the next poll cycle of waitWhileRunning(), so we don't set it here
  //       to avoid a race window where the user could re-trigger a run before the C++ thread has fully stopped.
};

// Initialise the plot on mount.

vue.onMounted(() => {
  updatePlot();
});

// Cancel any pending progress reset timers to avoid writing to stale refs after the component is torn down, and release
// our resources.

vue.onUnmounted(() => {
  isUnmounted = true;

  progressResetCancel?.();

  clearTimeout(abortProgressTimer);

  // Release our resources, unless a simulation run is still waiting on our instance, in which case they will be released
  // by that simulation run once it is done with our instance.

  if (!isWaitingOnRun) {
    releaseResources();
  }
});

// Track whether the view is the currently active view for keyboard shortcut handling.

let isActiveView = true;

vue.onActivated(() => {
  isActiveView = true;
});

vue.onDeactivated(() => {
  isActiveView = false;
});

// Keyboard shortcuts.

useOpenCORKeyStroke((event: KeyboardEvent) => {
  if (!isActiveView) {
    return;
  }

  if (
    props.isActiveFile &&
    issues.length === 0 &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.metaKey &&
    event.code === 'F9'
  ) {
    event.preventDefault();

    onRunPause();
  }
});
</script>
