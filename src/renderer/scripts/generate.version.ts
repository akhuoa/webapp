#!/usr/bin/env bun

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Retrieve the version from the package.json file.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '../package.json');
const version = (JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version: string }).version;

// Make sure that the dist/assets folder exists.

const distPath = path.join(__dirname, '../dist');
const distAssetsPath = path.join(distPath, 'assets');

if (!fs.existsSync(distAssetsPath)) {
  fs.mkdirSync(distAssetsPath, { recursive: true });
}

// Write the version file.
// Note: our assets have a hash in their file names (see vite.config.ts), so they never get stale, which means that we
//       don't need to list them for when the Web app gets force reloaded (see src/common/version.ts).

fs.writeFileSync(path.join(distAssetsPath, 'version.json'), JSON.stringify({ version }, null, 2));

// Copy our changelog file, so that OpenCOR's Web app can tell the user what is new in a newer version (see
// src/common/changelog.ts).
// Note: like version.json, it has a fixed name, so it must never be cached for long (see public/.htaccess). It also
//       gets uploaded before version.json when deploying our Web app (see .github/workflows/cd.yml and cddev.yml), so
//       it is always available by the time a newer version gets reported.

fs.copyFileSync(path.join(__dirname, '../changelog.json'), path.join(distAssetsPath, 'changelog.json'));

// Log the generated version.

console.log(`Generated version.json with version ${version}.`);
