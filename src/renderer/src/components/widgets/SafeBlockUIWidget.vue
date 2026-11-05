<script lang="ts">
import { ZIndex } from '@primeuix/utils/zindex';

import BlockUI from 'primevue/blockui';
import * as vue from 'vue';

// This component is a wrapper around PrimeVue's BlockUI. It provides a safe implementation of the block and unblock
// methods that ensure that we don't attempt to block if we are already blocked, and that we properly remove the mask
// when unblocking. This is necessary because PrimeVue's BlockUI does not account for the case where multiple block
// events are emitted before the unblock event is emitted, which can lead to multiple masks being created and not
// properly removed. On top of that, PrimeVue's BlockUI only considers itself unblocked 300ms after unblocking (once its
// fallback timer has removed its mask), so if we get blocked again within that time, our block() returns early and
// leaves us without a mask, after which the fallback timer considers us unblocked while we should still be blocked.
// Note: this implementation is based on version 4.5.5 of PrimeVue, which is the version we are using in OpenCOR. If we
//       upgrade to a newer version of PrimeVue, we should check if there are any changes to the BlockUI component that
//       might affect our implementation.

export default vue.defineComponent({
  extends: BlockUI as unknown as vue.DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>,
  setup: () => {
    interface BlockUISafeInstance {
      isBlocked: boolean;
      mask: HTMLElement | null;
      baseZIndex: number;
      $refs: {
        container?: HTMLElement | null;
      };
      $primevue: {
        config: {
          zIndex: {
            modal: number;
          };
        };
      };
      $emit: (event: 'block' | 'unblock', ...args: unknown[]) => void;
    }

    const instance = vue.getCurrentInstance();
    const self = instance?.proxy as unknown as BlockUISafeInstance;

    const block = (): void => {
      // Don't attempt to block if we are already blocked.
      // Note: this can happen if the block event is emitted multiple times before the unblock event is emitted. In
      //       that case, we want to ignore subsequent block events until the unblock event is emitted.

      if (self.isBlocked) {
        return;
      }

      // Create and attach mask as PrimeVue does.
      // Note: we don't account for the case where we are in full screen mode since that is not a use case for us.

      const mask = document.createElement('div');

      mask.className = 'p-blockui-mask p-overlay-mask p-overlay-mask-enter-active';

      (self.$refs.container as HTMLElement | null)?.appendChild(mask);

      ZIndex.set('modal', mask, self.baseZIndex || self.$primevue.config.zIndex.modal);

      self.mask = mask;
      self.isBlocked = true;

      self.$emit('block');
    };

    const cleanupMasks = (): void => {
      const root = (instance?.proxy as { $el?: HTMLElement })?.$el;

      if (!root) {
        return;
      }

      for (const mask of root.querySelectorAll<HTMLElement>('.p-blockui-mask')) {
        removeSpecificMask(mask);
      }
    };

    const removeSpecificMask = (mask: HTMLElement): void => {
      mask.remove();

      ZIndex.clear(mask);
    };

    const removeMask = (): void => {
      // Don't attempt to remove the mask if it doesn't exist.
      // Note: this can happen if the unblock event is emitted multiple times before the block event is emitted, which
      //       can lead to multiple unblock events being emitted without a corresponding block event.

      if (self.mask == null) {
        return;
      }

      // Remove the mask as PrimeVue does.
      // Note: we don't account for the case where we are in full screen mode since that is not a use case for us.

      removeSpecificMask(self.mask);

      self.mask = null;
      self.isBlocked = false;

      self.$emit('unblock');
    };

    const unblock = (): void => {
      // Remove the mask and consider ourselves unblocked straight away rather than after PrimeVue's fallback timer (see
      // above).
      // Note: our mask would have been removed from the DOM by cleanupMasks() anyway (see OpenCOR.vue), so this only
      //       ensures that our state is immediately in sync with it.

      removeMask();
    };

    return {
      block,
      cleanupMasks,
      removeMask,
      removeSpecificMask,
      unblock
    };
  }
});
</script>
