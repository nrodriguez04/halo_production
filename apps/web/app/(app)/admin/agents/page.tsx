'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';
import { LoadingState, EmptyState, SkeletonTable } from '@/components/states';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  DollarSign,
  Mail,
  MessageSquare,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react';

type AgentName = 'lead_analyst' | 'deal_underwriter' | 'outreach_drafter' | 'disposition_matcher';

interface AgentAction {
  type:
    | 'set_lead_score'
    | 'append_note'
    | 'transition_lead'
    | 'draft_message'
    | 'set_deal_economics'
    | 'classify_inbound'
    | 'record_opt_out'
    | 'flag_contact'
    | 'transition_deal';
  intent?: string;
  confidence?: number;
  method?: string;
  messageId?: string;
  arv?: number | null;
  repairEstimate?: number | null;
  mao?: number | null;
  score?: number;
  note?: string;
  to?: string;
  reason?: string;
  gated?: boolean;
  channel?: 'sms' | 'email';
  recipientType?: string;
  content?: string;
  subject?: string;
}

interface Outcome {
  action: AgentAction;
  result: 'applied' | 'pending' | 'skipped' | 'failed';
  detail?: string;
}

interface Decision {
  agent: AgentName;
  promptVersion: string;
  model: string | null;
  recommendation: string;
  summary: string;
  rationale: string;
  confidence?: number;
  hardRule?: string | null;
  actions: AgentAction[];
  autonomy?: string;
  outcomes?: Outcome[];
  approval?: { by: string; at: string };
  rejection?: { by: string; at: string; reason: string | null };
}

interface AgentRun {
  id: string;
  agentName: string | null;
  status: string;
  triggerType: string;
  entityType: string | null;
  entityId: string | null;
  aiCostUsd: number | null;
  modelName: string | null;
  createdAt: string;
  completedAt: string | null;
  errorJson: { error?: string; message?: string } | null;
  inputJson: { trigger?: string; triggerEventId?: string | null } | null;
  outputJson: Record<string, unknown> | null;
  decisionJson: Decision | null;
  entity: { label: string; status: string; score: number | null } | null;
}

interface AgentModels {
  cheap?: string;
  mid?: string;
  strong?: string;
}

interface ControlPlane {
  enabled: boolean;
  aiEnabled: boolean;
  agentAutonomy: string;
  agentModels: AgentModels | null;
  globallyConstrained?: boolean;
}

const AGENT_LABEL: Record<AgentName, string> = {
  lead_analyst: 'Lead Analyst',
  deal_underwriter: 'Deal Underwriter',
  outreach_drafter: 'Outreach Drafter',
  disposition_matcher: 'Disposition Matcher',
};
const RELEASED: AgentName[] = ['lead_analyst', 'deal_underwriter', 'outreach_drafter'];
const DEFAULT_MODELS: Required<AgentModels> = { cheap: 'gpt-4o-mini', mid: 'gpt-4o', strong: 'gpt-4o' };
const RUNS_PARAMS = { limit: 100 };

const usd = (n: number | null | undefined) => (n != null ? `$${n.toFixed(3)}` : '—');
const money = (n: number | null | undefined) =>
  n != null ? `$${Math.round(n).toLocaleString()}` : '—';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const statusConfig: Record<
  string,
  { label: string; variant: 'success' | 'destructive' | 'warning' | 'info' | 'secondary' }
> = {
  COMPLETED: { label: 'Completed', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'destructive' },
  RUNNING: { label: 'Running', variant: 'info' },
  QUEUED: { label: 'Queued', variant: 'secondary' },
  CANCELLED: { label: 'Cancelled', variant: 'secondary' },
  AWAITING_APPROVAL: { label: 'Needs approval', variant: 'warning' },
};

const recommendationVariant: Record<
  string,
  'success' | 'destructive' | 'warning' | 'secondary' | 'info'
> = {
  qualified: 'success',
  disqualified: 'destructive',
  hold: 'warning',
  blocked: 'secondary',
  offer: 'success',
  pass: 'destructive',
  interested: 'success',
  not_interested: 'destructive',
  opt_out: 'destructive',
  wrong_number: 'warning',
  callback: 'info',
  unclear: 'warning',
  follow_up: 'info',
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? statusConfig.QUEUED;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function RecommendationBadge({ value }: { value: string | undefined }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={recommendationVariant[value] ?? 'secondary'}>{value}</Badge>;
}

function agentLabel(name: string | null): string {
  return name && name in AGENT_LABEL ? AGENT_LABEL[name as AgentName] : (name ?? 'agent');
}

function describeAction(action: AgentAction): string {
  switch (action.type) {
    case 'set_lead_score':
      return `Set lead score to ${action.score}`;
    case 'append_note':
      return 'Add the rationale as a timeline note';
    case 'transition_lead':
      return `Move the lead to ${action.to}`;
    case 'draft_message':
      return `Draft a seller ${action.channel === 'sms' ? 'text' : 'email'} for the approval queue`;
    case 'set_deal_economics':
      return `Set ARV ${money(action.arv)}, repairs ${money(action.repairEstimate)}, MAO ${money(action.mao)} on the deal`;
    case 'classify_inbound':
      return `Record the reply as "${action.intent}" (${action.method})`;
    case 'record_opt_out':
      return 'Record the opt-out: do-not-contact entry, consents revoked';
    case 'flag_contact':
      return `Tag the lead ${action.reason} for a new skip trace`;
    case 'transition_deal':
      return `Move the deal to ${action.to}`;
    default:
      return action.type;
  }
}

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: typeof Bot }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-caption font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="text-h1 font-bold tracking-tight text-foreground">{value}</p>
            {sub && <p className="text-caption text-muted-foreground">{sub}</p>}
          </div>
          <div className="rounded-md bg-primary/10 p-2">
            <Icon size={18} className="text-primary" aria-hidden />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ApprovalCard({
  run,
  onApprove,
  onReject,
  busy,
}: {
  run: AgentRun;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState('');
  const decision = run.decisionJson;
  const pending = (decision?.outcomes ?? []).filter((o) => o.result === 'pending');
  const applied = (decision?.outcomes ?? []).filter((o) => o.result === 'applied');

  return (
    <Card className="border-amber-500/40">
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles size={16} className="text-amber-500" aria-hidden />
              <span className="font-semibold text-foreground">{agentLabel(run.agentName)}</span>
              <RecommendationBadge value={decision?.recommendation} />
              {decision?.hardRule && (
                <Badge variant="secondary">rule: {decision.hardRule}</Badge>
              )}
            </div>
            <p className="text-body text-foreground">
              {run.entity?.label ?? run.entityId ?? 'lead'}
              {run.entity && (
                <span className="text-muted-foreground">
                  {' '}
                  · {run.entityType ?? 'lead'} is {run.entity.status}
                  {run.entity.score != null ? `, score ${run.entity.score}` : ''}
                </span>
              )}
            </p>
            <p className="text-caption text-muted-foreground">
              {timeAgo(run.createdAt)} · {run.inputJson?.trigger ?? run.triggerType.toLowerCase()} ·{' '}
              {decision?.model ?? 'no model call'} · {usd(run.aiCostUsd)}
            </p>
          </div>
        </div>

        {decision && (
          <div className="space-y-1 rounded-md bg-secondary p-3">
            <p className="text-body font-medium text-foreground">{decision.summary}</p>
            <p className="text-caption text-muted-foreground">{decision.rationale}</p>
          </div>
        )}

        {applied.length > 0 && (
          <p className="text-caption text-muted-foreground">
            Already applied: {applied.map((o) => describeAction(o.action)).join('; ')}.
          </p>
        )}

        {pending.length > 0 && (
          <div className="space-y-2">
            <p className="text-caption font-medium uppercase tracking-wider text-muted-foreground">
              Waiting for your approval
            </p>
            <ul className="space-y-2">
              {pending.map((o, i) => (
                <li key={i} className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-2 text-body text-foreground">
                    {o.action.type === 'draft_message' ? (
                      o.action.channel === 'sms' ? (
                        <MessageSquare size={14} aria-hidden />
                      ) : (
                        <Mail size={14} aria-hidden />
                      )
                    ) : (
                      <CheckCircle2 size={14} aria-hidden />
                    )}
                    {describeAction(o.action)}
                  </div>
                  {o.action.type === 'draft_message' && (
                    <div className="mt-2 space-y-1 text-caption text-muted-foreground">
                      {o.action.subject && <p className="font-medium">Subject: {o.action.subject}</p>}
                      <p className="whitespace-pre-wrap">{o.action.content}</p>
                    </div>
                  )}
                  {o.action.type === 'transition_lead' && o.action.reason && (
                    <p className="mt-1 text-caption text-muted-foreground">{o.action.reason}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => onApprove(run.id)} disabled={busy}>
            <CheckCircle2 size={14} className="mr-1" aria-hidden />
            Approve
          </Button>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="h-8 max-w-xs"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReject(run.id, reason)}
            disabled={busy}
          >
            <XCircle size={14} className="mr-1" aria-hidden />
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const {
    data: runs,
    isPending: runsPending,
    isFetching,
    refetch,
  } = useApiQuery<AgentRun[]>('/agent/runs', { params: RUNS_PARAMS, refetchInterval: 20_000 });
  const { data: controlPlane, isPending: cpPending } = useApiQuery<ControlPlane>('/control-plane');

  const [autonomy, setAutonomy] = useState('draft_only');
  const [models, setModels] = useState<AgentModels>({});
  const [queueLeadId, setQueueLeadId] = useState('');
  const [queueAgent, setQueueAgent] = useState<AgentName>('lead_analyst');
  const queueEntityType: 'lead' | 'deal' = queueAgent === 'lead_analyst' ? 'lead' : 'deal';

  useEffect(() => {
    if (!controlPlane) return;
    setAutonomy(controlPlane.agentAutonomy ?? 'draft_only');
    setModels(controlPlane.agentModels ?? {});
  }, [controlPlane]);

  const invalidateRuns = () => queryClient.invalidateQueries({ queryKey: ['/agent/runs'] });

  const approveMutation = useApiMutation<string, unknown>(
    (id) => apiJson(`/agent/runs/${id}/approve`, { method: 'POST' }),
    {
      onSuccess: () => {
        toast.success('Approved', { description: 'The lead moved and any drafts are in the approval queue.' });
        invalidateRuns();
        queryClient.invalidateQueries({ queryKey: ['/leads'] });
      },
      onError: (err) => toast.error('Approve failed', { description: err?.message ?? 'Unknown error' }),
    },
  );
  const rejectMutation = useApiMutation<{ id: string; reason: string }, unknown>(
    ({ id, reason }) =>
      apiJson(`/agent/runs/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    {
      onSuccess: () => {
        toast.success('Rejected', { description: 'The lead was left as it was.' });
        invalidateRuns();
      },
      onError: (err) => toast.error('Reject failed', { description: err?.message ?? 'Unknown error' }),
    },
  );
  const queueMutation = useApiMutation<
    { agent: AgentName; entityType: 'lead' | 'deal'; entityId: string },
    { queued: boolean }
  >(
    (body) =>
      apiJson<{ queued: boolean }>('/agent/runs', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    {
      onSuccess: (res) => {
        if (res.queued) {
          toast.success('Queued', { description: 'The run will show up here within a few seconds.' });
          setQueueLeadId('');
          setTimeout(invalidateRuns, 3000);
        } else {
          toast.error('Not queued', { description: 'The control plane is disabled for this account.' });
        }
      },
      onError: (err) => toast.error('Queue failed', { description: err?.message ?? 'Unknown error' }),
    },
  );
  const settingsMutation = useApiMutation<Partial<ControlPlane>, ControlPlane>(
    (updates) =>
      apiJson<ControlPlane>('/control-plane', { method: 'PUT', body: JSON.stringify(updates) }),
    {
      onSuccess: () => {
        toast.success('Agent settings saved');
        queryClient.invalidateQueries({ queryKey: ['/control-plane'] });
      },
      onError: (err) => toast.error('Save failed', { description: err?.message ?? 'Unknown error' }),
    },
  );

  const saveSettings = () => {
    const cleaned: AgentModels = {};
    (['cheap', 'mid', 'strong'] as const).forEach((tier) => {
      const v = models[tier]?.trim();
      if (v) cleaned[tier] = v;
    });
    settingsMutation.mutate({
      agentAutonomy: autonomy,
      agentModels: Object.keys(cleaned).length ? cleaned : null,
    });
  };

  const awaiting = useMemo(() => (runs ?? []).filter((r) => r.status === 'AWAITING_APPROVAL'), [runs]);
  const stats = useMemo(() => {
    const list = runs ?? [];
    const dayAgo = Date.now() - 86_400_000;
    const recent = list.filter((r) => new Date(r.createdAt).getTime() >= dayAgo);
    return {
      awaiting: awaiting.length,
      completed24h: recent.filter((r) => r.status === 'COMPLETED').length,
      failed24h: recent.filter((r) => r.status === 'FAILED').length,
      spend: list.reduce((s, r) => s + (r.aiCostUsd ?? 0), 0),
    };
  }, [runs, awaiting]);

  const busy = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        description="Every agent run, what it recommended, and what is waiting on a person. Nothing reaches a seller without approval."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? 'mr-1 animate-spin' : 'mr-1'} aria-hidden />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Needs approval" value={String(stats.awaiting)} icon={AlertTriangle} />
        <StatCard label="Completed (24h)" value={String(stats.completed24h)} icon={CheckCircle2} />
        <StatCard label="Failed (24h)" value={String(stats.failed24h)} icon={XCircle} />
        <StatCard
          label="AI spend"
          value={usd(stats.spend)}
          sub={`last ${runs?.length ?? 0} runs`}
          icon={DollarSign}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-h3 font-semibold text-foreground">Approval queue</h2>
        {runsPending ? (
          <LoadingState label="Loading runs…" />
        ) : awaiting.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            description="When an agent recommends qualifying a lead or drafting a first touch, it appears here."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {awaiting.map((run) => (
              <ApprovalCard
                key={run.id}
                run={run}
                busy={busy}
                onApprove={(id) => approveMutation.mutate(id)}
                onReject={(id, reason) => rejectMutation.mutate({ id, reason })}
              />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot size={16} aria-hidden /> Autonomy and models
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cpPending ? (
              <LoadingState label="Loading settings…" />
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-caption font-medium text-foreground" htmlFor="agent-autonomy">
                    Autonomy
                  </label>
                  <Select
                    id="agent-autonomy"
                    value={autonomy}
                    onChange={(e) => setAutonomy(e.target.value)}
                  >
                    <option value="draft_only">Draft only: every lead change waits for a person</option>
                    <option value="standard">
                      Standard: rule-based disqualifies apply at once; outreach still waits
                    </option>
                  </Select>
                  <p className="text-caption text-muted-foreground">
                    Drafts never send on their own in either tier. Switch to standard only after
                    reviewing a batch of runs.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(['cheap', 'mid', 'strong'] as const).map((tier) => (
                    <div key={tier} className="space-y-1">
                      <label className="text-caption font-medium text-foreground" htmlFor={`model-${tier}`}>
                        {tier} tier
                      </label>
                      <Input
                        id={`model-${tier}`}
                        value={models[tier] ?? ''}
                        onChange={(e) => setModels((m) => ({ ...m, [tier]: e.target.value }))}
                        placeholder={DEFAULT_MODELS[tier]}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-caption text-muted-foreground">
                  Lead Analyst uses the mid tier; the Underwriter will use strong; classification
                  uses cheap. Blank means the platform default. A model starting with
                  &quot;claude-&quot; routes to Anthropic and needs that key configured.
                </p>
                <Button size="sm" onClick={saveSettings} disabled={settingsMutation.isPending}>
                  Save settings
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles size={16} aria-hidden /> Queue a run
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-caption text-muted-foreground">
              Agents start on their own when a lead finishes enrichment and on the nightly sweep.
              Use this to re-run one by hand.
            </p>
            <div className="space-y-1">
              <label className="text-caption font-medium text-foreground" htmlFor="queue-agent">
                Agent
              </label>
              <Select
                id="queue-agent"
                value={queueAgent}
                onChange={(e) => setQueueAgent(e.target.value as AgentName)}
              >
                {(Object.keys(AGENT_LABEL) as AgentName[]).map((name) => (
                  <option key={name} value={name} disabled={!RELEASED.includes(name)}>
                    {AGENT_LABEL[name]}
                    {RELEASED.includes(name) ? '' : ' (not released yet)'}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-caption font-medium text-foreground" htmlFor="queue-lead">
                {queueEntityType === 'deal' ? 'Deal ID' : 'Lead ID'}
              </label>
              <Input
                id="queue-lead"
                value={queueLeadId}
                onChange={(e) => setQueueLeadId(e.target.value)}
                placeholder={
                  queueEntityType === 'deal'
                    ? 'Paste a deal id from the Deals page'
                    : 'Paste a lead id from the Leads page'
                }
              />
            </div>
            <Button
              size="sm"
              onClick={() => queueMutation.mutate({
                  agent: queueAgent,
                  entityType: queueEntityType,
                  entityId: queueLeadId.trim(),
                })}
              disabled={!queueLeadId.trim() || queueMutation.isPending}
            >
              <Clock size={14} className="mr-1" aria-hidden />
              Queue run
            </Button>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-h3 font-semibold text-foreground">Recent runs</h2>
        {runsPending ? (
          <SkeletonTable rows={6} cols={7} />
        ) : !runs || runs.length === 0 ? (
          <EmptyState
            title="No agent runs yet"
            description="Import or enrich a lead, or queue a run above, and the Lead Analyst will take a look."
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Recommendation</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => {
                    const d = run.decisionJson;
                    const error = run.errorJson?.error ?? run.errorJson?.message ?? null;
                    return (
                      <TableRow key={run.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {timeAgo(run.createdAt)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{agentLabel(run.agentName)}</TableCell>
                        <TableCell className="max-w-[260px]">
                          <p className="truncate">{run.entity?.label ?? run.entityId ?? '—'}</p>
                          {d?.summary && (
                            <p className="truncate text-caption text-muted-foreground" title={d.summary}>
                              {d.summary}
                            </p>
                          )}
                          {run.status === 'FAILED' && error && (
                            <p className="truncate text-caption text-destructive" title={error}>
                              {error}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {run.inputJson?.trigger ?? run.triggerType.toLowerCase()}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={run.status} />
                        </TableCell>
                        <TableCell>
                          <RecommendationBadge value={d?.recommendation} />
                          {d?.hardRule && (
                            <span className="ml-1 text-caption text-muted-foreground">rule</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-caption">
                          {run.modelName ?? d?.model ?? '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono">
                          {usd(run.aiCostUsd)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
