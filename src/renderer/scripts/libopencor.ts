#!/usr/bin/env bun

import * as bun from 'bun';

// Filter out noisy linker warnings emitted when linking the prebuilt static version of libOpenCOR on a macOS ARM system
// with a newer LLVM+Clang. Indeed, libOpenCOR was compiled with an older LLVM+Clang that uses stale target feature
// names (`+zcm` and `+zcz`), which the current linker no longer recognises. These warnings are harmless (indeed, the
// linker ignores them), but they are numerous enough to clutter our output.

const LINE_FILTER_PATTERN = /is not a recognized feature for this target/i;

const createLineFilter = (): TransformStream<Uint8Array, Uint8Array> => {
  // These linker warnings only occur on macOS ARM, so skip the filtering overhead on other platforms.

  if (process.platform !== 'darwin') {
    return new TransformStream();
  }

  // The filtering is done by decoding the incoming chunks into strings, splitting them into lines, filtering out the
  // lines that match the pattern, and then encoding the remaining lines back into chunks.

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  return new TransformStream({
    transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });

      const lines = buffer.split('\n');

      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!LINE_FILTER_PATTERN.test(line)) {
          controller.enqueue(encoder.encode(`${line}\n`));
        }
      }
    },
    flush(controller: TransformStreamDefaultController<Uint8Array>) {
      buffer += decoder.decode();

      if (buffer.length > 0 && !LINE_FILTER_PATTERN.test(buffer)) {
        controller.enqueue(encoder.encode(buffer));
      }
    }
  });
};

const readFiltered = async (source: ReadableStream<Uint8Array>, write: (chunk: Uint8Array) => void): Promise<void> => {
  const reader = source.pipeThrough(createLineFilter()).getReader();

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    write(value);
  }
};

(async () => {
  if (!(await bun.file('./dist/libOpenCOR/Release/libOpenCOR.node').exists())) {
    const build = bun.spawn(['cmake-js', 'build', '-B', 'Release', '-O', './dist/libOpenCOR'], {
      stdio: ['inherit', 'pipe', 'pipe']
    });

    // Wait for the build process to complete and handle its output by filtering out noisy linker warnings.

    const [exitCode] = await Promise.all([
      build.exited,
      readFiltered(build.stdout, (chunk) => {
        process.stdout.write(chunk);
      }),
      readFiltered(build.stderr, (chunk) => {
        process.stderr.write(chunk);
      })
    ]);

    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  }
})();
