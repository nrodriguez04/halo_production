import * as shared from '../../../../packages/shared/src/assets/taxonomy';
import * as sharedFacts from '../../../../packages/shared/src/assets/facts';
import * as sharedParcel from '../../../../packages/shared/src/assets/parcel';
import * as sharedDiligence from '../../../../packages/shared/src/assets/diligence';
import * as sharedUnderwriting from '../../../../packages/shared/src/assets/underwriting-types';
import {
  CommercialCriteriaSchema,
  LandCriteriaSchema,
  SOURCING_COVERAGE,
} from '../../../../packages/shared/src/assets/sourcing';
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABEL,
  ASSET_DECISION_LABEL,
  ASSET_SUBTYPES,
  ASSET_SUBTYPE_LABEL,
  DILIGENCE_STAGE_LABEL,
  FACT_STATUSES,
  FACT_STATUS_LABEL,
  OPERATOR_ONLY_SUBTYPES,
  acresText,
  assetLabel,
  factValueText,
  propertyLabel,
  rangeText,
} from '../assets';
import {
  commercialCriteriaFrom,
  countyMarketLabel,
  criteriaProblems,
  emptyCommercialForm,
  emptyLandForm,
  landCriteriaFrom,
  listOf,
  totals,
} from '../sourcing';

/**
 * The web app mirrors the shared asset vocabulary instead of importing the
 * shared index (it pulls in server-only modules). These fail when the two
 * drift, so a new subtype or a reworded status shows up here first.
 */
describe('asset vocabulary mirrors packages/shared', () => {
  it('has the same classes, subtypes and labels', () => {
    expect(ASSET_CLASSES).toEqual(shared.ASSET_CLASSES);
    expect(ASSET_CLASS_LABEL).toEqual(shared.ASSET_CLASS_LABEL);
    expect(ASSET_SUBTYPES).toEqual(shared.ASSET_SUBTYPES);
    expect(ASSET_SUBTYPE_LABEL).toEqual(shared.ASSET_SUBTYPE_LABEL);
    expect(OPERATOR_ONLY_SUBTYPES).toEqual(shared.OPERATOR_ONLY_SUBTYPES);
  });

  it('has the same fact statuses, diligence stages and decisions', () => {
    expect(FACT_STATUSES).toEqual(sharedFacts.FACT_STATUSES);
    expect(FACT_STATUS_LABEL).toEqual(sharedFacts.FACT_STATUS_LABEL);
    expect(DILIGENCE_STAGE_LABEL).toEqual(sharedDiligence.DILIGENCE_STAGE_LABEL);
    expect(ASSET_DECISION_LABEL).toEqual(sharedUnderwriting.ASSET_DECISION_LABEL);
  });

  it('names properties the way the api does', () => {
    const cases = [
      { address: '12 Elm St', city: 'Austin', state: 'TX', zip: '78701' },
      { apn: 'R-12345', county: 'Travis', state: 'TX' },
      { apn: '0042-001', county: 'St. Mary Parish', state: 'LA' },
      { apn: '77', state: 'NM' },
      { latitude: 30.123456, longitude: -97.654321, county: 'Hays', state: 'TX' },
      { state: 'TX' },
      { address: '  ', apn: '9', county: 'Bexar County', state: 'TX' },
    ];
    for (const c of cases) expect(propertyLabel(c)).toBe(sharedParcel.propertyLabel(c));
    expect(propertyLabel({ apn: 'R-12345', county: 'Travis', state: 'TX' })).toBe('Parcel R-12345, Travis County, TX');
  });

  it('labels a class and subtype, and never calls an unknown class residential', () => {
    expect(assetLabel('land', 'rural_acreage')).toBe(shared.assetLabel('land', 'rural_acreage'));
    expect(assetLabel(null)).toBe('Unclassified');
    expect(assetLabel('house')).toBe('Unclassified');
  });
});

describe('display helpers', () => {
  it('shows acreage at the precision a record supports', () => {
    expect(acresText(12.44)).toBe('12 acres');
    expect(acresText(4.26)).toBe('4.3 acres');
    expect(acresText(0.347)).toBe('0.35 acres');
    expect(acresText(1)).toBe('1 acre');
    expect(acresText(null)).toBeNull();
    expect(acresText(0)).toBeNull();
  });

  it('reads fact values with their units', () => {
    expect(factValueText({ value: 84000, unit: '$/yr', type: 'number', documentId: null })).toBe('$84,000/yr');
    expect(factValueText({ value: 92.5, unit: '%', type: 'number', documentId: null })).toBe('92.5%');
    expect(factValueText({ value: 3.2, unit: 'acres', type: 'number', documentId: null })).toBe('3.2 acres');
    expect(factValueText({ value: false, unit: null, type: 'boolean', documentId: null })).toBe('No');
    expect(factValueText({ value: null, unit: null, type: 'document', documentId: 'd1' })).toBe('Document on file');
    expect(factValueText({ value: null, unit: null, type: 'text', documentId: null })).toBeNull();
  });

  it('shows a range, never a single precise figure', () => {
    expect(rangeText({ low: 120000, high: 150000 })).toBe('$120,000 to $150,000');
    expect(rangeText({ low: 90000, high: 90000 })).toBe('about $90,000');
    expect(rangeText(null)).toBeNull();
  });
});

describe('sourcing forms', () => {
  it('sends only the land filters that were set, in the shape the api accepts', () => {
    const c = landCriteriaFrom({
      ...emptyLandForm,
      counties: 'Travis, Hays; Travis',
      subtypes: ['rural_acreage'],
      minAcres: '5',
      maxAcres: '',
      vacantOnly: true,
      landUse: 'vacant',
    });
    expect(c).toEqual({ counties: ['Travis', 'Hays'], subtypes: ['rural_acreage'], minAcres: 5, vacantOnly: true, landUse: ['vacant'] });
    expect(LandCriteriaSchema.safeParse(c).success).toBe(true);
    expect(landCriteriaFrom(emptyLandForm)).toEqual({});
  });

  it('builds commercial filters the api schema accepts', () => {
    const c = commercialCriteriaFrom({
      ...emptyCommercialForm,
      subtypes: ['retail', 'office'],
      minBuildingSqft: '5000',
      minYearBuilt: '1970',
      soldSince: '2020-01-01',
      ownerKinds: ['company'],
      distressOnly: true,
    });
    expect(CommercialCriteriaSchema.safeParse(c).success).toBe(true);
    expect(c.ownerKinds).toEqual(['company']);
    expect(c.minBuildingSqft).toBe(5000);
  });

  it('flags a minimum above its maximum and text that is not a number', () => {
    expect(criteriaProblems('land', { ...emptyLandForm, minAcres: '10', maxAcres: '5' })).toEqual([
      'Land: the minimum acreage is above the maximum.',
    ]);
    expect(criteriaProblems('commercial', { ...emptyCommercialForm, minUnits: '-3' })).toHaveLength(1);
    expect(criteriaProblems('land', emptyLandForm)).toEqual([]);
  });

  it('names a county-only market by its counties', () => {
    expect(countyMarketLabel('tx', ['Travis'], ['land'])).toBe('Travis County, TX (land)');
    expect(countyMarketLabel('TX', ['Travis', 'Hays', 'Bastrop'], ['land', 'commercial'])).toBe(
      'Travis County and 2 more, TX (land, commercial)',
    );
    expect(listOf(' a, b ,, c;d ')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('adds up a run across sources', () => {
    const t = totals({
      ranAt: '2026-11-03T00:00:00Z',
      trigger: 'UI',
      created: 3,
      batchLimit: 10,
      outcomes: [
        {
          source: 'realie',
          ok: true,
          searched: 10,
          created: 3,
          duplicates: 1,
          filtered: 6,
          filteredReasons: { 'acreage below the minimum': 4, 'outside the chosen counties': 2 },
          unclassified: 1,
          byClass: { land: 3 },
        },
        { source: 'rentcast', ok: false, error: 'not configured' },
      ],
    });
    expect(t).toMatchObject({ searched: 10, created: 3, duplicates: 1, filtered: 6, unclassified: 1, reported: true, byClass: { land: 3 } });
    expect(t.reasons[0]).toEqual(['acreage below the minimum', 4]);
  });

  it('knows every filter the api can report coverage for', () => {
    // The coverage table renders whatever rows the api sends; this guards the row shape it relies on.
    for (const row of SOURCING_COVERAGE) {
      expect(typeof row.label).toBe('string');
      expect(['provider', 'halo', 'none']).toContain(row.realie);
      expect(['provider', 'halo', 'none']).toContain(row.rentcast);
    }
  });
});
