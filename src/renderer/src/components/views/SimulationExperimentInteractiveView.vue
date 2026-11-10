<template>
  <div ref="rootRef" class="simulation-experiment-view toolbar-based-view h-full flex flex-col">
    <IssuesView v-if="issues.length" class="m-4 mb-0" style="height: calc(100% - 2rem);" :issues="issues" />
    <template v-else>
      <Toolbar v-if="!simulationOnly" class="shrink-0">
        <template #start>
          <div class="flex gap-1 invisible">
            <ToolbarButtonWidget icon="pi pi-play-circle" />
            <ToolbarButtonWidget icon="pi pi-stop-circle" />
          </div>
        </template>
        <template #end>
          <div class="flex gap-1">
            <ToolbarButtonWidget
              icon="pi pi-download"
              label="Export COMBINE archive"
              @click="onDownloadCombineArchive"
            />
            <ToolbarButtonWidget
              icon="pi pi-cog"
              label="Settings"
              @click="settingsVisible = true"
            />
          </div>
        </template>
      </Toolbar>
      <div class="grow min-h-0">
        <div class="flex h-full">
          <div v-if="uiJsonEmpty" class="empty-view">
            <i class="pi pi-sliders-h empty-view-icon"></i>
            <p class="empty-view-title">The view needs to be configured.</p>
            <template v-if="!simulationOnly">
              <p class="empty-view-text">Its simulation inputs, simulation data, and plots can be configured in its settings.</p>
              <!--
              Note: like our toolbar buttons (see ToolbarButtonWidget.vue), this button doesn't get the focus when it is
                    clicked, so that it doesn't look focused once our settings dialog has been closed.
              -->
              <Button icon="pi pi-cog" label="Open settings" size="small" @mousedown.prevent @click="settingsVisible = true" />
            </template>
          </div>
          <IssuesView v-else-if="uiJsonIssues.length" class="w-full m-4" :issues="uiJsonIssues" />
          <div v-else class="panels flex grow min-h-0" :class="{ 'narrow-layout': narrowLayout }">
            <div class="side-panel-column">
              <ScrollPanel class="h-full">
                <div class="side-panel">
                  <!-- Simulation inputs -->

                  <section class="side-panel-section">
                    <div class="side-panel-header">
                      <h3 class="opencor-section-title opencor-section-title-small">Simulation inputs</h3>
                      <ToolbarButtonWidget :class="{ invisible: allSimulationInputsAtDefaultValues }"
                        icon="pi pi-undo"
                        label="Reset all simulation inputs"
                        small
                        tooltipAlign="end"
                        keepFocus
                        :disabled="allSimulationInputsAtDefaultValues"
                        @click="onResetInputs($event)"
                      />
                    </div>
                    <div ref="simulationInputsRef" class="side-panel-fields">
                      <InputWidget ref="inputWidgetsRef"
                        v-for="(input, index) in actualUiJson.input"
                        v-model="inputValues[index]!"
                        v-show="showInput[index]"
                        :key="`input_${index}`"
                        :name="input.name"
                        :defaultValue="input.defaultValue"
                        :maximumValue="locApi.isScalarInput(input) ? input.maximumValue : undefined"
                        :minimumValue="locApi.isScalarInput(input) ? input.minimumValue : undefined"
                        :possibleValues="locApi.isDiscreteInput(input) ? input.possibleValues : undefined"
                        :stepValue="locApi.isScalarInput(input) ? input.stepValue : undefined"
                        @change="onInputChange()"
                        @changeEnd="onInputChangeEnd()"
                        @atDefaultValueChange="(_name: string, atDefaultValue: boolean) => onInputAtDefaultValueChange(index, atDefaultValue)"
                      />
                    </div>
                  </section>

                  <!-- Runs -->

                  <section class="side-panel-section">
                    <div class="side-panel-header">
                      <h3 class="opencor-section-title opencor-section-title-small">Runs</h3>
                      <ToolbarButtonWidget :class="{ invisible: runs.length === 1 }"
                        icon="pi pi-trash"
                        label="Remove all tracked runs"
                        small
                        tooltipAlign="end"
                        :disabled="runs.length === 1"
                        @click="onRemoveAllRuns($event)"
                      />
                    </div>
                    <Button ref="trackRunButtonRef" class="w-full"
                      icon="pi pi-plus"
                      label="Track run"
                      outlined
                      size="small"
                      :disabled="isSimulating || simulationIssues.length > 0"
                      @click="onTrackRun"
                    />
                    <div ref="runsListRef" class="runs-list">
                      <div v-for="(run, index) in runs"
                        :key="run.id"
                        class="run-row"
                        :class="{ 'run-row-hidden': !run.isVisible }"
                      >
                        <ToolbarButtonWidget class="run-color-button"
                          icon="pi pi-circle-fill"
                          :label="`Change ${runName(run, index)} colour`"
                          small
                          :style="{ '--toolbar-button-color': run.color, '--toolbar-button-hover-color': run.color }"
                          @click="onToggleRunColorPopover(index, $event)"
                        />
                        <div v-hint.html="run.isLiveRun ? '' : run.tooltip"
                          class="run-name grow min-w-0"
                          :class="{ 'cursor-help': !run.isLiveRun }"
                        >
                          {{ runName(run, index, true) }}
                        </div>
                        <div class="run-actions">
                          <ToolbarButtonWidget class="run-visibility-button"
                            :icon="run.isVisible ? 'pi pi-eye' : 'pi pi-eye-slash'"
                            :label="`${run.isVisible ? 'Hide' : 'Show'} ${runName(run, index)}`"
                            small
                            tooltipAlign="end"
                            @click="onToggleRun(index)"
                          />
                          <ToolbarButtonWidget v-if="!run.isLiveRun" class="run-remove-button"
                            icon="pi pi-times"
                            :label="`Remove ${runName(run, index)}`"
                            small
                            tooltipAlign="end"
                            @click="onRemoveRun(index)"
                          />
                          <div v-else class="w-6 h-6"></div>
                        </div>
                      </div>
                    </div>
                    <div v-if="runs.length === 1" class="empty-state">
                      No runs are being tracked.
                    </div>
                  </section>

                  <!-- Note -->

                  <p v-if="preSimulationDuration" class="side-panel-hint">
                    <i class="pi pi-info-circle"></i>
                    <span>The simulation was run for <strong>{{ preSimulationDuration }} {{ voiUnit }}</strong> prior to plotting.</span>
                  </p>
                </div>
              </ScrollPanel>
            </div>
            <div class="plots-column relative flex flex-col grow h-full min-h-0">
              <div class="flex flex-col grow gap-2 min-h-0" :class="{ 'invisible pointer-events-none': simulationIssues.length }">
                <GraphPanelWidget
                  v-for="(_plot, index) in actualUiJson.output.plots"
                  :ref="(element: any) => graphPanelRefs[index] = element"
                  :key="`plot_${index}`"
                  class="w-full min-h-0"
                  :margins="compMargins"
                  :data="compData[index] || { traces: [] }"
                  @marginsUpdated="(newMargins: IGraphPanelMargins) => onMarginsUpdated(`plot_${index}`, newMargins)"
                />
              </div>
              <IssuesView v-show="simulationIssues.length" class="absolute inset-0 m-4" :issues="simulationIssues" />
            </div>
          </div>
        </div>
      </div>
      <Teleport :to="opencorElement" :disabled="!opencorElement">
        <SimulationExperimentInteractiveViewSettingsDialog class="simulation-experiment-view"
          v-model:visible="settingsVisible"
          :centreOn="fileTabElement"
          :settings="settings"
          :voiId="voiId"
          :voiName="voiName"
          :voiUnit="voiUnit"
          :allModelParameters="allModelParameters"
          :editableModelParameters="editableModelParameters"
          @ok="onSettingsOk"
          @close="settingsVisible = false"
        />
      </Teleport>
      <Popover ref="runColorPopoverRef" :appendTo="appendTarget"
        @show="runColorPopoverVisible = true"
        @hide="runColorPopoverVisible = false"
      >
        <div class="flex p-2 gap-2" tabindex="-1" :autofocus="!runColorPopoverOpenedUsingKeyboard" @keydown="onColorSwatchesKeyDown">
          <button class="color-swatch cursor-pointer w-6 h-6 outline-2 outline-transparent rounded-md"
            v-for="(name, color) in colors.PALETTE" :key="color"
            type="button"
            :style="`background-color: ${color};`"
            :class="{ 'color-swatch-selected': color === runs[runColorPopoverIndex]?.color }"
            :autofocus="runColorPopoverOpenedUsingKeyboard && color === runs[runColorPopoverIndex]?.color"
            :aria-pressed="color === runs[runColorPopoverIndex]?.color"
            v-hint="name"
            @click="onRunColorChange(runColorPopoverIndex, color)"
          />
        </div>
      </Popover>
    </template>
  </div>
</template>

<script setup lang="ts">
import * as vueusecore from '@vueuse/core';
import Popover from 'primevue/popover';
import * as vue from 'vue';

import type {
  IOpenCORExternalDataEvent,
  IOpenCORSimulationDataEvent,
  IOpenCORSimulationDataValue
} from '../../../index';

import * as colors from '../../common/colors';
import * as common from '../../common/common';
import * as dependencies from '../../common/dependencies';
import * as externalData from '../../common/externalData';
import { vHint } from '../../common/hint';
import * as locCommon from '../../common/locCommon';
import * as math from '../../common/math';
import * as vueCommon from '../../common/vueCommon';
import * as locApi from '../../libopencor/locApi';
import * as locSedApi from '../../libopencor/locSedApi';
import * as locUiJsonApi from '../../libopencor/locUiJsonApi';

import type { ISimulationExperimentInteractiveViewSettingsDialog } from '../dialogs/SimulationExperimentInteractiveViewSettingsDialog.vue';
import { useOpenCORContext } from '../OpenCORContext';
import GraphPanelWidget from '../widgets/GraphPanelWidget.vue';
import InputWidget from '../widgets/InputWidget.vue';
import type { IGraphPanelData, IGraphPanelMargins, IGraphPanelPlotTrace } from '../widgets/GraphPanelWidget.vue';

interface ISimulationRun {
  id: string;
  inputParameters: Record<string, number>;
  isVisible: boolean;
  data: IGraphPanelData[];
  color: string;
  tooltip: string;
  isLiveRun: boolean;
}

interface IExternalDataValues {
  x: math.FloatArray;
  y: math.FloatArray;
}

const props = defineProps<{
  file: locApi.File;
  uiJson?: locApi.IUiJson;
}>();

const emit = defineEmits<{
  error: [message: string];
  simulationData: [];
}>();

const { simulationOnly } = useOpenCORContext();

const opencorElement = vue.shallowRef<HTMLElement | null>(null);
const fileTabElement = vue.shallowRef<HTMLElement | null>(null);
// Note: our settings dialog is rendered in our OpenCOR element (rather than in our file tab) so that, like all the
//       other dialogs, it covers the whole of OpenCOR, including our main menu and file tabs. It still gets our styles
//       since it is given our simulation-experiment-view class, and it is still centred over our file tab, i.e. the
//       element in which we are laid out (our nearest positioned ancestor).
const rootRef = vue.shallowRef<HTMLElement | null>(null);
const settingsVisible = vue.ref<boolean>(false);
const document = props.file.document();
const documentIssues = document.issues();
const isDocumentValid = documentIssues.length === 0;
const uniformTimeCourse = isDocumentValid ? (document.simulation(0) as locApi.SedUniformTimeCourse) : null;
const cvode = uniformTimeCourse?.cvode() ?? null;
const mathEval = new math.Float64ArrayMath();
const model = isDocumentValid ? document.model(0) : null;

// Whether we use a narrow layout, i.e. whether our side panel is stacked above our plots (see .narrow-layout below).

const narrowLayout = vueCommon.useNarrowLayout(rootRef);

// Some helper functions to evaluate and apply the model changes resulting from the given parameters and scope.

interface IModelChange {
  componentName: string;
  variableName: string;
  newValue: string;
}

const evaluateModelChanges = (
  parameters: locApi.IUiJsonParameter[],
  modelScope: math.ExpressionScope,
  issues: locApi.IIssue[]
): IModelChange[] => {
  const res: IModelChange[] = [];

  for (const parameter of parameters) {
    const componentVariableNames = parameter.name.split('/');

    if (componentVariableNames[0] && componentVariableNames[1]) {
      try {
        res.push({
          componentName: componentVariableNames[0],
          variableName: componentVariableNames[1],
          newValue: String(mathEval.evaluate(parameter.value, modelScope))
        });
      } catch (error: unknown) {
        issues.push({
          type: locApi.EIssueType.ERROR,
          description: `An error occurred while applying parameter change for '${parameter.name}' (${common.formatMessage(common.formatError(error), false)}).`
        });
      }
    }
  }

  return res;
};

const applyModelChanges = (modelChanges: IModelChange[]): void => {
  if (!model) {
    return;
  }

  model.removeAllChanges();

  for (const modelChange of modelChanges) {
    model.addChange(modelChange.componentName, modelChange.variableName, modelChange.newValue);
  }
};

// Our UI JSON with the structure that our view relies on (i.e. one that can be safely accessed). If our original UI
// JSON doesn't have that structure (e.g., it has no output), then the parts that don't have it are replaced with empty
// equivalents while the other parts are kept as is, so that they can still be used (e.g., in our settings dialog). Any
// issue with our original UI JSON is then reported (see uiJsonIssues).

const uiJsonWithExpectedStructure = props.uiJson ? locApi.uiJsonWithExpectedStructure(props.uiJson) : undefined;
const uiJsonStructureRepaired = vue.ref<boolean>(uiJsonWithExpectedStructure?.repaired ?? false);

// Apply the model changes resulting from our default input values before instantiating our document, so that our first
// simulation run can use our instance rather than have to instantiate our document again (see updateSimulation()).
// Note: if those model changes result in our instance having issues, then we instantiate our document without them so
//       that our view remains usable (any issue with those model changes will be reported when running the simulation).
//       Also, our UI JSON has yet to be validated at this stage, so we ignore any error that may occur while evaluating
//       those model changes (any issue with our UI JSON will be reported once it has been validated).

const NO_MODEL_CHANGES_KEY = JSON.stringify([]);
let instanceModelChangesKey = NO_MODEL_CHANGES_KEY;

if (model && uiJsonWithExpectedStructure) {
  try {
    const initialModelScope: math.ExpressionScope = {};

    for (const input of uiJsonWithExpectedStructure.uiJson.input) {
      initialModelScope[input.id] = input.defaultValue;
    }

    const initialModelChanges = evaluateModelChanges(
      uiJsonWithExpectedStructure.uiJson.parameters,
      initialModelScope,
      []
    );

    applyModelChanges(initialModelChanges);

    instanceModelChangesKey = JSON.stringify(initialModelChanges);
  } catch (_error: unknown) {
    applyModelChanges([]);

    instanceModelChangesKey = NO_MODEL_CHANGES_KEY;
  }
}

let instance = isDocumentValid ? document.instantiate() : null;

if (instance?.hasIssues() && instanceModelChangesKey !== NO_MODEL_CHANGES_KEY) {
  instance.release();

  applyModelChanges([]);

  instance = document.instantiate();
  instanceModelChangesKey = NO_MODEL_CHANGES_KEY;
}

let instanceIsPristine = true;
// Note: whether our instance has never been run. If so, and if it was built with the same model changes as those wanted
//       by our next simulation run (see instanceModelChangesKey), then that run can use it as is rather than build a
//       new one. In practice, this only applies to our first simulation run.
let simulationDataAvailable = false;
// Note: whether our instance task holds the data of a simulation run that has successfully completed (see
//       runSimulation() and simulationData()).
const issues = documentIssues.length > 0 ? documentIssues : (instance?.issues() ?? []);
let instanceTask = issues.length > 0 ? null : (instance?.task(0) ?? null);
const allModelParameters = vue.ref<string[]>([]);
const editableModelParameters = vue.ref<string[]>([]);

// Populate our model parameters.
// Note: this must be done before validating our UI JSON (see uiJsonIssues below) since its validation checks that the
//       model parameters it refers to exist.

if (instanceTask) {
  vueCommon.populateParameters(allModelParameters, instanceTask);
  vueCommon.populateParameters(editableModelParameters, instanceTask, true);
}

const voiName = vue.ref(instanceTask ? instanceTask.voiName() : '');
const voiId = vue.ref(instanceTask ? (voiName.value.split('/')[1] ?? '') : '');
const voiUnit = vue.ref(instanceTask ? instanceTask.voiUnit() : '');

const actualUiJson = vue.ref<locApi.IUiJson>(
  // Note: we deep clone our UI JSON, sharing its external data values rather than copying them (see cloneUiJson()),
  //       and normalise it to make sure that its external data values are Float64Arrays rather than plain arrays.
  //       Indeed, plain arrays would be deeply tracked by Vue (i.e. element by element), which would be both slow and
  //       memory hungry for large external data.

  uiJsonWithExpectedStructure
    ? locApi.normaliseUiJson(locApi.cloneUiJson(uiJsonWithExpectedStructure.uiJson))
    : {
        input: [],
        output: {
          data: [
            {
              id: voiId.value,
              name: voiName.value
            }
          ],
          plots: []
        },
        parameters: []
      }
);

const uiJsonEmpty = vue.computed<boolean>(() => {
  if (uiJsonStructureRepaired.value) {
    // Our original UI JSON didn't have the expected structure, so it isn't empty, it's invalid (see uiJsonIssues).

    return false;
  }

  if (
    actualUiJson.value.input.length === 0 &&
    actualUiJson.value.parameters.length === 0 &&
    (actualUiJson.value.output.externalData?.length ?? 0) === 0 &&
    actualUiJson.value.output.plots.length === 0
  ) {
    if (actualUiJson.value.output.data.length === 0) {
      return true;
    }

    if (actualUiJson.value.output.data.length === 1) {
      const data = actualUiJson.value.output.data[0];

      return !!(data && data.id === voiId.value && data.name === voiName.value);
    }
  }

  return false;
});

const isSimulating = vue.ref<boolean>(false);
// Note: whether a simulation is running, including in between the simulation runs of an input simulation update (see
//       updateSimulation()). It is used, among other things, to prevent the current run from being tracked while a
//       simulation is running (see onTrackRun()).
const liveData = vue.ref<IGraphPanelData[]>([]);
let margins: Record<string, IGraphPanelMargins> = {};
const compMargins = vue.ref<IGraphPanelMargins>();

const uiJsonIssues = vue.ref<locApi.IIssue[]>(
  locApi.validateUiJson(uiJsonStructureRepaired.value ? props.uiJson : actualUiJson.value, {
    allModelParameters: allModelParameters.value,
    editableModelParameters: editableModelParameters.value
  })
);

// Remove the model changes resulting from our default input values if our UI JSON is invalid.
// Note: we applied them before validating our UI JSON (see above), but we don't run any simulation with an invalid UI
//       JSON, so they would otherwise be left in our document and, therefore, be exported with it (see
//       onDownloadCombineArchive()). Our instance was, however, built with them, so it must not be reused by our next
//       simulation run (e.g., if our UI JSON gets fixed through our settings dialog).

if (uiJsonIssues.value.length && instanceModelChangesKey !== NO_MODEL_CHANGES_KEY) {
  applyModelChanges([]);

  instanceIsPristine = false;
}

const simulationIssues = vue.ref<locApi.IIssue[]>([]);
const inputValues = vue.ref<number[]>([]);
const showInput = vue.ref<boolean[]>([]);
const inputsShownAtDefaultValues = vue.ref<(boolean | undefined)[]>([]);
const inputWidgetsRef = vue.ref<InstanceType<typeof InputWidget>[]>([]);
const idToInfo = new Map<string, locCommon.ISimulationDataInfo>();

// A helper function to retrieve the simulation data information for the given name.
// Note: we build (and cache) the simulation data information of all our simulation data the first time we need it.
//       Indeed, it is much faster than looking up simulation data information by name every time (see
//       locCommon.simulationDataInfos()). Also, the names of our simulation data don't change when we reinstantiate our
//       document (since our model changes and settings only affect values), so our cache remains valid for as long as
//       our document is used.

let simulationDataInfosCache: Map<string, locCommon.ISimulationDataInfo> | null = null;

const simulationDataInfo = (task: locSedApi.SedInstanceTask, name: string): locCommon.ISimulationDataInfo => {
  simulationDataInfosCache ??= locCommon.simulationDataInfos(task);

  return simulationDataInfosCache.get(name) ?? locCommon.NoSimulationDataInfo;
};

// A helper function to retrieve the simulation data value for the given simulation data information.
// Note: with the WASM version of libOpenCOR, the simulation data may be a view of the WASM heap, so we need to copy it.
//       Otherwise, it would become a dangling view (with potentially corrupted data) as soon as the corresponding
//       instance gets released (e.g., when it gets reinstantiated by a newer simulation run), which would in turn mess
//       up our plots (in particular those of our tracked runs). With the C++ version of libOpenCOR, the simulation data
//       is already a copy that we own, so there is no need to copy it again.

const simulationDataValue = (
  task: locSedApi.SedInstanceTask,
  info: locCommon.ISimulationDataInfo
): IOpenCORSimulationDataValue => {
  const res = locCommon.simulationDataValue(task, info);

  return locApi.cppVersion() ? res : { ...res, data: new Float64Array(res.data) };
};

const runs = vue.ref<ISimulationRun[]>([
  {
    id: 'live',
    inputParameters: {},
    isVisible: true,
    data: [],
    color: colors.DEFAULT_COLOR,
    tooltip: '',
    isLiveRun: true
  }
]);

let trackedRunId = 0;
let simulationGeneration = 0;
const runColorPopoverIndex = vue.ref<number>(-1);
const runColorPopoverVisible = vue.ref<boolean>(false);
const runColorPopoverOpenedUsingKeyboard = vue.ref<boolean>(false);
const runColorPopoverRef = vue.ref<InstanceType<typeof Popover> | undefined>();
const graphPanelRefs = vue.ref<Record<number, InstanceType<typeof GraphPanelWidget> | undefined>>({});
const appendTarget = vueCommon.useAppendTarget(rootRef as unknown as vue.Ref<HTMLElement | null>);

const compData = vue.computed<IGraphPanelData[]>(() => {
  // Combine the live data with the data from the tracked runs.

  const liveDataVal = liveData.value;
  const runsVal = runs.value;
  const runsCount = runsVal.length;
  const res: IGraphPanelData[] = [];
  const paletteColors = colors.PALETTE_COLORS;
  const paletteColorsLength = paletteColors.length;

  const addRunTraces = (traces: IGraphPanelPlotTrace[], plotIndex: number, runIndex: number): void => {
    const run = runsVal[runIndex];

    if (!run) {
      return;
    }

    if (!run.isVisible) {
      return;
    }

    const runColorIndex = paletteColors.indexOf(run.color);
    const baseColorIndex = Math.max(0, runColorIndex);
    const data = run.isLiveRun ? liveDataVal[plotIndex] : run.data[plotIndex];
    const dataTraces = data?.traces;

    if (!dataTraces?.length) {
      return;
    }

    const suffix = runsCount === 1 ? '' : run.isLiveRun ? ' [Live]' : ` [#${runIndex}]`;

    for (let k = 0; k < dataTraces.length; ++k) {
      const dataTrace = dataTraces[k];

      if (!dataTrace) {
        continue;
      }

      traces.push({
        ...dataTrace,
        traceId: `${run.id}::${dataTrace.traceId ?? `${dataTrace.xValue}::${dataTrace.yValue}::${k}`}`,
        name: dataTrace.name + suffix,
        color: paletteColors[(baseColorIndex + k) % paletteColorsLength] ?? colors.DEFAULT_COLOR,
        legendRank: run.isLiveRun ? 1 : undefined
      });
    }
  };

  for (let i = 0; i < liveDataVal.length; ++i) {
    const traces: IGraphPanelPlotTrace[] = [];

    // Add the traces for the tracked runs first and then the live run, so that the live run is always drawn on top of
    // the tracked runs (GraphPanelWidget draws traces in the order in which they are given).
    // Note: the live run is still listed first in the legend since its traces have a legend rank of 1 while those of
    //       the tracked runs have the default legend rank of 1000.

    for (let j = 1; j < runsCount; ++j) {
      addRunTraces(traces, i, j);
    }

    addRunTraces(traces, i, 0);

    res.push({
      xAxisTitle: liveDataVal[i]?.xAxisTitle,
      yAxisTitle: liveDataVal[i]?.yAxisTitle,
      traces
    });
  }

  return res;
});

const settings = vue.computed<ISimulationExperimentInteractiveViewSettingsDialog>(() => {
  const actualUiJsonVal = actualUiJson.value;

  return {
    simulation: {
      initialPoint: uniformTimeCourse?.initialTime() ?? 0,
      startingPoint: uniformTimeCourse?.outputStartTime() ?? 0,
      endingPoint: uniformTimeCourse?.outputEndTime() ?? 0,
      pointInterval: uniformTimeCourse
        ? (uniformTimeCourse.outputEndTime() - uniformTimeCourse.outputStartTime()) / uniformTimeCourse.numberOfSteps()
        : 1
    },
    solvers: {
      cvodeMaximumStep: cvode?.maximumStep() ?? 0
    },
    interactive: {
      uiJson: actualUiJsonVal
    }
  };
});

const preSimulationDuration = vue.computed<number>(() => {
  const settingsVal = settings.value;

  return settingsVal.simulation.startingPoint - settingsVal.simulation.initialPoint;
});

// A helper function to serialise some settings so that they can be compared with some other settings.
// Note: our settings dialog adds an empty list of external data to a UI JSON that doesn't have any, so we ignore an
//       empty list of external data to avoid detecting changes where there are none.

const serialisedSettings = (settingsToSerialise: ISimulationExperimentInteractiveViewSettingsDialog): string => {
  return JSON.stringify(vue.toRaw(settingsToSerialise), (key: string, value: unknown): unknown => {
    if (key === 'externalData' && Array.isArray(value) && !value.length) {
      return undefined;
    }

    return locApi.uiJsonReplacer(key, value);
  });
};

const oldSettings = vue.ref<string>(serialisedSettings(settings.value));

// Add an information issue to some simulation issues, telling the user to check our settings.
// Note: our settings cannot be accessed in simulation-only mode (since our toolbar is hidden), so there is no point in
//       telling the user to check them.

const informationIssue: locApi.IIssue = {
  type: locApi.EIssueType.INFORMATION,
  description:
    'Please check the settings (click on the <i class="pi pi-cog"></i> icon in the top-right corner) and try again.'
};

const addInformationIssue = (issues: locApi.IIssue[]): void => {
  if (!simulationOnly.value) {
    issues.push(informationIssue);
  }
};

// Update (initialise) our UI from the current actualUiJson.

const updateUi = (): void => {
  inputValues.value = actualUiJson.value.input.map((input: locApi.IUiJsonInput) => {
    return input.defaultValue;
  });
  showInput.value = actualUiJson.value.input.map((input: locApi.IUiJsonInput) => {
    return (input.visible ?? 'true') !== 'false';
  });
  inputsShownAtDefaultValues.value = [];
};

// A helper function to generate a unique external data ID based on a candidate name and a set of already used IDs.

const uniqueOutputDataId = (name: string, usedIds: Set<string>): string => {
  const normalisedId = `${name.replace(/[^A-Za-z0-9_]/g, '_')}_ext`;
  let res = normalisedId;
  let suffix = 0;

  while (usedIds.has(res)) {
    res = `${normalisedId}_${++suffix}`;
  }

  usedIds.add(res);

  return res;
};

// A helper function to replace data IDs in an expression with its corresponding external data IDs.

const replaceWithExternalDataIds = (expression: string, mapping: Map<string, string>): string => {
  let res = expression;
  const sortedMapping = [...mapping].sort(([a], [b]) => {
    return b.length - a.length;
  });

  for (const [dataId, externalDataId] of sortedMapping) {
    let newRes = '';
    let i = 0;

    while (i < res.length) {
      if (res.startsWith(dataId, i)) {
        const prevChar = i === 0 ? '' : res[i - 1];
        const nextChar = i + dataId.length >= res.length ? '' : res[i + dataId.length];

        if (!/[A-Za-z0-9_]/.test(prevChar) && !/[A-Za-z0-9_]/.test(nextChar)) {
          newRes += externalDataId;

          i += dataId.length;

          continue;
        }
      }

      newRes += res[i++];
    }

    res = newRes;
  }

  return res;
};

// A helper function to add some external data to the simulation.

const addedExternalDataHashes = new Set<string>();
const inFlightExternalDataHashes = new Set<string>();

const addExternalData = async (
  csv: string,
  voiExpression: string | undefined,
  modelParameters: string[]
): Promise<IOpenCORExternalDataEvent> => {
  const addedEvent = (): IOpenCORExternalDataEvent => {
    return {
      type: 'added',
      csv,
      issues: []
    };
  };
  const issueEvent = (issueMessages: string[]): IOpenCORExternalDataEvent => {
    return {
      type: 'issue',
      csv,
      issues: issueMessages
    };
  };

  // Make sure that we are in simulation-only mode.

  if (!simulationOnly.value) {
    return Promise.resolve(
      issueEvent(['The exposed addExternalData() method is only available in simulation-only mode.'])
    );
  }

  // Make sure that we can retrieve the CSV data.

  let csvContents: string = '';

  if (common.isUrl(csv)) {
    try {
      const response = await common.fetchThroughCorsProxy(csv);

      if (!response.ok) {
        return Promise.resolve(
          issueEvent([`Could not retrieve the CSV file from ${csv} (${response.status}: ${response.statusText}).`])
        );
      }

      csvContents = await response.text();
    } catch (error: unknown) {
      return Promise.resolve(
        issueEvent([
          `Could not retrieve the CSV file from ${csv} (${common.formatMessage(common.formatError(error), false)}).`
        ])
      );
    }
  } else {
    csvContents = csv;
  }

  if (!csvContents) {
    return Promise.resolve(addedEvent());
  }

  // Make sure that we haven't already added this CSV data (based on a hash of the CSV contents) to avoid accidentally
  // adding the same data multiple times.

  const csvHash = common.xxh64(csvContents);

  if (addedExternalDataHashes.has(csvHash) || inFlightExternalDataHashes.has(csvHash)) {
    return Promise.resolve(issueEvent(['The external data has already been added.']));
  }

  inFlightExternalDataHashes.add(csvHash);

  try {
    // Make sure that we can parse the CSV data.

    let parsedCsv: externalData.IExternalCsvData;

    try {
      parsedCsv = externalData.parseExternalCsvData(csvContents);
    } catch (error: unknown) {
      return Promise.resolve(issueEvent([common.formatMessage(common.formatError(error))]));
    }

    // Make sure that the number of model parameters matches the number of data columns in the CSV file.

    if (parsedCsv.headers.length - 1 !== modelParameters.length) {
      return Promise.resolve(
        issueEvent([
          `The number of model parameters provided must match the number of data columns in the CSV file (i.e. ${parsedCsv.headers.length - 1}, not ${modelParameters.length}).`
        ])
      );
    }

    // Make sure that the model parameters are valid.

    const trimmedModelParameters = modelParameters.map((modelParameter) => {
      return modelParameter?.trim() ?? '';
    });
    const validationIssues: string[] = [];

    for (let i = 0; i < trimmedModelParameters.length; ++i) {
      const modelParameter = trimmedModelParameters[i];

      if (!modelParameter) {
        validationIssues.push(`Model parameter #${i + 1} must be a non-empty string.`);
      } else if (!/^\w+\/\w+$/.test(modelParameter)) {
        validationIssues.push(`Model parameter #${i + 1} must be of the form '<component>/<variable>'.`);
      }
    }

    if (validationIssues.length) {
      return Promise.resolve(issueEvent(validationIssues));
    }

    // Determine the output IDs that are currently being used so that we can avoid conflicts when adding our external
    // data IDs.

    const existingExternalData = actualUiJson.value.output.externalData ?? [];
    const usedOutputIds = new Set<string>();

    for (const existingExternalDataEntry of existingExternalData) {
      for (const dataEntry of existingExternalDataEntry.data) {
        if (dataEntry.id) {
          usedOutputIds.add(dataEntry.id);
        }
      }
    }

    for (const outputData of actualUiJson.value.output.data) {
      if (outputData.id) {
        usedOutputIds.add(outputData.id);
      }
    }

    // Add the external data to our UI JSON, making sure that we generate unique output data IDs for the new data
    // entries.

    const dataSeries: locApi.IUiJsonOutputExternalDataSeries[] = [];
    const data: locApi.IUiJsonOutputData[] = [];
    const dataIdToExternalDataId = new Map<string, string>();

    for (let columnIndex = 1; columnIndex < parsedCsv.headers.length; ++columnIndex) {
      const name = parsedCsv.headers[columnIndex];
      const id = uniqueOutputDataId(name, usedOutputIds);

      dataSeries.push({
        name,
        values: new Float64Array(parsedCsv.columns[columnIndex])
      });
      data.push({
        id,
        name
      });

      const modelParameter = trimmedModelParameters[columnIndex - 1];

      for (const outputData of actualUiJson.value.output.data) {
        if (outputData.name === modelParameter) {
          dataIdToExternalDataId.set(outputData.id, id);

          break;
        }
      }
    }

    if (!actualUiJson.value.output.externalData) {
      // Initialise the external data array if it doesn't already exist.

      actualUiJson.value.output.externalData = [];
    }

    actualUiJson.value.output.externalData.push({
      data,
      dataSeries,
      description: `External data ${csvHash}`,
      voiExpression: voiExpression?.trim() || 'voi',
      voiValues: new Float64Array(parsedCsv.columns[0])
    });

    // Go through the plots' main trace and additional traces and add a corresponding trace where the original model
    // parameters are replaced with their corresponding external data. If an original trace has no corresponding
    // external data then no corresponding trace is added.

    for (let plotIndex = 0; plotIndex < actualUiJson.value.output.plots.length; ++plotIndex) {
      const plot = actualUiJson.value.output.plots[plotIndex];

      if (!plot) {
        continue;
      }

      // Initialise the additional traces array if it doesn't already exist.

      if (!plot.additionalTraces) {
        plot.additionalTraces = [];
      }

      // Use a set of trace keys to determine whether a candidate trace already exists or not.

      const traceKey = (x: string, y: string): string => {
        return `${x}::${y}`;
      };
      const originalSimulationKeys = new Set<string>();
      const originalAdditionalTraceCount =
        nbOfOriginalAdditionalTracesInPlots[plotIndex] ?? plot.additionalTraces.length;

      originalSimulationKeys.add(traceKey(plot.xValue, plot.yValue));

      for (let additionalTraceIndex = 0; additionalTraceIndex < originalAdditionalTraceCount; ++additionalTraceIndex) {
        const additionalTrace = plot.additionalTraces[additionalTraceIndex];

        if (!additionalTrace) {
          continue;
        }

        originalSimulationKeys.add(traceKey(additionalTrace.xValue, additionalTrace.yValue));
      }

      // Retrieve the candidate traces for this plot.

      const candidateTraces: Array<{ xValue: string; yValue: string }> = [
        {
          xValue: plot.xValue,
          yValue: plot.yValue
        }
      ];

      for (let additionalTraceIndex = 0; additionalTraceIndex < originalAdditionalTraceCount; ++additionalTraceIndex) {
        const additionalTrace = plot.additionalTraces[additionalTraceIndex];

        if (!additionalTrace) {
          continue;
        }

        candidateTraces.push({
          xValue: additionalTrace.xValue,
          yValue: additionalTrace.yValue
        });
      }

      // Go through the candidate traces and add corresponding external data based traces where possible.

      for (let candidateTraceIndex = 0; candidateTraceIndex < candidateTraces.length; ++candidateTraceIndex) {
        const candidateTrace = candidateTraces[candidateTraceIndex];

        if (!candidateTrace) {
          continue;
        }

        // Make sure that the candidate trace is not one of our original traces (i.e. no replacements were made).

        const externalX = replaceWithExternalDataIds(candidateTrace.xValue, dataIdToExternalDataId);
        const externalY = replaceWithExternalDataIds(candidateTrace.yValue, dataIdToExternalDataId);

        if (originalSimulationKeys.has(traceKey(externalX, externalY))) {
          continue;
        }

        // Add an additional trace for externalValue.

        plot.additionalTraces.push({
          xValue: externalX,
          yValue: externalY
        });
      }
    }

    // Update our simulation and reset the plot margins to accommodate any new traces that have been added.

    updateSimulation();
    onResetMargins();

    addedExternalDataHashes.add(csvHash);

    return Promise.resolve(addedEvent());
  } finally {
    inFlightExternalDataHashes.delete(csvHash);
  }
};

// A helper function to retrieve simulation data for one or more model parameters.

const simulationData = (modelParameters: string[]): Promise<IOpenCORSimulationDataEvent> => {
  const simulationDataResult = common.emptySimulationData(modelParameters);

  if (!simulationOnly.value) {
    return Promise.resolve({
      type: 'issue',
      simulationData: simulationDataResult,
      issues: ['The exposed simulationData() method is only available in simulation-only mode.']
    });
  }

  // Make sure that our instance task holds the data of a simulation run that has successfully completed.
  // Note: our instance task refers to the instance of our current simulation run, which data is incomplete while it is
  //       running (or if it failed). We emit a simulationData event once a simulation run has successfully completed
  //       (see runSimulation()), so the caller will then be able to retrieve the complete data.

  if (!simulationDataAvailable) {
    return Promise.resolve({
      type: 'issue',
      simulationData: simulationDataResult,
      issues: isSimulating.value
        ? ['A simulation is running. Its data will be available once it has completed.']
        : simulationIssues.value.length
          ? [
              'The last simulation run did not complete successfully.',
              ...simulationIssues.value
                .filter((issue) => issue.type !== locApi.EIssueType.INFORMATION)
                .map((issue) => issue.description)
            ]
          : ['No simulation data is available yet.']
    });
  }

  if (!instanceTask) {
    return Promise.resolve({
      type: 'issue',
      simulationData: simulationDataResult,
      issues: ['No SED-ML instance task available.']
    });
  }

  const task = instanceTask as locSedApi.SedInstanceTask;
  const issueMessages: string[] = [];

  for (const modelParameter of modelParameters) {
    const info = simulationDataInfo(task, modelParameter === 'VOI' ? task.voiName() : modelParameter);

    if (locCommon.isNoSimulationDataInfo(info)) {
      issueMessages.push(`No simulation data information was found for model parameter "${modelParameter}".`);

      continue;
    }

    try {
      simulationDataResult[modelParameter] = simulationDataValue(task, info);
    } catch (error: unknown) {
      issueMessages.push(`Error for model parameter "${modelParameter}": ${common.formatError(error)}`);
    }
  }

  if (issueMessages.length) {
    return Promise.resolve({
      type: 'issue',
      simulationData: simulationDataResult,
      issues: issueMessages
    });
  }

  return Promise.resolve({
    type: 'updated',
    simulationData: simulationDataResult,
    issues: []
  });
};

// Exposed methods.

defineExpose({
  // Simulation-only methods.

  addExternalData,
  simulationData
});

// Update (initialise) our interactive UI..

updateUi();

// Watch for changes to our UI JSON and reset the compiled expressions when it changes, as well as keeping track of the
// number of additional traces in each plot.

let nbOfOriginalAdditionalTracesInPlots: number[] = [];

vue.watch(
  () => actualUiJson.value,
  () => {
    mathEval.resetCompiledExpressions();

    nbOfOriginalAdditionalTracesInPlots = actualUiJson.value.output.plots.map(
      (plot: locUiJsonApi.IUiJsonOutputPlot) => {
        return plot.additionalTraces?.length ?? 0;
      }
    );
  },
  { deep: true, immediate: true }
);

// A helper function to interpolate external data values at the VOI values of our simulation.

const externalDataValues = (voi: math.FloatArray, externalDataMapping: IExternalDataValues): math.FloatArray => {
  const voiLength = voi.length;
  const res = new Float64Array(voiLength);
  const { x, y } = externalDataMapping;
  const inputLength = Math.min(x.length, y.length);

  if (inputLength < 2) {
    // Not enough VOI samples to interpolate.

    res.fill(Number.NaN);

    return res;
  }

  // Determine whether we can use the input data as is (i.e. strictly increasing X values) for interpolation or whether
  // we need to normalise it first (i.e. sort and deduplicate the input data before interpolation).

  let useInputAsIs = true;

  for (let i = 1; i < inputLength && useInputAsIs; ++i) {
    useInputAsIs = x[i] > x[i - 1];
  }

  let normalisedX: math.FloatArray;
  let normalisedY: math.FloatArray;
  let normalisedLength = inputLength;

  if (useInputAsIs) {
    normalisedX = x;
    normalisedY = y;
  } else {
    const sortedIndices = new Array<number>(inputLength);

    for (let i = 0; i < inputLength; ++i) {
      sortedIndices[i] = i;
    }

    sortedIndices.sort((index1, index2) => {
      return x[index1] - x[index2];
    });

    const sortedX = new Float64Array(sortedIndices.length);
    const sortedY = new Float64Array(sortedIndices.length);
    let count = 0;

    for (let i = 0; i < sortedIndices.length; ++i) {
      const xValue = x[sortedIndices[i]];
      const yValue = y[sortedIndices[i]];

      if (count === 0 || xValue !== sortedX[count - 1]) {
        sortedX[count] = xValue;
        sortedY[count] = yValue;

        ++count;
      } else {
        // If VOI has duplicate X values then keep the last value.

        sortedY[count - 1] = yValue;
      }
    }

    if (count < 2) {
      res.fill(Number.NaN);

      return res;
    }

    normalisedX = count === sortedX.length ? sortedX : sortedX.slice(0, count);
    normalisedY = count === sortedY.length ? sortedY : sortedY.slice(0, count);

    normalisedLength = count;
  }

  // Precompute segment coefficients once and then evaluate with either a sweep (sorted VOI) or binary search (unsorted
  // VOI).

  const segmentCount = normalisedLength - 1;
  const segmentSlope = new Float64Array(segmentCount);

  for (let i = 0; i < segmentCount; ++i) {
    const deltaX = normalisedX[i + 1] - normalisedX[i];

    segmentSlope[i] = deltaX > 0 ? (normalisedY[i + 1] - normalisedY[i]) / deltaX : Number.NaN;
    // Note: deltaX should always be greater than zero due to the checks above, but we add a safeguard against division
    //       by zero just in case.
  }

  let isVoiIncreasing = true;

  for (let i = 1; i < voiLength; ++i) {
    if (voi[i] < voi[i - 1]) {
      isVoiIncreasing = false;

      break;
    }
  }

  const xFirst = normalisedX[0];
  const xLast = normalisedX[normalisedLength - 1];

  if (isVoiIncreasing) {
    let j = 0;

    for (let i = 0; i < voiLength; ++i) {
      const voiValue = voi[i];

      if (voiValue < xFirst || voiValue > xLast) {
        res[i] = Number.NaN;

        continue;
      }

      while (j + 1 < normalisedLength && normalisedX[j + 1] < voiValue) {
        ++j;
      }

      const slope = segmentSlope[j];

      if (!Number.isFinite(slope)) {
        res[i] = Number.NaN;

        continue;
      }

      res[i] = normalisedY[j] + (voiValue - normalisedX[j]) * slope;
    }
  } else {
    for (let i = 0; i < voiLength; ++i) {
      const voiValue = voi[i];

      if (voiValue < xFirst || voiValue > xLast) {
        res[i] = Number.NaN;

        continue;
      }

      // Binary search for the enclosing segment index j where x[j] <= voiValue <= x[j + 1].

      let low = 0;
      let high = normalisedLength - 1;

      while (low + 1 < high) {
        const mid = Math.floor(0.5 * (low + high));

        if (normalisedX[mid] <= voiValue) {
          low = mid;
        } else {
          high = mid;
        }
      }

      const slope = segmentSlope[low];

      if (!Number.isFinite(slope)) {
        res[i] = Number.NaN;

        continue;
      }

      res[i] = normalisedY[low] + (voiValue - normalisedX[low]) * slope;
    }
  }

  return res;
};

// The instances that are currently being run.

const runningInstances = new Set<locApi.SedInstance>();

// A helper function to dispose of an instance that we no longer need, i.e. release it, unless a simulation run is still
// waiting on it, in which case we stop that simulation run (since its results are going to be stale anyway) and let it
// release the instance once it is done with it (see runSimulation()).

const disposeInstance = (oldInstance: locApi.SedInstance): void => {
  if (!runningInstances.has(oldInstance)) {
    oldInstance.release();

    return;
  }

  if (oldInstance.status() !== locSedApi.ESedInstanceStatus.IDLE) {
    oldInstance.stopRun();
  }
};

// A helper function to reinstantiate our instance.
// Note: we instantiate our document before disposing of our previous instance. Indeed, if instantiating our document
//       fails (e.g., if libOpenCOR throws an exception), then we would otherwise be left with a released instance,
//       which would make all our future simulation runs fail, as well as our unmounting.

const reinstantiateInstance = (): locApi.SedInstance => {
  // Note: an instance has no tasks if it has issues (e.g., if the number of steps of its simulation is not strictly
  //       positive), in which case we must not retrieve its (non-existent) task since using it would fail (e.g., when
  //       rendering the unit of the variable of integration). Our simulation run will report the issues of the instance
  //       instead (see runSimulation()).

  const newInstance = document.instantiate();
  let newInstanceTask: locApi.SedInstanceTask | null = null;

  try {
    if (!newInstance.hasIssues()) {
      newInstanceTask = newInstance.task(0);
    }
  } catch (error: unknown) {
    newInstance.release();

    throw error;
  }

  const oldInstance = instance;

  instance = newInstance;
  instanceTask = newInstanceTask;

  // Dispose of our previous instance.
  // Note: failing to do so (e.g., if libOpenCOR throws an exception while stopping the simulation run that is waiting
  //       on it) must not prevent our new instance from being used.

  if (oldInstance) {
    try {
      disposeInstance(oldInstance);
    } catch (error: unknown) {
      console.error('OpenCOR: an error occurred while disposing of a simulation instance:', common.formatError(error));
    }
  }

  return newInstance;
};

// Run the interactive simulation.
// Note: this is called by updateSimulation(), which takes care of keeping track of the fact that we are simulating.

const runSimulation = async (currentSimulationGeneration: number): Promise<void> => {
  // Make sure that the view is usable, i.e. that we have a model and an instance.

  if (!model || !instance) {
    return;
  }

  // Our simulation data is about to be updated, so it won't be available until this simulation run has successfully
  // completed (see simulationData()).

  simulationDataAvailable = false;

  // Stop the current simulation if it is still running or paused.

  if (instance.status() !== locSedApi.ESedInstanceStatus.IDLE) {
    instance.stopRun();
  }

  // Check if we have been superseded by a newer call.

  if (currentSimulationGeneration !== simulationGeneration) {
    return;
  }

  // Create a scope for the model using the current input values.

  const modelScope: math.ExpressionScope = {};

  for (let i = 0; i < actualUiJson.value.input.length; ++i) {
    const input = actualUiJson.value.input[i];

    if (input) {
      modelScope[input.id] = inputValues.value[i];
    }
  }

  // Reset our issues.

  simulationIssues.value = [];

  // Show/hide the input widgets.

  for (let i = 0; i < actualUiJson.value.input.length; ++i) {
    const input = actualUiJson.value.input[i];

    if (input) {
      try {
        showInput.value[i] = Boolean(mathEval.evaluate(input.visible ?? 'true', modelScope));
      } catch (error: unknown) {
        showInput.value[i] = false;

        simulationIssues.value.push({
          type: locApi.EIssueType.ERROR,
          description: `An error occurred while evaluating visibility for input '${input.name}' (${common.formatMessage(common.formatError(error), false)}).`
        });
      }
    }
  }

  // Evaluate the model changes.

  const modelChanges = evaluateModelChanges(actualUiJson.value.parameters, modelScope, simulationIssues.value);

  // Make sure that we haven't come across any issues so far.

  if (simulationIssues.value.length) {
    addInformationIssue(simulationIssues.value);

    return;
  }

  // Check if we have been superseded by a newer call while we were setting up the model.

  if (currentSimulationGeneration !== simulationGeneration) {
    return;
  }

  // Use our instance as is if it has yet to be run and was instantiated with the same model changes (e.g., for our
  // first simulation run), otherwise apply the model changes and create a fresh instance for the new simulation run.
  // Note: using a fresh instance ensures that it picks up the latest model changes and avoids reusing an instance which
  //       internal state may have been corrupted by a previous cancellation.

  const modelChangesKey = JSON.stringify(modelChanges);
  let crtInstance = instance;

  if (!instanceIsPristine || modelChangesKey !== instanceModelChangesKey) {
    applyModelChanges(modelChanges);

    crtInstance = reinstantiateInstance();
    instanceModelChangesKey = modelChangesKey;
  }

  instanceIsPristine = false;

  // Start the simulation in a background thread and yield to the UI to keep it responsive while the simulation runs.

  if (!crtInstance.startRun()) {
    return;
  }

  runningInstances.add(crtInstance);

  // Release our instance if it has been replaced by a newer one (or if we got unmounted) while the simulation was
  // running, in which case our results are stale anyway.
  // Note: we do this even if waiting for the simulation to finish failed (e.g., if libOpenCOR threw an exception) since
  //       nothing else will release our instance (see reinstantiateInstance() and onBeforeUnmount()).

  let instanceReplaced = false;

  try {
    await vueCommon.waitWhileRunning(crtInstance).promise;
  } finally {
    runningInstances.delete(crtInstance);

    if (crtInstance !== instance) {
      instanceReplaced = true;

      crtInstance.release();
    }
  }

  if (instanceReplaced) {
    return;
  }

  // Check if we have been superseded by a newer call while the simulation was running.

  if (currentSimulationGeneration !== simulationGeneration) {
    return;
  }

  // Make sure that we haven't come across any issues during the simulation.

  if (crtInstance.hasIssues()) {
    simulationIssues.value = crtInstance.issues();

    return;
  }

  // A helper function to evaluate an expression within the given scope.

  const evaluateExpression = (expression: string, scope: math.ExpressionScope): math.FloatArray => {
    const res = mathEval.evaluate(expression, scope);

    if (typeof res === 'boolean') {
      return new Float64Array([res ? 1 : 0]);
    }

    if (typeof res === 'number') {
      return new Float64Array([res]);
    }

    return res;
  };

  // Interpolate any external data at the VOI values of our simulation and add the interpolated values to our scope.

  if (instanceTask) {
    const simulationVoi = instanceTask.voi();

    for (const externalDataItem of actualUiJson.value.output.externalData ?? []) {
      try {
        const voiValues = externalDataItem.voiValues;
        const voiExpression = externalDataItem.voiExpression?.trim();
        const externalDataItemVoi =
          !voiExpression || voiExpression === 'voi' ? voiValues : evaluateExpression(voiExpression, { voi: voiValues });

        const requiredSeriesNames = new Set<string>();

        for (const dataItem of externalDataItem.data) {
          requiredSeriesNames.add(dataItem.name);
        }

        const externalDataSeries: Record<string, math.FloatArray> = Object.create(null);

        for (const externalDataSerie of externalDataItem.dataSeries) {
          if (requiredSeriesNames.has(externalDataSerie.name)) {
            externalDataSeries[externalDataSerie.name] = externalDataSerie.values;
          }
        }

        for (const dataItem of externalDataItem.data) {
          const externalDataSerie = externalDataSeries[dataItem.name];

          if (externalDataSerie) {
            modelScope[dataItem.id] = externalDataValues(simulationVoi, {
              x: externalDataItemVoi,
              y: externalDataSerie
            });
          }
        }
      } catch (error: unknown) {
        simulationIssues.value.push({
          type: locApi.EIssueType.ERROR,
          description: `An error occurred while evaluating the VOI expression '${externalDataItem.voiExpression}' (${common.formatMessage(common.formatError(error), false)}).`
        });
      }
    }
  }

  // Make sure that we haven't come across any issues so far.

  if (simulationIssues.value.length) {
    addInformationIssue(simulationIssues.value);

    return;
  }

  // Update our mapping of data IDs to simulation data information.

  idToInfo.clear();

  actualUiJson.value.output.data.forEach((data: locApi.IUiJsonOutputData) => {
    if (data.id && instanceTask) {
      idToInfo.set(data.id, simulationDataInfo(instanceTask, data.name));
    }
  });

  // Update our scope with the latest simulation data.
  // Note: we only retrieve the simulation data that is used by our plots since retrieving simulation data means copying
  //       it (see simulationDataValue()), which can be costly for large simulations.

  if (instanceTask) {
    const usedDataIds = new Set<string>();

    for (const plot of actualUiJson.value.output.plots) {
      const expressions = [plot.xValue, plot.yValue];

      for (const additionalTrace of plot.additionalTraces ?? []) {
        expressions.push(additionalTrace.xValue, additionalTrace.yValue);
      }

      for (const expression of expressions) {
        for (const identifier of math.expressionIdentifiers(expression ?? '')) {
          usedDataIds.add(identifier);
        }
      }
    }

    for (const data of actualUiJson.value.output.data) {
      const info = idToInfo.get(data.id);

      if (info && usedDataIds.has(data.id)) {
        modelScope[data.id] = simulationDataValue(instanceTask, info).data;
      }
    }
  }

  // Evaluate the plot expressions to get the data to display.

  const normaliseFloat64Arrays = (
    x: math.FloatArray,
    y: math.FloatArray
  ): { x: math.FloatArray; y: math.FloatArray } => {
    // Return the arrays as they are if they are of the same length.

    if (x.length === y.length) {
      return {
        x,
        y
      };
    }

    // If one of the arrays is of length 1, broadcast it to the length of the other array.

    if (x.length === 1 && y.length > 1) {
      const value = x[0];
      const broadcastX = new Float64Array(y.length);

      broadcastX.fill(value);

      return {
        x: broadcastX,
        y
      };
    }

    if (y.length === 1 && x.length > 1) {
      const value = y[0];
      const broadcastY = new Float64Array(x.length);

      broadcastY.fill(value);

      return {
        x,
        y: broadcastY
      };
    }

    // We can't reconcile the lengths of these arrays, so fall back to the minimum length, which preserves as many valid
    // (x, y) pairs as possible.

    const minLength = Math.min(x.length, y.length);

    return {
      x: x.slice(0, minLength),
      y: y.slice(0, minLength)
    };
  };

  const newLiveData: IGraphPanelData[] = [];

  for (let i = 0; i < actualUiJson.value.output.plots.length; ++i) {
    const plot = actualUiJson.value.output.plots[i];

    if (!plot) {
      newLiveData[i] = {
        xAxisTitle: '',
        yAxisTitle: '',
        traces: []
      };

      continue;
    }

    let xMain: math.FloatArray = common.EMPTY_FLOAT64_ARRAY;

    try {
      xMain = evaluateExpression(plot.xValue, modelScope);
    } catch (error: unknown) {
      simulationIssues.value.push({
        type: locApi.EIssueType.ERROR,
        description: `An error occurred while evaluating the X value expression for plot '${plot.name}' (${common.formatMessage(common.formatError(error), false)}).`
      });
    }

    let yMain: math.FloatArray = common.EMPTY_FLOAT64_ARRAY;

    try {
      yMain = evaluateExpression(plot.yValue, modelScope);
    } catch (error: unknown) {
      simulationIssues.value.push({
        type: locApi.EIssueType.ERROR,
        description: `An error occurred while evaluating the Y value expression for plot '${plot.name}' (${common.formatMessage(common.formatError(error), false)}).`
      });
    }

    const normalisedMain = normaliseFloat64Arrays(xMain, yMain);

    const traces: IGraphPanelPlotTrace[] = [
      {
        traceId: `plot_${i}::trace_0`,
        name: vueCommon.traceName(plot.name, plot.xValue, plot.yValue),
        xValue: plot.xValue,
        x: normalisedMain.x,
        yValue: plot.yValue,
        y: normalisedMain.y,
        color: colors.DEFAULT_COLOR
      }
    ];

    for (
      let additionalTraceIndex = 0;
      additionalTraceIndex < (plot.additionalTraces ?? []).length;
      ++additionalTraceIndex
    ) {
      const additionalTrace = plot.additionalTraces?.[additionalTraceIndex];

      if (!additionalTrace) {
        continue;
      }

      let xAdditional: math.FloatArray = common.EMPTY_FLOAT64_ARRAY;

      try {
        xAdditional = evaluateExpression(additionalTrace.xValue, modelScope);
      } catch (error: unknown) {
        simulationIssues.value.push({
          type: locApi.EIssueType.ERROR,
          description: `An error occurred while evaluating the X value expression for additional trace #${additionalTraceIndex + 1} of plot '${plot.name}' (${common.formatMessage(common.formatError(error), false)}).`
        });
      }

      let yAdditional: math.FloatArray = common.EMPTY_FLOAT64_ARRAY;

      try {
        yAdditional = evaluateExpression(additionalTrace.yValue, modelScope);
      } catch (error: unknown) {
        simulationIssues.value.push({
          type: locApi.EIssueType.ERROR,
          description: `An error occurred while evaluating the Y value expression for additional trace #${additionalTraceIndex + 1} of plot '${plot.name}' (${common.formatMessage(common.formatError(error), false)}).`
        });
      }

      const normalisedAdditional = normaliseFloat64Arrays(xAdditional, yAdditional);

      traces.push({
        traceId: `plot_${i}::trace_${additionalTraceIndex + 1}`,
        name: vueCommon.traceName(additionalTrace.name, additionalTrace.xValue, additionalTrace.yValue),
        xValue: additionalTrace.xValue,
        x: normalisedAdditional.x,
        yValue: additionalTrace.yValue,
        y: normalisedAdditional.y,
        color: colors.DEFAULT_COLOR
      });
    }

    newLiveData[i] = {
      xAxisTitle: plot.xAxisTitle,
      yAxisTitle: plot.yAxisTitle,
      traces
    };
  }

  liveData.value = newLiveData;

  // Make sure that we haven't come across any issues so far.

  if (simulationIssues.value.length) {
    addInformationIssue(simulationIssues.value);

    return;
  }

  // Let people know that the simulation data has been updated.

  simulationDataAvailable = true;

  emit('simulationData');
};

const updateSimulation = async (): Promise<void> => {
  // Make sure that the view is usable, i.e. that we have a model and an instance, and that there are no issues with the
  // UI JSON.
  // Note: we may have been called to continue an input simulation update (see startInputSimulationUpdate()), in which
  //       case we are still considered to be simulating (see below), so we make sure that we are not anymore. This is
  //       safe since no simulation can be running if we have no model or instance, or if our UI JSON has issues (any
  //       simulation run gets cancelled when our settings are changed, see onSettingsOk()).

  if (!model || !instance || uiJsonIssues.value.length) {
    isSimulating.value = false;

    return;
  }

  // Increment the simulation generation so that we can cancel any previous simulation runs that are still in progress.

  const currentSimulationGeneration = ++simulationGeneration;

  // Run the simulation, keeping track of the fact that we are simulating, and report any unexpected error (e.g., an
  // exception thrown by libOpenCOR) as a simulation issue rather than leave us in a simulating state forever.
  // Note #1: only the latest simulation run gets to report an error and to say that we are no longer simulating since
  //          an older one has been superseded and the latest one is still in charge.
  // Note #2: if an input has changed while we were running (see onInputChange()), then another simulation run is about
  //          to start (see startInputSimulationUpdate()), so we are still simulating.

  isSimulating.value = true;

  try {
    await runSimulation(currentSimulationGeneration);
  } catch (error: unknown) {
    if (currentSimulationGeneration === simulationGeneration) {
      simulationIssues.value = [
        {
          type: locApi.EIssueType.ERROR,
          description: `An unexpected error occurred while running the simulation (${common.formatMessage(common.formatError(error), false)}).`
        }
      ];

      addInformationIssue(simulationIssues.value);
    }
  } finally {
    if (currentSimulationGeneration === simulationGeneration && !inputSimulationUpdatePending) {
      isSimulating.value = false;
    }
  }
};

// Cancel any simulation run that is in progress, as well as any pending input simulation update.
// Note: the cancelled simulation run will see that it has been superseded (see runSimulation()), so it won't report its
//       results nor say that we are no longer simulating (see updateSimulation()), hence we do the latter here.

const cancelSimulation = (): void => {
  ++simulationGeneration;

  inputSimulationUpdatePending = false;
  isSimulating.value = false;

  if (instance && instance.status() !== locSedApi.ESedInstanceStatus.IDLE) {
    instance.stopRun();
  }
};

// Margins-related event handlers.

const onMarginsUpdated = (plotId: string, newMargins: IGraphPanelMargins): void => {
  margins[plotId] = newMargins;

  let marginCount = 0;
  let maxLeft = 0;
  let maxRight = 0;

  for (const key in margins) {
    const margin = margins[key];

    if (!margin) {
      continue;
    }

    ++marginCount;

    maxLeft = Math.max(maxLeft, margin.left);
    maxRight = Math.max(maxRight, margin.right);
  }

  if (marginCount !== actualUiJson.value.output.plots.length) {
    compMargins.value = undefined;

    return;
  }

  // Update our shared margins, but only if they have actually changed since updating them means that all our plots get
  // relaid out.

  if (compMargins.value?.left === maxLeft && compMargins.value?.right === maxRight) {
    return;
  }

  compMargins.value = {
    left: maxLeft,
    right: maxRight
  };
};

const onResetMargins = (): void => {
  // Note: our plots only emit their margins when they change, so we must ask them to emit them again. Unsetting our
  //       shared margins would get our plots to do so, but only if we had some shared margins (e.g., not if some plot
  //       hadn't emitted its margins yet or if a plot was removed while there were some simulation issues).

  margins = {};
  compMargins.value = undefined;

  for (const graphPanelRef of Object.values(graphPanelRefs.value)) {
    graphPanelRef?.resetMargins();
  }
};

// Runs-related event handlers

const onTrackRun = (): void => {
  // Make sure that there is no simulation in progress or any issue with the current simulation data. Indeed, if we were
  // to track the current run while a simulation is still running, then we would end up tracking the data of the
  // previous run while using the input values of the new run, which would result in a mismatch between the two.

  if (isSimulating.value || simulationIssues.value.length) {
    return;
  }

  // Create a new run from the live run.
  // Note: an input id comes from the UI JSON, so it may be the name of an Object.prototype property (e.g.,
  //       "constructor" or "__proto__"), hence we use an object without a prototype.

  const inputParameters: Record<string, number> = Object.create(null);

  for (let i = 0; i < actualUiJson.value.input.length; ++i) {
    const input = actualUiJson.value.input[i];

    if (!input) {
      continue;
    }

    const inputValue = inputValues.value[i];

    if (inputValue !== undefined) {
      inputParameters[input.id] = inputValue;
    }
  }

  // Compute the tooltip for this run, keeping in mind that some simulation inputs may not be visible.
  // Note: our tooltip is a rich hint (see common/hint.ts), so we escape the name and value of our simulation inputs,
  //       which come from our UI JSON (i.e. from our file) and are shown as plain text elsewhere (see InputWidget.vue).

  const tooltipRows: string[] = [];

  for (let i = 0; i < actualUiJson.value.input.length; ++i) {
    if (!showInput.value[i]) {
      continue;
    }

    const input = actualUiJson.value.input[i];

    if (!input) {
      continue;
    }

    let inputValue: string | number | undefined = inputParameters[input.id];

    if (locApi.isDiscreteInput(input)) {
      const selectedValue = input.possibleValues.find((possibleValue) => {
        return possibleValue.value === inputParameters[input.id];
      });

      if (selectedValue?.name) {
        inputValue = selectedValue.name.charAt(0).toLowerCase() + selectedValue.name.slice(1);
      } else {
        inputValue = inputParameters[input.id];
      }
    }

    tooltipRows.push(
      `<tr><th>${common.escapeHtml(input.name)}:</th><td>${common.escapeHtml(String(inputValue ?? ''))}</td></tr>`
    );
  }

  const tooltip = `<table>
  <tbody>
    ${tooltipRows.join('')}
  </tbody>
</table>`;

  // Determine the colour (of the first trace) by using the next unused colour in the palette unless all the colours
  // have already been used.

  const usedColors = new Set<string>();

  for (const run of runs.value) {
    usedColors.add(run.color);
  }

  const lastColor = runs.value[runs.value.length - 1]?.color ?? colors.DEFAULT_COLOR;
  const lastColorIndex = colors.PALETTE_COLORS.indexOf(lastColor);
  let color: string = colors.DEFAULT_COLOR;

  for (let i = 1; i <= colors.PALETTE_COLORS.length; ++i) {
    const newColor = colors.PALETTE_COLORS[(lastColorIndex + i) % colors.PALETTE_COLORS.length];

    if (newColor && (!usedColors.has(newColor) || usedColors.size === colors.PALETTE_COLORS.length)) {
      color = newColor;

      break;
    }
  }

  // Add the new run.

  runs.value.push({
    id: `run_${++trackedRunId}`,
    inputParameters,
    isVisible: true,
    data: liveData.value,
    color,
    tooltip,
    isLiveRun: false
  });
};

// The name of the given run (e.g., "live run" or "run #3"), which is used in the labels of the buttons of a run, so
// that they say which run they are for (e.g., when read by a screen reader), and, capitalised, as the name of the run
// itself.

const runName = (run: ISimulationRun, index: number, capitalised = false): string => {
  const res = run.isLiveRun ? 'live run' : `run #${index}`;

  return capitalised ? res.charAt(0).toUpperCase() + res.slice(1) : res;
};

// Keep the keyboard focus within our runs when one (or all) of them gets removed while the keyboard focus is on its (or
// their) remove button (or on another of its (or their) buttons) or on our Remove all tracked runs button since the
// focused button would otherwise disappear (or get disabled) and the keyboard focus would be lost. The keyboard focus
// goes to the remove button of the run that takes the place of the removed run or, if there is none, of the previous
// run, or to our Track run button if there are no tracked runs anymore (or to the visibility button of our live run if
// our Track run button is disabled, e.g., if our simulation has issues).
// Note: a toolbar button doesn't get the focus when it is clicked (see ToolbarButtonWidget.vue), so a button only has
//       the focus if it was focused using the keyboard (be it then activated using the keyboard or the mouse).

const runsListRef = vue.useTemplateRef<HTMLElement>('runsListRef');
const trackRunButtonRef = vue.useTemplateRef<{ $el: HTMLElement }>('trackRunButtonRef');

// Whether the keyboard focus is on one of the buttons of the runs from the given index onwards (up to the given number
// of runs).

const runsHaveFocus = (index: number, count = Infinity): boolean => {
  const activeElement = window.document.activeElement;

  return Array.from(runsListRef.value?.children ?? [])
    .slice(index, index + count)
    .some((runRow: Element) => runRow.contains(activeElement));
};

const keepFocusAfterRunRemoval = async (index: number): Promise<void> => {
  await vue.nextTick();

  // Note: the live run has no remove button, so the remove button of the run at the given index is at index - 1.

  const removeButtons = Array.from(runsListRef.value?.querySelectorAll<HTMLElement>('.run-remove-button') ?? []);
  const removeButton = removeButtons[Math.min(index, removeButtons.length) - 1];

  if (removeButton) {
    removeButton.focus();

    return;
  }

  const trackRunButton = trackRunButtonRef.value?.$el;

  if (trackRunButton instanceof HTMLButtonElement && !trackRunButton.disabled) {
    trackRunButton.focus();
  } else {
    runsListRef.value?.querySelector<HTMLElement>('.run-visibility-button')?.focus();
  }
};

const onRemoveRun = (index: number): void => {
  // Remove the given run.

  const hadFocus = runsHaveFocus(index, 1);

  runs.value.splice(index, 1);

  if (hadFocus) {
    void keepFocusAfterRunRemoval(index);
  }
};

const onRemoveAllRuns = (event?: Event): void => {
  // Remove all the runs except the live run.
  // Note: we may also be called programmatically (e.g., when our settings get updated), in which case there is no
  //       event.

  const hadFocus = !!event && (event.currentTarget === window.document.activeElement || runsHaveFocus(1));

  runs.value.splice(1);

  if (hadFocus) {
    void keepFocusAfterRunRemoval(1);
  }
};

const onToggleRun = (index: number): void => {
  // Toggle the visibility of the given run.

  const run = runs.value[index];

  if (run) {
    run.isVisible = !run.isVisible;
  }
};

const onRunColorChange = (index: number, color: string): void => {
  const run = runs.value[index];

  if (run) {
    run.color = color;
  }
};

// Show/hide our colour popover for the given run.
// Note #1: when our popover is shown using the keyboard, the swatch of the current colour of our run is focused (see
//          its autofocus attribute), so that our popover can be used with the keyboard straightaway. When it is shown
//          using the mouse, our swatches are focused (and therefore get a focus ring and show their hint) only once the
//          keyboard is used, so it is our swatches' container that is focused (see its autofocus attribute) and the
//          swatch of the current colour of our run gets focused as soon as Tab or an arrow key is pressed (or the
//          first/last swatch if Home/End is pressed, see onColorSwatchesKeyDown()). Otherwise, the swatch of the
//          current colour of our run would be focused programmatically, in which case the browser decides whether it
//          gets a focus ring (and therefore shows its hint) based on how the keyboard focus was last moved (e.g., not
//          once a swatch has been clicked).
// Note #2: a click event that is triggered using the keyboard (i.e. using Enter or Space) has no detail.
// Note #3: our popover keeps the keyboard focus within itself (i.e. Tab goes from one swatch to another), and Escape
//          hides it and gives the keyboard focus back to the colour button of our run.
// Note #4: the left/right arrow keys also go from one swatch to another (wrapping around), and the Home/End keys go to
//          the first/last swatch (see onColorSwatchesKeyDown()).
// Note #5: our popover is toggled when the colour button of the run for which it is shown is pressed, but it is moved
//          to another run when the colour button of that run is pressed, i.e. it is hidden and then shown again for
//          that run (so that it gets aligned with, and focused for, that run). Our run is only updated once our popover
//          has started hiding, so that it doesn't show the colour of the other run while hiding. Also, our popover is
//          shown again for the colour button that was pressed, which we must therefore pass on explicitly since the
//          current target of the event cannot be relied upon by then (e.g., it is null once the event has been
//          dispatched, as is the case for a click that is triggered programmatically).

const onToggleRunColorPopover = async (index: number, event: MouseEvent): Promise<void> => {
  const popover = runColorPopoverRef.value;
  const colorButton = event.currentTarget;
  const openedUsingKeyboard = event.detail === 0;

  if (!popover || !(colorButton instanceof HTMLElement)) {
    return;
  }

  if (runColorPopoverVisible.value && runColorPopoverIndex.value !== index) {
    popover.hide();

    await vue.nextTick();

    runColorPopoverIndex.value = index;
    runColorPopoverOpenedUsingKeyboard.value = openedUsingKeyboard;

    popover.show({ currentTarget: colorButton } as unknown as Event, colorButton);

    return;
  }

  runColorPopoverIndex.value = index;
  runColorPopoverOpenedUsingKeyboard.value = openedUsingKeyboard;

  popover.toggle(event);
};

const onColorSwatchesKeyDown = (event: KeyboardEvent): void => {
  if (!['Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    return;
  }

  const swatches = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.color-swatch'));
  const index = swatches.indexOf(window.document.activeElement as HTMLElement);

  // Focus the swatch of the current colour of our run (or the first/last swatch) if no swatch has the focus yet, i.e.
  // if our popover was shown using the mouse (see Note #1 above).

  if (index === -1) {
    event.preventDefault();

    const selectedIndex = swatches.findIndex((swatch: HTMLElement) =>
      swatch.classList.contains('color-swatch-selected')
    );

    swatches[
      event.key === 'Home' ? 0 : event.key === 'End' ? swatches.length - 1 : Math.max(selectedIndex, 0)
    ]?.focus();

    return;
  }

  // Let our popover handle Tab (see Note #3 above).

  if (event.key === 'Tab') {
    return;
  }

  event.preventDefault();

  const newIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? swatches.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + swatches.length) % swatches.length;

  swatches[newIndex]?.focus();
};

// Download COMBINE archive.

const onDownloadCombineArchive = (): void => {
  const jsZip = new dependencies._jsZip();
  const baseFileName = common.baseFileName(common.fileName(props.file.canonicalPath()));
  const modelFile = model?.file();

  if (!modelFile) {
    emit('error', 'Cannot create COMBINE archive: no model file available.');

    return;
  }

  jsZip.file(
    'manifest.xml',
    `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>
<omexManifest xmlns="http://identifiers.org/combine.specifications/omex-manifest">
  <content location="." format="http://identifiers.org/combine.specifications/omex"/>
  <content location="document.sedml" format="http://identifiers.org/combine.specifications/sed-ml" master="true"/>
  <content location="model.cellml" format="http://identifiers.org/combine.specifications/cellml"/>
  <content location="simulation.json" format="http://purl.org/NET/mediatypes/application/json"/>
</omexManifest>
`
  );

  try {
    // Note: we release our model file even if something goes wrong while retrieving its contents or serialising our
    //       document.

    jsZip.file('model.cellml', modelFile.contents());
    jsZip.file('document.sedml', document.serialise().replace(modelFile.path(), 'model.cellml'));
  } finally {
    modelFile.release();
  }

  jsZip.file('simulation.json', JSON.stringify(actualUiJson.value, locApi.uiJsonReplacer, 2));

  jsZip
    .generateAsync({
      type: 'blob',
      compression: 'DEFLATE'
    })
    .then((content: Blob) => {
      common.downloadFile(`${baseFileName}.omex`, content, 'application/zip');
    })
    .catch((error: unknown) => {
      console.warn('OpenCOR: failed to generate COMBINE archive:', common.formatError(error));
    });
};

// Settings dialog event handler.

const onSettingsOk = (updatedSettings: ISimulationExperimentInteractiveViewSettingsDialog): void => {
  if (!uniformTimeCourse) {
    settingsVisible.value = false;

    return;
  }

  const newSettingsJson = serialisedSettings(updatedSettings);
  const settingsHaveChanges = newSettingsJson !== oldSettings.value;

  oldSettings.value = newSettingsJson;

  if (!settingsHaveChanges) {
    settingsVisible.value = false;

    return;
  }

  // Cancel any simulation run that is in progress since its results would be stale (and would otherwise be reported
  // using our new settings).

  cancelSimulation();

  // Clear all our tracked runs.

  onRemoveAllRuns();

  // Update our settings and hide the dialog.
  // Note: our settings may have been confirmed even though they have some issues (so that they can, for instance, be
  //       saved as a COMBINE archive and fixed later), in which case we must not silently run our simulation with some
  //       other settings, but let libOpenCOR report those issues. So, our number of steps is such that our point
  //       interval can be retrieved from it (e.g., a negative point interval gives a negative number of steps), unless
  //       our point interval is zero, not finite, or so small that our number of steps cannot be handled by libOpenCOR,
  //       in which case we use zero steps. Either way, libOpenCOR will report an invalid number of steps. If our
  //       settings are valid, then we use at least one step (i.e. if our point interval is greater than our simulation
  //       range).

  const { initialPoint, startingPoint, endingPoint, pointInterval } = updatedSettings.simulation;

  uniformTimeCourse.setInitialTime(initialPoint);
  uniformTimeCourse.setOutputStartTime(startingPoint);
  uniformTimeCourse.setOutputEndTime(endingPoint);

  let numberOfSteps = Math.round((endingPoint - startingPoint) / pointInterval);

  if (Number.isFinite(pointInterval) && pointInterval > 0 && endingPoint > startingPoint) {
    numberOfSteps = Math.max(1, numberOfSteps);
  }

  if (!Number.isFinite(numberOfSteps) || Math.abs(numberOfSteps) > locApi.MAXIMUM_NUMBER_OF_STEPS) {
    numberOfSteps = 0;
  }

  uniformTimeCourse.setNumberOfSteps(numberOfSteps);

  cvode?.setMaximumStep(updatedSettings.solvers.cvodeMaximumStep);

  actualUiJson.value = locApi.cleanUiJson(updatedSettings.interactive.uiJson);
  uiJsonStructureRepaired.value = false;
  settingsVisible.value = false;

  // Validate the new UI JSON settings.

  uiJsonIssues.value = locApi.validateUiJson(updatedSettings.interactive.uiJson, {
    allModelParameters: allModelParameters.value,
    editableModelParameters: editableModelParameters.value
  });

  // Make sure that our next simulation run doesn't use our current instance since it was instantiated using our old
  // settings.
  // Note: this is only relevant if our current instance has yet to be run (e.g., if our previous simulation run
  //       couldn't be started because of some issues).

  instanceIsPristine = false;

  // Remove the model changes from our previous simulation run if our new UI JSON is invalid.
  // Note: we don't run any simulation with an invalid UI JSON, so those model changes would otherwise be left in our
  //       document and, therefore, be exported with it (see onDownloadCombineArchive()) even though they don't match
  //       our new UI JSON.

  if (uiJsonIssues.value.length > 0) {
    applyModelChanges([]);

    return;
  }

  // Update our UI.

  updateUi();

  // Update the simulation with the new UI JSON settings.

  updateSimulation();

  // Reset the margins of our various plots.
  // Note #1: this is needed when the number of plots changes or when a simulation couldn't originally be run and now it
  //          can be run with the new settings. Without this, the plots will start with incorrect margins before they
  //          get updated which results in some flashing.
  // Note #2: we reset them even if the simulation has some issues since those issues may get resolved without our
  //          settings being changed (e.g., by changing an input), in which case our plots would otherwise be shown with
  //          the margins from before our settings were changed (see onMarginsUpdated()).

  onResetMargins();
};

// Update the simulation following a change to one of our inputs.
// Note: an input (e.g., a slider being dragged) can change faster than a simulation run completes. So, rather than
//       starting a new simulation run (and therefore instantiating a new instance) for every change, we let the current
//       simulation run complete and then start a new one using the latest input values (i.e. latest value wins). This
//       means that intermediate input values may be skipped, but that we always have at most one simulation run in
//       flight and that the simulation is still updated while an input is being changed.

let inputSimulationUpdateInFlight: Promise<void> | null = null;
let inputSimulationUpdatePending = false;

const startInputSimulationUpdate = (): void => {
  const inputSimulationUpdate = updateSimulation().finally(async () => {
    // Give our plots a chance to be rendered before starting a new simulation run, if needed.

    if (inputSimulationUpdatePending) {
      await common.waitForNextAnimationFrame();
    }

    // Check whether we have been superseded by a newer input simulation update (see onInputChangeEnd()), in which case
    // it is up to that update to deal with any pending input change.

    if (inputSimulationUpdate !== inputSimulationUpdateInFlight) {
      return;
    }

    inputSimulationUpdateInFlight = null;

    if (inputSimulationUpdatePending) {
      inputSimulationUpdatePending = false;

      startInputSimulationUpdate();
    }
  });

  inputSimulationUpdateInFlight = inputSimulationUpdate;
};

const onInputChange = (): void => {
  if (inputSimulationUpdateInFlight) {
    inputSimulationUpdatePending = true;

    return;
  }

  startInputSimulationUpdate();
};

const onInputChangeEnd = (): void => {
  // An input has finished changing (e.g., a value has been selected or a slider has been released), so rather than wait
  // for the current simulation run to complete, cancel it and start a new one straight away using the final input
  // values, if needed.
  // Note: updateSimulation() takes care of stopping the current simulation run.

  if (inputSimulationUpdatePending) {
    inputSimulationUpdatePending = false;

    startInputSimulationUpdate();
  }
};

// Reset all our simulation inputs to their default values.
// Note: a scalar input may show a value that has yet to be committed (i.e. while it is being edited), so we also keep
//       track of whether the value shown by an input is its default value, so that our inputs can be reset even if
//       their committed values are their default values. An input that doesn't tell us whether the value it shows is
//       its default value (e.g., a discrete input) shows its committed value.

const onInputAtDefaultValueChange = (index: number, atDefaultValue: boolean): void => {
  inputsShownAtDefaultValues.value[index] = atDefaultValue;
};

const allSimulationInputsAtDefaultValues = vue.computed<boolean>(() => {
  return actualUiJson.value.input.every((input: locApi.IUiJsonInput, index: number) => {
    return inputValues.value[index] === input.defaultValue && inputsShownAtDefaultValues.value[index] !== false;
  });
});

// Give the keyboard focus to our first visible simulation input, if our Reset all simulation inputs button had it,
// since that button gets hidden (and disabled) once all our simulation inputs are at their default values, and the
// keyboard focus would otherwise be lost (as when removing runs, see keepFocusAfterRunRemoval()).
// Note #1: our reset button keeps the focus where it is when clicked (see its keepFocus property), so it only has the
//          focus if it was focused using the keyboard.
// Note #2: we look for the first element that can be tabbed to, i.e. the text field of a scalar input or the select of
//          a discrete input, since it comes before the other elements of an input that can be tabbed to (e.g., the
//          handle of the slider of a scalar input). We do this using the DOM since the order of our input widgets in
//          inputWidgetsRef is not guaranteed to be the order in which they are shown.

const simulationInputsRef = vue.useTemplateRef<HTMLElement>('simulationInputsRef');
const TABBABLE_ELEMENTS = 'input:not([type="hidden"], [tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

const keepFocusAfterInputsReset = async (resetButton: Element): Promise<void> => {
  await vue.nextTick();

  // Don't move the keyboard focus if it has gone somewhere else in the meantime (i.e. somewhere else than <body> or our
  // reset button, which may keep the keyboard focus once disabled, depending on the browser).

  const activeElement = window.document.activeElement;

  if (activeElement && activeElement !== window.document.body && activeElement !== resetButton) {
    return;
  }

  Array.from(simulationInputsRef.value?.querySelectorAll<HTMLElement>(TABBABLE_ELEMENTS) ?? [])
    .find((element: HTMLElement) => element.getClientRects().length > 0 && !element.matches(':disabled'))
    ?.focus();
};

const onResetInputs = (event: Event): void => {
  const resetButton = event.currentTarget instanceof Element ? event.currentTarget : null;
  const hadFocus = !!resetButton && resetButton === window.document.activeElement;

  // Discard any value that is being edited, so that it doesn't get committed (and simulated) once its input loses the
  // focus.
  // Note: our reset button keeps the focus where it is when clicked (see its keepFocus property), so that the input
  //       that has the focus (if any) doesn't commit its value before we get here.

  for (const inputWidget of inputWidgetsRef.value) {
    inputWidget.discardEdit();
  }

  // Reset our input values and rerun our simulation, but only if needed (i.e. if there was only a value being edited
  // then there is nothing else to do).

  const defaultInputValues = actualUiJson.value.input.map((input: locApi.IUiJsonInput) => {
    return input.defaultValue;
  });

  if (
    !defaultInputValues.every((defaultInputValue: number, index: number) => {
      return inputValues.value[index] === defaultInputValue;
    })
  ) {
    inputValues.value = defaultInputValues;

    onInputChange();
    onInputChangeEnd();
  }

  // Keep the keyboard focus, if our reset button had it.
  // Note: we do this once our inputs have been reset, so that we wait for our UI to reflect it (e.g., for our reset
  //       button to be hidden and for some of our inputs to be shown/hidden, see runSimulation()). Otherwise, we would
  //       look for our first visible simulation input before our UI gets updated, i.e. we might give the keyboard focus
  //       to an input that is about to be hidden.

  if (hadFocus) {
    void keepFocusAfterInputsReset(resetButton);
  }
};

// Make sure that any pending simulation updates are discarded once we get unmounted.

vue.onBeforeUnmount(() => {
  ++simulationGeneration;

  inputSimulationUpdatePending = false;

  // Dispose of our instance and release our document (and its model and simulation).
  // Note: we always release our document, even if something goes wrong with our instance (e.g., if libOpenCOR throws an
  //       exception while stopping a simulation run) since we would otherwise leak it.

  try {
    if (instance) {
      disposeInstance(instance);
    }
  } catch (error: unknown) {
    console.error('OpenCOR: an error occurred while disposing of a simulation instance:', common.formatError(error));
  } finally {
    instance = null;
    instanceTask = null;

    document.release();
  }
});

// Various things that need to be done once we are mounted.

vue.onMounted(() => {
  opencorElement.value = rootRef.value?.closest<HTMLElement>('.opencor') ?? null;
  fileTabElement.value = rootRef.value?.offsetParent instanceof HTMLElement ? rootRef.value.offsetParent : null;

  updateSimulation();

  const windowIsFocused = vueusecore.useWindowFocus();

  vue.watch(
    () => windowIsFocused.value,
    (isFocused) => {
      if (!isFocused) {
        if (runColorPopoverIndex.value !== -1) {
          runColorPopoverRef.value?.hide();

          runColorPopoverIndex.value = -1;
        }
      }
    }
  );
});
</script>

<style scoped>
.color-swatch:hover {
  box-shadow: 0 2px 8px var(--p-shadow-color, rgba(0, 0, 0, 0.15));
}

.opencor-dark-mode .color-swatch:hover {
  box-shadow: 0 2px 8px var(--p-shadow-color-dark, rgba(255, 255, 255, 0.15));
}

/**
 * Note: focus outlines are removed (see app.css), which would also remove the outline of the selected swatch when it
 *       gets the focus, so we restore it.
 */

.color-swatch-selected {
  outline-color: var(--p-text-color);
}

.color-swatch-selected:focus {
  outline: 2px solid var(--p-text-color) !important;
}

/**
 * Focus ring of a swatch, which is like that of our other buttons (see app.css), i.e. a ring in the primary colour that
 * is offset from the swatch (or, for the selected swatch, that is right outside its outline).
 * Note: it is also shown when the swatch is hovered, hence the :hover variant, which takes precedence over the box
 *       shadow of a hovered swatch (in both light and dark modes).
 */

.color-swatch:focus-visible,
.color-swatch:focus-visible:hover {
  box-shadow:
    0 0 0 2px var(--p-content-background),
    0 0 0 4px var(--p-primary-color);
}

/**
 * Empty view, i.e. when our view has not been configured yet.
 */

.empty-view {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  text-align: center;
}

.empty-view-icon {
  margin-bottom: 0.25rem;
  color: var(--p-text-muted-color);
  font-size: 1.5rem;
}

.empty-view-title {
  margin: 0;
  color: var(--p-text-color);
  font-weight: 600;
}

.empty-view-text {
  margin: 0 0 0.5rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

/**
 * Side panel, i.e. our simulation inputs and runs.
 * Note: an input field has an intrinsic width (of about 20 characters), which would otherwise make our side panel wider
 *       than we want, so we let our number fields shrink to the width of our side panel. This means that a number field
 *       with a reset button doesn't need the negative margin that keeps its intrinsic width the same (see
 *       InputScientificNumberWidget.vue), and which would otherwise make it overflow our side panel.
 */

.side-panel-column {
  flex-shrink: 0;
  width: 16rem;
  border-right: 1px solid var(--p-content-border-color);
}

/**
 * Narrow layout (see useNarrowLayout() in vueCommon.ts), i.e. our side panel is stacked above our plots (rather than
 * shown to their left), so that our plots remain usable (e.g., on a phone or when OpenCOR is embedded in a small
 * container). Our side panel then takes the whole width and part of the height of our view, and can be scrolled.
 */

.panels.narrow-layout {
  flex-direction: column;
}

.narrow-layout .side-panel-column {
  width: auto;
  height: 40%;
  border-right: none;
  border-bottom: 1px solid var(--p-content-border-color);
}

.narrow-layout .plots-column {
  flex: 1 1 0;
  height: auto;
}

.side-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1rem;
}

.side-panel :deep(.p-inputnumber .p-inputnumber-input) {
  flex: 1 1 auto;
  width: 0;
  min-width: 0;
  margin-right: 0;
}

.side-panel-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.side-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 1.5rem;
}

.side-panel-fields {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding-top: 0.375rem;
}

.side-panel-hint {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  line-height: 1.25rem;
}

.side-panel-hint .pi {
  line-height: inherit;
}

/**
 * Runs, which actions are always shown (so that they can easily be discovered), but with small icons (the same size as
 * that of our colour button), so that they don't stand out.
 */

.runs-list {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.run-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.125rem 0.25rem 0.125rem 0.125rem;
  border-radius: 0.375rem;
  transition: background-color 0.15s ease;
}

.run-row:hover {
  background-color: var(--p-content-hover-background);
}

.run-name {
  overflow: hidden;
  font-size: 0.875rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/**
 * Note: we only fade the icon of the colour button of a hidden run since fading the button itself would also fade its
 *       tooltip (see ToolbarButtonWidget.vue).
 */

.run-row-hidden .run-name,
.run-row-hidden .run-color-button :deep(.toolbar-button-icon) {
  opacity: 0.45;
}

.run-color-button :deep(.toolbar-button-icon),
.run-actions :deep(.toolbar-button-icon) {
  font-size: 0.75rem;
}

.run-actions {
  display: flex;
  align-items: center;
}

.empty-state {
  padding: 0.5rem;
  border: 1px dashed var(--p-content-border-color);
  border-radius: 0.5rem;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  text-align: center;
}
</style>
