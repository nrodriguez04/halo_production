// Reconciliation utilities for canonicalizing multi-source data

export interface SourceField {
  value: any;
  source: string;
  trustWeight: number;
  freshness: number; // timestamp or days since
}

export interface ReconciliationResult {
  canonical: Record<string, any>;
  confidence: number;
  sources: string[];
  fieldConfidence: Record<string, number>;
}

/**
 * Reconcile multiple source fields into a canonical value
 * Uses trust weight and freshness to determine best value
 */
export function reconcileField(
  fields: SourceField[],
  fieldName: string
): { value: any; confidence: number; source: string } {
  if (fields.length === 0) {
    return { value: null, confidence: 0, source: '' };
  }

  if (fields.length === 1) {
    return {
      value: fields[0].value,
      confidence: fields[0].trustWeight,
      source: fields[0].source,
    };
  }

  // Calculate weighted score: trustWeight * freshness
  const scored = fields.map((field) => ({
    ...field,
    score: field.trustWeight * field.freshness,
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const totalScore = scored.reduce((sum, f) => sum + f.score, 0);
  const confidence = best.score / totalScore;

  return {
    value: best.value,
    confidence: Math.min(confidence, 1.0),
    source: best.source,
  };
}

/**
 * Reconcile entire property record from multiple sources
 */
export function reconcileProperty(
  sourceData: Record<string, SourceField[]>
): ReconciliationResult {
  const canonical: Record<string, any> = {};
  const fieldConfidence: Record<string, number> = {};
  const sources: Set<string> = new Set();

  for (const [fieldName, fields] of Object.entries(sourceData)) {
    const reconciled = reconcileField(fields, fieldName);
    canonical[fieldName] = reconciled.value;
    fieldConfidence[fieldName] = reconciled.confidence;
    if (reconciled.source) {
      sources.add(reconciled.source);
    }
  }

  // Overall confidence is average of field confidences
  const confidenceValues = Object.values(fieldConfidence);
  const overallConfidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce((sum, c) => sum + c, 0) / confidenceValues.length
      : 0;

  return {
    canonical,
    confidence: overallConfidence,
    sources: Array.from(sources),
    fieldConfidence,
  };
}

/**
 * Calculate similarity score between two strings (0-1)
 * Uses simple Levenshtein-like approach
 */
export function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  // Simple character overlap ratio
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  const matches = shorter
    .split('')
    .filter((char) => longer.includes(char)).length;

  return matches / longer.length;
}

/**
 * Normalize address for deduplication
 */
export function normalizeAddress(
  address: string,
  city?: string,
  state?: string,
  zip?: string
): string {
  const parts = [
    address?.toLowerCase().trim().replace(/[^a-z0-9\s]/g, ''),
    city?.toLowerCase().trim(),
    state?.toLowerCase().trim(),
    zip?.replace(/\D/g, '').slice(0, 5),
  ]
    .filter(Boolean)
    .join(' ');

  return parts.replace(/\s+/g, ' ').trim();
}
