import { IntegrationUnavailableException } from '../integration-unavailable.exception';
import type { MlsConfig, MlsDialect } from './mls.types';

/** Every MLS setting, in the order the Integrations page shows them. */
export const MLS_ENV_KEYS = [
  'MLS_PROVIDER',
  'MLS_BASE_URL',
  'MLS_DATASET',
  'MLS_API_TOKEN',
  'MLS_USERNAME',
  'MLS_PASSWORD',
] as const;

const DIALECTS: readonly string[] = ['bridge', 'reso', 'simplyrets'];

const DEFAULT_BASE_URL: Partial<Record<MlsDialect, string>> = {
  bridge: 'https://api.bridgedataoutput.com/api/v2/OData',
  simplyrets: 'https://api.simplyrets.com',
};

/**
 * Validate one complete set of MLS settings. Throws NOT_CONFIGURED naming
 * the first missing setting, so the Integrations page can say what to fill in.
 */
export function mlsConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MlsConfig {
  const dialect = env.MLS_PROVIDER?.trim().toLowerCase() || 'bridge';
  if (!DIALECTS.includes(dialect)) {
    throw IntegrationUnavailableException.notConfigured(
      'mls',
      'MLS_PROVIDER (bridge | reso | simplyrets)',
    );
  }
  const config: MlsConfig = {
    dialect: dialect as MlsDialect,
    baseUrl:
      env.MLS_BASE_URL?.trim() || DEFAULT_BASE_URL[dialect as MlsDialect] || '',
    dataset: env.MLS_DATASET?.trim() || undefined,
    token: env.MLS_API_TOKEN?.trim() || undefined,
    username: env.MLS_USERNAME?.trim() || undefined,
    password: env.MLS_PASSWORD?.trim() || undefined,
  };
  if (!config.baseUrl) {
    throw IntegrationUnavailableException.notConfigured('mls', 'MLS_BASE_URL');
  }
  if (config.dialect === 'bridge' && !config.dataset) {
    throw IntegrationUnavailableException.notConfigured('mls', 'MLS_DATASET');
  }
  if (
    (config.dialect === 'bridge' || config.dialect === 'reso') &&
    !config.token
  ) {
    throw IntegrationUnavailableException.notConfigured('mls', 'MLS_API_TOKEN');
  }
  if (
    config.dialect === 'simplyrets' &&
    (!config.username || !config.password)
  ) {
    throw IntegrationUnavailableException.notConfigured(
      'mls',
      'MLS_USERNAME / MLS_PASSWORD',
    );
  }
  return config;
}

/**
 * Settings saved on the Integrations page win over env, like the other
 * providers. `resolve` is IntegrationSecretsService.resolve for the `mls`
 * provider; it already falls back to env for anything not in the store.
 */
export async function resolveMlsConfig(
  resolve: (keyName: string) => Promise<string | null>,
): Promise<MlsConfig> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of MLS_ENV_KEYS) {
    const value = await resolve(key);
    if (value) env[key] = value;
  }
  return mlsConfigFromEnv(env);
}
