<template>
  <Menubar ref="menuBarRef" :id="props.id" :model="items">
    <template #item="{ item, props }">
      <a v-bind="props.action">
        <div class="p-menubar-item-label">{{ item.label }}</div>
        <svg
          v-if="item.items"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          class="ml-auto p-icon p-menubar-submenu-icon"
        >
          <path
            d="M5.25 11.1728C5.14929 11.1694 5.05033 11.1455 4.9592 11.1025C4.86806 11.0595 4.78666 10.9984 4.72 10.9228C4.57955 10.7822 4.50066 10.5916 4.50066 10.3928C4.50066 10.1941 4.57955 10.0035 4.72 9.86283L7.72 6.86283L4.72 3.86283C4.66067 3.71882 4.64765 3.55991 4.68275 3.40816C4.71785 3.25642 4.79932 3.11936 4.91585 3.01602C5.03238 2.91268 5.17819 2.84819 5.33305 2.83149C5.4879 2.81479 5.64411 2.84671 5.78 2.92283L9.28 6.42283C9.42045 6.56346 9.49934 6.75408 9.49934 6.95283C9.49934 7.15158 9.42045 7.34221 9.28 7.48283L5.78 10.9228C5.71333 10.9984 5.63193 11.0595 5.5408 11.1025C5.44966 11.1455 5.35071 11.1694 5.25 11.1728Z"
            fill="currentColor"
          />
        </svg>
        <div v-if="item.shortcut" class="ml-auto border rounded shortcut text-xs/3">
          {{ item.shortcut }}
        </div>
      </a>
    </template>
    <template #end>
      <button v-if="updateAvailable" class="update-link absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center whitespace-nowrap px-1.5 py-0.5 text-xs cursor-pointer rounded-full transition-colors duration-150"
        type="button"
        @click="emit('updateAvailable')"
      >
        New version available!
      </button>
      <ThemeWidget v-if="themeCanBeChanged" :theme="theme.theme()" @switch="onThemeSwitch" />
    </template>
  </Menubar>
</template>

<script setup lang="ts">
import type Menubar from 'primevue/menubar';
import * as vue from 'vue';

import type { OpenCORTheme } from '../../index';

import * as common from '../common/common';
import { settings } from '../common/settings';
import * as version from '../common/version';
import * as vueCommon from '../common/vueCommon';

import { useOpenCORContext, useOpenCORKeyStroke } from './OpenCORContext';

const props = defineProps<{
  id?: string;
  hasFiles: boolean;
}>();

const emit = defineEmits<{
  about: [];
  changelog: [];
  close: [];
  closeAll: [];
  open: [];
  openRemote: [];
  openSampleLorenz: [];
  settings: [];
  updateAvailable: [];
}>();

const { themeCanBeChanged } = useOpenCORContext();

const isWindowsOrLinux = common.isWindows() || common.isLinux();
const isMacOs = common.isMacOs();
const updateAvailable = version.updateAvailable;

// Theme button, which allows the user to cycle through the system, light, and dark themes.

const theme = vueCommon.useTheme();

const onThemeSwitch = (newTheme: OpenCORTheme) => {
  // Switch to the next theme, apply it, and save it in our settings.

  theme.applyTheme(newTheme);

  settings.general.theme = newTheme;

  settings.save();
};

// Menu items, which are computed so that they can be reactive to changes in our props.

const items = vue.computed(() => [
  {
    label: 'File',
    items: [
      {
        label: 'Open...',
        shortcut: isWindowsOrLinux ? 'Ctrl+Alt+O' : isMacOs ? '⌘⌥O' : undefined,
        command: () => {
          emit('open');
        }
      },
      {
        label: 'Open Remote...',
        shortcut: isWindowsOrLinux ? 'Ctrl+Shift+Alt+O' : isMacOs ? '⇧⌘⌥O' : undefined,
        command: () => {
          emit('openRemote');
        }
      },
      {
        label: 'Open Sample',
        items: [
          {
            label: 'Lorenz',
            command: () => {
              emit('openSampleLorenz');
            }
          }
        ]
      },
      { separator: true },
      {
        label: 'Close',
        shortcut: isWindowsOrLinux ? 'Ctrl+Alt+W' : isMacOs ? '⌘⌥W' : undefined,
        command: () => {
          emit('close');
        },
        disabled: () => !props.hasFiles
      },
      {
        label: 'Close All',
        command: () => {
          emit('closeAll');
        },
        disabled: () => !props.hasFiles
      }
    ]
  },
  /* TODO: enable the settings menu once we have settings for OpenCOR's Web app.
  {
    label: 'Tools',
    items: [
      {
        label: 'Settings...',
        shortcut: isWindowsOrLinux ? 'Ctrl+Alt+,' : isMacOs ? '⌘⌥,' : undefined,
        command: () => {
          emit('settings');
        }
      }
    ]
  },
  */
  {
    label: 'Help',
    items: [
      {
        label: 'Home Page',
        command: () => {
          window.open('https://opencor.ws/');
        }
      },
      { separator: true },
      {
        label: 'Changelog',
        command: () => {
          emit('changelog');
        }
      },
      { separator: true },
      {
        label: 'Report Issue',
        command: () => {
          window.open('https://github.com/opencor/webapp/issues/new');
        }
      },
      { separator: true },
      {
        label: 'About OpenCOR',
        command: () => {
          emit('about');
        }
      }
    ]
  }
]);

// A few things that can only be done when the component is mounted.

const menuBarRef = vue.shallowRef<(InstanceType<typeof Menubar> & { hide: () => void; $el: HTMLElement }) | null>(null);

vue.onMounted(() => {
  if (menuBarRef.value) {
    // Ensure that the menubar never gets the 'p-menubar-mobile' class, which would turn it into a hamburger menu.

    const menuBarElement = menuBarRef.value.$el;
    const mutationObserver = new MutationObserver(() => {
      if (menuBarElement.classList.contains('p-menubar-mobile')) {
        menuBarElement.classList.remove('p-menubar-mobile');
      }
    });

    mutationObserver.observe(menuBarElement, { attributes: true, attributeFilter: ['class'] });

    // Close the menu when clicking on the menubar but outside of the main menu items.
    // Note: we listen to the document, but event.target is the element that was actually clicked within our shadow root
    //       (see src/common/shadowCompat.ts).

    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        menuBarElement.contains(target) &&
        !menuBarElement.querySelector('.p-menubar-root-list')?.contains(target) &&
        !Array.from(menuBarElement.querySelectorAll('.p-menubar-submenu')).some((submenu) => submenu.contains(target))
      ) {
        menuBarRef.value?.hide();
      }
    };

    document.addEventListener('click', onClick);

    // Clean up the mutation observer and event listener when the component is unmounted.

    vue.onBeforeUnmount(() => {
      mutationObserver.disconnect();

      document.removeEventListener('click', onClick);
    });
  }
});

// Keyboard shortcuts.

useOpenCORKeyStroke((event: KeyboardEvent) => {
  if (common.isCtrlOrCmd(event) && !event.shiftKey && event.altKey && event.code === 'KeyO') {
    event.preventDefault();

    emit('open');
  } else if (common.isCtrlOrCmd(event) && event.shiftKey && event.altKey && event.code === 'KeyO') {
    event.preventDefault();

    emit('openRemote');
  } else if (props.hasFiles && common.isCtrlOrCmd(event) && !event.shiftKey && event.altKey && event.code === 'KeyW') {
    event.preventDefault();

    emit('close');
    /* TODO: enable the settings menu once we have settings for OpenCOR's Web app.
  } else if (common.isCtrlOrCmd(event) && !event.shiftKey && event.altKey && event.code === 'Comma') {
    event.preventDefault();

    emit('settings');
    */
  }
});
</script>

<style scoped>
.p-menubar {
  position: relative;
  padding: 0.1rem;
  border: none;
  border-radius: 0;
  border-bottom: 1px solid var(--border-color);
}

.p-menubar
  > :deep(.p-menubar-root-list)
  > .p-menubar-item
  > .p-menubar-item-content
  > .p-menubar-item-link
  .p-menubar-submenu-icon {
  display: none;
}

:deep(.p-menubar-root-list > .p-menubar-item > .p-menubar-item-content > .p-menubar-item-link) {
  transition: background-color 0.15s ease;
  border-radius: var(--p-menubar-item-border-radius);
}

:deep(.p-menubar-root-list > .p-menubar-item > .p-menubar-item-content > .p-menubar-item-link:hover) {
  background-color: var(--p-content-hover-background);
}

:deep(.p-menubar-submenu .p-menubar-item-link:hover:not(:has(.p-menubar-submenu))) {
  border-radius: var(--p-menubar-item-border-radius);
  background-color: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

:deep(.p-menubar-submenu .p-menubar-item-link:hover:not(:has(.p-menubar-submenu)) .shortcut) {
  border-color: var(--p-primary-contrast-color);
  background-color: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

:deep(.p-menubar-submenu .p-menubar-item-link:hover:not(:has(.p-menubar-submenu)) > .p-menubar-submenu-icon) {
  color: var(--p-primary-contrast-color) !important;
}

.p-menubar-item-link {
  padding: 0.25rem 0.5rem !important;
  color: var(--p-menubar-item-color);
}

:deep(.p-menubar-root-list) {
  gap: 0.1rem;
}

:deep(.p-menubar-submenu) {
  padding: 0.1rem;
  z-index: 99;
}

.shortcut {
  border-color: var(--p-content-border-color);
  background-color: var(--p-content-hover-background);
  color: var(--p-text-muted-color);
}

.update-link {
  color: var(--p-primary-color);
  font-weight: 500;
  font-size: 0.6875rem;
}

.update-link:hover {
  background-color: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
}
</style>
