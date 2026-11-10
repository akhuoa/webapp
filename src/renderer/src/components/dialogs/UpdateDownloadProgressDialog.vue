<template>
  <BaseDialog :header="installing ? 'Installing Update' : 'Downloading Update'" class="w-120" :closable="false" :closeOnEscape="false">
    <div class="download">
      <div class="download-header">
        <span class="opencor-spinner" />
        <span class="download-text">{{ text }}</span>
        <span v-if="!installing" class="download-percent">{{ Math.floor(percent) }}%</span>
      </div>
      <ProgressBar class="download-progress-bar"
        :showValue="false"
        :value="installing ? 100 : percent"
        :pt="{
          value: {
            style: 'transition: none'
          }
        }"
      />
      <div class="download-details">{{ details }}</div>
    </div>
  </BaseDialog>
</template>

<script setup lang="ts">
import * as vue from 'vue';

// The progress of the download of an update and then of its installation.
// Note: the version of the update is not known if OpenCOR has been reloaded while the update was being downloaded (see
//       onUpdateDownloadProgress() in OpenCOR.vue), and the size of the update is not known until we get the first
//       progress report. We only mention them once they are known.

const props = defineProps<{
  version: string;
  percent: number;
  transferred: number;
  total: number;
  installing: boolean;
}>();

const update = vue.computed<string>(() => {
  return props.version ? `OpenCOR ${props.version}` : 'the update';
});

const text = vue.computed<string>(() => {
  return props.installing ? `Installing ${update.value}...` : `Downloading ${update.value}...`;
});

// Format the given size (in bytes) in megabytes.
// Note #1: a megabyte is 1,000,000 bytes (rather than 1,048,576 bytes, i.e. a mebibyte), as on macOS and on most
//          download pages.
// Note #2: the total size is that of what needs to be downloaded, which may be smaller than the size of the update
//          (e.g., on its release page) if only the parts that have changed since our current version need to be
//          downloaded (i.e. a differential download, which electron-updater may do on all platforms).

const formatSize = (size: number): string => {
  return `${(size / 1000 ** 2).toFixed(1)} MB`;
};

const details = vue.computed<string>(() => {
  return !props.installing && props.total
    ? `${formatSize(props.transferred)} of ${formatSize(props.total)}`
    : 'OpenCOR will restart once the update has been installed.';
});
</script>

<style scoped>
.download {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  margin-bottom: 1.25rem;
}

.download-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 0;
}

.download-text {
  flex-grow: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 0.875rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.download-percent {
  flex-shrink: 0;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}

.download-progress-bar {
  height: 0.375rem;
}

.download-details {
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}
</style>
