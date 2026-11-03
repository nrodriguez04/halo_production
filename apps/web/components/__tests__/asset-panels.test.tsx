import '@testing-library/jest-dom';
import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetUnderwritingPanel } from '../assets/asset-underwriting-panel';
import { AssetPanel } from '../assets/asset-panel';
import { SourcingEstimatePanel } from '../sourcing/estimate-panel';
import { RunOutcome } from '../sourcing/run-outcome';
import { NationwideCard } from '../markets/nationwide-card';
import { AssetOfferCard } from '../assets/asset-offer-card';
import type { AssetView, DealUnderwriting } from '../../lib/assets';
import type { SourcingEstimate } from '../../lib/sourcing';

/** The api, answered from fixtures by path. Nothing leaves the test. */
const responses = new Map<string, unknown>();
const calls: Array<{ path: string; init?: RequestInit }> = [];

jest.mock('../../lib/api-fetch', () => {
  class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, message: string, body?: unknown) {
      super(message);
      this.status = status;
      this.body = body;
    }
  }
  return {
    ApiError,
    apiFetch: jest.fn(),
    apiJson: jest.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      const key = path.split('?')[0];
      if (!responses.has(key)) throw new ApiError(404, `no fixture for ${key}`);
      return responses.get(key);
    }),
  };
});

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  responses.clear();
  calls.length = 0;
});

const commercial: DealUnderwriting = {
  assetClass: 'commercial',
  subtype: 'retail',
  strategy: 'commercial_income_and_sales',
  valuation: { low: 1_150_000, mid: 1_250_000, high: 1_350_000 },
  approaches: [
    {
      key: 'income_capitalization',
      label: 'Income capitalization (NOI / cap rate)',
      range: { low: 1_150_000, mid: 1_250_000, high: 1_350_000 },
      unitValue: null,
      unit: null,
      evidenceCount: 2,
      note: 'Reported NOI at a sourced cap rate.',
    },
    {
      key: 'sales_price_per_sqft',
      label: 'Comparable sales per sq ft',
      range: null,
      unitValue: null,
      unit: 'sq ft',
      evidenceCount: 0,
      note: 'No comparable sales on record.',
    },
  ],
  evidence: [{ kind: 'assumption', text: 'Cap rate 7.0% from broker survey.' }],
  confidence: { score: 0.65, level: 'medium' },
  missing: ['No rent roll on file.'],
  risks: ['Occupancy is reported by the seller and not verified.'],
  assumptions: ['NOI as reported in the seller T12.'],
  offerRange: { low: 900_000, high: 1_000_000 },
  targetFee: 25_000,
  expectedBuyerPrice: 1_025_000,
  expectedNet: 20_000,
  buyerDemand: { level: 'some', matchingBuyers: 2, detail: '2 contactable buyers fit this deal.' },
  decision: 'review',
  summary: 'Review first: the income supports $1,150,000 to $1,350,000, but the rent roll is missing.',
  explanation: ['The seller reports net operating income of $87,500 a year.', 'Buyers here expect about 7%.'],
  sensitivity: [
    { capRate: 0.065, noiChange: 0, value: 1_350_000 },
    { capRate: 0.065, noiChange: -0.1, value: 1_200_000 },
    { capRate: 0.07, noiChange: 0, value: 1_250_000 },
    { capRate: 0.07, noiChange: -0.1, value: 1_125_000 },
  ],
  unclassified: false,
  computedAt: '2026-11-03T12:00:00.000Z',
};

describe('AssetUnderwritingPanel', () => {
  it('shows the decision, the why, a value range and the sensitivity grid', async () => {
    responses.set('/deals/d1/asset-underwriting', commercial);
    wrap(<AssetUnderwritingPanel dealId="d1" />);
    expect(await screen.findByText('Review first')).toBeInTheDocument();
    expect(screen.getByText(commercial.summary)).toBeInTheDocument();
    expect(screen.getByText(commercial.explanation[0])).toBeInTheDocument();
    expect(screen.getAllByText('$1,150,000 to $1,350,000').length).toBeGreaterThan(0);
    expect(screen.getByText('$900,000 to $1,000,000')).toBeInTheDocument();
    expect(screen.getByText('Income 10% lower')).toBeInTheDocument();
    expect(screen.getByText('6.5%')).toBeInTheDocument();
    expect(screen.getByText('No rent roll on file.')).toBeInTheDocument();
    expect(screen.queryByText(/not confirmed/i)).not.toBeInTheDocument();
  });

  it('warns that the residential model is used for an unclassified property, and recalculates', async () => {
    responses.set('/deals/d1/asset-underwriting', {
      ...commercial,
      assetClass: 'residential',
      strategy: 'residential_arv',
      sensitivity: null,
      unclassified: true,
      decision: 'review',
    });
    wrap(<AssetUnderwritingPanel dealId="d1" />);
    expect(await screen.findByText('The asset class is not confirmed')).toBeInTheDocument();
    expect(screen.queryByText('If the numbers move')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /recalculate/i }));
    await waitFor(() => expect(calls.some((c) => c.path === '/deals/d1/asset-underwriting' && c.init?.method === 'POST')).toBe(true));
  });
});

const land: AssetView = {
  id: 'p1',
  label: 'Parcel R-12345, Travis County, TX',
  assetClass: null,
  assetSubtype: null,
  basis: null,
  confidence: null,
  reasons: ['no building on record'],
  setAt: null,
  suggestion: { assetClass: 'land', subtype: 'rural_acreage' },
  unresolved: 'confirm there is no building on the parcel',
  developmentIndicators: [],
  providerLabels: ['0410'],
  useCode: '0410',
  codeMapping: null,
  dataSource: 'realie',
  dataUpdatedAt: null,
  facts: [
    {
      key: 'gross_acres',
      label: 'Gross acreage',
      unit: 'acres',
      type: 'number',
      critical: true,
      settledBy: 'record',
      help: 'The parcel size on the county record.',
      status: 'reported',
      value: 12.4,
      source: 'realie',
      sourceUrl: null,
      documentId: null,
      note: null,
      observedAt: '2026-11-01T00:00:00.000Z',
    },
    {
      key: 'legal_access',
      label: 'Legal access',
      unit: null,
      type: 'boolean',
      critical: true,
      settledBy: 'professional',
      help: 'A recorded right to reach the parcel.',
      status: 'needs_diligence',
      value: null,
      source: null,
      sourceUrl: null,
      documentId: null,
      note: null,
      observedAt: null,
    },
  ],
  criticalUnknowns: ['Legal access'],
  diligence: [
    { key: 'flood', label: 'Flood zone checked', stage: 'before_offer', factKey: 'flood_zone', from: 'public record', help: 'The FEMA flood map.', status: 'open', detail: 'Needed from the public record.' },
    { key: 'title', label: 'Title commitment reviewed', stage: 'before_marketing', document: true, from: 'title company', help: 'Liens and easements.', status: 'done', detail: 'Document on file.' },
  ],
  canCheckPublicRecords: false,
};

describe('AssetPanel', () => {
  it('offers the suggestion, the use-code mapping, facts and diligence for an unclassified parcel', async () => {
    responses.set('/properties/p1/asset', land);
    responses.set('/properties/p1/asset-class', {});
    responses.set('/documents', []);
    wrap(<AssetPanel dealId="d1" property={{ id: 'p1', state: 'TX', county: 'Travis' }} />);
    expect(await screen.findByText('Not classified yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm: Land: Rural acreage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply this to every 0410 in Travis County' })).toBeInTheDocument();
    expect(screen.getByText('12.4 acres')).toBeInTheDocument();
    expect(screen.getByText('Needs professional due diligence')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check flood and wetlands maps/i })).toBeDisabled();
    expect(screen.getByText(/needs the property.s map coordinates/i)).toBeInTheDocument();
    expect(screen.getByText('Before an offer')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 done')).toBeInTheDocument();

    // Recording a fact opens its form, and a verified fact asks for a source.
    fireEvent.click(screen.getAllByRole('button', { name: 'Record' })[0]);
    fireEvent.change(screen.getByLabelText('How it is known'), { target: { value: 'verified' } });
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: '' } });
    expect(screen.getByText('A verified fact needs its source or a document.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm: Land: Rural acreage' }));
    await waitFor(() => {
      const put = calls.find((c) => c.path === '/properties/p1/asset-class');
      expect(put?.init?.method).toBe('PUT');
      expect(JSON.parse(String(put?.init?.body))).toMatchObject({ assetClass: 'land', subtype: 'rural_acreage' });
    });
  });
});

const estimate: SourcingEstimate = {
  perSource: [{ source: 'realie', maxCallsPerRun: 5, unitCostUsd: 0.1, maxUsdPerRun: 0.5, note: 'One token per page.' }],
  maxUsdPerRun: 0.5,
  runsPerMonth: 0,
  maxUsdPerMonth: 0,
  coverage: [
    { filter: 'acres', label: 'Acreage and lot size', assetClasses: ['land', 'commercial'], support: { realie: 'halo' } },
    { filter: 'zoning', label: 'Zoning', assetClasses: ['land', 'commercial'], support: { realie: 'none' } },
  ],
  status: [
    {
      assetClass: 'land',
      label: 'Land',
      effectiveStatus: 'RESEARCH_ONLY',
      researchOnly: true,
      sellerOutreach: { allowed: false, reason: 'Not approved.' },
      summary: 'Research only for land in TX: Halo can find and analyze properties, but not contact sellers.',
      nationwide: false,
    },
  ],
};

describe('SourcingEstimatePanel', () => {
  it('shows the cost, what each source filters and the research-only status', async () => {
    responses.set('/sourcing/estimate', estimate);
    wrap(<SourcingEstimatePanel request={{ state: 'tx', sources: ['realie'], assetClasses: ['land'], cadence: 'manual', limit: 50 }} />);
    expect(await screen.findByText('$0.50', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/Manual: nothing is pulled/)).toBeInTheDocument();
    expect(screen.getAllByText('Halo filters after the pull').length).toBeGreaterThan(0);
    expect(screen.getByText(/No source chosen here returns: zoning/)).toBeInTheDocument();
    expect(screen.getByText(estimate.status[0].summary)).toBeInTheDocument();
    const post = calls.find((c) => c.path === '/sourcing/estimate');
    expect(JSON.parse(String(post?.init?.body))).toEqual({ state: 'TX', sources: ['realie'], assetClasses: ['land'], cadence: 'manual', limit: 50 });
  });

  it('asks for a state before estimating', () => {
    wrap(<SourcingEstimatePanel request={{ state: '', sources: ['realie'], assetClasses: ['land'], cadence: 'manual' }} />);
    expect(screen.getByText(/Enter a state and choose a source/)).toBeInTheDocument();
  });
});

describe('RunOutcome', () => {
  it('explains a small batch: new, duplicates, set aside and why, to confirm, per class', () => {
    render(
      <RunOutcome
        result={{
          ranAt: '2026-11-03T12:00:00.000Z',
          trigger: 'UI',
          created: 2,
          batchLimit: 10,
          outcomes: [
            {
              source: 'realie',
              ok: true,
              searched: 10,
              created: 2,
              duplicates: 1,
              filtered: 7,
              filteredReasons: { 'acreage below the minimum': 7 },
              unclassified: 1,
              byClass: { land: 2 },
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('2 new leads')).toBeInTheDocument();
    expect(screen.getByText('7 set aside by your filters')).toBeInTheDocument();
    expect(screen.getByText('acreage below the minimum: 7')).toBeInTheDocument();
    expect(screen.getByText(/1 lead kept, but the asset class needs a person/)).toBeInTheDocument();
    expect(screen.getByText('Land: 2')).toBeInTheDocument();
  });
});

describe('NationwideCard', () => {
  const closed = {
    open: false,
    openedAt: null,
    openedByName: null,
    note: null,
    activities: [],
    assetClasses: [],
    attestation: 'I accept the risk.',
    neverWaived: ['A state a person blocked or restricted stays closed.'],
    closedStates: [],
  };

  it('opens only the chosen activities and asset classes, and lists what it never waives', async () => {
    responses.set('/markets/nationwide', closed);
    wrap(<NationwideCard status={closed} />);
    expect(screen.getByText('A state a person blocked or restricted stays closed.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Double closing'));
    fireEvent.click(screen.getByLabelText('Commercial'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'I accept the risk.' }));
    fireEvent.change(screen.getByLabelText('Your full name'), { target: { value: 'Pat Owner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open all 50 states and DC' }));
    await waitFor(() => {
      const post = calls.find((c) => c.path === '/markets/nationwide');
      const body = JSON.parse(String(post?.init?.body));
      expect(body.activities).toContain('research');
      expect(body.activities).not.toContain('double_close');
      expect(body.assetClasses).toEqual(['residential', 'land']);
    });
  });

  it('says what is open when the decision stands', () => {
    wrap(
      <NationwideCard
        status={{ ...closed, open: true, openedAt: '2026-11-01T00:00:00.000Z', openedByName: 'Pat Owner', activities: ['research', 'seller_outreach'], assetClasses: ['land'] }}
      />,
    );
    expect(screen.getByText(/open for contacting sellers, for land property/)).toBeInTheDocument();
  });
});

describe('AssetOfferCard', () => {
  it('bounds the seller offer by the strategy range and asks a reason above it', async () => {
    responses.set('/deals/d1/asset-underwriting', commercial);
    wrap(<AssetOfferCard dealId="d1" stage="negotiating" offerAmount={null} />);
    expect(await screen.findByText(/offer range for this deal is \$900,000/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Offer to the seller'), { target: { value: '1200000' } });
    expect(screen.getByText(/Above the top of the offer range/)).toBeInTheDocument();
    expect(screen.getByLabelText('Reason')).toBeInTheDocument();
  });
});
