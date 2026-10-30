/// <reference types="vite/client" />

import * as primeVueAutoImportResolver from '@primevue/auto-import-resolver';
import tailwindcssPlugin from '@tailwindcss/vite';
import vuePlugin from '@vitejs/plugin-vue';

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { visualizer as visualizerPlugin } from 'rollup-plugin-visualizer';
import vitePlugin from 'unplugin-vue-components/vite';
import * as vite from 'vite';

import { downloadLibopencorJsIfNeeded } from './scripts/download.libopencor.js.ts';
import { libopencorVersion, opencorVersion } from './scripts/libopencor.version.ts';
import { stripPrimeIconsFontFacePlugin } from './scripts/primeicons.plugin.ts';
import { primeVueCssPlugin } from './scripts/primevue.css.plugin.ts';
import {
  OPENCOR_CUSTOM_ELEMENT_COMPONENTS,
  shadowCssPlugin,
  shadowStyleNodeTransform
} from './scripts/shadow.css.plugin.ts';

await downloadLibopencorJsIfNeeded(
  path.join(import.meta.dirname, 'public', 'libopencor', 'downloads', 'wasm', libopencorVersion)
);

export default vite.defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2048,
    rolldownOptions: {
      output: {
        // Note: our file names include a hash of their contents, so that they can be cached for a long time (since a
        //       new version of a file will have a different name, see public/.htaccess). Only index.html and
        //       assets/version.json have a fixed name, which is why they must never be cached for long (see
        //       src/common/version.ts and public/.htaccess) and why they must be uploaded last when deploying our Web
        //       app (see .github/workflows/cd.yml and cddev.yml). This also means that old files are left behind on our
        //       server, hence we prune them after some time (see scripts/prune.web.ts).

        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`
      }
    },
    target: 'esnext'
  },
  publicDir: path.join(import.meta.dirname, 'public'),
  define: {
    __LIBOPENCOR_VERSION__: JSON.stringify(libopencorVersion),
    __OPENCOR_VERSION__: JSON.stringify(opencorVersion)
  },
  plugins: [
    // Note: this must be in sync with electron.vite.config.ts.

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
    }),
    ...(process.env.STATS === 'true'
      ? [
          visualizerPlugin({
            filename: 'dist/stats.html',
            gzipSize: true
          })
        ]
      : [])
  ],
  server: {
    fs: {
      allow: [fileURLToPath(new URL('../..', import.meta.url))]
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
});
