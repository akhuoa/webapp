import * as fs from 'node:fs';
import * as path from 'node:path';

import { libopencorVersion } from './libopencor.version.ts';

export const downloadLibopencorJsIfNeeded = async (destDir: string): Promise<void> => {
  // Remove any other version of libopencor.js that we may have downloaded in the past, so that it doesn't end up being
  // shipped (our public folder gets copied as is when building).

  const parentDir = path.dirname(destDir);

  if (fs.existsSync(parentDir)) {
    for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== libopencorVersion) {
        fs.rmSync(path.join(parentDir, entry.name), { recursive: true, force: true });
      }
    }
  }

  // Check if the file already exists.

  const destFile = path.join(destDir, 'libopencor.js');

  if (fs.existsSync(destFile)) {
    return;
  }

  // Create the destination directory if it doesn't exist.

  fs.mkdirSync(destDir, { recursive: true });

  // Download libopencor.js.

  const url = `https://opencor.ws/libopencor/downloads/wasm/${libopencorVersion}/libopencor.js`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download ${url} (${response.status}: ${response.statusText}).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  fs.writeFileSync(destFile, buffer);

  const stats = fs.statSync(destFile);

  console.log(`Downloaded libopencor.js (${(stats.size / 1000).toFixed(0)} kB) to ${destFile}.`);
};
