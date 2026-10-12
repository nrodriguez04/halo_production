/**
 * The lead sources the API accepts (POST /leads/import/listings and sourcing
 * markets), with each source's own status vocabulary; the first status is
 * its default. Keep in step with apps/api/src/integrations/listings.
 */
export interface ListingSourceDef {
  value: string;
  label: string;
  hint: string;
  statuses: string[];
}

export const LISTING_SOURCES: ListingSourceDef[] = [
  {
    value: 'mls',
    label: 'MLS feed',
    hint: 'Your licensed RESO feed, as configured on the Integrations page.',
    statuses: ['Active', 'Pending', 'Expired', 'Withdrawn', 'Canceled', 'Closed'],
  },
  {
    value: 'rentcast',
    label: 'RentCast',
    hint: 'Nationwide active listings. Inactive means any listing that left the market, sold or not.',
    statuses: ['Active', 'Inactive'],
  },
  {
    value: 'realie',
    label: 'Realie county records',
    hint: 'Owner of record, values, sale history, liens and tax status from county records. No listing status: pick absentee owners or recent transfers. One Realie token per page of up to 100 parcels.',
    statuses: ['Absentee', 'Owner-occupied', 'Any'],
  },
];

export const sourceDef = (value: string): ListingSourceDef =>
  LISTING_SOURCES.find((s) => s.value === value) ?? LISTING_SOURCES[0];

export const sourceLabel = (value: string): string => sourceDef(value).label;
