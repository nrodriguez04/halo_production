/**
 * Statutory deadlines: a seller's cancellation right, a notice that must go
 * out within so many days. Deterministic, so the same contract gives the
 * same deadline on every machine.
 *
 * Counting rule: the trigger day is day 0 and the deadline is the end of
 * day N, in the jurisdiction's time zone. With `businessDays`, Saturdays,
 * Sundays and US federal holidays (observed) are skipped. State holidays
 * are not applied; a policy that needs them should shorten the window
 * (docs/markets.md s5).
 */

export interface YMD {
  y: number;
  m: number;
  d: number;
}

export function ymdString(p: YMD): string {
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function fromUtcDate(t: Date): YMD {
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function toUtcDate(p: YMD): Date {
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
}

function shift(p: YMD, days: number): YMD {
  const t = toUtcDate(p);
  t.setUTCDate(t.getUTCDate() + days);
  return fromUtcDate(t);
}

function weekday(p: YMD): number {
  return toUtcDate(p).getUTCDay();
}

/** The calendar date an instant falls on in a time zone. */
export function localDate(instant: Date, timeZone: string): YMD {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Milliseconds the zone is ahead of UTC at an instant. */
function zoneOffset(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The last millisecond of a calendar date in a time zone. */
export function endOfLocalDay(p: YMD, timeZone: string): Date {
  const guess = Date.UTC(p.y, p.m - 1, p.d, 23, 59, 59, 999);
  let t = guess - zoneOffset(new Date(guess), timeZone);
  // Once more, in case a DST change sits between the guess and the answer.
  t = guess - zoneOffset(new Date(t), timeZone);
  return new Date(t);
}

function nthWeekday(y: number, m: number, dow: number, n: number): YMD {
  const first = { y, m, d: 1 };
  const offset = (dow - weekday(first) + 7) % 7;
  return { y, m, d: 1 + offset + (n - 1) * 7 };
}

function lastWeekday(y: number, m: number, dow: number): YMD {
  const last = shift({ y: m === 12 ? y + 1 : y, m: m === 12 ? 1 : m + 1, d: 1 }, -1);
  const back = (weekday(last) - dow + 7) % 7;
  return shift(last, -back);
}

function observed(p: YMD): YMD {
  const w = weekday(p);
  if (w === 6) return shift(p, -1);
  if (w === 0) return shift(p, 1);
  return p;
}

/** US federal holidays observed in a year (5 U.S.C. 6103), as YYYY-MM-DD. */
export function federalHolidays(year: number): string[] {
  const days: YMD[] = [];
  for (const y of [year, year + 1]) {
    days.push(
      observed({ y, m: 1, d: 1 }),
      nthWeekday(y, 1, 1, 3),
      nthWeekday(y, 2, 1, 3),
      lastWeekday(y, 5, 1),
      ...(y >= 2021 ? [observed({ y, m: 6, d: 19 })] : []),
      observed({ y, m: 7, d: 4 }),
      nthWeekday(y, 9, 1, 1),
      nthWeekday(y, 10, 1, 2),
      observed({ y, m: 11, d: 11 }),
      nthWeekday(y, 11, 4, 4),
      observed({ y, m: 12, d: 25 }),
    );
  }
  // New Year's Day on a Saturday is observed on 31 December of the year before.
  return days
    .filter((p) => p.y === year)
    .map(ymdString)
    .sort();
}

const holidayCache = new Map<number, Set<string>>();
function isHoliday(p: YMD): boolean {
  let set = holidayCache.get(p.y);
  if (!set) {
    set = new Set(federalHolidays(p.y));
    holidayCache.set(p.y, set);
  }
  return set.has(ymdString(p));
}

export function isBusinessDay(p: YMD): boolean {
  const w = weekday(p);
  return w !== 0 && w !== 6 && !isHoliday(p);
}

/** Day 0 is `start`; returns day `n`, counting only business days when asked. */
export function addDays(start: YMD, n: number, businessDays: boolean): YMD {
  if (!businessDays) return shift(start, n);
  let p = start;
  let left = n;
  while (left > 0) {
    p = shift(p, 1);
    if (isBusinessDay(p)) left -= 1;
  }
  return p;
}

export interface DeadlineSpec {
  days: number;
  businessDays: boolean;
}

/** When a window that opens at `trigger` closes, in the jurisdiction's zone. */
export function deadlineFrom(
  trigger: Date,
  spec: DeadlineSpec,
  timeZone: string,
): { endsAt: Date; endsOn: string } {
  const end = addDays(localDate(trigger, timeZone), spec.days, spec.businessDays);
  return { endsAt: endOfLocalDay(end, timeZone), endsOn: ymdString(end) };
}
