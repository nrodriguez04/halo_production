import '@testing-library/jest-dom';
import * as React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MarketsPage from '../../app/(app)/leads/markets/page';

// jsdom has no ResizeObserver; Radix checkboxes measure themselves with one.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= NoopResizeObserver;

/** The api, answered from fixtures by method and path. Nothing leaves the test. */
const responses = new Map<string, unknown>();
const calls: Array<{ path: string; method: string; body: unknown }> = [];

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
      const method = init?.method ?? 'GET';
      calls.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const key = `${method} ${path.split('?')[0]}`;
      if (!responses.has(key)) throw new ApiError(404, `no fixture for ${key}`);
      return responses.get(key);
    }),
  };
});

const landMarket = {
  id: 'm1',
  label: 'Travis County, TX (land)',
  state: 'TX',
  city: null,
  postalCode: null,
  sources: ['realie'],
  assetClasses: ['land'],
  criteria: { limit: 50, land: { counties: ['Travis'], minAcres: 5 } },
  cadence: 'manual',
  enabled: true,
  nextRunAt: null,
  lastRunAt: null,
  lastResult: null,
};

beforeEach(() => {
  responses.clear();
  calls.length = 0;
  responses.set('GET /sourcing/markets', [landMarket]);
  responses.set('GET /sourcing/runs', []);
  responses.set('GET /sourcing/auto-enrich', { enabled: false, dailyCap: 0, usedToday: 0, remainingToday: 0, waiting: 0 });
  responses.set('POST /sourcing/estimate', {
    perSource: [{ source: 'realie', maxCallsPerRun: 5, unitCostUsd: 0.1, maxUsdPerRun: 0.5, note: 'One token per page.' }],
    maxUsdPerRun: 0.5,
    runsPerMonth: 0,
    maxUsdPerMonth: 0,
    coverage: [],
    status: [],
  });
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MarketsPage />
    </QueryClientProvider>,
  );
}

// The add-market test fills a long form and waits out the estimate's
// debounce: about 2 s locally, past Jest's 5 s default on a CI runner.
jest.setTimeout(20_000);

describe('Sourcing markets page', () => {
  it('shows a county-only land market and runs a small batch with a limit', async () => {
    responses.set('POST /sourcing/markets/m1/run', {
      ranAt: '2026-11-03T12:00:00.000Z',
      trigger: 'UI',
      created: 1,
      batchLimit: 10,
      outcomes: [{ source: 'realie', ok: true, searched: 10, created: 1, duplicates: 0, filtered: 9, filteredReasons: { 'acreage below the minimum': 9 }, unclassified: 0, byClass: { land: 1 } }],
    });
    renderPage();
    expect(await screen.findByText('Travis County, TX (land)')).toBeInTheDocument();
    expect(screen.getByText('Travis county, TX')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /run a small batch/i }));
    await waitFor(() => expect(calls.find((c) => c.path === '/sourcing/markets/m1/run')?.body).toEqual({ limit: 10 }));
    expect(await screen.findByText('acreage below the minimum: 9')).toBeInTheDocument();
  });

  it('adds a land market by county, on manual, with land filters', async () => {
    responses.set('POST /sourcing/markets', { ...landMarket, id: 'm2' });
    renderPage();
    await screen.findByText('Travis County, TX (land)');
    fireEvent.click(screen.getByRole('button', { name: 'Add market' }));
    const dialog = await screen.findByRole('dialog');
    const d = within(dialog);

    fireEvent.click(d.getByRole('checkbox', { name: /^Residential/ }));
    fireEvent.click(d.getByRole('checkbox', { name: /^Land/ }));
    expect((d.getByDisplayValue('manual') as HTMLSelectElement).value).toBe('manual');

    fireEvent.change(d.getByPlaceholderText('TX'), { target: { value: 'tx' } });
    const submit = d.getByRole('button', { name: 'Add market' });
    expect(submit).toBeDisabled(); // no city, ZIP or county yet
    fireEvent.change(d.getByPlaceholderText('Travis, Hays'), { target: { value: 'Hays, Travis' } });
    fireEvent.change(d.getByPlaceholderText('5'), { target: { value: '10' } });
    fireEvent.change(d.getByPlaceholderText('100'), { target: { value: '2' } });
    expect(d.getByText('Land: the minimum acreage is above the maximum.')).toBeInTheDocument();
    expect(submit).toBeDisabled();
    fireEvent.change(d.getByPlaceholderText('100'), { target: { value: '40' } });
    fireEvent.click(d.getByRole('checkbox', { name: /^Vacant only/ }));
    expect(await d.findByText(/Manual: nothing is pulled/)).toBeInTheDocument();
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/sourcing/markets')).toBe(true));
    const body = calls.find((c) => c.method === 'POST' && c.path === '/sourcing/markets')!.body as Record<string, any>;
    expect(body).toMatchObject({
      label: 'Hays County and 1 more, TX (land)',
      state: 'TX',
      assetClasses: ['land'],
      cadence: 'manual',
      criteria: { land: { counties: ['Hays', 'Travis'], minAcres: 10, maxAcres: 40, vacantOnly: true } },
    });
    expect(body.city).toBeUndefined();
    expect(body.criteria.commercial).toBeUndefined();
  });
});
