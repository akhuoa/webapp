<template>
  <div style="height: 100vh; height: 100dvh;">
    <div class="h-full flex flex-col">
      <div class="flex p-2 space-x-2 justify-center">
        <button :class="['flex-1 px-4 py-2 rounded text-center cursor-pointer', areModelParametersTracked(voi) ? 'bg-red-600' : 'bg-green-600', 'transition transform duration-150 ease-out active:scale-95 active:opacity-80']" @click="trackOrUntrackModelParameters(voi)">VOI</button>
        <button :class="['flex-1 px-4 py-2 rounded text-center cursor-pointer', areModelParametersTracked(mainT) ? 'bg-red-600' : 'bg-green-600', 'transition transform duration-150 ease-out active:scale-95 active:opacity-80']" @click="trackOrUntrackModelParameters(mainT)">main/t</button>
        <button :class="['flex-1 px-4 py-2 rounded text-center cursor-pointer', areModelParametersTracked(mainXYZ) ? 'bg-red-600' : 'bg-green-600', 'transition transform duration-150 ease-out active:scale-95 active:opacity-80']" @click="trackOrUntrackModelParameters(mainXYZ)">main/xyz</button>
        <button :class="['flex-1 px-4 py-2 rounded text-center cursor-pointer', areModelParametersTracked(unknown) ? 'bg-red-600' : 'bg-green-600', 'transition transform duration-150 ease-out active:scale-95 active:opacity-80']" @click="trackOrUntrackModelParameters(unknown)">unknown</button>
        <button class="flex-1 px-4 py-2 rounded disabled:opacity-50 text-center cursor-pointer disabled:cursor-default bg-red-600 transition transform duration-150 ease-out active:scale-95 active:opacity-80" :disabled="!simulationDataTracked.length" @click="untrackAllModelParameters">All</button>
      </div>
      <div class="flex flex-1">
        <OpenCOR class="flex-1" ref="opencorRef"
          omex="https://raw.githubusercontent.com/opencor/webapp/refs/heads/main/tests/models/ui/lorenz.omex"
          @simulationData="onSimulationData"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as vue from 'vue';

import type { IOpenCORExpose, IOpenCORSimulationDataEvent } from '../index';

import OpenCOR from './components/OpenCOR.vue';

const opencorRef = vue.ref<IOpenCORExpose>();
const voi = vue.ref<string[]>(['VOI']);
const mainT = vue.ref<string[]>(['main/t']);
const mainXYZ = vue.ref<string[]>(['main/x', 'main/y', 'main/z']);
const unknown = vue.ref<string[]>(['unknown']);
const simulationDataTracked = vue.ref<string[]>([]);

const areModelParametersTracked = (modelParameters: string[]): boolean => {
  return modelParameters.every((mp) => simulationDataTracked.value.includes(mp));
};

const trackOrUntrackModelParameters = (modelParameters: string[]) => {
  if (!opencorRef.value) {
    console.error('OpenCOR instance unavailable.');

    return;
  }

  if (!areModelParametersTracked(modelParameters)) {
    opencorRef.value.trackSimulationData(modelParameters);

    simulationDataTracked.value.push(...modelParameters);
  } else {
    opencorRef.value.untrackSimulationData(modelParameters);

    simulationDataTracked.value = simulationDataTracked.value.filter((mp) => !modelParameters.includes(mp));
  }
};

const untrackAllModelParameters = () => {
  if (!opencorRef.value) {
    console.error('OpenCOR instance unavailable.');

    return;
  }

  opencorRef.value.untrackAllSimulationData();
  simulationDataTracked.value = [];
};

const onSimulationData = (event: IOpenCORSimulationDataEvent) => {
  console.log('---[Simulation data]---');

  switch (event.type) {
    case 'updated':
      for (const modelParameter of Object.keys(event.simulationData)) {
        console.log(`Simulation data for "${modelParameter}":`);
        console.log(event.simulationData[modelParameter]);
      }

      console.log('No issues.');

      break;
    case 'issue':
      console.log('Simulation data issue:');

      event.issues.forEach((issue: string) => {
        console.log(` - ${issue}`);
      });

      break;
  }
};
</script>
