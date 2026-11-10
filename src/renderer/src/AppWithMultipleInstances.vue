<template>
  <div class="flex flex-col" style="height: 100vh; height: 100dvh; overflow: hidden;">
    <div class="min-h-0" style="flex: 15 1 0;">
      <OpenCOR />
    </div>
    <div class="flex min-h-0" style="flex: 50 1 0;">
      <div class="min-w-0" style="flex: 15 1 0;">
        <OpenCOR
          omex="https://raw.githubusercontent.com/opencor/webapp/refs/heads/main/tests/models/lorenz.cellml"
        />
      </div>
      <div class="min-w-0" style="flex: 50 1 0;">
        <OpenCOR omex="https://raw.githubusercontent.com/opencor/webapp/refs/heads/main/tests/models/lorenz.omex" />
      </div>
      <div class="min-w-0" style="flex: 35 1 0;">
        <OpenCOR
          omex="https://raw.githubusercontent.com/opencor/webapp/refs/heads/main/tests/models/ui/lorenz.omex"
        />
      </div>
    </div>
    <div class="min-h-0" style="flex: 35 1 0;">
      <OpenCOR
        omex="https://models.physiomeproject.org/workspace/b7c/rawfile/e0ae8d2d56aaaa091e23e1ee7e84cacbda1dfb6b/lorenz.omex"
      />
    </div>
  </div>
</template>
