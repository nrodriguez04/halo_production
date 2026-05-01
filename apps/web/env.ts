import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().min(1),
  NEXT_PUBLIC_DESCOPE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_DESCOPE_FLOW_ID: z.string().default('sign-in'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_DESCOPE_PROJECT_ID: process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID,
    NEXT_PUBLIC_DESCOPE_FLOW_ID: process.env.NEXT_PUBLIC_DESCOPE_FLOW_ID,
  });
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`Environment validation failed:\n${formatted}`);
  }
  return result.data!;
}
