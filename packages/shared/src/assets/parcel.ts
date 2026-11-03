/**
 * A parcel's identity when it has no street address (docs/asset-classes.md
 * s3). Rural land is identified by its county and assessor's parcel number
 * (APN); the key below is what dedupe compares across providers and across
 * sourcing markets that overlap. The migration that introduced it computes
 * the same key in SQL, so the two must change together.
 */

/** "Travis County" -> "travis"; "St. Mary Parish" -> "stmary". */
export function normalizeCounty(county: string | null | undefined): string | null {
  if (!county) return null;
  const s = county
    .trim()
    .toLowerCase()
    .replace(/\s+(county|parish|borough)$/, '')
    .replace(/[^a-z0-9]/g, '');
  return s || null;
}

export function normalizeApn(apn: string | null | undefined): string | null {
  if (!apn) return null;
  const s = apn.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s || null;
}

/** STATE|county|APN, or null when any part is missing: an APN alone is not unique across counties. */
export function parcelKey(state: string | null | undefined, county: string | null | undefined, apn: string | null | undefined): string | null {
  const st = state?.trim().toUpperCase();
  const c = normalizeCounty(county);
  const a = normalizeApn(apn);
  return st && c && a ? `${st}|${c}|${a}` : null;
}

export interface PropertyLabelInput {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  apn?: string | null;
  county?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * How to name a property in the UI, messages and documents: its street
 * address when it has one, else its APN and county, else its coordinates.
 */
export function propertyLabel(p: PropertyLabelInput): string {
  if (p.address?.trim()) {
    return [p.address.trim(), p.city?.trim(), [p.state, p.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }
  const where = [p.county?.trim() ? countyName(p.county) : null, p.state].filter(Boolean).join(', ');
  if (p.apn?.trim()) return `Parcel ${p.apn.trim()}${where ? `, ${where}` : ''}`;
  if (p.latitude != null && p.longitude != null) {
    return `Parcel at ${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}${where ? `, ${where}` : ''}`;
  }
  return where ? `Unaddressed parcel, ${where}` : 'Unaddressed parcel';
}

function countyName(c: string): string {
  const t = c.trim();
  return /\b(county|parish|borough)$/i.test(t) ? t : `${t} County`;
}

/** A property can be underwritten, matched and contracted when something identifies it. */
export function isIdentifiable(p: PropertyLabelInput): boolean {
  return !!(p.address?.trim() && (p.zip?.trim() || p.city?.trim())) || !!(p.apn?.trim() && p.county?.trim()) || (p.latitude != null && p.longitude != null);
}
