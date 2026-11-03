import { factChecklist, type FactRecord, type FactStatus } from './facts';
import type { AssetClass } from './taxonomy';

/**
 * Due-diligence checklists per asset class (docs/asset-classes.md s8).
 * Each item is either a property fact (settled when the fact is verified)
 * or a document a person files on the deal with the tag
 * `diligence:<item key>`. The list says what is open;
 * it never marks an item done on its own.
 */

export type DiligenceStage = 'before_offer' | 'before_contract' | 'before_marketing' | 'before_closing';

export const DILIGENCE_STAGE_LABEL: Record<DiligenceStage, string> = {
  before_offer: 'Before an offer',
  before_contract: 'Before signing',
  before_marketing: 'Before marketing to buyers',
  before_closing: 'Before closing',
};

export interface DiligenceItem {
  key: string;
  label: string;
  stage: DiligenceStage;
  /** Settled by this property fact being verified. */
  factKey?: string;
  /** Settled by a document on the deal tagged `diligence:<key>`. */
  document?: boolean;
  /** Who usually provides it. */
  from: 'public record' | 'seller' | 'title company' | 'surveyor' | 'engineer or consultant' | 'municipality';
  help: string;
}

const LAND: DiligenceItem[] = [
  { key: 'zoning', label: 'Zoning and permitted uses confirmed', stage: 'before_offer', factKey: 'zoning', from: 'municipality', help: 'Ask the planning office, or read the zoning map, for what can be built.' },
  { key: 'flood', label: 'Flood zone checked', stage: 'before_offer', factKey: 'flood_zone', from: 'public record', help: 'The FEMA flood map at the parcel.' },
  { key: 'access', label: 'Legal access confirmed', stage: 'before_contract', factKey: 'legal_access', from: 'title company', help: 'Public road frontage or a recorded easement, shown in the title commitment.' },
  { key: 'utilities', label: 'Water, sewer or septic, and power confirmed', stage: 'before_contract', factKey: 'utility_water', from: 'engineer or consultant', help: 'Will-serve letters from providers, or a perc test for septic.' },
  { key: 'title', label: 'Title commitment and exceptions reviewed', stage: 'before_marketing', document: true, from: 'title company', help: 'Liens, easements, restrictions and who must sign.' },
  { key: 'survey', label: 'Survey', stage: 'before_marketing', factKey: 'survey_on_file', document: true, from: 'surveyor', help: 'Boundaries, frontage and encroachments. Many land buyers require one.' },
  { key: 'restrictions', label: 'Deed restrictions and HOA rules', stage: 'before_marketing', factKey: 'deed_restrictions', from: 'title company', help: 'What the deed or plat forbids.' },
  { key: 'wetlands', label: 'Wetlands', stage: 'before_marketing', factKey: 'wetlands', from: 'engineer or consultant', help: 'The national wetlands map, and a delineation if any are mapped.' },
  { key: 'minerals', label: 'Mineral and water rights', stage: 'before_closing', factKey: 'mineral_rights', from: 'title company', help: 'Whether they convey with the surface.' },
];

const COMMERCIAL: DiligenceItem[] = [
  { key: 't12', label: 'Trailing-12-month operating statement (T12)', stage: 'before_offer', factKey: 'noi', document: true, from: 'seller', help: 'A year of income and expenses; the basis of NOI.' },
  { key: 'rent_roll', label: 'Current rent roll', stage: 'before_offer', factKey: 'rent_roll', document: true, from: 'seller', help: 'Tenants, rents, deposits and lease dates.' },
  { key: 'leases', label: 'Leases and amendments', stage: 'before_contract', factKey: 'lease_terms', document: true, from: 'seller', help: 'What the tenants actually agreed to.' },
  { key: 'taxes', label: 'Property tax bills', stage: 'before_contract', factKey: 'property_taxes', from: 'public record', help: 'The last two years, and any protest under way.' },
  { key: 'environmental', label: 'Phase I environmental site assessment', stage: 'before_marketing', factKey: 'environmental', document: true, from: 'engineer or consultant', help: 'Required by most commercial buyers and lenders.' },
  { key: 'condition', label: 'Property condition report', stage: 'before_marketing', factKey: 'capex_needs', document: true, from: 'engineer or consultant', help: 'Roof, structure, systems and capital needs.' },
  { key: 'title', label: 'Title commitment and ALTA survey', stage: 'before_marketing', document: true, from: 'title company', help: 'Ownership, easements, encroachments.' },
  { key: 'zoning', label: 'Zoning compliance', stage: 'before_marketing', factKey: 'zoning', from: 'municipality', help: 'That the current use is permitted (or legally non-conforming).' },
  { key: 'estoppels', label: 'Tenant estoppel certificates', stage: 'before_closing', factKey: 'tenant_diligence', document: true, from: 'seller', help: 'Each tenant confirms its lease terms and that nothing is in dispute.' },
  { key: 'contracts', label: 'Service contracts', stage: 'before_closing', document: true, from: 'seller', help: 'Management, maintenance and utility contracts the buyer would inherit.' },
];

export function diligenceItemsFor(c: AssetClass | null | undefined): DiligenceItem[] {
  return c === 'land' ? LAND : c === 'commercial' ? COMMERCIAL : [];
}

export interface DiligenceStatusItem extends DiligenceItem {
  status: 'done' | 'reported' | 'open';
  detail: string;
}

/** The checklist with what is on file: done when the fact is verified or the document is filed. */
export function diligenceStatus(
  c: AssetClass | null | undefined,
  facts: readonly FactRecord[],
  /** Item keys with a document on the deal tagged `diligence:<key>`. */
  documentKeys: readonly string[],
): DiligenceStatusItem[] {
  const byFact = new Map<string, FactStatus>(factChecklist(c, facts).map((i) => [i.definition.key, i.status]));
  return diligenceItemsFor(c).map((item) => {
    const doc = !!item.document && documentKeys.includes(item.key);
    const fact = item.factKey ? byFact.get(item.factKey) : undefined;
    if (doc || fact === 'verified') {
      return { ...item, status: 'done', detail: doc ? 'Document on file.' : 'Verified.' };
    }
    if (fact === 'reported' || fact === 'estimated') {
      return { ...item, status: 'reported', detail: 'On file but not verified.' };
    }
    return { ...item, status: 'open', detail: `Needed from the ${item.from}.` };
  });
}

export const DILIGENCE_TAG_PREFIX = 'diligence:';
