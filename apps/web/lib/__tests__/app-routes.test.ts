import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { APP_ROUTES, suggestRoutes } from '../app-routes';

/** Every page.tsx under app/, as a URL path (route groups dropped). */
function pagesOnDisk(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      const seg = /^\(.+\)$/.test(name) ? '' : `/${name}`;
      out.push(...pagesOnDisk(full, prefix + seg));
    } else if (name === 'page.tsx') {
      out.push(prefix || '/');
    }
  }
  return out;
}

describe('APP_ROUTES', () => {
  it('lists exactly the pages in app/', () => {
    const disk = pagesOnDisk(join(__dirname, '..', '..', 'app')).sort();
    expect(APP_ROUTES.map((r) => r.path).sort()).toEqual(disk);
  });
});

describe('suggestRoutes', () => {
  it('finds the page a typo meant', () => {
    expect(suggestRoutes('/dashbord')[0].path).toBe('/dashboard');
    expect(suggestRoutes('/deal')[0].path).toBe('/deals');
    expect(suggestRoutes('/admin/agent')[0].path).toBe('/admin/agents');
    expect(suggestRoutes('/market/intelligance')[0].path).toBe('/markets/intelligence');
  });

  it('never suggests pages that need an id, and stays quiet for nonsense', () => {
    expect(suggestRoutes('/deals/abc/edit').every((r) => !r.path.includes('['))).toBe(true);
    expect(suggestRoutes('/zzzzzzzzzzzzzzzzzzzzzz')).toEqual([]);
  });
});
