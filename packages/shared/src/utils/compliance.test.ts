import {
  HELP_KEYWORDS,
  OPT_OUT_KEYWORDS,
  isHelpKeyword,
  isOptOutKeyword,
  normalizeKeyword,
} from './compliance';

describe('SMS keyword matching', () => {
  it.each(OPT_OUT_KEYWORDS)('treats %s as an opt-out', (keyword) => {
    expect(isOptOutKeyword(keyword)).toBe(true);
    expect(isOptOutKeyword(keyword.toLowerCase())).toBe(true);
  });

  it('covers END, QUIT and REVOKE, which the substring check missed', () => {
    expect(isOptOutKeyword('End')).toBe(true);
    expect(isOptOutKeyword('quit')).toBe(true);
    expect(isOptOutKeyword('REVOKE')).toBe(true);
  });

  it('ignores case, surrounding whitespace and punctuation', () => {
    expect(isOptOutKeyword('  Stop.  ')).toBe(true);
    expect(isOptOutKeyword('STOP!!!')).toBe(true);
    expect(isOptOutKeyword('"stop"')).toBe(true);
    expect(isOptOutKeyword('\nunsubscribe\n')).toBe(true);
  });

  it('accepts the spaced and hyphenated spellings of OPTOUT and STOPALL', () => {
    expect(isOptOutKeyword('Opt out')).toBe(true);
    expect(isOptOutKeyword('opt-out')).toBe(true);
    expect(isOptOutKeyword('Stop all')).toBe(true);
  });

  it('accepts full-width characters after Unicode normalisation', () => {
    expect(isOptOutKeyword('ＳＴＯＰ')).toBe(true);
  });

  it('does not match a keyword inside a longer message', () => {
    expect(isOptOutKeyword("I can't stop by today")).toBe(false);
    expect(isOptOutKeyword('Please cancel my Tuesday appointment')).toBe(false);
    expect(isOptOutKeyword('stop texting me please')).toBe(false);
    expect(isOptOutKeyword('unstoppable')).toBe(false);
    expect(isOptOutKeyword('The end of the street')).toBe(false);
  });

  it('does not match empty or missing bodies', () => {
    expect(isOptOutKeyword('')).toBe(false);
    expect(isOptOutKeyword('   ')).toBe(false);
    expect(isOptOutKeyword(undefined)).toBe(false);
    expect(isOptOutKeyword(null)).toBe(false);
  });

  it.each(HELP_KEYWORDS)('treats %s as a help request', (keyword) => {
    expect(isHelpKeyword(keyword)).toBe(true);
    expect(isHelpKeyword(` ${keyword.toLowerCase()}? `)).toBe(true);
  });

  it('does not treat words that merely contain help or info as a help request', () => {
    expect(isHelpKeyword('information')).toBe(false);
    expect(isHelpKeyword('Can you help me sell my house?')).toBe(false);
    expect(isHelpKeyword('helpful, thanks')).toBe(false);
  });

  it('keeps opt-out and help disjoint', () => {
    for (const keyword of OPT_OUT_KEYWORDS) {
      expect(isHelpKeyword(keyword)).toBe(false);
    }
    for (const keyword of HELP_KEYWORDS) {
      expect(isOptOutKeyword(keyword)).toBe(false);
    }
  });

  it('normalises to a single comparable token', () => {
    expect(normalizeKeyword(' Opt-Out! ')).toBe('OPTOUT');
    expect(normalizeKeyword('stop now')).toBe('STOPNOW');
  });
});
