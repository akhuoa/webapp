<template>
  <Message class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-4 pt-6 pb-3 z-99999"
    severity="secondary"
    :pt="{
      transition: {
        css: false
      }
    }"
  >
    <i class="block! pi pi-cog pi-spin text-center! text-[3rem]!" />
    <br />
    <span class="block text-center text-[1.5rem]">{{ message }}</span>
    <ProgressBar v-if="progress !== undefined" class="w-full h-1! mt-4"
      :value="progress"
      :showValue="false"
      :pt="{
        value: {
          style: 'transition: none'
        }
      }"
    />
  </Message>
</template>

<script setup lang="ts">
defineProps<{
  message: string;
  progress?: number;
}>();
</script>
