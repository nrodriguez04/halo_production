import { Injectable } from '@nestjs/common';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { IntegrationCostControlService } from '../../cost-control/cost-control.service';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';
import { IntegrationUnavailableException } from '../integration-unavailable.exception';

/**
 * Free federal map services for land diligence (docs/asset-classes.md s4):
 *
 * - FEMA's National Flood Hazard Layer, layer 28 (flood hazard zones);
 * - the US Fish and Wildlife Service's National Wetlands Inventory.
 *
 * Both are public ArcGIS REST services with no key and no charge. They are
 * queried with a box about the parcel's size around its coordinates, so a
 * result describes roughly the parcel's area, not its surveyed boundary.
 * Calls still go through cost control (at $0) for rate limits, caching and
 * the ledger, and stop when external data is switched off.
 */

export const FEMA_NFHL_URL =
  'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query';
export const USFWS_NWI_URL =
  'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query';
const TIMEOUT_MS = 30_000;

export interface MapPoint {
  latitude: number;
  longitude: number;
  /** Used to size the query box; a point check when unknown. */
  acres?: number | null;
}

export interface FloodResult {
  /** Every zone the box touches, highest risk first ("AE", "X"). Empty: no mapped zone. */
  zones: Array<{
    zone: string;
    subtype: string | null;
    specialFloodHazard: boolean;
  }>;
  /** The most severe zone, or null when FEMA has no map here. */
  worst: string | null;
  sourceUrl: string;
}

export interface WetlandsResult {
  /** Mapped wetland types in the box ("Freshwater Emergent Wetland"). */
  types: Array<{ type: string; code: string | null; acres: number | null }>;
  sourceUrl: string;
}

/** Degrees for a square of the parcel's area centred on its coordinates. */
export function queryEnvelope(p: MapPoint): string {
  const sideM = p.acres && p.acres > 0 ? Math.sqrt(p.acres * 4046.86) : 30;
  const half = Math.min(sideM, 3000) / 2;
  const dLat = half / 111_320;
  const dLon = half / (111_320 * Math.cos((p.latitude * Math.PI) / 180));
  const f = (n: number) => n.toFixed(6);
  return `${f(p.longitude - dLon)},${f(p.latitude - dLat)},${f(p.longitude + dLon)},${f(p.latitude + dLat)}`;
}

function arcgisQuery(
  base: string,
  envelope: string,
  outFields: string,
): string {
  const q = new URLSearchParams({
    geometry: envelope,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields,
    returnGeometry: 'false',
    f: 'json',
  });
  return `${base}?${q.toString()}`;
}

/** A, V and their subzones are FEMA's special flood hazard area; D is undetermined; X is outside. */
function floodRank(zone: string): number {
  const z = zone.toUpperCase();
  if (z.startsWith('V')) return 0;
  if (z.startsWith('A')) return 1;
  if (z === 'D') return 2;
  return 3;
}

export function parseFlood(body: unknown, sourceUrl: string): FloodResult {
  const features = (
    (body as { features?: Array<{ attributes?: Record<string, unknown> }> })
      ?.features ?? []
  ).map((f) => f.attributes ?? {});
  const seen = new Map<string, FloodResult['zones'][number]>();
  for (const a of features) {
    const zone = typeof a.FLD_ZONE === 'string' ? a.FLD_ZONE.trim() : '';
    if (!zone) continue;
    const subtype =
      typeof a.ZONE_SUBTY === 'string' && a.ZONE_SUBTY.trim()
        ? a.ZONE_SUBTY.trim()
        : null;
    const key = `${zone}|${subtype ?? ''}`;
    if (!seen.has(key))
      seen.set(key, { zone, subtype, specialFloodHazard: a.SFHA_TF === 'T' });
  }
  const zones = Array.from(seen.values()).sort(
    (x, y) => floodRank(x.zone) - floodRank(y.zone),
  );
  return { zones, worst: zones[0]?.zone ?? null, sourceUrl };
}

export function parseWetlands(
  body: unknown,
  sourceUrl: string,
): WetlandsResult {
  const features = (
    (body as { features?: Array<{ attributes?: Record<string, unknown> }> })
      ?.features ?? []
  ).map((f) => f.attributes ?? {});
  const types = features
    .map((a) => ({
      type: typeof a.WETLAND_TYPE === 'string' ? a.WETLAND_TYPE : 'Wetland',
      code: typeof a.ATTRIBUTE === 'string' ? a.ATTRIBUTE : null,
      acres:
        typeof a.ACRES === 'number' ? Math.round(a.ACRES * 100) / 100 : null,
    }))
    .slice(0, 20);
  return { types, sourceUrl };
}

@Injectable()
export class PublicGisService {
  constructor(
    private controlPlane: ControlPlaneService,
    private costControl: IntegrationCostControlService,
  ) {}

  async floodZones(point: MapPoint, ctx: CostContext): Promise<FloodResult> {
    await this.ready(ctx, 'fema_nfhl');
    const url = arcgisQuery(
      FEMA_NFHL_URL,
      queryEnvelope(point),
      'FLD_ZONE,ZONE_SUBTY,SFHA_TF',
    );
    const out = await this.costControl.checkAndCall<MapPoint, FloodResult>({
      provider: 'fema_nfhl',
      action: 'flood_zone',
      payload: point,
      context: ctx,
      execute: async () => parseFlood(await this.get(url, 'fema_nfhl'), url),
    });
    return (
      (out.result as FloodResult | null) ?? {
        zones: [],
        worst: null,
        sourceUrl: url,
      }
    );
  }

  async wetlands(point: MapPoint, ctx: CostContext): Promise<WetlandsResult> {
    await this.ready(ctx, 'usfws_nwi');
    const url = arcgisQuery(
      USFWS_NWI_URL,
      queryEnvelope(point),
      'ATTRIBUTE,WETLAND_TYPE,ACRES',
    );
    const out = await this.costControl.checkAndCall<MapPoint, WetlandsResult>({
      provider: 'usfws_nwi',
      action: 'wetlands',
      payload: point,
      context: ctx,
      execute: async () => parseWetlands(await this.get(url, 'usfws_nwi'), url),
    });
    return (
      (out.result as WetlandsResult | null) ?? { types: [], sourceUrl: url }
    );
  }

  private async ready(ctx: CostContext, provider: string): Promise<void> {
    if (!(await this.controlPlane.isExternalDataEnabled(ctx.accountId))) {
      throw IntegrationUnavailableException.disabled(provider);
    }
  }

  private async get(url: string, provider: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      throw new IntegrationUnavailableException(
        provider,
        'UPSTREAM_ERROR',
        (err as Error).message,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      throw new IntegrationUnavailableException(
        provider,
        'UPSTREAM_ERROR',
        `HTTP ${res.status}`,
      );
    }
    const body = (await res.json()) as { error?: { message?: string } };
    // ArcGIS reports query errors with HTTP 200 and an error body.
    if (body && typeof body === 'object' && body.error) {
      throw new IntegrationUnavailableException(
        provider,
        'UPSTREAM_ERROR',
        body.error.message ?? 'map service error',
      );
    }
    return body;
  }
}
