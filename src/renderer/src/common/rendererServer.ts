// Note: this is a very simple HTTP server to serve the renderer files from out/renderer. This is needed so that we can
// authenticate with GitHub OAuth when running the packaged version of OpenCOR. This means that we can get away with not
// checking a lot of things since the server is only accessible from localhost and only serves our own files. Still, we
// must make sure that a request cannot result in an exception being thrown in our main process.

import { createReadStream, promises as fs } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { pipeline } from 'node:stream';

let rendererServers: http.Server[] = [];
let rendererBaseUrl: string | null = null;

const closeServer = (server: http.Server): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
};

export const startRendererServer = async (preferredPort: number = 0): Promise<string> => {
  // Note: we try to use the given preferred port (if any), so that the origin of our renderer remains the same from one
  //       launch to another (see src/main/index.ts), and fall back on a random available port if it cannot be used
  //       (e.g., because it is already in use by another application).

  // If we already have a base URL then return it.

  if (rendererBaseUrl) {
    return rendererBaseUrl;
  }

  // Create and start our HTTP server.
  // Note: we only support the MIME types that are needed by our renderer (check the files in out/renderer).

  const rendererDistPath = path.resolve(import.meta.dirname, '../../out/renderer');
  const MIME_TYPES: Record<string, string> = {
    '.css': 'text/css',
    '.eot': 'application/vnd.ms-fontobject',
    '.html': 'text/html; charset=UTF-8',
    '.js': 'text/javascript',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
  };

  const notFound = (response: http.ServerResponse): void => {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
    response.end('Not found');
  };

  const handleRequest = async (request: http.IncomingMessage, response: http.ServerResponse): Promise<void> => {
    // Retrieve the requested path (ignoring any query string or fragment, and decoding any percent-encoded character)
    // or default to /index.html.

    let requestPath: string;

    try {
      requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    } catch {
      notFound(response);

      return;
    }

    if (requestPath === '/') {
      requestPath = '/index.html';
    }

    // Make sure that the requested path is a file within our renderer distribution.
    // Note: since we decode the requested path, it could otherwise be used to access a file outside of our renderer
    //       distribution (e.g., using %2E%2E%2F, i.e. ../).

    const filePath = path.join(rendererDistPath, requestPath);

    if (!filePath.startsWith(rendererDistPath + path.sep)) {
      notFound(response);

      return;
    }

    try {
      if (!(await fs.stat(filePath)).isFile()) {
        notFound(response);

        return;
      }
    } catch {
      notFound(response);

      return;
    }

    // Set the headers and stream the file.
    // Note: we use pipeline() rather than pipe() so that our read stream gets destroyed (and its file descriptor
    //       closed) if the client aborts the request. Also, an error may still occur while streaming the file, in which
    //       case our headers will have been sent, so we can only destroy our response (trying to send a 404 would throw
    //       an ERR_HTTP_HEADERS_SENT error in our main process).

    const ext = path.extname(filePath).toLowerCase();

    response.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    });

    pipeline(createReadStream(filePath), response, (error) => {
      if (error && !response.destroyed) {
        response.destroy();
      }
    });
  };

  // Create a server.
  // Note: we optimise TCP for localhost connections by disabling Nagle's algorithm.

  const createServer = (): http.Server => {
    const server = http.createServer((request: http.IncomingMessage, response: http.ServerResponse) => {
      handleRequest(request, response).catch(() => {
        if (response.headersSent) {
          response.destroy();
        } else {
          notFound(response);
        }
      });
    });

    server.on('connection', (socket) => socket.setNoDelay(true));

    return server;
  };

  // Start a server listening on the given port and host, and return the port it is listening on.

  const listen = (server: http.Server, port: number, host: string): Promise<number> => {
    return new Promise<number>((resolve, reject) => {
      // Handle any errors that occur while starting the server.
      // Note: we stop listening for the server to be listening since we may try to start another server (on another
      //       port), in which case we don't want this attempt to be notified about it.

      const onError = (error: Error): void => {
        server.off('listening', onListening);

        reject(error);
      };

      // Handle the server listening.
      // Note: if we cannot determine the port the server is listening on, then we close the server since it cannot be
      //       used (and nothing else would close it).

      const onListening = (): void => {
        server.off('error', onError);

        const addressInfo = server.address() as AddressInfo | null;

        if (addressInfo?.port) {
          resolve(addressInfo.port);
        } else {
          closeServer(server).catch(() => {});

          reject(new Error("Failed to determine the renderer server's port."));
        }
      };

      server.once('error', onError);
      server.once('listening', onListening);

      // Start the server listening.

      server.listen(port, host);
    });
  };

  // Start servers listening on both the IPv4 and IPv6 loopback addresses, using the same port.
  // Note: our renderer is loaded from http://localhost:<port> (localhost being an authorised domain for GitHub OAuth,
  //       see GITHUB.md), which may resolve to either loopback address. So, if we only listened on one of them, then
  //       another application could listen on the other one, using the same port (which is predictable since we try to
  //       always use the same port), and our renderer could then be loaded from that application. If there is no IPv6
  //       loopback address, then we only listen on the IPv4 loopback address since no other application can listen on
  //       the IPv6 loopback address either.

  const listenOnLoopbackAddresses = async (port: number): Promise<void> => {
    const ipv4Server = createServer();
    const loopbackPort = await listen(ipv4Server, port, '127.0.0.1');
    const ipv6Server = createServer();

    try {
      await listen(ipv6Server, loopbackPort, '::1');

      rendererServers = [ipv4Server, ipv6Server];
    } catch (error: unknown) {
      const errorCode = (error as NodeJS.ErrnoException).code;

      if (errorCode !== 'EADDRNOTAVAIL' && errorCode !== 'EAFNOSUPPORT') {
        await closeServer(ipv4Server).catch(() => {});

        throw error;
      }

      rendererServers = [ipv4Server];
    }

    rendererBaseUrl = `http://localhost:${loopbackPort}`;
  };

  // Start listening on our preferred port or, if it cannot be used, on a random available port.
  // Note #1: a random port that is available on the IPv4 loopback address may not be available on the IPv6 loopback
  //          address, hence we try a few random ports, if needed.
  // Note #2: our preferred port comes from our configuration file, so it may not be a valid port (e.g., if our
  //          configuration file was edited by hand), in which case we ignore it. Indeed, Node.js would otherwise either
  //          throw an error or, if it is a string, consider it to be a pipe or socket path (and create a socket file on
  //          Linux and macOS).

  const preferredPortIsValid = Number.isInteger(preferredPort) && preferredPort > 0 && preferredPort <= 65535;
  const ports = preferredPortIsValid ? [preferredPort, 0, 0, 0] : [0, 0, 0];
  let listenError: unknown = null;

  for (const port of ports) {
    try {
      await listenOnLoopbackAddresses(port);

      break;
    } catch (error: unknown) {
      listenError = error;
    }
  }

  if (!rendererBaseUrl) {
    throw listenError ?? new Error('Failed to initialise the renderer server.');
  }

  // Log any error that occurs once our servers are listening (e.g., if one of them fails to accept a connection because
  // there are too many open files).
  // Note: indeed, a server keeps listening after such an error, but without an error listener, the error would result
  //       in an uncaught exception in our main process.

  for (const rendererServer of rendererServers) {
    rendererServer.on('error', (error: Error) => {
      console.error('OpenCOR: the renderer server encountered an error:', error);
    });
  }

  return rendererBaseUrl;
};

export const stopRendererServer = async (): Promise<void> => {
  // Make sure that we have servers to stop.

  if (!rendererServers.length) {
    return;
  }

  // Close our servers.

  await Promise.all(rendererServers.map(closeServer));

  // Clear our servers and base URL references.

  rendererServers = [];
  rendererBaseUrl = null;
};
