<template>
  <BaseDialog header="Changelog" class="w-169">
    <ChangelogComponent v-if="entries.length" class="changelog-list" :entries="entries" />
    <div v-else class="changelog-empty">
      <i class="pi pi-info-circle" />
      <span>No changelog is available.</span>
    </div>
    <template #footer>
      <Button label="OK" autofocus @click="$emit('close')" />
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { changelog } from '../../common/changelog';

defineEmits<{
  close: [];
}>();

const entries = changelog();
</script>

<style scoped>
.changelog-list {
  max-height: 60vh;
  overflow-y: auto;
  font-size: 0.875rem;
  scrollbar-width: thin;
  scrollbar-color: var(--opencor-scrollbar-color) transparent;
}

.changelog-empty {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.25rem 0 0.5rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}
</style>
