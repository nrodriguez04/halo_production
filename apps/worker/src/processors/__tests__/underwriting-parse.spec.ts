// `prisma-client` constructs a PrismaClient at import time; the parser under
// test never touches the database, so stub the module out.
jest.mock('../../prisma-client', () => ({ prisma: {} }));

import { UnderwritingProcessor } from '../underwriting.processor';

// parseAnalysis is private but is the function that turns raw model output
// into the numbers an offer is made from, so it is exercised directly.
const parse = (response: string) =>
  (new UnderwritingProcessor() as any).parseAnalysis(response);

describe('UnderwritingProcessor.parseAnalysis', () => {
  it('extracts ARV, repair, MAO and confidence from a well-formed response', () => {
    const result = parse(
      [
        'ARV: $250,000',
        'Repair: $35,500',
        'MAO: $140,000',
        'Confidence: 82',
      ].join('\n'),
    );

    expect(result.arv).toBe(250000);
    expect(result.repairEstimate).toBe(35500);
    expect(result.mao).toBe(140000);
    expect(result.confidence).toBeCloseTo(0.82, 2);
  });

  it('returns nulls rather than NaN when the model omits the figures', () => {
    const result = parse('Not enough comparable sales to underwrite this one.');

    expect(result.arv).toBeNull();
    expect(result.repairEstimate).toBeNull();
    expect(result.mao).toBeNull();
    // Absent confidence falls back to a neutral 0.5.
    expect(result.confidence).toBe(0.5);
  });

  it('preserves the full response as the rationale', () => {
    const response = 'ARV: $200,000\nReasoning: three comps within 0.4 miles.';
    expect(parse(response).rationale).toBe(response);
  });
});
