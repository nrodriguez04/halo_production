import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_DAILY_COST_CAP: z.coerce.number().default(5),

  GOOGLE_GEOCODING_API_KEY: z.string().optional(),
  ATTOM_API_KEY: z.string().optional(),
  ATTOM_BASE_URL: z.string().optional(),
  PROPERTYRADAR_API_KEY: z.string().optional(),
  PROPERTYRADAR_BASE_URL: z.string().optional(),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().optional(),
  USE_SENDGRID: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),

  OPENCLAW_GATEWAY_URL: z.string().optional(),
  OPENCLAW_AUTH_TOKEN: z.string().optional(),
  FEATURE_OPENCLAW: z.string().optional(),

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
