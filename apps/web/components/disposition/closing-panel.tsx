'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, CircleSlash, Landmark } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/states';
import { cn } from '@/lib/utils';
import { DocumentSelect } from './document-select';
import { GenerateAgreementButton } from './generate-agreement-button';
import { useDealAction } from './use-deal-action';
import { Field } from './agreement-panel';
import { dateInput, day, money, toIsoDate, type Assignment, type ClosingFile } from '@/lib/disposition';

const ATTENTION_VARIANT = {
  overdue: 'destructive',
  blocked: 'destructive',
  due_soon: 'warning',
  warning: 'secondary',
} as const;

/**
 * Transaction coordination: the assignment, the milestones the closing
 * agent needs, title and funding issues, and the closing itself. Nothing
 * here moves money; it records what the settlement statement and the bank
 * say.
 */
export function ClosingPanel({
  dealId,
  closing,
  assignments,
  buyerNames,
}: {
  dealId: string;
  closing: ClosingFile | null;
  assignments: Assignment[];
  buyerNames: Record<string, string>;
}) {
  const [agentOpen, setAgentOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [waive, setWaive] = useState<{ key: string; label: string } | null>(null);

  const open = useDealAction(dealId, () => ({ path: `/deals/${dealId}/closing` }), {
    success: 'Closing file opened',
    failure: 'Could not open the closing file',
  });
  const milestone = useDealAction<{ key: string; status: 'done' | 'pending' | 'waived'; note?: string }>(
    dealId,
    ({ key, ...body }) => ({ path: `/deals/${dealId}/closing/milestones/${key}`, body }),
    { success: 'Milestone updated', failure: 'Could not update the milestone' },
    () => setWaive(null),
  );
  const resolve = useDealAction<{ id: string; resolution: string }>(
    dealId,
    ({ id, resolution }) => ({ path: `/closing-issues/${id}/resolve`, body: { resolution } }),
    { success: 'Issue resolved', failure: 'Could not resolve the issue' },
  );

  const active = assignments.find((a) => a.status !== 'cancelled') ?? null;

  if (!closing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Closing</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Landmark}
            title="No closing file yet"
            description="It opens when the seller contract is executed, so title work starts then."
            action={
              <Button size="sm" variant="outline" loading={open.isPending} onClick={() => open.mutate()}>
                Open it now
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const done = closing.status === 'closed' || closing.status === 'cancelled';
  return (
    <div className="space-y-4">
      {active && <AssignmentCard dealId={dealId} assignment={active} buyerName={buyerNames[active.buyerId] ?? 'the buyer'} />}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Landmark size={16} className="text-primary" aria-hidden />
              <CardTitle>Closing file</CardTitle>
              <Badge variant={closing.status === 'closed' ? 'success' : closing.status === 'clear_to_close' ? 'info' : closing.status === 'cancelled' ? 'destructive' : 'secondary'}>
                {closing.status.replace(/_/g, ' ')}
              </Badge>
              <Badge variant={closing.titleStatus === 'clear' ? 'success' : closing.titleStatus === 'issues' ? 'destructive' : 'outline'}>
                title: {closing.titleStatus.replace(/_/g, ' ')}
              </Badge>
              <Badge variant="outline">{closing.structure.replace('_', ' ')}</Badge>
            </div>
            {!done && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setAgentOpen(true)}>
                  Closing agent and date
                </Button>
                <Button size="sm" variant="outline" onClick={() => setIssueOpen(true)}>
                  Raise an issue
                </Button>
                {active?.status === 'executed' && (
                  <Button size="sm" disabled={!closing.readiness.clearToClose} onClick={() => setConfirmOpen(true)}>
                    Confirm closing
                  </Button>
                )}
              </div>
            )}
            {closing.status === 'closed' && !closing.feeReceivedAt && (
              <Button size="sm" onClick={() => setFeeOpen(true)}>
                Record fee received
              </Button>
            )}
          </div>
          <CardDescription>
            {closing.closingAgentCompany ?? 'No closing agent recorded'}
            {closing.closingAgentOfficer ? ` · ${closing.closingAgentOfficer}` : ''}
            {closing.fileNumber ? ` · file ${closing.fileNumber}` : ''}
            {closing.scheduledClosingAt ? ` · closing ${day(closing.scheduledClosingAt)}` : ''}
            {closing.closedAt ? ` · closed ${day(closing.closedAt)}` : ''}
            {closing.realizedFee != null ? ` · fee on statement ${money(closing.realizedFee)}` : ''}
            {closing.feeReceivedAt ? ` · received ${day(closing.feeReceivedAt)}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {closing.readiness.attention.length > 0 && (
            <ul className="space-y-1">
              {closing.readiness.attention.map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" aria-hidden />
                  <Badge variant={ATTENTION_VARIANT[a.level]}>{a.level.replace('_', ' ')}</Badge>
                  <span className="text-body text-foreground">{a.text}</span>
                </li>
              ))}
            </ul>
          )}

          <div>
            <p className="mb-2 text-caption uppercase tracking-wider text-muted-foreground">Milestones</p>
            <ul className="space-y-1">
              {closing.milestones.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-secondary/40">
                  <div className="flex min-w-0 items-center gap-2">
                    {m.status === 'done' ? (
                      <CheckCircle2 size={16} className="shrink-0 text-emerald-400" aria-label="done" />
                    ) : m.status === 'waived' ? (
                      <CircleSlash size={16} className="shrink-0 text-muted-foreground" aria-label="waived" />
                    ) : (
                      <Circle size={16} className="shrink-0 text-muted-foreground" aria-label="pending" />
                    )}
                    <span className={cn('text-body', m.status === 'pending' ? 'text-foreground' : 'text-muted-foreground')}>
                      {m.label}
                    </span>
                    {!m.blocking && <Badge variant="outline">optional</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-caption text-muted-foreground">
                      {m.status === 'pending' ? (m.dueAt ? `due ${day(m.dueAt)}` : '') : `${m.status} ${day(m.completedAt)}`}
                      {m.note ? ` · ${m.note}` : ''}
                    </span>
                    {!done &&
                      (m.status === 'pending' ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => milestone.mutate({ key: m.key, status: 'done' })}>
                            Done
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setWaive({ key: m.key, label: m.label })}>
                            Waive
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => milestone.mutate({ key: m.key, status: 'pending' })}>
                          Reopen
                        </Button>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-caption uppercase tracking-wider text-muted-foreground">Issues</p>
            {closing.issues.length === 0 ? (
              <p className="text-body text-muted-foreground">None raised.</p>
            ) : (
              <ul className="space-y-1.5">
                {closing.issues.map((i) => (
                  <IssueRow key={i.id} issue={i} onResolve={(resolution) => resolve.mutate({ id: i.id, resolution })} />
                ))}
              </ul>
            )}
          </div>

          {!done && (
            <div className="border-t border-border pt-3">
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelOpen(true)}>
                Cancel the closing (deal will not close)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ClosingAgentDialog dealId={dealId} closing={closing} open={agentOpen} onOpenChange={setAgentOpen} />
      <RaiseIssueDialog dealId={dealId} open={issueOpen} onOpenChange={setIssueOpen} />
      <ConfirmClosingDialog dealId={dealId} expectedFee={active?.assignmentFee ?? null} open={confirmOpen} onOpenChange={setConfirmOpen} />
      <FeeReceivedDialog dealId={dealId} expected={closing.realizedFee} open={feeOpen} onOpenChange={setFeeOpen} />
      <CancelClosingDialog dealId={dealId} open={cancelOpen} onOpenChange={setCancelOpen} />
      <WaiveDialog
        target={waive}
        onClose={() => setWaive(null)}
        onWaive={(note) => waive && milestone.mutate({ key: waive.key, status: 'waived', note })}
        pending={milestone.isPending}
      />
    </div>
  );
}

function AssignmentCard({ dealId, assignment, buyerName }: { dealId: string; assignment: Assignment; buyerName: string }) {
  const [doc, setDoc] = useState('');
  const [depositDate, setDepositDate] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const executed = useDealAction(
    dealId,
    () => ({ path: `/assignments/${assignment.id}/executed`, body: { executedDocumentId: doc } }),
    { success: 'Assignment executed: the deal is assigned', failure: 'Could not record the assignment' },
  );
  const deposit = useDealAction(
    dealId,
    () => ({ path: `/assignments/${assignment.id}/buyer-deposit`, body: { receivedAt: toIsoDate(depositDate) } }),
    { success: "Buyer's deposit recorded", failure: 'Could not record the deposit' },
  );
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Assignment to {buyerName}</CardTitle>
          <Badge variant={assignment.status === 'executed' ? 'success' : assignment.status === 'sent' ? 'info' : 'secondary'}>
            {assignment.status}
          </Badge>
          <Badge variant="outline">{assignment.structure.replace('_', ' ')}</Badge>
        </div>
        <CardDescription>
          Price {money(assignment.assignmentPrice)} · fee {money(assignment.assignmentFee)}
          {assignment.buyerDepositAmount ? ` · buyer deposit ${money(assignment.buyerDepositAmount)}` : ''}
          {assignment.buyerDepositDueAt ? ` due ${day(assignment.buyerDepositDueAt)}` : ''}
          {assignment.buyerDepositReceivedAt ? ` · received ${day(assignment.buyerDepositReceivedAt)}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {assignment.status !== 'executed' && (
          <>
            <p className="text-body text-muted-foreground">
              Generate the assignment from your reviewed template, send it from the Contracts card on the Contract tab
              (purpose: assignment), or record the signed copy here once both parties have signed.
            </p>
            {assignment.status === 'draft' && (
              <GenerateAgreementButton dealId={dealId} kind="assignment_agreement" label="Generate assignment from approved template" />
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1">
                <DocumentSelect dealId={dealId} value={doc} onChange={setDoc} placeholder="Executed assignment…" />
              </div>
              <Button size="sm" disabled={!doc} loading={executed.isPending} onClick={() => executed.mutate()}>
                Record executed assignment
              </Button>
            </div>
          </>
        )}
        {!assignment.buyerDepositReceivedAt && (
          <div className="flex flex-wrap items-end gap-2">
            <Input type="date" className="w-44" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} aria-label="Deposit received on" />
            <Button size="sm" variant="outline" disabled={!depositDate} loading={deposit.isPending} onClick={() => deposit.mutate()}>
              Buyer deposit received
            </Button>
          </div>
        )}
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelOpen(true)}>
          Cancel this assignment
        </Button>
        <CancelAssignmentDialog dealId={dealId} assignmentId={assignment.id} open={cancelOpen} onOpenChange={setCancelOpen} />
      </CardContent>
    </Card>
  );
}

function IssueRow({ issue, onResolve }: { issue: ClosingFile['issues'][number]; onResolve: (resolution: string) => void }) {
  const [resolution, setResolution] = useState('');
  return (
    <li className="rounded-md border border-border bg-secondary/30 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={issue.severity === 'blocking' ? 'destructive' : 'warning'}>{issue.severity}</Badge>
        <Badge variant="outline">{issue.kind}</Badge>
        <Badge variant={issue.status === 'open' ? 'secondary' : 'success'}>{issue.status}</Badge>
        <span className="text-body text-foreground">{issue.description}</span>
      </div>
      {issue.status === 'open' ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Input className="max-w-md" placeholder="How it was resolved" value={resolution} onChange={(e) => setResolution(e.target.value)} />
          <Button size="sm" variant="outline" disabled={!resolution.trim()} onClick={() => onResolve(resolution)}>
            Resolve
          </Button>
        </div>
      ) : (
        issue.resolution && <p className="mt-1 text-caption text-muted-foreground">{issue.resolution}</p>
      )}
    </li>
  );
}

function ClosingAgentDialog({
  dealId,
  closing,
  open,
  onOpenChange,
}: {
  dealId: string;
  closing: ClosingFile;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [f, setF] = useState({
    closingAgentCompany: '',
    closingAgentOfficer: '',
    closingAgentEmail: '',
    closingAgentPhone: '',
    fileNumber: '',
    scheduledClosingAt: '',
    titleStatus: 'not_opened',
    structure: 'assignment',
  });
  useEffect(() => {
    setF({
      closingAgentCompany: closing.closingAgentCompany ?? '',
      closingAgentOfficer: closing.closingAgentOfficer ?? '',
      closingAgentEmail: closing.closingAgentEmail ?? '',
      closingAgentPhone: closing.closingAgentPhone ?? '',
      fileNumber: closing.fileNumber ?? '',
      scheduledClosingAt: dateInput(closing.scheduledClosingAt),
      titleStatus: closing.titleStatus,
      structure: closing.structure,
    });
  }, [closing, open]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useDealAction(
    dealId,
    () => ({
      path: `/deals/${dealId}/closing`,
      method: 'PATCH',
      body: {
        closingAgentCompany: f.closingAgentCompany || null,
        closingAgentOfficer: f.closingAgentOfficer || null,
        closingAgentEmail: f.closingAgentEmail || null,
        closingAgentPhone: f.closingAgentPhone || null,
        fileNumber: f.fileNumber || null,
        scheduledClosingAt: toIsoDate(f.scheduledClosingAt) ?? null,
        titleStatus: f.titleStatus,
        structure: f.structure,
      },
    }),
    { success: 'Closing file updated', failure: 'Could not update the closing file' },
    () => onOpenChange(false),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Closing agent and date</DialogTitle>
          <DialogDescription>The title company or closing attorney handling the closing. Due dates follow the closing date.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Company" htmlFor="ca-company">
            <Input id="ca-company" value={f.closingAgentCompany} onChange={set('closingAgentCompany')} />
          </Field>
          <Field label="Officer" htmlFor="ca-officer">
            <Input id="ca-officer" value={f.closingAgentOfficer} onChange={set('closingAgentOfficer')} />
          </Field>
          <Field label="Email" htmlFor="ca-email">
            <Input id="ca-email" type="email" value={f.closingAgentEmail} onChange={set('closingAgentEmail')} />
          </Field>
          <Field label="Phone" htmlFor="ca-phone">
            <Input id="ca-phone" value={f.closingAgentPhone} onChange={set('closingAgentPhone')} />
          </Field>
          <Field label="File number" htmlFor="ca-file">
            <Input id="ca-file" value={f.fileNumber} onChange={set('fileNumber')} />
          </Field>
          <Field label="Scheduled closing" htmlFor="ca-date">
            <Input id="ca-date" type="date" value={f.scheduledClosingAt} onChange={set('scheduledClosingAt')} />
          </Field>
          <Field label="Title status" htmlFor="ca-title">
            <Select id="ca-title" value={f.titleStatus} onChange={set('titleStatus')}>
              {['not_opened', 'opened', 'commitment_received', 'clear', 'issues'].map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Structure" htmlFor="ca-structure">
            <Select id="ca-structure" value={f.structure} onChange={set('structure')}>
              <option value="assignment">Assignment</option>
              <option value="double_close">Double close</option>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RaiseIssueDialog({ dealId, open, onOpenChange }: { dealId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [kind, setKind] = useState('title');
  const [severity, setSeverity] = useState('blocking');
  const [description, setDescription] = useState('');
  const raise = useDealAction(
    dealId,
    () => ({ path: `/deals/${dealId}/closing/issues`, body: { kind, severity, description } }),
    { success: 'Issue raised', failure: 'Could not raise the issue' },
    () => {
      setDescription('');
      onOpenChange(false);
    },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raise an issue</DialogTitle>
          <DialogDescription>A blocking issue stops the closing and, until resolved, stops buyer marketing too.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Kind" htmlFor="ri-kind">
            <Select id="ri-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {['title', 'funding', 'signature', 'contingency', 'deadline', 'other'].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Severity" htmlFor="ri-sev">
            <Select id="ri-sev" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="blocking">Blocking</option>
              <option value="warning">Warning</option>
            </Select>
          </Field>
        </div>
        <Textarea rows={3} placeholder="What is wrong" value={description} onChange={(e) => setDescription(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!description.trim()} loading={raise.isPending} onClick={() => raise.mutate()}>
            Raise
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmClosingDialog({
  dealId,
  expectedFee,
  open,
  onOpenChange,
}: {
  dealId: string;
  expectedFee: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [closedAt, setClosedAt] = useState('');
  const [doc, setDoc] = useState('');
  const [fee, setFee] = useState(expectedFee != null ? String(expectedFee) : '');
  const [received, setReceived] = useState(false);
  const [receivedAt, setReceivedAt] = useState('');
  const confirm = useDealAction(
    dealId,
    () => ({
      path: `/deals/${dealId}/closing/confirm`,
      body: {
        closedAt: toIsoDate(closedAt),
        settlementDocumentId: doc,
        feeOnStatement: Number(fee),
        ...(received && receivedAt ? { feeReceivedAt: toIsoDate(receivedAt) } : {}),
      },
    }),
    { success: 'Closing confirmed', failure: 'Could not confirm the closing' },
    () => onOpenChange(false),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm the closing</DialogTitle>
          <DialogDescription>
            From the final settlement statement. The fee becomes revenue under your recognition rule; Halo never moves money.
          </DialogDescription>
        </DialogHeader>
        <Field label="Closed on" htmlFor="cc-date">
          <Input id="cc-date" type="date" value={closedAt} onChange={(e) => setClosedAt(e.target.value)} />
        </Field>
        <Field label="Settlement statement" htmlFor="cc-doc">
          <DocumentSelect id="cc-doc" dealId={dealId} value={doc} onChange={setDoc} />
        </Field>
        <Field label={`Assignment fee on the statement${expectedFee != null ? ` (expected ${money(expectedFee)})` : ''}`} htmlFor="cc-fee">
          <Input id="cc-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-body text-foreground">
          <Checkbox checked={received} onCheckedChange={(v) => setReceived(v === true)} />
          The fee has already been received
        </label>
        {received && (
          <Field label="Received on" htmlFor="cc-recv">
            <Input id="cc-recv" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
          </Field>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!closedAt || !doc || !fee} loading={confirm.isPending} onClick={() => confirm.mutate()}>
            Confirm closing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeeReceivedDialog({
  dealId,
  expected,
  open,
  onOpenChange,
}: {
  dealId: string;
  expected: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [amount, setAmount] = useState(expected != null ? String(expected) : '');
  const [at, setAt] = useState('');
  const record = useDealAction(
    dealId,
    () => ({ path: `/deals/${dealId}/closing/fee-received`, body: { amount: Number(amount), receivedAt: toIsoDate(at) } }),
    { success: 'Fee recorded as received', failure: 'Could not record the fee' },
    () => onOpenChange(false),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record the fee received</DialogTitle>
          <DialogDescription>The amount that actually arrived, as your bank shows it.</DialogDescription>
        </DialogHeader>
        <Field label="Amount" htmlFor="fr-amount">
          <Input id="fr-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Received on" htmlFor="fr-date">
          <Input id="fr-date" type="date" value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!amount || !at} loading={record.isPending} onClick={() => record.mutate()}>
            Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelAssignmentDialog({
  dealId,
  assignmentId,
  open,
  onOpenChange,
}: {
  dealId: string;
  assignmentId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [cause, setCause] = useState('buyer_default');
  const [reason, setReason] = useState('');
  const cancel = useDealAction<void, { remarketed: boolean; blockedBecause?: string }>(
    dealId,
    () => ({ path: `/assignments/${assignmentId}/cancel`, body: { cause, reason } }),
    {
      success: (out) =>
        out.remarketed ? 'Assignment cancelled; the deal is back on the market' : `Assignment cancelled. ${out.blockedBecause ?? ''}`,
      failure: 'Could not cancel the assignment',
    },
    () => onOpenChange(false),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel the assignment</DialogTitle>
          <DialogDescription>
            A buyer default is recorded against the buyer and lowers their ranking. While the seller contract is still good,
            the deal goes back to marketing and the backup offers are still there.
          </DialogDescription>
        </DialogHeader>
        <Field label="Cause" htmlFor="ca-cause">
          <Select id="ca-cause" value={cause} onChange={(e) => setCause(e.target.value)}>
            <option value="buyer_default">The buyer walked or could not fund</option>
            <option value="our_decision">Our decision</option>
            <option value="seller_issue">A seller issue</option>
            <option value="title_issue">A title issue</option>
          </Select>
        </Field>
        <Textarea rows={3} placeholder="What happened" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button variant="destructive" disabled={!reason.trim()} loading={cancel.isPending} onClick={() => cancel.mutate()}>
            Cancel assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelClosingDialog({ dealId, open, onOpenChange }: { dealId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [reason, setReason] = useState('');
  const cancel = useDealAction(
    dealId,
    () => ({ path: `/deals/${dealId}/closing/cancel`, body: { reason, markDealLost: true } }),
    { success: 'Closing cancelled; the deal is lost', failure: 'Could not cancel the closing' },
    () => onOpenChange(false),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel the closing</DialogTitle>
          <DialogDescription>
            For a deal that will not close at all. The assignment and every campaign end, buyer links stop working, and the
            projected fee is marked lost.
          </DialogDescription>
        </DialogHeader>
        <Textarea rows={3} placeholder="Why" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button variant="destructive" disabled={!reason.trim()} loading={cancel.isPending} onClick={() => cancel.mutate()}>
            Cancel closing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WaiveDialog({
  target,
  onClose,
  onWaive,
  pending,
}: {
  target: { key: string; label: string } | null;
  onClose: () => void;
  onWaive: (note: string) => void;
  pending: boolean;
}) {
  const [note, setNote] = useState('');
  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Waive: {target?.label}</DialogTitle>
          <DialogDescription>Waiving needs a note saying why; it stays on the record.</DialogDescription>
        </DialogHeader>
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!note.trim()} loading={pending} onClick={() => onWaive(note)}>
            Waive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
