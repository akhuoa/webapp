import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vite from 'vite';

// Build our CellDL runtime (see vite.celldl.config.ts) and copy it to celldl/<hash>/ in the given public folder, where
// <hash> is a hash of what our CellDL runtime is built from. Return the path of our CellDL runtime relative to that
// public folder.
// Note #1: our CellDL runtime gets served from that path by OpenCOR's Web app and from https://opencor.ws/app/ for our
//          library (see src/common/celldlRuntime.ts). Since that path only changes when our CellDL runtime changes, a
//          new version of OpenCOR doesn't necessarily mean a new copy of our CellDL runtime. Also, the copies used by
//          previous versions of our library are never pruned (see scripts/prune.web.ts), so that they keep working.
// Note #2: our library and OpenCOR's Web app must agree on that path, even if they are not built in the same
//          environment. Yet, the output of a build may slightly differ from one JavaScript runtime to another (e.g.,
//          Vite generates some of its code from the source of some of its functions, which Bun and Node.js don't
//          stringify in the same way). So, rather than hashing the output of a build, we hash what it is built from,
//          i.e. the contents of the modules and assets that it includes, the files that configure it, and the versions
//          of Vite (incl. Rolldown) and Vue (see sharedVuePlugin() in vite.celldl.config.ts).
// Note #3: our CellDL runtime is served cross-origin to our library, so we add a .htaccess file to its folder to set
//          the required headers. Its files never change, so they can also be cached for good.

const CONFIG_FILES = [
  path.join(import.meta.dirname, '..', 'vite.celldl.config.ts'),
  path.join(import.meta.dirname, 'celldl.plugin.ts'),
  path.join(import.meta.dirname, 'celldl.runtime.ts'),
  path.join(import.meta.dirname, 'primeicons.plugin.ts')
];

const sha256 = (data: string | Uint8Array): string => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

export const buildCellDLRuntime = async (publicDir: string): Promise<string> => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencor-celldl-runtime-'));
  const nodeEnv = process.env.NODE_ENV;

  try {
    // Build our CellDL runtime.
    // Note: Vite builds for development if NODE_ENV is set to 'development', which is the case when we are called from
    //       our Vite config while running `vite dev`. Yet, our CellDL runtime must always be built for production, so
    //       that it is always the same (and has the same hash) whatever the context.

    process.env.NODE_ENV = 'production';

    const outputs = [
      await vite.build({
        build: {
          emptyOutDir: true,
          outDir: tmpDir
        },
        configFile: CONFIG_FILES[0],
        logLevel: 'warn',
        mode: 'production'
      })
    ].flat() as vite.Rolldown.RolldownOutput[];

    // Add a .htaccess file to our CellDL runtime's folder to set the required headers.
    // Note: this must be done after building our CellDL runtime since Vite empties its output folder beforehand.

    fs.writeFileSync(
      path.join(tmpDir, '.htaccess'),
      `# Headers for OpenCOR's CellDL runtime (see src/renderer/scripts/celldl.runtime.ts).

<IfModule mod_headers.c>
  Header set Access-Control-Allow-Origin "*"
  Header set Cross-Origin-Resource-Policy "cross-origin"
  Header set Cache-Control "public, max-age=31536000, immutable"
</IfModule>

<IfModule mod_mime.c>
  AddType application/wasm .wasm
</IfModule>
`
    );

    // Compute the hash of what our CellDL runtime is built from.
    // Note #1: we hash the contents of our modules rather than their path, which depends on where they are installed. A
    //          virtual module (e.g., our shared Vue module), however, has no contents, so we hash its ID instead.
    // Note #2: our configuration files may have Windows line endings (depending on how our repository was checked
    //          out), so we normalise them.

    const require = createRequire(import.meta.url);
    const digests: string[] = [
      sha256(`vite@${vite.version}`),
      sha256(`rolldown@${vite.rolldownVersion}`),
      sha256(`vue@${(require('vue/package.json') as { version: string }).version}`),
      ...CONFIG_FILES.map((file) => sha256(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')))
    ];

    for (const output of outputs) {
      for (const item of output.output) {
        if (item.type === 'asset') {
          digests.push(sha256(item.source));
        } else {
          for (const moduleId of item.moduleIds) {
            const [modulePath, moduleQuery] = moduleId.split('?');

            digests.push(
              modulePath && !moduleId.startsWith('\0') && fs.existsSync(modulePath)
                ? sha256(`${sha256(fs.readFileSync(modulePath))}?${moduleQuery ?? ''}`)
                : sha256(moduleId)
            );
          }
        }
      }
    }

    const runtimePath = `celldl/${sha256(digests.sort().join('\n')).slice(0, 16)}`;

    // Remove any other copy of our CellDL runtime, so that it doesn't end up being shipped (our public folder gets
    // copied as is when building), and copy our CellDL runtime to our public folder, if needed.
    // Note #1: we keep the current copy, if any, rather than removing the whole celldl folder since it may be in use
    //          (e.g., by `vite dev` while `vite build` is running).
    // Note #2: we only ever check whether the current copy exists, so we make sure that it is complete by copying our
    //          CellDL runtime to a temporary folder, which we then rename. This way, an interrupted copy (e.g., if our
    //          build gets cancelled) leaves a temporary folder behind, which gets removed next time, rather than an
    //          incomplete copy, which would otherwise be used (and shipped) for good.

    const celldlDir = path.join(publicDir, 'celldl');
    const runtimeDir = path.join(publicDir, runtimePath);

    if (fs.existsSync(celldlDir)) {
      for (const entry of fs.readdirSync(celldlDir)) {
        if (path.join(celldlDir, entry) !== runtimeDir) {
          fs.rmSync(path.join(celldlDir, entry), { recursive: true, force: true });
        }
      }
    }

    if (!fs.existsSync(runtimeDir)) {
      // Note: our celldl folder doesn't exist on a fresh checkout or after cleaning (see scripts/clean.ts), but
      //       fs.mkdtempSync() requires the parent of our temporary folder to exist.

      fs.mkdirSync(celldlDir, { recursive: true });

      const tmpRuntimeDir = fs.mkdtempSync(`${runtimeDir}.tmp-`);

      try {
        fs.cpSync(tmpDir, tmpRuntimeDir, { recursive: true });
        fs.renameSync(tmpRuntimeDir, runtimeDir);
      } catch (error: unknown) {
        // We couldn't copy our CellDL runtime or rename our temporary folder, which is fine if our CellDL runtime got
        // copied in the meantime (e.g., by `vite dev` while `vite build` is running, in which case our temporary folder
        // may have been removed while we were copying our CellDL runtime to it).

        fs.rmSync(tmpRuntimeDir, { recursive: true, force: true });

        if (!fs.existsSync(runtimeDir)) {
          throw error;
        }
      }

      console.log(`Built our CellDL runtime to ${runtimeDir}.`);
    }

    return runtimePath;
  } finally {
    if (nodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = nodeEnv;
    }

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};
