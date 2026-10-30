import * as vue from 'vue';

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
//       patch document.activeElement more than once.

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

// The events for which we want the host document (and anything after it, i.e. the window) to see the element from which
// they originated within our shadow root as their target.

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

const keepEventTarget = (event: Event): void => {
  // Note: we are the last listener within our shadow root (since we listen to our shadow root itself in the bubbling
  //       phase), so event.target is still the element from which the event originated. Once the event leaves our
  //       shadow root, the browser will retarget it to our shadow host, unless we keep its current target.

  const target = event.target;

  if (target && !Object.hasOwn(event, 'target')) {
    Object.defineProperty(event, 'target', {
      configurable: true,
      get: () => target
    });
  }
};

// A composable to restore the behaviour that code relying on the host document expects for the given shadow host.
// Note: listeners registered on the window or the host document in the capturing phase are called before an event
//       reaches our shadow root, so they still see our shadow host as the target. Our own such listeners must
//       therefore use event.composedPath() to determine the actual target of an event (e.g., see GraphPanelWidget.vue).

export const useShadowCompat = (host: HTMLElement | null, shadowRoot: ShadowRoot | null): void => {
  if (!host || !shadowRoot) {
    return;
  }

  shadowHosts.add(host);

  patchActiveElement();

  for (const event of EVENTS) {
    shadowRoot.addEventListener(event, keepEventTarget);
  }

  vue.onUnmounted(() => {
    for (const event of EVENTS) {
      shadowRoot.removeEventListener(event, keepEventTarget);
    }
  });
};
