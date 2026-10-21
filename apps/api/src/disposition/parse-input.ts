import type { z } from 'zod';

/** Every key required, all the way down (arrays and nested objects too). */
export type Parsed<T> = T extends Date
  ? T
  : T extends Array<infer U>
    ? Array<Parsed<U>>
    : T extends object
      ? { [K in keyof T]-?: Parsed<T[K]> }
      : T;

/**
 * Parse a request body. The api compiles with strictNullChecks off, which
 * makes every zod-inferred key optional at every depth; the schema has
 * already enforced which ones are present, so the result is typed as such.
 * Field names and value types are still checked against the service.
 */
export function input<S extends z.ZodTypeAny>(
  schema: S,
  body: unknown,
): Parsed<z.infer<S>> {
  return schema.parse(body) as Parsed<z.infer<S>>;
}
