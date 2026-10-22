/**
 * A small RFC 4180 CSV reader for county exports: quoted fields, escaped
 * quotes, commas and newlines inside quotes, CRLF or LF, a leading BOM.
 * Rows are keyed by the header row. Ragged rows keep what they have.
 */
export function parseCsv(text: string, opts: { maxRows?: number } = {}): { headers: string[]; rows: Array<Record<string, string>> } {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  const max = opts.maxRows ?? Number.POSITIVE_INFINITY;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      record.push(field);
      field = '';
      if (record.some((f) => f !== '')) records.push(record);
      record = [];
      if (records.length > max) break;
    } else {
      field += ch;
    }
  }
  if (field !== '' || record.length) {
    record.push(field);
    if (record.some((f) => f !== '')) records.push(record);
  }
  const [head, ...body] = records;
  const headers = (head ?? []).map((h) => h.trim());
  return {
    headers,
    rows: body.slice(0, max).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))),
  };
}

/** Header names county exports use for each sale field, for a first-guess mapping. */
const GUESSES: Record<string, RegExp> = {
  sourceRef: /^(doc(ument)?\s*(#|no|num(ber)?|id)|instrument\s*(#|no|number)?|recording\s*(#|no|number)|book.?page|record\s*id)$/i,
  saleDate: /^(sale|record(ed|ing)?|deed|transfer|instrument)\s*date$|^date$/i,
  price: /^(sale\s*)?(price|amount|consideration|sale\s*amt)$/i,
  buyerName: /^(grantee|buyer)(\s*name)?$/i,
  sellerName: /^(grantor|seller)(\s*name)?$/i,
  buyerMailingZip: /^(grantee|buyer|mail(ing)?)\s*zip$/i,
  address: /^(situs|property|site)?\s*address$/i,
  city: /^(situs|property)?\s*city$/i,
  zip: /^(situs|property)?\s*zip(\s*code)?$/i,
  apn: /^(apn|parcel(\s*(id|no|number))?|pin|account)$/i,
  mortgageAmount: /^(loan|mortgage)(\s*amount)?$/i,
  deedType: /^(deed|instrument)\s*type$/i,
  propertyType: /^(property|land)\s*(type|use)$/i,
  county: /^county$/i,
};

export function guessSaleColumns(headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, re] of Object.entries(GUESSES)) {
    const h = headers.find((x) => re.test(x.trim()));
    if (h) out[key] = h;
  }
  return out;
}
