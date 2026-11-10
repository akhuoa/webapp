<template>
  <Menubar ref="menuBarRef" :id="props.id" :model="items">
    <template #item="{ item, props, root }">
      <a v-bind="props.action">
        <i v-if="!root" :class="item.icon" class="menu-item-icon shrink-0" />
        <div class="p-menubar-item-label">{{ item.label }}</div>
        <i v-if="item.external" class="menu-item-external ml-auto pl-6 pi pi-external-link" />
        <div v-if="item.shortcut" class="shortcut ml-auto pl-6 whitespace-nowrap">
          {{ item.shortcut }}
        </div>
        <i v-if="item.items && !root" class="menu-item-chevron ml-auto pl-6 pi pi-angle-right" />
      </a>
    </template>
    <template #end>
      <button v-if="updateAvailable" class="update-link absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 whitespace-nowrap px-2.5 py-0.5 text-xs cursor-pointer rounded-full transition-colors duration-150"
        type="button"
        @click="emit('updateAvailable')"
      >
        <i class="pi pi-arrow-circle-up text-xs" />
        New version available
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
  canSave: boolean;
  canSaveAs: boolean;
  recentFilePaths: string[];
}>();

const emit = defineEmits<{
  about: [];
  changelog: [];
  clearRecentFiles: [];
  close: [];
  closeAll: [];
  download: [];
  open: [];
  openLocation: [];
  openSampleLorenz: [];
  reopen: [filePath: string];
  save: [];
  saveAs: [];
  settings: [];
  updateAvailable: [];
}>();

const { themeCanBeChanged } = useOpenCORContext();

const isWindowsOrLinux = common.isWindows() || common.isLinux();
const isMacOs = common.isMacOs();
const hasSaveFilePicker = common.hasSaveFilePicker();
const updateAvailable = version.updateAvailable;

// Theme button, which allows the user to cycle through the system, light, and dark themes.

const theme = vueCommon.useTheme();

// Reopen the most recent file, if any.

const reopenMostRecentFile = (): void => {
  const filePath = props.recentFilePaths[0];

  if (filePath) {
    emit('reopen', filePath);
  }
};

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
        icon: 'pi pi-folder-open',
        shortcut: isWindowsOrLinux ? 'Ctrl+Alt+O' : isMacOs ? '⌘⌥O' : undefined,
        command: () => {
          emit('open');
        }
      },
      {
        label: 'Open Location...',
        icon: 'pi pi-link',
        shortcut: isWindowsOrLinux ? 'Ctrl+Shift+Alt+O' : isMacOs ? '⇧⌘⌥O' : undefined,
        command: () => {
          emit('openLocation');
        }
      },
      {
        label: 'Open Sample',
        icon: 'pi pi-book',
        items: [
          {
            label: 'Lorenz',
            icon: 'pi pi-file',
            command: () => {
              emit('openSampleLorenz');
            }
          }
        ]
      },
      { separator: true },
      {
        label: 'Reopen',
        icon: 'pi pi-replay',
        items: [
          {
            label: 'Most Recent',
            icon: 'pi pi-clock',
            shortcut: isWindowsOrLinux ? 'Ctrl+Shift+Alt+T' : isMacOs ? '⇧⌘⌥T' : undefined,
            command: reopenMostRecentFile,
            disabled: () => !props.recentFilePaths.length
          },
          ...(props.recentFilePaths.length
            ? [
                { separator: true },
                ...props.recentFilePaths.map((filePath: string) => {
                  return {
                    label: filePath,
                    icon: 'pi pi-file',
                    command: () => {
                      emit('reopen', filePath);
                    }
                  };
                })
              ]
            : []),
          { separator: true },
          {
            label: 'Clear Menu',
            icon: 'pi pi-trash',
            command: () => {
              emit('clearRecentFiles');
            },
            disabled: () => !props.recentFilePaths.length
          }
        ]
      },
      { separator: true },
      // Note: without a save file picker, saving a file means downloading it, so we only offer to download it.
      ...(hasSaveFilePicker
        ? [
            {
              label: 'Save',
              icon: 'pi pi-save',
              shortcut: isWindowsOrLinux ? 'Ctrl+Alt+S' : isMacOs ? '⌘⌥S' : undefined,
              command: () => {
                emit('save');
              },
              disabled: () => !props.canSave
            },
            {
              label: 'Save As...',
              icon: 'pi pi-file-export',
              shortcut: isWindowsOrLinux ? 'Ctrl+Shift+Alt+S' : isMacOs ? '⇧⌘⌥S' : undefined,
              command: () => {
                emit('saveAs');
              },
              disabled: () => !props.canSaveAs
            }
          ]
        : [
            {
              label: 'Download',
              icon: 'pi pi-download',
              shortcut: isWindowsOrLinux ? 'Ctrl+Alt+S' : isMacOs ? '⌘⌥S' : undefined,
              command: () => {
                emit('download');
              },
              disabled: () => !props.canSaveAs
            }
          ]),
      { separator: true },
      {
        label: 'Close',
        icon: 'pi pi-times',
        shortcut: isWindowsOrLinux ? 'Ctrl+Alt+W' : isMacOs ? '⌘⌥W' : undefined,
        command: () => {
          emit('close');
        },
        disabled: () => !props.hasFiles
      },
      {
        label: 'Close All',
        icon: 'pi pi-times-circle',
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
        icon: 'pi pi-cog',
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
        icon: 'pi pi-home',
        external: true,
        command: () => {
          window.open('https://opencor.ws/');
        }
      },
      { separator: true },
      {
        label: 'Changelog',
        icon: 'pi pi-history',
        command: () => {
          emit('changelog');
        }
      },
      { separator: true },
      {
        label: 'Report Issue',
        icon: 'pi pi-github',
        external: true,
        command: () => {
          window.open('https://github.com/opencor/webapp/issues/new');
        }
      },
      { separator: true },
      {
        label: 'About OpenCOR',
        icon: 'pi pi-info-circle',
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

    emit('openLocation');
  } else if (common.isCtrlOrCmd(event) && event.shiftKey && event.altKey && event.code === 'KeyT') {
    event.preventDefault();

    reopenMostRecentFile();
  } else if (
    hasSaveFilePicker &&
    props.canSave &&
    common.isCtrlOrCmd(event) &&
    !event.shiftKey &&
    event.altKey &&
    event.code === 'KeyS'
  ) {
    event.preventDefault();

    emit('save');
  } else if (
    hasSaveFilePicker &&
    props.canSaveAs &&
    common.isCtrlOrCmd(event) &&
    event.shiftKey &&
    event.altKey &&
    event.code === 'KeyS'
  ) {
    event.preventDefault();

    emit('saveAs');
  } else if (
    !hasSaveFilePicker &&
    props.canSaveAs &&
    common.isCtrlOrCmd(event) &&
    !event.shiftKey &&
    event.altKey &&
    event.code === 'KeyS'
  ) {
    event.preventDefault();

    emit('download');
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
  --p-menubar-padding: 0.125rem 0.25rem;
  --p-menubar-base-item-padding: 0.25rem 0.5rem;
  --p-menubar-item-padding: 0.375rem 0.5rem;
  --p-menubar-submenu-padding: 0.25rem;
  --p-menubar-submenu-border-radius: 0.5rem;
  --p-menubar-submenu-shadow: var(--opencor-overlay-shadow);

  position: relative;
  border: none;
  border-radius: 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.875rem;
}

:deep(.p-menubar-root-list) {
  gap: 0.125rem;
}

:deep(.p-menubar-item-link) {
  color: var(--p-menubar-item-color);
}

/**
 * Only highlight a root item when it is hovered, when its submenu is shown, or when it has the keyboard focus, i.e. not
 * when it has the focus as a result of a mouse click (which would otherwise leave it highlighted after a menu item has
 * been selected).
 */

:deep(
  .p-menubar-root-list:not(:focus-visible)
    > .p-menubar-item.p-focus:not(.p-menubar-item-active)
    > .p-menubar-item-content:not(:hover)
) {
  background-color: transparent;
  color: var(--p-menubar-item-color);
}

/**
 * Submenus, which are slightly detached from their parent item.
 */

:deep(.p-menubar-submenu) {
  min-width: 14rem;
  z-index: 99;
}

:deep(.p-menubar-root-list > .p-menubar-item > .p-menubar-submenu) {
  margin-top: 0.25rem;
}

:deep(.p-menubar-submenu .p-menubar-submenu) {
  margin-top: calc(-1 * var(--p-menubar-submenu-padding) - 1px);
  margin-left: 0.25rem;
}

:deep(.p-menubar-separator) {
  margin: 0.125rem 0.5rem;
}

.menu-item-icon {
  width: 1rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  text-align: center;
}

.menu-item-external {
  color: var(--p-text-muted-color);
  font-size: 0.625rem;
  opacity: 0.7;
}

.menu-item-chevron {
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}

.shortcut {
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
}

:deep(.p-menubar-item.p-focus) > .p-menubar-item-content .menu-item-icon,
:deep(.p-menubar-item-active) > .p-menubar-item-content .menu-item-icon,
:deep(.p-menubar-item.p-focus) > .p-menubar-item-content .menu-item-chevron,
:deep(.p-menubar-item-active) > .p-menubar-item-content .menu-item-chevron {
  color: var(--p-text-color);
}

.update-link {
  background-color: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
  color: var(--p-primary-color);
  font-weight: 500;
  font-size: 0.6875rem;
}

.update-link:hover {
  background-color: color-mix(in srgb, var(--p-primary-color) 18%, transparent);
}
</style>
