import { Injectable } from '@nestjs/common';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { IntegrationCostControlService } from '../../cost-control/cost-control.service';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';
import { IntegrationSecretsService } from '../../integration-secrets/integration-secrets.service';
import { IntegrationUnavailableException } from '../integration-unavailable.exception';
import { num, str, usStateCode } from '../listings/normalize';
import type {
  RealieAddressQuery,
  RealieProperty,
  RealieSearchPage,
  RealieSearchParams,
} from './realie.types';

export const REALIE_BASE_URL = 'https://app.realie.ai/api';
const MAX_PAGE = 100;
const TIMEOUT_MS = 30_000;

/**
 * Realie (realie.ai): county records for every US parcel. Owner of record
 * and mailing address, assessed and market values, sale history, mortgages,
 * liens, foreclosures and tax status. No MLS listing data.
 *
 * Billing is one token per successful (200) call whatever the page size;
 * empty results come back as 404 and cost nothing, so a search that finds
 * nothing is free. The key is resolved on every call so one saved on the
 * Integrations page works without a restart.
 */
@Injectable()
export class RealieService {
  constructor(
    private controlPlane: ControlPlaneService,
    private costControl: IntegrationCostControlService,
    private secrets: IntegrationSecretsService,
  ) {}

  /** One page of parcels in an area. Pass `cursor` from the previous page to continue. */
  async searchProperties(
    params: RealieSearchParams,
    ctx: CostContext,
  ): Promise<RealieSearchPage> {
    const apiKey = await this.ready(ctx);
    const query: Array<[string, string]> = [
      ['state', params.state.toUpperCase()],
    ];
    if (params.city) query.push(['city', params.city]);
    if (params.zipCode) query.push(['zipCode', params.zipCode]);
    if (params.county) query.push(['county', params.county]);
    if (params.residential != null) {
      query.push(['residential', String(params.residential)]);
    }
    if (params.transferredWithinDays != null) {
      // Realie's own spelling of the parameter.
      query.push(['transferedSince', String(params.transferredWithinDays)]);
    }
    query.push(
      ['limit', String(Math.min(Math.max(params.limit ?? 10, 1), MAX_PAGE))],
      ['cursor', params.cursor ?? 'start'],
    );

    const out = await this.costControl.checkAndCall<
      RealieSearchParams,
      RealieSearchPage
    >({
      provider: 'realie',
      action: 'search_properties',
      payload: params,
      context: ctx,
      execute: async () => {
        const body = await this.request<{
          properties?: unknown[];
          metadata?: { nextCursor?: string | null };
        }>('/public/property/search/', query, apiKey);
        if (!body) return { properties: [], nextCursor: null };
        return {
          properties: (body.properties ?? []).map((p) =>
            normalizeRealieProperty(p as Record<string, unknown>),
          ),
          nextCursor: str(body.metadata?.nextCursor),
        };
      },
    });
    return (
      (out.result as RealieSearchPage | null) ?? {
        properties: [],
        nextCursor: null,
      }
    );
  }

  /** The record for one street address, or null when Realie has no parcel for it. */
  async lookupAddress(
    input: RealieAddressQuery,
    ctx: CostContext,
  ): Promise<RealieProperty | null> {
    const apiKey = await this.ready(ctx);
    const query: Array<[string, string]> = [
      ['state', input.state.toUpperCase()],
      ['address', input.address],
    ];
    if (input.unit) query.push(['unitNumberStripped', input.unit]);
    // Realie requires county whenever city is given.
    if (input.county) query.push(['county', input.county]);
    if (input.city && input.county) query.push(['city', input.city]);

    const out = await this.costControl.checkAndCall<
      RealieAddressQuery,
      RealieProperty | null
    >({
      provider: 'realie',
      action: 'address_lookup',
      payload: input,
      context: ctx,
      execute: async () => {
        const body = await this.request<{ property?: unknown }>(
          '/public/property/address/',
          query,
          apiKey,
        );
        return body?.property
          ? normalizeRealieProperty(body.property as Record<string, unknown>)
          : null;
      },
    });
    return (out.result as RealieProperty | null) ?? null;
  }

  private async ready(ctx: CostContext): Promise<string> {
    if (!(await this.controlPlane.isExternalDataEnabled(ctx.accountId))) {
      throw IntegrationUnavailableException.disabled('realie');
    }
    const apiKey = await this.secrets.resolve('realie', 'REALIE_API_KEY');
    if (!apiKey) {
      throw IntegrationUnavailableException.notConfigured(
        'realie',
        'REALIE_API_KEY',
      );
    }
    return apiKey;
  }

  /** GET with Realie's response codes mapped; 404 (no results, not billed) returns null. */
  private async request<T>(
    path: string,
    query: Array<[string, string]>,
    apiKey: string,
  ): Promise<T | null> {
    const base = (process.env.REALIE_BASE_URL || REALIE_BASE_URL).replace(
      /\/+$/,
      '',
    );
    const qs = query
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${base}${path}?${qs}`, {
        headers: { Authorization: apiKey, Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      throw new IntegrationUnavailableException(
        'realie',
        'UPSTREAM_ERROR',
        (err as Error).message,
      );
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 404) return null;
    if (res.ok) return (await res.json()) as T;

    const detail = await errorDetail(res);
    if (res.status === 401) {
      throw new IntegrationUnavailableException(
        'realie',
        'REJECTED_CREDENTIALS',
        detail || 'HTTP 401',
      );
    }
    if (res.status === 403) {
      throw new IntegrationUnavailableException(
        'realie',
        'UPSTREAM_ERROR',
        `Realie refused the call (billing or spending limit)${detail ? `: ${detail}` : ''}`,
      );
    }
    if (res.status === 429) {
      throw new IntegrationUnavailableException(
        'realie',
        'UPSTREAM_ERROR',
        'Realie rate limit (1200 calls per minute) reached',
      );
    }
    throw new IntegrationUnavailableException(
      'realie',
      'UPSTREAM_ERROR',
      `HTTP ${res.status}${detail ? `: ${detail}` : ''}`,
    );
  }
}

/** Realie error bodies: { error, code, action, billing_url }. */
async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; action?: string };
    return [body.error, body.action].filter(Boolean).join(' ').slice(0, 240);
  } catch {
    return '';
  }
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const bool = (v: unknown): boolean | null =>
  typeof v === 'boolean'
    ? v
    : v === 1 || v === '1' || v === 'true'
      ? true
      : v === 0 || v === '0' || v === 'false'
        ? false
        : null;
const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Reads the nested v3 shape (propertyLocation, propertyIdentification.
 * currentOwner, valuationInformation, salesHistory, building, taxInformation)
 * with the flat v2-compatible keys as fallbacks, since the shape is an
 * account-level setting on Realie's side.
 */
export function normalizeRealieProperty(
  r: Record<string, unknown>,
): RealieProperty {
  const loc = obj(r.propertyLocation);
  const owner = obj(obj(r.propertyIdentification).currentOwner);
  const val = obj(r.valuationInformation);
  const sale = obj(arr(r.salesHistory)[0]);
  const primary = obj(r.building);
  const bld = Object.keys(primary).length
    ? primary
    : obj(arr(obj(r.buildingInformation).buildings)[0]);
  const tax = obj(r.taxInformation);
  const land = obj(r.landInformation);
  const ml = obj(obj(r.realieValuation).ml);
  const coords = obj(r.coordinates);

  const street =
    str(loc.addressLine1) ??
    str(loc.address) ??
    str(r.addressLine1) ??
    str(r.address) ??
    '';
  const mailingAddress =
    str(owner.ownerAddress) ??
    str(owner.ownerStreet) ??
    str(r.ownerAddressLine1);
  let occupied = bool(owner.ownerOccupied ?? r.ownerOccupied);
  if (occupied == null && mailingAddress && street) {
    // The flat shape has no flag; the mailing address tells.
    occupied = alnum(mailingAddress).startsWith(alnum(street));
  }
  const foreclosures = arr(r.foreclosures);
  const liens = arr(r.liens);
  const saleDate = str(sale.saleDate) ?? str(r.transferDate);

  return {
    realieParcelId: str(r.realieParcelId) ?? '',
    parcelId: str(r.parcelId),
    address: {
      street,
      unit: str(loc.unitNumber) ?? str(loc.addressUnit) ?? str(r.addressLine2),
      city: str(loc.city) ?? str(r.city) ?? '',
      state: usStateCode(loc.state ?? r.state),
      postalCode: str(loc.zipCode) ?? str(r.zipCode) ?? '',
      county: str(r.county),
    },
    latitude: num(r.latitude ?? coords.latitude),
    longitude: num(r.longitude ?? coords.longitude),
    owner: {
      name: str(owner.ownerName) ?? str(r.ownerName),
      name2: str(owner.ownerName2) ?? str(r.ownerName2),
      occupied,
      mailingAddress,
      mailingCity: str(owner.ownerCity) ?? str(r.ownerCity),
      mailingState: usStateCode(owner.ownerState ?? r.ownerState) || null,
      mailingZip: str(owner.ownerZipCode) ?? str(r.ownerZipCode),
    },
    values: {
      market: num(val.totalMarketValue ?? r.totalMarketValue),
      assessed: num(val.totalAssessedValue ?? r.totalAssessedValue),
      estimate: num(ml.value ?? r.modelValue),
    },
    lastSale: saleDate
      ? {
          date: saleDate,
          price: num(sale.salePrice ?? r.transferPrice),
          distressed:
            bool(sale.distressedSale) === true ||
            bool(sale.realEstateOwned) === true,
        }
      : null,
    building: {
      yearBuilt: num(bld.actualYearBuilt ?? r.yearBuilt),
      bedrooms: num(bld.totalBedrooms ?? r.totalBedrooms),
      bathrooms: num(bld.totalBathrooms ?? r.totalBathrooms),
      livingArea: num(bld.livingArea ?? r.livingArea),
      lotAcres: num(land.acres ?? r.acres),
      useCode: r.useCode != null ? String(r.useCode) : null,
      residential: bool(r.residential),
    },
    distress: {
      taxStatus: str(tax.taxStatus),
      lienCount: liens.length || (num(r.totalLienCount) ?? 0),
      foreclosure: foreclosures.length > 0 || !!str(r.forecloseCode),
      mortgageCount: arr(r.mortgages).length,
    },
    raw: r,
  };
}
