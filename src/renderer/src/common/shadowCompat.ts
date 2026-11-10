// Our OpenCOR component lives in a shadow root (see element.ts), so that a host application's styles don't affect it
// (and vice versa). However, from the host document's point of view:
//  - an event that originates from within our shadow root has our shadow host as its target; and
//  - our shadow host is the active element when an element within our shadow root has the focus.
// This means that code that relies on the host document would misbehave. For instance, PrimeVue's overlays and menubar
// use a document listener and event.target to determine whether a click originated from within them (and hide
// themselves if it didn't), while PrimeVue's focus trap (used by our dialogs) checks whether document.activeElement is
// within a dialog (and moves the focus to the dialog's first focusable element if it isn't). So, we restore the
// behaviour that such code expects, i.e. the behaviour that it would have if our OpenCOR component didn't live in a
// shadow root. This is only done for our own shadow hosts.
// Note: we use global symbols (rather than module variables), so that different copies of our OpenCOR component (e.g.,
//       different versions of it used by different parts of a host application) share the same registry and don't
//       patch document.activeElement or listen to events more than once.

const OPENCOR_SHADOW_HOSTS = Symbol.for('opencor.shadowHosts');
const OPENCOR_ACTIVE_ELEMENT_PATCHED = Symbol.for('opencor.activeElementPatched');

const opencorGlobal = globalThis as unknown as Record<symbol, WeakSet<Element> | undefined>;

opencorGlobal[OPENCOR_SHADOW_HOSTS] ??= new WeakSet<Element>();

const shadowHosts = opencorGlobal[OPENCOR_SHADOW_HOSTS];

// Make document.activeElement return the element that has the focus within one of our shadow roots rather than our
// shadow host.

const patchActiveElement = (): void => {
  const opencorDocument = document as unknown as Record<symbol, boolean | undefined>;

  if (opencorDocument[OPENCOR_ACTIVE_ELEMENT_PATCHED]) {
    return;
  }

  const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement');
  const activeElement = descriptor?.get;

  if (!activeElement) {
    return;
  }

  Object.defineProperty(opencorDocument, 'activeElement', {
    configurable: true,
    enumerable: descriptor.enumerable,
    get() {
      let res = activeElement.call(this) as Element | null;

      while (res && shadowHosts.has(res) && res.shadowRoot?.activeElement) {
        res = res.shadowRoot.activeElement;
      }

      return res;
    }
  });

  opencorDocument[OPENCOR_ACTIVE_ELEMENT_PATCHED] = true;
};

// The events for which we want listeners outside of our shadow root (e.g., on the host document or the window) to see
// the element from which they originated within our shadow root as their target.

const EVENTS = [
  'auxclick',
  'click',
  'contextmenu',
  'dblclick',
  'focusin',
  'focusout',
  'keydown',
  'keyup',
  'mousedown',
  'mouseup',
  'pointerdown',
  'pointerup',
  'touchend',
  'touchstart'
];

const OPENCOR_EVENT_TARGETS_KEPT = Symbol.for('opencor.eventTargetsKept');

const nativeTarget = Object.getOwnPropertyDescriptor(Event.prototype, 'target')?.get;

// Determine whether the given node is within the given shadow root, possibly within a shadow root of its own (e.g.,
// CellDL Editor's SVG panel).

const isWithin = (node: Node, shadowRoot: ShadowRoot): boolean => {
  let root = node.getRootNode();

  while (root instanceof ShadowRoot) {
    if (root === shadowRoot) {
      return true;
    }

    root = root.host.getRootNode();
  }

  return false;
};

const keepEventTarget = (event: Event): void => {
  // Note #1: we listen to the window in the capturing phase, i.e. before any listener on the host document (incl. its
  //          capturing listeners, e.g., PrimeVue's ContextMenu uses one to determine whether a click occurred outside of
  //          it), so we can determine the target of an event as seen from within our shadow root (i.e. the first node in
  //          the event's composed path that belongs to our shadow root) and keep it for listeners outside of our shadow
  //          root.
  // Note #2: listeners within our shadow root (incl. within a shadow root of its own) still get the target that the
  //          browser would give them.

  if (!nativeTarget || Object.hasOwn(event, 'target')) {
    return;
  }

  const path = event.composedPath();

  for (let i = 1; i < path.length; ++i) {
    const host = path[i];
    const shadowRoot = path[i - 1];

    if (host instanceof Element && shadowHosts.has(host) && shadowRoot instanceof ShadowRoot) {
      const target = path.slice(0, i - 1).find((node) => node instanceof Node && node.getRootNode() === shadowRoot);

      if (target) {
        Object.defineProperty(event, 'target', {
          configurable: true,
          get() {
            const currentTarget = (this as Event).currentTarget;

            return currentTarget instanceof Node &&
              (currentTarget === shadowRoot || isWithin(currentTarget, shadowRoot))
              ? nativeTarget.call(this)
              : target;
          }
        });
      }

      return;
    }
  }
};

const keepEventTargets = (): void => {
  const opencorWindow = window as unknown as Record<symbol, boolean | undefined>;

  if (opencorWindow[OPENCOR_EVENT_TARGETS_KEPT]) {
    return;
  }

  for (const event of EVENTS) {
    window.addEventListener(event, keepEventTarget, { capture: true, passive: true });
  }

  opencorWindow[OPENCOR_EVENT_TARGETS_KEPT] = true;
};

// A composable to restore the behaviour that code relying on the host document expects for the given shadow host.

export const useShadowCompat = (host: HTMLElement | null, shadowRoot: ShadowRoot | null): void => {
  if (!host || !shadowRoot) {
    return;
  }

  shadowHosts.add(host);

  patchActiveElement();
  keepEventTargets();
};
