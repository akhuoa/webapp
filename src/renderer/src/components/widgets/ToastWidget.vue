<script lang="ts">
import Toast from 'primevue/toast';
import * as vue from 'vue';

// This component is a wrapper around PrimeVue's Toast. It renders its toasts where it is used rather than in the host
// document's body. Indeed, PrimeVue's Toast always teleports its toasts to the body (it doesn't have an appendTo prop),
// which would put them outside of our shadow root, i.e. where our styles don't apply and where a host application's
// styles would.
// Note: this implementation is based on version 4.2.5 of PrimeVue, which is the version we are using in OpenCOR. If we
//       upgrade to a newer version of PrimeVue, we should check that PrimeVue's Toast still uses its Portal component to
//       teleport its toasts.

const InlinePortal = vue.defineComponent({
  name: 'InlinePortal',
  setup: (_props, { slots }) => {
    return () => slots.default?.();
  }
});

type ToastComponent = vue.DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown> & {
  components?: Record<string, vue.Component>;
};

export default vue.defineComponent({
  extends: Toast as unknown as ToastComponent,
  components: {
    ...(Toast as unknown as ToastComponent).components,
    Portal: InlinePortal
  }
});
</script>
