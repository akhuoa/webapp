<template>
  <div class="background" :class="{ 'background-with-actions': actions, 'background-with-recent-files': actions && recentFiles.length }">
    <div class="background-pattern" />
    <div class="background-scroll">
      <div class="background-contents" :style="{ '--recent-file-count': recentFiles.length }">
        <img class="logo" src="../assets/logo.svg" alt="OpenCOR" />
        <template v-if="actions">
          <div class="actions opencor-panel">
            <button v-for="action in ACTIONS" :key="action.label" class="action"
              type="button"
              @mousedown.prevent
              @click="action.command"
            >
              <i :class="action.icon" class="action-icon" />
              <span class="action-label">{{ action.label }}</span>
              <kbd v-if="action.shortcut" class="action-shortcut">{{ action.shortcut }}</kbd>
            </button>
          </div>
          <p class="drop-hint">
            <i class="pi pi-upload" />
            Files can also be dropped here.
          </p>
          <section v-if="recentFiles.length" class="recent-files">
            <div class="opencor-section-title">Recent</div>
            <div class="recent-files-list opencor-panel">
              <button v-for="recentFile in recentFiles" :key="recentFile.path" class="recent-file"
                type="button"
                v-hint="recentFile.path"
                @mousedown.prevent
                @click="emit('openRecentFile', recentFile.path)"
              >
                <i class="pi pi-file recent-file-icon" />
                <span class="recent-file-name">{{ recentFile.name }}</span>
                <span class="recent-file-location">{{ recentFile.location }}</span>
              </button>
            </div>
          </section>
        </template>
      </div>
      <div class="footer">
        <span>Version {{ currentVersion }}</span>
        <span class="footer-copyright"> · Copyright © {{ COPYRIGHT }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import * as vue from 'vue';

import * as common from '../common/common';
import { COPYRIGHT } from '../common/constants';
import { electronApi } from '../common/electronApi';
import { vHint } from '../common/hint';
import { currentVersion } from '../common/version';

// Our background, i.e. what is shown when no file is open. It shows our logo and, if requested, some actions to get
// started, as well as our most recent files, if any.

const props = withDefaults(
  defineProps<{
    actions?: boolean;
    recentFilePaths?: string[];
  }>(),
  {
    recentFilePaths: () => []
  }
);

const emit = defineEmits<{
  open: [];
  openRecentFile: [filePath: string];
  openLocation: [];
  openSampleLorenz: [];
}>();

// Our most recent files, i.e. their path, as well as their name and location (i.e. the path of their folder), which we
// show separately.
// Note: we only show a few of them since our Reopen menu lists all of them anyway.

const MAX_SHOWN_RECENT_FILES = 5;

const recentFiles = vue.computed<{ path: string; name: string; location: string }[]>(() => {
  return props.recentFilePaths.slice(0, MAX_SHOWN_RECENT_FILES).map((path) => {
    const name = common.fileName(path);

    return {
      path,
      name,
      location: path.slice(0, path.length - name.length).replace(/[/\\]$/, '')
    };
  });
});

// Our actions, along with their keyboard shortcut.
// Note: our shortcuts must be in sync with those of our main menu, i.e. src/main/MainMenu.ts for OpenCOR and
//       MainMenu.vue for OpenCOR's Web app.

const isWindowsOrLinux = common.isWindows() || common.isLinux();
const isMacOs = common.isMacOs();

const shortcut = (windowsOrLinuxShortcut: string, macOsShortcut: string): string | undefined => {
  return isWindowsOrLinux ? windowsOrLinuxShortcut : isMacOs ? macOsShortcut : undefined;
};

const ACTIONS: { label: string; icon: string; shortcut?: string; command: () => void }[] = [
  {
    label: 'Open...',
    icon: 'pi pi-folder-open',
    shortcut: electronApi ? shortcut('Ctrl+O', '⌘O') : shortcut('Ctrl+Alt+O', '⌘⌥O'),
    command: () => {
      emit('open');
    }
  },
  {
    label: 'Open Location...',
    icon: 'pi pi-link',
    shortcut: electronApi ? shortcut('Ctrl+Shift+O', '⇧⌘O') : shortcut('Ctrl+Shift+Alt+O', '⇧⌘⌥O'),
    command: () => {
      emit('openLocation');
    }
  },
  {
    label: 'Open the Lorenz Sample',
    icon: 'pi pi-book',
    command: () => {
      emit('openSampleLorenz');
    }
  }
];
</script>

<style scoped>
/**
 * Note: we may be shown in a small container (e.g., when OpenCOR is embedded in a page alongside other OpenCOR
 *       instances), so we adapt our contents to the size of our container: our recent files get hidden, our logo gets
 *       smaller and then gets hidden, followed by our footer and drop hint, and then our actions get shown on one row.
 *       If our container is still too small, then our contents can be scrolled (rather than be clipped).
 */

.background {
  --reserved-height: 4rem;
  position: relative;
  height: 100%;
  overflow: hidden;
  background-color: var(--p-content-background);
  container-type: size;
}

.background-with-actions {
  --reserved-height: 15rem;
}

/**
 * Note: our recent files take some room (i.e. a title and a row, with its spacing, for each of them), which our logo
 *       must leave for them (see .logo).
 */

.background-with-recent-files .background-contents {
  --reserved-height: calc(18.75rem + var(--recent-file-count) * 2.3125rem);
}

/**
 * A subtle dot grid, which fades out towards our edges.
 */

.background-pattern {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(color-mix(in srgb, var(--p-text-color) 18%, transparent) 1px, transparent 1px);
  background-size: 1.25rem 1.25rem;
  pointer-events: none;
  mask-image: radial-gradient(ellipse at center, #000 0%, transparent 70%);
}

/**
 * Note: our contents are centred using an auto margin (rather than using justify-content), so that they can still be
 *       scrolled to in full when they don't fit.
 */

.background-scroll {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.background-contents {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  width: 100%;
  max-width: 20rem;
  margin: auto;
  padding: 1rem;
}

/**
 * Note: our logo's original dimensions are 828.12px x 704.92px, i.e. it has an aspect ratio of about 1.1748. Its width
 *       is such that our logo, the rest of our contents (i.e. our reserved height), and our footer fit in our
 *       container.
 */

.logo {
  width: min(12rem, 100cqw - 2rem, (100cqh - var(--reserved-height)) * 1.1748);
  min-width: 3rem;
  user-select: none;
  -webkit-user-drag: none;
}

/**
 * Actions.
 */

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  width: 100%;
  padding: 0.25rem;
}

.action {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.4375rem 0.625rem;
  border: none;
  border-radius: 0.375rem;
  background: none;
  color: var(--p-text-color);
  font-size: 0.875rem;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.action:hover {
  background-color: color-mix(in srgb, var(--p-text-color) 6%, transparent);
}

.action:active {
  background-color: color-mix(in srgb, var(--p-text-color) 10%, transparent);
}

.action:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--p-primary-color);
}

.action-icon {
  color: var(--p-primary-color);
  font-size: 0.875rem;
}

.action-label {
  flex-grow: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.action-shortcut {
  color: var(--p-text-muted-color);
  font-family: inherit;
  font-size: 0.75rem;
}

/**
 * Recent files.
 */

.recent-files {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
}

.recent-files-list {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.25rem;
}

.recent-file {
  display: flex;
  align-items: baseline;
  gap: 0.625rem;
  width: 100%;
  padding: 0.4375rem 0.625rem;
  border: none;
  border-radius: 0.375rem;
  background: none;
  color: var(--p-text-color);
  font-size: 0.875rem;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.recent-file:hover {
  background-color: color-mix(in srgb, var(--p-text-color) 6%, transparent);
}

.recent-file:active {
  background-color: color-mix(in srgb, var(--p-text-color) 10%, transparent);
}

.recent-file:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--p-primary-color);
}

.recent-file-icon {
  align-self: center;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

/**
 * Note: the location of a recent file only gets the room that its name doesn't need, so that its name gets truncated
 *       only if it doesn't fit on its own (the full path of a recent file is shown in its hint anyway).
 */

.recent-file-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-file-location {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  text-overflow: ellipsis;
}

/**
 * Drop hint.
 */

.drop-hint {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin: -0.75rem 0 0;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  white-space: nowrap;
}

.drop-hint .pi {
  font-size: 0.75rem;
}

/**
 * Footer.
 */

.footer {
  flex-shrink: 0;
  padding: 0 0.5rem 0.375rem;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
  user-select: none;
}

/**
 * Adapt our contents to the size of our container.
 */

@container (width < 24rem) {
  .footer-copyright {
    display: none;
  }
}

@container (width < 16rem) {
  .action-shortcut,
  .drop-hint {
    display: none;
  }
}

@container (height < 33rem) {
  .recent-files {
    display: none;
  }

  .background-with-recent-files .background-contents {
    --reserved-height: 15rem;
  }
}

@container (height < 19rem) {
  .background-with-actions .logo {
    display: none;
  }
}

@container (height < 14rem) {
  .drop-hint,
  .background-with-actions .footer {
    display: none;
  }
}

@container (height < 8rem) {
  .footer {
    display: none;
  }
}

@container (height < 10rem) {
  .background-with-actions .background-contents {
    max-width: none;
    padding: 0.5rem;
  }

  .actions {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    width: auto;
  }

  .action {
    width: auto;
  }

  .action-shortcut {
    display: none;
  }
}
</style>
