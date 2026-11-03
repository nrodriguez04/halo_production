import { FLAG_LABEL, underwriteDeal, type UnderwritingInput } from '../disposition/underwriting';
import { decisionSentence, summaryOf } from './land-underwriting';
import type { ResidentialSubtype } from './taxonomy';
import { confidenceLevel, roundRange, usd, type AssetUnderwriting, type BuyerDemand } from './underwriting-types';

/**
 * Residential underwriting in the shared shape. The arithmetic is the
 * existing ARV model (disposition/underwriting.ts), unchanged and still
 * the source of the MAO; this only reports it the way land and commercial
 * deals are reported.
 */
export function underwriteResidential(
  input: UnderwritingInput & { subtype: ResidentialSubtype | null; buyerDemand: BuyerDemand },
): AssetUnderwriting {
  const u = underwriteDeal(input);
  const missing = u.flags
    .filter((f) => ['no_arv', 'no_repairs', 'no_confidence'].includes(f))
    .map((f) => `${FLAG_LABEL[f][0].toUpperCase()}${FLAG_LABEL[f].slice(1)}.`);
  const risks = u.flags
    .filter((f) => !['no_arv', 'no_repairs', 'no_confidence'].includes(f))
    .map((f) => `${FLAG_LABEL[f][0].toUpperCase()}${FLAG_LABEL[f].slice(1)}.`);
  const decision: AssetUnderwriting['decision'] = u.recommendation === 'offer' ? 'pursue' : u.recommendation === 'pass' ? 'pass' : 'review';
  const valuation = input.arv && input.arv > 0 ? roundRange({ low: input.arv * 0.9, mid: input.arv, high: input.arv }) : null;
  return {
    assetClass: 'residential',
    subtype: input.subtype,
    strategy: 'residential_arv',
    valuation,
    approaches: [
      {
        key: 'arv',
        label: 'After-repair value',
        range: valuation,
        unitValue: null,
        unit: null,
        evidenceCount: valuation ? 1 : 0,
        note: valuation ? 'The ARV on record, with a 10% lower case.' : 'No ARV on record.',
      },
    ],
    evidence: valuation ? [{ kind: 'fact', text: `ARV ${usd(input.arv!)}; repairs ${input.repairEstimate != null ? usd(input.repairEstimate) : 'not estimated'}.` }] : [],
    confidence: confidenceLevel(input.confidence ?? 0),
    missing,
    risks,
    assumptions: [`Investors pay at most ARV x ${input.investorRatio ?? 0.7} less repairs.`],
    offerRange: u.offerRange,
    targetFee: input.assignmentFee,
    expectedBuyerPrice: u.expectedBuyerPrice,
    expectedNet: u.expectedNet,
    buyerDemand: input.buyerDemand,
    decision,
    summary: summaryOf(decision, valuation, u.offerRange, missing, risks),
    explanation: [...u.rationale, input.buyerDemand.detail, decisionSentence(decision, missing, risks)],
    sensitivity: null,
  };
}
