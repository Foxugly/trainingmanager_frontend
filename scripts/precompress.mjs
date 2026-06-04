// Static pre-compression of the Angular build's text assets.
//
// Emits, next to each compressible asset, a `<f>.br` (brotli q11) and `<f>.gz`
// (gzip 9) that nginx serves directly via `brotli_static on;` / `gzip_static on;`
// (no on-the-fly recompression). Run in CI AFTER `ng build`, before the bundle
// is tarred/uploaded — not in `npm run build` (brotli q11 is slow, useless in dev).
//
// Rules: only text extensions; only write the .br/.gz if smaller than the
// original; idempotent (overwrites previous outputs). Pure Node (zlib), no deps.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BROWSER_DIR = path.resolve('dist/trainingmanager-frontend/browser');
const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.json', '.svg', '.xml', '.ico']);

function brotli(buffer) {
  return zlib.brotliCompressSync(buffer, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.length,
    },
  });
}

function gzip(buffer) {
  return zlib.gzipSync(buffer, { level: 9 });
}

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

async function main() {
  try {
    await fs.access(BROWSER_DIR);
  } catch {
    console.error(`precompress: build output not found at ${BROWSER_DIR} — run \`ng build\` first.`);
    process.exit(1);
  }

  let files = 0;
  let rawTotal = 0;
  let brTotal = 0;
  let gzTotal = 0;

  for await (const file of walk(BROWSER_DIR)) {
    if (file.endsWith('.br') || file.endsWith('.gz')) continue;
    if (!COMPRESSIBLE.has(path.extname(file).toLowerCase())) continue;

    const buffer = await fs.readFile(file);
    if (buffer.length === 0) continue;

    const br = brotli(buffer);
    const gz = gzip(buffer);

    if (br.length < buffer.length) {
      await fs.writeFile(`${file}.br`, br);
      brTotal += br.length;
    }
    if (gz.length < buffer.length) {
      await fs.writeFile(`${file}.gz`, gz);
      gzTotal += gz.length;
    }

    files += 1;
    rawTotal += buffer.length;
  }

  const kib = (n) => `${(n / 1024).toFixed(1)} KiB`;
  console.log(
    `precompress: ${files} assets — raw ${kib(rawTotal)} → br ${kib(brTotal)} / gz ${kib(gzTotal)}`,
  );
}

main().catch((err) => {
  console.error('precompress: failed:', err);
  process.exit(1);
});
