'use client';

import { useState } from 'react';
import { CheckCircle2, CircleDashed, FlaskConical, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/disposition/agreement-panel';
import { useMarketAction } from './use-market-action';
import {
  ACTIVITIES,
  ACTIVITY_LABEL,
  SETTABLE_STATUSES,
  STATUS_LABEL,
  STATUS_VARIANT,
  type ActivationStatus,
  type MarketCheck,
  type MarketDetail,
} from '@/lib/markets';

function Rung({ title, checks, reached }: { title: string; checks: MarketCheck[]; reached: boolean }) {
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{title}</p>
        <Badge variant={reached ? 'success' : 'outline'}>{reached ? 'met' : 'not yet'}</Badge>
      </div>
      {checks.length === 0 ? (
        <p className="text-caption text-muted-foreground">Needs an approved policy first.</p>
      ) : (
        <ul className="space-y-1">
          {checks.map((c) => (
            <li key={c.key} className="flex gap-2 text-caption">
              {c.met ? (
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden />
              ) : (
                <CircleDashed size={14} className="mt-0.5 shrink-0 text-amber-400" aria-hidden />
              )}
              <span>
                <span className="font-medium">{c.label}.</span> <span className="text-muted-foreground">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Where the market stands: its status, what each rung of the ladder needs,
 * what Halo may do there now, and the controls a person uses to move it.
 */
export function MarketOverview({ m }: { m: MarketDetail }) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [target, setTarget] = useState<ActivationStatus>(m.requestedStatus);
  const [note, setNote] = useState('');
  const [operatorName, setOperatorName] = useState(m.market.operatorName ?? '');
  const [operatorId, setOperatorId] = useState(m.market.operatorUserId ?? '');

  const setStatus = useMarketAction<void, { effectiveStatus: ActivationStatus; pausedCampaigns: number }>(
    m.state,
    () => ({ path: `/markets/${m.state}/status`, body: { status: target, note } }),
    {
      success: (out) =>
        `${m.state} is now ${STATUS_LABEL[out.effectiveStatus].toLowerCase()}${out.pausedCampaigns ? `; ${out.pausedCampaigns} campaign(s) paused` : ''}`,
      failure: 'Could not change the status',
    },
    () => {
      setStatusOpen(false);
      setNote('');
    },
  );
  const setOperator = useMarketAction(
    m.state,
    () => ({
      path: `/markets/${m.state}/operator`,
      method: 'PUT',
      body: { operatorUserId: operatorId.trim() || null, operatorName: operatorName.trim() || null },
    }),
    { success: 'Operator saved', failure: 'Could not save the operator' },
  );
  const selfTest = useMarketAction<void, { passed: boolean }>(
    m.state,
    () => ({ path: `/markets/${m.state}/self-test` }),
    { success: (out) => (out.passed ? 'Self-test passed' : 'Self-test ran: see what failed'), failure: 'Could not run the self-test' },
  );

  const rank = (s: ActivationStatus) =>
    ['RESEARCH_ONLY', 'PENDING_LEGAL_REVIEW', 'PENDING_REQUIREMENTS', 'APPROVED_FOR_ACQUISITION', 'APPROVED_FOR_DISPOSITION', 'ACTIVE'].indexOf(s);
  const max = rank(m.maxStatus);
  const result = m.market.selfTestResult;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Status</CardTitle>
              <Badge variant={STATUS_VARIANT[m.effectiveStatus]}>{STATUS_LABEL[m.effectiveStatus]}</Badge>
              {m.requestedStatus !== m.effectiveStatus && (
                <span className="text-caption text-muted-foreground">set to {STATUS_LABEL[m.requestedStatus].toLowerCase()}</span>
              )}
            </div>
            <Button size="sm" onClick={() => setStatusOpen(true)}>
              Change status
            </Button>
          </div>
          <CardDescription>
            Supports at most <span className="font-medium">{STATUS_LABEL[m.maxStatus].toLowerCase()}</span> today. {m.nextStep ?? ''}
            {m.market.statusNote ? ` Last note: ${m.market.statusNote}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-3">
          <Rung title="Acquisition" checks={m.evaluation.rungs.acquisition} reached={max >= rank('APPROVED_FOR_ACQUISITION')} />
          <Rung title="Disposition" checks={m.evaluation.rungs.disposition} reached={max >= rank('APPROVED_FOR_DISPOSITION')} />
          <Rung title="Active" checks={m.evaluation.rungs.active} reached={max >= rank('ACTIVE')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>What Halo may do in {m.name} now</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 md:grid-cols-2">
            {ACTIVITIES.map((a) => {
              const v = m.evaluation.activities[a];
              return (
                <li key={a} className="flex gap-2 text-caption">
                  {v?.allowed ? (
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden />
                  ) : (
                    <ShieldAlert size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span>
                    <span className="font-medium">{ACTIVITY_LABEL[a]}</span>
                    {!v?.allowed && <span className="text-muted-foreground">: {v?.reason}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Operator</CardTitle>
            <CardDescription>The person responsible for operations here. Needed before the market goes active.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Name" htmlFor="op-name">
                <Input id="op-name" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} />
              </Field>
              <Field label="User id" htmlFor="op-id">
                <Input id="op-id" value={operatorId} onChange={(e) => setOperatorId(e.target.value)} />
              </Field>
            </div>
            <Button size="sm" variant="outline" loading={setOperator.isPending} onClick={() => setOperator.mutate()}>
              Save operator
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Self-test</CardTitle>
              <Button size="sm" variant="outline" loading={selfTest.isPending} onClick={() => selfTest.mutate()}>
                <FlaskConical size={14} className="mr-1" aria-hidden />
                Run
              </Button>
            </div>
            <CardDescription>
              Proves the encoded rules hold marketing for missing disclosures and open cancellation windows, allow exactly what the policy permits, and that every template fills.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!result ? (
              <p className="text-caption text-muted-foreground">Not run yet.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-caption">
                  <Badge variant={result.passed ? 'success' : 'destructive'}>{result.passed ? 'passed' : 'failed'}</Badge>{' '}
                  {new Date(result.ranAt).toLocaleString()}
                  {m.selfTest?.stale ? ' · out of date: something changed since' : ''}
                </p>
                <ul className="space-y-1">
                  {result.steps.map((s) => (
                    <li key={s.name} className="text-caption">
                      <span className={s.passed ? 'text-emerald-400' : 'text-destructive'}>{s.passed ? '✓' : '✕'}</span>{' '}
                      <span className="font-medium">{s.name.replace(/_/g, ' ')}</span>
                      {s.skipped ? ' (not applicable)' : ''}: <span className="text-muted-foreground">{s.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change {m.name}&apos;s status</DialogTitle>
            <DialogDescription>
              Halo refuses any status the approved policy and requirements do not support. Restricted and blocked stop new activity at once and pause live campaigns.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Status" htmlFor="mk-status">
              <Select id="mk-status" value={target} onChange={(e) => setTarget(e.target.value as ActivationStatus)}>
                {SETTABLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Why (recorded in the audit log)" htmlFor="mk-note">
              <Textarea id="mk-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>
              Cancel
            </Button>
            <Button disabled={note.trim().length < 3} loading={setStatus.isPending} onClick={() => setStatus.mutate()}>
              Set status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
