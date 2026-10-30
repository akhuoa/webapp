<template>
  <div style="height: 100vh; height: 100dvh;">
    <div class="h-full flex flex-col">
      <div class="flex p-2 space-x-2 justify-center">
        <button :class="['flex-1 px-4 py-2 rounded text-center cursor-pointer bg-cyan-600 transition transform duration-150 ease-out active:scale-95 active:opacity-80']" @click="addPotassiumCurrentsDataFromCsv()">Add potassium currents data from CSV</button>
        <button :class="['flex-1 px-4 py-2 rounded text-center cursor-pointer bg-cyan-600 transition transform duration-150 ease-out active:scale-95 active:opacity-80']" @click="addVoltageDataWithTimeInSecondsFromUrl()">Add voltage data (with time in seconds) from URL</button>
        <button :class="['flex-1 px-4 py-2 rounded text-center cursor-pointer bg-cyan-600 transition transform duration-150 ease-out active:scale-95 active:opacity-80']" @click="addVoltageDataWithSkippedValuesFromUrl()">Add voltage data (with skipped time data points) from URL</button>
        <button :class="['flex-1 px-4 py-2 rounded text-center cursor-pointer bg-cyan-600 transition transform duration-150 ease-out active:scale-95 active:opacity-80']" @click="addDataFromFigshareUrl()">Add data from Figshare URL</button>
      </div>
      <div class="flex flex-1">
        <OpenCOR class="flex-1" ref="opencorRef"
          :omex="rawTt04ForExternalDataOmexFile"
          @externalData="onExternalData"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as vue from 'vue';

import type { IOpenCORExpose, IOpenCORExternalDataEvent } from '../index';

import OpenCOR from './components/OpenCOR.vue';

const opencorRef = vue.ref<IOpenCORExpose>();
const rawTt04ForExternalDataOmexFile = vue.ref<Uint8Array>(new Uint8Array());
const tt04PotassiumCurrentsWithNoiseCsvFileContents = vue.ref<string>('');

const rawFileContents = async (url: URL): Promise<Uint8Array> => {
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    return new Uint8Array(buffer);
  } catch (error: unknown) {
    console.error(`Failed to load our raw OMEX file from ${url}:`, error);

    return new Uint8Array();
  }
};

const rawToText = (raw: Uint8Array): string => {
  const decoder = new TextDecoder('utf-8');

  return decoder.decode(raw);
};

rawFileContents(new URL('../../../tests/models/ui/tt04_for_external_data.omex', import.meta.url)).then((contents) => {
  rawTt04ForExternalDataOmexFile.value = contents;
});

rawFileContents(new URL('../../../tests/data/tt04_potassium_currents_with_noise.csv', import.meta.url)).then(
  (contents) => {
    tt04PotassiumCurrentsWithNoiseCsvFileContents.value = rawToText(contents);
  }
);

const addPotassiumCurrentsDataFromCsv = (): void => {
  if (!opencorRef.value) {
    console.error('OpenCOR instance unavailable.');

    return;
  }

  opencorRef.value.addExternalData(tt04PotassiumCurrentsWithNoiseCsvFileContents.value, undefined, [
    'inward_rectifier_potassium_current/i_K1',
    'rapid_time_dependent_potassium_current/i_Kr',
    'slow_time_dependent_potassium_current/i_Ks',
    'transient_outward_current/i_to'
  ]);
};

const addVoltageDataWithTimeInSecondsFromUrl = (): void => {
  if (!opencorRef.value) {
    console.error('OpenCOR instance unavailable.');

    return;
  }

  opencorRef.value.addExternalData(
    'https://github.com/opencor/webapp/raw/refs/heads/main/tests/data/tt04_V_with_time_in_seconds_and_noise.csv',
    '1000*voi',
    ['membrane/V']
  );
};

const addVoltageDataWithSkippedValuesFromUrl = async (): Promise<void> => {
  if (!opencorRef.value) {
    console.error('OpenCOR instance unavailable.');

    return;
  }

  opencorRef.value.addExternalData(
    'https://github.com/opencor/webapp/raw/refs/heads/main/tests/data/tt04_V_with_skipped_time_data_points_and_noise.csv',
    undefined,
    ['membrane/V']
  );
};

const addDataFromFigshareUrl = async (): Promise<void> => {
  if (!opencorRef.value) {
    console.error('OpenCOR instance unavailable.');

    return;
  }

  opencorRef.value.addExternalData('https://ndownloader.figshare.com/files/62963044', '300*voi', ['membrane/V']);
};

const onExternalData = (event: IOpenCORExternalDataEvent) => {
  console.log('---[External data]---');

  switch (event.type) {
    case 'added':
      console.log(`External data added for CSV: ${event.csv}`);
      console.log('No issues.');

      break;
    case 'issue':
      console.log(`External data issue for CSV: ${event.csv}`);
      console.log('Issues:');

      event.issues.forEach((issue: string) => {
        console.log(` - ${issue}`);
      });

      break;
  }
};
</script>
