/// <reference types="node" />

import * as primeVueAutoImportResolver from '@primevue/auto-import-resolver';
import tailwindcssPlugin from '@tailwindcss/vite';
import vuePlugin from '@vitejs/plugin-vue';

import * as electronVite from 'electron-vite';
import * as fs from 'node:fs';
import path from 'node:path';
import vitePlugin from 'unplugin-vue-components/vite';

import { scopeCellDLEditorCssPlugin } from './src/renderer/scripts/celldl.plugin.ts';
import { downloadLibopencorJsIfNeeded } from './src/renderer/scripts/download.libopencor.js.ts';
import { libopencorVersion, opencorVersion } from './src/renderer/scripts/libopencor.version.ts';
import { stripPrimeIconsFontFacePlugin } from './src/renderer/scripts/primeicons.plugin.ts';
import { primeVueCssPlugin } from './src/renderer/scripts/primevue.css.plugin.ts';
import {
  OPENCOR_CUSTOM_ELEMENT_COMPONENTS,
  shadowCssPlugin,
  shadowStyleNodeTransform
} from './src/renderer/scripts/shadow.css.plugin.ts';

const rendererPublicDir = path.join(import.meta.dirname, 'src', 'renderer', 'public');

export default electronVite.defineConfig({
  main: {
    build: {
      rolldownOptions: {
        output: {
          format: 'cjs'
        }
      }
    },
    ssr: {
      external: ['electron']
    }
  },
  preload: {},
  renderer: {
    build: {
      rolldownOptions: {
        // Note: libCellML is built for both the Web and Node.js, and it only imports node:module when running in
        //       Node.js (which our renderer never is, see ENVIRONMENT_IS_NODE in libcellml.js), so there is no need for
        //       Vite to replace it with an empty module (and to warn us about it).

        external: ['node:module']
      },
      target: 'esnext',
      copyPublicDir: false
      // Note: our renderer's public folder only contains libOpenCOR's glue (see downloadLibopencorJsIfNeeded()), our
      //       CellDL runtime (see buildCellDLRuntime()), and our Web app's .htaccess file, which are only needed by our
      //       Web app (OpenCOR uses our C++ API, see initialiseLocApi(), includes our CellDL runtime, and isn't served
      //       by Apache), so there is no need to ship them.
    },
    define: {
      // Note: unlike OpenCOR's Web app, OpenCOR includes our CellDL runtime (see src/common/celldlRuntime.ts).

      __CELLDL_RUNTIME_BUNDLED__: JSON.stringify(true),
      __CELLDL_RUNTIME_PATH__: JSON.stringify(''),
      __LIBOPENCOR_VERSION__: JSON.stringify(libopencorVersion),
      __OPENCOR_VERSION__: JSON.stringify(opencorVersion)
    },
    envDir: path.join(import.meta.dirname, 'src/renderer'),
    optimizeDeps: {
      // Note: CellDL Editor is only loaded when needed, so Vite would only discover (and optimise) it and its
      //       dependencies at that point, before reloading our renderer, hence we ask Vite to optimise them upfront.

      include: ['@celldl/editor', '@celldl/rdf', '@physiomelinks/bg2cellml'],

      // Note: libCellML and Oxigraph locate their WASM file relative to their own URL, so they must not be optimised.

      exclude: ['libcellml.js', 'oxigraph']
    },
    plugins: [
      // Note: this must be in sync with src/renderer/vite.config.ts, except for the download-libopencor-js plugin and
      //       the scope-celldl-editor-css plugin (OpenCOR's Web app doesn't include our CellDL runtime).

      {
        // Plugin to download libOpenCOR's glue, so that our renderer can also be used as our Web app (e.g., at
        // http://localhost:5173/) when running in development mode. Indeed, our Web app's Content Security Policy only
        // allows scripts from 'self', so libOpenCOR's glue must be served from our public folder (see
        // importLibOpenCORGlue()).

        name: 'download-libopencor-js',
        apply: 'serve',
        async configureServer() {
          await downloadLibopencorJsIfNeeded(
            path.join(rendererPublicDir, 'libopencor', 'downloads', 'wasm', libopencorVersion)
          );
        }
      },
      tailwindcssPlugin(),
      stripPrimeIconsFontFacePlugin(),
      scopeCellDLEditorCssPlugin(),
      shadowCssPlugin(),
      primeVueCssPlugin(),
      vuePlugin({
        features: {
          customElement: OPENCOR_CUSTOM_ELEMENT_COMPONENTS
        },
        template: {
          compilerOptions: {
            nodeTransforms: [shadowStyleNodeTransform]
          }
        },
        script: {
          fs: {
            fileExists: (file: string) => fs.existsSync(file),
            readFile: (file: string) => fs.readFileSync(file, 'utf-8'),
            realpath: (file: string) => fs.realpathSync(file)
          }
        }
      }),
      vitePlugin({
        resolvers: [primeVueAutoImportResolver.PrimeVueResolver()]
      })
    ],
    publicDir: rendererPublicDir,
    resolve: {
      // Note: CellDL Editor depends on a specific version of Vue, which may therefore get installed alongside ours, yet
      //       there must only be one copy of Vue in our bundle.

      dedupe: ['vue']
    },
    server: {
      fs: {
        allow: [path.join(import.meta.dirname, '..')]
      },
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      }
    }
  }
});
