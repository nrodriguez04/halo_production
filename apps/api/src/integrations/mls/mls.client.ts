import { IntegrationUnavailableException } from '../integration-unavailable.exception';
import type {
  MlsConfig,
  MlsDialect,
  MlsListing,
  MlsSearchCriteria,
  MlsSearchResult,
} from './mls.types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const TIMEOUT_MS = 20_000;

/** RFC 3986 query string: spaces as %20 rather than +, which every RESO server decodes. */
function withQuery(root: string, params: Array<[string, string]>): string {
  const qs = params
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return qs ? `${root}?${qs}` : root;
}

/**
 * Thin HTTP client for the three feed shapes. No cost control, no storage:
 * MlsService wraps it. Pure enough to unit-test with a fake `fetch`.
 */
export class MlsClient {
  constructor(
    private readonly config: MlsConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get dialect(): MlsDialect {
    return this.config.dialect;
  }

  async search(criteria: MlsSearchCriteria): Promise<MlsSearchResult> {
    const limit = Math.min(
      Math.max(criteria.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const offset = Math.max(criteria.offset ?? 0, 0);
    return this.config.dialect === 'simplyrets'
      ? this.searchSimplyRets(criteria, limit, offset)
      : this.searchReso(criteria, limit, offset);
  }

  // ---------------------------------------------------------------- RESO

  /** OData `$filter` for the Property resource. Values are quoted/escaped. */
  static resoFilter(criteria: MlsSearchCriteria): string {
    const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
    const parts: string[] = [];
    const statuses = criteria.status?.length ? criteria.status : ['Active'];
    parts.push(
      statuses.length === 1
        ? `StandardStatus eq ${q(statuses[0])}`
        : `(${statuses.map((s) => `StandardStatus eq ${q(s)}`).join(' or ')})`,
    );
    if (criteria.city) parts.push(`City eq ${q(criteria.city)}`);
    if (criteria.state) parts.push(`StateOrProvince eq ${q(criteria.state)}`);
    if (criteria.postalCode)
      parts.push(`PostalCode eq ${q(criteria.postalCode)}`);
    if (criteria.propertyType)
      parts.push(`PropertyType eq ${q(criteria.propertyType)}`);
    if (typeof criteria.minPrice === 'number')
      parts.push(`ListPrice ge ${criteria.minPrice}`);
    if (typeof criteria.maxPrice === 'number')
      parts.push(`ListPrice le ${criteria.maxPrice}`);
    if (typeof criteria.minDaysOnMarket === 'number') {
      parts.push(`DaysOnMarket ge ${criteria.minDaysOnMarket}`);
    }
    return parts.join(' and ');
  }

  private resoUrl(path: string, params: Record<string, string>): string {
    const base = this.config.baseUrl.replace(/\/+$/, '');
    const root =
      this.config.dialect === 'bridge'
        ? `${base}/${encodeURIComponent(this.config.dataset ?? '')}`
        : base;
    const query: Array<[string, string]> = Object.entries(params);
    // Bridge takes the server token as a query parameter.
    if (this.config.dialect === 'bridge' && this.config.token) {
      query.push(['access_token', this.config.token]);
    }
    return withQuery(`${root}/${path}`, query);
  }

  private async searchReso(
    criteria: MlsSearchCriteria,
    limit: number,
    offset: number,
  ): Promise<MlsSearchResult> {
    const url = this.resoUrl('Property', {
      $filter: MlsClient.resoFilter(criteria),
      $top: String(limit),
      $skip: String(offset),
      $orderby: 'ModificationTimestamp desc',
      $count: 'true',
    });
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.config.dialect === 'reso' && this.config.token) {
      headers.Authorization = `Bearer ${this.config.token}`;
    }
    const body = await this.request<{
      value?: Record<string, unknown>[];
      '@odata.count'?: number;
      error?: { code?: number | string; message?: string };
    }>(url, headers);
    if (body.error) {
      throw new IntegrationUnavailableException(
        'mls',
        'UPSTREAM_ERROR',
        `${body.error.code ?? ''} ${body.error.message ?? ''}`.trim(),
      );
    }
    return {
      listings: (body.value ?? []).map(normalizeReso),
      total:
        typeof body['@odata.count'] === 'number' ? body['@odata.count'] : null,
      dialect: this.config.dialect,
    };
  }

  // ---------------------------------------------------------------- SimplyRETS

  private async searchSimplyRets(
    criteria: MlsSearchCriteria,
    limit: number,
    offset: number,
  ): Promise<MlsSearchResult> {
    // A SimplyRETS feed is one MLS, so there is no state filter to pass.
    const query: Array<[string, string]> = [];
    for (const s of criteria.status?.length ? criteria.status : ['Active'])
      query.push(['status', s]);
    if (criteria.city) query.push(['cities', criteria.city]);
    if (criteria.postalCode) query.push(['postalCodes', criteria.postalCode]);
    if (criteria.propertyType)
      query.push(['type', criteria.propertyType.toLowerCase()]);
    if (typeof criteria.minPrice === 'number')
      query.push(['minprice', String(criteria.minPrice)]);
    if (typeof criteria.maxPrice === 'number')
      query.push(['maxprice', String(criteria.maxPrice)]);
    query.push(['limit', String(limit)], ['offset', String(offset)]);
    const url = withQuery(
      `${this.config.baseUrl.replace(/\/+$/, '')}/properties`,
      query,
    );

    const auth = Buffer.from(
      `${this.config.username ?? ''}:${this.config.password ?? ''}`,
    ).toString('base64');
    const { body, headers } = await this.requestWithHeaders<
      Record<string, unknown>[]
    >(url, {
      Accept: 'application/json',
      Authorization: `Basic ${auth}`,
    });
    let listings = (Array.isArray(body) ? body : []).map(normalizeSimplyRets);
    // SimplyRETS has no days-on-market filter; apply it client-side.
    if (typeof criteria.minDaysOnMarket === 'number') {
      const min = criteria.minDaysOnMarket;
      listings = listings.filter((l) => (l.daysOnMarket ?? 0) >= min);
    }
    const count = headers.get('x-total-count');
    const total = count == null ? NaN : Number(count);
    return {
      listings,
      total: Number.isFinite(total) ? total : null,
      dialect: 'simplyrets',
    };
  }

  // ---------------------------------------------------------------- HTTP

  private async request<T>(
    url: string,
    headers: Record<string, string>,
  ): Promise<T> {
    return (await this.requestWithHeaders<T>(url, headers)).body;
  }

  private async requestWithHeaders<T>(
    url: string,
    headers: Record<string, string>,
  ): Promise<{ body: T; headers: Headers }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers, signal: controller.signal });
    } catch (err) {
      throw new IntegrationUnavailableException(
        'mls',
        'UPSTREAM_ERROR',
        (err as Error).message,
      );
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) {
      throw new IntegrationUnavailableException(
        'mls',
        'REJECTED_CREDENTIALS',
        `HTTP ${res.status}`,
      );
    }
    if (!res.ok) {
      throw new IntegrationUnavailableException(
        'mls',
        'UPSTREAM_ERROR',
        `HTTP ${res.status}`,
      );
    }
    return { body: (await res.json()) as T, headers: res.headers };
  }
}

// ------------------------------------------------------------------ normalizers

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** RESO Data Dictionary field names, as Bridge, MLS Grid, Trestle and Spark serve them. */
export function normalizeReso(r: Record<string, unknown>): MlsListing {
  // The atomic street fields dedupe cleanly; UnparsedAddress is a fallback
  // because some MLSs put the city and state in it too.
  const assembled = [
    r.StreetNumber,
    r.StreetDirPrefix,
    r.StreetName,
    r.StreetSuffix,
    r.StreetDirSuffix,
    r.UnitNumber,
  ]
    .map(str)
    .filter(Boolean)
    .join(' ');
  const street =
    str(r.StreetNumber) && str(r.StreetName)
      ? assembled
      : (str(r.UnparsedAddress) ?? assembled);
  const agentName =
    str(r.ListAgentFullName) ??
    ([r.ListAgentFirstName, r.ListAgentLastName]
      .map(str)
      .filter(Boolean)
      .join(' ') ||
      null);
  return {
    listingKey: str(r.ListingKey) ?? str(r.ListingId) ?? '',
    mlsId: str(r.ListingId),
    status: str(r.StandardStatus) ?? str(r.MlsStatus) ?? 'Unknown',
    listPrice: num(r.ListPrice),
    address: {
      street,
      city: str(r.City) ?? '',
      state: str(r.StateOrProvince) ?? '',
      postalCode: str(r.PostalCode) ?? '',
    },
    propertyType: str(r.PropertyType),
    bedrooms: num(r.BedroomsTotal),
    bathrooms: num(r.BathroomsTotalInteger) ?? num(r.BathroomsFull),
    livingArea: num(r.LivingArea),
    yearBuilt: num(r.YearBuilt),
    daysOnMarket: num(r.DaysOnMarket),
    listDate: str(r.ListingContractDate) ?? str(r.OnMarketDate),
    modifiedAt: str(r.ModificationTimestamp),
    listingAgent:
      agentName || str(r.ListAgentDirectPhone) || str(r.ListAgentEmail)
        ? {
            name: agentName || null,
            phone:
              str(r.ListAgentDirectPhone) ?? str(r.ListAgentPreferredPhone),
            email: str(r.ListAgentEmail),
            office: str(r.ListOfficeName),
          }
        : null,
    raw: r,
  };
}

/** SimplyRETS JSON shape (see api.simplyrets.com). */
export function normalizeSimplyRets(r: Record<string, unknown>): MlsListing {
  const address = (r.address ?? {}) as Record<string, unknown>;
  const property = (r.property ?? {}) as Record<string, unknown>;
  const mls = (r.mls ?? {}) as Record<string, unknown>;
  const agent = (r.agent ?? {}) as Record<string, unknown>;
  const contact = (agent.contact ?? {}) as Record<string, unknown>;
  const office = (r.office ?? {}) as Record<string, unknown>;
  const agentName = [agent.firstName, agent.lastName]
    .map(str)
    .filter(Boolean)
    .join(' ');
  return {
    // mlsId is SimplyRETS' own record id; listingId is the MLS number.
    listingKey: String(r.mlsId ?? r.listingId ?? ''),
    mlsId: str(r.listingId) ?? (r.mlsId != null ? String(r.mlsId) : null),
    status: str(mls.status) ?? 'Unknown',
    listPrice: num(r.listPrice),
    address: {
      street:
        str(address.full) ??
        [address.streetNumberText, address.streetName]
          .map(str)
          .filter(Boolean)
          .join(' '),
      city: str(address.city) ?? '',
      state: str(address.state) ?? '',
      postalCode: str(address.postalCode) ?? '',
    },
    propertyType: str(property.type) ?? str(property.subType),
    bedrooms: num(property.bedrooms),
    bathrooms: num(property.bathsFull),
    livingArea: num(property.area),
    yearBuilt: num(property.yearBuilt),
    daysOnMarket: num(mls.daysOnMarket),
    listDate: str(r.listDate),
    modifiedAt: str(r.modified),
    listingAgent:
      agentName || str(contact.cell) || str(contact.email)
        ? {
            name: agentName || null,
            phone: str(contact.cell) ?? str(contact.office),
            email: str(contact.email),
            office: str(office.name),
          }
        : null,
    raw: r,
  };
}
