export type OpenCORTheme = 'light' | 'dark' | 'system';

export interface IOpenCORProps {
  omex?: string | Uint8Array;
  theme?: OpenCORTheme;
  hostFont?: boolean;
}

export interface IOpenCORExpose {
  addExternalData: (csv: string, voiExpression: string | undefined, modelParameters: string[]) => void;
  trackSimulationData: (modelParameters: string[]) => void;
  untrackSimulationData: (modelParameters: string[]) => void;
  untrackAllSimulationData: () => void;
}

export type IOpenCOREmits = {
  externalData: [IOpenCORExternalDataEvent];
  file: [IOpenCORFileEvent];
  simulationData: [IOpenCORSimulationDataEvent];
};

export interface IOpenCORSimulationDataValue {
  data: Float64Array;
  unit: string;
}

// External data events.

export interface IOpenCORExternalDataAddedEvent {
  type: 'added';
  csv: string;
  issues: string[];
}

export interface IOpenCORExternalDataIssueEvent {
  type: 'issue';
  csv: string;
  issues: string[];
}

export type IOpenCORExternalDataEvent = IOpenCORExternalDataAddedEvent | IOpenCORExternalDataIssueEvent;

// File events.

export interface IOpenCORFileOpenedEvent {
  type: 'opened';
  filePath: string;
  issues: string[];
}

export interface IOpenCORFileClosedEvent {
  type: 'closed';
  filePath: string;
  issues: string[];
}

export interface IOpenCORFileIssueEvent {
  type: 'issue';
  filePath: string;
  issues: string[];
}

export type IOpenCORFileEvent = IOpenCORFileOpenedEvent | IOpenCORFileClosedEvent | IOpenCORFileIssueEvent;

// Simulation data events.

export type OpenCORSimulationData = Record<string, IOpenCORSimulationDataValue>;

export interface IOpenCORSimulationDataUpdatedEvent {
  type: 'updated';
  simulationData: OpenCORSimulationData;
  issues: string[];
}

export interface IOpenCORSimulationDataIssueEvent {
  type: 'issue';
  simulationData: OpenCORSimulationData;
  issues: string[];
}

export type IOpenCORSimulationDataEvent = IOpenCORSimulationDataUpdatedEvent | IOpenCORSimulationDataIssueEvent;

export { default, default as OpenCOR } from './src/components/OpenCOR.vue';
