import electron from 'electron';
import path from 'node:path';

import { primeVueColor } from '../renderer/src/common/colors';

export const backgroundColor = (): string | undefined => {
  // Return the background colour of our windows, i.e. PrimeVue's content background colour, which is what we are using
  // as a background for our app (see src/renderer/src/assets/app.css).

  return primeVueColor('content.background', electron.nativeTheme.shouldUseDarkColors);
};

export class ApplicationWindow extends electron.BrowserWindow {
  // Note: a window that doesn't need to communicate with our main process (e.g., our splash screen window) doesn't need
  //       our preload script, which is heavy (it loads the native libOpenCOR module, among other things), in which case
  //       it also uses Electron's default (i.e. secure) Web preferences.

  constructor(options: electron.BrowserWindowConstructorOptions, usePreload = true) {
    // Add some common options and call our parent constructor.
    // Note #1: we use backgroundColor to minimise the flickering that may occur when first showing a window.
    // Note #2: a transparent window (e.g., our splash screen window) draws its own background, so it must keep a
    //          transparent background.

    const transparent = !!options.transparent;

    options.backgroundColor = transparent ? '#00000000' : backgroundColor();
    options.show = false;
    options.useContentSize = true;

    if (usePreload) {
      options.webPreferences = {
        preload: path.join(import.meta.dirname, '../preload/index.mjs'),
        sandbox: false
      };
    }

    super(options);

    // Show our window when we are ready to show it.

    this.once('ready-to-show', () => {
      this.show();
    });

    // Keep our background colour in sync with our theme.
    // Note: Electron uses our background colour for the parts of our window that our renderer hasn't painted yet (e.g.,
    //       when our window gets resized), so it must match our theme, which may change while we are running (e.g., if
    //       the user changes our theme or the system one), or there would be some flickering.

    if (!transparent) {
      const updateBackgroundColor = (): void => {
        const color = backgroundColor();

        if (color && !this.isDestroyed()) {
          this.setBackgroundColor(color);
        }
      };

      electron.nativeTheme.on('updated', updateBackgroundColor);

      this.once('closed', () => {
        electron.nativeTheme.removeListener('updated', updateBackgroundColor);
      });
    }
  }

  // Send a message to our renderer.
  // Note: we may have been closed (and therefore destroyed) while some asynchronous operation was in progress (e.g.,
  //       checking for updates or showing an open dialog), in which case sending a message would throw an "Object has
  //       been destroyed" error, so we don't send it.

  send(channel: string, ...args: unknown[]): void {
    if (!this.isDestroyed() && !this.webContents.isDestroyed()) {
      this.webContents.send(channel, ...args);
    }
  }
}
