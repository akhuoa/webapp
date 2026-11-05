<template>
  <BaseDialog header="Changelog" class="w-169">
    <ChangelogComponent v-if="entries.length" class="max-h-[60vh] overflow-y-auto" :entries="entries" />
    <div v-else class="mt-2 mb-4">No changelog is available.</div>
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
