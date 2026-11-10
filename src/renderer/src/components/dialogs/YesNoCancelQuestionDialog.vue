<template>
  <BaseDialog :header="title" class="w-120">
    <div class="message-dialog" :class="`message-dialog-${severity}`">
      <span class="message-dialog-icon">
        <i :class="ICONS[severity]" />
      </span>
      <div class="message-dialog-text" v-html="question"></div>
    </div>
    <template #footer>
      <Button autofocus
        :label="yesLabel"
        :severity="severity === 'danger' ? 'danger' : undefined"
        @click="$emit('yes')"
      />
      <Button :label="noLabel" severity="secondary" @click="$emit('no')" />
      <Button :label="cancelLabel" severity="secondary" @click="$emit('cancel')" />
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
// Note: our message dialog styles (see message-dialog.css) are included in our global styles, which live in our shadow
//       root (see src/assets/app.css).

type Severity = 'danger' | 'warning' | 'info';

// Note: same as for YesNoQuestionDialog.vue when it comes to the labels of our buttons and the colour of our yes
//       button.

withDefaults(
  defineProps<{
    title: string;
    question: string;
    severity?: Severity;
    yesLabel?: string;
    noLabel?: string;
    cancelLabel?: string;
  }>(),
  {
    severity: 'warning',
    yesLabel: 'Yes',
    noLabel: 'No',
    cancelLabel: 'Cancel'
  }
);

defineEmits<{
  yes: [];
  no: [];
  cancel: [];
}>();

const ICONS: Record<Severity, string> = {
  danger: 'pi pi-exclamation-triangle',
  warning: 'pi pi-exclamation-triangle',
  info: 'pi pi-question-circle'
};
</script>
