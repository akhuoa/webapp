<template>
  <div class="celldl-editor h-full">
    <Teleport :to="container" :disabled="!container">
      <div ref="editorRef" class="h-full" :class="{ invisible: switching }">
        <CellDLEditor
          :editorCommand="editorCommand"
          :theme="theme"
          @editor-data="onEditorData"
          @editor-state="onEditorState"
        />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import * as vueusecore from '@vueuse/core';

import * as vue from 'vue';

import { useCellDLEditorHost } from '../common/celldlEditorHost';
import { loadCellDLRuntime } from '../common/celldlRuntime';
import * as common from '../common/common';

// CellDL Editor, which is part of our CellDL runtime (see common/celldlRuntime.ts).
// Note: we are only mounted once a CellDL Editor view has loaded our CellDL runtime (see CellDLEditorView.vue), so this
//       doesn't actually load it.

const CellDLEditor = vue.defineAsyncComponent(async () => (await loadCellDLRuntime()).CellDLEditor);

// Our shared CellDL Editor (see common/celldlEditorHost.ts).
// Note: when no CellDL Editor view is visible, our CellDL Editor is "parked" in our root element, which is rendered in
//       an invisible element (see mount() in common/celldlEditorHost.ts).

const { container, editorCommand, onEditorData, onEditorState, setFailed, setReady, switching, theme } =
  useCellDLEditorHost();
const editorRef = vue.shallowRef<HTMLElement | null>(null);

// Let our host know when our CellDL Editor is ready.
// Note: the CellDL Editor doesn't tell us when it is ready, which it is once it has mounted itself and started editing
//       an empty diagram, i.e. once its SVG container has an SVG element. Until then, the CellDL Editor would ignore
//       our commands or fail to handle them.

const { stop: stopObservingEditor } = vueusecore.useMutationObserver(
  editorRef,
  () => {
    if (!editorRef.value?.querySelector('#svg-container > svg')) {
      return;
    }

    stopObservingEditor();

    void common.waitForNextAnimationFrame().then(setReady);
  },
  {
    childList: true,
    subtree: true
  }
);

// Let our host know if our CellDL Editor fails to get ready.
// Note: CellDL Editor initialises itself before loading its actual component (e.g., it instantiates Oxigraph from a
//       data URL, which a host application's Content Security Policy may not allow), and if that fails then it will
//       never be ready. We only consider errors that occur before our CellDL Editor is ready (see setFailed()), and we
//       let them propagate, so that they still get logged.

vue.onErrorCaptured((error: unknown) => {
  setFailed(error);
});
</script>
