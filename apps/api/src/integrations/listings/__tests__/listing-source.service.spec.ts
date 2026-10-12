import { ListingSourceService } from '../listing-source.service';

describe('ListingSourceService', () => {
  const ctx = {
    accountId: 'tenant-1',
    actor: 'user' as const,
    userId: 'user-1',
  };
  const adapter = (source: string, statuses: string[]) => ({
    source,
    statuses,
    search: jest
      .fn()
      .mockResolvedValue({ source, feed: source, listings: [], total: 0 }),
  });
  const mls = adapter('mls', ['Active', 'Expired']);
  const realie = adapter('realie', ['Absentee', 'Owner-occupied', 'Any']);
  const rentcast = adapter('rentcast', ['Active', 'Inactive']);
  const service = new ListingSourceService(
    mls as any,
    rentcast as any,
    realie as any,
  );

  it('routes a search to the adapter for the requested source', async () => {
    const out = await service.search('realie', { city: 'Houston' }, ctx);
    expect(realie.search).toHaveBeenCalledWith({ city: 'Houston' }, ctx);
    expect(mls.search).not.toHaveBeenCalled();
    expect(rentcast.search).not.toHaveBeenCalled();
    expect(out.source).toBe('realie');
  });

  it("reports each source's status vocabulary, default first", () => {
    expect(service.statuses('rentcast')).toEqual(['Active', 'Inactive']);
    expect(service.statuses('realie')[0]).toBe('Absentee');
  });
});
