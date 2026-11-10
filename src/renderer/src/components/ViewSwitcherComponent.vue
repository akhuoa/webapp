<template>
  <div class="relative h-full shrink-0">
    <nav ref="navRef" class="view-switcher relative w-12 h-full flex flex-col items-center gap-1 overflow-y-auto py-1.5"
      @keydown="onKeyDown"
      @scroll="hideTooltip"
      @wheel.prevent="onWheel"
    >
      <template v-for="([category, views], categoryIndex) in categoriesWithViews" :key="category.id">
        <div v-if="categoryIndex > 0" class="view-separator shrink-0" />
        <button v-for="view in views" :key="view.id"
          type="button"
          :ref="(element) => setViewButtonRef(view.id, element)"
          :class="[
            'view-icon relative flex items-center justify-center shrink-0 w-9 h-9 rounded-md cursor-pointer',
            { 'view-icon-active': view.id === activeViewId }
          ]"
          :style="{ '--view-category-color': category.color }"
          :aria-label="view.label"
          :aria-pressed="view.id === activeViewId"
          @mousedown.prevent
          @mouseenter="onMouseEnter(view.label, $event)"
          @mouseleave="onMouseLeave"
          @focus="onFocus(view.label, $event)"
          @blur="hideTooltip"
          @click="hideTooltip(); $emit('selectView', view.id)"
        >
          <i v-if="typeof view.icon === 'string'" :class="view.icon" class="view-icon-glyph" />
          <span v-else class="view-icon-image" :style="viewIconImageStyle(view.icon.url)" />
        </button>
      </template>
    </nav>
    <div v-if="tooltip" class="view-tooltip absolute px-2 py-1 rounded-md text-xs whitespace-nowrap pointer-events-none"
      :style="{ top: `${tooltip.top}px` }"
      aria-hidden="true"
    >
      {{ tooltip.label }}
    </div>
  </div>
</template>

<script setup lang="ts">
import * as vue from 'vue';

import { HINT_DELAY } from '../common/constants';
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

// Tooltip, which is shown to the right of a view button, after a short delay when the button is hovered, and
// straightaway when the button is focused using the keyboard or when another tooltip was shown (or has just been
// hidden), so that people can quickly go through our view buttons.
// Note #1: our tooltip is not part of our nav element since it would otherwise get clipped by it (since our nav element
//          can be scrolled), hence it is positioned relative to our root element.
// Note #2: our tooltip remains shown while its view button has a focus ring, even if that view button gets hovered and
//          then left, and it is shown again if another view button gets hovered and then left (since we only have one
//          tooltip).
// Note #3: like a hint (see hint.ts), our tooltip can be dismissed by pressing Escape, be it shown or about to be
//          shown, in which case it isn't shown again until a view button is hovered or focused anew. Escape is
//          otherwise left to do what it normally does (e.g., remove the keyboard focus, see OpenCOR.vue).

const TOOLTIP_WARM_DELAY = 300;

const navRef = vue.shallowRef<HTMLElement | null>(null);
const tooltip = vue.ref<{ label: string; top: number } | null>(null);
let tooltipTimer: number | undefined;
let tooltipHiddenTime = 0;
let tooltipDismissed = false;

const showTooltip = (label: string, element: HTMLElement, immediately: boolean): void => {
  window.clearTimeout(tooltipTimer);

  const doShowTooltip = () => {
    tooltip.value = {
      label,
      top: element.offsetTop - (navRef.value?.scrollTop ?? 0) + 0.5 * element.offsetHeight
    };
  };

  if (immediately || tooltip.value || performance.now() - tooltipHiddenTime < TOOLTIP_WARM_DELAY) {
    doShowTooltip();
  } else {
    tooltipTimer = window.setTimeout(doShowTooltip, HINT_DELAY);
  }
};

const hideTooltip = (): void => {
  window.clearTimeout(tooltipTimer);

  if (tooltip.value) {
    tooltip.value = null;
    tooltipHiddenTime = performance.now();
  }
};

// The view button that has a focus ring, if any.

const viewButtonWithFocusRing = (): HTMLElement | null => {
  const activeElement = document.activeElement;

  return activeElement instanceof HTMLElement &&
    navRef.value?.contains(activeElement) &&
    activeElement.matches('.view-icon:focus-visible')
    ? activeElement
    : null;
};

const onMouseEnter = (label: string, event: MouseEvent): void => {
  tooltipDismissed = false;

  showTooltip(label, event.currentTarget as HTMLElement, false);
};

// Show the tooltip of the view button that has a focus ring, if any (unless our tooltip has been dismissed), or hide
// our tooltip (see Notes #2 and #3 above).

const onMouseLeave = (): void => {
  const viewButton = tooltipDismissed ? null : viewButtonWithFocusRing();

  if (viewButton) {
    showTooltip(viewButton.getAttribute('aria-label') ?? '', viewButton, true);
  } else {
    hideTooltip();
  }
};

const onFocus = (label: string, event: FocusEvent): void => {
  const element = event.currentTarget as HTMLElement;

  if (element.matches(':focus-visible')) {
    tooltipDismissed = false;

    showTooltip(label, element, true);
  }
};

// Dismiss our tooltip, be it shown or about to be shown, if Escape is pressed (see Note #3 above).

const onWindowKeyDown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    tooltipDismissed = true;

    hideTooltip();
  }
};

vue.onMounted(() => {
  window.addEventListener('keydown', onWindowKeyDown, true);
});

vue.onBeforeUnmount(() => {
  window.clearTimeout(tooltipTimer);
  window.removeEventListener('keydown', onWindowKeyDown, true);
});

// Move the focus between our view buttons using the keyboard.
// Note: our view buttons don't get the focus when clicked (see our template), so that they don't look focused when
//       people use the mouse.

const onKeyDown = (event: KeyboardEvent): void => {
  const viewButtons = viewIds.value
    .map((viewId) => viewButtonRefs.get(viewId))
    .filter((viewButton): viewButton is HTMLElement => !!viewButton);
  const viewButtonIndex = viewButtons.indexOf(document.activeElement as HTMLElement);

  if (viewButtonIndex === -1) {
    return;
  }

  let newViewButtonIndex: number;

  if (event.key === 'ArrowDown') {
    newViewButtonIndex = Math.min(viewButtonIndex + 1, viewButtons.length - 1);
  } else if (event.key === 'ArrowUp') {
    newViewButtonIndex = Math.max(viewButtonIndex - 1, 0);
  } else if (event.key === 'Home') {
    newViewButtonIndex = 0;
  } else if (event.key === 'End') {
    newViewButtonIndex = viewButtons.length - 1;
  } else {
    return;
  }

  event.preventDefault();

  viewButtons[newViewButtonIndex]?.focus();
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
.view-switcher {
  border-right: 1px solid var(--p-content-border-color);
}

.view-separator {
  width: 1.25rem;
  margin: 0.25rem 0;
  border-top: 1px solid var(--p-content-border-color);
}

/**
 * View buttons, which icon uses the colour of their category when hovered or active. Only an active view button has a
 * background tinted with the colour of its category, as well as a marker on the left edge of our nav element.
 */

.view-icon {
  border: none;
  background-color: transparent;
  color: var(--p-text-muted-color);
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.view-icon:hover {
  background-color: var(--p-content-hover-background);
  color: var(--view-category-color);
}

.view-icon:focus-visible {
  box-shadow: 0 0 0 2px var(--p-primary-color);
}

.view-icon-active,
.view-icon-active:hover {
  background-color: color-mix(in srgb, var(--view-category-color) 14%, transparent);
  color: var(--view-category-color);
}

.view-icon-active::before {
  position: absolute;
  top: 25%;
  bottom: 25%;
  left: -0.375rem;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background-color: var(--view-category-color);
  content: "";
}

.view-icon-glyph {
  font-size: 1.125rem;
}

.view-icon-image {
  width: 1.125rem;
  height: 1.125rem;
  background-color: currentColor;
  mask-position: center;
  mask-repeat: no-repeat;
  mask-size: contain;
}

/**
 * Tooltip, which looks like the tooltip of our toolbar buttons (see ToolbarButtonWidget.vue).
 */

.view-tooltip {
  left: calc(100% + 0.375rem);
  z-index: 1000;
  border: 1px solid var(--opencor-hint-border-color);
  background-color: var(--opencor-hint-background);
  box-shadow: var(--opencor-overlay-shadow);
  color: var(--opencor-hint-color);
  font-weight: 500;
  transform: translateY(-50%);
}
</style>
