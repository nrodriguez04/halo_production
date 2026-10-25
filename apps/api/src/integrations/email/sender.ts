/**
 * The sender as `{ email, name }`. A configured `Name <address>` keeps its
 * name; a bare address gets the brand name (MESSAGING_BRAND_NAME), so the
 * inbox shows "Halo Acquisitions" rather than the address. SendGrid takes
 * the name only as its own field: the address alone used to reach it.
 */
export function senderOf(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): { email: string; name?: string } {
  const m = value.trim().match(/^"?([^"<]*?)"?\s*<([^<>\s]+)>$/);
  const email = (m ? m[2] : value).trim();
  const name = (m?.[1] ?? '').trim() || env.MESSAGING_BRAND_NAME?.trim();
  return name ? { email, name } : { email };
}
