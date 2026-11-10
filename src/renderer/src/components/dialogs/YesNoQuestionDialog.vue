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
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
// Note: our message dialog styles (see message-dialog.css) are included in our global styles, which live in our shadow
//       root (see src/assets/app.css).

type Severity = 'danger' | 'warning' | 'info';

// Note #1: our buttons should preferably be labelled with what they do (e.g., "Reset All" and "Cancel") rather than
//          with "Yes" and "No", so that the user doesn't have to read our question to know what they do.
// Note #2: our yes button is only coloured (in red) if our question is about something dangerous (e.g., disconnecting
//          from GitHub). Otherwise (i.e. for some information or a warning, such as being asked whether to save a
//          modified file), it is a primary button since it is what the user is expected to do.

withDefaults(
  defineProps<{
    title: string;
    question: string;
    severity?: Severity;
    yesLabel?: string;
    noLabel?: string;
  }>(),
  {
    severity: 'warning',
    yesLabel: 'Yes',
    noLabel: 'No'
  }
);

defineEmits<{
  yes: [];
  no: [];
}>();

const ICONS: Record<Severity, string> = {
  danger: 'pi pi-exclamation-triangle',
  warning: 'pi pi-exclamation-triangle',
  info: 'pi pi-question-circle'
};
</script>
