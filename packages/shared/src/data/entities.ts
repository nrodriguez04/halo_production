/**
 * Who bought a property, from the name on the deed. Recorded names are
 * messy ("ACME HOLDINGS, L.L.C.", "Acme Holdings LLC"); matching needs one
 * form, and investor discovery needs to tell a company from a person, a
 * bank or a government agency. Deterministic, so two runs agree.
 */

export type PartyKind = 'company' | 'trust' | 'individual' | 'lender' | 'government';

const SUFFIX_RULES: Array<[RegExp, string]> = [
  [/\bLIMITED LIABILITY (COMPANY|CO)\b/g, 'LLC'],
  [/\bL L C\b/g, 'LLC'],
  [/\bLIMITED PARTNERSHIP\b/g, 'LP'],
  [/\bL L P\b/g, 'LLP'],
  [/\bL P\b/g, 'LP'],
  [/\bINCORPORATED\b/g, 'INC'],
  [/\bCORPORATION\b/g, 'CORP'],
  [/\bCOMPANY\b/g, 'CO'],
  [/\bLIMITED\b/g, 'LTD'],
  [/\bTRUSTEES?\b/g, 'TRUST'],
];

/** One spelling of a recorded party name: upper case, no punctuation, standard suffixes. */
export function normalizePartyName(name: string | null | undefined): string {
  if (!name) return '';
  let n = name
    .toUpperCase()
    .replace(/&/g, ' AND ')
    // L.L.C. and L.P. lose their dots before the rest of the punctuation goes.
    .replace(/\b([A-Z])\.(?=[A-Z]\.?)/g, '$1 ')
    .replace(/[.,'"`’()]/g, ' ')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [re, to] of SUFFIX_RULES) n = n.replace(re, to);
  n = n.replace(/^THE /, '').replace(/\s+/g, ' ').trim();
  return n;
}

const GOVERNMENT = /\b(CITY OF|COUNTY OF|COUNTY|STATE OF|TOWN OF|VILLAGE OF|HOUSING AUTHORITY|UNITED STATES|SECRETARY OF|DEPARTMENT OF|HUD|FEDERAL NATIONAL MORTGAGE|FANNIE MAE|FREDDIE MAC|FEDERAL HOME LOAN|VETERANS AFFAIRS|LAND BANK|SCHOOL DISTRICT)\b/;
const LENDER = /\b(BANK|BANCORP|MORTGAGE|LENDING|LOAN SERVICING|SAVINGS|CREDIT UNION|NATIONAL ASSOCIATION|N A|FINANCIAL SERVICES|SERVICING)\b/;
const COMPANY = /\b(LLC|INC|CORP|CO|LP|LLP|LTD|PLLC|PC|HOLDINGS|PROPERTIES|PROPERTY|INVESTMENTS?|INVESTORS?|CAPITAL|VENTURES|GROUP|PARTNERS|REALTY|HOMES|ENTERPRISES|ASSETS|EQUITY|FUND|DEVELOPMENT|ACQUISITIONS?|REAL ESTATE|RENTALS?|MANAGEMENT)\b/;

/** What kind of party a recorded name is. Lenders and agencies are not investors. */
export function partyKind(name: string | null | undefined): PartyKind {
  const n = normalizePartyName(name);
  if (!n) return 'individual';
  if (GOVERNMENT.test(n)) return 'government';
  if (LENDER.test(n)) return 'lender';
  if (/\bTRUST\b/.test(n) && !COMPANY.test(n.replace(/\bTRUST\b/g, ''))) return 'trust';
  if (COMPANY.test(n)) return 'company';
  return 'individual';
}

/**
 * The key two records share when they are the same buyer. A company is its
 * normalized name; a person needs their mailing zip too, since names repeat.
 */
export function partyKey(name: string | null | undefined, mailingZip?: string | null): string | null {
  const n = normalizePartyName(name);
  if (!n) return null;
  const kind = partyKind(n);
  if (kind === 'company' || kind === 'trust' || kind === 'lender' || kind === 'government') return `${kind}:${n}`;
  const zip = (mailingZip ?? '').replace(/\D/g, '').slice(0, 5);
  return zip ? `individual:${n}:${zip}` : null;
}
