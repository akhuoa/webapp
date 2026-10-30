<template>
  <div class="flex flex-col" style="height: 100vh; height: 100dvh;">
    <div class="flex items-center justify-center bg-blue-500" style="flex: 15 1 0;">Top panel...</div>
    <div class="flex min-h-0" style="flex: 50 1 0;">
      <div class="flex items-center justify-center bg-red-500" style="flex: 15 1 0;">Left panel...</div>
      <div class="min-w-0" style="flex: 50 1 0;">
        <OpenCOR />
      </div>
      <div class="flex items-center justify-center bg-red-500" style="flex: 35 1 0;">Right panel...</div>
    </div>
    <div class="flex items-center justify-center bg-blue-500" style="flex: 35 1 0;">Bottom panel...</div>
  </div>
</template>
