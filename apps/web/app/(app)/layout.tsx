'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useDescope } from '@descope/nextjs-sdk/client';
import {
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  DollarSign,
  FileSignature,
  FileText,
  Filter,
  FolderOpen,
  GitCompare,
  Globe,
  Handshake,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Map,
  Megaphone,
  MessageSquare,
  Plug,
  Radar,
  Scale,
  Send,
  Settings,
  Shield,
  Sparkles,
  Target,
  UserCheck,
  Users,
  UserSearch,
  Wallet,
  Zap,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { prefetchApi, useQueryClient } from '@/lib/api-query';
import { Logo } from '@/components/brand/logo';
import { NAV_OPEN_KEY, activeHref, parseOpenGroups, withActiveGroup } from '@/lib/nav';

// Nav link → list of {path, params?} entries that the destination page will
// useApiQuery for. We fire these on mouseEnter so by the time the user clicks,
// the destination page paints with cached data. Cache keys here MUST match
// the keys built inside each page's useApiQuery call (path + params object),
// otherwise the prefetch is wasted.
type Prefetch = { path: string; params?: Record<string, string | number> };
const ROUTE_PREFETCH: Record<string, Prefetch[]> = {
  '/command-center': [
    { path: '/command-center/attention' },
    { path: '/command-center/portfolio' },
    { path: '/command-center/opportunities', params: { limit: 15 } },
  ],
  '/dashboard': [{ path: '/analytics/kpis' }],
  '/markets': [{ path: '/markets' }],
  '/templates': [{ path: '/templates' }],
  '/markets/intelligence': [{ path: '/market-intelligence/recommendations', params: { limit: 12 } }],
  '/deals': [{ path: '/deals' }],
  '/communications': [
    { path: '/communications/messages' },
    { path: '/communications/approval-queue' },
  ],
  '/marketing': [{ path: '/deals' }],
  '/buyers': [{ path: '/buyers' }],
  '/admin': [{ path: '/health/ready' }, { path: '/control-plane' }],
  '/admin/automation': [
    { path: '/analytics/automation/overview' },
    { path: '/analytics/automation/roi' },
    { path: '/analytics/automation/by-workflow' },
    { path: '/analytics/automation/agent-cards' },
  ],
  '/admin/agents': [{ path: '/agent/runs', params: { limit: 100 } }, { path: '/control-plane' }],
  '/admin/api-spend': [
    { path: '/analytics/api-spend' },
    { path: '/analytics/api-spend/by-provider' },
    { path: '/analytics/api-spend/daily-trend', params: { days: 30 } },
    { path: '/health/ready' },
  ],
  '/admin/cost-governance': [
    { path: '/cost-governance/buckets' },
    { path: '/cost-governance/decisions/pending' },
    { path: '/cost-governance/events', params: { limit: 100 } },
  ],
  '/leads/markets': [{ path: '/sourcing/markets' }, { path: '/sourcing/runs', params: { limit: 20 } }],
  '/documents': [{ path: '/documents' }, { path: '/documents/checklist' }],
  '/admin/integrations': [{ path: '/integration-secrets' }],
  '/admin/chaos': [{ path: '/admin/chaos/status' }, { path: '/admin/dlq' }],
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

type NavGroup = {
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
};

/** Always shown: the pages used every day. */
const topItems: NavItem[] = [
  { href: '/command-center', label: 'Command Center', icon: ListChecks },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/communications', label: 'Communications', icon: MessageSquare },
];

/** Everything else, in sections that open and close. */
const navGroups: NavGroup[] = [
  {
    key: 'acquisitions',
    label: 'Acquisitions',
    icon: Target,
    items: [
      { href: '/leads', label: 'Leads', icon: Users },
      { href: '/leads/markets', label: 'Sourcing', icon: Radar },
      { href: '/leads/triage', label: 'Data Triage', icon: GitCompare },
      { href: '/properties', label: 'Properties', icon: Map },
      { href: '/deals', label: 'Deals', icon: Handshake },
    ],
  },
  {
    key: 'dispositions',
    label: 'Dispositions',
    icon: Send,
    items: [
      { href: '/buyers', label: 'Buyers', icon: UserCheck },
      { href: '/buyers/discovery', label: 'Buyer Discovery', icon: UserSearch },
      { href: '/marketing', label: 'Marketing', icon: Megaphone },
    ],
  },
  {
    key: 'markets',
    label: 'Markets & Reports',
    icon: Globe,
    items: [
      { href: '/markets', label: 'Market Activation', icon: Scale },
      { href: '/markets/intelligence', label: 'Market Intelligence', icon: Compass },
      { href: '/funnel', label: 'Conversion Funnel', icon: Filter },
    ],
  },
  {
    key: 'paperwork',
    label: 'Paperwork',
    icon: FolderOpen,
    items: [
      { href: '/documents', label: 'Documents', icon: FileText },
      { href: '/templates', label: 'Templates', icon: FileSignature },
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    icon: Settings,
    items: [
      { href: '/admin', label: 'Control Plane', icon: Shield },
      { href: '/admin/automation', label: 'Automation', icon: Bot },
      { href: '/admin/agents', label: 'Agents', icon: Sparkles },
      { href: '/admin/api-spend', label: 'API Spend', icon: DollarSign },
      { href: '/admin/cost-governance', label: 'Cost Governance', icon: Wallet },
      { href: '/admin/integrations', label: 'Integrations', icon: Plug },
      { href: '/admin/chaos', label: 'Chaos & DLQ', icon: Zap },
    ],
  },
];

const ALL_HREFS = [...topItems, ...navGroups.flatMap((g) => g.items)].map((i) => i.href);
const GROUP_KEYS = navGroups.map((g) => g.key);

const ROW_FOCUS =
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card';

function NavLink({
  item,
  collapsed,
  active,
  onPrefetch,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  onPrefetch: (href: string) => void;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onMouseEnter={() => onPrefetch(item.href)}
      onFocus={() => onPrefetch(item.href)}
      className={cn(
        'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
        'transition-[background-color,color,padding] duration-fast ease-out-expo',
        ROW_FOCUS,
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        collapsed && 'justify-center px-2',
      )}
      aria-current={active ? 'page' : undefined}
    >
      {/* Active indicator */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary',
          'transition-[transform,opacity] duration-base ease-out-expo',
          active ? 'opacity-100' : 'scale-y-50 opacity-0',
        )}
      />
      <Icon
        size={18}
        className={cn(
          'shrink-0 transition-transform duration-fast ease-out-expo',
          active ? 'text-primary' : 'group-hover:scale-110',
        )}
        aria-hidden
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }
  return link;
}

/**
 * One section of the sidebar. Expanded, it is a header that opens and closes
 * its links. On the icon rail it is a single icon; choosing it widens the
 * sidebar with the section open.
 */
function NavSection({
  group,
  collapsed,
  open,
  active,
  onToggle,
  onRailOpen,
  onPrefetch,
}: {
  group: NavGroup;
  collapsed: boolean;
  open: boolean;
  active: string | null;
  onToggle: () => void;
  onRailOpen: () => void;
  onPrefetch: (href: string) => void;
}) {
  const Icon = group.icon;
  const holdsActive = group.items.some((i) => i.href === active);

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onRailOpen}
            aria-label={`${group.label}: show its pages`}
            className={cn(
              'relative flex w-full items-center justify-center rounded-md p-2',
              'transition-colors duration-fast ease-out-expo',
              ROW_FOCUS,
              holdsActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon size={18} aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{group.label}</TooltipContent>
      </Tooltip>
    );
  }

  const panelId = `nav-section-${group.key}`;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
          'transition-colors duration-fast ease-out-expo',
          ROW_FOCUS,
          holdsActive && !open ? 'text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <Icon size={18} className="shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">{group.label}</span>
        {holdsActive && !open && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />}
        <ChevronDown
          size={14}
          className={cn('shrink-0 transition-transform duration-base ease-out-expo', open ? 'rotate-0' : '-rotate-90')}
          aria-hidden
        />
      </button>
      <div
        id={panelId}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-base ease-out-expo',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="ml-[1.3rem] mt-0.5 space-y-0.5 border-l border-border pl-1.5">
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} collapsed={false} active={item.href === active} onPrefetch={onPrefetch} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const sdk = useDescope();
  const queryClient = useQueryClient();

  const handleSignOut = useCallback(async () => {
    try {
      await sdk.logout();
    } catch {
      // ignore errors
    } finally {
      window.location.href = '/';
    }
  }, [sdk]);

  const handlePrefetch = useCallback(
    (href: string) => {
      const list = ROUTE_PREFETCH[href];
      if (!list) return;
      for (const entry of list) {
        void prefetchApi(queryClient, entry.path, entry.params);
      }
    },
    [queryClient],
  );

  const active = useMemo(() => activeHref(pathname, ALL_HREFS), [pathname]);
  const activeGroup = navGroups.find((g) => g.items.some((i) => i.href === active))?.key ?? null;

  // Only the section holding the current page starts open; after that, what
  // a person opens or closes is remembered in this browser.
  const [openGroups, setOpenGroups] = useState<string[]>(() => withActiveGroup([], activeGroup));
  useEffect(() => {
    let stored: string[] | null = null;
    try {
      stored = parseOpenGroups(localStorage.getItem(NAV_OPEN_KEY), GROUP_KEYS);
    } catch {
      // Storage blocked: the default is fine.
    }
    if (stored) setOpenGroups(withActiveGroup(stored, activeGroup));
    // Read once, on load; the next effect follows the page after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (activeGroup) setOpenGroups((now) => withActiveGroup(now, activeGroup));
  }, [activeGroup]);

  const saveOpen = (next: string[]) => {
    setOpenGroups(next);
    try {
      localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(next));
    } catch {
      // Storage blocked: the choice lasts until the page reloads.
    }
  };
  const toggleGroup = (key: string) =>
    saveOpen(openGroups.includes(key) ? openGroups.filter((k) => k !== key) : [...openGroups, key]);
  const openFromRail = (key: string) => {
    setCollapsed(false);
    saveOpen(withActiveGroup(openGroups, key));
  };

  return (
    <div className="flex h-screen bg-background">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <aside
        className={cn(
          'flex flex-col border-r border-border bg-card shadow-2',
          'transition-[width] duration-base ease-out-expo',
          collapsed ? 'w-16' : 'w-60',
        )}
        aria-label="Primary navigation"
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-3">
          {!collapsed && (
            <Link
              href="/dashboard"
              aria-label="Hålo dashboard"
              className="flex items-center gap-2 rounded-md px-1 py-0.5 transition-opacity duration-fast hover:opacity-80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              <Logo height={26} priority />
            </Link>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCollapsed(!collapsed)}
                className={cn(
                  'rounded-md p-1.5 text-muted-foreground',
                  'transition-colors duration-fast hover:bg-muted hover:text-foreground',
                  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                )}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!collapsed}
              >
                {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            </TooltipContent>
          </Tooltip>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <div className="space-y-0.5">
            {topItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                collapsed={collapsed}
                active={item.href === active}
                onPrefetch={handlePrefetch}
              />
            ))}
          </div>
          <div className="mt-2 space-y-0.5 border-t border-border pt-2">
            {navGroups.map((group) => (
              <NavSection
                key={group.key}
                group={group}
                collapsed={collapsed}
                open={openGroups.includes(group.key)}
                active={active}
                onToggle={() => toggleGroup(group.key)}
                onRailOpen={() => openFromRail(group.key)}
                onPrefetch={handlePrefetch}
              />
            ))}
          </div>
        </nav>

        <div className="border-t border-border p-2">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSignOut}
                  className={cn(
                    'flex w-full items-center justify-center rounded-md p-2 text-muted-foreground',
                    'transition-colors duration-fast hover:bg-destructive/10 hover:text-destructive',
                    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                  )}
                  aria-label="Sign out"
                >
                  <LogOut size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign out</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={handleSignOut}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground',
                'transition-colors duration-fast hover:bg-destructive/10 hover:text-destructive',
                'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
              )}
            >
              <LogOut size={18} aria-hidden />
              Sign out
            </button>
          )}
        </div>
      </aside>

      <main id="main-content" className="flex-1 overflow-y-auto" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
