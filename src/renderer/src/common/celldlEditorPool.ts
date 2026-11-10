import type { CellDLEditorCommand, EditorData } from '@celldl/editor';
import * as vueusecore from '@vueuse/core';

import type { OpenCORTheme } from '../../index';

import * as vue from 'vue';

import * as common from './common';

// Our CellDL Editor views get their CellDL Editor from a pool of CellDL Editors.
// Note #1: CellDL Editor never stops listening to some events on the window and the document, i.e. it never really gets
//          destroyed. So, rather than having a CellDL Editor per CellDL Editor view, which would mean leaking a CellDL
//          Editor every time a CellDL Editor view gets unmounted (e.g., when closing a CellDL file), a CellDL Editor
//          view acquires a CellDL Editor from our pool when it gets mounted and releases it when it gets unmounted. We
//          then close its diagram (which also clears its undo history), so that it can be reused. Our pool only creates
//          a CellDL Editor when it has no other spare one (see acquire()), so it never has more CellDL Editors than the
//          maximum number of CellDL Editor views that have been mounted at the same time, plus one.
// Note #2: CellDL Editor listens to keyboard events on the window and lets only one of its instances handle them, i.e.
//          the instance in which a pointer was last pressed or, by default, the first instance to have been mounted.
//          This means that pressing Backspace in one file tab could, for instance, delete the selected object(s) in
//          another (hidden) file tab. So, whenever the CellDL Editor view that is visible changes, we simulate a
//          pointer press in its CellDL Editor, so that it is the one that handles keyboard events. When no CellDL
//          Editor view is visible, we do the same with a spare CellDL Editor, which has nothing to edit.

export interface ICellDLEditorClient {
  container: HTMLElement | null;
  active: boolean;
  activation: number;
  loaded: boolean;
  // Note: each OpenCOR instance has its own theme (see provideTheme() in vueCommon.ts), so a CellDL Editor uses the
  //       theme of the OpenCOR instance of the client that has acquired it (see CellDLEditorPoolComponent.vue).
  theme: () => OpenCORTheme;
  onError: (message: string) => void;
  onFileEdited: () => void;
}

export interface ICellDLEditor {
  open: (data: string, name: string) => Promise<void>;
  data: () => Promise<string>;
}

export interface IPooledCellDLEditor extends ICellDLEditor {
  id: number;
  client: ICellDLEditorClient | null;
  command: CellDLEditorCommand | undefined;
  root: HTMLElement | null;
  close: () => void;
  onEditorData: (data: EditorData) => void;
  onEditorReady: (root: HTMLElement | null) => void;
  onEditorState: (state: { error: string }) => void;
  onFileEdited: () => void;
}

const DATA_REQUEST_TIMEOUT = 3 * 1000; // 3 seconds.

export const useCellDLEditorPool = vueusecore.createGlobalState(() => {
  const editors = vue.shallowReactive<IPooledCellDLEditor[]>([]);
  let failure: string | null = null;
  let anyReady = false;
  const readyRejecters = new Set<(error: Error) => void>();

  // Create a CellDL Editor, which gets rendered by our pool component (see CellDLEditorPoolComponent.vue).

  let editorNumber = 0;

  const createEditor = (): IPooledCellDLEditor => {
    // Run our operations one after the other since CellDL Editor can only handle one command at a time.

    let lastOperation: Promise<unknown> = Promise.resolve();

    const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
      const res = lastOperation.then(operation);

      lastOperation = res.catch(() => undefined);

      return res;
    };

    // Wait for our CellDL Editor to be ready, unless CellDL Editor failed to get ready (see setFailed()).

    let resolveReady: () => void = () => {};
    let rejectReady: (error: Error) => void = () => {};
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    ready.catch(() => undefined);

    if (failure !== null) {
      rejectReady(new Error(failure));
    } else {
      readyRejecters.add(rejectReady);
    }

    // Send a command to our CellDL Editor.
    // Note: CellDL Editor doesn't tell us when it is done with a command, but it handles our command as soon as it gets
    //       it and then only needs a tick to finish handling it, so we wait for the next animation frame to be safe.

    const sendCommand = async (command: CellDLEditorCommand): Promise<void> => {
      editor.command = command;

      await vue.nextTick();
      await common.waitForNextAnimationFrame();
    };

    // Retrieve the diagram from our CellDL Editor.
    // Note #1: we give up if CellDL Editor doesn't provide the diagram in time since, otherwise, our queue of
    //          operations would be blocked forever.
    // Note #2: we also give up if CellDL Editor provides no diagram (e.g., if it failed to serialise it) since,
    //          otherwise, we would provide nothing as the diagram.

    let dataRequestNumber = 0;
    const dataRequests = new Map<string, (data: string | undefined) => void>();

    const diagramData = (): Promise<string> => {
      return new Promise((resolve, reject) => {
        const kind = `opencor-${++dataRequestNumber}`;
        const timeoutId = window.setTimeout(() => {
          dataRequests.delete(kind);

          reject(new Error('CellDL Editor did not provide the diagram in time.'));
        }, DATA_REQUEST_TIMEOUT);

        dataRequests.set(kind, (data: string | undefined) => {
          window.clearTimeout(timeoutId);

          if (data) {
            resolve(data);
          } else {
            reject(new Error('CellDL Editor did not provide the diagram.'));
          }
        });

        editor.command = {
          command: 'file',
          options: {
            action: 'data',
            kind
          }
        };
      });
    };

    // The client which diagram we last asked our CellDL Editor to open, if any.
    // Note: our CellDL Editor may report an error or an edit after it has been released (e.g., if it gets released
    //       while it is opening a diagram), in which case we must report it neither to the client that released our
    //       CellDL Editor nor to the client that has acquired it since. So, we forget about our opened client as soon
    //       as our CellDL Editor gets released (see close()).

    let openedClient: ICellDLEditorClient | null = null;

    const editor: IPooledCellDLEditor = vue.shallowReactive({
      id: ++editorNumber,
      client: null,
      command: undefined,
      root: null,
      open: (data: string, name: string): Promise<void> => {
        const client = editor.client;

        // Note: our CellDL Editor may get released before it gets to open the diagram (e.g., if our client gets
        //       unmounted while our CellDL Editor is getting ready), in which case there is no point in opening it and
        //       we must not do it since our CellDL Editor may have been acquired by another client in the meantime.

        return enqueue(async () => {
          await ready;

          if (!client || editor.client !== client) {
            return;
          }

          openedClient = client;

          await sendCommand({
            command: 'file',
            options: {
              action: 'open',
              data,
              name
            }
          });
        });
      },
      data: (): Promise<string> => {
        return enqueue(diagramData);
      },
      close: (): void => {
        openedClient = null;

        void enqueue(async () => {
          await ready;

          await sendCommand({
            command: 'file',
            options: {
              action: 'close'
            }
          });
        }).catch(() => undefined);
      },
      onEditorData: (data: EditorData): void => {
        const settle = dataRequests.get(data.kind ?? '');

        if (settle) {
          dataRequests.delete(data.kind ?? '');

          settle(data.data);
        }
      },
      onEditorReady: (root: HTMLElement | null): void => {
        anyReady = true;

        readyRejecters.delete(rejectReady);

        // Note: Vue doesn't make DOM elements reactive, but we mark our root element as raw to be safe.

        editor.root = root ? vue.markRaw(root) : null;

        resolveReady();
      },
      onEditorState: (state: { error: string }): void => {
        openedClient?.onError(state.error);
      },
      onFileEdited: (): void => {
        openedClient?.onFileEdited();
      }
    });

    editors.push(editor);

    return editor;
  };

  // Mount our pool component, if needed.
  // Note: our CellDL Editors must never be destroyed (see above), yet an OpenCOR instance may get unmounted (e.g., when
  //       OpenCOR is used as a library). So, rather than mounting our pool component within an OpenCOR instance, we
  //       render it in its own invisible element, which we append to the document's body and in which a CellDL Editor
  //       is "parked" when it is not used by a CellDL Editor view. We render it using the app context of our first
  //       client, so that it has access to PrimeVue, among other things. Our element has the "opencor" class, so that
  //       our Tailwind CSS classes also apply to our CellDL Editors while they are parked.

  let mounted = false;

  const mount = (appContext: vue.AppContext | null): void => {
    if (mounted) {
      return;
    }

    mounted = true;

    const element = document.createElement('div');

    element.className = 'opencor';
    element.style.cssText = 'position: fixed; inset: 0; visibility: hidden; pointer-events: none;';

    document.body.appendChild(element);

    const vnode = vue.createVNode(
      vue.defineAsyncComponent(() => import('../components/CellDLEditorPoolComponent.vue'))
    );

    vnode.appContext = appContext;

    vue.render(vnode, element);
  };

  // Acquire a CellDL Editor for the given client, making sure that we still have a spare CellDL Editor afterwards (see
  // above).

  const spareEditor = (): IPooledCellDLEditor | undefined => {
    return editors.find((editor) => !editor.client);
  };

  const acquire = (client: ICellDLEditorClient, appContext: vue.AppContext | null): ICellDLEditor => {
    mount(appContext);

    const res = spareEditor() ?? createEditor();

    res.client = client;

    if (!spareEditor()) {
      createEditor();
    }

    if (failure !== null) {
      client.onError(failure);
    }

    return res;
  };

  // Release the given CellDL Editor and close its diagram, so that it can be reused.

  const release = (editor: ICellDLEditor): void => {
    const pooledEditor = editors.find((pooledEditor) => pooledEditor === editor);

    if (pooledEditor) {
      pooledEditor.client = null;

      pooledEditor.close();
    }
  };

  // Mark our CellDL Editors as having failed to get ready (e.g., if CellDL Editor failed to initialise itself), and let
  // our clients know about it since, otherwise, they would wait for it forever.

  const setFailed = (error: unknown): void => {
    if (anyReady || failure !== null) {
      return;
    }

    failure = `CellDL Editor could not be loaded (${common.formatError(error)}).`;

    for (const rejectReady of readyRejecters) {
      rejectReady(new Error(failure));
    }

    readyRejecters.clear();

    for (const editor of editors) {
      editor.client?.onError(failure);
    }
  };

  // The client which CellDL Editor should handle keyboard events, if any.
  // Note: several clients may be active at the same time (e.g., if several OpenCOR instances each show a CellDL file),
  //       in which case we use the client that was activated last (see activate()).

  const targetClient = vue.computed<ICellDLEditorClient | null>(() => {
    let res: ICellDLEditorClient | null = null;

    for (const editor of editors) {
      const client = editor.client;

      if (client?.active && client.loaded && editor.root && client.activation > (res?.activation ?? -1)) {
        res = client;
      }
    }

    return res;
  });

  // Mark the given client as the one that was activated last.

  let activationNumber = 0;

  const activate = (client: ICellDLEditorClient): void => {
    client.activation = ++activationNumber;
  };

  // Simulate a pointer press in the CellDL Editor that should handle keyboard events whenever it changes, i.e. the
  // CellDL Editor of our target client or, if there is none, a spare CellDL Editor.
  // Note #1: CellDL Editor checks whether a pointer press occurred within one of its instances during the capture phase
  //          of the document, so our pointer press doesn't need to bubble up (and it is better that it doesn't since
  //          nothing else should handle it).
  // Note #2: our pointer press must be composed since our CellDL Editor may be within our shadow root (see
  //          src/element.ts), in which case it would otherwise never reach the document.

  vue.watch(
    () => {
      const client = targetClient.value;

      return (
        editors.find((editor) => (client ? editor.client === client : !editor.client && editor.root))?.root ?? null
      );
    },
    (root) => {
      root?.dispatchEvent(new PointerEvent('pointerdown', { composed: true }));
    }
  );

  return {
    acquire,
    activate,
    editors,
    release,
    setFailed,
    targetClient
  };
});
