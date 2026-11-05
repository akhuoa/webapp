<template>
  <div ref="rootRef" v-if="possibleValues" @pointerdown.capture="onInteractionStart" @keydown.capture="onInteractionStart">
    <FloatLabel variant="on">
      <Select
        v-model="discreteValue"
        :options="possibleValues"
        optionLabel="name"
        @change="selectChange"
        :appendTo="appendTarget"
        class="w-full"
        :class="{ 'resettable-select': defaultPossibleValue }"
        size="small"
      />
      <label>{{ name }}</label>
      <button v-if="defaultPossibleValue" class="select-reset-button"
        :class="atDefaultValue ? 'cursor-default p-disabled' : 'cursor-pointer'"
        type="button"
        :disabled="atDefaultValue"
        :tabindex="-1"
        :title="`Reset to ${defaultPossibleValue.name}`"
        @mousedown.prevent
        @click="selectReset"
      >
        <i class="pi pi-undo"></i>
      </button>
    </FloatLabel>
  </div>
  <div ref="rootRef" v-else
    @pointerdown.capture="onInteractionStart"
    @keydown.capture="onInteractionStart"
    @wheel.capture="onWheelInteraction"
  >
    <InputScientificNumberWidget ref="inputScientificNumberWidgetRef" v-model="value"
      :label="name"
      :defaultValue="defaultValue"
      :min="minimumValue"
      :max="maximumValue"
      :step="compStepValue"
      size="small"
      @update:model-value="inputTextValueUpdated"
      @atDefaultValueChange="(atDefaultValue: boolean) => emit('atDefaultValueChange', name, atDefaultValue)"
    />
    <div class="slider relative mt-3"
      @mousedown.capture="onSliderMouseDown"
      @dblclick="onSliderDoubleClick">
      <Slider v-model="value" class="w-full"
        :min="minimumValue" :max="maximumValue" :step="compStepValue"
        size="small"
        @change="sliderChange"
      />
      <span v-if="defaultValuePercentage !== undefined" class="slider-default-tick"
        :style="{ insetInlineStart: `${defaultValuePercentage}%` }"
      ></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as vue from 'vue';

import { LONG_DELAY } from '../../common/constants';
import * as vueCommon from '../../common/vueCommon';
import type * as locApi from '../../libopencor/locApi';

import InputScientificNumberWidget from './InputScientificNumberWidget.vue';

const value = defineModel<number>({ required: true });

const props = defineProps<{
  defaultValue?: number;
  maximumValue?: number;
  minimumValue?: number;
  name: string;
  possibleValues?: locApi.IUiJsonDiscreteInputPossibleValue[];
  stepValue?: number;
}>();

const emit = defineEmits<{
  atDefaultValueChange: [name: string, atDefaultValue: boolean];
  change: [name: string, newValue: number];
  changeEnd: [name: string];
}>();

let oldValue = value.value;
const discreteValue = vue.ref<locApi.IUiJsonDiscreteInputPossibleValue | undefined>(
  props.possibleValues?.find((possibleValue) => possibleValue.value === value.value)
);
const rootRef = vue.shallowRef<HTMLElement | null>(null);
const inputScientificNumberWidgetRef = vue.ref<InstanceType<typeof InputScientificNumberWidget> | null>(null);
const appendTarget = vueCommon.useAppendTarget(rootRef);
const defaultPossibleValue = vue.computed<locApi.IUiJsonDiscreteInputPossibleValue | undefined>(() => {
  return props.possibleValues?.find((possibleValue) => possibleValue.value === props.defaultValue);
});
const atDefaultValue = vue.computed<boolean>(() => {
  return discreteValue.value?.value === props.defaultValue;
});
const defaultValuePercentage = vue.computed<number | undefined>(() => {
  // Make sure that we have a default value and minimum and maximum values, and that our maximum value is greater than
  // our minimum value, so that we can compute the percentage of our default value between our minimum and maximum
  // values.

  if (
    props.defaultValue === undefined ||
    props.minimumValue === undefined ||
    props.maximumValue === undefined ||
    props.maximumValue <= props.minimumValue
  ) {
    return undefined;
  }

  // Return the percentage of our default value between our minimum and maximum values, clamped to [0, 100] so that our
  // default value tick can never be outside of our slider.
  // Note: our default value should always be between our minimum and maximum values since our UI JSON gets validated
  //       (and we are not shown if it has issues), but we don't rely on it.

  const percentage = (100 * (props.defaultValue - props.minimumValue)) / (props.maximumValue - props.minimumValue);

  return Math.min(Math.max(percentage, 0), 100);
});

const compStepValue = vue.computed<number>(() => {
  if (props.stepValue !== undefined) {
    return props.stepValue;
  }

  if (props.maximumValue !== undefined && props.minimumValue !== undefined) {
    return 0.01 * (props.maximumValue - props.minimumValue);
  }

  return 1;
});

vue.watch(
  () => value.value,
  (newValue) => {
    oldValue = newValue;

    if (props.possibleValues) {
      discreteValue.value = props.possibleValues.find((pv) => pv.value === newValue);
    }
  },
  { immediate: true }
);

// Keep track of whether the user is interacting with us (e.g., dragging our slider, holding one of our spin buttons, or
// holding an arrow key), so that we can let our owner know when a change is final, i.e. when it is not made during an
// interaction (e.g., selecting a value, entering a value, or clicking on our slider bar) or when the interaction during
// which it was made has ended (see emitChange()).
// Note #1: an interaction may end outside of us (e.g., our slider being released outside of us or the Enter key moving
//          the focus away from our input), hence we listen to the window for the end of an interaction.
// Note #2: an interaction started using a pointer only ends when that pointer is released (or cancelled, e.g., when the
//          browser takes over a touch gesture), so that, for instance, releasing a modifier key while dragging our
//          slider doesn't end it. An interaction started using the keyboard ends when any key is released since a key
//          may not get reported as released. Either way, an interaction ends when the window loses the focus.
// Note #3: a pointer interaction takes over an interaction started using the keyboard (e.g., pressing a modifier key in
//          our input and then dragging our slider), so that the latter doesn't end when that key gets released, i.e.
//          while our slider is still being dragged.
// Note #4: spinning our input using the mouse wheel is also an interaction, which ends once no wheel event has been
//          received for a little while (since there is no event to tell us that the user has stopped using the mouse
//          wheel). Like an interaction started using the keyboard, it can be taken over by a pointer interaction.

let interacting = false;
let interactionPointerId: number | null = null;
let wheelInteractionTimer: number | null = null;
let changedWhileInteracting = false;

const clearWheelInteractionTimer = (): void => {
  if (wheelInteractionTimer !== null) {
    window.clearTimeout(wheelInteractionTimer);

    wheelInteractionTimer = null;
  }
};

const removeInteractionListeners = (): void => {
  window.removeEventListener('pointerup', onPointerInteractionEnd);
  window.removeEventListener('pointercancel', onPointerInteractionEnd);
  window.removeEventListener('keyup', onInteractionEnd);
  window.removeEventListener('blur', onInteractionEnd);
};

const onInteractionStart = (event: PointerEvent | KeyboardEvent): void => {
  const isPointerEvent = event instanceof PointerEvent;

  if (interacting) {
    if (!isPointerEvent || interactionPointerId !== null) {
      return;
    }

    onInteractionEnd();
  }

  interacting = true;

  if (isPointerEvent) {
    interactionPointerId = event.pointerId;

    window.addEventListener('pointerup', onPointerInteractionEnd);
    window.addEventListener('pointercancel', onPointerInteractionEnd);
  } else {
    interactionPointerId = null;

    window.addEventListener('keyup', onInteractionEnd);
  }

  window.addEventListener('blur', onInteractionEnd);
};

const onWheelInteraction = (event: WheelEvent): void => {
  // Make sure that the wheel event may spin our input, i.e. that it is received while our input has the focus (see
  // InputScientificNumberWidget's onWheel()).

  if (!(event.target instanceof HTMLInputElement) || event.target !== document.activeElement) {
    return;
  }

  // Make sure that we don't interfere with a pointer or keyboard interaction.

  if (interacting && wheelInteractionTimer === null) {
    return;
  }

  // Start a wheel interaction, if needed, and (re)start the timer that will end it.
  // Note: as for a keyboard interaction, we set interactionPointerId to null, which allows a pointer interaction to
  //       take over our wheel interaction (see onInteractionStart()).

  if (!interacting) {
    interacting = true;
    interactionPointerId = null;

    window.addEventListener('blur', onInteractionEnd);
  }

  clearWheelInteractionTimer();

  wheelInteractionTimer = window.setTimeout(onInteractionEnd, LONG_DELAY);
};

const onPointerInteractionEnd = (event: PointerEvent): void => {
  if (event.pointerId === interactionPointerId) {
    onInteractionEnd();
  }
};

const onInteractionEnd = (): void => {
  removeInteractionListeners();
  clearWheelInteractionTimer();

  interacting = false;
  interactionPointerId = null;

  if (changedWhileInteracting) {
    changedWhileInteracting = false;

    // Note: we emit our changeEnd event in the next tick so that it gets emitted after any pending change event (see
    //       emitChange()).

    void vue.nextTick().then(() => {
      emit('changeEnd', props.name);
    });
  }
};

vue.onBeforeUnmount(() => {
  removeInteractionListeners();
  clearWheelInteractionTimer();
});

// Some methods to handle a scalar value using an input component and a slider.

const emitChange = (newValue: number) => {
  const changeIsFinal = !interacting;

  if (!changeIsFinal) {
    changedWhileInteracting = true;
  }

  void vue.nextTick().then(() => {
    value.value = newValue;

    oldValue = newValue;

    emit('change', props.name, newValue);

    if (changeIsFinal) {
      emit('changeEnd', props.name);
    }
  });
};

interface ISelectChangeEvent {
  value: {
    name: string;
    value: number;
  };
}

const selectChange = (event: ISelectChangeEvent) => {
  if (event.value.value !== oldValue) {
    emitChange(event.value.value);
  }
};

const selectReset = () => {
  if (defaultPossibleValue.value && defaultPossibleValue.value.value !== oldValue) {
    discreteValue.value = defaultPossibleValue.value;

    emitChange(defaultPossibleValue.value.value);
  }
};

const discardEdit = () => {
  inputScientificNumberWidgetRef.value?.discardEdit();
};

defineExpose({
  discardEdit
});

const inputTextValueUpdated = (newValue: number | undefined) => {
  if (newValue !== undefined && newValue !== oldValue) {
    emitChange(newValue);
  }
};

const sliderChange = (newValue: number | number[]) => {
  const valueToEmit = Array.isArray(newValue) ? newValue[0] : newValue;

  if (valueToEmit !== undefined && valueToEmit !== oldValue) {
    emitChange(valueToEmit);
  }
};

// Reset our scalar value when double-clicking on our slider's handle.
// Note: the first click of a double click on our slider's bar moves our slider's handle under the mouse pointer, so we
//       only reset our scalar value if the double click started on our slider's handle.

let sliderDoubleClickStartedOnHandle = false;

const isSliderHandle = (target: EventTarget | null): boolean => {
  return target instanceof Element && target.closest('.p-slider-handle') !== null;
};

const onSliderMouseDown = (event: MouseEvent) => {
  if (event.detail === 1) {
    sliderDoubleClickStartedOnHandle = isSliderHandle(event.target);
  }
};

const onSliderDoubleClick = (event: MouseEvent) => {
  if (
    sliderDoubleClickStartedOnHandle &&
    isSliderHandle(event.target) &&
    props.defaultValue !== undefined &&
    props.defaultValue !== oldValue
  ) {
    emitChange(props.defaultValue);
  }
};
</script>

<style scoped>
/**
 * Our drop-down button is as wide as the spin buttons of InputScientificNumberWidget and, like them, is separated from
 * our value by a divider.
 */

.resettable-select :deep(.p-select-dropdown) {
  position: relative;
  width: 1.5rem;
}

.resettable-select :deep(.p-select-dropdown::before) {
  content: '';
  position: absolute;
  inset-block: 25%;
  inset-inline-start: 0;
  border-inline-start: 1px solid var(--p-form-field-border-color);
}

.resettable-select :deep(.p-select-label) {
  padding-inline-end: 1.5rem;
}

/**
 * Our reset button, which looks like the one of InputScientificNumberWidget and, like it, is only shown when our value
 * is not our default value.
 */

.select-reset-button {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-end: calc(1.75rem + 1px);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 4px;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  transform: translateY(-50%);
  transition:
    background-color 0.15s,
    color 0.15s,
    opacity 0.15s,
    transform 0.15s;
}

.select-reset-button:not(.p-disabled):hover {
  background-color: var(--p-button-text-secondary-hover-background);
  color: var(--p-text-color);
}

.select-reset-button.p-disabled {
  opacity: 0;
  transform: translateY(-50%) scale(0.5);
}

.select-reset-button .pi {
  font-size: inherit;
}

/**
 * The tick that shows our default value on our slider, between our slider's range and its handle.
 */

.slider :deep(.p-slider-handle) {
  z-index: 2;
}

.slider-default-tick {
  position: absolute;
  inset-block-start: 50%;
  z-index: 1;
  width: 2px;
  height: 0.625rem;
  border-radius: 1px;
  background-color: var(--p-text-muted-color);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .select-reset-button {
    transition: none;
  }
}
</style>
