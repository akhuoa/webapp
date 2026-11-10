<template>
  <div ref="rootRef" class="settings-dialog-root">
    <BaseDialog v-bind="$attrs" header="Settings" class="settings-dialog w-270 h-210"
      :centreOn="centreOn"
      @keydown.enter="onKeydownEnter"
      @cancel="onCancel"
    >
      <div class="settings-body h-full flex min-h-0">
        <!-- Navigation -->

        <nav class="settings-nav" aria-label="Settings sections">
          <div v-for="navGroup in navGroups" :key="navGroup.label" class="settings-nav-group">
            <div class="settings-nav-group-label opencor-section-title opencor-section-title-small">
              <span>{{ navGroup.label }}</span>
              <i v-if="navGroup.hasIssues" class="pi pi-exclamation-triangle settings-nav-issues" role="img" v-hint="'Some settings have issues'" />
            </div>
            <button v-for="navItem in navGroup.items" :key="navItem.label"
              type="button"
              class="settings-nav-item"
              :class="{ 'settings-nav-item-active': isActiveSection(navItem) }"
              :aria-current="isActiveSection(navItem) ? 'true' : undefined"
              @click="selectSection(navItem)"
            >
              <i :class="navItem.icon" class="settings-nav-item-icon" />
              <span class="flex-1 truncate">{{ navItem.label }}</span>
              <i v-if="navItem.hasIssues" class="pi pi-exclamation-triangle settings-nav-issues" role="img" v-hint="'Some settings have issues'" />
              <span v-if="navItem.count !== undefined" class="settings-nav-count">{{ navItem.count }}</span>
            </button>
          </div>
        </nav>

        <!-- Sections -->

        <div class="settings-content">
          <!-- Simulation -->

          <section v-show="activeTab === 'simulation'" class="settings-section">
            <header class="section-header">
              <div class="min-w-0">
                <h3 class="section-title">Simulation</h3>
                <p class="section-description">Configure the initial, starting, and ending points of the simulation, as well as its point interval.</p>
              </div>
            </header>
            <div class="settings-form">
              <div class="form-row">
                <InputScientificNumberWidget v-model="localSettings.simulation.initialPoint" class="form-field"
                  :label="`Initial point (${voiUnit})`"
                  size="small"
                />
                <div class="form-field self-stretch">
                  <div v-if="!simulationSettingsIssues.length" class="form-hint">
                    <i class="pi pi-info-circle"></i>
                    <span>Data points between the initial and starting points will not be tracked.</span>
                  </div>
                </div>
              </div>
              <div class="form-row">
                <InputScientificNumberWidget v-model="localSettings.simulation.startingPoint" class="form-field"
                  :label="`Starting point (${voiUnit})`"
                  size="small"
                />
                <InputScientificNumberWidget v-model="localSettings.simulation.endingPoint" class="form-field"
                  :label="`Ending point (${voiUnit})`"
                  size="small"
                />
              </div>
              <div class="form-row">
                <InputScientificNumberWidget v-model="localSettings.simulation.pointInterval" class="form-field"
                  :label="`Point interval (${voiUnit})`"
                  size="small"
                />
                <div class="form-field self-stretch">
                  <div v-if="!simulationSettingsIssues.length" class="form-hint">
                    <i class="pi pi-info-circle"></i>
                    <span>This will result in {{ numberOfDataPoints }} data points.</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- Solvers -->

          <section v-show="activeTab === 'solvers'" class="settings-section">
            <header class="section-header">
              <div class="min-w-0">
                <h3 class="section-title">Solvers</h3>
                <p class="section-description">Configure CVODE's maximum step (additional settings will be added in the future).</p>
              </div>
            </header>
            <div class="settings-form">
              <div class="form-row">
                <InputScientificNumberWidget v-model="localSettings.solvers.cvodeMaximumStep" class="form-field"
                  :label="`CVODE's maximum step (${voiUnit})`"
                  size="small"
                />
                <div class="form-field self-stretch">
                  <div class="form-hint">
                    <i class="pi pi-info-circle"></i>
                    <span>Set to 0 to let CVODE choose a suitable step.</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- Simulation inputs -->

          <section v-show="activeTab === 'interactive' && activeInteractiveTab === 'simulationInputs'" class="settings-section">
            <header class="section-header">
              <div class="min-w-0">
                <h3 class="section-title">Simulation inputs</h3>
                <p class="section-description">Configure the simulation inputs that a user can modify and that will be made available for setting model parameters.</p>
              </div>
              <Button class="shrink-0"
                icon="pi pi-plus"
                label="Add simulation input"
                outlined
                size="small"
                @click="addInput"
              />
            </header>
            <ScrollPanel class="min-h-0">
              <div class="items-list">
                <!-- Empty state -->

                <div v-if="!localSettings.interactive.uiJson.input.length" class="empty-state">
                  <i class="pi pi-sign-in empty-state-icon"></i>
                  <p>No simulation inputs are configured.</p>
                </div>

                <!-- Simulation input cards -->

                <div v-for="(input, inputIndex) in localSettings.interactive.uiJson.input" :key="`input_${inputIndex}`" class="card-item">
                  <div class="card-header">
                    <div class="card-title">
                      <span class="item-index">{{ Number(inputIndex) + 1 }}</span>
                      <span class="font-medium truncate">{{ input.name }}</span>
                      <Tag :value="locApi.isDiscreteInput(input) ? 'Discrete' : 'Scalar'" severity="secondary" />
                    </div>
                    <ToolbarButtonWidget class="remove-button"
                      icon="pi pi-trash"
                      small
                      label="Remove simulation input"
                      tooltipAlign="end"
                      @click="removeInput(inputIndex)"
                    />
                  </div>
                  <div class="card-body">
                    <!-- Common fields -->

                    <div class="form-row">
                      <FloatLabel variant="on" class="form-field">
                        <InputText v-model="input.id" class="w-full" size="small" />
                        <label>ID</label>
                      </FloatLabel>
                      <FloatLabel variant="on" class="form-field">
                        <InputText v-model="input.name" class="w-full" size="small" />
                        <label>Name</label>
                      </FloatLabel>
                      <FloatLabel variant="on" class="form-field">
                        <Select
                          :modelValue="locApi.isDiscreteInput(input) ? 'discrete' : 'scalar'"
                          @update:modelValue="(val: string) => toggleInputType(inputIndex, val)"
                          :options="[{label: 'Discrete', value: 'discrete'}, {label: 'Scalar', value: 'scalar'}]"
                          optionLabel="label"
                          optionValue="value"
                          class="w-full"
                          size="small"
                          :appendTo="appendTarget"
                        />
                        <label>Type</label>
                      </FloatLabel>
                    </div>
                    <div class="form-row">
                      <InputScientificNumberWidget v-model="input.defaultValue" class="form-field"
                        label="Default value"
                        size="small"
                      />
                      <FloatLabel variant="on" class="form-field">
                        <InputText v-model="input.visible" class="w-full" size="small" />
                        <label>Visible (optional)</label>
                      </FloatLabel>
                    </div>

                    <!-- Scalar model input fields -->

                    <div v-if="locApi.isScalarInput(input)" class="form-row">
                      <InputScientificNumberWidget v-model="input.minimumValue" class="form-field"
                        label="Minimum value"
                        size="small"
                      />
                      <InputScientificNumberWidget v-model="input.maximumValue" class="form-field"
                        label="Maximum value"
                        size="small"
                      />
                      <InputScientificNumberWidget v-model="input.stepValue" class="form-field"
                        label="Step value (optional)"
                        :allowEmpty="true"
                        size="small"
                      />
                    </div>

                    <!-- Discrete model input fields -->

                    <div v-if="locApi.isDiscreteInput(input)" class="sub-list">
                      <div class="sub-list-header">
                        <span class="opencor-section-title opencor-section-title-small">Possible values</span>
                        <Button
                          icon="pi pi-plus"
                          label="Add possible value"
                          text
                          size="small"
                          @click="addPossibleValue(inputIndex)"
                        />
                      </div>
                      <div v-if="!input.possibleValues.length" class="empty-state empty-state-tight">
                        <p>No possible values are configured.</p>
                      </div>
                      <div v-else class="entries-list">
                        <div v-for="(possibleValue, possibleValueIndex) in input.possibleValues" :key="`possible_value_${possibleValueIndex}`" class="entry-row">
                          <span class="item-index">{{ Number(possibleValueIndex) + 1 }}</span>
                          <FloatLabel variant="on" class="flex-1">
                            <InputText v-model="possibleValue.name" class="w-full" size="small" />
                            <label>Name</label>
                          </FloatLabel>
                          <InputScientificNumberWidget v-model="possibleValue.value" class="form-field"
                            label="Value"
                            size="small"
                          />
                          <ToolbarButtonWidget class="remove-button"
                            icon="pi pi-times"
                            small
                            label="Remove possible value"
                            tooltipAlign="end"
                            @click="removePossibleValue(inputIndex, possibleValueIndex)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollPanel>
          </section>

          <!-- Model parameters -->

          <section v-show="activeTab === 'interactive' && activeInteractiveTab === 'modelParameters'" class="settings-section">
            <header class="section-header">
              <div class="min-w-0">
                <h3 class="section-title">Model parameters</h3>
                <p class="section-description">Configure the model parameters using the value of the simulation inputs.</p>
              </div>
              <Button class="shrink-0"
                icon="pi pi-plus"
                label="Add model parameter"
                outlined
                size="small"
                @click="addParameter"
              />
            </header>
            <ScrollPanel class="min-h-0">
              <!-- Empty state -->

              <div v-if="!localSettings.interactive.uiJson.parameters.length" class="empty-state">
                <i class="pi pi-list empty-state-icon"></i>
                <p>No model parameters are configured.</p>
              </div>

              <!-- Model parameter entries -->

              <div v-else class="entries-list">
                <div v-for="(parameter, parameterIndex) in localSettings.interactive.uiJson.parameters" :key="`param_${parameterIndex}`" class="entry-row">
                  <span class="item-index">{{ Number(parameterIndex) + 1 }}</span>
                  <FloatLabel variant="on" class="flex-1">
                    <Select v-model="parameter.name"
                      class="w-full" panelClass="item-filter"
                      size="small"
                      filter filterMode="lenient"
                      :options="editableModelParameters"
                      :appendTo="appendTarget"
                    />
                    <label>Model parameter</label>
                  </FloatLabel>
                  <FloatLabel v-hint.html="parameterValueTooltip()" variant="on" class="flex-1">
                    <InputText v-model="parameter.value" class="w-full" size="small" />
                    <label>Value</label>
                  </FloatLabel>
                  <ToolbarButtonWidget class="remove-button"
                    icon="pi pi-times"
                    small
                    label="Remove model parameter"
                    tooltipAlign="end"
                    @click="removeParameter(parameterIndex)"
                  />
                </div>
              </div>
            </ScrollPanel>
          </section>

          <!-- Simulation data -->

          <section v-show="activeTab === 'interactive' && activeInteractiveTab === 'simulationData'" class="settings-section">
            <header class="section-header">
              <div class="min-w-0">
                <h3 class="section-title">Simulation data</h3>
                <p class="section-description">Configure the simulation data to be made available for plotting.</p>
              </div>
              <Button class="shrink-0"
                icon="pi pi-plus"
                label="Add simulation data"
                outlined
                size="small"
                @click="addSimulationData"
              />
            </header>
            <ScrollPanel class="min-h-0">
              <!-- Empty state -->

              <div v-if="!localSettings.interactive.uiJson.output.data.length" class="empty-state">
                <i class="pi pi-database empty-state-icon"></i>
                <p>No simulation data is configured.</p>
              </div>

              <!-- Simulation data entries -->

              <div v-else class="entries-list">
                <div v-for="(data, dataIndex) in localSettings.interactive.uiJson.output.data" :key="`data_${dataIndex}`" class="entry-row">
                  <span class="item-index">{{ Number(dataIndex) + 1 }}</span>
                  <FloatLabel variant="on" class="flex-1">
                    <InputText v-model="data.id" class="w-full" size="small" />
                    <label>ID</label>
                  </FloatLabel>
                  <FloatLabel variant="on" class="flex-1">
                    <Select v-model="data.name"
                      class="w-full" panelClass="item-filter"
                      size="small"
                      filter filterMode="lenient"
                      :options="allModelParameters"
                      :appendTo="appendTarget"
                    />
                    <label>Model parameter</label>
                  </FloatLabel>
                  <ToolbarButtonWidget class="remove-button"
                    icon="pi pi-times"
                    small
                    label="Remove simulation data"
                    tooltipAlign="end"
                    @click="removeSimulationData(dataIndex)"
                  />
                </div>
              </div>
            </ScrollPanel>
          </section>

          <!-- External data -->

          <section v-show="activeTab === 'interactive' && activeInteractiveTab === 'externalData'" class="settings-section">
            <header class="section-header">
              <div class="min-w-0">
                <h3 class="section-title">External data</h3>
                <p class="section-description">Import and configure the external data to be made available for plotting.</p>
              </div>
            </header>

            <!-- Import bar, which accepts CSV files that are dropped on it -->

            <div class="external-data-import" :class="{ 'external-data-import-active': externalDataFileDragging }"
              @dragover.prevent="onExternalDataFileDragOver"
              @drop.prevent="onExternalDataFileDrop"
              @dragleave="onExternalDataFileDragLeave"
            >
              <input ref="externalDataFileRef" class="hidden"
                type="file" multiple
                accept=".csv,text/csv"
                @change="onExternalDataFileInputChange"
              />
              <i class="pi pi-file-import external-data-import-icon"></i>
              <span class="text-sm text-muted-color whitespace-nowrap">Drop CSV files here or</span>
              <Button class="shrink-0"
                icon="pi pi-folder-open"
                label="Browse..."
                outlined
                size="small"
                @click="importExternalDataFromFile"
              />
              <div class="external-data-import-url">
                <div class="opencor-section-title opencor-section-title-small">or</div>
                <FloatLabel variant="on" class="flex-1 min-w-0">
                  <InputText v-model="externalDataUrl" class="w-full" size="small"
                    @keydown.enter="onExternalDataUrlKeydownEnter"
                  />
                  <label>URL of a CSV file</label>
                </FloatLabel>
                <Button class="shrink-0"
                  icon="pi pi-link"
                  label="Import"
                  outlined
                  size="small"
                  :disabled="!isExternalDataUrlValid"
                  @click="importExternalDataFromUrl"
                />
              </div>
            </div>
            <ScrollPanel class="min-h-0">
              <div class="items-list">
                <!-- Empty state -->

                <div v-if="!(localSettings.interactive.uiJson.output.externalData ?? []).length" class="empty-state">
                  <i class="pi pi-download empty-state-icon"></i>
                  <p>No external data is configured.</p>
                </div>

                <!-- External data files -->

                <div v-for="(externalDataFile, externalDataFileIndex) in (localSettings.interactive.uiJson.output.externalData ?? [])" :key="`external_data_file_${externalDataFileIndex}`" class="card-item">
                  <div class="card-header">
                    <div class="card-title">
                      <span class="item-index">{{ Number(externalDataFileIndex) + 1 }}</span>
                      <span class="font-medium truncate">{{ externalDataDescription(externalDataFile, externalDataFileIndex) }}</span>
                      <Tag :value="`${externalDataSeries(externalDataFile).length} external data series`" severity="secondary" />
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <Button
                        icon="pi pi-plus"
                        label="Add external data"
                        text
                        size="small"
                        @click="addExternalData(externalDataFileIndex)"
                      />
                      <ToolbarButtonWidget class="remove-button"
                        icon="pi pi-trash"
                        small
                        label="Remove external data file"
                        tooltipAlign="end"
                        @click="removeExternalDataFile(externalDataFileIndex)"
                      />
                    </div>
                  </div>
                  <div class="card-body">
                    <!-- Description and VOI expression -->

                    <div class="form-row">
                      <FloatLabel v-hint.html="externalDataDescriptionTooltip()" variant="on" class="flex-1">
                        <InputText v-model="externalDataFile.description" class="w-full" size="small" />
                        <label>Description (optional)</label>
                      </FloatLabel>
                      <FloatLabel v-hint.html="externalDataVoiExpressionTooltip()" variant="on" class="flex-1">
                        <InputText v-model="externalDataFile.voiExpression" class="w-full" size="small" />
                        <label>VOI expression (optional)</label>
                      </FloatLabel>
                    </div>

                    <!-- External data entries -->

                    <div v-if="!externalDataEntries(externalDataFile).length" class="empty-state empty-state-tight">
                      <p>No external data is configured for this CSV file.</p>
                    </div>
                    <div v-else class="entries-list">
                      <div v-for="(externalData, externalDataIndex) in externalDataEntries(externalDataFile)" :key="`external_data_${externalDataFileIndex}_${externalDataIndex}`" class="entry-row">
                        <span class="item-index">{{ Number(externalDataIndex) + 1 }}</span>
                        <FloatLabel variant="on" class="flex-1">
                          <InputText v-model="externalData.id" class="w-full" size="small" />
                          <label>ID</label>
                        </FloatLabel>
                        <FloatLabel variant="on" class="flex-1">
                          <Select v-model="externalData.name"
                            class="w-full" panelClass="item-filter"
                            size="small"
                            filter filterMode="lenient"
                            :options="externalDataSeries(externalDataFile)"
                            :appendTo="appendTarget"
                          />
                          <label>External data</label>
                        </FloatLabel>
                        <ToolbarButtonWidget class="remove-button"
                          icon="pi pi-times"
                          small
                          label="Remove external data"
                          tooltipAlign="end"
                          @click="removeExternalData(externalDataFileIndex, externalDataIndex)"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollPanel>
          </section>

          <!-- Plots -->

          <section v-show="activeTab === 'interactive' && activeInteractiveTab === 'plots'" class="settings-section">
            <header class="section-header">
              <div class="min-w-0">
                <h3 class="section-title">Plots</h3>
                <p class="section-description">Configure the plots and the corresponding traces using the available simulation data.</p>
              </div>
              <Button class="shrink-0"
                icon="pi pi-plus"
                label="Add plot"
                outlined
                size="small"
                @click="addPlot"
              />
            </header>
            <ScrollPanel class="min-h-0">
              <div class="items-list">
                <!-- Empty state -->

                <div v-if="!localSettings.interactive.uiJson.output.plots.length" class="empty-state">
                  <i class="pi pi-chart-line empty-state-icon"></i>
                  <p>No plots are configured.</p>
                </div>

                <!-- Plot cards -->

                <div v-for="(plot, plotIndex) in localSettings.interactive.uiJson.output.plots" :key="`plot_${plotIndex}`" class="card-item">
                  <div class="card-header">
                    <div class="card-title">
                      <span class="item-index">{{ Number(plotIndex) + 1 }}</span>
                      <span class="font-medium">Plot #{{ Number(plotIndex) + 1 }}</span>
                      <Tag :value="plotTraceCount(plot) + ' trace' + (plotTraceCount(plot) !== 1 ? 's' : '')" severity="secondary" />
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <Button
                        icon="pi pi-plus"
                        label="Add trace"
                        text
                        size="small"
                        @click="addTrace(plotIndex)"
                      />
                      <ToolbarButtonWidget class="remove-button"
                        icon="pi pi-trash"
                        small
                        label="Remove plot"
                        tooltipAlign="end"
                        @click="removePlot(plotIndex)"
                      />
                    </div>
                  </div>
                  <div class="card-body">
                    <!-- Axes settings -->

                    <div class="form-row">
                      <FloatLabel variant="on" class="flex-1">
                        <InputText v-model="plot.xAxisTitle" class="w-full" size="small" />
                        <label>X axis title (optional)</label>
                      </FloatLabel>
                      <FloatLabel variant="on" class="flex-1">
                        <InputText v-model="plot.yAxisTitle" class="w-full" size="small" />
                        <label>Y axis title (optional)</label>
                      </FloatLabel>
                    </div>

                    <!-- Traces, i.e. the plot's main trace followed by its additional traces -->

                    <div class="sub-list">
                      <span class="opencor-section-title opencor-section-title-small">Traces</span>
                      <div v-for="(trace, traceIndex) in plotTraces(plot)" :key="`trace_${plotIndex}_${traceIndex}`" class="trace-item">
                        <div class="trace-header">
                          <span class="item-index">{{ Number(traceIndex) + 1 }}</span>
                          <span class="trace-name truncate" v-html="traceName(plot, traceIndex - 1)" />
                          <ToolbarButtonWidget class="remove-button ml-auto"
                            icon="pi pi-times"
                            small
                            label="Remove trace"
                            tooltipAlign="end"
                            @click="removeTrace(plotIndex, traceIndex - 1)"
                          />
                        </div>
                        <div class="form-row">
                          <FloatLabel v-hint.html="traceNameTooltip()" variant="on" class="flex-1">
                            <InputText v-model="trace.name" class="w-full" size="small" />
                            <label>Name (optional)</label>
                          </FloatLabel>
                          <FloatLabel v-hint.html="xyValueTooltip(true)" variant="on" class="flex-1">
                            <InputText v-model="trace.xValue" class="w-full" size="small" />
                            <label>X value</label>
                          </FloatLabel>
                          <FloatLabel v-hint.html="xyValueTooltip(false)" variant="on" class="flex-1">
                            <InputText v-model="trace.yValue" class="w-full" size="small" />
                            <label>Y value</label>
                          </FloatLabel>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollPanel>
          </section>
        </div>
      </div>

      <!--
      Footer, i.e. the validation status of the active section's settings (or of our interactive settings as a whole)
      and our OK/Cancel buttons.
      -->

      <template #footer>
        <div class="w-full flex items-center gap-4">
          <Popover ref="issuesPopoverRef" :appendTo="appendTarget"
            @show="issuesPopoverVisible = true"
            @hide="issuesPopoverVisible = false"
          >
            <div class="issues-popover-content">
              <IssuesView :issues="activeIssues" :extraSpace="false" />
            </div>
          </Popover>
          <div class="flex-1 min-w-0 flex items-center">
            <span v-if="!activeIssues.length" class="status-valid">
              <i class="pi pi-check-circle"></i>
              <span>{{ activeSettingsLabel }} settings are valid</span>
            </span>
            <Button v-else outlined severity="warn" size="small"
              @click="toggleIssues"
            >
              <i class="pi pi-exclamation-triangle mr-2"></i>
              <span>{{ activeIssues.length }} issue{{ activeIssues.length !== 1 ? 's' : '' }}</span>
              <i :class="issuesPopoverVisible ? 'pi pi-arrow-down-left-and-arrow-up-right-to-center ml-2 text-xs!' : 'pi pi-arrow-up-right-and-arrow-down-left-from-center ml-2 text-xs!'"></i>
            </Button>
          </div>
          <div class="flex gap-2">
            <Button autofocus label="OK" @click="onOk" />
            <Button label="Cancel" severity="secondary" @click="onCancel" />
          </div>
        </div>
      </template>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import Popover from 'primevue/popover';
import * as vue from 'vue';

import * as common from '../../common/common';
import { TOAST_LIFE } from '../../common/constants';
import * as externalData from '../../common/externalData';
import { vHint } from '../../common/hint';
import * as vueCommon from '../../common/vueCommon';
import * as locApi from '../../libopencor/locApi';
import * as locUiJsonApi from '../../libopencor/locUiJsonApi';
import { validateUiJson } from '../../libopencor/locUiJsonApi';
import { EIssueType } from '../../libopencor/locLoggerApi';

import { useOpenCORToast } from '../OpenCORToast';

export interface ISimulationExperimentInteractiveViewSettingsDialog {
  simulation: {
    initialPoint: number;
    startingPoint: number;
    endingPoint: number;
    pointInterval: number;
  };
  solvers: {
    cvodeMaximumStep: number;
  };
  interactive: {
    uiJson: locUiJsonApi.IUiJson;
  };
}

const props = defineProps<{
  settings: ISimulationExperimentInteractiveViewSettingsDialog;
  voiId: string;
  voiName: string;
  voiUnit: string;
  allModelParameters: string[];
  editableModelParameters: string[];
  centreOn?: HTMLElement | null;
}>();

const emit = defineEmits<{
  close: [];
  ok: [settings: ISimulationExperimentInteractiveViewSettingsDialog];
}>();

const DEFAULT_TAB = 'interactive';
const DEFAULT_INTERACTIVE_TAB = 'simulationInputs';

function deepCloneSettings(
  settings: ISimulationExperimentInteractiveViewSettingsDialog
): ISimulationExperimentInteractiveViewSettingsDialog {
  // Perform a deep clone of our settings.
  // Note: our external data values (i.e. Float64Arrays) are shared rather than copied (see cloneUiJson()), which is
  //       fine since we never modify them in place.

  const deepClonedSettings = locApi.cloneUiJson(settings);

  // Make sure that our UI JSON has the expected structure.

  const uiJson = deepClonedSettings.interactive.uiJson;

  if (!uiJson.output.externalData) {
    uiJson.output.externalData = [];
  }

  // Normalise the UI JSON so that any typed arrays (e.g., Float64Array) are correctly restored.

  locApi.normaliseUiJson(uiJson);

  return deepClonedSettings;
}

const addToast = useOpenCORToast();
const localSettings = vue.ref<ISimulationExperimentInteractiveViewSettingsDialog>(deepCloneSettings(props.settings));
// Note: we need to do a deep copy here to make sure that any changes made to nested objects in our local settings are
//       not reflected in the original settings while preserving any typed arrays in the UI JSON.

vue.watch(
  () => props.settings,
  (newSettings) => {
    localSettings.value = deepCloneSettings(newSettings);
  },
  { deep: true }
);

const issuesPopoverRef = vue.ref<InstanceType<typeof Popover> | null>(null);
const rootRef = vue.shallowRef<HTMLElement | null>(null);
const appendTarget = vueCommon.useAppendTarget(rootRef as unknown as vue.Ref<HTMLElement | null>);
const activeTab = vue.ref(DEFAULT_TAB);
const activeInteractiveTab = vue.ref(DEFAULT_INTERACTIVE_TAB);
const issuesPopoverVisible = vue.ref(false);
const externalDataFileRef = vue.shallowRef<HTMLInputElement | null>(null);
const externalDataFileDragging = vue.ref(false);
const externalDataUrl = vue.ref('');

const isExternalDataUrlValid = vue.computed<boolean>(() => {
  const url = externalDataUrl.value.trim();

  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);

    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
});

const externalDataSeries = (externalData: locApi.IUiJsonOutputExternalData): string[] => {
  return externalData.dataSeries.map((dataSerie) => {
    return dataSerie.name;
  });
};

const externalDataEntries = (externalData: locApi.IUiJsonOutputExternalData): locApi.IUiJsonOutputData[] => {
  return externalData.data;
};

const externalDataCount = vue.computed<number>(() => {
  return (
    localSettings.value.interactive.uiJson.output.externalData?.reduce((res, externalData) => {
      return res + externalData.data.length;
    }, 0) || 0
  );
});
const numberOfDataPoints = vue.computed<string>(() => {
  // Our total number of data points.
  // Note: only calculate when simulation settings are valid.

  if (simulationSettingsIssues.value.length > 0) {
    return '';
  }

  const { startingPoint, endingPoint, pointInterval } = localSettings.value.simulation;
  const points = Math.max(1, Math.round((endingPoint - startingPoint) / pointInterval)) + 1;
  const res = points.toLocaleString();

  if (!common.isDivisible(endingPoint - startingPoint, pointInterval)) {
    return `~${res}`;
  }

  return res;
});
const simulationSettingsIssues = vue.computed<locApi.IIssue[]>(() => {
  // Validate our simulation settings and return any issues.

  const res: locApi.IIssue[] = [];

  if (localSettings.value.simulation.initialPoint == null) {
    res.push({
      type: EIssueType.WARNING,
      description: 'The initial point must be specified.'
    });
  }

  if (localSettings.value.simulation.startingPoint == null) {
    res.push({
      type: EIssueType.WARNING,
      description: 'The starting point must be specified.'
    });
  }

  if (localSettings.value.simulation.endingPoint == null) {
    res.push({
      type: EIssueType.WARNING,
      description: 'The ending point must be specified.'
    });
  }

  if (
    localSettings.value.simulation.initialPoint !== null &&
    localSettings.value.simulation.startingPoint !== null &&
    localSettings.value.simulation.startingPoint < localSettings.value.simulation.initialPoint
  ) {
    res.push({
      type: EIssueType.WARNING,
      description: 'The starting point must be greater or equal to the initial point.'
    });
  }

  if (
    localSettings.value.simulation.startingPoint !== null &&
    localSettings.value.simulation.endingPoint !== null &&
    localSettings.value.simulation.endingPoint <= localSettings.value.simulation.startingPoint
  ) {
    res.push({
      type: EIssueType.WARNING,
      description: 'The ending point must be greater than the starting point.'
    });
  }

  if (localSettings.value.simulation.pointInterval == null) {
    res.push({
      type: EIssueType.WARNING,
      description: 'The point interval must be specified.'
    });
  }

  // Note: a point interval that cannot be saved as a number of steps (e.g., if it is too small) gets saved as zero
  //       steps (see onSettingsOk() in SimulationExperimentInteractiveView.vue), which gives an infinite (or NaN) point
  //       interval when reopened.

  if (
    localSettings.value.simulation.pointInterval !== null &&
    !Number.isFinite(localSettings.value.simulation.pointInterval)
  ) {
    res.push({
      type: EIssueType.WARNING,
      description: 'The point interval must be a finite number.'
    });
  }

  if (localSettings.value.simulation.pointInterval !== null && localSettings.value.simulation.pointInterval <= 0) {
    res.push({
      type: EIssueType.WARNING,
      description: 'The point interval must be a positive number.'
    });
  }

  // Make sure that our number of steps can be handled by libOpenCOR, i.e. that our point interval is not too small.
  // Note: we only check this if our other simulation settings are valid.

  if (res.length === 0) {
    const { startingPoint, endingPoint, pointInterval } = localSettings.value.simulation;

    if (!(Math.round((endingPoint - startingPoint) / pointInterval) <= locApi.MAXIMUM_NUMBER_OF_STEPS)) {
      res.push({
        type: EIssueType.WARNING,
        description: `The point interval is too small (the number of steps must not exceed ${locApi.MAXIMUM_NUMBER_OF_STEPS.toLocaleString()}).`
      });
    }
  }

  return res;
});
const solversSettingsIssues = vue.computed<locApi.IIssue[]>(() => {
  // Validate our solvers settings and return any issues.

  const res: locApi.IIssue[] = [];

  if (localSettings.value.solvers.cvodeMaximumStep === null) {
    res.push({
      type: EIssueType.WARNING,
      description: "CVODE's maximum step must be specified."
    });
  }

  if (localSettings.value.solvers.cvodeMaximumStep !== null && localSettings.value.solvers.cvodeMaximumStep < 0) {
    res.push({
      type: EIssueType.WARNING,
      description: "CVODE's maximum step must be a non-negative number."
    });
  }

  return res;
});
const uiJsonIssues = vue.computed<locApi.IIssue[]>(() => {
  // Validate our local UI JSON and return any issues.

  return validateUiJson(localSettings.value.interactive.uiJson, {
    allModelParameters: props.allModelParameters,
    editableModelParameters: props.editableModelParameters
  });
});

// The issues of the active section, i.e. of our simulation, solvers, or interactive settings, along with a label for
// them.

const activeIssues = vue.computed<locApi.IIssue[]>(() => {
  if (activeTab.value === 'simulation') {
    return simulationSettingsIssues.value;
  }

  if (activeTab.value === 'solvers') {
    return solversSettingsIssues.value;
  }

  return uiJsonIssues.value;
});

const activeSettingsLabel = vue.computed<string>(() => {
  return activeTab.value === 'simulation' ? 'Simulation' : activeTab.value === 'solvers' ? 'Solvers' : 'Interactive';
});

// Hide the issues popover if there are no longer any issues to show (since its toggle button is then hidden).

vue.watch(
  () => activeIssues.value.length,
  (activeIssuesCount) => {
    if (!activeIssuesCount) {
      issuesPopoverRef.value?.hide();
    }
  }
);

// Our navigation, which groups our sections and lets people know about the number of items in a section and whether a
// section (or group of sections) has issues.
// Note: our interactive settings are validated as a whole, so we can only let people know that the group of interactive
//       sections has issues, not which section(s) in particular.

interface INavItem {
  tab: string;
  interactiveTab?: string;
  label: string;
  icon: string;
  count?: number;
  hasIssues?: boolean;
}

interface INavGroup {
  label: string;
  hasIssues: boolean;
  items: INavItem[];
}

const navGroups = vue.computed<INavGroup[]>(() => {
  const uiJson = localSettings.value.interactive.uiJson;

  return [
    {
      label: 'General',
      hasIssues: false,
      items: [
        {
          tab: 'simulation',
          label: 'Simulation',
          icon: 'pi pi-clock',
          hasIssues: simulationSettingsIssues.value.length > 0
        },
        {
          tab: 'solvers',
          label: 'Solvers',
          icon: 'pi pi-calculator',
          hasIssues: solversSettingsIssues.value.length > 0
        }
      ]
    },
    {
      label: 'Interactive',
      hasIssues: uiJsonIssues.value.length > 0,
      items: [
        {
          tab: 'interactive',
          interactiveTab: 'simulationInputs',
          label: 'Simulation inputs',
          icon: 'pi pi-sign-in',
          count: uiJson.input.length
        },
        {
          tab: 'interactive',
          interactiveTab: 'modelParameters',
          label: 'Model parameters',
          icon: 'pi pi-list',
          count: uiJson.parameters.length
        },
        {
          tab: 'interactive',
          interactiveTab: 'simulationData',
          label: 'Simulation data',
          icon: 'pi pi-database',
          count: uiJson.output.data.length
        },
        {
          tab: 'interactive',
          interactiveTab: 'externalData',
          label: 'External data',
          icon: 'pi pi-download',
          count: externalDataCount.value
        },
        {
          tab: 'interactive',
          interactiveTab: 'plots',
          label: 'Plots',
          icon: 'pi pi-chart-line',
          count: uiJson.output.plots.length
        }
      ]
    }
  ];
});

const isActiveSection = (navItem: INavItem): boolean => {
  return (
    navItem.tab === activeTab.value &&
    (navItem.interactiveTab === undefined || navItem.interactiveTab === activeInteractiveTab.value)
  );
};

const selectSection = (navItem: INavItem): void => {
  // Hide the issues popover since it may be about the issues of another section.

  issuesPopoverRef.value?.hide();

  activeTab.value = navItem.tab;

  if (navItem.interactiveTab !== undefined) {
    activeInteractiveTab.value = navItem.interactiveTab;
  }
};

const plotTraceCount = (plot: locApi.IUiJsonOutputPlot): number => {
  return 1 + (plot.additionalTraces?.length ?? 0);
};

const plotTraces = (plot: locApi.IUiJsonOutputPlot): locApi.IUiJsonOutputPlotAdditionalTrace[] => {
  // The traces of a plot, i.e. its main trace (i.e. the plot itself) followed by its additional traces, if any.

  return [plot, ...(plot.additionalTraces ?? [])];
};

const externalDataDescriptionTooltip = (): string => {
  return `
    You can provide a description for the external data or leave it empty to have a description generated automatically as follows: <strong>External data #&lt;N&gt;</strong>.<br />
    <br />
    If you provide a description, you can use HTML tags for formatting (e.g., <code>&lt;em&gt;My external data&lt;/em&gt;</code> will render as <em>My external data</em>).
  `;
};

const externalDataVoiExpressionTooltip = (): string => {
  return `
    You can provide the value of the VOI expression using an algebraic expression that includes <code>voi</code> or leave it empty in which case the VOI values from the CSV file will be used directly without any transformation.<br />
    <br />
    For example, to convert the VOI to a different unit, you can use an expression like <code>1000 * voi</code>.
  `;
};

const traceNameTooltip = (): string => {
  return `
    You can provide a name for the trace or leave it empty to have a name generated automatically as follows: <strong>&lt;Y value&gt; <i>vs.</i> &lt;X value&gt;</strong>.<br />
    <br />
    If you provide a name, you can use HTML tags for formatting (e.g., <code>&lt;em&gt;I&lt;sub&gt;Na&lt;/sub&gt;&lt;/em&gt;</code> will render as <em>I<sub>Na</sub></em>).
  `;
};

const xyParameterValueTooltip = (value: string, idType: string, idPrefix: string): string => {
  return `
    You can provide the value of the ${value} using an algebraic expression that includes ${idType} IDs.<br />
    <br />
    For example, to set the ${value} to be the ${idType} with ID <code>${idPrefix}_1</code>, use <code>${idPrefix}_1</code>.<br />
    <br />
    You can also use mathematical functions and operators in the expression (e.g., <code>2 * ${idPrefix}_1 + sin(${idPrefix}_2)</code>).
  `;
};

const xyValueTooltip = (xAxis: boolean): string => {
  return xyParameterValueTooltip(`${xAxis ? 'X' : 'Y'} axis`, 'simulation or external data', 'data');
};

const parameterValueTooltip = (): string => {
  return xyParameterValueTooltip('model parameter', 'model input', 'model_input');
};

const traceName = (plot: locApi.IUiJsonOutputPlot, traceIndex: number): string => {
  const actualTraceName = (
    name: string | undefined,
    xValue: string | undefined,
    yValue: string | undefined
  ): string => {
    return name || (xValue && yValue ? `${yValue} <i>vs.</i> ${xValue}` : '???');
  };

  if (traceIndex === -1) {
    return actualTraceName(plot.name, plot.xValue, plot.yValue);
  }

  const additionalTrace = plot.additionalTraces?.[traceIndex];

  return actualTraceName(additionalTrace?.name, additionalTrace?.xValue, additionalTrace?.yValue);
};

const addInput = () => {
  localSettings.value.interactive.uiJson.input.push({
    id: `model_input_${localSettings.value.interactive.uiJson.input.length + 1}`,
    name: `Model input #${localSettings.value.interactive.uiJson.input.length + 1}`,
    defaultValue: 0,
    minimumValue: 0,
    maximumValue: 10
  });
};

const removeInput = (index: number) => {
  localSettings.value.interactive.uiJson.input.splice(index, 1);
};

// Change the type of the given simulation input, which means recreating it (with some default values).
// Note: a select lets us know about the selected value even if it was already selected, in which case there is nothing
//       to do (otherwise, we would, for instance, lose the possible values of a discrete simulation input).

const toggleInputType = (index: number, type: string) => {
  const input = localSettings.value.interactive.uiJson.input[index];

  if (!input || (type === 'discrete') === locApi.isDiscreteInput(input)) {
    return;
  }

  const baseInput = {
    name: input.name,
    defaultValue: 0,
    id: input.id,
    visible: input.visible
  };

  if (type === 'discrete') {
    localSettings.value.interactive.uiJson.input[index] = {
      ...baseInput,
      possibleValues: [
        { name: 'Name 1', value: 0 },
        { name: 'Name 2', value: 1 }
      ]
    };
  } else {
    localSettings.value.interactive.uiJson.input[index] = {
      ...baseInput,
      minimumValue: 0,
      maximumValue: 10
    };
  }
};

const addPossibleValue = (inputIndex: number) => {
  const input = localSettings.value.interactive.uiJson.input[inputIndex];

  if (input && locApi.isDiscreteInput(input)) {
    const maxValue = Math.max(...input.possibleValues.map((possibleValue) => possibleValue.value), -1);

    input.possibleValues.push({
      name: `Option ${input.possibleValues.length + 1}`,
      value: maxValue + 1
    });
  }
};

const removePossibleValue = (inputIndex: number, possibleValueIndex: number) => {
  const input = localSettings.value.interactive.uiJson.input[inputIndex];

  if (input && locApi.isDiscreteInput(input)) {
    input.possibleValues.splice(possibleValueIndex, 1);
  }
};

const addSimulationData = () => {
  localSettings.value.interactive.uiJson.output.data.push({
    id: `simulation_data`,
    name: 'component/variable'
  });
};

const externalDataDescription = (externalData: locApi.IUiJsonOutputExternalData, externalDataIndex: number): string => {
  return externalData.description?.trim() || `External data #${externalDataIndex + 1}`;
};

const sourceDescription = (source: string): string => {
  const withoutQuery = source.split(/[?#]/)[0] ?? source;
  const parts = withoutQuery.split('/').filter(Boolean);
  const candidate = parts.at(-1) ?? source;

  try {
    return decodeURIComponent(candidate);
  } catch {
    return candidate;
  }
};

const createExternalDataFromCsv = (source: string, externalCsvData: externalData.IExternalCsvData): void => {
  const dataSeries: locApi.IUiJsonOutputExternalDataSeries[] = [];

  for (let columnIndex = 1; columnIndex < externalCsvData.headers.length; ++columnIndex) {
    const header = externalCsvData.headers[columnIndex];
    const values = externalCsvData.columns[columnIndex];

    if (!header || !values) {
      continue;
    }

    dataSeries.push({
      name: header,
      values: new Float64Array(values)
    });
  }

  localSettings.value.interactive.uiJson.output.externalData?.push({
    data: [],
    dataSeries,
    description: sourceDescription(source),
    voiExpression: 'voi',
    voiValues: new Float64Array(externalCsvData.columns[0])
  });
};

const importExternalDataFromFiles = async (files: File[]): Promise<void> => {
  if (!files.length) {
    return;
  }

  try {
    for (const file of files) {
      createExternalDataFromCsv(file.name, externalData.parseExternalCsvData(await file.text()));
    }
  } catch (error: unknown) {
    addToast({
      severity: 'error',
      summary: 'External data',
      detail: common.formatMessage(common.formatError(error)),
      life: TOAST_LIFE
    });
  }
};

const importExternalDataFromFile = (): void => {
  externalDataFileRef.value?.click();
};

const onExternalDataFileInputChange = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement;

  await importExternalDataFromFiles(input.files ? Array.from(input.files) : []);

  input.value = '';
};

const onExternalDataFileDragOver = (): void => {
  externalDataFileDragging.value = true;
};

const onExternalDataFileDrop = async (event: DragEvent): Promise<void> => {
  externalDataFileDragging.value = false;

  await importExternalDataFromFiles(event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : []);
};

const onExternalDataFileDragLeave = (): void => {
  externalDataFileDragging.value = false;
};

// Import some external data from our URL when Enter is pressed (rather than accept our settings, see onKeydownEnter()),
// unless it is to confirm some text being composed using an input method (see common.isImeKeyDown()).

const onExternalDataUrlKeydownEnter = (event: KeyboardEvent): void => {
  if (common.isImeKeyDown(event)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (isExternalDataUrlValid.value) {
    void importExternalDataFromUrl();
  }
};

// Import some external data from our URL.
// Note: we may be asked to import some external data from our URL while we are already doing so (e.g., if Enter is
//       pressed twice in a row, kept pressed, or if our Import button is double clicked), in which case we ignore the
//       request since we would otherwise import the same external data several times.

let importingExternalDataFromUrl = false;

const importExternalDataFromUrl = async (): Promise<void> => {
  if (importingExternalDataFromUrl) {
    return;
  }

  importingExternalDataFromUrl = true;

  const url = externalDataUrl.value.trim();

  try {
    const response = await common.fetchThroughCorsProxy(url);

    if (!response.ok) {
      throw new Error(`Could not retrieve CSV file from URL (${response.status}: ${response.statusText}).`);
    }

    createExternalDataFromCsv(url, externalData.parseExternalCsvData(await response.text()));

    externalDataUrl.value = '';
  } catch (error: unknown) {
    addToast({
      severity: 'error',
      summary: 'External data',
      detail: common.formatMessage(common.formatError(error)),
      life: TOAST_LIFE
    });
  } finally {
    importingExternalDataFromUrl = false;
  }
};

const addExternalData = (externalDataIndex: number): void => {
  const externalData = localSettings.value.interactive.uiJson.output.externalData?.[externalDataIndex];

  if (!externalData) {
    return;
  }

  const firstOption = externalDataSeries(externalData)[0];

  if (!firstOption) {
    return;
  }

  externalData.data.push({
    id: '',
    name: firstOption
  });
};

const removeExternalData = (externalDataIndex: number, idIndex: number): void => {
  const externalData = localSettings.value.interactive.uiJson.output.externalData?.[externalDataIndex];

  if (!externalData) {
    return;
  }

  if (!externalDataEntries(externalData)[idIndex]) {
    return;
  }

  externalData.data.splice(idIndex, 1);
};

const removeExternalDataFile = (externalDataIndex: number): void => {
  const externalData = localSettings.value.interactive.uiJson.output.externalData;

  if (!externalData?.[externalDataIndex]) {
    return;
  }

  externalData.splice(externalDataIndex, 1);
};

const removeSimulationData = (index: number) => {
  localSettings.value.interactive.uiJson.output.data.splice(index, 1);
};

const addPlot = () => {
  if (localSettings.value.interactive.uiJson.output.plots.length < 9) {
    localSettings.value.interactive.uiJson.output.plots.push({
      name: '',
      xAxisTitle: '',
      xValue: props.voiId,
      yAxisTitle: '',
      yValue: 'y_id',
      additionalTraces: []
    });
  }
};

const removePlot = (index: number) => {
  localSettings.value.interactive.uiJson.output.plots.splice(index, 1);
};

const addTrace = (plotIndex: number) => {
  const plot = localSettings.value.interactive.uiJson.output.plots[plotIndex];

  if (plot) {
    if (!plot.additionalTraces) {
      plot.additionalTraces = [];
    }

    plot.additionalTraces.push({
      xValue: props.voiId,
      yValue: 'y_id'
    });
  }
};

const removeTrace = (plotIndex: number, traceIndex: number) => {
  const plot = localSettings.value.interactive.uiJson.output.plots[plotIndex];

  if (!plot) {
    return;
  }

  if (traceIndex === -1) {
    // Update the main trace to be the first additional trace and shift it out of the additional traces. If there are no
    // additional traces, just clear the main trace.

    if (plot.additionalTraces && plot.additionalTraces.length > 0) {
      const firstAdditionalTrace = plot.additionalTraces.shift() as locApi.IUiJsonOutputPlot;

      plot.name = firstAdditionalTrace.name || undefined;
      plot.xValue = firstAdditionalTrace.xValue;
      plot.yValue = firstAdditionalTrace.yValue;
    } else {
      plot.name = undefined;
      plot.xValue = props.voiId;
      plot.yValue = 'y_id';
    }

    return;
  }

  if (traceIndex >= 0 && plot.additionalTraces && plot.additionalTraces.length > 0) {
    plot.additionalTraces.splice(traceIndex, 1);
  }
};

const addParameter = () => {
  localSettings.value.interactive.uiJson.parameters.push({
    name: 'component/variable',
    value: 'input_id'
  });
};

const removeParameter = (index: number) => {
  localSettings.value.interactive.uiJson.parameters.splice(index, 1);
};

const resetUxSettings = () => {
  activeTab.value = DEFAULT_TAB;
  activeInteractiveTab.value = DEFAULT_INTERACTIVE_TAB;

  issuesPopoverRef.value?.hide();
};

// Accept our settings when the user presses Enter in a text field (as in a native form), but not when, say, a button or
// a select has the keyboard focus since Enter is then for it (e.g., to click a button, such as our Cancel button, or to
// open a select), nor when Enter is used to confirm some text that is being composed (e.g., using an input method, see
// common.isImeKeyDown()).

const TEXT_FIELDS =
  'input:not([type="button"], [type="checkbox"], [type="color"], [type="file"], [type="radio"], [type="range"], [type="reset"], [type="submit"])';

const onKeydownEnter = (event: KeyboardEvent): void => {
  if (
    event.defaultPrevented ||
    common.isImeKeyDown(event) ||
    !(event.target instanceof HTMLInputElement) ||
    !event.target.matches(TEXT_FIELDS) ||
    event.target.closest('.p-select, .p-autocomplete')
  ) {
    return;
  }

  event.preventDefault();

  onOk();
};

const onOk = () => {
  // Reset our UX settings.

  resetUxSettings();

  // Emit our updated settings and close the dialog.

  emit('ok', {
    simulation: {
      initialPoint: localSettings.value.simulation.initialPoint,
      startingPoint: localSettings.value.simulation.startingPoint,
      endingPoint: localSettings.value.simulation.endingPoint,
      pointInterval: localSettings.value.simulation.pointInterval
    },
    solvers: {
      cvodeMaximumStep: localSettings.value.solvers.cvodeMaximumStep
    },
    interactive: {
      uiJson: localSettings.value.interactive.uiJson
    }
  });
};

const onCancel = () => {
  // Reset our local settings to the original settings and close the dialog.
  // Note: we need to do a deep copy here to make sure that any changes made to nested objects in our local settings are
  //       not reflected in the original settings while preserving any typed arrays in the UI JSON.

  localSettings.value = deepCloneSettings(props.settings);

  // Reset our UX settings.

  resetUxSettings();

  // Close the dialog.

  emit('close');
};

const toggleIssues = (event: Event) => {
  // Note: whether our issues popover is visible is tracked using its show and hide events, so that it is also correct
  //       when the popover gets hidden by clicking outside of it.

  issuesPopoverRef.value?.toggle(event);
};
</script>

<style scoped>
.settings-body {
  gap: 1.25rem;
}

/**
 * Navigation.
 */

.settings-nav {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 1rem;
  width: 14.5rem;
  padding-right: 1rem;
  border-right: 1px solid var(--p-content-border-color);
  overflow-y: auto;
}

.settings-nav-group {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.settings-nav-group-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0 0.625rem 0.25rem;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.4375rem 0.625rem;
  border: none;
  border-radius: 0.375rem;
  background-color: transparent;
  color: var(--p-text-color);
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.settings-nav-item:hover {
  background-color: var(--p-content-hover-background);
}

/**
 * Note: our focus ring is drawn inside a nav item since our nav element can be scrolled, meaning that it would
 *       otherwise get clipped by our nav element.
 */

.settings-nav-item:focus-visible {
  box-shadow: inset 0 0 0 2px var(--p-primary-color);
}

.settings-nav-item-active,
.settings-nav-item-active:hover {
  background-color: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
  color: var(--p-primary-color);
  font-weight: 500;
}

.settings-nav-item-icon {
  width: 1rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  text-align: center;
}

.settings-nav-item-active .settings-nav-item-icon {
  color: var(--p-primary-color);
}

.settings-nav-count {
  min-width: 1.25rem;
  padding: 0 0.375rem;
  border-radius: 9999px;
  background-color: color-mix(in srgb, var(--p-text-color) 8%, transparent);
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  line-height: 1.25rem;
  text-align: center;
}

.settings-nav-item-active .settings-nav-count {
  background-color: color-mix(in srgb, var(--p-primary-color) 18%, transparent);
  color: var(--p-primary-color);
}

.settings-nav-issues {
  color: var(--opencor-warn-color);
  font-size: 0.75rem;
}

/**
 * Sections.
 */

.settings-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.settings-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.section-title {
  margin: 0;
  color: var(--p-text-color);
  font-size: 1rem;
  font-weight: 600;
}

.section-description {
  margin: 0.25rem 0 0;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

/**
 * Forms.
 */

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 0.5rem;
}

.form-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.form-field {
  display: flex !important;
  flex: 1;
  min-width: 0;
}

/**
 * Hint, which is vertically centred next to the field it is about, and whose icon is aligned with its first line (in
 * case it spans several lines).
 */

.form-hint {
  display: flex;
  align-self: center;
  align-items: flex-start;
  gap: 0.5rem;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  line-height: 1.25rem;
}

.form-hint .pi {
  line-height: inherit;
}

/**
 * Lists, cards, and entries.
 */

.items-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.card-item {
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.5rem;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.375rem 0.5rem 0.375rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
  background-color: color-mix(in srgb, var(--p-text-color) 3%, transparent);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  font-size: 0.875rem;
}

.card-title .p-tag {
  flex-shrink: 0;
  padding: 0.0625rem 0.375rem;
  font-size: 0.6875rem;
  font-weight: 500;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding: 1rem 0.75rem 0.75rem;
}

.entries-list {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding-top: 0.5rem;
}

.entry-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.item-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 1.375rem;
  height: 1.375rem;
  padding: 0 0.25rem;
  border-radius: 0.375rem;
  background-color: color-mix(in srgb, var(--p-text-color) 8%, transparent);
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

/**
 * Note: our remove buttons are toolbar buttons (see ToolbarButtonWidget.vue) that turn red when hovered. They are
 *       qualified with .toolbar-button so that our rule is more specific than the one that sets
 *       --toolbar-button-hover-color in ToolbarButtonWidget.vue, rather than rely on the order of our stylesheets.
 */

.toolbar-button.remove-button {
  --toolbar-button-hover-color: var(--opencor-error-color);
  --p-content-hover-background: color-mix(in srgb, var(--opencor-error-color) 10%, transparent);
}

.sub-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sub-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.trace-item {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.375rem 0.5rem 0.75rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.375rem;
}

.trace-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  font-size: 0.875rem;
}

.trace-name {
  min-width: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2.5rem 1rem;
  border: 1px dashed var(--p-content-border-color);
  border-radius: 0.5rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  text-align: center;
}

.empty-state p {
  margin: 0;
}

.empty-state-icon {
  font-size: 1.5rem;
}

.empty-state-tight {
  padding: 0.75rem;
}

/**
 * External data import bar.
 */

.external-data-import {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  border: 1px dashed var(--p-content-border-color);
  border-radius: 0.5rem;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.external-data-import-active {
  border-color: var(--p-primary-color);
  background-color: color-mix(in srgb, var(--p-primary-color) 7%, transparent);
}

.external-data-import-icon {
  color: var(--p-text-muted-color);
  font-size: 1.125rem;
}

/**
 * Note: our URL field and its Import button are grouped (with the "or" that precedes them), so that they can be shown
 *       on their own line in our narrow layout (see below), rather than be squashed next to our Browse... button.
 */

.external-data-import-url {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

/**
 * Footer.
 */

.status-valid {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--opencor-success-color);
  font-size: 0.8125rem;
}

.text-muted-color {
  color: var(--p-text-muted-color);
}

:global(.p-popover .issues-popover-content) {
  width: max-content;
  max-height: 30rem;
  max-width: 50rem;
  overflow-y: auto;
}

/**
 * Note: our issues view is a size container (so that it can adapt to the width of its container, see IssuesView.vue),
 *       which means that its contents wouldn't contribute to the width of our popover, so we make it a normal element
 *       (our popover is wide enough for our issues view not to need to adapt to its width anyway).
 */

:global(.p-popover .issues-popover-content .issues) {
  border: none;
  container-type: normal;
}

:global(.p-select-overlay.item-filter .p-select-header > div > input) {
  padding: 0.25rem;
  padding-right: 0;
}

/**
 * Narrow layout, i.e. when OpenCOR is less than 40rem wide (see NARROW_LAYOUT_WIDTH in constants.ts), e.g., on a phone
 * or when OpenCOR is embedded in a small container (see opencor-dialog in BaseDialog.vue). Our dialog then takes all
 * the room it can, our navigation becomes a row of tabs (above our sections) that can be scrolled horizontally, our
 * form fields are stacked rather than shown side by side, and our URL field for external data (and its Import button)
 * is shown on its own line.
 * Note: the labels of our navigation groups are not shown since our navigation is a single row of tabs. The issues of a
 *       navigation group are still shown, i.e. next to the navigation items that have issues.
 */

@container opencor-dialog (width < 40rem) {
  .settings-dialog-root :deep(.settings-dialog) {
    width: 100%;
    height: 100%;
    max-height: 100%;
    border-radius: 0;
  }

  .settings-body {
    flex-direction: column;
    gap: 0.75rem;
  }

  .settings-nav {
    flex-direction: row;
    gap: 0.125rem;
    width: auto;
    padding: 0 0 0.5rem;
    border-right: none;
    border-bottom: 1px solid var(--p-content-border-color);
    overflow: auto hidden;
    scrollbar-width: thin;
  }

  .settings-nav-group {
    flex-direction: row;
  }

  .settings-nav-group-label {
    display: none;
  }

  .settings-nav-item {
    flex: none;
    width: auto;
    white-space: nowrap;
  }

  .section-header {
    flex-direction: column;
    gap: 0.75rem;
  }

  .form-row {
    flex-direction: column;
    align-items: stretch;
  }

  .external-data-import {
    flex-wrap: wrap;
  }

  .external-data-import-url {
    flex-basis: 100%;
  }
}
</style>
