<template>
  <div class="space-y-4">
    <div v-for="entry in entries" :key="entry.version" class="space-y-1.5">
      <div class="font-bold">Version {{ entry.version }}</div>
      <ul class="space-y-1 ml-2">
        <li v-for="(change, index) in entry.changes" :key="index" class="flex items-start gap-2">
          <span class="change-type shrink-0 inline-flex items-center rounded-full" :class="`change-type-${change.type}`"
            :title="CHANGE_TYPE_LABELS[change.type]"
          >
            <i :class="`pi ${CHANGE_TYPE_ICONS[change.type]}`" />
          </span>
          <span>{{ change.description }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { IOpenCORChangelogEntry, OpenCORChangelogChangeType } from '../../index';

defineProps<{
  entries: IOpenCORChangelogEntry[];
}>();

const CHANGE_TYPE_LABELS: Record<OpenCORChangelogChangeType, string> = {
  added: 'Added',
  removed: 'Removed',
  improved: 'Improved',
  fixed: 'Fixed'
};

const CHANGE_TYPE_ICONS: Record<OpenCORChangelogChangeType, string> = {
  added: 'pi-plus-circle',
  removed: 'pi-minus-circle',
  improved: 'pi-arrow-circle-up',
  fixed: 'pi-wrench'
};
</script>

<style scoped>
.change-type {
  justify-content: center;
  width: 1.375rem;
  height: 1.375rem;
  margin-top: 0.0625rem;
  border: 1px solid;
}

.change-type .pi {
  font-size: 0.75rem;
}

.change-type-added {
  background-color: var(--p-message-success-background);
  border-color: var(--p-message-success-border-color);
  color: var(--p-message-success-color);
}

.change-type-removed {
  background-color: var(--p-message-error-background);
  border-color: var(--p-message-error-border-color);
  color: var(--p-message-error-color);
}

.change-type-improved {
  background-color: var(--p-message-info-background);
  border-color: var(--p-message-info-border-color);
  color: var(--p-message-info-color);
}

.change-type-fixed {
  background-color: var(--p-message-warn-background);
  border-color: var(--p-message-warn-border-color);
  color: var(--p-message-warn-color);
}
</style>
