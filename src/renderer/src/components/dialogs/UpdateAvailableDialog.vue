<template>
  <BaseDialog header="Update Available" class="w-160"
    :closeButtonProps="{ severity: 'secondary', text: true, rounded: true, disabled: reloading }"
    :closeOnEscape="!reloading"
    @show="onShow"
  >
    <div class="update">
      <!-- Version -->

      <div class="update-version">
        <span class="update-version-icon">
          <i class="pi pi-arrow-circle-up" />
        </span>
        <span class="min-w-0">
          <span class="update-version-title">OpenCOR <span class="update-version-badge">{{ version }}</span> is available</span>
          <span class="update-version-current">You are using version {{ currentVersion }}.</span>
        </span>
      </div>

      <!-- What's new -->

      <section v-if="fetching || entries === null || entries.length" class="update-changes">
        <div class="opencor-section-title">What's new</div>
        <div class="update-changes-box opencor-panel">
          <div v-if="fetching" class="update-changes-message">
            <span class="opencor-spinner update-spinner" />
            <span>Retrieving the changes...</span>
          </div>
          <div v-else-if="entries === null" class="update-changes-message">The changes could not be retrieved.</div>
          <ChangelogComponent v-else :entries="entries" />
        </div>
      </section>

      <!-- Note -->

      <div class="update-note">
        <i class="pi pi-info-circle update-note-icon" />
        <span v-if="electronApi">
          OpenCOR will download and install the update, and then restart. Once the update has been downloaded, you will be asked whether to save the files that have been modified, if any.
        </span>
        <span v-else>
          Reloading OpenCOR will apply the update. You will first be asked whether to save the files that have been modified, if any.
        </span>
      </div>
    </div>
    <template #footer>
      <template v-if="electronApi">
        <Button label="Download and Install" autofocus @click="$emit('downloadAndInstall')" />
        <Button label="Later" severity="secondary" @click="$emit('close')" />
      </template>
      <template v-else>
        <Button :label="reloading ? 'Reloading...' : 'Reload'" autofocus :loading="reloading" @click="$emit('reload')" />
        <Button label="Later" severity="secondary" :disabled="reloading" @click="$emit('close')" />
      </template>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import * as vue from 'vue';

import type { IOpenCORChangelogEntry } from '../../../index';

import { fetchChangelog } from '../../common/changelog';
import { electronApi } from '../../common/electronApi';
import { currentVersion } from '../../common/version';

// Note: in OpenCOR's Web app, we let OpenCOR know that the user wants to reload it, and OpenCOR lets us know whether it
//       is reloading (e.g., it isn't if the user cancels saving the files that have been modified).

const props = defineProps<{
  version: string;
  reloading?: boolean;
}>();

defineEmits<{
  close: [];
  downloadAndInstall: [];
  reload: [];
}>();

// Retrieve what is new between our current version (excluded) and the available version (included).
// Note #1: OpenCOR shows our dialog as soon as it knows about a newer version, so we list the changes as soon as they
//          have been fetched. OpenCOR's Web app, on the other hand, fetches them as soon as it knows about a newer
//          version (see OpenCOR.vue), so they are normally already fetched by the time our dialog is shown, in which
//          case we list them straightaway.
// Note #2: our dialog may get closed and shown again (possibly for another version) before the changes that we were
//          fetching have been retrieved, in which case we ignore those changes since they may not be for the version
//          that is now available.

const entries = vue.ref<IOpenCORChangelogEntry[] | null>([]);
const fetching = vue.ref(false);

let fetchId = 0;

const onShow = (): void => {
  const crtFetchId = ++fetchId;

  entries.value = [];
  fetching.value = true;

  void fetchChangelog(props.version).then((changelogEntries: IOpenCORChangelogEntry[] | null) => {
    if (crtFetchId === fetchId) {
      entries.value = changelogEntries;
      fetching.value = false;
    }
  });
};
</script>

<style scoped>
.update {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  margin-bottom: 0.25rem;
}

/**
 * Version.
 */

.update-version {
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.update-version-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  background-color: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
  color: var(--p-primary-color);
}

.update-version-icon .pi {
  font-size: 1.25rem;
}

.update-version-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
  color: var(--p-text-color);
  font-size: 1.125rem;
  font-weight: 600;
}

.update-version-badge {
  padding: 0.0625rem 0.5rem;
  border: 1px solid var(--opencor-success-border-color);
  border-radius: 9999px;
  background-color: var(--opencor-success-background);
  color: var(--opencor-success-color);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
}

.update-version-current {
  display: block;
  margin-top: 0.125rem;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}

/**
 * What's new.
 */

.update-changes {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.update-changes-box {
  max-height: 16rem;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--opencor-scrollbar-color) transparent;
  padding: 0.75rem 0.875rem;
  font-size: 0.875rem;
}

.update-changes-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--p-text-muted-color);
}

.update-spinner {
  --opencor-spinner-size: 0.875rem;
}

/**
 * Note.
 */

.update-note {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  line-height: 1.25rem;
}

/**
 * Note: our icon is as tall as the first line of our note, so that it is aligned with it.
 */

.update-note-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 1.25rem;
  font-size: 0.8125rem;
}
</style>
