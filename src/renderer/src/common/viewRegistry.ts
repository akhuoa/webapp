import * as vueusecore from '@vueuse/core';

import type * as vue from 'vue';

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

// View registry composable.

export const useViewRegistry = vueusecore.createGlobalState(() => {
  const _descriptors: IViewDescriptor[] = [];
  const _descriptorIndices = new Map<string, number>();

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

  return { descriptors, isApplicable, register, resolve };
});
