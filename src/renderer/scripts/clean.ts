#!/usr/bin/env bun

import fs from 'node:fs';

for (const path of [
  'dist',
  'node_modules',
  'out',
  'src/main/build',
  'src/renderer/components.d.ts',
  'src/renderer/dist',
  'src/renderer/node_modules',
  'src/renderer/public/celldl',
  'src/renderer/public/libopencor'
]) {
  if (fs.existsSync(path)) {
    fs.rmSync(path, { recursive: true, force: true });
  }
}
