import * as vueusecore from '@vueuse/core';

import * as vue from 'vue';

import type { EFileType, File } from '../libopencor/locApi';

// View categories.

export const ViewCategory = {
  Editing: {
    id: 'editing',
    color: 'var(--p-blue-500)'
  },
  Simulation: {
    id: 'simulation',
    color: 'var(--p-green-500)'
  },
  Analysis: {
    id: 'analysis',
    color: 'var(--p-red-500)'
  }
} as const;

export type ViewCategory = (typeof ViewCategory)[keyof typeof ViewCategory];

// View descriptor.
// Note: a view's icon is either the CSS class of a font icon (e.g., 'pi pi-chart-line') or the URL of a monochrome
//       image (e.g., an inlined SVG file), which is used as a mask so that it gets coloured like a font icon.

export interface IViewDescriptor {
  id: string;
  category: ViewCategory;
  label: string;
  icon: string | { url: string };
  component: vue.Component;
  fileTypes: readonly EFileType[];
  supportsFile?: (file: File) => boolean;
}

// File editor, i.e. what a view that can edit a file registers for that file, so that the file can be saved.
// Note #1: markSaved() marks the given contents (as retrieved using contents()) as saved, i.e. the file is still
//          modified if it was edited since those contents were retrieved. We pass the contents that were saved (rather
//          than mark the contents that were last retrieved as saved) since a file may be saved several times at once
//          (e.g., the user saves it again while it is still being saved), in which case the saves may complete in any
//          order.
// Note #2: editedSince() returns whether the file has been edited since the given contents (as retrieved using
//          contents()) were retrieved, i.e. whether those contents may not be the latest ones.
// Note #3: a view is kept alive for as long as its file is open, even when it is not the active view of its file tab,
//          so that a file can be saved whichever view is active.

export interface IFileEditor {
  modified: () => boolean;
  contents: () => Promise<Uint8Array>;
  editedSince: (contents: Uint8Array) => boolean;
  markSaved: (contents: Uint8Array) => void;
}

// View registry composable.

export const useViewRegistry = vueusecore.createGlobalState(() => {
  const _descriptors: IViewDescriptor[] = [];
  const _descriptorIndices = new Map<string, number>();
  const _fileEditors = vue.shallowReactive(new Map<File, IFileEditor>());
  const _unsavedContentsFiles = new WeakSet<File>();

  // Register a view descriptor.
  // Note: it must be called before any resolution. Registering a descriptor which ID is already registered replaces
  //       the previous one in place (e.g., multiple OpenCOR instances mounted in the same page register the same
  //       descriptors), so the registry never grows unbounded.

  function register(descriptor: IViewDescriptor): void {
    const descriptorIndex = _descriptorIndices.get(descriptor.id);

    if (descriptorIndex === undefined) {
      _descriptors.push(descriptor);
      _descriptorIndices.set(descriptor.id, _descriptors.length - 1);
    } else {
      _descriptors[descriptorIndex] = descriptor;
    }
  }

  // Determine whether a view descriptor is applicable to a given file.
  // Note: a view may further restrict the files it supports (e.g., our CellDL Editor view only supports unknown files
  //       that are CellDL files).

  const isApplicable = (descriptor: IViewDescriptor, file: File): boolean => {
    return descriptor.fileTypes.includes(file.type()) && (descriptor.supportsFile?.(file) ?? true);
  };

  // Resolve the view to show for a file.
  // Note: the user's chosen view is always returned, whether or not it is applicable to the file (in which case it is
  //       up to the caller to indicate that the view is not supported for the given file type).

  function resolve(activeViewId: string): IViewDescriptor | null {
    return (
      _descriptors.find((descriptor) => {
        return descriptor.id === activeViewId;
      }) ?? null
    );
  }

  // Return all the descriptors for a given category.

  function descriptors(category: ViewCategory): IViewDescriptor[] {
    return _descriptors.filter((descriptor) => descriptor.category === category);
  }

  // Register/unregister the editor of a file.
  // Note #1: a file has at most one editor, i.e. registering an editor for a file replaces its previous editor, if any.
  //          This is fine for now since only our CellDL Editor view can edit a file. Should several views be able to
  //          edit the same file, then their changes would need to be shared. For instance, the contents of a file could
  //          be the one shared copy, with an editor pushing its changes to it when its view gets deactivated, and
  //          reloading it when its view gets activated (if it has changed since). The modified state would then be that
  //          of the file rather than that of an editor, and all the editors of a file would get notified when it gets
  //          saved.
  // Note #2: a file may be accessed through a reactive proxy (e.g., through a file tab), so we use the raw file as our
  //          key.

  function registerFileEditor(file: File, fileEditor: IFileEditor): void {
    _fileEditors.set(vue.toRaw(file), fileEditor);
  }

  function unregisterFileEditor(file: File, fileEditor: IFileEditor): void {
    const rawFile = vue.toRaw(file);

    if (_fileEditors.get(rawFile) === fileEditor) {
      _fileEditors.delete(rawFile);
    }
  }

  // Return the editor of a file, if any.

  function fileEditor(file: File): IFileEditor | undefined {
    return _fileEditors.get(vue.toRaw(file));
  }

  // Mark a file as having unsaved contents, i.e. contents that are not those of the file itself (e.g., a file that was
  // edited while it was being saved under another name, see ContentsComponent.doSaveFileAs()), so that its editor
  // considers it modified from the start (and so that it is considered modified while it has no editor, see
  // ContentsComponent.isModified()), clear that mark once those contents have been saved, and determine whether a file
  // has unsaved contents.
  // Note #1: same as for registerFileEditor() when it comes to using the raw file.
  // Note #2: a WeakSet cannot be reactive, so we keep track of its changes so that whoever determines whether a file
  //          has unsaved contents (e.g., a template) gets updated when that changes.

  const _unsavedContentsFilesVersion = vue.ref<number>(0);

  function markUnsavedContents(file: File): void {
    _unsavedContentsFiles.add(vue.toRaw(file));

    ++_unsavedContentsFilesVersion.value;
  }

  function clearUnsavedContents(file: File): void {
    if (_unsavedContentsFiles.delete(vue.toRaw(file))) {
      ++_unsavedContentsFilesVersion.value;
    }
  }

  function hasUnsavedContents(file: File): boolean {
    void _unsavedContentsFilesVersion.value; // Track changes to the unsaved contents files.

    return _unsavedContentsFiles.has(vue.toRaw(file));
  }

  return {
    clearUnsavedContents,
    descriptors,
    fileEditor,
    hasUnsavedContents,
    isApplicable,
    markUnsavedContents,
    register,
    registerFileEditor,
    resolve,
    unregisterFileEditor
  };
});
