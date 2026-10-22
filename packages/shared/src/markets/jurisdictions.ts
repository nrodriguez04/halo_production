/**
 * The 51 jurisdictions Halo can operate in: the 50 states and the District
 * of Columbia. Every one has a market record; none is enabled by default.
 *
 * `timeZone` is the zone most of the state's population is in. Statutory
 * deadlines are counted in calendar dates there, which is right for most
 * deals and a known approximation for the parts of split states
 * (docs/markets.md s5).
 */

export type CensusRegion = 'Northeast' | 'Midwest' | 'South' | 'West';

export interface Jurisdiction {
  code: string;
  name: string;
  fips: string;
  timeZone: string;
  region: CensusRegion;
}

export const JURISDICTIONS: readonly Jurisdiction[] = [
  { code: 'AL', name: 'Alabama', fips: '01', timeZone: 'America/Chicago', region: 'South' },
  { code: 'AK', name: 'Alaska', fips: '02', timeZone: 'America/Anchorage', region: 'West' },
  { code: 'AZ', name: 'Arizona', fips: '04', timeZone: 'America/Phoenix', region: 'West' },
  { code: 'AR', name: 'Arkansas', fips: '05', timeZone: 'America/Chicago', region: 'South' },
  { code: 'CA', name: 'California', fips: '06', timeZone: 'America/Los_Angeles', region: 'West' },
  { code: 'CO', name: 'Colorado', fips: '08', timeZone: 'America/Denver', region: 'West' },
  { code: 'CT', name: 'Connecticut', fips: '09', timeZone: 'America/New_York', region: 'Northeast' },
  { code: 'DE', name: 'Delaware', fips: '10', timeZone: 'America/New_York', region: 'South' },
  { code: 'DC', name: 'District of Columbia', fips: '11', timeZone: 'America/New_York', region: 'South' },
  { code: 'FL', name: 'Florida', fips: '12', timeZone: 'America/New_York', region: 'South' },
  { code: 'GA', name: 'Georgia', fips: '13', timeZone: 'America/New_York', region: 'South' },
  { code: 'HI', name: 'Hawaii', fips: '15', timeZone: 'Pacific/Honolulu', region: 'West' },
  { code: 'ID', name: 'Idaho', fips: '16', timeZone: 'America/Boise', region: 'West' },
  { code: 'IL', name: 'Illinois', fips: '17', timeZone: 'America/Chicago', region: 'Midwest' },
  { code: 'IN', name: 'Indiana', fips: '18', timeZone: 'America/Indiana/Indianapolis', region: 'Midwest' },
  { code: 'IA', name: 'Iowa', fips: '19', timeZone: 'America/Chicago', region: 'Midwest' },
  { code: 'KS', name: 'Kansas', fips: '20', timeZone: 'America/Chicago', region: 'Midwest' },
  { code: 'KY', name: 'Kentucky', fips: '21', timeZone: 'America/New_York', region: 'South' },
  { code: 'LA', name: 'Louisiana', fips: '22', timeZone: 'America/Chicago', region: 'South' },
  { code: 'ME', name: 'Maine', fips: '23', timeZone: 'America/New_York', region: 'Northeast' },
  { code: 'MD', name: 'Maryland', fips: '24', timeZone: 'America/New_York', region: 'South' },
  { code: 'MA', name: 'Massachusetts', fips: '25', timeZone: 'America/New_York', region: 'Northeast' },
  { code: 'MI', name: 'Michigan', fips: '26', timeZone: 'America/Detroit', region: 'Midwest' },
  { code: 'MN', name: 'Minnesota', fips: '27', timeZone: 'America/Chicago', region: 'Midwest' },
  { code: 'MS', name: 'Mississippi', fips: '28', timeZone: 'America/Chicago', region: 'South' },
  { code: 'MO', name: 'Missouri', fips: '29', timeZone: 'America/Chicago', region: 'Midwest' },
  { code: 'MT', name: 'Montana', fips: '30', timeZone: 'America/Denver', region: 'West' },
  { code: 'NE', name: 'Nebraska', fips: '31', timeZone: 'America/Chicago', region: 'Midwest' },
  { code: 'NV', name: 'Nevada', fips: '32', timeZone: 'America/Los_Angeles', region: 'West' },
  { code: 'NH', name: 'New Hampshire', fips: '33', timeZone: 'America/New_York', region: 'Northeast' },
  { code: 'NJ', name: 'New Jersey', fips: '34', timeZone: 'America/New_York', region: 'Northeast' },
  { code: 'NM', name: 'New Mexico', fips: '35', timeZone: 'America/Denver', region: 'West' },
  { code: 'NY', name: 'New York', fips: '36', timeZone: 'America/New_York', region: 'Northeast' },
  { code: 'NC', name: 'North Carolina', fips: '37', timeZone: 'America/New_York', region: 'South' },
  { code: 'ND', name: 'North Dakota', fips: '38', timeZone: 'America/Chicago', region: 'Midwest' },
  { code: 'OH', name: 'Ohio', fips: '39', timeZone: 'America/New_York', region: 'Midwest' },
  { code: 'OK', name: 'Oklahoma', fips: '40', timeZone: 'America/Chicago', region: 'South' },
  { code: 'OR', name: 'Oregon', fips: '41', timeZone: 'America/Los_Angeles', region: 'West' },
  { code: 'PA', name: 'Pennsylvania', fips: '42', timeZone: 'America/New_York', region: 'Northeast' },
  { code: 'RI', name: 'Rhode Island', fips: '44', timeZone: 'America/New_York', region: 'Northeast' },
  { code: 'SC', name: 'South Carolina', fips: '45', timeZone: 'America/New_York', region: 'South' },
  { code: 'SD', name: 'South Dakota', fips: '46', timeZone: 'America/Chicago', region: 'Midwest' },
  { code: 'TN', name: 'Tennessee', fips: '47', timeZone: 'America/Chicago', region: 'South' },
  { code: 'TX', name: 'Texas', fips: '48', timeZone: 'America/Chicago', region: 'South' },
  { code: 'UT', name: 'Utah', fips: '49', timeZone: 'America/Denver', region: 'West' },
  { code: 'VT', name: 'Vermont', fips: '50', timeZone: 'America/New_York', region: 'Northeast' },
  { code: 'VA', name: 'Virginia', fips: '51', timeZone: 'America/New_York', region: 'South' },
  { code: 'WA', name: 'Washington', fips: '53', timeZone: 'America/Los_Angeles', region: 'West' },
  { code: 'WV', name: 'West Virginia', fips: '54', timeZone: 'America/New_York', region: 'South' },
  { code: 'WI', name: 'Wisconsin', fips: '55', timeZone: 'America/Chicago', region: 'Midwest' },
  { code: 'WY', name: 'Wyoming', fips: '56', timeZone: 'America/Denver', region: 'West' },
];

export const JURISDICTION_CODES: readonly string[] = JURISDICTIONS.map((j) => j.code);

const BY_CODE = new Map(JURISDICTIONS.map((j) => [j.code, j]));
const BY_NAME = new Map(JURISDICTIONS.map((j) => [j.name.toUpperCase(), j]));
const BY_FIPS = new Map(JURISDICTIONS.map((j) => [j.fips, j]));

export function isJurisdictionCode(code: string | null | undefined): boolean {
  return !!code && BY_CODE.has(code);
}

export function jurisdiction(code: string): Jurisdiction | undefined {
  return BY_CODE.get(code);
}

/**
 * A two-letter code from whatever a record holds: a code in any case, a
 * full name, or a two-digit state FIPS code. Null when it is none of them.
 */
export function toJurisdictionCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  const upper = v.toUpperCase();
  if (BY_CODE.has(upper)) return upper;
  const byName = BY_NAME.get(upper) ?? (upper === 'WASHINGTON DC' || upper === 'D.C.' ? BY_CODE.get('DC') : undefined);
  if (byName) return byName.code;
  const fips = BY_FIPS.get(v.padStart(2, '0'));
  return /^\d{1,2}$/.test(v) && fips ? fips.code : null;
}
