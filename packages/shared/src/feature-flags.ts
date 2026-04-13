const FLAGS = [
  'OPENSEARCH',
  'CLAUDE',
  'OPENCLAW',
  'PUBLIC_DEAL_PAGES',
  'STRIPE',
] as const;

export type FeatureFlag = (typeof FLAGS)[number];

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return process.env[`FEATURE_${flag}`] === 'true';
}

export function getAllFlags(): Record<FeatureFlag, boolean> {
  const result = {} as Record<FeatureFlag, boolean>;
  for (const flag of FLAGS) {
    result[flag] = isFeatureEnabled(flag);
  }
  return result;
}
