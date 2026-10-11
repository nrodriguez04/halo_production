import { normalizePhoneNumber } from '@halo/shared';
import { NANP_AREA_CODE_TIME_ZONES } from './nanp-time-zones';

/**
 * Where the recipient might be, as IANA zones. Quiet hours are the
 * recipient's local hours (TCPA: the called party's location), not the
 * tenant's, and neither signal is certain: mobile numbers are portable and
 * a lead's address is the property, which an absentee owner may not live
 * in. So every zone either signal points to is returned, and the caller
 * only sends when it is outside quiet hours in all of them.
 */

// States and territories that span more than one zone list each of them.
export const US_STATE_TIME_ZONES: Readonly<Record<string, readonly string[]>> =
  {
    AL: ['America/Chicago'],
    AK: ['America/Anchorage', 'America/Adak'],
    AZ: ['America/Phoenix', 'America/Denver'], // Navajo Nation observes DST
    AR: ['America/Chicago'],
    CA: ['America/Los_Angeles'],
    CO: ['America/Denver'],
    CT: ['America/New_York'],
    DE: ['America/New_York'],
    DC: ['America/New_York'],
    FL: ['America/New_York', 'America/Chicago'],
    GA: ['America/New_York'],
    HI: ['Pacific/Honolulu'],
    ID: ['America/Boise', 'America/Los_Angeles'],
    IL: ['America/Chicago'],
    IN: ['America/Indiana/Indianapolis', 'America/Chicago'],
    IA: ['America/Chicago'],
    KS: ['America/Chicago', 'America/Denver'],
    KY: ['America/New_York', 'America/Chicago'],
    LA: ['America/Chicago'],
    ME: ['America/New_York'],
    MD: ['America/New_York'],
    MA: ['America/New_York'],
    MI: ['America/Detroit', 'America/Menominee'],
    MN: ['America/Chicago'],
    MS: ['America/Chicago'],
    MO: ['America/Chicago'],
    MT: ['America/Denver'],
    NE: ['America/Chicago', 'America/Denver'],
    NV: ['America/Los_Angeles', 'America/Denver'],
    NH: ['America/New_York'],
    NJ: ['America/New_York'],
    NM: ['America/Denver'],
    NY: ['America/New_York'],
    NC: ['America/New_York'],
    ND: ['America/Chicago', 'America/Denver'],
    OH: ['America/New_York'],
    OK: ['America/Chicago'],
    OR: ['America/Los_Angeles', 'America/Boise'],
    PA: ['America/New_York'],
    RI: ['America/New_York'],
    SC: ['America/New_York'],
    SD: ['America/Chicago', 'America/Denver'],
    TN: ['America/Chicago', 'America/New_York'],
    TX: ['America/Chicago', 'America/Denver'],
    UT: ['America/Denver'],
    VT: ['America/New_York'],
    VA: ['America/New_York'],
    WA: ['America/Los_Angeles'],
    WV: ['America/New_York'],
    WI: ['America/Chicago'],
    WY: ['America/Denver'],
    PR: ['America/Puerto_Rico'],
    VI: ['America/St_Thomas'],
    GU: ['Pacific/Guam'],
    AS: ['Pacific/Pago_Pago'],
    MP: ['Pacific/Saipan'],
  };

const STATE_NAMES: Readonly<Record<string, string>> = {
  ALABAMA: 'AL',
  ALASKA: 'AK',
  ARIZONA: 'AZ',
  ARKANSAS: 'AR',
  CALIFORNIA: 'CA',
  COLORADO: 'CO',
  CONNECTICUT: 'CT',
  DELAWARE: 'DE',
  'DISTRICT OF COLUMBIA': 'DC',
  FLORIDA: 'FL',
  GEORGIA: 'GA',
  HAWAII: 'HI',
  IDAHO: 'ID',
  ILLINOIS: 'IL',
  INDIANA: 'IN',
  IOWA: 'IA',
  KANSAS: 'KS',
  KENTUCKY: 'KY',
  LOUISIANA: 'LA',
  MAINE: 'ME',
  MARYLAND: 'MD',
  MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI',
  MINNESOTA: 'MN',
  MISSISSIPPI: 'MS',
  MISSOURI: 'MO',
  MONTANA: 'MT',
  NEBRASKA: 'NE',
  NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM',
  'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND',
  OHIO: 'OH',
  OKLAHOMA: 'OK',
  OREGON: 'OR',
  PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD',
  TENNESSEE: 'TN',
  TEXAS: 'TX',
  UTAH: 'UT',
  VERMONT: 'VT',
  VIRGINIA: 'VA',
  WASHINGTON: 'WA',
  'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI',
  WYOMING: 'WY',
  'PUERTO RICO': 'PR',
  'VIRGIN ISLANDS': 'VI',
  'US VIRGIN ISLANDS': 'VI',
  GUAM: 'GU',
  'AMERICAN SAMOA': 'AS',
  'NORTHERN MARIANA ISLANDS': 'MP',
};

/** The NANP area code of a +1 number, or null for anything else. */
export function areaCodeOf(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const e164 = normalizePhoneNumber(phone.trim());
  const match = /^\+1([2-9]\d\d)\d{7}$/.exec(e164);
  return match ? match[1] : null;
}

export function stateTimeZones(state: string | null | undefined): string[] {
  if (!state) return [];
  const key = state
    .trim()
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
  const code = US_STATE_TIME_ZONES[key] ? key : STATE_NAMES[key];
  return code ? [...US_STATE_TIME_ZONES[code]] : [];
}

export function areaCodeTimeZones(phone: string | null | undefined): string[] {
  const areaCode = areaCodeOf(phone);
  return areaCode ? [...(NANP_AREA_CODE_TIME_ZONES[areaCode] ?? [])] : [];
}

/** Every zone the recipient's phone area code or address state points to. */
export function recipientTimeZones(recipient: {
  phone?: string | null;
  state?: string | null;
}): string[] {
  return Array.from(
    new Set([
      ...areaCodeTimeZones(recipient.phone),
      ...stateTimeZones(recipient.state),
    ]),
  );
}
