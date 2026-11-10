import * as vue from 'vue';

import type {
  File as IWasmFile,
  SedDocument as IWasmSedDocument,
  SedInstance as IWasmSedInstance,
  SedInstanceTask as IWasmSedInstanceTask,
  SedModel as IWasmSedModel,
  SedOneStep as IWasmSedOneStep,
  SedUniformTimeCourse as IWasmSedUniformTimeCourse,
  SolverCvode as IWasmSolverCvode
} from '@opencor/libopencor-types';

import {
  _cppLocApi,
  _wasmLocApi,
  cppVersion,
  EIssueType,
  type File,
  fileManager,
  type IIssue,
  wasmIssuesToIssues,
  wasmVersion
} from './locApi';

// SED-ML API.

class SedIndex {
  protected _index: number;

  constructor(index: number) {
    this._index = index;
  }
}

export class SedDocument {
  private _cppDocumentId: number = -1;
  private _wasmSedDocument: IWasmSedDocument = {} as IWasmSedDocument;
  private _issues: IIssue[] = [];
  private _models = new Map<number, SedModel>();
  private _simulations = new Map<number, SedSimulation>();
  private _hasWasmSedDocument = false;
  private _released = false;

  constructor(filePath: string, wasmFile: IWasmFile, fileIssues: IIssue[]) {
    // If the file has some errors (e.g., an invalid CellML file), then report its issues rather than those of the
    // SED-ML document (since those are likely to be a consequence of the file's errors).

    if (fileIssues.some((issue: IIssue) => issue.type === EIssueType.ERROR)) {
      this._issues = [...fileIssues];

      return;
    }

    // Create the SED-ML document.

    if (cppVersion()) {
      this._cppDocumentId = _cppLocApi.sedDocumentCreate(filePath);
    } else {
      this._wasmSedDocument = new _wasmLocApi.SedDocument(wasmFile);
      this._hasWasmSedDocument = true;
    }

    // Retrieve the issues.

    this._issues = cppVersion()
      ? _cppLocApi.sedDocumentIssues(this._cppDocumentId)
      : wasmIssuesToIssues(this._wasmSedDocument.issues);

    // Don't check anything else if the SED-ML document already has some errors.

    if (this._issues.some((issue: IIssue) => issue.type === EIssueType.ERROR)) {
      return;
    }

    // TODO: we only support a limited subset of SED-ML for now, so we need to check a few more things. See
    // https://github.com/opencor/opencor/blob/master/src/plugins/support/SEDMLSupport/src/sedmlfile.cpp#L579-L1492.

    // Make sure that there is only one model.

    if (this.modelCount() !== 1) {
      this._issues.push({
        type: EIssueType.WARNING,
        description: 'Only SED-ML files with one model are currently supported.'
      });

      return;
    }

    // Make sure that the SED-ML file has only one simulation.

    if (this.simulationCount() !== 1) {
      this._issues.push({
        type: EIssueType.WARNING,
        description: 'Only SED-ML files with one simulation are currently supported.'
      });

      return;
    }

    // Make sure that the simulation is a uniform time course simulation.

    const simulation = this.simulation(0) as SedUniformTimeCourse;

    if (simulation.type() !== ESedSimulationType.UNIFORM_TIME_COURSE) {
      this._issues.push({
        type: EIssueType.WARNING,
        description: 'Only uniform time course simulations are currently supported.'
      });

      return;
    }

    // Make sure that the initial time and output start time are the same, that the output start time and output end
    // time are different, and that the number of steps is greater than zero.

    const initialTime = simulation.initialTime();
    const outputStartTime = simulation.outputStartTime();
    const outputEndTime = simulation.outputEndTime();
    const numberOfSteps = simulation.numberOfSteps();

    if (initialTime !== outputStartTime) {
      this._issues.push({
        type: EIssueType.WARNING,
        description: `Only uniform time course simulations with the same values for 'initialTime' (${initialTime}) and 'outputStartTime' (${outputStartTime}) are currently supported.`
      });
    }

    if (outputStartTime === outputEndTime) {
      this._issues.push({
        type: EIssueType.ERROR,
        description: `The uniform time course simulation must have different values for 'outputStartTime' (${outputStartTime}) and 'outputEndTime' (${outputEndTime}).`
      });
    }

    if (numberOfSteps <= 0) {
      this._issues.push({
        type: EIssueType.ERROR,
        description: `The uniform time course simulation must have a positive value for 'numberOfSteps' (${numberOfSteps}).`
      });
    }
  }

  release(): void {
    // Release the resources held by the document (and its models and simulations).
    // Note: this must only be done once the document is no longer used. Instances created from the document don't need
    //       it to be around since they hold their own references to whatever they need from it.

    if (this._released) {
      return;
    }

    this._released = true;

    for (const model of this._models.values()) {
      model.release();
    }

    this._models.clear();

    for (const simulation of this._simulations.values()) {
      simulation.release();
    }

    this._simulations.clear();

    if (cppVersion()) {
      _cppLocApi.sedDocumentRelease(this._cppDocumentId);
    } else if (this._hasWasmSedDocument) {
      this._wasmSedDocument.delete();
    }
  }

  issues(): IIssue[] {
    return this._issues;
  }

  modelCount(): number {
    return cppVersion() ? _cppLocApi.sedDocumentModelCount(this._cppDocumentId) : this._wasmSedDocument.modelCount;
  }

  model(index: number): SedModel {
    // Note: we cache our models so that we can release them when releasing the document.

    let res = this._models.get(index);

    if (!res) {
      res = new SedModel(this._cppDocumentId, this._wasmSedDocument, index);

      this._models.set(index, res);
    }

    return res;
  }

  simulationCount(): number {
    return cppVersion()
      ? _cppLocApi.sedDocumentSimulationCount(this._cppDocumentId)
      : this._wasmSedDocument.simulationCount;
  }

  simulation(index: number): SedSimulation {
    // Note: we cache our simulations so that we can release them when releasing the document.

    let res = this._simulations.get(index);

    if (!res) {
      res = this.createSimulation(index);

      this._simulations.set(index, res);
    }

    return res;
  }

  private createSimulation(index: number): SedSimulation {
    let type: ESedSimulationType;

    if (cppVersion()) {
      type = _cppLocApi.sedDocumentSimulationType(this._cppDocumentId, index);
    } else {
      const wasmSedSimulation = this._wasmSedDocument.simulation(index);

      switch (wasmSedSimulation?.constructor.name) {
        case 'SedAnalysis':
          type = ESedSimulationType.ANALYSIS;

          break;
        case 'SedSteadyState':
          type = ESedSimulationType.STEADY_STATE;

          break;
        case 'SedOneStep':
          type = ESedSimulationType.ONE_STEP;

          break;
        default: // 'SedUniformTimeCourse'.
          type = ESedSimulationType.UNIFORM_TIME_COURSE;
      }

      wasmSedSimulation?.delete();
    }

    if (type === ESedSimulationType.ANALYSIS) {
      return new SedAnalysis(this._cppDocumentId, this._wasmSedDocument, index, type);
    }

    if (type === ESedSimulationType.STEADY_STATE) {
      return new SedSteadyState(this._cppDocumentId, this._wasmSedDocument, index, type);
    }

    if (type === ESedSimulationType.ONE_STEP) {
      return new SedOneStep(this._cppDocumentId, this._wasmSedDocument, index, type);
    }

    return new SedUniformTimeCourse(this._cppDocumentId, this._wasmSedDocument, index, type);
  }

  instantiate(): SedInstance {
    return new SedInstance(this._cppDocumentId, this._wasmSedDocument);
  }

  serialise(): string {
    return cppVersion() ? _cppLocApi.sedDocumentSerialise(this._cppDocumentId) : this._wasmSedDocument.serialise();
  }
}

export class SedModel extends SedIndex {
  private _cppDocumentId: number;
  private _wasmSedModel: IWasmSedModel = {} as IWasmSedModel;

  constructor(cppDocumentId: number, wasmSedDocument: IWasmSedDocument, index: number) {
    super(index);

    this._cppDocumentId = cppDocumentId;

    if (wasmVersion()) {
      this._wasmSedModel = wasmSedDocument.model(index) as IWasmSedModel;
    }
  }

  release(): void {
    if (wasmVersion()) {
      this._wasmSedModel?.delete();
    }
  }

  file(): File | null {
    // Note: the caller is responsible for releasing the returned file.

    if (cppVersion()) {
      const filePath = _cppLocApi.sedModelFilePath(this._cppDocumentId, this._index);

      return filePath === null ? null : fileManager.file(filePath);
    }

    const wasmFile = this._wasmSedModel.file;

    if (!wasmFile) {
      return null;
    }

    const wasmFilePath = wasmFile.path;

    wasmFile.delete();

    return fileManager.file(wasmFilePath);
  }

  addChange(componentName: string, variableName: string, newValue: string): void {
    if (cppVersion()) {
      _cppLocApi.sedModelAddChange(this._cppDocumentId, this._index, componentName, variableName, newValue);
    } else {
      // Note: the model holds its own reference to the change, so we can (and must) delete our handle to it.

      const wasmSedChangeAttribute = new _wasmLocApi.SedChangeAttribute(componentName, variableName, newValue);

      this._wasmSedModel.addChange(wasmSedChangeAttribute);

      wasmSedChangeAttribute.delete();
    }
  }

  removeAllChanges(): void {
    if (cppVersion()) {
      _cppLocApi.sedModelRemoveAllChanges(this._cppDocumentId, this._index);
    } else {
      this._wasmSedModel.removeAllChanges();
    }
  }
}

export enum ESedSimulationType {
  ANALYSIS,
  STEADY_STATE,
  ONE_STEP,
  UNIFORM_TIME_COURSE
}

export class SedSimulation extends SedIndex {
  protected _cppDocumentId: number;
  private _type: ESedSimulationType;

  constructor(cppDocumentId: number, _wasmSedDocument: IWasmSedDocument, index: number, type: ESedSimulationType) {
    super(index);

    this._cppDocumentId = cppDocumentId;
    this._type = type;
  }

  release(): void {
    // Nothing to release by default.
  }

  type(): ESedSimulationType {
    return this._type;
  }
}

export class SedAnalysis extends SedSimulation {}

export class SedSteadyState extends SedSimulation {}

export class SedOneStep extends SedSimulation {
  private _wasmSedOneStep: IWasmSedOneStep = {} as IWasmSedOneStep;

  constructor(cppDocumentId: number, wasmSedDocument: IWasmSedDocument, index: number, type: ESedSimulationType) {
    super(cppDocumentId, wasmSedDocument, index, type);

    if (wasmVersion()) {
      this._wasmSedOneStep = wasmSedDocument.simulation(index) as IWasmSedOneStep;
    }
  }

  override release(): void {
    if (wasmVersion()) {
      this._wasmSedOneStep?.delete();
    }
  }

  step(): number {
    return cppVersion() ? _cppLocApi.sedOneStepStep(this._cppDocumentId, this._index) : this._wasmSedOneStep.step;
  }
}

// The maximum number of steps of a uniform time course.
// Note: libOpenCOR uses an int for the number of steps, so a larger number of steps would get silently wrapped.

export const MAXIMUM_NUMBER_OF_STEPS = 2 ** 31 - 1;

export class SedUniformTimeCourse extends SedSimulation {
  private _wasmSedUniformTimeCourse: IWasmSedUniformTimeCourse = {} as IWasmSedUniformTimeCourse;
  private _cvode: SolverCvode | null | undefined;

  constructor(cppDocumentId: number, wasmSedDocument: IWasmSedDocument, index: number, type: ESedSimulationType) {
    super(cppDocumentId, wasmSedDocument, index, type);

    if (wasmVersion()) {
      this._wasmSedUniformTimeCourse = wasmSedDocument.simulation(index) as IWasmSedUniformTimeCourse;
    }
  }

  override release(): void {
    this._cvode?.release();

    this._cvode = undefined;

    if (wasmVersion()) {
      this._wasmSedUniformTimeCourse?.delete();
    }
  }

  initialTime(): number {
    return cppVersion()
      ? _cppLocApi.sedUniformTimeCourseInitialTime(this._cppDocumentId, this._index)
      : this._wasmSedUniformTimeCourse.initialTime;
  }

  setInitialTime(value: number): void {
    if (cppVersion()) {
      _cppLocApi.sedUniformTimeCourseSetInitialTime(this._cppDocumentId, this._index, value);
    } else {
      this._wasmSedUniformTimeCourse.initialTime = value;
    }
  }

  outputStartTime(): number {
    return cppVersion()
      ? _cppLocApi.sedUniformTimeCourseOutputStartTime(this._cppDocumentId, this._index)
      : this._wasmSedUniformTimeCourse.outputStartTime;
  }

  setOutputStartTime(value: number): void {
    if (cppVersion()) {
      _cppLocApi.sedUniformTimeCourseSetOutputStartTime(this._cppDocumentId, this._index, value);
    } else {
      this._wasmSedUniformTimeCourse.outputStartTime = value;
    }
  }

  outputEndTime(): number {
    return cppVersion()
      ? _cppLocApi.sedUniformTimeCourseOutputEndTime(this._cppDocumentId, this._index)
      : this._wasmSedUniformTimeCourse.outputEndTime;
  }

  setOutputEndTime(value: number): void {
    if (cppVersion()) {
      _cppLocApi.sedUniformTimeCourseSetOutputEndTime(this._cppDocumentId, this._index, value);
    } else {
      this._wasmSedUniformTimeCourse.outputEndTime = value;
    }
  }

  numberOfSteps(): number {
    return cppVersion()
      ? _cppLocApi.sedUniformTimeCourseNumberOfSteps(this._cppDocumentId, this._index)
      : this._wasmSedUniformTimeCourse.numberOfSteps;
  }

  setNumberOfSteps(value: number): void {
    if (cppVersion()) {
      _cppLocApi.sedUniformTimeCourseSetNumberOfSteps(this._cppDocumentId, this._index, value);
    } else {
      this._wasmSedUniformTimeCourse.numberOfSteps = value;
    }
  }

  cvode(): SolverCvode | null {
    // Note: we cache our solver so that we can release it when releasing the simulation. Also, the simulation's ODE
    //       solver is not necessarily CVODE (e.g., it could be Forward Euler or not set at all), in which case we
    //       return null.

    if (this._cvode === undefined) {
      if (cppVersion()) {
        this._cvode = _cppLocApi.solverCvodeExists(this._cppDocumentId, this._index)
          ? new SolverCvode(this._cppDocumentId, null, this._index)
          : null;
      } else {
        const wasmOdeSolver = this._wasmSedUniformTimeCourse.odeSolver;

        if (wasmOdeSolver instanceof _wasmLocApi.SolverCvode) {
          this._cvode = new SolverCvode(this._cppDocumentId, wasmOdeSolver as IWasmSolverCvode, this._index);
        } else {
          wasmOdeSolver?.delete();

          this._cvode = null;
        }
      }
    }

    return this._cvode;
  }
}

export class SolverCvode extends SedIndex {
  private _cppDocumentId: number;
  private _wasmSolverCvode: IWasmSolverCvode = {} as IWasmSolverCvode;

  constructor(cppDocumentId: number, wasmSolverCvode: IWasmSolverCvode | null, index: number) {
    super(index);

    this._cppDocumentId = cppDocumentId;

    if (wasmSolverCvode) {
      this._wasmSolverCvode = wasmSolverCvode;
    }
  }

  release(): void {
    if (wasmVersion()) {
      this._wasmSolverCvode?.delete();
    }
  }

  // TODO: this is only temporary until we have full support for our different solvers.

  maximumStep(): number {
    return cppVersion()
      ? _cppLocApi.solverCvodeMaximumStep(this._cppDocumentId, this._index)
      : this._wasmSolverCvode.maximumStep;
  }

  setMaximumStep(value: number): void {
    if (cppVersion()) {
      _cppLocApi.solverCvodeSetMaximumStep(this._cppDocumentId, this._index, value);
    } else {
      this._wasmSolverCvode.maximumStep = value;
    }
  }
}

export enum ESedInstanceStatus {
  IDLE,
  RUNNING,
  PAUSED
}

export class SedInstance {
  private _cppInstanceId: number = -1;
  private _wasmSedInstance: IWasmSedInstance = {} as IWasmSedInstance;
  private _tasks: SedInstanceTask[] = [];
  private _released = false;

  constructor(cppDocumentId: number, wasmSedDocument: IWasmSedDocument) {
    if (cppVersion()) {
      this._cppInstanceId = _cppLocApi.sedDocumentInstantiate(cppDocumentId);
    } else {
      this._wasmSedInstance = vue.markRaw(wasmSedDocument.instantiate() as IWasmSedInstance);
    }
  }

  hasIssues(): boolean {
    return cppVersion() ? _cppLocApi.sedInstanceHasIssues(this._cppInstanceId) : this._wasmSedInstance.hasIssues;
  }

  issues(): IIssue[] {
    return cppVersion()
      ? _cppLocApi.sedInstanceIssues(this._cppInstanceId)
      : wasmIssuesToIssues(this._wasmSedInstance.issues);
  }

  task(index: number): SedInstanceTask {
    const task = new SedInstanceTask(this._cppInstanceId, index, this._wasmSedInstance);

    this._tasks.push(task);

    return task;
  }

  status(): ESedInstanceStatus {
    return cppVersion() ? _cppLocApi.sedInstanceStatus(this._cppInstanceId) : this._wasmSedInstance.status.value;
  }

  progress(): number {
    return cppVersion() ? _cppLocApi.sedInstanceProgress(this._cppInstanceId) : this._wasmSedInstance.progress;
  }

  startRun(): boolean {
    return cppVersion() ? _cppLocApi.sedInstanceStartRun(this._cppInstanceId) : this._wasmSedInstance.startRun();
  }

  waitForRun(): number {
    return cppVersion() ? _cppLocApi.sedInstanceWaitForRun(this._cppInstanceId) : this._wasmSedInstance.waitForRun();
  }

  pauseRun(): void {
    if (cppVersion()) {
      _cppLocApi.sedInstancePauseRun(this._cppInstanceId);
    } else {
      this._wasmSedInstance.pauseRun();
    }
  }

  resumeRun(): void {
    if (cppVersion()) {
      _cppLocApi.sedInstanceResumeRun(this._cppInstanceId);
    } else {
      this._wasmSedInstance.resumeRun();
    }
  }

  stopRun(): void {
    if (cppVersion()) {
      _cppLocApi.sedInstanceStopRun(this._cppInstanceId);
    } else {
      this._wasmSedInstance.stopRun();
    }
  }

  // Release the resources held by the instance (and its tasks).
  // Note #1: this should only be done once the instance is idle and no longer used. Not releasing an instance means
  //          that it (and its tasks) never gets freed, which with the WASM version of libOpenCOR eventually results in
  //          an out-of-memory error.
  // Note #2: libOpenCOR waits for a run to finish before deleting an instance, so we stop any run first. Indeed, a
  //          paused run would otherwise never finish (and therefore hang the UI) while a running one would block the UI
  //          until it finishes.

  release(): void {
    if (this._released) {
      return;
    }

    this._released = true;

    // Stop our simulation run, if needed.
    // Note: we release our tasks and instance even if this fails (e.g., if libOpenCOR throws an exception) since we
    //       would otherwise leak them (we are now considered released, so we won't get another chance).

    try {
      if (this.status() !== ESedInstanceStatus.IDLE) {
        this.stopRun();
      }
    } catch (error: unknown) {
      console.error('OpenCOR: an error occurred while stopping a simulation run:', error);
    }

    for (const task of this._tasks) {
      try {
        task.release();
      } catch (error: unknown) {
        console.error('OpenCOR: an error occurred while releasing a simulation task:', error);
      }
    }

    this._tasks = [];

    if (cppVersion()) {
      _cppLocApi.sedInstanceRelease(this._cppInstanceId);
    } else {
      this._wasmSedInstance.delete();
    }
  }
}

// A helper function to retrieve (a view of) a slice of the given values.

const sliceValues = (values: Float64Array, start?: number, end?: number): Float64Array => {
  return start === undefined && end === undefined ? values : values.subarray(start ?? 0, end);
};

export class SedInstanceTask extends SedIndex {
  private _cppInstanceId: number;
  private _wasmSedInstanceTask: IWasmSedInstanceTask = {} as IWasmSedInstanceTask;
  private _hasWasmSedInstanceTask = false;

  constructor(cppInstanceId: number, index: number, wasmSedInstance: IWasmSedInstance) {
    super(index);

    this._cppInstanceId = cppInstanceId;

    // Note: an instance has no tasks if it has issues (e.g., if the number of steps of its simulation is not strictly
    //       positive), in which case the WASM version of libOpenCOR gives us no task.

    if (wasmVersion()) {
      const wasmSedInstanceTask = wasmSedInstance.task(index);

      if (wasmSedInstanceTask) {
        this._wasmSedInstanceTask = wasmSedInstanceTask as IWasmSedInstanceTask;
        this._hasWasmSedInstanceTask = true;
      }
    }
  }

  release(): void {
    if (this._hasWasmSedInstanceTask) {
      this._wasmSedInstanceTask.delete();

      this._hasWasmSedInstanceTask = false;
    }
  }

  voiName(): string {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskVoiName(this._cppInstanceId, this._index)
      : this._wasmSedInstanceTask.voiName;
  }

  voiUnit(): string {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskVoiUnit(this._cppInstanceId, this._index)
      : this._wasmSedInstanceTask.voiUnit;
  }

  // Note: the various methods to retrieve simulation data accept an optional start and end (with the same semantics as
  //       TypedArray.prototype.subarray()), which allow us to retrieve only some of the values (e.g., those that have
  //       been computed since we last retrieved some while a simulation is running). With the C++ version of
  //       libOpenCOR, this avoids copying values that are not needed. With the WASM version of libOpenCOR, the
  //       simulation data is a view of the WASM heap, so we simply return a view of it.

  voi(start?: number, end?: number): Float64Array {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskVoi(this._cppInstanceId, this._index, start, end)
      : sliceValues(this._wasmSedInstanceTask.voi, start, end);
  }

  stateCount(): number {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskStateCount(this._cppInstanceId, this._index)
      : this._wasmSedInstanceTask.stateCount;
  }

  stateName(index: number): string {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskStateName(this._cppInstanceId, this._index, index)
      : this._wasmSedInstanceTask.stateName(index);
  }

  stateUnit(index: number): string {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskStateUnit(this._cppInstanceId, this._index, index)
      : this._wasmSedInstanceTask.stateUnit(index);
  }

  state(index: number, start?: number, end?: number): Float64Array {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskState(this._cppInstanceId, this._index, index, start, end)
      : sliceValues(this._wasmSedInstanceTask.state(index), start, end);
  }

  rateCount(): number {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskRateCount(this._cppInstanceId, this._index)
      : this._wasmSedInstanceTask.rateCount;
  }

  rateName(index: number): string {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskRateName(this._cppInstanceId, this._index, index)
      : this._wasmSedInstanceTask.rateName(index);
  }

  rateUnit(index: number): string {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskRateUnit(this._cppInstanceId, this._index, index)
      : this._wasmSedInstanceTask.rateUnit(index);
  }

  rate(index: number, start?: number, end?: number): Float64Array {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskRate(this._cppInstanceId, this._index, index, start, end)
      : sliceValues(this._wasmSedInstanceTask.rate(index), start, end);
  }

  constantCount(): number {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskConstantCount(this._cppInstanceId, this._index)
      : this._wasmSedInstanceTask.constantCount;
  }

  constantName(index: number): string {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskConstantName(this._cppInstanceId, this._index, index)
      : this._wasmSedInstanceTask.constantName(index);
  }

  constantUnit(index: number): string {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskConstantUnit(this._cppInstanceId, this._index, index)
      : this._wasmSedInstanceTask.constantUnit(index);
  }

  constant(index: number, start?: number, end?: number): Float64Array {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskConstant(this._cppInstanceId, this._index, index, start, end)
      : sliceValues(this._wasmSedInstanceTask.constant(index), start, end);
  }

  computedConstantCount(): number {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskComputedConstantCount(this._cppInstanceId, this._index)
      : this._wasmSedInstanceTask.computedConstantCount;
  }

  computedConstantName(index: number): string {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskComputedConstantName(this._cppInstanceId, this._index, index)
      : this._wasmSedInstanceTask.computedConstantName(index);
  }

  computedConstantUnit(index: number): string {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskComputedConstantUnit(this._cppInstanceId, this._index, index)
      : this._wasmSedInstanceTask.computedConstantUnit(index);
  }

  computedConstant(index: number, start?: number, end?: number): Float64Array {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskComputedConstant(this._cppInstanceId, this._index, index, start, end)
      : sliceValues(this._wasmSedInstanceTask.computedConstant(index), start, end);
  }

  algebraicVariableCount(): number {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskAlgebraicVariableCount(this._cppInstanceId, this._index)
      : this._wasmSedInstanceTask.algebraicVariableCount;
  }

  algebraicVariableName(index: number): string {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskAlgebraicVariableName(this._cppInstanceId, this._index, index)
      : this._wasmSedInstanceTask.algebraicVariableName(index);
  }

  algebraicVariableUnit(index: number): string {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskAlgebraicVariableUnit(this._cppInstanceId, this._index, index)
      : this._wasmSedInstanceTask.algebraicVariableUnit(index);
  }

  algebraicVariable(index: number, start?: number, end?: number): Float64Array {
    return cppVersion()
      ? _cppLocApi.sedInstanceTaskAlgebraicVariable(this._cppInstanceId, this._index, index, start, end)
      : sliceValues(this._wasmSedInstanceTask.algebraicVariable(index), start, end);
  }
}
