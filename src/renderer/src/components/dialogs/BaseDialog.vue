<template>
  <!--
  Note: our mask covers the whole of OpenCOR (which may not cover the whole window, e.g., if it is embedded in a page),
        so it is a container (named opencor-dialog) that can be queried to know whether our dialog should use a narrow
        layout (see, for instance, AboutDialog.vue).
  -->
  <Dialog ref="dialogRef" :modal="true" appendTo="self"
    :pt:mask:style="{
      position: 'absolute',
      containerType: 'inline-size',
      containerName: 'opencor-dialog'
    }"
    :pt:content="{
      class: 'h-full',
      style: 'padding-bottom: 0'
    }"
    :pt:footer="{
      style: 'padding-top: 20px'
    }"
    :pt:transition="{ css: false }"
    @show="onShow"
    @hide="onHide"
  >
    <template v-for="(_event, slot) of $slots" #[slot]="scope">
      <slot :name="slot" v-bind="scope" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import type Dialog from 'primevue/dialog';
import * as vue from 'vue';

const props = defineProps<{
  centreOn?: HTMLElement | null;
}>();

const emit = defineEmits<{
  cancel: [];
}>();

const { incrementDialogs, decrementDialogs } = useDialogState();

// Note: PrimeVue's Dialog keeps track of its container (i.e. our dialog) and of its mask, so we retrieve them from it
//       rather than look for them in the DOM, which could otherwise find the dialog of another instance of OpenCOR on
//       the same page.

const dialogRef = vue.shallowRef<
  (InstanceType<typeof Dialog> & { container: HTMLElement | null; mask: HTMLElement | null }) | null
>(null);

let dialogElement: HTMLElement | null = null;
let containerElement: HTMLElement | null = null;
let mutationObserver: MutationObserver | null = null;
let shown = false;

const checkDialogPosition = () => {
  // Make sure that our dialog remains within the requested element, if any, or within our mask (i.e., within the whole
  // of OpenCOR) if no element is requested.

  if (dialogElement instanceof HTMLElement && containerElement instanceof HTMLElement) {
    const dialogRect = dialogElement.getBoundingClientRect();
    const boundsRect = (props.centreOn ?? containerElement).getBoundingClientRect();

    dialogElement.style.top = `${Math.max(Math.min(dialogRect.top, boundsRect.bottom - dialogRect.height), boundsRect.top)}px`;
    dialogElement.style.left = `${Math.max(Math.min(dialogRect.left, boundsRect.right - dialogRect.width), boundsRect.left)}px`;
  }
};

const centreDialog = () => {
  // Centre our dialog over the requested element, if any, or over our mask (i.e., over the whole of OpenCOR) if no
  // element is requested.
  // Note: our dialog is centred within the padding box of our mask, so we pad our mask so that its padding box matches
  //       the requested element. We use !important since our mask may otherwise be padded (see .with-main-menu in
  //       OpenCOR.vue).

  if (props.centreOn && containerElement instanceof HTMLElement) {
    const containerRect = containerElement.getBoundingClientRect();
    const centreOnRect = props.centreOn.getBoundingClientRect();
    const paddingTop = Math.max(0, centreOnRect.top - containerRect.top);
    const paddingRight = Math.max(0, containerRect.right - centreOnRect.right);
    const paddingBottom = Math.max(0, containerRect.bottom - centreOnRect.bottom);
    const paddingLeft = Math.max(0, centreOnRect.left - containerRect.left);

    containerElement.style.setProperty(
      'padding',
      `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px`,
      'important'
    );
  }
};

const disconnectMutationObserver = () => {
  if (mutationObserver) {
    mutationObserver.disconnect();

    mutationObserver = null;
  }
};

const onShow = () => {
  shown = true;

  incrementDialogs();

  void vue.nextTick().then(() => {
    if (!shown) {
      return;
    }

    dialogElement = dialogRef.value?.container ?? null;
    containerElement = dialogRef.value?.mask ?? null;

    if (dialogElement && containerElement) {
      centreDialog();

      mutationObserver = new MutationObserver(() => {
        checkDialogPosition();
      });

      mutationObserver.observe(dialogElement, { attributes: true, attributeFilter: ['style'] });

      checkDialogPosition();
    }
  });
};

const onHide = () => {
  if (shown) {
    shown = false;

    decrementDialogs();
  }

  emit('cancel');

  void vue.nextTick().then(() => {
    disconnectMutationObserver();
  });
};

// Make sure that we are no longer accounted for in our dialog state if we get unmounted while being shown (e.g., if the
// file tab that contains us gets closed), since our dialog doesn't emit a hide event in that case. Otherwise, our UI
// would remain disabled forever (see compUiEnabled in OpenCOR.vue).

vue.onBeforeUnmount(() => {
  if (shown) {
    shown = false;

    decrementDialogs();
  }

  disconnectMutationObserver();
});
</script>

<script lang="ts">
// Dialog state management for tracking active dialogs in a given instance of OpenCOR.
// Note: this uses Vue's provide()/inject() methods to ensure that each OpenCOR instance has its own dialog state.

const DialogStateKey = Symbol('DialogState');

interface IDialogState {
  activeDialogs: vue.Ref<number>;
  isDialogActive: vue.ComputedRef<boolean>;
  incrementDialogs: () => void;
  decrementDialogs: () => void;
}

export const provideDialogState = (): IDialogState => {
  const activeDialogs = vue.ref(0);
  const isDialogActive = vue.computed<boolean>(() => {
    return activeDialogs.value > 0;
  });

  const incrementDialogs = () => {
    ++activeDialogs.value;
  };

  const decrementDialogs = () => {
    --activeDialogs.value;
  };

  const state: IDialogState = {
    activeDialogs,
    isDialogActive,
    incrementDialogs,
    decrementDialogs
  };

  vue.provide(DialogStateKey, state);

  return state;
};

export const useDialogState = (): IDialogState => {
  const state = vue.inject<IDialogState>(DialogStateKey);

  if (!state) {
    throw new Error('useDialogState() must be called within a component that has provideDialogState in its ancestor tree.');
  }

  return state;
}
</script>
