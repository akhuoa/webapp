import xxhash from 'xxhash-wasm';

// biome-ignore lint/suspicious/noExplicitAny: dynamic import requires any type
export type Module = any;

export let _jsonSchema: Module = null;
export let _jsZip: Module = null;
export let _mathJs: Module = null;
export let _uPlot: Module = null;
export let _xxhash: Module = null;

export const setJsonSchema = (module: Module): void => {
  _jsonSchema = module;
};

export const setJsZip = (module: Module): void => {
  _jsZip = module;
};

export const setMathJs = (module: Module): void => {
  _mathJs = module;
};

export const setUPlot = (module: Module): void => {
  _uPlot = module;
};

// Initialise xxHash.
// Note: this compiles xxHash's WASM, so we only do it when asked to (i.e. by our renderer, see initialisation.ts)
//       rather than when this module is imported. Indeed, this module is also (indirectly) imported by our main
//       process, which doesn't need xxHash.

let xxhashInitialisation: Promise<Module> | null = null;

export const initialiseXxhash = (): Promise<Module> => {
  xxhashInitialisation ??= xxhash().then((module: Module) => {
    _xxhash = module;

    return module;
  });

  return xxhashInitialisation;
};
