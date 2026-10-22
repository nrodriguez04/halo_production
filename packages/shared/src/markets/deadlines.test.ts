import { addDays, deadlineFrom, endOfLocalDay, federalHolidays, isBusinessDay, localDate } from './deadlines';

describe('federal holidays', () => {
  it('lists the eleven holidays of 2026 on their observed days', () => {
    expect(federalHolidays(2026)).toEqual([
      '2026-01-01',
      '2026-01-19',
      '2026-02-16',
      '2026-05-25',
      '2026-06-19',
      '2026-07-03', // 4 July is a Saturday
      '2026-09-07',
      '2026-10-12',
      '2026-11-11',
      '2026-11-26',
      '2026-12-25',
    ]);
  });

  it("observes a Saturday New Year's Day on 31 December of the year before", () => {
    // 1 January 2028 is a Saturday.
    expect(federalHolidays(2027)).toContain('2027-12-31');
    expect(federalHolidays(2028)).not.toContain('2028-01-01');
  });

  it('moves a Sunday holiday to Monday', () => {
    // 19 June 2033 is a Sunday.
    expect(federalHolidays(2033)).toContain('2033-06-20');
  });
});

describe('counting days', () => {
  it('skips weekends and holidays for business days', () => {
    // Wednesday 23 Dec 2026 + 3 business days: Thu 24, (Fri 25 holiday), Mon 28, Tue 29.
    expect(addDays({ y: 2026, m: 12, d: 23 }, 3, true)).toEqual({ y: 2026, m: 12, d: 29 });
    expect(isBusinessDay({ y: 2026, m: 12, d: 25 })).toBe(false);
  });

  it('counts calendar days straight through', () => {
    expect(addDays({ y: 2026, m: 12, d: 30 }, 3, false)).toEqual({ y: 2027, m: 1, d: 2 });
  });

  it('dates the trigger in the jurisdiction, not in UTC', () => {
    // 03:00 UTC on 2 Nov is still 1 Nov in Chicago.
    expect(localDate(new Date('2026-11-02T03:00:00Z'), 'America/Chicago')).toEqual({ y: 2026, m: 11, d: 1 });
  });

  it('ends a window at the last moment of the local day, across a DST change', () => {
    // 1 Nov 2026 is the day US clocks fall back; Chicago is UTC-6 by its end.
    expect(endOfLocalDay({ y: 2026, m: 11, d: 1 }, 'America/Chicago').toISOString()).toBe('2026-11-02T05:59:59.999Z');
    expect(endOfLocalDay({ y: 2026, m: 7, d: 1 }, 'America/Chicago').toISOString()).toBe('2026-07-02T04:59:59.999Z');
  });

  it('computes a three-business-day cancellation window from a signature', () => {
    // Signed Friday 2 Oct 2026, 4 pm in Houston: Mon 5, Tue 6, Wed 7.
    const d = deadlineFrom(new Date('2026-10-02T21:00:00Z'), { days: 3, businessDays: true }, 'America/Chicago');
    expect(d.endsOn).toBe('2026-10-07');
    expect(d.endsAt.toISOString()).toBe('2026-10-08T04:59:59.999Z');
  });
});
