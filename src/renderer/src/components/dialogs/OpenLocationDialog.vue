<template>
  <BaseDialog header="Open Location" class="w-169" @cancel="reset">
    <div class="flex flex-col gap-2 mt-1 mb-2">
      <p class="description">Enter the {{ inputDescription }} of a CellML file, SED-ML file, or COMBINE archive.</p>
      <IconField>
        <InputIcon class="pi pi-link" />
        <InputText ref="inputRef" v-model="url" autofocus fluid
          :invalid="showIssue"
          placeholder="https://example.com/model.omex"
          spellcheck="false"
          autocomplete="off"
          autocapitalize="off"
          inputmode="url"
          @blur="onBlur"
          @keydown.enter="onKeydownEnter"
        />
        <!--
        Note: our clear button is a real button (rather than an input icon) so that it can be used with the keyboard,
              but it is styled and positioned like an input icon (see .p-inputicon).
        -->
        <button v-if="url" ref="clearButtonRef" class="p-inputicon clear-button pi pi-times" type="button" v-hint="'Clear'"
          @mousedown.prevent
          @blur="onBlur"
          @click="onClear"
        />
      </IconField>

      <!--
      Message, which always takes the same space (whether there is a message to show or not), so that the height of the
      dialog doesn't change.
      -->

      <div class="message">
        <p v-if="showIssue" class="issue" role="alert">
          <i class="pi pi-exclamation-circle"></i>
          <span>Please enter a valid {{ validInputDescription }} (e.g., <code>https://example.com/model.omex</code>).</span>
        </p>
        <p v-else-if="normalisedUrl && normalisedUrl !== url.trim() && !normalisedUrl.startsWith('data:')" class="hint"
          v-hint="willOpenMessageTruncated ? `This will open ${normalisedUrl}.` : ''"
          @pointerenter="onWillOpenMessagePointerEnter"
        >
          <i class="pi pi-info-circle"></i>
          <span ref="willOpenMessageRef">This will open <code>{{ normalisedUrl }}</code>.</span>
        </p>
      </div>
    </div>
    <template #footer>
      <Button label="Open" :disabled="!normalisedUrl" @click="emitOpenLocation" />
      <Button ref="cancelButtonRef" label="Cancel" severity="secondary" @click="emitClose" />
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import * as vue from 'vue';

import * as common from '../../common/common';
import { electronApi } from '../../common/electronApi';
import { vHint } from '../../common/hint';

const emit = defineEmits<{
  openLocation: [url: string];
  close: [];
}>();

const url = vue.ref<string>('');
const checked = vue.ref<boolean>(false);

// The URL to open, if valid, i.e. the given URL without any leading/trailing whitespace, with a lowercase scheme (e.g.,
// "Https://" becomes "https://", as some mobile keyboards capitalise the first letter of what is typed), and with an
// https:// scheme if it has no scheme (e.g., "example.com/model.omex" becomes "https://example.com/model.omex"), and
// with the dot segments of its path, if any, resolved (see Note #6).
// Note #1: a scheme is followed by "//", so that, for instance, "localhost:8080/model.omex" is not considered as having
//          a "localhost" scheme.
// Note #2: a URL without a scheme must have a host that looks like one (i.e. a domain name, an IP address, or
//          localhost), so that, for instance, some random text is not considered as a valid URL. A domain name or an
//          IPv4 address is a host (as typed, i.e. before it gets normalised by the URL parser) with at least two
//          dot-separated labels, none of which is empty (with an optional trailing dot), so that, for instance, a
//          relative path (e.g., "./model.omex", which host would be ".") or a number (e.g., "42") is not considered as
//          a valid URL. (A relative path which first segment looks like a domain name (e.g., "model.omex") is still
//          considered as a valid URL (i.e. "https://model.omex"), hence we let people know which URL will be opened.)
//          An IPv4 address must also be typed as the URL parser would normalise it (i.e. as four decimal numbers,
//          without leading zeros and without a trailing dot), so that, for instance, a number with dot-separated parts
//          (e.g., "3.14", which the URL parser would normalise to "3.0.0.14") or an address with leading zeros (e.g.,
//          "192.168.010.001", which the URL parser would normalise to "192.168.8.1" since "010" is an octal number) is
//          not considered as a valid URL. A URL with a scheme can have any host (e.g., an intranet host, such as
//          "http://modelserver/model.omex").
// Note #3: a data URL is also valid if it is a Base64-encoded COMBINE archive (i.e. "data:application/zip;base64,...")
//          or zipped CellML file (i.e. "data:application/x.vnd.zip-cellml+zip;base64,..."), since it can then be opened
//          like any other file (see OpenCOR.openFile() and locCommon.zipDataFromDataUrl()). It is used as is, apart
//          from its scheme, media type, and ";base64" which are lowercased (since locCommon.zipDataFromDataUrl()
//          expects them to be), so, unlike for other URLs, we don't let people know which URL will be opened since it
//          would be (nearly) the same and it can be very long.
// Note #4: a URL without a scheme must also have no user name and no password, so that, for instance, an email address
//          (e.g., "user@example.com") or a mailto link (e.g., "mailto:user@example.com", which has no "//" after its
//          scheme) is not considered as a valid URL, i.e. as "https://user@example.com" or as
//          "https://mailto:user@example.com" (where "mailto" would be a user name and "user" a password). A URL with a
//          scheme can have a user name and a password (e.g., "https://user@example.com/model.omex").
// Note #5: in OpenCOR (i.e. not in OpenCOR's Web app), a local file can also be opened, be it using a "file" URL with
//          no host or a "localhost" host (e.g., "file:///some/path/model.omex") or an absolute file path (e.g.,
//          "/some/path/model.omex" or, on Windows, "C:\some\path\model.omex" or "\\server\share\model.omex"), since it
//          can then be opened like any other file (see OpenCOR.openFile()). It is used as is, apart from the scheme of
//          a "file" URL which is lowercased, and it is not decoded (see emitOpenLocation()). A "file" URL with another
//          host (e.g., "file://server/share/model.omex") is not considered as valid since libOpenCOR would consider it
//          as a remote file, which it would then retrieve synchronously (i.e. freezing our UI). A relative file path is
//          not considered as valid either since it would be relative to the working directory of OpenCOR, which people
//          cannot know. Neither is a "file" URL or a file path that doesn't end with a file name (e.g., "file:/",
//          "file:///some/path/", "/", "/some/path/..", or "C:\"), since it cannot refer to a file. Note that the query
//          and fragment of a "file" URL are ignored by libOpenCOR (e.g., "file:///some/path/model.omex?a=b#c" refers to
//          "/some/path/model.omex"), hence we only check its path.
// Note #6: the path of a Web address may contain dot segments (e.g., "https://example.com/some/path/../model.omex"),
//          which we resolve (e.g., "https://example.com/some/model.omex"), so that people know which URL will really be
//          opened, and so that the name of the file that gets opened is not "." or ".." (e.g., for
//          "https://example.com/some/path/.."). A Web address need not end with a file name (e.g.,
//          "https://example.com/some/path/download"), so a path that resolves to a "directory" (e.g.,
//          "https://example.com/some/") is still valid. Only the path of the URL is changed (using the path, as
//          percent-encoded by the URL parser), i.e. the rest of the URL is used as typed (e.g., its host is not
//          lowercased or converted to Punycode).

const DATA_URL_REGEX = /^data:(application\/(?:zip|x\.vnd\.zip-cellml\+zip);base64),/i;
const DOTTED_HOST_REGEX = /^[^.]+(?:\.[^.]+)+\.?$/;
const IPV4_ADDRESS_REGEX = /^\d+\.\d+\.\d+\.\d+$/;
const FILE_URL_REGEX = /^file:\//i;
const FILE_URL_HOST_REGEX = /^file:\/\/([^/?#]*)/i;
const FILE_URL_WITHOUT_FILE_NAME_PATH_REGEX = /(?:^|\/)(?:[a-z]:)?$/i;
const POSIX_ABSOLUTE_FILE_PATH_REGEX = /^\/.*[^/]$/;
const WINDOWS_ABSOLUTE_FILE_PATH_REGEX = /^(?:[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+[\\/]).*[^\\/]$/i;
const DOT_SEGMENT_FILE_PATH_REGEX = /(?:^|[\\/])\.\.?$/;
const DOT_SEGMENT_URL_PATH_REGEX = /(?:^|[\\/])(?:\.|%2e){1,2}(?=[\\/]|$)/i;

// Resolve the dot segments of the path of the given Web address, if any, using the path of its parsed version (see
// Note #6 above).
// Note: the authority of a Web address starts after all the slashes that follow its scheme (the URL parser skips any
//       number of them, e.g., "https:///example.com/model.omex" has "example.com" as its host) and ends with its path,
//       query, or fragment, if any, while its path ends with its query or fragment, if any. A backslash is considered
//       as a forward slash by the URL parser for a Web address.

const resolvedDotSegmentsUrl = (urlWithScheme: string, parsedUrl: URL): string => {
  const schemeEnd = urlWithScheme.indexOf(':') + 1;
  const authorityOffset = urlWithScheme.slice(schemeEnd).search(/[^\\/]/);

  if (authorityOffset === -1) {
    return urlWithScheme;
  }

  const authorityStart = schemeEnd + authorityOffset;
  const pathOffset = urlWithScheme.slice(authorityStart).search(/[\\/?#]/);

  if (pathOffset === -1) {
    return urlWithScheme;
  }

  const pathStart = authorityStart + pathOffset;
  const pathAndRest = urlWithScheme.slice(pathStart);
  const pathLength = pathAndRest.search(/[?#]/);
  const path = pathLength === -1 ? pathAndRest : pathAndRest.slice(0, pathLength);

  if (!DOT_SEGMENT_URL_PATH_REGEX.test(path)) {
    return urlWithScheme;
  }

  return `${urlWithScheme.slice(0, pathStart)}${parsedUrl.pathname}${pathAndRest.slice(path.length)}`;
};

// What can be entered, depending on whether local files are supported (see Note #5 above).

const localFilesSupported = !!electronApi;
const inputDescription = localFilesSupported ? 'URL or path' : 'URL';
const validInputDescription = localFilesSupported ? 'Web address or file path' : 'Web address';

// The local file to open, if any (see Note #5 above).

const localFile = vue.computed<string>(() => {
  if (!localFilesSupported) {
    return '';
  }

  const trimmedUrl = url.value.trim();

  if (FILE_URL_REGEX.test(trimmedUrl)) {
    // Note: we check the host of our "file" URL as typed (as libOpenCOR does) rather than as normalised by the URL
    //       parser, which, for instance, considers that "file://C:/some/path/model.omex" has no host while libOpenCOR
    //       considers that its host is "C:".

    const fileUrlHost = FILE_URL_HOST_REGEX.exec(trimmedUrl)?.[1] ?? '';

    if (fileUrlHost && fileUrlHost.toLowerCase() !== 'localhost') {
      return '';
    }

    const fileUrl = `file:${trimmedUrl.slice(5)}`;

    try {
      return FILE_URL_WITHOUT_FILE_NAME_PATH_REGEX.test(new URL(fileUrl).pathname) ? '' : fileUrl;
    } catch {
      return '';
    }
  }

  return (common.isWindows() ? WINDOWS_ABSOLUTE_FILE_PATH_REGEX : POSIX_ABSOLUTE_FILE_PATH_REGEX).test(trimmedUrl) &&
    !DOT_SEGMENT_FILE_PATH_REGEX.test(trimmedUrl)
    ? trimmedUrl
    : '';
});

const normalisedUrl = vue.computed<string>(() => {
  const trimmedUrl = url.value.trim();

  if (!trimmedUrl) {
    return '';
  }

  if (localFile.value) {
    return localFile.value;
  }

  const dataUrlMediaType = DATA_URL_REGEX.exec(trimmedUrl)?.[1];

  if (dataUrlMediaType) {
    return `data:${dataUrlMediaType.toLowerCase()}${trimmedUrl.slice(5 + dataUrlMediaType.length)}`;
  }

  const scheme = /^([a-z][a-z\d+.-]*):\/\//i.exec(trimmedUrl)?.[1];
  const urlWithScheme = scheme ? `${scheme.toLowerCase()}${trimmedUrl.slice(scheme.length)}` : `https://${trimmedUrl}`;

  // The host of our URL, as typed, if it has no scheme (i.e. what comes before its path, query, or fragment, without
  // its port, if any).

  const typedHost = scheme ? '' : (trimmedUrl.split(/[/?#\\]/, 1)[0] ?? '').replace(/:\d*$/, '');

  try {
    const parsedUrl = new URL(urlWithScheme);

    if (
      (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') &&
      (scheme ||
        (!parsedUrl.username &&
          !parsedUrl.password &&
          ((DOTTED_HOST_REGEX.test(typedHost) &&
            (!IPV4_ADDRESS_REGEX.test(parsedUrl.hostname) || parsedUrl.hostname === typedHost)) ||
            parsedUrl.hostname.startsWith('[') ||
            parsedUrl.hostname === 'localhost')))
    ) {
      return resolvedDotSegmentsUrl(urlWithScheme, parsedUrl);
    }
  } catch {
    // The URL is not valid.
  }

  return '';
});

// Let people know that their URL is not valid, but only once they are done typing it (i.e. once they leave our input
// field or try to open it, which doesn't count if there is no URL to open), so that they are not told off while still
// typing it.
// Note #1: once our URL is valid (or empty), it is no longer considered as checked, so that people are not told off
//          (again) while editing it (or typing a new one). Similarly, we only consider our URL as checked when leaving
//          our input field if it is not valid (e.g., not when people tab from a valid URL to our Open button and back
//          to our URL to edit it).
// Note #2: our input field is also blurred when our dialog gets hidden (i.e. after we have been reset since the
//          keyboard focus is then given back to whatever had it before our dialog was shown), so we only consider our
//          URL as checked when leaving our input field if there is a URL to check. Otherwise, our URL would be
//          considered as checked the next time our dialog is shown and people would be told off while typing it.
// Note #3: our issue is an alert, so that it gets announced by assistive technologies when it is shown.
// Note #4: we don't consider our URL as checked when leaving our input field for our Cancel button or the close button
//          of our dialog, since our dialog is then about to be closed. Otherwise, our issue would briefly be shown
//          (and announced) before our dialog gets closed. Our input field is left either when the keyboard focus moves
//          to one of those buttons (e.g., using Tab or, in some browsers, when clicking it), in which case we know
//          which button gets the keyboard focus, or when one of those buttons is pressed (in browsers where clicking a
//          button doesn't give it the keyboard focus, e.g., Safari), in which case we need to know which button is
//          being pressed, hence we keep track of it (in the capture phase, i.e. before our input field gets blurred)
//          until it has been clicked (rather than released since, with touch input, a button is released before our
//          input field gets blurred).

const showIssue = vue.computed<boolean>(() => {
  return checked.value && !!url.value.trim() && !normalisedUrl.value;
});

vue.watch([normalisedUrl, url], ([newNormalisedUrl, newUrl]) => {
  if (newNormalisedUrl || !newUrl.trim()) {
    checked.value = false;
  }
});

// Let people know which URL will be opened in full, using a hint, if our message about it is truncated (see .hint).
// Note: we check whether our message is truncated when it gets hovered, i.e. before its hint gets shown (which happens
//       after a delay, see hint.ts), rather than whenever our message or our dialog changes size.

const willOpenMessageRef = vue.useTemplateRef<HTMLElement>('willOpenMessageRef');
const willOpenMessageTruncated = vue.ref<boolean>(false);

const onWillOpenMessagePointerEnter = (): void => {
  const willOpenMessage = willOpenMessageRef.value;

  willOpenMessageTruncated.value = !!willOpenMessage && willOpenMessage.scrollWidth > willOpenMessage.clientWidth;
};

const cancelButtonRef = vue.useTemplateRef<{ $el: HTMLElement }>('cancelButtonRef');

let closeButtonPressed = false;

const isCloseButton = (target: EventTarget | null): boolean => {
  const cancelButton = cancelButtonRef.value?.$el;

  if (!(target instanceof Element) || !cancelButton) {
    return false;
  }

  return (
    cancelButton.contains(target) ||
    !!(target.closest('.p-dialog-close-button') && cancelButton.closest('.p-dialog')?.contains(target))
  );
};

const onPointerDown = (event: PointerEvent): void => {
  closeButtonPressed = isCloseButton(event.target);
};

const onClickOrPointerCancel = (): void => {
  closeButtonPressed = false;
};

vue.onMounted(() => {
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('click', onClickOrPointerCancel, true);
  window.addEventListener('pointercancel', onClickOrPointerCancel, true);
});

vue.onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPointerDown, true);
  window.removeEventListener('click', onClickOrPointerCancel, true);
  window.removeEventListener('pointercancel', onClickOrPointerCancel, true);
});

// Note: our input field and its clear button are considered as one, so moving the keyboard focus from one to the other
//       doesn't count as leaving our input field (e.g., when tabbing to our clear button to clear an invalid URL, in
//       which case our issue would otherwise briefly be shown (and announced) before our URL gets cleared), but leaving
//       our clear button for anything else does.

const clearButtonRef = vue.useTemplateRef<HTMLElement>('clearButtonRef');

const isUrlField = (target: EventTarget | null): boolean => {
  return target instanceof Node && (!!inputRef.value?.$el.contains(target) || !!clearButtonRef.value?.contains(target));
};

const onBlur = (event: FocusEvent): void => {
  if (closeButtonPressed || isCloseButton(event.relatedTarget) || isUrlField(event.relatedTarget)) {
    return;
  }

  checked.value = !!url.value.trim() && !normalisedUrl.value;
};

const reset = (): void => {
  url.value = '';
  checked.value = false;
};

// Clear our URL and give the keyboard focus back to our input field.
// Note: our clear button disappears once our URL has been cleared, so if it has the keyboard focus (i.e. if it was used
//       with the keyboard), then the keyboard focus would otherwise be lost.

const inputRef = vue.useTemplateRef<{ $el: HTMLElement }>('inputRef');

const onClear = (): void => {
  reset();

  inputRef.value?.$el.focus();
};

// Open our URL when Enter is pressed, unless it is to confirm some text being composed using an input method editor
// (IME), e.g., for Chinese or Japanese (see common.isImeKeyDown()).

const onKeydownEnter = (event: KeyboardEvent): void => {
  if (common.isImeKeyDown(event)) {
    return;
  }

  event.preventDefault();

  emitOpenLocation();
};

const emitOpenLocation = (): void => {
  checked.value = !!url.value.trim();

  if (!normalisedUrl.value) {
    return;
  }

  // Note #1: decodeURI() throws if the URL contains a malformed percent-encoded sequence (e.g., "%E0"), in which case
  //          we use the URL as is.
  // Note #2: a local file is not decoded since libOpenCOR decodes the path of a "file" URL itself, while a percent sign
  //          is a valid character in a file path (e.g., "/some/path/my%20file.omex" and "/some/path/my file.omex" are
  //          two different files).

  let decodedUrl = normalisedUrl.value;

  if (!localFile.value) {
    try {
      decodedUrl = decodeURI(decodedUrl);
    } catch {
      // The URL cannot be decoded, so use it as is.
    }
  }

  emit('openLocation', decodedUrl);

  emitClose();
};

const emitClose = (): void => {
  reset();

  emit('close');
};
</script>

<style scoped>
.description {
  margin: 0 0 0.5rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

/**
 * Note: PrimeVue's focus border takes precedence over its invalid border, so we make sure that an invalid URL is shown
 *       as such even while being edited.
 */

.p-inputtext.p-invalid,
.p-inputtext.p-invalid:focus {
  border-color: var(--p-inputtext-invalid-border-color, var(--p-red-400));
}

/**
 * Note: our clear button is a button that looks like an input icon, hence we reset the default styling of a button.
 */

.clear-button {
  padding: 0;
  border: none;
  border-radius: 0.25rem;
  background: none;
  color: var(--p-text-muted-color);
  cursor: pointer;
}

.clear-button:hover {
  color: var(--p-text-color);
}

.clear-button:focus-visible {
  box-shadow: 0 0 0 2px var(--p-primary-color);
  color: var(--p-text-color);
}

.message {
  height: 1.25rem;
}

/**
 * Note: a message is shown on a single line (so that it never takes more space than we reserve for it), with an
 *       ellipsis if it is too long. Our message about the URL that will be opened may be too long because of a long
 *       URL, in which case it is shown in full in a hint (see onWillOpenMessagePointerEnter()). Our issue is only too
 *       long if our dialog is very narrow, and it is announced in full by assistive technologies anyway.
 */

.hint,
.issue {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.25rem;
}

.hint .pi,
.issue .pi {
  flex-shrink: 0;
  line-height: inherit;
}

.hint span,
.issue span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hint {
  color: var(--p-text-muted-color);
}

.issue {
  color: var(--p-red-500);
}

code {
  font-size: 0.75rem;
}
</style>
