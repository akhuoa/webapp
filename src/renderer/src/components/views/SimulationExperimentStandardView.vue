<template>
  <div ref="rootRef" class="simulation-experiment-view standard-view toolbar-based-view h-full flex flex-col">
    <IssuesView v-if="issues.length" class="m-4 mb-0" style="height: calc(100% - 2rem);" :issues="issues" />
    <template v-else>
      <Toolbar class="shrink-0">
        <template #start>
          <div class="flex gap-1">
            <ToolbarButtonWidget ref="runPauseButtonRef"
              :icon="simulationStatus !== locSedApi.ESedInstanceStatus.RUNNING ? 'pi pi-play-circle' : 'pi pi-pause-circle'"
              :accent="simulationStatus !== locSedApi.ESedInstanceStatus.RUNNING ? 'primary' : 'warning'"
              :label="(simulationStatus === locSedApi.ESedInstanceStatus.IDLE ? 'Run' : simulationStatus === locSedApi.ESedInstanceStatus.RUNNING ? 'Pause' : 'Resume') + ' simulation'"
              shortcut="F9"
              :disabled="isFinishing"
              @click="onRunPause"
            />
            <ToolbarButtonWidget ref="stopButtonRef"
              icon="pi pi-stop-circle"
              accent="danger"
              label="Stop simulation"
              :disabled="isFinishing || simulationStatus === locSedApi.ESedInstanceStatus.IDLE"
              @click="onStop"
            />
            <!--
            Note: our run status is announced by assistive technologies through a visually hidden live region (which
                  must exist before its contents change for them to get announced, and which doesn't affect our
                  layout). That live region doesn't include the progress of a running simulation since it would
                  otherwise get announced every time it changes (our progress bar already exposes it).
            -->
            <span v-if="runStatus" class="run-status" :class="`run-status-${runStatus.type}`" aria-hidden="true">
              <i :class="runStatus.icon"></i>
              <span>{{ runStatus.label }}</span>
            </span>
            <span class="sr-only" role="status">{{ runStatusAnnouncement }}</span>
          </div>
        </template>
        <template #end>
          <div class="flex gap-1 invisible">
            <ToolbarButtonWidget icon="pi pi-download" />
            <ToolbarButtonWidget icon="pi pi-cog" />
          </div>
        </template>
      </Toolbar>
      <ProgressBar class="run-progress" :class="{ 'run-progress-visible': progress > 0 }" aria-label="Simulation progress" :showValue="false" :value="progress" />
      <div class="grow flex flex-col min-h-0">
        <Splitter class="border-none! flex-1 m-0 min-h-0" layout="vertical">
          <SplitterPanel :size="simulationOnly ? 100 : 89">
            <!--
            Note: our side panel is stacked above our plot when we use a narrow layout (see narrowLayout), in which case
                  we use a vertical splitter. A splitter only sizes its panels when it is mounted, hence we remount it
                  when our layout changes.
            -->
            <Splitter :key="narrowLayout ? 'narrow' : 'wide'" :layout="narrowLayout ? 'vertical' : 'horizontal'">
              <SplitterPanel :class="narrowLayout ? 'min-h-24' : 'min-w-56'" :size="narrowLayout ? 40 : 17">
                <ScrollPanel class="h-full">
                  <div class="side-panel">
                    <SimulationPropertyEditor v-if="instanceTask && uniformTimeCourse" :uniformTimeCourse="uniformTimeCourse" :instanceTask="instanceTask" :disabled="simulationSettingsDisabled" />
                    <!-- <SolversPropertyEditor />
                    <GraphsPropertyEditor />
                    <ParametersPropertyEditor /> -->
                    <section class="side-panel-section">
                      <h3 class="opencor-section-title opencor-section-title-small">Plot</h3>
                      <div class="side-panel-fields">
                        <FloatLabel variant="on">
                          <Select
                            v-model="xParameter"
                            ariaLabel="X axis"
                            editable
                            filter
                            filterMode="lenient"
                            :options="parameters"
                            size="small"
                            class="w-full"
                            :appendTo="appendTarget"
                            @change="onParameterChange"
                          />
                          <label>X axis</label>
                        </FloatLabel>
                        <FloatLabel variant="on">
                          <Select
                            v-model="yParameter"
                            ariaLabel="Y axis"
                            editable
                            filter
                            filterMode="lenient"
                            :options="parameters"
                            size="small"
                            class="w-full"
                            :appendTo="appendTarget"
                            @change="onParameterChange"
                          />
                          <label>Y axis</label>
                        </FloatLabel>
                      </div>
                    </section>
                  </div>
                </ScrollPanel>
              </SplitterPanel>
              <SplitterPanel :size="narrowLayout ? 60 : 83">
                <GraphPanelWidget
                  :key="'standard-graph-panel'"
                  :data="data"
                  :showLegend="false"
                />
              </SplitterPanel>
            </Splitter>
          </SplitterPanel>
          <SplitterPanel v-if="!simulationOnly" class="console-panel flex flex-col" :size="11">
            <div class="console-header">
              <span class="opencor-section-title opencor-section-title-small">Console</span>
              <div class="flex gap-0.5">
                <ToolbarButtonWidget
                  v-bind="copyToClipboard.buttonProps('Copy console')"
                  small
                  tooltipAlign="end"
                  @click="copyConsole"
                />
                <ToolbarButtonWidget
                  icon="pi pi-eraser"
                  label="Clear console"
                  small
                  tooltipAlign="end"
                  @click="clearConsole"
                />
              </div>
            </div>
            <div ref="editorRef" class="grow min-h-0 console overflow-y-auto px-3 pb-1.5 leading-[1.42] text-[13px] select-text" v-html="consoleContents"></div>
          </SplitterPanel>
        </Splitter>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import * as vue from 'vue';

import * as colors from '../../common/colors';
import * as common from '../../common/common';
import { MEDIUM_DELAY, STOP_RUN_TIMEOUT, TOAST_LIFE } from '../../common/constants';
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
const runPauseButtonRef = vue.useTemplateRef<{ $el: HTMLElement }>('runPauseButtonRef');
const stopButtonRef = vue.useTemplateRef<{ $el: HTMLElement }>('stopButtonRef');
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

const initialConsoleContents = `<b>${props.file.path()}</b>`;
const consoleContents = vue.ref<string>(initialConsoleContents);
const progress = vue.ref<number>(0);
const simulationStatus = vue.ref<locSedApi.ESedInstanceStatus>(instance?.status() ?? locSedApi.ESedInstanceStatus.IDLE);

// Whether we use a narrow layout, i.e. whether our side panel is stacked above our plot (see our template).

const narrowLayout = vueCommon.useNarrowLayout(rootRef);

// The outcome of our last simulation run, if any, and the status of our simulation, which we show in our toolbar.

interface ILastRun {
  outcome: 'completed' | 'issues' | 'stopped' | 'failed';
  time?: number;
}

const lastRun = vue.ref<ILastRun | null>(null);

// Whether our simulation run is finishing, i.e. whether its run is over, but its results have yet to be plotted and our
// UI to be painted with them (or, if it failed, while we try to stop our instance, for up to STOP_RUN_TIMEOUT, see
// onRunPause()), during which a new run cannot be started (nor our current run be stopped).

const isFinishing = vue.ref<boolean>(false);

// Keep track of whether our Stop button had the keyboard focus when our simulation became idle, i.e. when our Stop
// button got disabled (and therefore lost the keyboard focus), so that we can give the keyboard focus to our Run/Pause
// button once our run is over (see onRunPause()).
// Note: we need to check this synchronously, i.e. before our Stop button gets disabled.

let stopButtonHadFocus = false;

vue.watch(
  simulationStatus,
  (status) => {
    if (status === locSedApi.ESedInstanceStatus.IDLE && stopButtonRef.value?.$el === window.document.activeElement) {
      stopButtonHadFocus = true;
    }
  },
  { flush: 'sync' }
);

// Give the keyboard focus to our Run/Pause button, unless the keyboard focus has gone somewhere else in the meantime
// (i.e. somewhere else than <body> or one of our Run/Pause and Stop buttons, which may keep the keyboard focus once
// disabled, depending on the browser).

const focusRunPauseButton = async (): Promise<void> => {
  await vue.nextTick();

  if (isUnmounted) {
    return;
  }

  const activeElement = window.document.activeElement;

  if (
    !activeElement ||
    activeElement === window.document.body ||
    activeElement === runPauseButtonRef.value?.$el ||
    activeElement === stopButtonRef.value?.$el
  ) {
    runPauseButtonRef.value?.$el?.focus();
  }
};

// Give the keyboard focus back to the simulation setting that was being edited when our run was started using F9, if
// any, once our run is over, since it got blurred so that its value could be committed (see onRunPause()), unless the
// keyboard focus has gone somewhere else in the meantime (i.e. somewhere else than <body>).

let settingBlurredForRun: HTMLElement | null = null;

const focusSettingBlurredForRun = async (): Promise<void> => {
  const setting = settingBlurredForRun;

  settingBlurredForRun = null;

  if (!setting) {
    return;
  }

  await vue.nextTick();

  if (isUnmounted) {
    return;
  }

  const activeElement = window.document.activeElement;

  if (
    (!activeElement || activeElement === window.document.body) &&
    setting.isConnected &&
    !setting.matches(':disabled')
  ) {
    setting.focus();
  }
};

// The status of our simulation run.
// Note: our console is not shown when we are in simulation-only mode, so we only refer to it when it is shown.

const seeConsole = vue.computed<string>(() => {
  return simulationOnly.value ? '' : ' (see console)';
});

const runStatus = vue.computed<{ type: string; icon: string; label: string } | null>(() => {
  const percentage = Math.round(progress.value);

  if (simulationStatus.value === locSedApi.ESedInstanceStatus.RUNNING || isFinishing.value) {
    return { type: 'running', icon: 'pi pi-hourglass', label: `Running... ${percentage}%` };
  }

  if (simulationStatus.value === locSedApi.ESedInstanceStatus.PAUSED) {
    return { type: 'paused', icon: 'pi pi-pause', label: `Paused at ${percentage}%` };
  }

  switch (lastRun.value?.outcome) {
    case 'completed':
      return {
        type: 'completed',
        icon: 'pi pi-check-circle',
        label: `Completed in ${common.formatTime(lastRun.value.time ?? 0)}`
      };
    case 'issues':
      return {
        type: 'issues',
        icon: 'pi pi-exclamation-triangle',
        label: `Completed with issues${seeConsole.value}`
      };
    case 'stopped':
      return { type: 'stopped', icon: 'pi pi-stop-circle', label: 'Stopped' };
    case 'failed':
      return { type: 'failed', icon: 'pi pi-times-circle', label: `Failed${seeConsole.value}` };
    default:
      return null;
  }
});

// Our run status, as announced by assistive technologies (see our template).
// Note: our run status may not change when it is reported (e.g., if our run fails to start after our previous run did
//       too), in which case it wouldn't get announced, so we can clear it and only set it again a bit later (since
//       assistive technologies may not notice a change that is undone straightaway), see reannounceRunStatus().

const runStatusAnnouncementCleared = vue.ref<boolean>(false);
let runStatusAnnouncementTimer: ReturnType<typeof setTimeout> | undefined;

const runStatusAnnouncement = vue.computed<string>(() => {
  if (runStatusAnnouncementCleared.value) {
    return '';
  }

  return runStatus.value?.type === 'running' ? 'Running...' : (runStatus.value?.label ?? '');
});

const reannounceRunStatus = (): void => {
  clearTimeout(runStatusAnnouncementTimer);

  runStatusAnnouncementCleared.value = true;

  runStatusAnnouncementTimer = setTimeout(() => {
    runStatusAnnouncementTimer = undefined;

    runStatusAnnouncementCleared.value = false;
  }, MEDIUM_DELAY);
};

// Consider our run as having failed, making sure that it gets announced (see reannounceRunStatus()).

const markRunAsFailed = (): void => {
  lastRun.value = { outcome: 'failed' };

  reannounceRunStatus();
};

// Hide the status of our last run after a while (i.e. as long as a toast would be shown) if it is only a confirmation
// (i.e. our simulation has either completed or been stopped), but keep it if it requires people's attention (i.e. our
// simulation has issues or has failed).

let runStatusTimer: ReturnType<typeof setTimeout> | undefined;

vue.watch(
  () => runStatus.value?.type,
  (type) => {
    clearTimeout(runStatusTimer);

    if (type === 'completed' || type === 'stopped') {
      runStatusTimer = setTimeout(() => {
        runStatusTimer = undefined;

        lastRun.value = null;
      }, TOAST_LIFE);
    }
  }
);

const simulationSettingsDisabled = vue.computed<boolean>(() => {
  return simulationStatus.value !== locSedApi.ESedInstanceStatus.IDLE;
});

const runAborted = vue.ref(false);
let cancelRunPolling: (() => void) | undefined;
let progressResetTimer: ReturnType<typeof setTimeout> | undefined;
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
// Note #1: while a simulation is running or paused, only part of its data has been computed (the rest is either zeros
//          or the data of a previous run), so we only plot the data that has been computed so far (as we do while
//          running, see onRunPause()).
// Note #2: retrieving the progress of our simulation may fail (e.g., if libOpenCOR throws an exception while a failed
//          run is being stopped, see onRunPause()), in which case we plot all of our data, as if our simulation was
//          idle.

const onParameterChange = (): void => {
  if (instance && simulationStatus.value !== locSedApi.ESedInstanceStatus.IDLE) {
    let progress: number | undefined;

    try {
      progress = instance.progress();
    } catch {
      progress = undefined;
    }

    if (progress !== undefined) {
      updatePlot(Math.round(progress * (uniformTimeCourse?.numberOfSteps() ?? 0)) + 1);

      return;
    }
  }

  updatePlot();
};

// Stop the given instance and wait for it to be idle, but only for up to STOP_RUN_TIMEOUT since it may never be (e.g.,
// if it cannot be stopped after a run error), and return whether it is idle.
// Note: this throws if stopping the instance or retrieving its status fails (e.g., if libOpenCOR throws an exception).

const stopRunAndWait = async (sedInstance: locSedApi.SedInstance): Promise<boolean> => {
  sedInstance.stopRun();

  const { promise, cancel } = vueCommon.waitWhileRunning(sedInstance);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;

    cancel();
  }, STOP_RUN_TIMEOUT);

  try {
    await promise;
  } finally {
    clearTimeout(timer);
  }

  return !timedOut;
};

// Release our instance (once it is idle) and our document.
// Note: an instance must not be released while it is running, hence we stop it and wait for it to be idle first. If it
//       is still not idle after a while (see stopRunAndWait()), then we don't release it (i.e. we leak it rather than
//       release it while it is running, and rather than keep waiting on it forever).

let isUnmounted = false;
let isWaitingOnRun = false;

const releaseResources = async (): Promise<void> => {
  // Note: we always release our document, even if something goes wrong with our instance (e.g., if libOpenCOR throws an
  //       exception while we wait for it to be idle, or if it cannot be stopped) since we would otherwise leak it.

  try {
    if (instance) {
      if (instance.status() !== locSedApi.ESedInstanceStatus.IDLE && !(await stopRunAndWait(instance))) {
        console.error('OpenCOR: a simulation instance could not be stopped, so it could not be released.');

        return;
      }

      instance.release();
    }
  } catch (error: unknown) {
    console.error('OpenCOR: an error occurred while releasing a simulation instance:', common.formatError(error));
  } finally {
    document.release();
  }
};

// Copy the contents of our console, as plain text, to the clipboard, so that they can easily be included in an issue
// report, for instance.
// Note #1: our console uses non-breaking spaces to indent its messages, so we replace them with normal spaces.
// Note #2: our console may change while our copy button lets people know whether it was copied (e.g., if it gets
//          cleared or if a simulation run reports something), in which case we reset our copy button since its
//          feedback would no longer be about our (current) console.

const copyToClipboard = vueCommon.useCopyToClipboard();

const copyConsole = (): void => {
  // biome-ignore lint/performance/useDomNodeTextContent: we need the rendered text (e.g., <br /> as a line break)
  void copyToClipboard.copy((editorRef.value?.innerText ?? '').replace(/\u00a0/g, ' '));
};

vue.watch(consoleContents, () => {
  copyToClipboard.reset();
});

// Clear our console, i.e. only keep its initial contents (i.e. the path of our file).
// Note: the status of our last run may refer to our console (i.e. if our simulation has issues or has failed), in which
//       case we also hide it since our console doesn't contain the details of our last run anymore.

const clearConsole = (): void => {
  consoleContents.value = initialConsoleContents;

  if (lastRun.value?.outcome === 'issues' || lastRun.value?.outcome === 'failed') {
    lastRun.value = null;
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

// A helper function to report the given issues (of our instance) in our console.

const addConsoleIssues = (issues: locApi.IIssue[]): void => {
  issues.forEach((issue: locApi.IIssue) => {
    const color =
      issue.type === locApi.EIssueType.ERROR
        ? colors.REVERTED_PALETTE.Red
        : issue.type === locApi.EIssueType.WARNING
          ? colors.REVERTED_PALETTE.Orange
          : colors.REVERTED_PALETTE.Blue;
    const issueType =
      issue.type === locApi.EIssueType.ERROR ? 'Error' : issue.type === locApi.EIssueType.WARNING ? 'Warning' : 'Info';
    const issueDescription = issue.description.replace('Task | ', '');

    consoleContents.value += `<br />&nbsp;&nbsp;<span style="color: ${color};"><strong>${issueType}:</strong> ${issueDescription}</span>`;
  });

  scrollConsoleToBottom();
};

// Event handlers.

const onRunPause = async (): Promise<void> => {
  // Make sure that we have an instance (we don't if our document has issues) and that our previous run, if any, is not
  // finishing (see isFinishing).

  if (!instance || isFinishing.value) {
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

  // Stop our simulation if it is running (or paused) while we are not waiting on it, i.e. if it could not be stopped
  // after a run error (see Note #4 of the handling of a run error below). Our UI then considers our simulation as idle,
  // i.e. people want to start a new run, which we do once our simulation has been stopped. Otherwise, we would, for
  // instance, pause our simulation, with nothing waiting on it (i.e. our UI would remain paused).
  // Note: as for a run error, we consider our run as finishing while we wait for our simulation to be idle (see Note #3
  //       of the handling of a run error below), and we let people know if it still cannot be stopped.

  if (status !== locSedApi.ESedInstanceStatus.IDLE && !isWaitingOnRun) {
    const runPauseButtonHadFocus = runPauseButtonRef.value?.$el === window.document.activeElement;
    let simulationStopped = false;

    isFinishing.value = true;
    isWaitingOnRun = true;

    try {
      simulationStopped = await stopRunAndWait(instance);
    } catch {
      // Our instance cannot be relied upon, so there is nothing more that we can do, except let people know (see
      // below).
    } finally {
      isWaitingOnRun = false;
    }

    if (isUnmounted) {
      await releaseResources();

      return;
    }

    isFinishing.value = false;

    if (runPauseButtonHadFocus) {
      void focusRunPauseButton();
    }

    if (!simulationStopped) {
      markRunAsFailed();

      addConsoleError('the simulation could not be stopped');

      return;
    }

    status = locSedApi.ESedInstanceStatus.IDLE;
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
      // locSedApi.ESedInstanceStatus.IDLE.

      // Make sure that we are not still waiting on our previous run, if any.
      // Note: our instance may be idle before waitWhileRunning() has noticed it (it polls our instance), in which case
      //       starting a new run would have our previous run (which is still waiting) also wait on our new run, and
      //       then report its outcome too.

      if (isWaitingOnRun) {
        return;
      }

      // Commit the value that is being edited in one of our simulation settings, if any, so that our simulation is run
      // with it.
      // Note #1: our simulation settings only commit their value when they lose the focus (or when Enter is pressed).
      //          Our Run/Pause button takes care of this when it is pressed (see ToolbarButtonWidget.vue), but not when
      //          our run is started using F9, in which case our simulation would otherwise be run with the previous
      //          value, and the new value would get committed later on (e.g., while our simulation is running).
      // Note #2: we only do this for our simulation settings (see PropertyEditor.vue), i.e. not for our other input
      //          fields (e.g., the X and Y axis selects of our plot), since those commit their value as it is typed and
      //          remain enabled while our simulation is running, so they would only lose the keyboard focus.
      // Note #3: we give the keyboard focus back to our simulation setting once our run is over (see
      //          focusSettingBlurredForRun()).

      const activeElement = window.document.activeElement;

      settingBlurredForRun = null;

      if (
        activeElement instanceof HTMLElement &&
        activeElement.matches('.property-editor input') &&
        rootRef.value?.contains(activeElement)
      ) {
        settingBlurredForRun = activeElement;

        activeElement.blur();
      }

      // Reset our abort flag, our live data, the outcome of our last run, and whether our Stop button had the keyboard
      // focus.
      // Note: our live data is normally reset at the end of a simulation run (see updatePlot()), but not if the run was
      //       aborted or failed, in which case we would otherwise end up plotting (some of) the data of that run.

      runAborted.value = false;
      liveData = null;
      lastRun.value = null;
      stopButtonHadFocus = false;

      // Cancel the reset of our progress bar by our previous run, if any, so that it doesn't reset the progress bar of
      // our new run, and reset it ourselves (in case our new run fails to start).

      clearTimeout(progressResetTimer);

      progressResetTimer = undefined;
      progress.value = 0;

      // Start the simulation.
      // Note: our simulation may fail to start (e.g., if its settings are not valid), in which case we consider our run
      //       as having failed and we report why, i.e. the issues of our instance, if any, or the error thrown by
      //       libOpenCOR, if any. Otherwise, the status of our previous run (which we have just reset) would disappear
      //       without any explanation.

      try {
        if (!instance.startRun()) {
          const instanceIssues = instance.hasIssues() ? instance.issues() : [];

          simulationStatus.value = locSedApi.ESedInstanceStatus.IDLE;

          markRunAsFailed();

          if (instanceIssues.length) {
            addConsoleIssues(instanceIssues);
          } else {
            addConsoleError('the simulation could not be started');
          }

          void focusSettingBlurredForRun();

          return;
        }
      } catch (error: unknown) {
        simulationStatus.value = locSedApi.ESedInstanceStatus.IDLE;

        markRunAsFailed();

        addConsoleError(error);

        void focusSettingBlurredForRun();

        return;
      }

      // Retrieve the status of our simulation.
      // Note: this may fail (e.g., if libOpenCOR throws an exception), in which case we consider our simulation as
      //       running since it has been started, and let waitWhileRunning() retrieve its status (and the error get
      //       reported if its status still cannot be retrieved, see the handling of a run error below).

      try {
        simulationStatus.value = instance.status();
      } catch {
        simulationStatus.value = locSedApi.ESedInstanceStatus.RUNNING;
      }

      // Wait for the simulation to finish, handling pause/resume cycles asynchronously so that the UI remains
      // responsive.

      const numberOfSteps = uniformTimeCourse?.numberOfSteps() ?? 0;
      let lastPlottingAreaUpdateTime = Date.now();
      let runIsOver = false;

      const { promise: runPromise, cancel: runCancel } = vueCommon.waitWhileRunning(
        instance,
        (newProgress: number) => {
          // Update the progress bar, unless our run is over, in which case we take care of it (see below), i.e. we
          // ignore the (delayed) reset of the progress bar by waitWhileRunning(), which could otherwise reset the
          // progress bar of our next run.

          if (runIsOver) {
            return;
          }

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

      // We keep the cancel function so that, on unmount, we can stop polling, i.e. stop waiting on our run and release
      // our resources (see below).
      // Note: the delayed reset of our progress bar by waitWhileRunning() is not cancelled on unmount since our cancel
      //       function is forgotten as soon as our run is over, but it is ignored anyway (see runIsOver above).

      cancelRunPolling = runCancel;

      isWaitingOnRun = true;

      let runError: unknown = null;

      try {
        await runPromise;
      } catch (error: unknown) {
        runError = error;
      } finally {
        runIsOver = true;
        isWaitingOnRun = false;

        cancelRunPolling = undefined;
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
      // Note #3: we consider our run as finishing while we wait for our instance to be idle, so that our Run/Pause
      //          button (and its F9 shortcut) cannot, in the meantime, start a new run, which we would otherwise end up
      //          waiting for and then reporting as having failed, and so that our Stop button cannot be used to stop
      //          our instance again.
      // Note #4: our instance may never be idle (e.g., if it cannot be stopped), in which case our Run/Pause button
      //          would remain disabled for good, so we only wait for so long. We then let people know that our
      //          simulation could not be stopped since it may still be running (or be paused), in which case we try to
      //          stop it again when people next try to start a new run (see the beginning of onRunPause()). We do the
      //          same if stopping our simulation (or retrieving its status) fails since we cannot then know whether it
      //          has been stopped.
      // Note #5: our Stop button gets disabled (see Note #3) before our simulation status is set to idle, i.e. before
      //          we would normally know whether it had the keyboard focus (see stopButtonHadFocus), hence we check it
      //          here.

      let runPauseButtonHadFocus = false;

      if (runError) {
        runPauseButtonHadFocus = runPauseButtonRef.value?.$el === window.document.activeElement;
        stopButtonHadFocus ||= stopButtonRef.value?.$el === window.document.activeElement;

        isFinishing.value = true;
        isWaitingOnRun = true;

        let simulationMayNotBeStopped = false;

        try {
          simulationMayNotBeStopped = !(await stopRunAndWait(instance));
        } catch {
          // Our instance cannot be relied upon anymore, so there is nothing more that we can do, except let people know
          // (see Note #4).

          simulationMayNotBeStopped = true;
        } finally {
          isWaitingOnRun = false;
        }

        if (isUnmounted) {
          await releaseResources();

          return;
        }

        isFinishing.value = false;
        simulationStatus.value = locSedApi.ESedInstanceStatus.IDLE;
        progress.value = 0;
        liveData = null;
        lastRun.value = { outcome: 'failed' };

        addConsoleError(runError);

        if (simulationMayNotBeStopped) {
          addConsoleError('the simulation could not be stopped');
        }

        if (runPauseButtonHadFocus || stopButtonHadFocus) {
          void focusRunPauseButton();
        }

        void focusSettingBlurredForRun();

        return;
      }

      // Let people see that our simulation has completed (i.e. that its progress is 100%) before we retrieve and plot
      // its results, which may take a while (e.g., for a long simulation) and during which our UI cannot be updated.
      // Note: we wait for our UI to be painted with a progress of 100%. We also need to be told if we get unmounted in
      //       the meantime, in which case our resources have to be released by us (see onUnmounted() below).

      if (!runAborted.value) {
        runPauseButtonHadFocus = runPauseButtonRef.value?.$el === window.document.activeElement;
        isFinishing.value = true;
        progress.value = 100;
        isWaitingOnRun = true;

        await common.waitForNextPaint();

        isWaitingOnRun = false;

        if (isUnmounted) {
          await releaseResources();

          return;
        }
      }

      // Retrieve and report the outcome of our simulation, and plot its results.
      // Note: this may fail (e.g., if libOpenCOR throws an exception), in which case we report the error, and still
      //       finish our run (see below), so that a new run can be started.

      try {
        // Update the console with any issues that occurred during the simulation, or display the simulation time if it
        // completed successfully.
        // Note: a simulation that was stopped may also have issues, in which case it is considered as having failed if
        //       one of them is an error, and as having been stopped otherwise.

        if (instance.hasIssues()) {
          const instanceIssues = instance.issues();

          lastRun.value = {
            outcome: instanceIssues.some((issue: locApi.IIssue) => issue.type === locApi.EIssueType.ERROR)
              ? 'failed'
              : runAborted.value
                ? 'stopped'
                : 'issues'
          };

          addConsoleIssues(instanceIssues);
        } else {
          const simulationTime = instance.waitForRun();

          lastRun.value = runAborted.value ? { outcome: 'stopped' } : { outcome: 'completed', time: simulationTime };

          consoleContents.value += `<br />&nbsp;&nbsp;<strong>Simulation time:</strong> <span style="color: ${colors.REVERTED_PALETTE.Blue};">${common.formatTime(simulationTime)}</span>`;
        }

        if (runAborted.value) {
          // Reset the progress bar after a short delay (mimicking the normal end of a simulation).

          progressResetTimer = setTimeout(() => {
            progressResetTimer = undefined;

            progress.value = 0;
          }, MEDIUM_DELAY);
        } else {
          updatePlot();
        }
      } catch (error: unknown) {
        // Reset our live data and, if our run was aborted (i.e. it is not finishing), our progress bar (otherwise, it
        // gets reset below).

        liveData = null;

        if (!isFinishing.value) {
          progress.value = 0;
        }

        lastRun.value = { outcome: 'failed' };

        addConsoleError(error);
      }

      // Our run is over and its results, if any, have been plotted, so reset our progress bar after a short delay, so
      // that people can see that our simulation has completed.
      // Note: our plot gets rendered after our UI has been updated, which may also take a while, so we wait for it to
      //       be rendered before starting our delay (otherwise our delay may be over before our UI gets rendered
      //       again).

      if (isFinishing.value) {
        await common.waitForNextPaint();

        if (isUnmounted) {
          return;
        }

        isFinishing.value = false;

        // Give the keyboard focus (back) to our Run/Pause button if it or our Stop button had it before it got disabled
        // (and therefore lost it).

        if (runPauseButtonHadFocus || stopButtonHadFocus) {
          await focusRunPauseButton();

          if (isUnmounted) {
            return;
          }
        }

        progressResetTimer = setTimeout(() => {
          progressResetTimer = undefined;

          progress.value = 0;
        }, MEDIUM_DELAY);
      } else if (stopButtonHadFocus) {
        // Our run was stopped, so give the keyboard focus to our Run/Pause button if our Stop button had it before it
        // got disabled (and therefore lost it).

        void focusRunPauseButton();
      }

      // Give the keyboard focus back to the simulation setting that was being edited when our run was started using F9,
      // if any (and if the keyboard focus hasn't been given to our Run/Pause button above).

      void focusSettingBlurredForRun();

      scrollConsoleToBottom();
    }
  }
};

const onStop = (): void => {
  runAborted.value = true;

  instance?.stopRun();

  // Note: the simulation status will be updated by the next poll cycle of waitWhileRunning(), i.e. once our simulation
  //       is actually idle. Setting it here would have our Run/Pause button say "Run" while pressing it would still
  //       pause our (not yet stopped) simulation.
};

// Initialise the plot on mount.

vue.onMounted(() => {
  updatePlot();
});

// Stop polling our simulation run, if any, cancel our pending timers (progress reset and run status), and release our
// resources (unless a simulation run is still waiting on our instance, see below).

vue.onUnmounted(() => {
  isUnmounted = true;

  cancelRunPolling?.();

  clearTimeout(progressResetTimer);
  clearTimeout(runStatusTimer);
  clearTimeout(runStatusAnnouncementTimer);

  // Release our resources, unless a simulation run is still waiting on our instance, in which case they will be
  // released by that simulation run once it is done with our instance.

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

<style scoped>
/**
 * Console, which always shows a few lines (e.g., when our view is not very tall, like on a phone in landscape mode),
 * and which wraps long lines (e.g., the URL of our file), so that it never needs to be scrolled horizontally.
 */

.console-panel {
  min-height: 6rem;
}

.console {
  overflow-wrap: anywhere;
}

/**
 * Side panel, i.e. our simulation settings and the parameters to plot.
 * Note: an input field has an intrinsic width (of about 20 characters), which would otherwise prevent our side panel
 *       from being narrower than that, so we let our number fields shrink to the width of our side panel.
 */

.side-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1rem;
}

.side-panel :deep(.p-inputnumber-input) {
  flex: 1 1 auto;
  width: 0;
  min-width: 0;
}

.side-panel-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.side-panel-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 0.375rem;
}

/**
 * Status of our simulation, which is shown next to our run/pause and stop buttons.
 */

.run-status {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-left: 0.5rem;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.run-status .pi {
  font-size: 0.8125rem;
}

.run-status-running .pi,
.run-status-completed .pi {
  color: var(--p-primary-color);
}

.run-status-paused .pi,
.run-status-issues .pi {
  color: var(--opencor-warn-color);
}

.run-status-stopped .pi,
.run-status-failed .pi {
  color: var(--opencor-error-color);
}

/**
 * Progress of our simulation, which is shown as a thin line over the bottom border of our toolbar.
 */

.run-progress {
  position: relative;
  z-index: 11;
  flex-shrink: 0;
  height: 2px !important;
  margin-top: -2px;
  border-radius: 0;
  background: transparent;
  visibility: hidden;
}

.run-progress-visible {
  visibility: visible;
}

/**
 * Console.
 */

.console-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 0.25rem 0.375rem 0.125rem 0.75rem;
}

/**
 * Splitters, which gutters are shown as thin lines that get highlighted when hovered or dragged.
 */

.standard-view :deep(.p-splitter-gutter) {
  position: relative;
  background-color: var(--p-content-border-color);
  transition: background-color 0.15s ease;
}

.standard-view :deep(.p-splitter-horizontal > .p-splitter-gutter) {
  width: 1px !important;
}

.standard-view :deep(.p-splitter-vertical > .p-splitter-gutter) {
  height: 1px !important;
}

.standard-view :deep(.p-splitter-gutter-handle) {
  opacity: 0;
}

/**
 * Note: a gutter is only 1px wide/high, so we make it easier to grab by extending its hit area.
 */

.standard-view :deep(.p-splitter-gutter)::after {
  position: absolute;
  inset: -3px;
  z-index: 1;
  content: "";
}

.standard-view :deep(.p-splitter-gutter:hover),
.standard-view :deep(.p-splitter-gutter[data-p-gutter-resizing="true"]) {
  background-color: var(--p-primary-color);
}
</style>
