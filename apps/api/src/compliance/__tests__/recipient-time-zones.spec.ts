import {
  areaCodeOf,
  areaCodeTimeZones,
  recipientTimeZones,
  stateTimeZones,
  US_STATE_TIME_ZONES,
} from '../recipient-time-zones';
import { NANP_AREA_CODE_TIME_ZONES } from '../nanp-time-zones';

describe('recipient time zones', () => {
  it('reads the area code from any common US formatting', () => {
    expect(areaCodeOf('+1 (212) 555-0100')).toBe('212');
    expect(areaCodeOf('2125550100')).toBe('212');
    expect(areaCodeOf('+442071234567')).toBeNull();
    expect(areaCodeOf('')).toBeNull();
    expect(areaCodeOf(null)).toBeNull();
  });

  it('maps area codes to their zones', () => {
    expect(areaCodeTimeZones('+12125550100')).toEqual(['America/New_York']);
    expect(areaCodeTimeZones('+13125550100')).toEqual(['America/Chicago']);
    expect(areaCodeTimeZones('+16025550100')).toEqual(['America/Phoenix']);
    expect(areaCodeTimeZones('+18085550100')).toEqual(['Pacific/Honolulu']);
  });

  it('lists every zone of an area code split between zones', () => {
    // 850: Florida panhandle, Central west of the Apalachicola.
    expect(areaCodeTimeZones('+18505550100')).toEqual(
      expect.arrayContaining(['America/Chicago', 'America/New_York']),
    );
  });

  it('returns nothing for an unknown or non-geographic area code', () => {
    expect(areaCodeTimeZones('+15555550100')).toEqual([]);
  });

  it('maps states by code or name, listing each zone of a split state', () => {
    expect(stateTimeZones('ca')).toEqual(['America/Los_Angeles']);
    expect(stateTimeZones('New York')).toEqual(['America/New_York']);
    expect(stateTimeZones('TX')).toEqual(['America/Chicago', 'America/Denver']);
    expect(stateTimeZones('Narnia')).toEqual([]);
    expect(stateTimeZones(undefined)).toEqual([]);
  });

  it('unions both signals without duplicates', () => {
    expect(recipientTimeZones({ phone: '+12135550100', state: 'NY' })).toEqual([
      'America/Los_Angeles',
      'America/New_York',
    ]);
    expect(recipientTimeZones({ phone: '+12125550100', state: 'NY' })).toEqual([
      'America/New_York',
    ]);
  });

  it('only ever names zones the runtime recognises', () => {
    const zones = new Set([
      ...Object.values(US_STATE_TIME_ZONES).flat(),
      ...Object.values(NANP_AREA_CODE_TIME_ZONES).flat(),
    ]);
    for (const zone of zones) {
      expect(() =>
        new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date()),
      ).not.toThrow();
    }
  });
});
