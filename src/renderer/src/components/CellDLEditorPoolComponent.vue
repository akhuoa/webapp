<template>
  <div class="h-full">
    <Teleport v-for="editor in editors" :key="editor.id" :to="editor.client?.container" :disabled="!editor.client?.container">
      <CellDLEditor :ref="(instance) => setInstance(editor, instance)" class="h-full"
        :editorCommand="editor.command"
        :theme="editor.client?.theme() ?? 'system'"
        @editor-data="editor.onEditorData"
        @editor-ready="onEditorReady(editor)"
        @editor-state="editor.onEditorState"
        @file-edited="editor.onFileEdited"
      />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import * as vue from 'vue';

import { type IPooledCellDLEditor, useCellDLEditorPool } from '../common/celldlEditorPool';
import { loadCellDLRuntime } from '../common/celldlRuntime';

// CellDL Editor, which is part of our CellDL runtime (see common/celldlRuntime.ts).
// Note: we are only mounted once a CellDL Editor view has loaded our CellDL runtime (see CellDLEditorView.vue), so this
//       doesn't actually load it.

const CellDLEditor = vue.defineAsyncComponent(async () => (await loadCellDLRuntime()).CellDLEditor);

// Our pool of CellDL Editors (see common/celldlEditorPool.ts).
// Note: a CellDL Editor is shown in the container of the CellDL Editor view that has acquired it, if any. Otherwise, it
//       is "parked" in our root element, which is rendered in an invisible element (see mount() in
//       common/celldlEditorPool.ts).

const { editors, setFailed } = useCellDLEditorPool();
const instances = new Map<number, vue.ComponentPublicInstance>();

const setInstance = (editor: IPooledCellDLEditor, instance: unknown): void => {
  if (instance) {
    instances.set(editor.id, instance as vue.ComponentPublicInstance);
  } else {
    instances.delete(editor.id);
  }
};

// Let a CellDL Editor know when it is ready, providing it with its root element.

const onEditorReady = (editor: IPooledCellDLEditor): void => {
  editor.onEditorReady(instances.get(editor.id)?.$el ?? null);
};

// Let our pool know if CellDL Editor fails to get ready.
// Note: CellDL Editor initialises itself before loading its actual component (e.g., it instantiates Oxigraph from a
//       data URL, which a host application's Content Security Policy may not allow), and if that fails then it will
//       never be ready. Our pool only considers errors that occur before a CellDL Editor is ready (see setFailed()),
//       and we let them propagate, so that they still get logged.

vue.onErrorCaptured((error: unknown) => {
  setFailed(error);
});
</script>
