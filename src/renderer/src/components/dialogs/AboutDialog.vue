<template>
  <BaseDialog header="About OpenCOR" class="w-169" @cancel="copyToClipboard.reset">
    <div class="flex flex-col gap-4 mb-1">
      <!-- Logo, name, copyright, and description (our version being part of our system details) -->

      <div class="flex items-center gap-5">
        <img class="logo shrink-0" src="../../assets/logo.svg" alt="" />
        <div class="min-w-0">
          <div class="app-name">OpenCOR</div>
          <div class="app-copyright">Copyright © {{ COPYRIGHT }}</div>
          <p class="description">
            <a href="https://opencor.ws/" target="_blank" rel="noopener">OpenCOR</a> is a frontend to
            <a href="https://opencor.ws/libopencor/" target="_blank" rel="noopener">libOpenCOR</a>, a library that can be
            used to organise, edit, simulate, and analyse <a href="https://cellml.org/" target="_blank" rel="noopener">CellML</a>
            files.
          </p>
        </div>
      </div>

      <!-- System details, which can be copied (e.g., to report an issue) -->

      <div class="details">
        <dl class="details-list details-list-software">
          <div v-for="detail in softwareDetails" :key="detail.label" class="detail">
            <dt>{{ detail.label }}</dt>
            <dd>{{ detail.value }}</dd>
          </div>
        </dl>
        <template v-if="hardwareDetails.length">
          <hr class="details-separator" />
          <dl class="details-list details-list-hardware">
            <div v-for="(detail, index) in hardwareDetails" :key="detail.label" class="detail"
              :class="{ 'detail-wide': index === hardwareDetails.length - 1 && hardwareDetails.length % 2 === 1 }"
            >
              <dt>{{ detail.label }}</dt>
              <dd>{{ detail.value }}</dd>
            </div>
          </dl>
        </template>
        <ToolbarButtonWidget class="copy-button"
          v-bind="copyToClipboard.buttonProps('Copy system details')"
          tooltipAlign="end"
          @click="copyDetails"
        />
      </div>

      <!-- The two versions of OpenCOR -->

      <div class="flavours grid grid-cols-2 gap-3">
        <a class="flavour" href="https://github.com/opencor/webapp/releases/latest" target="_blank" rel="noopener">
          <i class="pi pi-desktop flavour-icon"></i>
          <span class="min-w-0">
            <span class="flavour-title">Desktop application <i class="pi pi-external-link flavour-link-icon"></i></span>
            <span class="flavour-description">For Windows, Linux, and macOS, on Intel and ARM machines.</span>
          </span>
        </a>
        <a class="flavour" href="https://opencor.ws/app" target="_blank" rel="noopener">
          <i class="pi pi-globe flavour-icon"></i>
          <span class="min-w-0">
            <span class="flavour-title">Web app <i class="pi pi-external-link flavour-link-icon"></i></span>
            <span class="flavour-description">Runs in your Web browser, with nothing to install.</span>
          </span>
        </a>
      </div>
    </div>
    <template #footer>
      <div class="w-full flex items-center justify-between gap-4">
        <!-- Links -->

        <div class="links">
          <a href="https://opencor.ws/" target="_blank" rel="noopener"><i class="pi pi-home"></i>Website</a>
          <a href="https://github.com/opencor/webapp" target="_blank" rel="noopener"><i class="pi pi-github"></i>Source code</a>
          <a href="https://github.com/opencor/webapp/issues/new" target="_blank" rel="noopener"><i class="pi pi-exclamation-circle"></i>Report an issue</a>
        </div>
        <Button label="OK" autofocus @click="$emit('close')" />
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import * as vue from 'vue';

import * as common from '../../common/common';
import { COPYRIGHT } from '../../common/constants';
import { electronApi } from '../../common/electronApi';
import { currentVersion } from '../../common/version';
import * as vueCommon from '../../common/vueCommon';
import * as locApi from '../../libopencor/locApi';

import ToolbarButtonWidget from '../widgets/ToolbarButtonWidget.vue';

defineEmits<{
  close: [];
}>();

// Our system details, i.e. our software details (where OpenCOR runs, i.e. our platform and either our browser or
// Electron, in the first column, and our versions, in the second column) and our hardware details (our CPU, memory, and
// GPU), each of them being listed in the order in which it is shown.
// Note #1: we are mounted when OpenCOR starts, i.e. possibly before libOpenCOR is initialised, so we must not retrieve
//          libOpenCOR's version straightaway, hence we use computed properties, which are only evaluated when our
//          contents first get rendered, i.e. when we are first shown (which can only be once OpenCOR is initialised).
//          None of our details can change while OpenCOR is running, so they are then cached.
// Note #2: a hardware detail that cannot be retrieved (e.g., the amount of memory in a browser that doesn't provide it,
//          such as Safari or Firefox, see memoryDescription()) is not shown at all.

interface IDetail {
  label: string;
  value: string;
}

// Our system details, which are only available in OpenCOR (i.e. not in OpenCOR's Web app).

const systemDetails = vue.computed<common.ISystemDetails | undefined>(() => {
  return electronApi?.systemDetails();
});

const softwareDetails = vue.computed<IDetail[]>(() => {
  return [
    { label: 'Platform', value: electronApi ? electronApi.operatingSystem() : common.osName() },
    systemDetails.value
      ? {
          label: 'Electron',
          value: `${systemDetails.value.electronVersion} (Chromium ${systemDetails.value.chromiumVersion})`
        }
      : { label: 'Browser', value: browserDescription() },
    { label: 'OpenCOR', value: currentVersion },
    { label: 'libOpenCOR', value: locApi.version() }
  ];
});

const hardwareDetails = vue.computed<IDetail[]>(() => {
  return [
    { label: 'CPU', value: cpuDescription() },
    { label: 'Memory', value: memoryDescription() },
    { label: 'GPU', value: gpuDescription() }
  ].filter((detail) => detail.value);
});

// Remove the trademark symbols that may be part of the name of a CPU or GPU (e.g., "Intel(R) Core(TM) i7-9750H").

const withoutTrademarks = (name: string): string => {
  return name
    .replace(/\((R|TM)\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// A description of our CPU, i.e. its model and number of logical cores in OpenCOR (e.g., "Apple M2 Pro, 12 logical
// cores"), and only its number of logical cores in OpenCOR's Web app (since a browser doesn't tell us its model).

const cpuDescription = (): string => {
  const cpuModel = systemDetails.value ? withoutTrademarks(systemDetails.value.cpuModel) : '';
  const logicalCoreCount = systemDetails.value
    ? systemDetails.value.logicalCoreCount
    : navigator.hardwareConcurrency || 0;
  const logicalCores = logicalCoreCount ? `${logicalCoreCount} logical core${logicalCoreCount === 1 ? '' : 's'}` : '';

  return [cpuModel, logicalCores].filter(Boolean).join(', ');
};

// The User-Agent Client Hints of the browser in which our Web app is running, if available (i.e. in Chromium-based
// browsers).

interface IUserAgentData {
  brands: { brand: string; version: string }[];
  platform: string;
}

const userAgentData = (): IUserAgentData | undefined => {
  return (navigator as Navigator & { userAgentData?: IUserAgentData }).userAgentData;
};

// The lowest and highest values that navigator.deviceMemory can report, which depend on the version of Chromium and on
// the platform.
// Note #1: from Chromium 146, the values are 2, 4, 8, 16, and 32 on desktop, and 2, 4, and 8 on Android (see
//          https://groups.google.com/a/chromium.org/g/blink-dev/c/vXtAmrVZeDk and https://crbug.com/454354290) while
//          they used to be 0.25, 0.5, 1, 2, 4, and 8 on all platforms.
// Note #2: Chromium's implementation may now report 1 on Android, but we still consider 2 as the lowest value there,
//          so that a device reporting 2 is described as having about 2 GB "or less" (which is true either way).
// Note #3: if we can't tell the version of Chromium, then we assume the old values.

const UPDATED_DEVICE_MEMORY_LIMITS_CHROMIUM_VERSION = 146;

const deviceMemoryBounds = (): [number, number] => {
  const chromiumVersion = Number(
    userAgentData()?.brands.find((brand) => brand.brand === 'Chromium')?.version ??
      navigator.userAgent.match(/(?:Chrome|CriOS)\/(\d+)/)?.[1] ??
      0
  );

  if (chromiumVersion >= UPDATED_DEVICE_MEMORY_LIMITS_CHROMIUM_VERSION) {
    return userAgentData()?.platform === 'Android' || /Android/.test(navigator.userAgent) ? [2, 8] : [2, 32];
  }

  return [0.25, 8];
};

// A description of our amount of memory.
// Note: in OpenCOR's Web app, we can only rely on navigator.deviceMemory, which is only available in Chromium-based
//       browsers, and which is the amount of memory rounded to the nearest power of two (e.g., 16 GB for 14 GB), hence
//       we say "about", and clamped (see deviceMemoryBounds()), hence we say "or more" (or "or less") when it is the
//       highest (or lowest) value that can be reported.

const memoryDescription = (): string => {
  if (systemDetails.value) {
    return systemDetails.value.totalMemory ? `${Math.round(systemDetails.value.totalMemory / 1024 ** 3)} GB` : '';
  }

  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;

  if (!deviceMemory) {
    return '';
  }

  const [lowestDeviceMemory, highestDeviceMemory] = deviceMemoryBounds();

  if (deviceMemory >= highestDeviceMemory) {
    return `About ${deviceMemory} GB or more`;
  }

  if (deviceMemory <= lowestDeviceMemory) {
    return `About ${deviceMemory} GB or less`;
  }

  return `About ${deviceMemory} GB`;
};

// A description of our GPU, i.e. the name of the renderer used by WebGL (which is the same in OpenCOR and in OpenCOR's
// Web app since OpenCOR's renderer is Chromium-based).
// Note #1: Chromium-based browsers and Safari report a generic renderer (i.e. "WebKit WebGL"), unless asked for the
//          unmasked one, while Firefox reports a (sanitised) real one, followed by ", or similar", and deprecates
//          asking for the unmasked one.
// Note #2: Chromium-based browsers report a renderer through ANGLE, i.e. "ANGLE (<vendor>, <device>, <driver>)", from
//          which we only keep the device, without its id or, on Windows, its Direct3D details (e.g., "ANGLE (NVIDIA,
//          NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)" becomes "NVIDIA GeForce RTX 3070").
// Note #3: we release our WebGL context straightaway (even if we fail to retrieve our renderer) since browsers limit
//          the number of active WebGL contexts.

const gpuDescription = (): string => {
  let renderer = '';
  let webglContext: WebGLRenderingContext | null = null;

  try {
    webglContext = document.createElement('canvas').getContext('webgl');

    if (!webglContext) {
      return '';
    }

    renderer = String(webglContext.getParameter(webglContext.RENDERER) ?? '');

    if (/^WebKit WebGL$/i.test(renderer)) {
      const debugRendererInfo = webglContext.getExtension('WEBGL_debug_renderer_info');

      renderer = debugRendererInfo
        ? String(webglContext.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL) ?? '')
        : '';
    }
  } catch {
    return '';
  } finally {
    webglContext?.getExtension('WEBGL_lose_context')?.loseContext();
  }

  renderer = renderer.replace(/,\s*or similar$/i, '');

  const angleMatch = renderer.match(/^ANGLE \((.*)\)$/);

  if (angleMatch) {
    const parts = (angleMatch[1] ?? '').split(', ');

    renderer = (parts.length > 2 ? parts.slice(1, -1).join(', ') : (parts[1] ?? parts[0] ?? ''))
      .replace(/^ANGLE Metal Renderer: /, '')
      .replace(/\s*\(0x[\da-f]+\)/gi, '')
      .replace(/\s+Direct3D.*$/, '');
  }

  return withoutTrademarks(renderer);
};

// A human-readable description of the browser in which our Web app is running (e.g., "Chrome 142").
// Note: we use the browser's User-Agent Client Hints, if available (i.e. in Chromium-based browsers), and its user
//       agent string otherwise.

const browserDescription = (): string => {
  const brands = userAgentData()?.brands;
  const userAgent = navigator.userAgent;
  let name = '';
  let version = '';

  if (brands) {
    // Use the most specific brand (e.g., "Google Chrome"), i.e. neither Chromium itself nor a "GREASE" brand, which is
    // a fake brand with some random punctuation (e.g., "Not)A;Brand" or "Not_A Brand") that Chromium-based browsers add
    // on purpose so that websites don't rely on an exact list of brands.

    const brand =
      brands.find((brand) => !/chromium|not.a.brand/i.test(brand.brand)) ??
      brands.find((brand) => /chromium/i.test(brand.brand));

    if (brand) {
      name = brand.brand.replace(/^Google /, '').replace(/^Microsoft /, '');
      version = brand.version;
    }
  }

  if (!name) {
    const browsers: [string, RegExp][] = [
      ['Edge', /Edg(?:e|A|iOS)?\/(\d+)/],
      ['Opera', /OPR\/(\d+)/],
      ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
      ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
      ['Safari', /Version\/(\d+(?:\.\d+)?).*Safari/]
    ];

    for (const [browserName, browserRegExp] of browsers) {
      const match = userAgent.match(browserRegExp);

      if (match) {
        name = browserName;
        version = match[1] ?? '';

        break;
      }
    }
  }

  return name ? `${name}${version ? ` ${version}` : ''}` : 'Unknown';
};

// Copy our system details, exactly as shown, to the clipboard, so that they can easily be included in an issue report,
// for instance.

const copyToClipboard = vueCommon.useCopyToClipboard();

const copyDetails = (): void => {
  void copyToClipboard.copy(
    [...softwareDetails.value, ...hardwareDetails.value].map((detail) => `${detail.label}: ${detail.value}`).join('\n')
  );
};
</script>

<style scoped>
.logo {
  width: 5rem;
}

.app-name {
  color: var(--p-text-color);
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
}

.app-copyright {
  margin-top: 0.125rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
}

.description {
  margin: 0.5rem 0 0;
  font-size: 0.875rem;
  line-height: 1.5;
}

/**
 * System details.
 * Note #1: our software and hardware details are each shown as a grid of label/value pairs (rather than as a list), so
 *          that they fill our frame rather than leave most of it empty. Both grids have the same columns, so that they
 *          are aligned. Our software details are listed column by column (i.e. where OpenCOR runs on the left and our
 *          versions on the right), while our hardware details are listed row by row, with the last one taking the
 *          whole row if it would otherwise be on its own (e.g., our GPU, which may have a long name).
 * Note #2: our copy button is positioned in the top right corner of our frame (rather than next to our grids), so that
 *          our separator can span the whole width of our frame. Our grids leave some room for it.
 */

.details {
  --details-padding: 1rem;
  --details-copy-button-room: 2.25rem;

  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 0.625rem var(--details-padding);
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.5rem;
  background-color: color-mix(in srgb, var(--p-text-color) 3%, transparent);
}

.details-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.375rem 1.5rem;
  margin: 0 var(--details-copy-button-room) 0 0;
}

.details-list-software {
  grid-template-rows: repeat(2, auto);
  grid-auto-flow: column;
}

.details-separator {
  margin: 0 calc(-1 * var(--details-padding));
  border: none;
  border-top: 1px solid var(--p-content-border-color);
}

.copy-button {
  position: absolute;
  top: 0.3125rem;
  right: 0.5rem;
}

/**
 * Note: a detail is shown on a single line, i.e. with its label next to (rather than above) its value, so that our
 *       frame doesn't make our dialog too tall to fit in a small window.
 */

.detail {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  min-width: 0;
}

.detail-wide {
  grid-column: 1 / -1;
}

.detail dt {
  flex-shrink: 0;
  width: 4.75rem;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}

.detail dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  user-select: text;
}

/**
 * The two versions of OpenCOR (i.e. its desktop version and its Web app).
 */

.flavour {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.5rem;
  color: var(--p-text-color) !important;
  text-decoration: none;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.flavour:hover {
  border-color: color-mix(in srgb, var(--p-primary-color) 40%, var(--p-content-border-color));
  background-color: color-mix(in srgb, var(--p-primary-color) 6%, transparent);
}

.flavour:focus-visible {
  box-shadow: 0 0 0 2px var(--p-primary-color);
}

.flavour-icon {
  margin-top: 0.125rem;
  color: var(--p-primary-color);
  font-size: 1.125rem;
}

.flavour-title {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  font-weight: 600;
}

.flavour-link-icon {
  color: var(--p-text-muted-color);
  font-size: 0.625rem;
}

.flavour-description {
  display: block;
  margin-top: 0.125rem;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  line-height: 1.4;
}

/**
 * Links.
 */

.links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.25rem;
  font-size: 0.8125rem;
}

.links a {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  text-decoration: none;
}

.links a:hover {
  text-decoration: underline;
}

.links .pi {
  font-size: 0.8125rem;
}

/**
 * Narrow layout, i.e. when OpenCOR is less than 40rem wide (see NARROW_LAYOUT_WIDTH in constants.ts), e.g., on a phone
 * or when OpenCOR is embedded in a small container (see opencor-dialog in BaseDialog.vue). Our details and the two
 * versions of OpenCOR are then shown in a single column, so that our details are not wrapped every few characters.
 */

@container opencor-dialog (width < 40rem) {
  .details-list,
  .flavours {
    grid-template-columns: minmax(0, 1fr);
  }

  .details-list-software {
    grid-template-rows: none;
    grid-auto-flow: row;
  }

  .details-list-hardware {
    margin-right: 0;
  }
}
</style>
