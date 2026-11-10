// A simple CORS proxy handler for Cloudflare Workers (see https://workers.cloudflare.com/).
// Note: the proxy accepts any target URL, but it only returns content that is a CellML file, a SED-ML file, an OMEX
//       file, or a CSV file (see isCsvFile()), and that is not too large (see MAX_SIZE). Such content is returned as an
//       opaque, sandboxed download, so that a browser never renders or executes it.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'false'
};

const CONTENT_HEADERS = {
  ...CORS_HEADERS,
  'Content-Type': 'application/octet-stream',
  'Content-Security-Policy': "sandbox; default-src 'none'",
  'X-Content-Type-Options': 'nosniff'
};

const SNIFF_SIZE = 64 * 1024; // 64 KB.
const MAX_XML_PROLOG_SIZE = 1024 * 1024; // 1 MB.
// Note: the prolog of an XML file (i.e. its XML declaration, processing instructions, comments, and document type
//       declaration) may be longer than SNIFF_SIZE (e.g., because of a long licence comment), in which case we read up
//       to MAX_XML_PROLOG_SIZE of it to find its root element (see forwardRequest()).
const MAX_SIZE = 32 * 1024 * 1024; // 32 MB.
// Note: an OMEX file, as well as some content which size we don't know in advance, needs to be fully read (see
//       forwardRequest()), which means holding two copies of it (i.e. the chunks we read and their concatenation, see
//       readChunks()), so MAX_SIZE must be small enough for at least two copies of it to fit in the memory available to
//       a Cloudflare Worker (i.e. 128 MB).

const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06064b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE = 0x07064b50;

const extractTargetUrl = (url) => {
  return url.searchParams.get('url');
};

const isValidTargetUrl = (targetUrl) => {
  try {
    return ['http:', 'https:'].includes(new URL(targetUrl).protocol);
  } catch {
    return false;
  }
};

const concatenate = (chunks, length) => {
  const bytes = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);

    offset += chunk.length;
  }

  return bytes;
};

const readChunks = async (reader, maxSize, initialChunks = []) => {
  // Read chunks until (roughly) the given number of bytes, including those of the given initial chunks, has been
  // reached and let the caller know whether the end of the stream was reached.
  // Note: we don't concatenate the chunks, so that the caller can decide whether (and when) to do it, i.e. without
  //       having to hold more than two copies of the data at any given time (see MAX_SIZE).

  const chunks = [...initialChunks];
  let length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  let done = false;

  while (length < maxSize) {
    const result = await reader.read();

    if (result.done) {
      done = true;

      break;
    }

    chunks.push(result.value);

    length += result.value.length;
  }

  return { chunks, length, done };
};

const readBytes = async (reader, maxSize) => {
  // Read up to (roughly) the given number of bytes and let the caller know whether the end of the stream was reached.

  const { chunks, length, done } = await readChunks(reader, maxSize);

  return { bytes: concatenate(chunks, length), done };
};

const readRest = async (reader, head) => {
  // Read the rest of some content, the start of which we have already read, and return all of it, unless it is too
  // large, in which case return null.
  // Note: we read (up to) one more byte than allowed, so that we know whether the content is too large, in which case
  //       we reject it without concatenating its chunks. Otherwise, we concatenate the start of the content and the
  //       rest of it in one go.

  const all = await readChunks(reader, MAX_SIZE + 1, [head]);

  if (all.length > MAX_SIZE) {
    await reader.cancel();

    return null;
  }

  return concatenate(all.chunks, all.length);
};

const replayStream = (bytes, reader) => {
  // Return a stream that first outputs the given bytes (i.e. those we already read to check the content) and then the
  // rest of the given reader's data, unless there is too much data, in which case the stream errors.

  let size = bytes.length;

  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
    },
    async pull(controller) {
      const { done, value } = await reader.read();

      if (done) {
        controller.close();

        return;
      }

      size += value.length;

      if (size > MAX_SIZE) {
        await reader.cancel();

        controller.error(new Error('The target content is too large.'));

        return;
      }

      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    }
  });
};

const isZipFile = (bytes) => {
  // Check that the given bytes are a ZIP file by looking for the local file header signature at the start of the file.

  return (
    bytes.length >= 4 &&
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) ===
      ZIP_LOCAL_FILE_HEADER_SIGNATURE
  );
};

const isOmexFile = (bytes) => {
  // An OMEX file is a ZIP file with a manifest.xml file at its root, so look for it in the ZIP file's central
  // directory.

  // Find the end of central directory record, which is at the end of the ZIP file, but may be followed by a comment of
  // up to 65,535 bytes.

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOfCentralDirectoryOffset = -1;

  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 22 - 0xffff); --offset) {
    if (view.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      endOfCentralDirectoryOffset = offset;

      break;
    }
  }

  if (endOfCentralDirectoryOffset === -1) {
    return false;
  }

  // Use the ZIP64 end of central directory record, if needed.

  let nbOfEntries = view.getUint16(endOfCentralDirectoryOffset + 10, true);
  let offset = view.getUint32(endOfCentralDirectoryOffset + 16, true);

  if (
    (nbOfEntries === 0xffff || offset === 0xffffffff) &&
    endOfCentralDirectoryOffset >= 20 &&
    view.getUint32(endOfCentralDirectoryOffset - 20, true) === ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE
  ) {
    const zip64EndOfCentralDirectoryOffset = Number(view.getBigUint64(endOfCentralDirectoryOffset - 12, true));

    if (
      zip64EndOfCentralDirectoryOffset + 56 > bytes.length ||
      view.getUint32(zip64EndOfCentralDirectoryOffset, true) !== ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      return false;
    }

    nbOfEntries = Number(view.getBigUint64(zip64EndOfCentralDirectoryOffset + 32, true));
    offset = Number(view.getBigUint64(zip64EndOfCentralDirectoryOffset + 48, true));
  }

  // Look for a central directory entry with the name "manifest.xml".

  const textDecoder = new TextDecoder();

  for (let i = 0; i < nbOfEntries; ++i) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE) {
      return false;
    }

    const fileNameLength = view.getUint16(offset + 28, true);
    const extraFieldLength = view.getUint16(offset + 30, true);
    const fileCommentLength = view.getUint16(offset + 32, true);

    if (offset + 46 + fileNameLength > bytes.length) {
      return false;
    }

    if (textDecoder.decode(bytes.subarray(offset + 46, offset + 46 + fileNameLength)) === 'manifest.xml') {
      return true;
    }

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return false;
};

const xmlRootElement = (text) => {
  // Return the local name and namespace of the root element of the given XML text, skipping its prolog (i.e. its XML
  // declaration, processing instructions, comments, and document type declaration), or null if there is no such root
  // element. If the given XML text ends before the start tag of its root element does, i.e. if it is only the start of
  // some XML text, then let the caller know that it is incomplete.

  const INCOMPLETE = { incomplete: true };

  const skipPast = (string, marker, from = 0) => {
    const index = string.indexOf(marker, from);

    return index === -1 ? null : string.slice(index + marker.length);
  };

  let rest = text;

  for (;;) {
    rest = rest.trimStart();

    if (rest.startsWith('<?')) {
      rest = skipPast(rest, '?>');
    } else if (rest.startsWith('<!--')) {
      rest = skipPast(rest, '-->');
    } else if (rest.startsWith('<!DOCTYPE')) {
      const internalSubsetStart = rest.indexOf('[');
      const declarationEnd = rest.indexOf('>');

      if (internalSubsetStart !== -1 && (declarationEnd === -1 || internalSubsetStart < declarationEnd)) {
        const internalSubsetEnd = rest.indexOf(']', internalSubsetStart);

        rest = internalSubsetEnd === -1 ? null : skipPast(rest, '>', internalSubsetEnd);
      } else {
        rest = skipPast(rest, '>');
      }
    } else {
      break;
    }

    if (rest === null) {
      return INCOMPLETE;
    }
  }

  const match = /^<(?:([\w.-]+):)?([\w.-]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/?>/.exec(rest);

  if (!match) {
    // Note: our XML text is incomplete if it is empty (e.g., it only has some whitespace so far) or if it ends within a
    //       start tag (e.g., that of our root element or of something that is part of our prolog, like "<!DOC").

    return !rest || (rest.startsWith('<') && !rest.includes('>')) ? INCOMPLETE : null;
  }

  const [, prefix, name, attributes] = match;
  const namespaceAttribute = prefix ? `xmlns:${prefix}` : 'xmlns';

  for (const [, attribute, doubleQuotedValue, singleQuotedValue] of attributes.matchAll(
    /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  )) {
    if (attribute === namespaceAttribute) {
      return { name, namespace: doubleQuotedValue ?? singleQuotedValue };
    }
  }

  return { name, namespace: null };
};

const xmlEncoding = (bytes) => {
  // Return the encoding of the given XML bytes, as detected from their first bytes (see Appendix F of the XML
  // specification, https://www.w3.org/TR/xml/#sec-guessing), i.e. using a byte order mark or, failing that, the way the
  // start of an XML declaration ("<?") is encoded. We default to UTF-8 (whose byte order mark, if any, gets skipped by
  // TextDecoder).
  // Note: TextDecoder also skips a UTF-16 byte order mark, as long as it matches the given encoding.

  const [byte0, byte1, byte2, byte3] = bytes;

  if ((byte0 === 0xfe && byte1 === 0xff) || (byte0 === 0x00 && byte1 === 0x3c && byte2 === 0x00 && byte3 === 0x3f)) {
    return 'utf-16be';
  }

  if ((byte0 === 0xff && byte1 === 0xfe) || (byte0 === 0x3c && byte1 === 0x00 && byte2 === 0x3f && byte3 === 0x00)) {
    return 'utf-16le';
  }

  return 'utf-8';
};

const xmlText = (bytes) => {
  return new TextDecoder(xmlEncoding(bytes)).decode(bytes);
};

const isIncompleteXmlProlog = (bytes) => {
  return xmlRootElement(xmlText(bytes))?.incomplete === true;
};

const isCellmlOrSedmlFile = (bytes) => {
  const rootElement = xmlRootElement(xmlText(bytes));

  if (!rootElement?.namespace) {
    return false;
  }

  return (
    (rootElement.name === 'model' && rootElement.namespace.startsWith('http://www.cellml.org/cellml/')) ||
    (rootElement.name === 'sedML' && rootElement.namespace.startsWith('http://sed-ml.org/'))
  );
};

const hasCsvExtension = (url) => {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.csv');
  } catch {
    return false;
  }
};

const isCsvFile = (bytes, complete, csvExtension) => {
  // Check that the given bytes are a CSV file, i.e. text (without control characters other than tabs and line breaks).
  // If the URL we ended up at (i.e. after following redirects) has a .csv extension, then that is all we check since
  // the app can tell the user why the CSV file cannot be used, if needed (see parseExternalCsvData()). Otherwise, the
  // content is all we have to go by, so we also check that the text looks like a CSV file as expected by the app, i.e.
  // lines are separated by line breaks and values by commas, there are at least two lines (i.e. a header and some
  // data), and every line has the same number of values, which must be at least two (i.e. a VOI column and a data
  // column). Like the app, we decode the text as UTF-8 (replacing invalid byte sequences, like Response.text() does),
  // trim lines, and skip blank lines.
  // Note: if we only have the start of the CSV file, then we ignore its last (and likely incomplete) line.

  const text = new TextDecoder().decode(bytes, { stream: !complete });

  // biome-ignore lint/suspicious/noControlCharactersInRegex: we are looking for control characters.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    return false;
  }

  if (csvExtension) {
    return true;
  }

  const lines = text.split(/\r?\n/);

  if (!complete) {
    lines.pop();
  }

  let nbOfLines = 0;
  let nbOfValuesPerLine = -1;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      continue;
    }

    const nbOfValues = trimmedLine.split(',').length;

    if (nbOfValues < 2 || (nbOfValuesPerLine !== -1 && nbOfValues !== nbOfValuesPerLine)) {
      return false;
    }

    nbOfValuesPerLine = nbOfValues;

    ++nbOfLines;
  }

  return nbOfLines >= 2;
};

const errorResponse = (message, status) => {
  // Note: our error responses must also have our CORS headers, so that a browser lets the app know why we failed.

  return new Response(message, {
    status,
    headers: CONTENT_HEADERS
  });
};

const errorMessage = (error) => {
  return (error instanceof Error ? error.message : String(error)).replace(/\.+$/, '');
};

const rejectedResponse = (reason) => {
  return errorResponse(`Target content is not allowed (${reason}).`, 403);
};

const hasKnownSize = (response) => {
  // Check whether the size of the given response's content is known in advance, i.e. whether it has a content length
  // and its content is not compressed.
  // Note: if the content is compressed, then fetch() decompresses it for us, but the content length is that of the
  //       compressed content.

  const contentEncoding = response.headers.get('content-encoding');

  return (
    /^\d+$/.test(response.headers.get('content-length') ?? '') &&
    (!contentEncoding || contentEncoding.toLowerCase() === 'identity')
  );
};

const forwardRequest = async (targetUrl, request) => {
  const forwardHeaders = new Headers(request.headers);

  for (const header of [
    'authorization',
    'cookie',
    'connection',
    'if-range',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'range',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade'
  ]) {
    forwardHeaders.delete(header);
  }

  const response = await fetch(targetUrl, {
    method: 'GET',
    headers: forwardHeaders
  });

  // Note: we don't return the body of an error response since it is likely to be an HTML page.

  if (!response.ok || !response.body) {
    return response.ok
      ? rejectedResponse('no content')
      : new Response(null, {
          status: response.status,
          headers: CONTENT_HEADERS
        });
  }

  // Reject content that we know is too large.
  // Note: the content length may not be known or, if the content is compressed, it may be smaller than the actual size
  //       of the content, so we also check the size of the content as we read it.

  if (Number(response.headers.get('content-length')) > MAX_SIZE) {
    await response.body.cancel();

    return rejectedResponse('too large');
  }

  // A CellML, SED-ML, or CSV file only needs its start to be checked, after which it can be streamed, but only if we
  // know that it isn't too large (see above). Otherwise, we need to fully read it first, so that we can reject it if it
  // is too large. Indeed, once we have started streaming it, all we could do is abort it, which the app would see as a
  // network error rather than as a rejection, so it wouldn't try to fetch the target URL directly instead (see
  // fetchThroughCorsProxy() in src/renderer/src/common/common.ts).
  // Note: when streaming, we still check the size of the content as we read it, in case the content length is wrong
  //       (see replayStream()).

  const reader = response.body.getReader();
  let { bytes: head, done } = await readBytes(reader, SNIFF_SIZE);

  // Read more of the content if it is an XML file which prolog is longer than what we have read so far (see
  // MAX_XML_PROLOG_SIZE).

  while (!done && head.length < MAX_XML_PROLOG_SIZE && isIncompleteXmlProlog(head)) {
    const more = await readChunks(reader, Math.min(2 * head.length, MAX_XML_PROLOG_SIZE), [head]);

    head = concatenate(more.chunks, more.length);
    done = more.done;
  }

  // Note: the URL of the response is the one we ended up at, i.e. after following redirects (e.g., a figshare download
  //       URL redirects to the actual file). We only check its extension, not that of the target URL, since the latter
  //       could otherwise be used to proxy any text (e.g., https://example.com/file.csv redirecting to any Web page).

  if (isCellmlOrSedmlFile(head) || isCsvFile(head, done, hasCsvExtension(response.url))) {
    if (done || hasKnownSize(response)) {
      return new Response(done ? head : replayStream(head, reader), {
        status: response.status,
        headers: CONTENT_HEADERS
      });
    }

    const bytes = await readRest(reader, head);

    if (!bytes) {
      return rejectedResponse('too large');
    }

    return new Response(bytes, {
      status: response.status,
      headers: CONTENT_HEADERS
    });
  }

  // An OMEX file needs to be fully read since we need its central directory, which is at the end of the file.

  if (!isZipFile(head)) {
    await reader.cancel();

    return rejectedResponse('not a CellML, SED-ML, OMEX, or CSV file');
  }

  const bytes = done ? head : await readRest(reader, head);

  if (!bytes) {
    return rejectedResponse('too large');
  }

  if (!isOmexFile(bytes)) {
    return rejectedResponse('OMEX file without a manifest.xml file');
  }

  return new Response(bytes, {
    status: response.status,
    headers: CONTENT_HEADERS
  });
};

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);

      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204, // No Content.
          headers: CORS_HEADERS
        });
      }

      const targetUrl = extractTargetUrl(url);

      if (!targetUrl) {
        return errorResponse('Missing "url" query parameter.', 400);
      }

      if (!isValidTargetUrl(targetUrl)) {
        return errorResponse('Target URL is not allowed.', 403);
      }

      if (request.method !== 'GET') {
        return errorResponse('Method not allowed.', 405);
      }

      // Note: we may not be able to fetch the target URL (e.g., it is only reachable from the user's network), in which
      //       case the app may still be able to fetch it directly, so we let it know using an HTTP 502 error.

      try {
        return await forwardRequest(targetUrl, request);
      } catch (error) {
        return errorResponse(`Target URL could not be fetched (${errorMessage(error)}).`, 502);
      }
    } catch (error) {
      return errorResponse(`An error occurred (${errorMessage(error)}).`, 500);
    }
  }
};
