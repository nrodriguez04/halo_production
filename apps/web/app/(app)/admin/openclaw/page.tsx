'use client';

import { useState } from 'react';
import { useApiQuery, useQueryClient } from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  RefreshCw,
  Bot,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Loader2,
  Zap,
  TrendingUp,
} from 'lucide-react';

/* ── type definitions ──────────────────────────────────────────────── */

interface Overview {
  runs: {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    awaitingApproval: number;
    running: number;
  };
  drafts: number;
  approvedMessages: number;
  approvalRate: number;
  period: { start: string; end: string };
}

interface Costs {
  aiSpend: number;
  messagingSpend: number;
  toolSpend: number;
  otherSpend: number;
  totalSpend: number;
  runCount: number;
  avgCostPerRun: number;
}

interface Outcomes {
  estimatedValue: number;
  realizedValue: number;
  agentDraftsSent: number;
  inboundReplies: number;
}

interface ROI {
  costs: Costs;
  outcomes: Outcomes;
  dealEconomics: {
    totalGrossRevenue: number;
    totalNetProfit: number;
    avgRoi: number | null;
  };
  derivedMetrics: {
    costPerReply: number | null;
    totalAutomationSpend: number;
    estimatedValue: number;
    realizedValue: number;
  };
}

interface WorkflowRow {
  workflowName: string;
  runCount: number;
  totalAiCost: number;
  totalMsgCost: number;
  totalToolCost: number;
  estimatedValue: number;
  realizedValue: number;
}

interface AgentCard {
  agentName: string;
  totalRuns: number;
  completed: number;
  failed: number;
  running: number;
  queued: number;
  awaitingApproval: number;
  successRate: number | null;
  totalSpend: number;
  aiCost: number;
  msgCost: number;
  toolCost: number;
  estimatedValue: number;
  realizedValue: number;
  lastRun: {
    id: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
  } | null;
}

interface RunRow {
  id: string;
  source: string;
  agentName: string | null;
  workflowName: string | null;
  entityType: string | null;
  entityId: string | null;
  status: string;
  triggerType: string;
  aiCostUsd: number | null;
  messageCostUsd: number | null;
  createdAt: string;
  completedAt: string | null;
  messages?: { id: string; status: string; channel: string }[];
}

/* ── helpers ────────────────────────────────────────────────────── */

const usd = (n: number | null | undefined) =>
  n != null ? `$${n.toFixed(2)}` : '—';

const pct = (n: number | null | undefined) =>
  n != null ? `${n.toFixed(1)}%` : '—';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const statusConfig: Record<
  string,
  { label: string; variant: 'success' | 'destructive' | 'warning' | 'info' | 'secondary'; icon: typeof CheckCircle2 }
> = {
  COMPLETED: { label: 'Completed', variant: 'success', icon: CheckCircle2 },
  FAILED: { label: 'Failed', variant: 'destructive', icon: XCircle },
  RUNNING: { label: 'Running', variant: 'info', icon: Activity },
  QUEUED: { label: 'Queued', variant: 'secondary', icon: Clock },
  CANCELLED: { label: 'Cancelled', variant: 'secondary', icon: XCircle },
  AWAITING_APPROVAL: { label: 'Pending Approval', variant: 'warning', icon: AlertTriangle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || statusConfig.QUEUED;
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="gap-1">
      <Icon size={12} />
      {cfg.label}
    </Badge>
  );
}

/* ── stat card ─────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Bot;
  trend?: 'up' | 'down' | null;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && (
              <p className="text-xs text-muted-foreground">{sub}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {trend === 'up' && (
              <ArrowUpRight size={16} className="text-primary" />
            )}
            {trend === 'down' && (
              <ArrowDownRight size={16} className="text-destructive" />
            )}
            <div className="rounded-md bg-primary/10 p-2">
              <Icon size={18} className="text-primary" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── bar (pure CSS) ───────────────────────────────────────────── */

function DistributionBar({
  items,
}: {
  items: { label: string; value: number; color: string }[];
}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) {
    return <div className="h-3 rounded-full bg-secondary" />;
  }
  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
        {items.map((item) => {
          const w = (item.value / total) * 100;
          if (w === 0) return null;
          return (
            <div
              key={item.label}
              className={cn('h-full transition-all', item.color)}
              style={{ width: `${w}%` }}
              title={`${item.label}: ${item.value}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('inline-block h-2 w-2 rounded-full', item.color)} />
            {item.label} ({item.value})
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── mini bar for agent card ─────────────────────────────────── */

function MiniBar({ items }: { items: { value: number; color: string }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return <div className="h-1.5 rounded-full bg-secondary" />;
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-secondary">
      {items.map((item, idx) => {
        const w = (item.value / total) * 100;
        if (w === 0) return null;
        return (
          <div
            key={idx}
            className={cn('h-full', item.color)}
            style={{ width: `${w}%` }}
          />
        );
      })}
    </div>
  );
}

/* ── agent card ───────────────────────────────────────────────── */

function AgentCardComponent({ agent }: { agent: AgentCard }) {
  const isActive = agent.running > 0;
  const hasQueued = agent.queued > 0 || agent.awaitingApproval > 0;

  return (
    <Card className={cn(
      'transition-all hover:border-primary/30',
      isActive && 'border-blue-500/40 shadow-blue-500/5 shadow-lg',
    )}>
      <CardContent className="pt-5 pb-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn(
              'rounded-lg p-2 shrink-0',
              isActive ? 'bg-blue-500/15' : 'bg-primary/10',
            )}>
              <Bot size={18} className={isActive ? 'text-blue-500' : 'text-primary'} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {agent.agentName}
              </p>
              <p className="text-xs text-muted-foreground">
                {agent.totalRuns} total runs
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isActive && (
              <Badge variant="info" className="gap-1 text-xs">
                <Activity size={10} className="animate-pulse" />
                {agent.running} active
              </Badge>
            )}
            {!isActive && hasQueued && (
              <Badge variant="warning" className="gap-1 text-xs">
                <Clock size={10} />
                {agent.queued + agent.awaitingApproval} pending
              </Badge>
            )}
            {!isActive && !hasQueued && agent.totalRuns > 0 && (
              <Badge variant="secondary" className="text-xs">Idle</Badge>
            )}
            {agent.totalRuns === 0 && (
              <Badge variant="secondary" className="text-xs">No runs</Badge>
            )}
          </div>
        </div>

        {/* Status mini-bar */}
        <div className="space-y-1">
          <MiniBar
            items={[
              { value: agent.completed, color: 'bg-emerald-500' },
              { value: agent.running, color: 'bg-blue-500' },
              { value: agent.queued + agent.awaitingApproval, color: 'bg-amber-500' },
              { value: agent.failed, color: 'bg-red-500' },
            ]}
          />
          <div className="flex gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {agent.completed}
            </span>
            {agent.running > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
                {agent.running}
              </span>
            )}
            {(agent.queued + agent.awaitingApproval) > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                {agent.queued + agent.awaitingApproval}
              </span>
            )}
            {agent.failed > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                {agent.failed}
              </span>
            )}
          </div>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md bg-secondary px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">Success</p>
            <p className="text-sm font-semibold text-foreground">
              {agent.successRate != null ? pct(agent.successRate) : '—'}
            </p>
          </div>
          <div className="rounded-md bg-secondary px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">Spend</p>
            <p className="text-sm font-semibold text-foreground">
              {usd(agent.totalSpend)}
            </p>
          </div>
          <div className="rounded-md bg-secondary px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">Value</p>
            <p className="text-sm font-semibold text-emerald-400">
              {usd(agent.realizedValue)}
            </p>
          </div>
        </div>

        {/* Last activity */}
        {agent.lastRun && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
            <span>Last run: {timeAgo(agent.lastRun.createdAt)}</span>
            <StatusBadge status={agent.lastRun.status} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── main page ────────────────────────────────────────────────── */

type Tab = 'overview' | 'agents' | 'runs' | 'costs';

export default function OpenClawPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [runsFilter, setRunsFilter] = useState('');

  const { data: overview, isPending: overviewPending } =
    useApiQuery<Overview>('/analytics/automation/overview');
  const { data: roi, isPending: roiPending } =
    useApiQuery<ROI>('/analytics/automation/roi');
  const { data: workflows = [], isPending: workflowsPending } =
    useApiQuery<WorkflowRow[]>('/analytics/automation/by-workflow');
  const { data: agentCards = [], isPending: agentsPending } =
    useApiQuery<AgentCard[]>('/analytics/automation/agent-cards');

  // Runs are only fetched when the runs tab is active. The cache key includes
  // the filter so switching status pulls a fresh list (still cached per filter).
  const { data: runs = [], isFetching: runsLoading } = useApiQuery<RunRow[]>(
    '/automation/runs',
    {
      enabled: tab === 'runs',
      params: { status: runsFilter || undefined, take: 50 },
    },
  );

  const fetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ['/analytics/automation/overview'] });
    queryClient.invalidateQueries({ queryKey: ['/analytics/automation/roi'] });
    queryClient.invalidateQueries({ queryKey: ['/analytics/automation/by-workflow'] });
    queryClient.invalidateQueries({ queryKey: ['/analytics/automation/agent-cards'] });
  };

  const fetchRuns = () => {
    queryClient.invalidateQueries({ queryKey: ['/automation/runs'] });
  };

  const loading = overviewPending || roiPending || workflowsPending || agentsPending;
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 size={20} className="mr-2 animate-spin" />
        Loading OpenClaw dashboard...
      </div>
    );
  }

  const ov = overview;
  const r = roi;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            OpenClaw Monitor
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Agent automation runs, costs, and outcomes
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            fetchAll();
            if (tab === 'runs') fetchRuns();
          }}
        >
          <RefreshCw size={16} className="mr-2" />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-secondary p-1 w-fit">
        {(['overview', 'agents', 'runs', 'costs'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors capitalize',
              tab === t
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ──────────────────────────────────────── */}
      {tab === 'overview' && ov && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Runs"
              value={String(ov.runs.total)}
              sub={`${ov.runs.running} running`}
              icon={Bot}
            />
            <StatCard
              label="Success Rate"
              value={
                ov.runs.total > 0
                  ? pct((ov.runs.completed / ov.runs.total) * 100)
                  : '—'
              }
              sub={`${ov.runs.completed} completed / ${ov.runs.failed} failed`}
              icon={CheckCircle2}
              trend={
                ov.runs.total > 0 && ov.runs.completed / ov.runs.total > 0.8
                  ? 'up'
                  : ov.runs.failed > 0
                    ? 'down'
                    : null
              }
            />
            <StatCard
              label="Drafts → Sent"
              value={`${ov.approvedMessages} / ${ov.drafts}`}
              sub={`${pct(ov.approvalRate)} approval rate`}
              icon={Activity}
            />
            <StatCard
              label="Pending Approval"
              value={String(ov.runs.awaitingApproval)}
              sub="Requires human review"
              icon={AlertTriangle}
              trend={ov.runs.awaitingApproval > 0 ? 'down' : null}
            />
          </div>

          {/* Run status distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Run Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <DistributionBar
                items={[
                  { label: 'Completed', value: ov.runs.completed, color: 'bg-emerald-500' },
                  { label: 'Running', value: ov.runs.running, color: 'bg-blue-500' },
                  { label: 'Queued', value: ov.runs.total - ov.runs.completed - ov.runs.failed - ov.runs.cancelled - ov.runs.awaitingApproval - ov.runs.running, color: 'bg-slate-400' },
                  { label: 'Awaiting Approval', value: ov.runs.awaitingApproval, color: 'bg-amber-500' },
                  { label: 'Failed', value: ov.runs.failed, color: 'bg-red-500' },
                  { label: 'Cancelled', value: ov.runs.cancelled, color: 'bg-zinc-500' },
                ]}
              />
            </CardContent>
          </Card>

          {/* Agent cards preview */}
          {agentCards.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Agents</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTab('agents')}
                  className="text-xs"
                >
                  View all →
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {agentCards.slice(0, 3).map((agent) => (
                  <AgentCardComponent key={agent.agentName} agent={agent} />
                ))}
              </div>
            </div>
          )}

          {/* Workflows */}
          <Card>
            <CardHeader>
              <CardTitle>By Workflow</CardTitle>
            </CardHeader>
            <CardContent>
              {workflows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No workflow data yet</p>
              ) : (
                <div className="space-y-3">
                  {workflows.map((w) => (
                    <div
                      key={w.workflowName}
                      className="flex items-center justify-between p-3 rounded-md bg-secondary"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {w.workflowName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {w.runCount} runs &middot; {usd(w.totalAiCost + w.totalMsgCost + w.totalToolCost)} total cost
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">
                          {usd(w.realizedValue)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          realized
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── AGENTS TAB ─────────────────────────────────────────── */}
      {tab === 'agents' && (
        <div className="space-y-6">
          {/* Summary row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Agents"
              value={String(agentCards.length)}
              sub={`${agentCards.filter((a) => a.running > 0).length} active now`}
              icon={Bot}
            />
            <StatCard
              label="Active Runs"
              value={String(agentCards.reduce((s, a) => s + a.running, 0))}
              sub={`${agentCards.reduce((s, a) => s + a.queued + a.awaitingApproval, 0)} queued`}
              icon={Zap}
            />
            <StatCard
              label="Total Agent Spend"
              value={usd(agentCards.reduce((s, a) => s + a.totalSpend, 0))}
              icon={DollarSign}
            />
            <StatCard
              label="Total Value Generated"
              value={usd(agentCards.reduce((s, a) => s + a.realizedValue, 0))}
              sub={`Est. ${usd(agentCards.reduce((s, a) => s + a.estimatedValue, 0))}`}
              icon={TrendingUp}
              trend={agentCards.reduce((s, a) => s + a.realizedValue, 0) > 0 ? 'up' : null}
            />
          </div>

          {/* Agent cards grid */}
          {agentCards.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <Bot size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-lg font-medium">No agents registered yet</p>
                <p className="text-sm mt-1">
                  Agents will appear here once they run their first automation
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {agentCards.map((agent) => (
                <AgentCardComponent key={agent.agentName} agent={agent} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── RUNS TAB ──────────────────────────────────────────── */}
      {tab === 'runs' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { value: '', label: 'All' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'RUNNING', label: 'Running' },
              { value: 'FAILED', label: 'Failed' },
              { value: 'AWAITING_APPROVAL', label: 'Pending' },
              { value: 'QUEUED', label: 'Queued' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setRunsFilter(f.value)}
                className={cn(
                  'rounded-md border px-3 py-1 text-xs font-medium transition-colors',
                  runsFilter === f.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {runsLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 size={18} className="mr-2 animate-spin" />
              Loading runs...
            </div>
          ) : runs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No automation runs found
                {runsFilter && ` with status "${runsFilter}"`}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <Card key={run.id} className="hover:border-primary/30 transition-colors">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status={run.status} />
                          {run.agentName && (
                            <Badge variant="outline" className="text-xs">
                              {run.agentName}
                            </Badge>
                          )}
                          {run.workflowName && (
                            <Badge variant="outline" className="text-xs">
                              {run.workflowName}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {run.triggerType}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="font-mono">{run.id.slice(0, 12)}...</span>
                          {run.entityType && (
                            <span>
                              {run.entityType}/{run.entityId?.slice(0, 8)}
                            </span>
                          )}
                          <span>
                            {new Date(run.createdAt).toLocaleString()}
                          </span>
                          {run.completedAt && (
                            <span>
                              Duration:{' '}
                              {(
                                (new Date(run.completedAt).getTime() -
                                  new Date(run.createdAt).getTime()) /
                                1000
                              ).toFixed(1)}
                              s
                            </span>
                          )}
                        </div>
                        {run.messages && run.messages.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {run.messages.length} message(s):{' '}
                            {run.messages.map((m) => m.status).join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {(run.aiCostUsd || run.messageCostUsd) ? (
                          <p className="text-sm font-semibold text-foreground">
                            {usd((run.aiCostUsd || 0) + (run.messageCostUsd || 0))}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── COSTS TAB ─────────────────────────────────────────── */}
      {tab === 'costs' && r && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Spend"
              value={usd(r.costs.totalSpend)}
              sub={`${r.costs.runCount} runs`}
              icon={DollarSign}
            />
            <StatCard
              label="Avg / Run"
              value={usd(r.costs.avgCostPerRun)}
              icon={Activity}
            />
            <StatCard
              label="Cost / Reply"
              value={r.derivedMetrics.costPerReply != null ? usd(r.derivedMetrics.costPerReply) : '—'}
              sub={`${r.outcomes.inboundReplies} replies`}
              icon={DollarSign}
            />
            <StatCard
              label="Realized Value"
              value={usd(r.derivedMetrics.realizedValue)}
              sub={`Est. ${usd(r.derivedMetrics.estimatedValue)}`}
              icon={ArrowUpRight}
              trend={r.derivedMetrics.realizedValue > 0 ? 'up' : null}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <DistributionBar
                items={[
                  { label: 'AI Inference', value: r.costs.aiSpend, color: 'bg-violet-500' },
                  { label: 'Messaging', value: r.costs.messagingSpend, color: 'bg-blue-500' },
                  { label: 'Tools / APIs', value: r.costs.toolSpend, color: 'bg-emerald-500' },
                  { label: 'Other', value: r.costs.otherSpend, color: 'bg-zinc-400' },
                ]}
              />
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'AI Inference', value: r.costs.aiSpend, color: 'text-violet-400' },
                  { label: 'Messaging', value: r.costs.messagingSpend, color: 'text-blue-400' },
                  { label: 'Tools / APIs', value: r.costs.toolSpend, color: 'text-emerald-400' },
                  { label: 'Other', value: r.costs.otherSpend, color: 'text-zinc-400' },
                ].map((c) => (
                  <div key={c.label} className="p-3 rounded-md bg-secondary">
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <p className={cn('text-lg font-semibold', c.color)}>
                      {usd(c.value)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Outcomes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Estimated Value', value: usd(r.outcomes.estimatedValue) },
                  { label: 'Realized Value', value: usd(r.outcomes.realizedValue) },
                  { label: 'Agent Drafts Sent', value: String(r.outcomes.agentDraftsSent) },
                  { label: 'Inbound Replies', value: String(r.outcomes.inboundReplies) },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-semibold text-foreground">{row.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Deal Economics (All-Time)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Gross Revenue', value: usd(r.dealEconomics.totalGrossRevenue) },
                  { label: 'Net Profit', value: usd(r.dealEconomics.totalNetProfit) },
                  { label: 'Avg ROI', value: r.dealEconomics.avgRoi != null ? pct(r.dealEconomics.avgRoi) : '—' },
                  { label: 'Automation Spend', value: usd(r.derivedMetrics.totalAutomationSpend) },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-semibold text-foreground">{row.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
