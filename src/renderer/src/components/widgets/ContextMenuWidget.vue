<template>
  <ContextMenu ref="contextMenuRef" :model="model" :appendTo="appendTo" :pt="CONTEXT_MENU_PT">
    <template #item="{ item, props: itemProps, hasSubmenu }">
      <a v-bind="itemProps.action">
        <i :class="item.icon" class="context-menu-item-icon" />
        <span>{{ item.label }}</span>
        <i v-if="hasSubmenu" class="context-menu-item-chevron pi pi-angle-right" />
      </a>
    </template>
  </ContextMenu>
</template>

<script setup lang="ts">
import ContextMenu from 'primevue/contextmenu';
import type { MenuItem } from 'primevue/menuitem';
import * as vue from 'vue';

// A context menu, which looks like the menus of our main menu (see MainMenu.vue) and, like them, is shown without any
// animation (see .opencor-context-menu and the anchored overlays in app.css).
// Note: only one context menu should be shown at any given time, but PrimeVue only hides a context menu when the user
//       clicks outside of it, so we let our other context menus know when we are about to be shown, and we hide
//       ourselves when another context menu is about to be shown.

defineProps<{
  model: MenuItem[];
  appendTo?: HTMLElement | string;
}>();

const CONTEXT_MENU_PT = {
  root: {
    class: 'opencor-context-menu'
  }
};

const CONTEXT_MENU_SHOW_EVENT = 'opencor-context-menu-show';

const contextMenuId = Symbol('ContextMenuWidget');
const contextMenuRef = vue.ref<InstanceType<typeof ContextMenu> | null>(null);

const show = (event: MouseEvent): void => {
  window.dispatchEvent(
    new CustomEvent(CONTEXT_MENU_SHOW_EVENT, {
      detail: {
        sourceId: contextMenuId
      }
    })
  );

  contextMenuRef.value?.show(event);
};

const hide = (): void => {
  contextMenuRef.value?.hide();
};

const onContextMenuShow = (event: Event): void => {
  if ((event as CustomEvent<{ sourceId?: symbol }>).detail?.sourceId !== contextMenuId) {
    hide();
  }
};

vue.onMounted(() => {
  window.addEventListener(CONTEXT_MENU_SHOW_EVENT, onContextMenuShow);
});

vue.onUnmounted(() => {
  window.removeEventListener(CONTEXT_MENU_SHOW_EVENT, onContextMenuShow);
});

defineExpose({ hide, show });
</script>
