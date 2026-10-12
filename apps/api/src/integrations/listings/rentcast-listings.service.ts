import { Injectable } from '@nestjs/common';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { IntegrationCostControlService } from '../../cost-control/cost-control.service';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';
import { IntegrationSecretsService } from '../../integration-secrets/integration-secrets.service';
import { IntegrationUnavailableException } from '../integration-unavailable.exception';
import type {
  Listing,
  ListingSearchCriteria,
  ListingSearchResult,
  ListingSourceAdapter,
} from './listing-source.types';
import { num, str } from './normalize';

const BASE_URL = 'https://api.rentcast.io/v1';
const FEED = 'listings/sale';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const TIMEOUT_MS = 20_000;

/**
 * RentCast sale listings as a lead source: nationwide, no MLS approval, one
 * billable request per page. The feed knows two states, `Active` and
 * `Inactive`, where Inactive is anything that left the market (sold, expired
 * or withdrawn alike), so "expired" cannot be isolated here; only an MLS
 * feed can. Query syntax per developers.rentcast.io/reference/search-queries:
 * ranges are `min:max` with `*` for an open end.
 */
@Injectable()
export class RentCastListingsService implements ListingSourceAdapter {
  readonly source = 'rentcast' as const;
  readonly statuses = ['Active', 'Inactive'] as const;

  constructor(
    private controlPlane: ControlPlaneService,
    private costControl: IntegrationCostControlService,
    private secrets: IntegrationSecretsService,
  ) {}

  async search(
    criteria: ListingSearchCriteria,
    ctx: CostContext,
  ): Promise<ListingSearchResult> {
    if (!(await this.controlPlane.isExternalDataEnabled(ctx.accountId))) {
      throw IntegrationUnavailableException.disabled('rentcast');
    }
    const apiKey = await this.secrets.resolve('rentcast', 'RENTCAST_API_KEY');
    if (!apiKey) {
      throw IntegrationUnavailableException.notConfigured(
        'rentcast',
        'RENTCAST_API_KEY',
      );
    }

    const url = RentCastListingsService.buildUrl(criteria);
    const out = await this.costControl.checkAndCall<
      ListingSearchCriteria,
      ListingSearchResult
    >({
      provider: 'rentcast',
      action: 'search_listings',
      payload: criteria,
      context: ctx,
      execute: () => this.fetchPage(url, apiKey, criteria),
    });
    return (
      (out.result as ListingSearchResult | null) ?? {
        source: 'rentcast',
        feed: FEED,
        listings: [],
        total: 0,
      }
    );
  }

  /** The exact request a set of criteria produces. Exposed for tests. */
  static buildUrl(criteria: ListingSearchCriteria): string {
    const limit = Math.min(
      Math.max(criteria.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const offset = Math.max(criteria.offset ?? 0, 0);
    const status = rentcastStatus(criteria.status?.[0]);
    const q: Array<[string, string]> = [];
    if (criteria.city) q.push(['city', criteria.city]);
    if (criteria.state) q.push(['state', criteria.state.toUpperCase()]);
    if (criteria.postalCode) q.push(['zipCode', criteria.postalCode]);
    q.push(['status', status]);
    if (criteria.propertyType) q.push(['propertyType', criteria.propertyType]);
    if (criteria.minPrice != null || criteria.maxPrice != null) {
      q.push([
        'price',
        `${criteria.minPrice ?? '*'}:${criteria.maxPrice ?? '*'}`,
      ]);
    }
    // daysOld counts from the listing date; for an active listing that is
    // its days on market. Inactive listings are filtered locally instead.
    if (criteria.minDaysOnMarket != null && status === 'Active') {
      q.push(['daysOld', `${criteria.minDaysOnMarket}:*`]);
    }
    q.push(
      ['limit', String(limit)],
      ['offset', String(offset)],
      ['includeTotalCount', 'true'],
    );
    const qs = q
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return `${BASE_URL}/${FEED}?${qs}`;
  }

  private async fetchPage(
    url: string,
    apiKey: string,
    criteria: ListingSearchCriteria,
  ): Promise<ListingSearchResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      throw new IntegrationUnavailableException(
        'rentcast',
        'UPSTREAM_ERROR',
        (err as Error).message,
      );
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) {
      throw new IntegrationUnavailableException(
        'rentcast',
        'REJECTED_CREDENTIALS',
        `HTTP ${res.status}`,
      );
    }
    // RentCast answers 404 when nothing matches.
    if (res.status === 404) {
      return { source: 'rentcast', feed: FEED, listings: [], total: 0 };
    }
    if (!res.ok) {
      throw new IntegrationUnavailableException(
        'rentcast',
        'UPSTREAM_ERROR',
        `HTTP ${res.status}`,
      );
    }
    const body = (await res.json()) as unknown;
    const listings = applyLocalFilters(
      (Array.isArray(body) ? body : []).map((r) =>
        normalizeRentCastListing(r as Record<string, unknown>),
      ),
      criteria,
    );
    const count = res.headers.get('x-total-count');
    const total = count == null ? NaN : Number(count);
    return {
      source: 'rentcast',
      feed: FEED,
      listings,
      total: Number.isFinite(total) ? total : null,
    };
  }
}

function rentcastStatus(requested?: string): 'Active' | 'Inactive' {
  return !requested || /^active$/i.test(requested) ? 'Active' : 'Inactive';
}

/**
 * Price and days-on-market floors are applied here as well as in the query,
 * so a page never carries a listing outside the ask (Inactive listings get
 * no daysOld filter upstream).
 */
export function applyLocalFilters(
  listings: Listing[],
  c: ListingSearchCriteria,
): Listing[] {
  return listings.filter(
    (l) =>
      (c.minPrice == null || (l.listPrice ?? 0) >= c.minPrice) &&
      (c.maxPrice == null ||
        l.listPrice == null ||
        l.listPrice <= c.maxPrice) &&
      (c.minDaysOnMarket == null || (l.daysOnMarket ?? 0) >= c.minDaysOnMarket),
  );
}

/** RentCast listing JSON (developers.rentcast.io/reference/sale-listings). */
export function normalizeRentCastListing(r: Record<string, unknown>): Listing {
  const agent = (r.listingAgent ?? {}) as Record<string, unknown>;
  const office = (r.listingOffice ?? {}) as Record<string, unknown>;
  const hasAgent = str(agent.name) || str(agent.phone) || str(agent.email);
  return {
    listingKey: String(r.id ?? ''),
    mlsId: str(r.mlsNumber),
    status: str(r.status) ?? 'Unknown',
    listPrice: num(r.price),
    address: {
      street: [str(r.addressLine1), str(r.addressLine2)]
        .filter(Boolean)
        .join(' '),
      city: str(r.city) ?? '',
      state: str(r.state) ?? '',
      postalCode: str(r.zipCode) ?? '',
    },
    propertyType: str(r.propertyType),
    bedrooms: num(r.bedrooms),
    bathrooms: num(r.bathrooms),
    livingArea: num(r.squareFootage),
    yearBuilt: num(r.yearBuilt),
    daysOnMarket: num(r.daysOnMarket),
    listDate: str(r.listedDate),
    modifiedAt: str(r.lastSeenDate),
    listingAgent: hasAgent
      ? {
          name: str(agent.name),
          phone: str(agent.phone),
          email: str(agent.email),
          office: str(office.name),
        }
      : null,
    raw: r,
  };
}
