import { formatError, type ISettings, type ISettingsGeneral, isObject } from './common';
import { electronApi } from './electronApi';

// Our default settings.

const defaultSettings = (): ISettings => {
  return {
    general: {
      checkForUpdatesAtStartup: true,
      theme: 'system'
    }
  };
};

// A helper function to merge the given (loaded) settings over our default settings.
// Note #1: the loaded settings may be incomplete (e.g., if they were saved by an older version of OpenCOR or edited by
//          hand), have values of the wrong type (e.g., "false" rather than false), or not even be an object, in which
//          case we use our default settings for whatever is missing or of the wrong type.
// Note #2: we keep the settings, and settings sections, for which we don't have a default value (e.g., settings saved
//          by a newer version of OpenCOR).

const withDefaultSettings = (settings: unknown): ISettings => {
  const loadedSettings = isObject(settings) ? settings : {};
  const res = { ...loadedSettings, ...defaultSettings() } as ISettings;
  const general = loadedSettings.general;

  // Note: we use Object.hasOwn() and Object.fromEntries() rather than look up and assign each key since the loaded
  //       settings may contain a "__proto__" key, which would otherwise be looked up as, and assigned to, the prototype
  //       of our general settings (see also cloneUiJson()).

  if (isObject(general)) {
    const defaultGeneral = res.general as unknown as Record<string, unknown>;

    res.general = Object.fromEntries([
      ...Object.entries(defaultGeneral),
      ...Object.entries(general).filter(([key, value]) => {
        return !Object.hasOwn(defaultGeneral, key) || typeof value === typeof defaultGeneral[key];
      })
    ]) as unknown as ISettingsGeneral;
  }

  return res;
};

class Settings {
  protected static _instance: Settings | null = null;
  private _settings!: ISettings;
  private _oldRawSettings: string | null = null;
  private _isInitialised = false;
  private _initialisationListeners: (() => void)[] = [];

  private constructor() {
    // Start with some default settings and then load them.
    // Note: to have default settings is critical when running the desktop version of OpenCOR since they are loaded
    //       asynchronously, so we need to ensure that our settings are always defined. This is not the case for the
    //       Web version of OpenCOR, where we can load our settings directly from the cookies.

    this.reset();
    this.load();
  }

  static instance(): Settings {
    Settings._instance ??= new Settings();

    return Settings._instance;
  }

  private emitInitialised(): void {
    this._isInitialised = true;

    this._initialisationListeners.forEach((callback) => {
      callback();
    });

    this._initialisationListeners = [];
  }

  onInitialised(callback: () => void): void {
    if (this._isInitialised) {
      callback();
    } else {
      this._initialisationListeners.push(callback);
    }
  }

  load(): void {
    if (electronApi) {
      // Note: if our settings cannot be loaded, then we keep our default settings, but we still let people know that we
      //       are initialised (since they would otherwise wait forever).

      electronApi
        .loadSettings()
        .then((settings: ISettings) => {
          this._settings = withDefaultSettings(settings);
          this._oldRawSettings = JSON.stringify(settings);
        })
        .catch((error: unknown) => {
          console.warn('OpenCOR: failed to load the settings, so using the default settings:', formatError(error));
        })
        .finally(() => {
          this.emitInitialised();
        });
    } else {
      try {
        const raw = window.localStorage.getItem('settings');

        if (raw) {
          this._settings = withDefaultSettings(JSON.parse(raw));
          this._oldRawSettings = raw;
        }
      } catch (error: unknown) {
        console.warn(
          'OpenCOR: failed to load the settings from the local storage, so resetting to defaults:',
          formatError(error)
        );

        this.reset();
      }

      this.emitInitialised();
    }
  }

  save(): void {
    const rawSettings = JSON.stringify(this._settings);

    if (rawSettings === this._oldRawSettings) {
      return;
    }

    if (electronApi) {
      electronApi.saveSettings(this._settings);

      this._oldRawSettings = rawSettings;
    } else {
      try {
        window.localStorage.setItem('settings', rawSettings);

        this._oldRawSettings = rawSettings;
      } catch (error: unknown) {
        console.warn('OpenCOR: failed to save the settings to the local storage:', formatError(error));
      }
    }
  }

  reset(): void {
    this._settings = defaultSettings();

    this._oldRawSettings = null;
  }

  toString(): string {
    return JSON.stringify(this._settings, null, 2);
  }

  get general(): ISettingsGeneral {
    return this._settings.general;
  }
}

export const settings = Settings.instance();
