<template>
  <BaseDialog @hide="onHide">
    <template #header>
      <div class="flex grow gap-2 items-center">
        <span class="p-dialog-title">Settings...</span>
        <ThemeWidget v-if="themeCanBeChanged" class="ml-auto mr-2" :theme="theme" @mousedown.stop @switch="onThemeSwitch" />
      </div>
    </template>
    <div class="flex gap-2 items-center">
      <Checkbox inputId="checkForUpdatesAtStartup" :binary="true" v-model="checkForUpdatesAtStartup" />
      <label for="checkForUpdatesAtStartup">Check for updates at startup</label>
    </div>
    <template #footer>
      <Button autofocus label="OK" @click="onOk" />
      <Button label="Cancel" severity="secondary" @click="$emit('close')" />
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import * as vue from 'vue';

import type { OpenCORTheme } from '../../../index';

import { settings } from '../../common/settings';
import * as vueCommon from '../../common/vueCommon';

import { useOpenCORContext } from '../OpenCORContext';

const emit = defineEmits<{
  close: [];
}>();

const { themeCanBeChanged } = useOpenCORContext();

const opencorTheme = vueCommon.useTheme();
const checkForUpdatesAtStartup = vue.ref(settings.general.checkForUpdatesAtStartup);
const theme = vue.ref<OpenCORTheme>(opencorTheme.theme());

const initialiseDialog = () => {
  // Note #1: we can come here as a result of hiding the dialog and this in case the dialog gets opened multiple times.
  //          We could do this when showing the dialog, but it might result in the UI flashing (e.g., a checkbox was
  //          checked and then it gets unchecked), hence we do it when hiding the dialog.
  // Note #2: we use our current theme rather than the one from our settings since the latter may not be valid (e.g., if
  //          our settings were edited by hand).

  checkForUpdatesAtStartup.value = settings.general.checkForUpdatesAtStartup;
  theme.value = opencorTheme.theme();
};

settings.onInitialised(() => {
  initialiseDialog();
});

const onThemeSwitch = (newTheme: OpenCORTheme) => {
  // Switch to the next theme and apply it straight away, so that the user can see what it looks like. It will be either
  // confirmed (if the user clicks on OK) or reverted (otherwise) when the dialog gets hidden.

  theme.value = newTheme;

  opencorTheme.applyTheme(newTheme);
};

const onOk = () => {
  settings.general.checkForUpdatesAtStartup = checkForUpdatesAtStartup.value;

  if (themeCanBeChanged) {
    settings.general.theme = theme.value;
  }

  settings.save();

  emit('close');
};

const onHide = () => {
  // Apply the theme from our settings, i.e. revert to it if the dialog was cancelled or confirm it if the user clicked
  // on OK (since our settings will have been updated by then).

  if (themeCanBeChanged) {
    opencorTheme.applyTheme(settings.general.theme);
  }

  initialiseDialog();
};
</script>
