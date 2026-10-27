/**
 * Sidebar navigation state that does not depend on rendering: which link a
 * path belongs to, and which collapsible sections are open.
 */

/** Links that light up only on their exact path, not on the pages under them. */
const EXACT_ONLY = ['/dashboard', '/admin'];

/**
 * The link a path belongs to: the most specific one it is on or under, so
 * /markets/intelligence is Market Intelligence and not also Market Activation.
 */
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const on = pathname === href || (!EXACT_ONLY.includes(href) && pathname.startsWith(`${href}/`));
    if (on && (!best || href.length > best.length)) best = href;
  }
  return best;
}

export const NAV_OPEN_KEY = 'halo.nav.open';

/** The sections a person left open, from storage; nothing usable gives null. */
export function parseOpenGroups(raw: string | null, known: readonly string[]): string[] | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    return value.filter((k): k is string => typeof k === 'string' && known.includes(k));
  } catch {
    return null;
  }
}

/** The open sections: what a person chose, plus the one holding the current page. */
export function withActiveGroup(open: readonly string[], activeGroup: string | null): string[] {
  return activeGroup && !open.includes(activeGroup) ? [...open, activeGroup] : [...open];
}
