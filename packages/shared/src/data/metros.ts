import { CBSA_TITLES, CBSA_VINTAGE, COUNTY_CBSA, COUNTY_NAMES } from './cbsa';

/**
 * Metros: the Census Bureau's core based statistical areas (CBSAs), which
 * group counties into one labour and housing market. A metropolitan area
 * has an urban core of 50,000 people or more, a micropolitan one 10,000 to
 * 50,000. Counties outside every CBSA belong to no metro.
 */
export interface Metro {
  code: string;
  title: string;
  metropolitan: boolean;
  /** The states in the title, principal city's state first ("Memphis, TN-MS-AR"). */
  states: string[];
}

export { CBSA_VINTAGE };

export function metroByCode(code: string | null | undefined): Metro | null {
  const entry = code ? CBSA_TITLES[code] : undefined;
  if (!code || !entry) return null;
  const [title, metropolitan] = entry;
  const comma = title.lastIndexOf(', ');
  return {
    code,
    title,
    metropolitan: metropolitan === 1,
    states: comma >= 0 ? title.slice(comma + 2).split('-') : [],
  };
}

/** The metro a county (five-digit FIPS) belongs to, or null. */
export function metroForCounty(countyFips: string | null | undefined): Metro | null {
  return countyFips ? metroByCode(COUNTY_CBSA[countyFips]) : null;
}

/** A county's name from the delineation ("Dallas County"); only counties inside a CBSA are listed. */
export function countyName(countyFips: string | null | undefined): string | null {
  return (countyFips && COUNTY_NAMES[countyFips]) || null;
}
