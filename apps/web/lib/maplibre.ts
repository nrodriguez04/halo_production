import { version } from 'maplibre-gl/package.json';

/**
 * Where maplibre-gl's web worker is served from. Pass it to every map as
 * `workerUrl`: maplibre 6 otherwise looks for the worker beside its bundled
 * module, which does not exist under Next, and draws nothing
 * (scripts/copy-maplibre-worker.mjs).
 */
export const MAPLIBRE_WORKER_URL = `/maplibre/maplibre-gl-worker-${version}.mjs`;
