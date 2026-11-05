<template>
  <nav class="w-14 h-full shrink-0 flex flex-col overflow-y-auto py-1"
    :style="{ borderRight: '1px solid var(--p-content-border-color)' }"
    @wheel.prevent="onWheel"
  >
    <template v-for="([category, views], categoryIndex) in categoriesWithViews" :key="category.id">
      <div v-if="categoryIndex > 0" class="mx-2 my-1 border-t"
        style="border-color: var(--p-content-border-color);"
      />
      <button v-for="view in views" :key="view.id"
        type="button"
        :ref="(element) => setViewButtonRef(view.id, element)"
        :class="[
          'view-icon flex items-center justify-center mx-1 my-0.5 rounded-r-md transition-colors duration-150',
          { 'view-icon-active': view.id === activeViewId }
        ]"
        :style="{ '--view-category-color': category.color }"
        :title="view.label"
        @click="$emit('selectView', view.id)"
      >
        <i v-if="typeof view.icon === 'string'" :class="view.icon" class="text-lg" />
        <span v-else class="view-icon-image" :style="viewIconImageStyle(view.icon.url)" />
      </button>
    </template>
  </nav>
</template>

<script setup lang="ts">
import * as vue from 'vue';

import {
  type IViewDescriptor,
  useViewRegistry,
  ViewCategory,
  type ViewCategory as ViewCategoryType
} from '../common/viewRegistry';

const props = defineProps<{
  activeViewId: string;
}>();

const emit = defineEmits<{
  selectView: [viewId: string];
}>();

const viewRegistry = useViewRegistry();

// Compute the list of view categories that have at least one view, along with their corresponding views.

const categoriesWithViews = vue.computed<Array<[ViewCategoryType, IViewDescriptor[]]>>(() => {
  const res: Array<[ViewCategoryType, IViewDescriptor[]]> = [];

  for (const category of Object.values(ViewCategory)) {
    const views = viewRegistry.descriptors(category);

    if (views.length > 0) {
      res.push([category, views]);
    }
  }

  return res;
});

// Compute the list of view IDs in the order they are displayed in the view switcher.

const viewIds = vue.computed<string[]>(() => {
  const res: string[] = [];

  for (const [, views] of categoriesWithViews.value) {
    for (const view of views) {
      res.push(view.id);
    }
  }

  return res;
});

// Keep a map of view IDs to their corresponding button elements, so we can scroll the active view's button into view
// when the active view changes.

const viewButtonRefs = new Map<string, HTMLElement>();

const setViewButtonRef = (viewId: string, element: unknown): void => {
  if (element instanceof HTMLElement) {
    viewButtonRefs.set(viewId, element);
  } else {
    viewButtonRefs.delete(viewId);
  }
};

// Style of a view icon that is an image, i.e. use the image as a mask.
// Note: Vite inlines an SVG file as a data URL which may contain single quotes (it replaces the SVG's double quotes
//       with single quotes), so we must use double quotes in url().

const viewIconImageStyle = (url: string): vue.CSSProperties => {
  return {
    maskImage: `url("${url}")`
  };
};

// Switch views with the mouse wheel.
// Note: we don't wrap around, i.e. we don't go from the last view to the first view, or vice versa. Also, we switch
//       views only once per wheel gesture, i.e. a series of wheel events in the same direction with no pause between
//       them, so that we don't switch views too quickly when the user scrolls fast (or when a trackpad keeps sending
//       wheel events after a swipe).

const wheelGestureDelay = 250;
let lastWheelTime = 0;
let lastWheelDirection = 0;

const selectViewByOffset = (offset: number): void => {
  const activeViewIndex = viewIds.value.indexOf(props.activeViewId);

  if (activeViewIndex === -1) {
    return;
  }

  const newViewIndex = Math.min(Math.max(activeViewIndex + offset, 0), viewIds.value.length - 1);

  if (newViewIndex !== activeViewIndex) {
    emit('selectView', viewIds.value[newViewIndex]);
  }
};

const onWheel = (event: WheelEvent): void => {
  if (!viewIds.value.length || !event.deltaY) {
    return;
  }

  const wheelDirection = Math.sign(event.deltaY);
  const newWheelGesture = event.timeStamp - lastWheelTime > wheelGestureDelay || wheelDirection !== lastWheelDirection;

  lastWheelTime = event.timeStamp;
  lastWheelDirection = wheelDirection;

  if (newWheelGesture) {
    selectViewByOffset(wheelDirection);
  }
};

// Scroll the active view's button into view when the active view changes.

vue.watch(
  () => props.activeViewId,
  (viewId) => {
    viewButtonRefs.get(viewId)?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest'
    });
  },
  { immediate: true, flush: 'post' }
);
</script>

<style scoped>
.view-icon {
  width: 44px;
  height: 44px;
  border-left: 3px solid transparent;
  background-color: color-mix(in srgb, var(--view-category-color) 8%, transparent);
  color: var(--p-text-muted-color);
}

.view-icon:hover {
  background-color: color-mix(in srgb, var(--view-category-color) 15%, transparent);
  color: var(--p-text-color);
}

.view-icon-active,
.view-icon-active:hover {
  background-color: color-mix(in srgb, var(--view-category-color) 20%, transparent);
  border-left-color: var(--view-category-color);
  color: var(--view-category-color);
}

.view-icon-image {
  width: 1.125rem;
  height: 1.125rem;
  background-color: currentColor;
  mask-position: center;
  mask-repeat: no-repeat;
  mask-size: contain;
}
</style>
