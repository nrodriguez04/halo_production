import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  PORT: z.coerce.number().default(3001),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  DESCOPE_PROJECT_ID: z.string().min(1),
  DESCOPE_MANAGEMENT_KEY: z.string().optional(),

  SECRETS_ENCRYPTION_KEY: z.string().min(32).optional(),

  TWILIO_AUTH_TOKEN: z.string().optional(),
  DOCUSIGN_CONNECT_SECRET: z.string().optional(),

  ATTOM_API_KEY: z.string().optional(),
  ATTOM_BASE_URL: z.string().optional(),
  GOOGLE_GEOCODING_API_KEY: z.string().optional(),
  RENTCAST_API_KEY: z.string().optional(),
  PROPERTYRADAR_API_KEY: z.string().optional(),
  PROPERTYRADAR_BASE_URL: z.string().optional(),

  // Cost-governance back-compat: declared so legacy code paths that read
  // process.env.OPENAI_DAILY_COST_CAP via parseFloat(...) get a typed,
  // validated default. Authoritative caps live in
  // `integration_budget_buckets`; this var is a fallback only.
  OPENAI_DAILY_COST_CAP: z.coerce.number().default(2),
  COST_CONTROL_MANUAL_APPROVAL_USD: z.coerce.number().default(5),
  COST_CONTROL_IDEMPOTENCY_WINDOW_SEC: z.coerce.number().default(60),
  SKIP_TRACE_PROVIDER: z.enum(['batch', 'stub', 'propertyradar']).default('batch'),
  BATCH_SKIPTRACE_API_KEY: z.string().optional(),
  BATCH_SKIPTRACE_BASE_URL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  INTERNAL_API_TOKEN: z.string().optional(),

  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),

  DOCUSIGN_BASE_URL: z.string().optional(),
  DOCUSIGN_CLIENT_ID: z.string().optional(),
  DOCUSIGN_CLIENT_SECRET: z.string().optional(),
  DOCUSIGN_ACCOUNT_ID: z.string().optional(),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  _env = result.data;
  return _env;
}

export function env(): Env {
  if (!_env) return validateEnv();
  return _env;
}
