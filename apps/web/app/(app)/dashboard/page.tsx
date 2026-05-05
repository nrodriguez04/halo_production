'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useApiQuery } from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { LoadingState, ErrorState, SkeletonTable } from '@/components/states';
import { useReducedMotion, staggerDelay } from '@/lib/motion';
import {
  Users,
  Handshake,
  DollarSign,
  Brain,
  ArrowRight,
  Megaphone,
  GitCompare,
  Map as MapIcon,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const PropertyMap = dynamic(() => import('@/components/property-map'), { ssr: false });

interface KPIs {
  leads: { total: number; enriched: number; enrichmentRate: number };
  deals: {
    total: number;
    closed: number;
    totalValue: number;
    closeRate: number;
    leadToDealRate: number;
    stageDistribution: Array<{ stage: string; count: number }>;
  };
  communications: { total: number; sent: number; approved: number; approvalRate: number };
  ai: { totalCost: number; requests: number; avgCostPerRequest: number };
}

const STAGE_COLORS = [
  'hsl(142 71% 45%)',
  'hsl(142 71% 35%)',
  'hsl(142 50% 55%)',
  'hsl(160 60% 40%)',
  'hsl(142 40% 30%)',
  'hsl(120 40% 50%)',
  'hsl(142 71% 60%)',
  'hsl(0 72% 51%)',
];

function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={cn('h-full rounded-full transition-[width] duration-slow ease-out-expo', className)}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

const QUICK_ACTIONS = [
  { href: '/leads', label: 'View Leads', icon: Users },
  { href: '/deals', label: 'View Deals', icon: Handshake },
  { href: '/communications', label: 'Communications', icon: MessageSquare },
  { href: '/leads/triage', label: 'Data Triage', icon: GitCompare },
  { href: '/properties', label: 'Properties', icon: MapIcon },
  { href: '/marketing', label: 'Marketing', icon: Megaphone },
];

export default function DashboardPage() {
  const reduced = useReducedMotion();
  const { data: kpis, isPending, isError, error, refetch } = useApiQuery<KPIs>('/analytics/kpis');

  if (isPending) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Dashboard" />
        <LoadingState skeleton>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <SkeletonTable rows={1} cols={2} />
            <SkeletonTable rows={1} cols={2} />
            <SkeletonTable rows={1} cols={2} />
            <SkeletonTable rows={1} cols={2} />
          </div>
        </LoadingState>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Dashboard" />
        <ErrorState
          title="Couldn't load dashboard"
          description={error?.message ?? 'The analytics service did not respond.'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const kpiCards = [
    {
      label: 'Total Leads',
      value: kpis?.leads.total || 0,
      sub: `${kpis?.leads.enriched || 0} enriched (${kpis?.leads.enrichmentRate?.toFixed(1) || 0}%)`,
      icon: Users,
      tint: 'text-primary',
    },
    {
      label: 'Total Deals',
      value: kpis?.deals.total || 0,
      sub: `${kpis?.deals.closed || 0} closed (${kpis?.deals.closeRate?.toFixed(1) || 0}%)`,
      icon: Handshake,
      tint: 'text-primary',
    },
    {
      label: 'Deal Value',
      value: `$${((kpis?.deals.totalValue || 0) / 1000).toFixed(0)}k`,
      sub: `${kpis?.deals.closed || 0} closed deals`,
      icon: DollarSign,
      tint: 'text-emerald-400',
    },
    {
      label: 'AI Spend',
      value: `$${(kpis?.ai.totalCost || 0).toFixed(2)}`,
      sub: `${kpis?.ai.requests || 0} requests`,
      icon: Brain,
      tint: 'text-amber-400',
    },
  ];

  const pipelineData = (kpis?.deals.stageDistribution || []).map((s) => ({
    name: s.stage.replace('_', ' '),
    count: s.count,
  }));

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Dashboard"
        description="Operational overview across leads, deals, communications, and AI spend."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card
              key={kpi.label}
              variant="interactive"
              className="animate-fade-up"
              style={{ animationDelay: staggerDelay(i, reduced) }}
            >
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-caption font-medium uppercase tracking-wider text-muted-foreground">
                    {kpi.label}
                  </span>
                  <Icon size={18} className={kpi.tint} aria-hidden />
                </div>
                <div className="text-h1 font-bold tracking-tight text-foreground">{kpi.value}</div>
                <p className="mt-1 text-caption text-muted-foreground">{kpi.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div
        className="animate-fade-up"
        style={{ animationDelay: staggerDelay(4, reduced) }}
      >
        <PropertyMap />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card
          className="animate-fade-up"
          style={{ animationDelay: staggerDelay(5, reduced) }}
        >
          <CardHeader>
            <CardTitle>Deal Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={pipelineData} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    width={90}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.5rem',
                      color: 'hsl(var(--foreground))',
                    }}
                    cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {pipelineData.map((_, i) => (
                      <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-6 text-center text-body text-muted-foreground">
                No pipeline data yet. Create your first deal to see it here.
              </p>
            )}
          </CardContent>
        </Card>

        <Card
          className="animate-fade-up"
          style={{ animationDelay: staggerDelay(6, reduced) }}
        >
          <CardHeader>
            <CardTitle>Conversion Rates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Lead to Deal', value: kpis?.deals.leadToDealRate || 0, color: 'bg-primary' },
              { label: 'Deal to Closed', value: kpis?.deals.closeRate || 0, color: 'bg-primary/80' },
              {
                label: 'Message Approval',
                value: kpis?.communications.approvalRate || 0,
                color: 'bg-primary/60',
              },
            ].map((rate) => (
              <div key={rate.label}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-body text-muted-foreground">{rate.label}</span>
                  <span className="font-mono text-body font-semibold text-foreground">
                    {rate.value.toFixed(1)}%
                  </span>
                </div>
                <ProgressBar value={rate.value} className={rate.color} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card
          className="animate-fade-up"
          style={{ animationDelay: staggerDelay(7, reduced) }}
        >
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {QUICK_ACTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.href}
                  asChild
                  variant="ghost"
                  className="group w-full justify-between"
                  size="sm"
                >
                  <Link href={item.href}>
                    <span className="flex items-center gap-2">
                      <Icon size={14} aria-hidden />
                      {item.label}
                    </span>
                    <ArrowRight
                      size={14}
                      className="text-muted-foreground transition-transform duration-fast ease-out-expo group-hover:translate-x-0.5 group-hover:text-foreground"
                      aria-hidden
                    />
                  </Link>
                </Button>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
