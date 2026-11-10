import * as electron from 'electron';

import { COPYRIGHT } from '../renderer/src/common/constants';

import { ApplicationWindow } from './ApplicationWindow';
import { electronConf, type IElectronConfState } from './index';
import { formatError } from '../renderer/src/common/common';

export class SplashScreenWindow extends ApplicationWindow {
  constructor() {
    // Initialise ourselves.
    // Note: our window is transparent and has no shadow nor rounded corners, so that our splash screen can draw its own
    //       rounded corners, border, and background, and therefore look the same on Windows, Linux, and macOS (see
    //       splashscreen.css). Otherwise, our window would, for instance, have rounded corners and a border on macOS
    //       and Windows 11, but not on Linux. That said, on Linux, a transparent window requires a compositing window
    //       manager, without which the corners of our splash screen would be black rather than transparent.

    const width = 360;
    const height = 300;
    const state: IElectronConfState = electronConf.get('app.state');

    super(
      {
        x: state.x + ((state.width - width) >> 1),
        y: state.y + ((state.height - height) >> 1),
        width: width,
        height: height,
        minWidth: width,
        minHeight: height,
        maxWidth: width,
        maxHeight: height,
        frame: false,
        transparent: true,
        hasShadow: false,
        roundedCorners: false,
        show: false,
        alwaysOnTop: true
      },
      false
    );

    // Load our splash screen, passing it our copyright and version.
    // Note: we pass them using a query string rather than IPC since our splash screen window doesn't use our preload
    //       script (see ApplicationWindow).

    this.loadFile('./src/main/assets/splashscreen.html', {
      query: {
        copyright: COPYRIGHT,
        version: electron.app.getVersion()
      }
    }).catch((error: unknown) => {
      console.warn('OpenCOR: failed to load the splash screen:', formatError(error));
    });
  }
}
