<template>
  <div class="blocking-message" role="status" aria-live="polite">
    <div class="blocking-message-header">
      <span class="opencor-spinner" />
      <span class="blocking-message-text">{{ message }}</span>
      <span v-if="progress !== undefined" class="blocking-message-progress" aria-hidden="true">{{ Math.round(progress) }}%</span>
    </div>
    <ProgressBar v-if="progress !== undefined" class="blocking-message-progress-bar"
      :value="progress"
      :showValue="false"
      :pt="{
        value: {
          style: 'transition: none'
        }
      }"
    />
  </div>
</template>

<script setup lang="ts">
// A message that is shown while OpenCOR (or part of it) is blocked, e.g., while it is being initialised or while a
// model is being loaded, with the progress made, if known.
// Note: we are a live region, so that a change to our message gets announced by assistive technologies (whether the
//       message we are first shown with gets announced depends on the assistive technology since a live region is only
//       reliably announced when its contents change), but not our progress (which would otherwise get announced each
//       time it changes), which is available through our progress bar.

defineProps<{
  message: string;
  progress?: number;
}>();
</script>

<style scoped>
/**
 * Note: we may be shown in a small container (e.g., when OpenCOR is embedded in a page alongside other OpenCOR
 *       instances), so we never get wider than our container and our message gets truncated if needed.
 */

.blocking-message {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  width: max-content;
  min-width: min(16rem, calc(100% - 1rem));
  max-width: min(24rem, calc(100% - 1rem));
  padding: 0.75rem 1rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.75rem;
  background-color: var(--p-content-background);
  box-shadow: var(--opencor-card-shadow);
  color: var(--p-text-color);
  transform: translate(-50%, -50%);
}

.blocking-message-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 0;
}

.blocking-message-text {
  flex-grow: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 0.875rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.blocking-message-progress {
  flex-shrink: 0;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.blocking-message-progress-bar {
  height: 0.25rem;
}
</style>
