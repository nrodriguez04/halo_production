import { activeHref, parseOpenGroups, withActiveGroup } from '../nav';

describe('sidebar navigation', () => {
  const hrefs = ['/dashboard', '/leads', '/leads/markets', '/markets', '/markets/intelligence', '/admin', '/admin/agents'];

  it('picks the most specific link a path is on or under', () => {
    expect(activeHref('/leads', hrefs)).toBe('/leads');
    expect(activeHref('/leads/markets', hrefs)).toBe('/leads/markets');
    expect(activeHref('/markets/TX', hrefs)).toBe('/markets');
    expect(activeHref('/markets/intelligence', hrefs)).toBe('/markets/intelligence');
    expect(activeHref('/admin/agents', hrefs)).toBe('/admin/agents');
  });

  it('lights the dashboard and the control plane only on their own path', () => {
    expect(activeHref('/admin', hrefs)).toBe('/admin');
    expect(activeHref('/admin/unknown', hrefs)).toBeNull();
    expect(activeHref('/dashboard/x', hrefs)).toBeNull();
    expect(activeHref('/leadsx', hrefs)).toBeNull();
  });

  it('reads the stored sections, dropping anything it does not know', () => {
    const known = ['acquisitions', 'admin'];
    expect(parseOpenGroups('["admin","gone",3]', known)).toEqual(['admin']);
    expect(parseOpenGroups('[]', known)).toEqual([]);
    expect(parseOpenGroups(null, known)).toBeNull();
    expect(parseOpenGroups('not json', known)).toBeNull();
    expect(parseOpenGroups('{"admin":true}', known)).toBeNull();
  });

  it('always opens the section holding the current page', () => {
    expect(withActiveGroup(['admin'], 'acquisitions')).toEqual(['admin', 'acquisitions']);
    expect(withActiveGroup(['admin'], 'admin')).toEqual(['admin']);
    expect(withActiveGroup([], null)).toEqual([]);
  });
});
