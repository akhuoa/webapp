<template>
  <BaseDialog header="Settings" class="w-120" @hide="onHide">
    <div class="settings">
      <!-- Appearance -->

      <section v-if="themeCanBeChanged" class="settings-section">
        <div class="opencor-section-title">Appearance</div>
        <div class="settings-row opencor-panel">
          <div class="settings-row-label">Theme</div>
          <div class="theme-options" role="group" aria-label="Theme">
            <button v-for="themeOption in THEME_OPTIONS" :key="themeOption.theme" class="theme-option"
              :class="{ 'theme-option-selected': themeOption.theme === theme }"
              type="button"
              :aria-pressed="themeOption.theme === theme"
              @mousedown.prevent
              @click="onThemeSwitch(themeOption.theme)"
            >
              <i :class="themeOption.icon" />
              {{ themeOption.label }}
            </button>
          </div>
        </div>
      </section>

      <!-- Updates -->

      <section class="settings-section">
        <div class="opencor-section-title">Updates</div>
        <label class="settings-row opencor-panel" for="checkForUpdatesAtStartup">
          <span class="settings-row-text">
            <span class="settings-row-label">Check for updates at startup</span>
            <span class="settings-row-description">Get notified when a new version is available.</span>
          </span>
          <ToggleSwitch v-model="checkForUpdatesAtStartup" inputId="checkForUpdatesAtStartup" />
        </label>
      </section>
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

// Our theme options, in the same order as the themes of our theme button (see ThemeWidget.vue).

const THEME_OPTIONS: { theme: OpenCORTheme; label: string; icon: string }[] = [
  { theme: 'system', label: 'System', icon: 'pi pi-desktop' },
  { theme: 'light', label: 'Light', icon: 'pi pi-sun' },
  { theme: 'dark', label: 'Dark', icon: 'pi pi-moon' }
];

const opencorTheme = vueCommon.useTheme();
const checkForUpdatesAtStartup = vue.ref(settings.general.checkForUpdatesAtStartup);
const theme = vue.ref<OpenCORTheme>(opencorTheme.theme());

const initialiseDialog = () => {
  // Note #1: we can come here as a result of hiding the dialog and this in case the dialog gets opened multiple times.
  //          We could do this when showing the dialog, but it might result in the UI flashing (e.g., a toggle switch
  //          was on and then it gets turned off), hence we do it when hiding the dialog.
  // Note #2: we use our current theme rather than the one from our settings since the latter may not be valid (e.g., if
  //          our settings were edited by hand).

  checkForUpdatesAtStartup.value = settings.general.checkForUpdatesAtStartup;
  theme.value = opencorTheme.theme();
};

settings.onInitialised(() => {
  initialiseDialog();
});

// Keep track of our current theme, since it can also be changed using our theme button (see ThemeWidget.vue), in which
// case we would otherwise show (and, if OK'ed, restore) the theme that was current when the dialog was last hidden.

vue.watch(
  () => opencorTheme.theme(),
  (newTheme: OpenCORTheme) => {
    theme.value = newTheme;
  }
);

const onThemeSwitch = (newTheme: OpenCORTheme) => {
  // Switch to the given theme and apply it straight away, so that the user can see what it looks like. It will be
  // either confirmed (if the user clicks on OK) or reverted (otherwise) when the dialog gets hidden.

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

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  margin-bottom: 0.25rem;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 0.875rem;
}

label.settings-row {
  cursor: pointer;
}

.settings-row-text {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.settings-row-label {
  color: var(--p-text-color);
  font-size: 0.875rem;
  font-weight: 500;
}

.settings-row-description {
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

/**
 * Theme options, i.e. a segmented control.
 */

.theme-options {
  display: flex;
  flex-shrink: 0;
  gap: 0.125rem;
  padding: 0.1875rem;
  border-radius: 0.5rem;
  background-color: color-mix(in srgb, var(--p-text-color) 6%, transparent);
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  border: none;
  border-radius: 0.375rem;
  background: none;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  cursor: pointer;
}

.theme-option .pi {
  font-size: 0.75rem;
}

.theme-option:hover {
  color: var(--p-text-color);
}

.theme-option:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--p-primary-color);
}

.theme-option-selected {
  background-color: var(--p-content-background);
  box-shadow: 0 1px 2px color-mix(in srgb, #000 15%, transparent);
  color: var(--p-text-color);
}

.theme-option-selected .pi {
  color: var(--p-primary-color);
}

.theme-option-selected:focus-visible {
  box-shadow:
    0 0 0 2px var(--p-primary-color),
    0 1px 2px color-mix(in srgb, #000 15%, transparent);
}

/**
 * Note: we don't want our toggle switch to be animated.
 */

:deep(.p-toggleswitch-slider),
:deep(.p-toggleswitch-handle) {
  transition: none;
}
</style>
