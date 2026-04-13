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
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/leads/triage', label: 'Data Triage', icon: GitCompare },
  { href: '/deals', label: 'Deals', icon: Handshake },
  { href: '/communications', label: 'Communications', icon: MessageSquare },
  { href: '/marketing', label: 'Marketing', icon: Megaphone },
  { href: '/buyers', label: 'Buyers', icon: UserCheck },
  { href: '/properties', label: 'Properties', icon: Map },
];

const adminItems = [
  { href: '/admin', label: 'Control Plane', icon: Shield },
  { href: '/admin/integrations', label: 'Integrations', icon: Plug },
  { href: '/admin/chaos', label: 'Chaos & DLQ', icon: Zap },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const sdk = useDescope();

  const handleSignOut = useCallback(async () => {
    try {
      await sdk.logout();
    } catch {
      // ignore errors
    } finally {
      window.location.href = '/';
    }
  }, [sdk]);

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <div className="flex h-screen bg-background">
      <aside
        className={cn(
          'flex flex-col border-r border-border bg-card transition-all duration-200',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          {!collapsed && (
            <Link href="/dashboard" className="text-lg font-bold text-primary">
              Hālo
            </Link>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          <div className="mb-2">
            {!collapsed && (
              <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Main
              </p>
            )}
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={18} className={active ? 'text-primary' : ''} />
                  {!collapsed && item.label}
                </Link>
              );
            })}
          </div>

          <div className="border-t border-border pt-2">
            {!collapsed && (
              <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Admin
              </p>
            )}
            {adminItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={18} className={active ? 'text-primary' : ''} />
                  {!collapsed && item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-border p-2">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title={collapsed ? 'Sign out' : undefined}
          >
            <LogOut size={18} />
            {!collapsed && 'Sign out'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
