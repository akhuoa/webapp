/// <reference types="node" />

import * as primeVueAutoImportResolver from '@primevue/auto-import-resolver';
import tailwindcssPlugin from '@tailwindcss/vite';
import vuePlugin from '@vitejs/plugin-vue';

import * as electronVite from 'electron-vite';
import * as fs from 'node:fs';
import path from 'node:path';
import vitePlugin from 'unplugin-vue-components/vite';

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
      target: 'esnext',
      copyPublicDir: false
      // Note: our renderer's public folder only contains libOpenCOR's glue (see downloadLibopencorJsIfNeeded()) and our
      //       Web app's .htaccess file, which are only needed by our Web app (OpenCOR uses our C++ API, see
      //       initialiseLocApi(), and isn't served by Apache), so there is no need to ship them.
    },
    define: {
      __LIBOPENCOR_VERSION__: JSON.stringify(libopencorVersion),
      __OPENCOR_VERSION__: JSON.stringify(opencorVersion)
    },
    envDir: path.join(import.meta.dirname, 'src/renderer'),
    plugins: [
      // Note: this must be in sync with src/renderer/vite.config.ts, except for the download-libopencor-js plugin.

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
