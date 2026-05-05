'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useCallback } from 'react';
import { useDescope } from '@descope/nextjs-sdk/client';
import {
  LayoutDashboard,
  Users,
  GitCompare,
  Handshake,
  MessageSquare,
  Shield,
  Plug,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Map,
  Megaphone,
  UserCheck,
  Zap,
  Bot,
  DollarSign,
  Wallet,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { prefetchApi, useQueryClient } from '@/lib/api-query';

// Nav link → list of {path, params?} entries that the destination page will
// useApiQuery for. We fire these on mouseEnter so by the time the user clicks,
// the destination page paints with cached data. Cache keys here MUST match
// the keys built inside each page's useApiQuery call (path + params object),
// otherwise the prefetch is wasted.
type Prefetch = { path: string; params?: Record<string, string | number> };
const ROUTE_PREFETCH: Record<string, Prefetch[]> = {
  '/dashboard': [{ path: '/analytics/kpis' }],
  '/deals': [{ path: '/deals' }],
  '/communications': [
    { path: '/communications/messages' },
    { path: '/communications/approval-queue' },
  ],
  '/marketing': [{ path: '/deals' }],
  '/buyers': [{ path: '/buyers' }],
  '/admin': [{ path: '/health/ready' }, { path: '/control-plane' }],
  '/admin/openclaw': [
    { path: '/analytics/automation/overview' },
    { path: '/analytics/automation/roi' },
    { path: '/analytics/automation/by-workflow' },
    { path: '/analytics/automation/agent-cards' },
  ],
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
  '/admin/integrations': [{ path: '/integration-secrets' }],
  '/admin/chaos': [{ path: '/admin/chaos/status' }, { path: '/admin/dlq' }],
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/leads/triage', label: 'Data Triage', icon: GitCompare },
  { href: '/deals', label: 'Deals', icon: Handshake },
  { href: '/communications', label: 'Communications', icon: MessageSquare },
  { href: '/marketing', label: 'Marketing', icon: Megaphone },
  { href: '/buyers', label: 'Buyers', icon: UserCheck },
  { href: '/properties', label: 'Properties', icon: Map },
];

const adminItems: NavItem[] = [
  { href: '/admin', label: 'Control Plane', icon: Shield },
  { href: '/admin/openclaw', label: 'OpenClaw', icon: Bot },
  { href: '/admin/api-spend', label: 'API Spend', icon: DollarSign },
  { href: '/admin/cost-governance', label: 'Cost Governance', icon: Wallet },
  { href: '/admin/integrations', label: 'Integrations', icon: Plug },
  { href: '/admin/chaos', label: 'Chaos & DLQ', icon: Zap },
];

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
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
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

  const isActive = (href: string) => {
    if (href === '/dashboard' || href === '/admin') return pathname === href;
    return pathname.startsWith(href);
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
              className="flex items-center gap-2 rounded-md px-1 py-0.5 text-h3 font-bold text-primary transition-colors duration-fast hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              Hālo
            </Link>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCollapsed(!collapsed)}
                className={cn(
                  'rounded-md p-1.5 text-muted-foreground',
                  'transition-colors duration-fast hover:bg-muted hover:text-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
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

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          <div className="mb-3">
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                Main
              </p>
            )}
            <div className="space-y-0.5">
              {navItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  active={isActive(item.href)}
                  onPrefetch={handlePrefetch}
                />
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-3">
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                Admin
              </p>
            )}
            <div className="space-y-0.5">
              {adminItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  active={isActive(item.href)}
                  onPrefetch={handlePrefetch}
                />
              ))}
            </div>
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
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
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
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
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
