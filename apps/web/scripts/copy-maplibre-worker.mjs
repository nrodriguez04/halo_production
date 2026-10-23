// Serves maplibre-gl's web worker from public/ (lib/maplibre.ts).
//
// maplibre 6 is ESM-only and locates its worker next to its own module,
// from import.meta.url. Under Next's bundler that points into
// /_next/static/chunks, where no worker exists: the request gets Next's HTML
// 404, the worker fails to load, and the map never draws a tile. Runs
// before `next dev` and `next build`; the copy is generated, not committed.
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { version } = require('maplibre-gl/package.json');
const source = require.resolve('maplibre-gl/dist/maplibre-gl-worker.mjs');
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'maplibre');

mkdirSync(outDir, { recursive: true });
// One worker per maplibre version: the version is in the name, so a browser
// never keeps an old worker after an upgrade.
for (const f of readdirSync(outDir)) {
  if (f.startsWith('maplibre-gl-worker-')) rmSync(join(outDir, f));
}
copyFileSync(source, join(outDir, `maplibre-gl-worker-${version}.mjs`));
console.log(`maplibre-gl worker ${version} -> public/maplibre/`);
