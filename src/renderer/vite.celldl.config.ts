import * as path from 'node:path';
import * as vite from 'vite';

import { scopeCellDLEditorCssPlugin } from './scripts/celldl.plugin.ts';
import { stripPrimeIconsFontFacePlugin } from './scripts/primeicons.plugin.ts';
import { shadowCssPlugin } from './scripts/shadow.css.plugin.ts';

// Build our CellDL runtime (see src/common/celldlRuntime.ts), which OpenCOR's Web app and our library load at runtime.
// Note: this config is used by buildCellDLRuntime() (see scripts/celldl.runtime.ts), which provides the output folder.

// A Vite plugin to share Vue with our host.
// Note: CellDL Editor must use the same copy of Vue as our host (i.e. OpenCOR's Web app or the application that uses
//       our library), which cannot be resolved at runtime using a bare `vue` import (unless the application uses an
//       import map). So, we replace Vue with a module that re-exports the copy of Vue that our host makes available
//       before loading our CellDL runtime (see importCellDLRuntime() in src/common/celldlRuntime.ts).

const SHARED_VUE_ID = '\0shared-vue';

const sharedVuePlugin = async (): Promise<vite.Plugin> => {
  const vueExports = Object.keys(await import('vue')).filter((name) => {
    return name !== 'default' && /^[A-Za-z_$][\w$]*$/.test(name);
  });

  return {
    name: 'shared-vue',
    enforce: 'pre',
    resolveId(id) {
      return id === 'vue' ? SHARED_VUE_ID : null;
    },
    load(id) {
      if (id !== SHARED_VUE_ID) {
        return null;
      }

      return `const vue = globalThis[Symbol.for('opencor.celldlRuntime.vue')];

if (!vue) {
  throw new Error('Vue has not been made available to the CellDL runtime.');
}

export const { ${vueExports.join(', ')} } = vue;
`;
    }
  };
};

export default vite.defineConfig({
  base: './',
  build: {
    assetsInlineLimit: 0,
    // Note: CellDL Editor comes as a prebuilt bundle that includes Oxigraph's WASM as base64 (~5.4 MB), so it results
    //       in a big chunk (~7.2 MB) that we cannot split.

    chunkSizeWarningLimit: 8192,
    copyPublicDir: false,
    modulePreload: false,
    rolldownOptions: {
      // Note: libCellML is built for both the Web and Node.js, and it only imports node:module when running in Node.js,
      //       so there is no need for Vite to replace it with an empty module (and to warn us about it).

      external: ['node:module'],
      input: path.join(import.meta.dirname, 'src', 'celldl', 'runtime.ts'),
      output: {
        // Note: our CellDL runtime is served from a folder which name is a hash of its contents (see
        //       buildCellDLRuntime()), so only its chunks and assets need a hash in their file names.

        entryFileNames: 'celldl.js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash].[ext]'
      },
      preserveEntrySignatures: 'exports-only'
    },
    target: 'esnext'
  },
  plugins: [stripPrimeIconsFontFacePlugin(), scopeCellDLEditorCssPlugin(), shadowCssPlugin(), sharedVuePlugin()],
  publicDir: false
});
