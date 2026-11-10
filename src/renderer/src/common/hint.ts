import type * as vue from 'vue';

import { HINT_DELAY } from './constants';

// A directive that shows a hint for an element (e.g., v-hint="'Close'"), i.e. a replacement for the native tooltip of
// an element (which we can't style and which is shown after a long delay), which looks like the tooltip of our toolbar
// buttons (see ToolbarButtonWidget.vue).
// Note #1: our hint is shown, without any animation, after a short delay when our element is hovered, and straightaway
//          when our element (or an element within it, see Note #7) gets a focus ring (i.e. when it is focused using the
//          keyboard or, for a text field, when it is focused in any way). It is hidden as soon as our element is left
//          (unless it has a focus ring, so that our hint doesn't disappear while our element is focused, e.g., some
//          help about an input field while the user is typing something in it), pressed (using a pointing device),
//          blurred, or hidden (see Note #9), or Escape is pressed (see Note #10), and it isn't shown if our element is
//          no longer visible by the time it is to be shown.
// Note #2: our hint is shown below our element (or above it if there is not enough room below it) and is kept within
//          the window. It has a fixed position and is appended to our OpenCOR instance (rather than to our element) so
//          that it doesn't get clipped by an ancestor of our element (e.g., a scroll panel), while still being styled
//          like the rest of our OpenCOR instance (see .opencor-hint in app.css).
// Note #3: only one hint is shown at any given time.
// Note #4: like a native tooltip, our hint isn't shown when hovering an element that ignores pointer events (e.g., the
//          reset button of one of our input widgets when it is disabled), although it is still shown if that element
//          gets a focus ring.
// Note #5: our hint can contain some HTML (e.g., v-hint.html="'<em>Some</em> help'"), in which case it is a "rich" hint
//          (e.g., some help about an input field or a table of values). A rich hint wraps sooner (to keep its lines
//          easy to read) and, unlike a plain hint, it isn't hidden when our element is pressed (so that, for instance,
//          some help about an input field doesn't disappear as soon as the user clicks in it to type something). The
//          HTML of a rich hint is used as is, so any untrusted text in it (e.g., the name of a simulation input) must
//          be escaped (see common.escapeHtml()).
// Note #6: our element may contain an element that has its own hint (e.g., the close button of a file tab), in which
//          case the hint of the inner element replaces ours while it is hovered, and ours is shown again (after the
//          usual delay) when the inner element is left for our element. Similarly, only the hint of the inner element
//          is shown when it (or an element within it) is focused using the keyboard.
// Note #7: we listen to focusin/focusout (rather than focus/blur, which don't bubble) so that our hint is also shown
//          when our element contains the focused element (e.g., a float label that contains an input field).
// Note #8: our hint is hidden from assistive technologies (since it is a visual aid that isn't linked to our element),
//          so a plain hint is also used as the accessible name of our element if our element has no accessible name of
//          its own (e.g., an icon-only button), i.e. no text, no aria-label, aria-labelledby, title, or alt attribute,
//          and no label (e.g., an input field with a <label for="...">).
// Note #9: our element may get hidden (or removed from the DOM) while our hint is shown, without being left or blurred
//          (e.g., if the user switches to another file tab using the keyboard while our element is hovered or focused,
//          or if our element is activated using the keyboard and gets hidden once what it does has been done, like
//          a recent file on our start screen once it has been opened), so we check our element on every animation
//          frame while our hint is shown, and hide our hint if our element is no longer visible. Similarly, our element
//          may move while our hint is shown (e.g., if the file tab bar is scrolled using the mouse wheel), in which
//          case we reposition our hint.
// Note #10: like a native tooltip, our hint can be dismissed by pressing Escape, be it shown or about to be shown, in
//           which case it isn't shown again until our element is hovered (or focused) anew, i.e. after it has been left
//           (or blurred) or after an inner element with its own hint has been left for it (see Note #6).
//           Escape is otherwise left to do what it normally does (e.g., discard the value being edited in an input
//           field or close a dialog).
// Note #11: when our window loses the focus (e.g., when the user switches to another application), our hint gets
//           hidden (and the hint that is about to be shown, if any, cancelled), be it shown because our element is
//           hovered or focused. Our element may then get the focus back when our window regains the focus, but this is
//           not the user focusing our element (using the keyboard), so we don't show our hint again (which we would
//           otherwise do for a text field, see Note #1).

const HINT_OFFSET = 6; // Distance between our element and our hint.
const HINT_MARGIN = 4; // Minimum distance between our hint and the edges of the window.

interface IHintState {
  text: string;
  html: boolean;
  timer: number | undefined;
  ariaLabel: string | null;
  onPointerEnter: () => void;
  onPointerLeave: (event: PointerEvent) => void;
  onFocusIn: (event: FocusEvent) => void;
  onFocusOut: (event: FocusEvent) => void;
  onHide: () => void;
}

const states = new WeakMap<HTMLElement, IHintState>();

let hintElement: HTMLElement | null = null; // The element that shows our hint, if any.
let hintOwner: HTMLElement | null = null; // The element that our hint is about, if any.
let pendingHintState: IHintState | null = null; // The state of the element which hint is about to be shown, if any.
let visibilityCheckFrame: number | undefined; // The animation frame in which our element is to be checked, if any.
let hintOwnerRect: DOMRect | null = null; // The position and size of our element when our hint was last positioned.

// Keep track of whether our window has lost the focus (see Note #11 above).
// Note #1: when our window regains the focus, our element may get the focus back before or after our window gets its
//          focus event, so we only consider that our window has the focus again once the task that follows its focus
//          event has run (unless our window has lost the focus again in the meantime).
// Note #2: we only start tracking this when our directive is first used (so that no window listeners are added unless
//          hints are used), at which point we check whether our window currently has the focus (it may not, e.g., if
//          OpenCOR was started in the background).

let windowFocusLost = false;
let windowFocusTracked = false;
let windowFocusTimer: number | undefined;

const trackWindowFocus = (): void => {
  if (windowFocusTracked) {
    return;
  }

  windowFocusTracked = true;
  windowFocusLost = !document.hasFocus();

  window.addEventListener('blur', () => {
    window.clearTimeout(windowFocusTimer);

    windowFocusTimer = undefined;
    windowFocusLost = true;

    cancelPendingHint();
    hideHint();
  });

  window.addEventListener('focus', () => {
    window.clearTimeout(windowFocusTimer);

    windowFocusTimer = window.setTimeout(() => {
      windowFocusTimer = undefined;
      windowFocusLost = false;
    }, 0);
  });
};

// The text of our hint as it is displayed.
// Note: our hint may be the path or URL of a file, so we let it break after a path separator (by inserting a zero-width
//       space after it), so that it doesn't get broken in the middle of a file name, if possible.

const displayedText = (text: string): string => {
  return text.replace(/[/\\]/g, '$&\u200b');
};

const hideHint = (): void => {
  hintElement?.remove();

  hintElement = null;
  hintOwner = null;
  hintOwnerRect = null;

  window.cancelAnimationFrame(visibilityCheckFrame ?? 0);

  visibilityCheckFrame = undefined;

  updateKeyDownListener();
};

// Cancel the hint that is about to be shown, if any.

const cancelPendingHint = (): void => {
  if (pendingHintState) {
    window.clearTimeout(pendingHintState.timer);

    pendingHintState = null;

    updateKeyDownListener();
  }
};

// Whether the given element is in the DOM and visible (i.e. not transparent either, e.g., the reset button of one of
// our input widgets once its value is its default value, while the pointer is still over it).
// Note: checkVisibilityCSS is the original name of the visibilityProperty option of checkVisibility(), which is what
//       some (older) Web browsers only know about.

const isVisible = (element: HTMLElement): boolean => {
  return (
    element.isConnected &&
    element.getClientRects().length > 0 &&
    element.checkVisibility?.({ opacityProperty: true, visibilityProperty: true, checkVisibilityCSS: true }) !== false
  );
};

// Hide our hint if our element is no longer visible, or reposition it if our element has moved or been resized (see
// Note #9 above), and check our element again on the next animation frame.

const checkHintOwnerVisibility = (): void => {
  visibilityCheckFrame = undefined;

  if (!hintOwner) {
    return;
  }

  if (!isVisible(hintOwner)) {
    hideHint();

    return;
  }

  const rect = hintOwner.getBoundingClientRect();

  if (
    !hintOwnerRect ||
    rect.left !== hintOwnerRect.left ||
    rect.top !== hintOwnerRect.top ||
    rect.width !== hintOwnerRect.width ||
    rect.height !== hintOwnerRect.height
  ) {
    positionHint();
  }

  visibilityCheckFrame = window.requestAnimationFrame(checkHintOwnerVisibility);
};

// Dismiss our hint, be it shown or about to be shown, if Escape is pressed (see Note #10 above).
// Note: we listen to key presses only while a hint is shown or about to be shown.

const onKeyDown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    cancelPendingHint();
    hideHint();
  }
};

const updateKeyDownListener = (): void => {
  if (hintElement || pendingHintState) {
    window.addEventListener('keydown', onKeyDown, true);
  } else {
    window.removeEventListener('keydown', onKeyDown, true);
  }
};

// The closest ancestor of the given element that has a hint, if any.

const hintedAncestor = (element: HTMLElement): HTMLElement | null => {
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (states.has(ancestor)) {
      return ancestor;
    }
  }

  return null;
};

// The closest element that has a hint and that is, or contains, the given node, if any.

const closestHintedElement = (node: Node): HTMLElement | null => {
  for (
    let element = node instanceof HTMLElement ? node : node.parentElement;
    element;
    element = element.parentElement
  ) {
    if (states.has(element)) {
      return element;
    }
  }

  return null;
};

// Whether the given element has a focus ring, i.e. whether it (or an element within it, but not within an inner
// element that has its own hint, see Note #6 above) has the focus and has been focused using the keyboard (or is a text
// field, see Note #1 above).

const hasFocusRing = (element: HTMLElement): boolean => {
  const activeElement = document.activeElement;

  return (
    activeElement instanceof HTMLElement &&
    element.contains(activeElement) &&
    activeElement.matches(':focus-visible') &&
    closestHintedElement(activeElement) === element
  );
};

// Use our hint as the accessible name of our element, if needed (see Note #8 above).

const ACCESSIBLE_NAME_ATTRIBUTES = ['aria-label', 'aria-labelledby', 'title', 'alt'];

// Note #1: the aria-label that we have given to our element, if any, doesn't count as an accessible name of its own.
// Note #2: our element may get an accessible name of its own after we have given it an aria-label (e.g., if it gets
//          some text or if its own aria-label gets set, replacing ours), in which case we let go of ours (removing it
//          only if it is still ours).

const hasOwnAccessibleName = (element: HTMLElement, ourAriaLabel: string | null): boolean => {
  return (
    !!element.textContent?.trim() ||
    ACCESSIBLE_NAME_ATTRIBUTES.some(
      (attribute: string) =>
        element.hasAttribute(attribute) &&
        (attribute !== 'aria-label' || element.getAttribute(attribute) !== ourAriaLabel)
    ) ||
    ('labels' in element && !!(element as HTMLInputElement).labels?.length)
  );
};

const removeOurAriaLabel = (element: HTMLElement, state: IHintState): void => {
  if (state.ariaLabel !== null && element.getAttribute('aria-label') === state.ariaLabel) {
    element.removeAttribute('aria-label');
  }

  state.ariaLabel = null;
};

const updateAriaLabel = (element: HTMLElement, state: IHintState): void => {
  const ariaLabel = !state.html && state.text && !hasOwnAccessibleName(element, state.ariaLabel) ? state.text : null;

  if (ariaLabel === state.ariaLabel) {
    return;
  }

  if (ariaLabel === null) {
    removeOurAriaLabel(element, state);
  } else {
    element.setAttribute('aria-label', ariaLabel);

    state.ariaLabel = ariaLabel;
  }
};

// Position our hint below its owner (or above it if there is not enough room below it, but there is above it or there
// is more room above it than below it), within the window (see Note #2 above).
// Note #1: if there is not enough room for our hint either below or above its owner, then it overlaps its owner (as
//          little as possible) so that it remains within the window.
// Note #2: we measure our hint at the top-left corner of the window, so that its width doesn't depend on where it would
//          otherwise be laid out (e.g., if our OpenCOR instance is embedded in a page, away from the left edge of the
//          window, or if our hint is being repositioned after its text has changed, see the updated() hook below).

const positionHint = (): void => {
  if (!hintElement || !hintOwner) {
    return;
  }

  hintElement.style.left = '0px';
  hintElement.style.top = '0px';

  const elementRect = hintOwner.getBoundingClientRect();
  const hintRect = hintElement.getBoundingClientRect();

  hintOwnerRect = elementRect;

  let left = elementRect.left;
  let top = elementRect.bottom + HINT_OFFSET;

  if (left + hintRect.width > window.innerWidth - HINT_MARGIN) {
    left = window.innerWidth - HINT_MARGIN - hintRect.width;
  }

  if (top + hintRect.height > window.innerHeight - HINT_MARGIN) {
    const topAbove = elementRect.top - HINT_OFFSET - hintRect.height;

    if (topAbove >= HINT_MARGIN || elementRect.top > window.innerHeight - elementRect.bottom) {
      top = topAbove;
    } else {
      top = window.innerHeight - HINT_MARGIN - hintRect.height;
    }
  }

  hintElement.style.left = `${Math.max(left, HINT_MARGIN)}px`;
  hintElement.style.top = `${Math.max(top, HINT_MARGIN)}px`;
};

const showHint = (element: HTMLElement, text: string, html: boolean): void => {
  // Make sure that we have something to show and that our element is still in the DOM and visible.
  // Note: our element may, for instance, be in the panel of a file tab that was hidden (using visibility: hidden) while
  //       our hint was pending (e.g., if the user switched to another file tab using the keyboard).

  hideHint();

  if (!text || !isVisible(element)) {
    return;
  }

  // Create our hint and position it.

  hintElement = document.createElement('div');

  hintElement.setAttribute('aria-hidden', 'true');

  if (html) {
    hintElement.className = 'opencor-hint opencor-hint-rich';
    hintElement.innerHTML = text;
  } else {
    hintElement.className = 'opencor-hint';
    hintElement.textContent = displayedText(text);
  }

  (element.closest('.opencor') ?? document.body).appendChild(hintElement);

  hintOwner = element;

  updateKeyDownListener();
  positionHint();

  visibilityCheckFrame = window.requestAnimationFrame(checkHintOwnerVisibility);
};

export const vHint: vue.Directive<HTMLElement, string | undefined> = {
  mounted(element, binding) {
    trackWindowFocus();

    const state: IHintState = {
      text: binding.value ?? '',
      html: !!binding.modifiers.html,
      timer: undefined,
      ariaLabel: null,
      onPointerEnter: () => {
        // Hide the hint of our hinted ancestors, if any, since ours is to replace it (see Note #6 above), and cancel
        // the hint that is about to be shown, if any (e.g., the hint of one of our hinted ancestors).

        for (let ancestor = hintedAncestor(element); ancestor; ancestor = hintedAncestor(ancestor)) {
          if (hintOwner === ancestor) {
            hideHint();
          }
        }

        cancelPendingHint();

        state.timer = window.setTimeout(() => {
          pendingHintState = null;

          showHint(element, state.text, state.html);
        }, HINT_DELAY);

        pendingHintState = state;

        updateKeyDownListener();
      },
      onPointerLeave: (event: PointerEvent) => {
        // Keep our hint if our element has a focus ring since our hint is then also shown because our element is
        // focused (see Note #1 above), but cancel it if it is only about to be shown (e.g., if it was dismissed using
        // Escape and our element was then hovered, but left before our hint could be shown again).

        if (hasFocusRing(element)) {
          if (pendingHintState === state) {
            cancelPendingHint();
          }

          return;
        }

        state.onHide();

        // Show the hint of our hinted ancestor again if we are left for it (see Note #6 above).

        const ancestor = hintedAncestor(element);

        if (ancestor && event.relatedTarget instanceof Node && ancestor.contains(event.relatedTarget)) {
          states.get(ancestor)?.onPointerEnter();
        }
      },
      onFocusIn: (event: FocusEvent) => {
        // Show our hint if the focus was set using the keyboard, unless the focused element is within an element that
        // has its own hint (see Note #6 above) or the focus is only given back to our element because our window has
        // regained the focus (see Note #11 above).

        if (
          !windowFocusLost &&
          event.target instanceof Element &&
          event.target.matches(':focus-visible') &&
          closestHintedElement(event.target) === element
        ) {
          cancelPendingHint();
          showHint(element, state.text, state.html);
        }
      },
      onFocusOut: (event: FocusEvent) => {
        // Hide our hint, unless the focus remains within our element.

        if (!(event.relatedTarget instanceof Node && element.contains(event.relatedTarget))) {
          state.onHide();
        }
      },
      onHide: () => {
        if (pendingHintState === state) {
          cancelPendingHint();
        }

        if (hintOwner === element) {
          hideHint();
        }
      }
    };

    states.set(element, state);

    updateAriaLabel(element, state);

    element.addEventListener('pointerenter', state.onPointerEnter);
    element.addEventListener('pointerleave', state.onPointerLeave);

    if (!state.html) {
      element.addEventListener('pointerdown', state.onHide);
    }

    element.addEventListener('focusin', state.onFocusIn);
    element.addEventListener('focusout', state.onFocusOut);
  },
  updated(element, binding) {
    const state = states.get(element);

    if (state) {
      state.text = binding.value ?? '';

      updateAriaLabel(element, state);

      // Update our hint, if it is shown and its text has changed, and reposition it since its size may have changed.
      // Note #1: we are called whenever the component that contains our element gets updated, not only when our hint
      //          changes, hence we check that our hint has changed (e.g., so that a rich hint isn't rebuilt and
      //          repositioned every time the user types something in the input field that it is about). A change in
      //          the position of our element is otherwise handled by checkHintOwnerVisibility().
      // Note #2: our hint is repositioned before the next paint, so it doesn't flicker.

      if (hintOwner === element && hintElement && binding.value !== binding.oldValue) {
        if (state.text && state.html) {
          hintElement.innerHTML = state.text;
        } else if (state.text) {
          hintElement.textContent = displayedText(state.text);
        } else {
          hideHint();

          return;
        }

        positionHint();
      }
    }
  },
  beforeUnmount(element) {
    const state = states.get(element);

    if (state) {
      state.onHide();

      element.removeEventListener('pointerenter', state.onPointerEnter);
      element.removeEventListener('pointerleave', state.onPointerLeave);
      element.removeEventListener('pointerdown', state.onHide);
      element.removeEventListener('focusin', state.onFocusIn);
      element.removeEventListener('focusout', state.onFocusOut);

      removeOurAriaLabel(element, state);

      states.delete(element);
    }
  }
};
