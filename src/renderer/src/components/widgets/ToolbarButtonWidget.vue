<template>
  <button ref="buttonRef" class="toolbar-button relative flex items-center justify-center shrink-0 rounded-md cursor-pointer"
    :class="[
      props.small ? 'toolbar-button-small w-6 h-6' : 'w-8 h-8',
      props.accent ? `toolbar-button-${props.accent}` : '',
      {
        'toolbar-button-tooltip-end': props.tooltipAlign === 'end',
        'toolbar-button-tooltip-above': tooltipAbove,
        'toolbar-button-tooltip-suppressed': tooltipSuppressed,
        'toolbar-button-tooltip-dismissed': tooltipDismissed,
        'toolbar-button-tooltip-feedback': props.feedback
      }
    ]"
    type="button"
    :aria-label="props.label"
    :aria-keyshortcuts="props.shortcut"
    :disabled="props.disabled"
    @mousedown.prevent="onMouseDown"
    @mouseenter="onMouseEnter"
    @mouseleave="tooltipSuppressed = false"
    @focus="onFocus"
    @click="tooltipDismissed = false"
  >
    <i :class="props.icon" class="toolbar-button-icon" />
    <span v-if="props.label" ref="tooltipRef" class="toolbar-button-tooltip absolute flex items-center gap-2 px-2 py-1 rounded-md text-xs whitespace-nowrap pointer-events-none" aria-hidden="true">
      {{ props.label }}
      <kbd v-if="props.shortcut" class="toolbar-button-shortcut font-sans">{{ props.shortcut }}</kbd>
    </span>
  </button>
</template>

<script setup lang="ts">
import * as vue from 'vue';

import type { IToolbarButtonProps } from '../../common/vueCommon';

// A toolbar button, which shows an icon and, when hovered or focused using the keyboard, a tooltip with the button's
// label and, if any, keyboard shortcut.
// Note #1: a button with no label has no tooltip, which is useful for placeholder buttons (i.e. invisible buttons that
//          are only used to align the contents of a toolbar).
// Note #2: a small button is meant for places where space is tight (e.g., our main menu, see ThemeWidget.vue).
// Note #3: a tooltip is aligned with the start of its button, unless the button is in the end part of a toolbar or of
//          our main menu, or unless it is explicitly aligned with the end of its button (e.g., for a button that is on
//          the right edge of a dialog, see AboutDialog.vue).
// Note #4: a button doesn't get the focus when it is clicked (it still can using the keyboard). Otherwise, a dialog
//          opened by clicking the button would give the focus back to the button when closed, and the browser may then
//          consider that the button has the keyboard focus, making it look highlighted (i.e. with a focus ring and its
//          tooltip shown). However, a field that is being edited (e.g., one of our input widgets, which only commits
//          its value when it loses the focus) is blurred when the button is pressed, so that its value is committed
//          before the button does what it does (e.g., run a simulation with the value that was just entered), unless
//          the button is to keep the focus where it is (e.g., a button that discards the value being edited, see
//          SimulationExperimentInteractiveView.vue).
// Note #5: a button's tooltip is hidden once the button has been pressed, until the mouse leaves the button (or the
//          button gets the focus, i.e. using the keyboard, see Note #4), so that it doesn't get in the way of what the
//          button may have shown (e.g., a popover). However, a button can give some feedback using its tooltip (e.g.,
//          "Copied" for a button that copies something, see useCopyToClipboard() in vueCommon.ts), in which case its
//          tooltip is shown straightaway while the button is hovered.
// Note #6: a tooltip is shown below its button, unless there is not enough room below it, be it in the window or in an
//          ancestor that clips its contents (e.g., for a button at the bottom of a long list of runs, see
//          SimulationExperimentInteractiveView.vue), in which case it is shown above it (if there is enough room
//          there).
// Note #7: like a hint (see hint.ts), a tooltip can be dismissed by pressing Escape, be it shown or about to be shown
//          (including when it gives some feedback, see Note #5), in which case it isn't shown again until its button
//          is hovered, focused, or pressed anew (so that it can, for instance, give some feedback again). Escape is
//          otherwise left to do what it normally does (e.g., remove the keyboard focus, see OpenCOR.vue).

const TOOLTIP_OFFSET = 6; // Distance between our button and our tooltip (see .toolbar-button-tooltip below).
const TOOLTIP_MARGIN = 4; // Minimum distance between our tooltip and the edges of the window.

const props = defineProps<IToolbarButtonProps>();

const buttonRef = vue.useTemplateRef<HTMLButtonElement>('buttonRef');
const tooltipSuppressed = vue.ref<boolean>(false);
const tooltipDismissed = vue.ref<boolean>(false);
const tooltipAbove = vue.ref<boolean>(false);
const tooltipRef = vue.useTemplateRef<HTMLElement>('tooltipRef');

const onMouseDown = (): void => {
  tooltipSuppressed.value = true;

  // Blur the field that is being edited, if any, so that its value gets committed (see Note #4 above).

  const activeElement = document.activeElement;

  if (
    !props.keepFocus &&
    activeElement instanceof HTMLElement &&
    activeElement.matches('input, textarea, [contenteditable]:not([contenteditable="false"])')
  ) {
    activeElement.blur();
  }
};

const onMouseEnter = (event: MouseEvent): void => {
  tooltipDismissed.value = false;

  updateTooltipPosition(event);
};

const onFocus = (event: FocusEvent): void => {
  tooltipSuppressed.value = false;
  tooltipDismissed.value = false;

  updateTooltipPosition(event);
};

// Dismiss our tooltip, if any, when Escape is pressed while it is shown or about to be shown, i.e. while our button is
// hovered or has a focus ring (see Note #7 above).

const onWindowKeyDown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' && buttonRef.value?.matches(':hover, :focus-visible')) {
    tooltipDismissed.value = true;
  }
};

vue.onMounted(() => {
  window.addEventListener('keydown', onWindowKeyDown, true);
});

vue.onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeyDown, true);
});

const updateTooltipPosition = (event: Event): void => {
  const tooltip = tooltipRef.value;

  if (!tooltip) {
    return;
  }

  // Determine the area within which our tooltip can be seen, i.e. the window minus the parts that are clipped by any of
  // our ancestors (e.g., a card with hidden overflow, a scroll panel, or a splitter panel, see Note #6 above).

  const button = event.currentTarget as HTMLElement;
  const buttonRect = button.getBoundingClientRect();
  let visibleTop = TOOLTIP_MARGIN;
  let visibleBottom = window.innerHeight - TOOLTIP_MARGIN;

  for (let ancestor = button.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (getComputedStyle(ancestor).overflowY !== 'visible') {
      const ancestorRect = ancestor.getBoundingClientRect();

      visibleTop = Math.max(visibleTop, ancestorRect.top);
      visibleBottom = Math.min(visibleBottom, ancestorRect.bottom);
    }
  }

  tooltipAbove.value =
    buttonRect.bottom + TOOLTIP_OFFSET + tooltip.offsetHeight > visibleBottom &&
    buttonRect.top - TOOLTIP_OFFSET - tooltip.offsetHeight >= visibleTop;
};
</script>

<style scoped>
.toolbar-button {
  --toolbar-button-color: var(--p-text-muted-color);
  --toolbar-button-hover-color: var(--p-text-color);

  border: none;
  background-color: transparent;
  color: var(--toolbar-button-color);
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    transform 0.1s ease;
}

.toolbar-button-primary {
  --toolbar-button-color: var(--p-primary-color);
  --toolbar-button-hover-color: var(--p-primary-color);
}

.toolbar-button-warning {
  --toolbar-button-color: var(--opencor-warn-color);
  --toolbar-button-hover-color: var(--opencor-warn-color);
}

.toolbar-button-danger {
  --toolbar-button-color: var(--opencor-error-color);
  --toolbar-button-hover-color: var(--opencor-error-color);
}

.toolbar-button-icon {
  font-size: 1.125rem;
}

.toolbar-button-small .toolbar-button-icon {
  font-size: 0.875rem;
}

.toolbar-button:not(:disabled):hover {
  background-color: var(--p-content-hover-background);
  color: var(--toolbar-button-hover-color);
}

.toolbar-button-primary:not(:disabled):hover,
.toolbar-button-warning:not(:disabled):hover,
.toolbar-button-danger:not(:disabled):hover {
  background-color: color-mix(in srgb, var(--toolbar-button-color) 12%, transparent);
}

.toolbar-button:not(:disabled):active {
  transform: scale(0.92);
}

.toolbar-button:focus-visible {
  box-shadow: 0 0 0 2px var(--p-primary-color);
}

/**
 * Note: we only fade the icon of a disabled button since fading the button itself would also fade its tooltip.
 */

.toolbar-button:disabled {
  color: var(--p-text-muted-color);
  cursor: default;
}

.toolbar-button:disabled .toolbar-button-icon {
  opacity: 0.4;
}

/**
 * Tooltip, which is shown below the button (or above it, see Note #6 above), without any animation, after a short delay
 * when the button is hovered, and straightaway when the button is focused using the keyboard. It is left-aligned with
 * the button, except in the end part of a toolbar or of our main menu where it is right-aligned, so that it doesn't
 * extend beyond the edges of the toolbar or main menu.
 */

.toolbar-button-tooltip {
  top: calc(100% + 0.375rem);
  left: 0;
  z-index: 1000;
  border: 1px solid var(--opencor-hint-border-color);
  background-color: var(--opencor-hint-background);
  box-shadow: var(--opencor-overlay-shadow);
  color: var(--opencor-hint-color);
  font-weight: 500;
  visibility: hidden;
}

.toolbar-button-tooltip-above .toolbar-button-tooltip {
  top: auto;
  bottom: calc(100% + 0.375rem);
}

.p-toolbar-end .toolbar-button-tooltip,
.p-menubar-end .toolbar-button-tooltip,
.toolbar-button-tooltip-end .toolbar-button-tooltip {
  right: 0;
  left: auto;
}

.toolbar-button:hover .toolbar-button-tooltip {
  visibility: visible;
  transition: visibility 0s 0.5s;
}

.toolbar-button:focus-visible .toolbar-button-tooltip {
  visibility: visible;
  transition: none;
}

.toolbar-button:active .toolbar-button-tooltip,
.toolbar-button.toolbar-button-tooltip-suppressed .toolbar-button-tooltip,
.toolbar-button.toolbar-button-tooltip-dismissed .toolbar-button-tooltip {
  visibility: hidden;
  transition: none;
}

.toolbar-button.toolbar-button-tooltip-feedback:not(.toolbar-button-tooltip-dismissed):hover .toolbar-button-tooltip {
  visibility: visible;
  transition: none;
}

.toolbar-button-shortcut {
  color: var(--opencor-hint-muted-color);
  font-size: inherit;
}
</style>
