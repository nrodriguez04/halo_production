'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bot, CheckCircle2, FileSearch, XCircle } from 'lucide-react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/states';
import { toast } from '@/components/ui/toast';
import { day, errorText } from '@/lib/disposition';
import { CLASSIFICATION_LABEL, type Classification } from '@/lib/markets';

/** The parts of a Market Expansion proposal the page shows (packages/shared agents/market-agents.ts). */
export interface MarketProposal {
  state: string;
  classification: Classification | null;
  classificationReason: string;
  answers: Array<{ question: string; answer: string; note: string; sourceIds: string[] }>;
  counselQuestions: string[];
  requirements: Array<{ key: string; kind: string; label: string; appliesTo: string[] }>;
  activationSteps: string[];
  risks: string[];
  sources: Array<{ id: string; citation: string }>;
}

interface MarketBriefData {
  scope: string;
  asOf: string;
  summary: string;
  priorities: Array<{ key: string; label: string; rank: number; why: string; risks: string; verify: string[] }>;
  dataGaps: string[];
}

type MarketAction =
  | { type: 'propose_market_draft'; proposal: MarketProposal; gated: true }
  | { type: 'record_market_brief'; brief: MarketBriefData }
  | { type: string };

interface MarketAgentRun {
  id: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  modelName: string | null;
  aiCostUsd: number | null;
  errorJson: { error?: string; message?: string } | null;
  decisionJson: {
    recommendation: string;
    summary: string;
    rationale: string;
    hardRule?: string | null;
    model: string | null;
    actions: MarketAction[];
    outcomes?: Array<{ action: MarketAction; result: string; detail?: string }>;
    approval?: { by: string; at: string };
    rejection?: { by: string; at: string; reason: string | null };
  } | null;
}

const STATUS: Record<string, { label: string; variant: 'success' | 'destructive' | 'warning' | 'info' | 'secondary' }> = {
  QUEUED: { label: 'Queued', variant: 'secondary' },
  RUNNING: { label: 'Running', variant: 'info' },
  AWAITING_APPROVAL: { label: 'Needs a decision', variant: 'warning' },
  COMPLETED: { label: 'Done', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'destructive' },
  CANCELLED: { label: 'Closed', variant: 'secondary' },
};

const ANSWER_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'secondary'> = {
  yes: 'success',
  no: 'destructive',
  conditional: 'warning',
  unknown: 'secondary',
};

function runsKey(agent: string, scope: string) {
  return `/agent/runs?agent=${agent}&entityType=market&entityId=${scope}&limit=5`;
}

/** Queues a market agent; the run appears in the list once the worker opens it. */
function useQueueMarketAgent(agent: 'market_intelligence' | 'market_expansion', scope: string) {
  const qc = useQueryClient();
  return useApiMutation<void, { queued: boolean }>(
    () => apiJson('/agent/runs', { method: 'POST', body: JSON.stringify({ agent, entityType: 'market', entityId: scope }) }),
    {
      onSuccess: (out) => {
        if (out.queued) toast.success('Queued. The agent runs when AI is on for this account.');
        else toast.error('Not queued', { description: 'The control plane is off for this account.' });
        setTimeout(() => qc.invalidateQueries({ queryKey: [runsKey(agent, scope)] }), 4000);
      },
      onError: (err) => toast.error('Could not queue the agent', { description: errorText(err) }),
    },
  );
}

/** What a proposal would add to the draft. */
export function ProposalDetails({
  p,
  questionLabel,
}: {
  p: MarketProposal;
  questionLabel?: (key: string) => string;
}) {
  const label = questionLabel ?? ((k: string) => k.replace(/_/g, ' '));
  const cited = new Map(p.sources.map((s) => [s.id, s.citation]));
  return (
    <div className="space-y-3 text-caption">
      {p.classification && (
        <p>
          <span className="font-medium">Class: </span>
          {CLASSIFICATION_LABEL[p.classification] ?? p.classification}
          {p.classificationReason && <span className="text-muted-foreground"> · {p.classificationReason}</span>}
        </p>
      )}
      {p.answers.length > 0 && (
        <div className="space-y-1">
          <p className="font-medium uppercase tracking-wider text-muted-foreground">Answers to unknown questions</p>
          <ul className="space-y-2">
            {p.answers.map((a) => (
              <li key={a.question} className="rounded-md border border-border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={ANSWER_VARIANT[a.answer] ?? 'secondary'}>{a.answer}</Badge>
                  <span className="font-medium">{label(a.question)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{a.note}</p>
                {a.sourceIds.length > 0 && (
                  <p className="mt-1 text-muted-foreground">
                    Sources: {a.sourceIds.map((id) => (cited.has(id) ? `${id} (${cited.get(id)}, added from research)` : id)).join('; ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.counselQuestions.length > 0 && (
        <div className="space-y-1">
          <p className="font-medium uppercase tracking-wider text-muted-foreground">Questions for counsel</p>
          <ul className="list-disc space-y-1 pl-5">
            {p.counselQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {p.requirements.length > 0 && (
        <div className="space-y-1">
          <p className="font-medium uppercase tracking-wider text-muted-foreground">Requirements to track</p>
          <ul className="list-disc space-y-1 pl-5">
            {p.requirements.map((r) => (
              <li key={r.key}>
                {r.label} <span className="text-muted-foreground">({r.appliesTo.map((x) => x.replace(/_/g, ' ')).join(', ')})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.activationSteps.length > 0 && (
        <div className="space-y-1">
          <p className="font-medium uppercase tracking-wider text-muted-foreground">Steps to activation</p>
          <ol className="list-decimal space-y-1 pl-5">
            {p.activationSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      )}
      {p.risks.length > 0 && (
        <div className="space-y-1">
          <p className="font-medium uppercase tracking-wider text-muted-foreground">Risks</p>
          <ul className="list-disc space-y-1 pl-5">
            {p.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Market Expansion proposals for one state (docs/markets.md s11). A
 * person accepts a proposal into the editable draft or closes it; nothing
 * here submits, approves or activates the market.
 */
export function ExpansionProposals({
  state,
  questionLabel,
}: {
  state: string;
  questionLabel?: (key: string) => string;
}) {
  const qc = useQueryClient();
  const key = runsKey('market_expansion', state);
  const runs = useApiQuery<MarketAgentRun[]>(key);
  const queue = useQueueMarketAgent('market_expansion', state);
  const [reason, setReason] = useState<Record<string, string>>({});
  const refresh = () => {
    qc.invalidateQueries({ queryKey: [key] });
    qc.invalidateQueries({ queryKey: [`/markets/${state}`] });
  };
  const approve = useApiMutation<string>((id) => apiJson(`/agent/runs/${id}/approve`, { method: 'POST' }), {
    onSuccess: () => {
      toast.success('Added to the draft, marked unverified');
      refresh();
    },
    onError: (err) => toast.error('Not added', { description: errorText(err) }),
  });
  const reject = useApiMutation<string>(
    (id) => apiJson(`/agent/runs/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason: reason[id]?.trim() || undefined }) }),
    {
      onSuccess: () => {
        toast.success('Proposal closed');
        refresh();
      },
      onError: (err) => toast.error('Could not close it', { description: errorText(err) }),
    },
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileSearch size={16} className="text-primary" aria-hidden />
              <CardTitle>Market Expansion agent</CardTitle>
            </div>
            <CardDescription>
              Reads this draft, the questions it leaves unknown and the bundled research, and proposes sourced answers, questions for
              counsel, requirements and the steps to activation. Accepting a proposal writes it into the editable draft, marked as not
              verified. It never submits, approves or activates the market: counsel still reviews the policy.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" loading={queue.isPending} onClick={() => queue.mutate()}>
            <Bot size={14} className="mr-1" aria-hidden /> Ask for a proposal
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {runs.isPending ? (
          <LoadingState />
        ) : (runs.data ?? []).length === 0 ? (
          <p className="text-caption text-muted-foreground">No proposals yet.</p>
        ) : (
          runs.data!.map((run) => {
            const d = run.decisionJson;
            const pending = d?.outcomes?.find((o) => o.result === 'pending' && o.action.type === 'propose_market_draft');
            const proposal = (pending?.action ?? d?.actions.find((a) => a.type === 'propose_market_draft')) as
              | { proposal: MarketProposal }
              | undefined;
            const applied = d?.outcomes?.find((o) => o.action.type === 'propose_market_draft' && o.result !== 'pending');
            const st = STATUS[run.status] ?? STATUS.QUEUED;
            return (
              <div key={run.id} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2 text-caption">
                  <Badge variant={st.variant}>{st.label}</Badge>
                  {d?.hardRule && <Badge variant="secondary">rule: {d.hardRule}</Badge>}
                  <span className="text-muted-foreground">
                    {day(run.createdAt)} · {d?.model ?? run.modelName ?? 'no model call'}
                    {run.aiCostUsd ? ` · $${run.aiCostUsd.toFixed(3)}` : ''}
                  </span>
                </div>
                {d ? (
                  <p className="text-body">{d.summary}</p>
                ) : run.errorJson ? (
                  <p className="text-caption text-destructive">{run.errorJson.error ?? run.errorJson.message}</p>
                ) : (
                  <p className="text-caption text-muted-foreground">Waiting for the worker.</p>
                )}
                {d?.rationale && <p className="whitespace-pre-wrap text-caption text-muted-foreground">{d.rationale}</p>}
                {proposal?.proposal && run.status === 'AWAITING_APPROVAL' && (
                  <ProposalDetails p={proposal.proposal} questionLabel={questionLabel} />
                )}
                {applied?.detail && <p className="text-caption text-muted-foreground">Added: {applied.detail}</p>}
                {d?.rejection && (
                  <p className="text-caption text-muted-foreground">
                    Closed {day(d.rejection.at)}
                    {d.rejection.reason ? `: ${d.rejection.reason}` : ''}
                  </p>
                )}
                {run.status === 'AWAITING_APPROVAL' && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button size="sm" loading={approve.isPending} onClick={() => approve.mutate(run.id)}>
                      <CheckCircle2 size={14} className="mr-1" aria-hidden /> Add to the draft
                    </Button>
                    <Input
                      className="h-8 max-w-xs"
                      placeholder="Reason (optional)"
                      value={reason[run.id] ?? ''}
                      onChange={(e) => setReason((r) => ({ ...r, [run.id]: e.target.value }))}
                    />
                    <Button size="sm" variant="outline" loading={reject.isPending} onClick={() => reject.mutate(run.id)}>
                      <XCircle size={14} className="mr-1" aria-hidden /> Close without adding
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The Market Intelligence brief (docs/data-pipeline.md s5): Halo's ranking
 * explained. It changes no score, rank or status.
 */
export function MarketBriefCard({ scope, scopeLabel }: { scope: string; scopeLabel: string }) {
  const key = runsKey('market_intelligence', scope);
  const runs = useApiQuery<MarketAgentRun[]>(key);
  const queue = useQueueMarketAgent('market_intelligence', scope);
  const latest = (runs.data ?? []).find((r) => r.status === 'COMPLETED' && r.decisionJson);
  const open = (runs.data ?? []).find((r) => r.status === 'QUEUED' || r.status === 'RUNNING');
  const failed = (runs.data ?? [])[0]?.status === 'FAILED' ? runs.data![0] : null;
  const brief = latest?.decisionJson?.actions.find((a) => a.type === 'record_market_brief') as { brief: MarketBriefData } | undefined;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Bot size={16} className="text-primary" aria-hidden />
              <CardTitle>Analyst brief: {scopeLabel}</CardTitle>
            </div>
            <CardDescription>
              The Market Intelligence agent explains the ranking below: why the leaders rank where they do, their risks and what to verify.
              It does not change the ranking, and it cannot open a market.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" loading={queue.isPending} disabled={!!open} onClick={() => queue.mutate()}>
            {open ? 'Writing…' : 'Write a brief'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {runs.isPending ? (
          <LoadingState />
        ) : !brief ? (
          <p className="text-caption text-muted-foreground">
            {failed ? `The last attempt failed: ${failed.errorJson?.error ?? failed.errorJson?.message ?? 'unknown error'}` : 'No brief yet.'}
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-body">{brief.brief.summary}</p>
            {brief.brief.priorities.length > 0 && (
              <ol className="space-y-2">
                {brief.brief.priorities.map((p) => (
                  <li key={p.key} className="rounded-md border border-border p-2 text-caption">
                    <p className="font-medium">
                      #{p.rank} {p.label}
                    </p>
                    <p>{p.why}</p>
                    {p.risks && <p className="text-muted-foreground">Risks: {p.risks}</p>}
                    {p.verify.length > 0 && <p className="text-muted-foreground">Verify: {p.verify.join(' · ')}</p>}
                  </li>
                ))}
              </ol>
            )}
            {brief.brief.dataGaps.length > 0 && (
              <div className="text-caption">
                <p className="font-medium uppercase tracking-wider text-muted-foreground">Data gaps</p>
                <ul className="list-disc pl-5">
                  {brief.brief.dataGaps.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-caption text-muted-foreground">
              {day(latest!.completedAt ?? latest!.createdAt)} · {latest!.decisionJson?.model ?? 'no model call (rule)'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Link to a market's proposals, for the agents page. */
export function MarketProposalLink({ state }: { state: string }) {
  return (
    <Link href={`/markets/${state}`} className="text-caption text-primary hover:underline">
      Open the {state} market
    </Link>
  );
}
