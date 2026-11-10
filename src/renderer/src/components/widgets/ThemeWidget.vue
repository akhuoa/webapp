<template>
  <ToolbarButtonWidget
    :icon="`pi ${THEMES[props.theme].icon}`"
    :label="`${THEMES[props.theme].label} theme (click to switch to ${THEMES[nextTheme()].label} theme)`"
    small
    @click="emit('switch', nextTheme())"
  />
</template>

<script setup lang="ts">
import type { OpenCORTheme } from '../../../index';

// A button, which shows the given theme and allows the user to switch to the next one.

const props = defineProps<{
  theme: OpenCORTheme;
}>();

const emit = defineEmits<{
  switch: [newTheme: OpenCORTheme];
}>();

// Our themes, in the order in which the user cycles through them.

const THEMES: Record<OpenCORTheme, { label: string; icon: string }> = {
  system: { label: 'System', icon: 'pi-desktop' },
  light: { label: 'Light', icon: 'pi-sun' },
  dark: { label: 'Dark', icon: 'pi-moon' }
};

const THEME_ORDER = Object.keys(THEMES) as OpenCORTheme[];

const nextTheme = (): OpenCORTheme => {
  return THEME_ORDER[(THEME_ORDER.indexOf(props.theme) + 1) % THEME_ORDER.length] ?? 'system';
};
</script>
