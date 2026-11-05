<template>
  <BaseDialog header=" " class="w-169"
    :closeButtonProps="{ severity: 'secondary', text: true, rounded: true, disabled: reloading }"
    :closeOnEscape="!reloading"
    @show="onShow"
  >
    <div class="space-y-7">
      <div class="text-center">
        <div class="text-3xl font-bold">OpenCOR <span class="highlight highlight-version">{{ version }}</span> is available!</div>
      </div>
      <div v-if="fetching || entries === null || entries.length" class="space-y-2">
        <div class="text-lg font-bold">What's new:</div>
        <div v-if="fetching" class="flex items-center gap-2 text-muted-color">
          <i class="pi pi-cog pi-spin" />
          <span>Retrieving the changes...</span>
        </div>
        <div v-else-if="entries === null" class="text-muted-color">The changes could not be retrieved.</div>
        <ChangelogComponent v-else class="max-h-64 overflow-y-auto" :entries="entries" />
      </div>
      <div class="space-y-2">
        <div v-if="electronApi" class="text-center">
          <span class="text-lg">Do you want to download it and install it?</span>
        </div>
        <div v-else class="text-center">
          <span class="text-lg">Feel free to reload OpenCOR whenever you are ready.</span><br />
          <em >(Please note that any unsaved work will be lost.)</em>
        </div>
      </div>
    </div>
    <template #footer>
      <template v-if="electronApi">
        <Button label="Yes" autofocus @click="$emit('downloadAndInstall')" />
        <Button label="No" severity="secondary" @click="$emit('close')" />
      </template>
      <template v-else>
        <Button :label="reloading?'Reloading...':'Reload'" autofocus :loading="reloading" @click="onReloadNow" />
        <Button label="Cancel" severity="secondary" :disabled="reloading" @click="$emit('close')" />
      </template>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import * as vue from 'vue';

import type { IOpenCORChangelogEntry } from '../../../index';

import { fetchChangelog } from '../../common/changelog';
import { electronApi } from '../../common/electronApi';
import { forceReload } from '../../common/version';

const props = defineProps<{
  version: string;
}>();

defineEmits<{
  close: [];
  downloadAndInstall: [];
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

// Reload OpenCOR's Web app.

const reloading = vue.ref(false);

const onReloadNow = (): void => {
  reloading.value = true;

  void forceReload();
};
</script>

<style scoped>
.highlight {
  display: inline-flex;
  align-items: center;
  height: 1em;
  padding: 0.125em 0.25em;
  border: 1px solid var(--p-content-border-color);
  border-radius: 9999px;
  background-color: var(--p-content-hover-background);
  color: var(--p-text-muted-color);
  font-style: normal;
}

.highlight-version {
  background-color: var(--p-message-success-background);
  border-color: var(--p-message-success-border-color);
  color: var(--p-message-success-color);
}
</style>
