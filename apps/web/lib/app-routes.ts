/**
 * Every page in the app, with a name a person would recognise. The 404
 * page suggests the closest ones; lib/__tests__/app-routes.test.ts fails
 * when a page is added or removed without updating this list.
 *
 * `[param]` marks a dynamic segment. `suggest: false` keeps a route out of
 * suggestions (pages that only make sense with an id, or redirects).
 */
export interface AppRoute {
  path: string;
  label: string;
  /** Only for signed-in users (everything but the public pages). */
  auth: boolean;
  suggest?: boolean;
}

export const APP_ROUTES: AppRoute[] = [
  { path: '/', label: 'Home', auth: false },
  { path: '/sign-in', label: 'Sign in', auth: false },
  { path: '/p/deals/[token]', label: 'Buyer deal page', auth: false, suggest: false },
  { path: '/command-center', label: 'Command Center', auth: true },
  { path: '/dashboard', label: 'Dashboard', auth: true },
  { path: '/leads', label: 'Leads', auth: true },
  { path: '/leads/markets', label: 'Sourcing markets', auth: true },
  { path: '/leads/triage', label: 'Data Triage', auth: true },
  { path: '/deals', label: 'Deals', auth: true },
  { path: '/deals/[id]', label: 'Deal', auth: true, suggest: false },
  { path: '/communications', label: 'Communications', auth: true },
  { path: '/communications/settings', label: 'Communications settings', auth: true },
  { path: '/marketing', label: 'Marketing', auth: true },
  { path: '/buyers', label: 'Buyers', auth: true },
  { path: '/buyers/[id]', label: 'Buyer', auth: true, suggest: false },
  { path: '/buyers/discovery', label: 'Buyer Discovery', auth: true },
  { path: '/properties', label: 'Properties', auth: true },
  { path: '/documents', label: 'Documents', auth: true },
  { path: '/markets', label: 'Market Activation', auth: true },
  { path: '/markets/[state]', label: 'Market', auth: true, suggest: false },
  { path: '/markets/intelligence', label: 'Market Intelligence', auth: true },
  { path: '/templates', label: 'Templates', auth: true },
  { path: '/states', label: 'State rules (moved to Market Activation)', auth: true, suggest: false },
  { path: '/admin', label: 'Control Plane', auth: true },
  { path: '/admin/agents', label: 'Agents', auth: true },
  { path: '/admin/api-spend', label: 'API Spend', auth: true },
  { path: '/admin/automation', label: 'Automation', auth: true },
  { path: '/admin/chaos', label: 'Chaos & DLQ', auth: true },
  { path: '/admin/cost-governance', label: 'Cost Governance', auth: true },
  { path: '/admin/integrations', label: 'Integrations', auth: true },
];

/** Edit distance between two strings (insert, delete, substitute). */
function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

const norm = (p: string) => p.toLowerCase().replace(/\/+$/, '') || '/';

/**
 * The routes a mistyped path most likely meant, best first. A path that
 * shares a segment with a route (`/deal/123` and `/deals`) ranks above one
 * that is merely a few letters away.
 */
export function suggestRoutes(pathname: string, limit = 3): AppRoute[] {
  const target = norm(pathname);
  const segs = target.split('/').filter(Boolean);
  const scored = APP_ROUTES.filter((r) => r.suggest !== false && r.path !== '/')
    .map((r) => {
      const rp = r.path.toLowerCase();
      const rSegs = rp.split('/').filter(Boolean);
      const shared = segs.filter((s) => rSegs.some((x) => x === s || distance(x, s) <= 1)).length;
      const d = distance(target, rp);
      return { r, score: d - shared * 4 };
    })
    .filter(({ r, score }) => score <= Math.max(4, Math.floor(r.path.length / 2)))
    .sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((s) => s.r);
}
