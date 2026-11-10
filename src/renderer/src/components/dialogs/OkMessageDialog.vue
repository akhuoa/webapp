<template>
  <BaseDialog :header="title" class="w-120">
    <div class="message-dialog" :class="`message-dialog-${severity}`">
      <span class="message-dialog-icon">
        <i :class="ICONS[severity]" />
      </span>
      <div v-if="$slots.default" class="message-dialog-text">
        <slot />
      </div>
      <div v-else class="message-dialog-text" v-html="message"></div>
    </div>
    <template #footer>
      <Button autofocus label="OK" @click="$emit('ok')" />
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
// Note: our message dialog styles (see message-dialog.css) are included in our global styles, which live in our shadow
//       root (see src/assets/app.css).

type Severity = 'info' | 'success' | 'warning' | 'danger';

// Note: our message is either given as some (HTML) text, using our message property, or as some content (e.g., a list),
//       using our default slot, in which case our message property is ignored.

defineEmits<{
  ok: [];
}>();

withDefaults(
  defineProps<{
    title: string;
    message?: string;
    severity?: Severity;
  }>(),
  {
    message: '',
    severity: 'info'
  }
);

const ICONS: Record<Severity, string> = {
  info: 'pi pi-info-circle',
  success: 'pi pi-check-circle',
  warning: 'pi pi-exclamation-triangle',
  danger: 'pi pi-times-circle'
};
</script>
