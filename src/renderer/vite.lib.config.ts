import * as primeVueAutoImportResolver from '@primevue/auto-import-resolver';
import tailwindcssPlugin from '@tailwindcss/vite';
import vuePlugin from '@vitejs/plugin-vue';

import * as path from 'node:path';
import * as fs from 'node:fs';
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
  build: {
    lib: {
      entry: './index.ts',
      fileName: (format) => `opencor.${format}.js`,
      formats: ['es'],
      name: 'OpenCOR'
    },
    rolldownOptions: {
      external: ['vue'],
      output: {
        exports: 'named',
        globals: {
          vue: 'Vue'
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.names.includes('style.css')) {
            return 'dist/opencor.css';
          }

          return assetInfo.names[0] ?? 'default-name';
        }
      }
    },
    target: 'esnext',
    copyPublicDir: false
    // Note: our public folder only contains libOpenCOR's glue (see downloadLibopencorJsIfNeeded()), which host
    //       applications don't serve from our package anyway (we fall back on importing it from https://opencor.ws in
    //       that case, see src/common/initialisation.ts), and our Web app's .htaccess file, which is only relevant to
    //       our Web app, so there is no need to ship them.
  },
  publicDir: path.join(import.meta.dirname, 'public'),
  define: {
    __LIBOPENCOR_VERSION__: JSON.stringify(libopencorVersion),
    __OPENCOR_VERSION__: JSON.stringify(opencorVersion)
  },
  plugins: [
    // Note: this must be in sync with vite.config.ts, except for the style-css-stub plugin, which is only needed for the
    //       library build.

    {
      // Plugin to emit an empty dist/opencor.css file.
      // Note: our styles are now injected into our shadow root (see src/common/shadowStyles.ts), so there is no CSS
      //       file for host applications to import anymore. However, host applications may still import
      //       @opencor/opencor/style.css, so we keep providing it (as an empty file), so that they don't break.

      name: 'style-css-stub',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'opencor.css',
          source:
            '/* OpenCOR now injects its styles into its shadow root, so there is no need to import this file anymore. */\n'
        });
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
  ]
});
