import * as vueusecore from '@vueuse/core';

import * as vue from 'vue';

import type { OpenCORTheme } from '../../index';

import * as locSedApi from '../libopencor/locSedApi';

import { COPY_FEEDBACK_LIFE, MEDIUM_DELAY, NARROW_LAYOUT_WIDTH, VERY_SHORT_DELAY } from './constants';
import { electronApi } from './electronApi';

// A composable to know whether the given element is narrow (i.e. narrower than NARROW_LAYOUT_WIDTH), in which case it
// should use a narrow layout (e.g., a simulation experiment view stacks its side panel above its plots rather than
// shows it to their left, so that its plots remain usable on a phone or when OpenCOR is embedded in a small container).
// Note #1: we use the width of the given element (rather than that of the window), since OpenCOR may not take the whole
//          window (e.g., when it is embedded in a page).
// Note #2: we ignore a width of zero, which means that the given element is not shown (e.g., if it is in a view that
//          is not currently shown), so that our layout doesn't change for nothing.

export const useNarrowLayout = (elementRef: vue.Ref<HTMLElement | null>): vue.Ref<boolean> => {
  const narrowLayout = vue.ref<boolean>(false);
  const { width } = vueusecore.useElementSize(() => elementRef.value, undefined, { box: 'border-box' });

  vue.watch(width, (newWidth: number) => {
    if (newWidth > 0) {
      narrowLayout.value = newWidth < NARROW_LAYOUT_WIDTH;
    }
  });

  return narrowLayout;
};

// A constant to know the UID of the active instance of OpenCOR.

export const activeInstanceUid = vueusecore.createGlobalState(() => vue.ref<string | null>(null));

// A composable to know whether an instance of OpenCOR uses light mode, dark mode, or system mode.
// Note: each instance of OpenCOR has its own theme (see provideTheme()), which it applies to its own shadow root (see
//       OpenCORCore.vue), so that different instances can use different themes (e.g., if a host application gives them
//       different themes) and so that our theme doesn't affect a host application.

export interface ITheme {
  theme: () => OpenCORTheme;
  setTheme: (newTheme: OpenCORTheme | undefined) => void;
  applyTheme: (newTheme: OpenCORTheme) => void;
  useLightMode: () => boolean;
  useDarkMode: () => boolean;
}

const ThemeKey: vue.InjectionKey<ITheme> = Symbol('Theme');

export const provideTheme = (): ITheme => {
  const prefersColorScheme = window.matchMedia('(prefers-color-scheme: light)');
  const isLightMode = vue.ref(prefersColorScheme.matches);
  const isDarkMode = vue.ref(!prefersColorScheme.matches);
  const _theme = vue.ref<OpenCORTheme>('system');

  const updateLightAndDarkModes = (prefersColorScheme: MediaQueryList | MediaQueryListEvent) => {
    isLightMode.value = prefersColorScheme.matches;
    isDarkMode.value = !prefersColorScheme.matches;
  };

  const onPrefersColorSchemeChange = (event: MediaQueryListEvent) => {
    if (_theme.value === 'system') {
      updateLightAndDarkModes(event);
    }
  };

  prefersColorScheme.addEventListener('change', onPrefersColorSchemeChange);

  vue.onScopeDispose(() => {
    prefersColorScheme.removeEventListener('change', onPrefersColorSchemeChange);
  });

  const theme = (): OpenCORTheme => {
    return _theme.value;
  };

  const setTheme = (newTheme: OpenCORTheme | undefined) => {
    // Note: the given theme may come from our settings, which may have been edited by hand, so we fall back on the
    //       system theme for anything that is not a valid theme.

    _theme.value = newTheme === 'light' || newTheme === 'dark' ? newTheme : 'system';

    if (_theme.value === 'light') {
      isLightMode.value = true;
      isDarkMode.value = false;
    } else if (_theme.value === 'dark') {
      isLightMode.value = false;
      isDarkMode.value = true;
    } else {
      updateLightAndDarkModes(prefersColorScheme);
    }
  };

  const applyTheme = (newTheme: OpenCORTheme) => {
    // Set the given theme and let Electron know about it (e.g., for its dialogs), if we are running in Electron.
    // Note: unlike setTheme(), this is to be used when the user changes our theme, not when we initialise it.

    setTheme(newTheme);

    electronApi?.applyTheme(_theme.value);
  };

  const useLightMode = (): boolean => {
    return isLightMode.value;
  };

  const useDarkMode = (): boolean => {
    return isDarkMode.value;
  };

  const res: ITheme = {
    theme,
    setTheme,
    applyTheme,
    useLightMode,
    useDarkMode
  };

  vue.provide(ThemeKey, res);

  return res;
};

export const useTheme = (): ITheme => {
  const res = vue.inject(ThemeKey, undefined);

  if (!res) {
    throw new Error('useTheme() must be called within a component that has provideTheme() in its ancestor tree.');
  }

  return res;
};

// A composable to track the height of an element as a CSS variable.

export const trackElementHeight = (
  sourceElement: HTMLElement,
  targetElement: HTMLElement,
  cssVariableName: string
): (() => void) => {
  const updateHeight = () => {
    const height = sourceElement.offsetHeight;

    targetElement.style.setProperty(cssVariableName, `${height}px`);
  };

  // Set the initial height.

  updateHeight();

  // Watch for height changes, including border and padding changes.

  const { stop: stopTrackingElementHeight } = vueusecore.useResizeObserver(
    sourceElement,
    () => {
      updateHeight();
    },
    { box: 'border-box' }
  );

  // Return the function to stop tracking the element's height.

  return stopTrackingElementHeight;
};

// The overlay container of each OpenCOR instance (i.e. of each .opencor element), along with the number of components
// using it.
// Note: an overlay container is shared by all the components of an OpenCOR instance that use it, and it comes with a
//       window scroll listener, which keeps the container (and therefore, through its parent, the whole OpenCOR
//       instance) alive. So, we keep track of the number of components using an overlay container and remove both the
//       container and its window scroll listener once no component uses it anymore (e.g., once its OpenCOR instance has
//       been unmounted).

interface IOverlayContainer {
  element: HTMLElement;
  users: number;
  remove: () => void;
}

const overlayContainers = new WeakMap<Element, IOverlayContainer>();

const overlayContainer = (opencor: Element, containerClass: string): IOverlayContainer => {
  let res = overlayContainers.get(opencor);

  if (res) {
    return res;
  }

  // Remove any stale overlay container (e.g., one created by a previous version of this module following a hot module
  // replacement during development).

  opencor.querySelector(`:scope > .${containerClass}`)?.remove();

  // Create our overlay container.

  const divElement = document.createElement('div');

  divElement.className = containerClass;
  divElement.style.cssText =
    'position: fixed; top: 0; left: 0; width: 0; height: 0; overflow: visible; pointer-events: none; z-index: 99999;';

  // Restore pointer events for overlay content teleported into the container.

  divElement.appendChild(
    Object.assign(document.createElement('style'), {
      textContent: `.${containerClass} > * { pointer-events: auto; }`
    })
  );

  opencor.appendChild(divElement);

  const updateOffset = (): void => {
    divElement.style.top = `-${window.scrollY}px`;
    divElement.style.left = `-${window.scrollX}px`;
  };

  updateOffset();

  window.addEventListener('scroll', updateOffset, { passive: true });

  res = {
    element: divElement,
    users: 0,
    remove: () => {
      window.removeEventListener('scroll', updateOffset);

      divElement.remove();

      overlayContainers.delete(opencor);
    }
  };

  overlayContainers.set(opencor, res);

  return res;
};

// A composable that provides an overlay container as an append target for PrimeVue overlays. PrimeVue's
// `absolutePosition()` computes document-absolute coordinates (viewport-relative `getBoundingClientRect()` plus
// `windowScrollTop`/`windowScrollLeft`). The container uses `position: fixed` inside `.opencor`, and its `top`/`left`
// are dynamically negated by the current scroll offset (`-scrollY`/`-scrollX`). This converts PrimeVue's
// document-absolute coordinates back to viewport-relative, so overlays appear at the correct screen position regardless
// of the host app's scroll state.
//
// Keeping the container inside `.opencor` also ensures that overlays are visible when the host app uses full-screen
// mode (the Fullscreen API only renders the full-screen element and its CSS descendants), and that they inherit
// `.opencor`'s CSS properties through the DOM tree. It also ensures that overlays are within our shadow root, which is
// where our styles apply (see src/element.ts). So, an overlay must never be appended to the host document's body (e.g.,
// using `appendTo="body"`, which is PrimeVue's default).

export const useAppendTarget = (ancestorRef: vue.Ref<HTMLElement | null>) => {
  const appendTarget = vue.shallowRef<HTMLElement | undefined>(undefined);
  const containerClass = 'opencor-overlay-container';
  let usedOverlayContainer: IOverlayContainer | null = null;

  vue.onMounted(() => {
    const opencor = ancestorRef.value?.closest('.opencor');

    if (opencor) {
      usedOverlayContainer = overlayContainer(opencor, containerClass);

      ++usedOverlayContainer.users;

      appendTarget.value = usedOverlayContainer.element;
    }
  });

  vue.onBeforeUnmount(() => {
    if (usedOverlayContainer && --usedOverlayContainer.users === 0) {
      usedOverlayContainer.remove();
    }

    usedOverlayContainer = null;
  });

  return appendTarget;
};

// The props of a toolbar button (see ToolbarButtonWidget.vue).
// Note #1: they are defined here so that they can also be used by code that computes some of them (see
//          useCopyToClipboard()).
// Note #2: a shortcut is both shown in the tooltip of a toolbar button and used as the value of its aria-keyshortcuts
//          attribute, so it must be valid for the latter (e.g., "F9" or "Control+Shift+O", see
//          https://www.w3.org/TR/wai-aria-1.2/#aria-keyshortcuts). This is not the case for a shortcut as it is shown
//          elsewhere (e.g., "⌘O" or "Ctrl+O" in our main menu), in which case a separate prop would be needed for
//          aria-keyshortcuts (or our shortcut would need to be converted).

export interface IToolbarButtonProps {
  icon: string;
  label?: string;
  shortcut?: string;
  accent?: 'primary' | 'warning' | 'danger';
  disabled?: boolean;
  small?: boolean;
  tooltipAlign?: 'start' | 'end';
  feedback?: boolean;
  keepFocus?: boolean;
}

// A composable to copy some text to the clipboard and to let people know, for a short while, whether it was copied,
// through the icon, label, and accent of the (toolbar) button that was used to copy it (see ToolbarButtonWidget.vue).
// Note: copying is asynchronous, so we may get reset (e.g., if our dialog gets closed) or unmounted in the meantime, in
//       which case we don't let people know whether the text was copied (since it would be out of context).

export const useCopyToClipboard = () => {
  const status = vue.ref<'idle' | 'copied' | 'failed'>('idle');
  let statusTimer: number | undefined;
  let copyNumber = 0;
  let unmounted = false;

  const copy = async (text: string): Promise<void> => {
    const crtCopyNumber = ++copyNumber;
    let copied = true;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      copied = false;
    }

    if (unmounted || crtCopyNumber !== copyNumber) {
      return;
    }

    status.value = copied ? 'copied' : 'failed';

    window.clearTimeout(statusTimer);

    statusTimer = window.setTimeout(() => {
      status.value = 'idle';
    }, COPY_FEEDBACK_LIFE);
  };

  const reset = (): void => {
    ++copyNumber;

    window.clearTimeout(statusTimer);

    status.value = 'idle';
  };

  // Note: our feedback (i.e. "Copied" or "Could not copy") is shown in the tooltip of our button, which must therefore
  //       be shown even though our button has just been pressed (see ToolbarButtonWidget.vue).

  const buttonProps = (label: string): Pick<IToolbarButtonProps, 'icon' | 'label' | 'accent' | 'feedback'> => {
    if (status.value === 'copied') {
      return { icon: 'pi pi-check', label: 'Copied', accent: 'primary', feedback: true };
    }

    if (status.value === 'failed') {
      return { icon: 'pi pi-times', label: 'Could not copy', accent: 'danger', feedback: true };
    }

    return { icon: 'pi pi-copy', label };
  };

  vue.onBeforeUnmount(() => {
    unmounted = true;

    window.clearTimeout(statusTimer);
  });

  return { copy, reset, buttonProps };
};

// Populate the parameters of the given instance task.
// Note: we collect our parameters into a plain array (rather than push them one by one into our reactive array, which
//       would go through Vue's reactivity for each of them), sort them using a collator (which is faster than
//       String.prototype.localeCompare() for a large number of comparisons), and then update our reactive array once.

const parametersCollator = new Intl.Collator();

export const populateParameters = (
  parameters: vue.Ref<string[]>,
  instanceTask: locSedApi.SedInstanceTask,
  onlyEditableModelParameters = false
): void => {
  const res = [...parameters.value];

  if (!onlyEditableModelParameters) {
    res.push(instanceTask.voiName());
  }

  const stateCount = instanceTask.stateCount();

  for (let i = 0; i < stateCount; ++i) {
    res.push(instanceTask.stateName(i));
  }

  if (!onlyEditableModelParameters) {
    const rateCount = instanceTask.rateCount();

    for (let i = 0; i < rateCount; ++i) {
      res.push(instanceTask.rateName(i));
    }
  }

  const constantCount = instanceTask.constantCount();

  for (let i = 0; i < constantCount; ++i) {
    res.push(instanceTask.constantName(i));
  }

  if (!onlyEditableModelParameters) {
    const computedConstantCount = instanceTask.computedConstantCount();

    for (let i = 0; i < computedConstantCount; ++i) {
      res.push(instanceTask.computedConstantName(i));
    }

    const algebraicVariableCount = instanceTask.algebraicVariableCount();

    for (let i = 0; i < algebraicVariableCount; ++i) {
      res.push(instanceTask.algebraicVariableName(i));
    }
  }

  // Sort the parameters alphabetically.

  res.sort(parametersCollator.compare);

  parameters.value = res;
};

// A helper function to wait while a simulation instance is running, yielding to the UI to keep it responsive.
// Note: we return a promise (that resolves when the simulation is idle) and a cancel function to clear any pending
//       progress reset timer (e.g., on component unmount).

export const waitWhileRunning = (
  instance: locSedApi.SedInstance,
  onProgress?: (progress: number) => void,
  onStatusChange?: (status: locSedApi.ESedInstanceStatus) => void,
  runAbortedRef?: vue.Ref<boolean>
): { promise: Promise<void>; cancel: () => void } => {
  let lastStatus: number | undefined;
  let progressResetTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;

  const cancel = (): void => {
    cancelled = true;

    clearTimeout(progressResetTimer);
  };

  const promise = new Promise<void>((resolve, reject) => {
    // Note: since we poll using setTimeout(), an error thrown while polling would otherwise be uncaught and our promise
    //       would never settle (meaning that our caller would wait forever and, for instance, never release its
    //       instance). So, an error thrown by one of our callbacks is reported, but doesn't stop us from polling, while
    //       an error thrown by our instance (e.g., by libOpenCOR) rejects our promise since we cannot know its status
    //       anymore.

    const callSafely = (callback: () => void): void => {
      try {
        callback();
      } catch (error: unknown) {
        console.error('OpenCOR: an error occurred while waiting for a simulation run to finish:', error);
      }
    };

    const poll = (): void => {
      if (cancelled) {
        resolve();

        return;
      }

      let status: locSedApi.ESedInstanceStatus;
      let progress = 0;

      try {
        status = instance.status();

        if (status === locSedApi.ESedInstanceStatus.RUNNING) {
          progress = instance.progress();
        }
      } catch (error: unknown) {
        cancel();

        reject(error);

        return;
      }

      if (status !== lastStatus) {
        lastStatus = status;

        callSafely(() => onStatusChange?.(status));
      }

      // Update the progress bar and keep polling while the simulation is running or paused, and resolve when the
      // simulation is idle.

      switch (status) {
        case locSedApi.ESedInstanceStatus.RUNNING:
          callSafely(() => onProgress?.(100 * progress));

          setTimeout(poll, VERY_SHORT_DELAY);

          break;
        case locSedApi.ESedInstanceStatus.PAUSED:
          setTimeout(poll, VERY_SHORT_DELAY);

          break;
        default: // locSedApi.ESedInstanceStatus.IDLE.
          if (onProgress && !runAbortedRef?.value) {
            callSafely(() => onProgress(100));

            // Reset the progress bar after a short delay.

            progressResetTimer = setTimeout(() => {
              if (!cancelled) {
                callSafely(() => onProgress(0));
              }
            }, MEDIUM_DELAY);
          }

          resolve();
      }
    };

    setTimeout(poll, 0);
  });

  return { promise, cancel };
};

// A helper function to generate a trace name from optional name and X/Y values.

export const traceName = (name: string | undefined, xValue: string, yValue: string): string => {
  return name ?? `${yValue} <i>vs.</i> ${xValue}`;
};
