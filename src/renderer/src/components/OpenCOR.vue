<template>
  <component :is="OPENCOR_ELEMENT_TAG" ref="elementRef"
    :omex.prop="omex"
    :theme.prop="theme"
    :hostFont.prop="hostFont"
    @external-data="onExternalData"
    @file="onFile"
    @simulation-data="onSimulationData"
  />
</template>

<script setup lang="ts">
import * as vue from 'vue';

import type {
  IOpenCOREmits,
  IOpenCORExpose,
  IOpenCORExternalDataEvent,
  IOpenCORFileEvent,
  IOpenCORProps,
  IOpenCORSimulationDataEvent
} from '../../index';

import { ensureOpenCORElement, type IOpenCORElement, OPENCOR_ELEMENT_TAG } from '../element';

// Our OpenCOR component, which is a wrapper around our custom element (see element.ts).
// Note #1: we pass our props as DOM properties since they may not be strings (e.g., a COMBINE archive as a Uint8Array).
// Note #2: our custom element emits its events as custom events, the detail of which is the array of arguments that
//          were emitted, so we re-emit them as Vue events, i.e. as if our OpenCOR component had emitted them itself.

defineProps<IOpenCORProps>();

const emit = defineEmits<IOpenCOREmits>();

ensureOpenCORElement();

const elementRef = vue.ref<IOpenCORElement | null>(null);

const onExternalData = (event: CustomEvent<[IOpenCORExternalDataEvent]>): void => {
  emit('externalData', event.detail[0]);
};

const onFile = (event: CustomEvent<[IOpenCORFileEvent]>): void => {
  emit('file', event.detail[0]);
};

const onSimulationData = (event: CustomEvent<[IOpenCORSimulationDataEvent]>): void => {
  emit('simulationData', event.detail[0]);
};

// Exposed methods, which we forward to our custom element.

defineExpose<IOpenCORExpose>({
  addExternalData: (csv: string, voiExpression: string | undefined, modelParameters: string[]): void => {
    elementRef.value?.addExternalData(csv, voiExpression, modelParameters);
  },
  trackSimulationData: (modelParameters: string[]): void => {
    elementRef.value?.trackSimulationData(modelParameters);
  },
  untrackSimulationData: (modelParameters: string[]): void => {
    elementRef.value?.untrackSimulationData(modelParameters);
  },
  untrackAllSimulationData: (): void => {
    elementRef.value?.untrackAllSimulationData();
  }
});
</script>
