'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-fetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Handshake, DollarSign, Brain, ArrowRight } from 'lucide-react';
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
  'hsl(142 71% 45%)',    // primary green
  'hsl(142 71% 35%)',    // darker green
  'hsl(142 50% 55%)',    // lighter green
  'hsl(160 60% 40%)',    // teal-green
  'hsl(142 40% 30%)',    // muted green
  'hsl(120 40% 50%)',    // warm green
  'hsl(142 71% 60%)',    // bright green
  'hsl(0 72% 51%)',      // destructive (lost)
];

function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className="w-full bg-secondary rounded-full h-1.5">
      <div className={cn('h-1.5 rounded-full transition-all', className)} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

export default function DashboardPage() {
  const [kpis, setKPIs] = useState<KPIs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/analytics/kpis');
        setKPIs(await res.json());
      } catch (error) {
        console.error('Failed to fetch KPIs:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading dashboard...</div>;
  }

  const kpiCards = [
    { label: 'Total Leads', value: kpis?.leads.total || 0, sub: `${kpis?.leads.enriched || 0} enriched (${kpis?.leads.enrichmentRate?.toFixed(1) || 0}%)`, icon: Users, color: 'text-primary' },
    { label: 'Total Deals', value: kpis?.deals.total || 0, sub: `${kpis?.deals.closed || 0} closed (${kpis?.deals.closeRate?.toFixed(1) || 0}%)`, icon: Handshake, color: 'text-primary' },
    { label: 'Deal Value', value: `$${((kpis?.deals.totalValue || 0) / 1000).toFixed(0)}k`, sub: `${kpis?.deals.closed || 0} closed deals`, icon: DollarSign, color: 'text-primary' },
    { label: 'AI Spend', value: `$${(kpis?.ai.totalCost || 0).toFixed(2)}`, sub: `${kpis?.ai.requests || 0} requests`, icon: Brain, color: 'text-muted-foreground' },
  ];

  const pipelineData = (kpis?.deals.stageDistribution || []).map((s) => ({
    name: s.stage.replace('_', ' '),
    count: s.count,
  }));

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">{kpi.label}</span>
                  <Icon size={18} className={kpi.color} />
                </div>
                <div className="text-2xl font-bold text-foreground">{kpi.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PropertyMap />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Deal Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={pipelineData} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'var(--muted-foreground, hsl(240 5% 55%))', fontSize: 12 }} width={90} />
                  <Tooltip
                    contentStyle={{ background: 'var(--card, hsl(240 6% 10%))', border: '1px solid var(--border, hsl(240 4% 20%))', borderRadius: '0.5rem', color: 'var(--foreground, hsl(240 5% 90%))' }}
                    cursor={{ fill: 'var(--muted, hsl(240 4% 16% / 0.5))' }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {pipelineData.map((_, i) => (
                      <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No pipeline data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversion Rates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Lead to Deal', value: kpis?.deals.leadToDealRate || 0, color: 'bg-primary' },
              { label: 'Deal to Closed', value: kpis?.deals.closeRate || 0, color: 'bg-primary/80' },
              { label: 'Message Approval', value: kpis?.communications.approvalRate || 0, color: 'bg-primary/60' },
            ].map((rate) => (
              <div key={rate.label}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-muted-foreground">{rate.label}</span>
                  <span className="text-sm font-medium text-foreground">{rate.value.toFixed(1)}%</span>
                </div>
                <ProgressBar value={rate.value} className={rate.color} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { href: '/leads', label: 'View Leads' },
              { href: '/deals', label: 'View Deals' },
              { href: '/communications', label: 'Communications' },
              { href: '/leads/triage', label: 'Data Triage' },
              { href: '/properties', label: 'Properties' },
            ].map((item) => (
              <Link key={item.href} href={item.href}>
                <Button variant="secondary" className="w-full justify-between" size="sm">
                  {item.label}
                  <ArrowRight size={14} />
                </Button>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
