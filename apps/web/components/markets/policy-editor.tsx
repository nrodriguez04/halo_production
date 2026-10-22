'use client';

import { useEffect, useMemo, useState } from 'react';
import { Gavel, Plus, Send, Trash2, Undo2 } from 'lucide-react';
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
import { Field } from '@/components/disposition/agreement-panel';
import { DocumentSelect } from '@/components/disposition/document-select';
import { toIsoDate } from '@/lib/disposition';
import { useMarketAction } from './use-market-action';
import {
  ACTIVITIES,
  ACTIVITY_LABEL,
  AUTHORIZATION_KIND_LABEL,
  CHANNEL_LABEL,
  CLASSIFICATION_LABEL,
  STRUCTURE_LABEL,
  TEMPLATE_KIND_LABEL,
  type Classification,
  type MarketDetail,
  type Permission,
  type PolicyContent,
} from '@/lib/markets';

const ANSWERS = ['unknown', 'yes', 'no', 'conditional'] as const;
const PERMS: Permission[] = ['unknown', 'allowed', 'conditional', 'prohibited'];
const SOURCE_TYPES = ['statute', 'regulation', 'regulator_guidance', 'case', 'bill', 'secondary', 'counsel_memo'] as const;
const TIMINGS = ['before_seller_signs', 'before_marketing', 'before_buyer_signs', 'before_closing'] as const;

const ids = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function Section({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          {action}
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

/**
 * The draft policy: research and counsel's answers, edited here and
 * approved as an immutable version. Editing a draft that is with counsel
 * takes it back; the gates keep relying on the last approved version.
 */
export function PolicyEditor({ m }: { m: MarketDetail }) {
  const [c, setC] = useState<PolicyContent | null>(m.draft);
  const [cls, setCls] = useState<Classification>(m.market.draftClassification);
  const [approveOpen, setApproveOpen] = useState(false);
  const [counselName, setCounselName] = useState('');
  const [counselFirm, setCounselFirm] = useState('');
  const [memo, setMemo] = useState('');
  const [expires, setExpires] = useState('');
  const [attest, setAttest] = useState(false);
  const [returnNote, setReturnNote] = useState('');

  useEffect(() => {
    setC(m.draft);
    setCls(m.market.draftClassification);
  }, [m.draft, m.market.draftClassification]);

  const dirty = useMemo(
    () => JSON.stringify(c) !== JSON.stringify(m.draft) || cls !== m.market.draftClassification,
    [c, cls, m.draft, m.market.draftClassification],
  );
  const differsFromApproved = !!m.approved && JSON.stringify(m.draft) !== JSON.stringify(m.approved);
  const inReview = m.market.draftStatus === 'in_review';

  const save = useMarketAction<void, { returnedFromReview: boolean }>(
    m.state,
    () => ({ path: `/markets/${m.state}/draft`, method: 'PUT', body: { content: c, classification: cls } }),
    {
      success: (out) => (out.returnedFromReview ? 'Draft saved and taken back from counsel' : 'Draft saved'),
      failure: 'Could not save the draft',
    },
  );
  const submit = useMarketAction(m.state, () => ({ path: `/markets/${m.state}/submit` }), {
    success: 'Submitted for legal review',
    failure: 'Could not submit',
  });
  const giveBack = useMarketAction(m.state, () => ({ path: `/markets/${m.state}/return`, body: { note: returnNote } }), {
    success: 'Returned to draft',
    failure: 'Could not return it',
  });
  const approve = useMarketAction(
    m.state,
    () => ({
      path: `/markets/${m.state}/approve`,
      body: {
        counselName,
        counselFirm: counselFirm.trim() || null,
        memoDocumentId: memo,
        attest: true,
        reviewExpiresAt: toIsoDate(expires) ?? null,
      },
    }),
    { success: 'Approved: a new policy version is in force', failure: 'Could not approve' },
    () => setApproveOpen(false),
  );

  if (!c) {
    return <p className="text-body text-destructive">The draft could not be read: {m.draftError}</p>;
  }
  const set = (patch: Partial<PolicyContent>) => setC({ ...c, ...patch });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Policy draft</CardTitle>
              <Badge variant={inReview ? 'info' : 'outline'}>{inReview ? 'with counsel' : 'draft'}</Badge>
              {m.legal.version && (
                <Badge variant={differsFromApproved ? 'warning' : 'success'}>
                  {differsFromApproved ? `differs from approved v${m.legal.version}` : `same as approved v${m.legal.version}`}
                </Badge>
              )}
              {m.research.date && <Badge variant="outline">research {m.research.date} · {m.research.confidence} confidence</Badge>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
                Save draft
              </Button>
              {!inReview ? (
                <Button size="sm" disabled={dirty} loading={submit.isPending} onClick={() => submit.mutate()}>
                  <Send size={14} className="mr-1" aria-hidden />
                  Submit for legal review
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="outline" disabled={returnNote.trim().length < 3} loading={giveBack.isPending} onClick={() => giveBack.mutate()}>
                    <Undo2 size={14} className="mr-1" aria-hidden />
                    Return to draft
                  </Button>
                  <Button size="sm" disabled={dirty} onClick={() => setApproveOpen(true)}>
                    <Gavel size={14} className="mr-1" aria-hidden />
                    Record counsel&apos;s approval
                  </Button>
                </>
              )}
            </div>
          </div>
          <CardDescription>
            {m.evaluation.legal.unansweredForApproval.length
              ? `An approval needs answers to: ${m.evaluation.legal.unansweredForApproval.map((q) => m.questions.find((x) => x.key === q)?.label ?? q).join(' ')}`
              : 'Every question an approval needs is answered.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {inReview && (
            <Field label="Note for returning it to draft" htmlFor="pol-return">
              <Input id="pol-return" value={returnNote} onChange={(e) => setReturnNote(e.target.value)} />
            </Field>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Classification" htmlFor="pol-class">
              <Select id="pol-class" value={cls} onChange={(e) => setCls(e.target.value as Classification)}>
                {(Object.keys(CLASSIFICATION_LABEL) as Classification[]).map((k) => (
                  <option key={k} value={k}>
                    {CLASSIFICATION_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Summary" htmlFor="pol-summary">
                <Textarea id="pol-summary" rows={3} value={c.summary} onChange={(e) => set({ summary: e.target.value })} />
              </Field>
            </div>
          </div>
        </CardContent>
      </Card>

      <Section title="Questions" description="Counsel's answer to each. Unknown permits nothing; an approval needs the ones marked required.">
        {m.questions.map((q) => {
          const f = c.answers[q.key];
          return (
            <div key={q.key} className="grid gap-2 border-b border-border pb-3 last:border-0 lg:grid-cols-[1fr_9rem_1.4fr_8rem]">
              <p className="text-body">
                {q.label} {q.requiredForApproval && <Badge variant="outline">required</Badge>}
              </p>
              <Select
                aria-label={`${q.label} answer`}
                value={f.answer}
                onChange={(e) => set({ answers: { ...c.answers, [q.key]: { ...f, answer: e.target.value as typeof f.answer } } })}
              >
                {ANSWERS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
              <Textarea
                aria-label={`${q.label} note`}
                rows={2}
                value={f.note}
                onChange={(e) => set({ answers: { ...c.answers, [q.key]: { ...f, note: e.target.value } } })}
              />
              <Input
                aria-label={`${q.label} sources`}
                placeholder="s1, s2"
                value={f.sourceIds.join(', ')}
                onChange={(e) => set({ answers: { ...c.answers, [q.key]: { ...f, sourceIds: ids(e.target.value) } } })}
              />
            </div>
          );
        })}
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Transaction structures" description="How a contract may be disposed of here.">
          {Object.keys(STRUCTURE_LABEL).map((k) => (
            <PermissionRow key={k} label={STRUCTURE_LABEL[k]} entry={c.structures[k]} onChange={(v) => set({ structures: { ...c.structures, [k]: v } })} />
          ))}
        </Section>
        <Section title="Marketing channels" description="Where a contract may be marketed.">
          {Object.keys(CHANNEL_LABEL).map((k) => (
            <PermissionRow key={k} label={CHANNEL_LABEL[k]} entry={c.channels[k]} onChange={(v) => set({ channels: { ...c.channels, [k]: v } })} />
          ))}
        </Section>
      </div>

      <Section
        title="Disclosures"
        description="Each is required on file before the step its timing names. With a template kind, Halo generates it from the approved template."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              set({
                disclosures: [
                  ...c.disclosures,
                  { key: `${m.state.toLowerCase()}_disclosure_${c.disclosures.length + 1}`, title: 'New disclosure', audience: 'buyer', timing: 'before_marketing', templateKind: null, sourceIds: [] },
                ],
              })
            }
          >
            <Plus size={14} className="mr-1" aria-hidden />
            Add
          </Button>
        }
      >
        {c.disclosures.length === 0 && <p className="text-caption text-muted-foreground">None.</p>}
        {c.disclosures.map((d, i) => {
          const upd = (patch: Partial<typeof d>) => set({ disclosures: c.disclosures.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div key={i} className="grid gap-2 border-b border-border pb-3 last:border-0 xl:grid-cols-[10rem_1fr_7rem_10rem_10rem_6rem_2rem] xl:border-0 xl:pb-0">
              <Input aria-label="Key" value={d.key} onChange={(e) => upd({ key: e.target.value })} />
              <Input aria-label="Title" value={d.title} onChange={(e) => upd({ title: e.target.value })} />
              <Select aria-label="Audience" value={d.audience} onChange={(e) => upd({ audience: e.target.value as 'seller' | 'buyer' })}>
                <option value="seller">seller</option>
                <option value="buyer">buyer</option>
              </Select>
              <Select aria-label="Timing" value={d.timing} onChange={(e) => upd({ timing: e.target.value as typeof d.timing })}>
                {TIMINGS.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
              <Select aria-label="Template kind" value={d.templateKind ?? ''} onChange={(e) => upd({ templateKind: e.target.value || null })}>
                <option value="">document only</option>
                {Object.keys(TEMPLATE_KIND_LABEL).map((k) => (
                  <option key={k} value={k}>
                    {TEMPLATE_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
              <Input aria-label="Sources" placeholder="s1" value={d.sourceIds.join(', ')} onChange={(e) => upd({ sourceIds: ids(e.target.value) })} />
              <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => set({ disclosures: c.disclosures.filter((_, j) => j !== i) })}>
                <Trash2 size={14} />
              </Button>
            </div>
          );
        })}
      </Section>

      <Section
        title="Cancellation and notice windows"
        description="Counted from the trigger in the state's time zone; business days skip weekends and federal holidays."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              set({
                deadlines: [
                  ...c.deadlines,
                  { key: `window_${c.deadlines.length + 1}`, label: 'Seller may cancel', trigger: 'seller_signed', days: 3, businessDays: true, effect: 'seller_may_cancel', blocksMarketing: true, sourceIds: [] },
                ],
              })
            }
          >
            <Plus size={14} className="mr-1" aria-hidden />
            Add
          </Button>
        }
      >
        {c.deadlines.length === 0 && <p className="text-caption text-muted-foreground">None.</p>}
        {c.deadlines.map((d, i) => {
          const upd = (patch: Partial<typeof d>) => set({ deadlines: c.deadlines.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div key={i} className="grid items-center gap-2 border-b border-border pb-3 last:border-0 xl:grid-cols-[8rem_1fr_9rem_5rem_7rem_10rem_8rem_2rem] xl:border-0 xl:pb-0">
              <Input aria-label="Key" value={d.key} onChange={(e) => upd({ key: e.target.value })} />
              <Input aria-label="Label" value={d.label} onChange={(e) => upd({ label: e.target.value })} />
              <Select aria-label="Trigger" value={d.trigger} onChange={(e) => upd({ trigger: e.target.value as typeof d.trigger })}>
                <option value="seller_signed">seller signs</option>
                <option value="assignment_signed">assignment signed</option>
              </Select>
              <Input aria-label="Days" type="number" min={0} max={365} value={d.days} onChange={(e) => upd({ days: Number(e.target.value) })} />
              <label className="flex items-center gap-1 text-caption">
                <Checkbox checked={d.businessDays} onCheckedChange={(v) => upd({ businessDays: v === true })} />
                business
              </label>
              <Select aria-label="Effect" value={d.effect} onChange={(e) => upd({ effect: e.target.value as typeof d.effect })}>
                <option value="seller_may_cancel">seller may cancel</option>
                <option value="buyer_may_cancel">buyer may cancel</option>
                <option value="notice_due">notice due</option>
              </Select>
              <label className="flex items-center gap-1 text-caption">
                <Checkbox checked={d.blocksMarketing} onCheckedChange={(v) => upd({ blocksMarketing: v === true })} />
                holds marketing
              </label>
              <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => set({ deadlines: c.deadlines.filter((_, j) => j !== i) })}>
                <Trash2 size={14} />
              </Button>
            </div>
          );
        })}
      </Section>

      <Section
        title="Licences and registrations required"
        description="Each must be on file, verified and current for the activities it applies to."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              set({
                requirements: [
                  ...c.requirements,
                  { key: `requirement_${c.requirements.length + 1}`, kind: 'other', label: 'New requirement', appliesTo: ['seller_contracting'], sourceIds: [] },
                ],
              })
            }
          >
            <Plus size={14} className="mr-1" aria-hidden />
            Add
          </Button>
        }
      >
        {c.requirements.length === 0 && <p className="text-caption text-muted-foreground">None.</p>}
        {c.requirements.map((r, i) => {
          const upd = (patch: Partial<typeof r>) => set({ requirements: c.requirements.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div key={i} className="space-y-2 rounded-md border border-border p-3">
              <div className="grid gap-2 xl:grid-cols-[10rem_14rem_1fr_2rem]">
                <Input aria-label="Key" value={r.key} onChange={(e) => upd({ key: e.target.value })} />
                <Select aria-label="Kind" value={r.kind} onChange={(e) => upd({ kind: e.target.value })}>
                  {Object.keys(AUTHORIZATION_KIND_LABEL).map((k) => (
                    <option key={k} value={k}>
                      {AUTHORIZATION_KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
                <Input aria-label="Label" value={r.label} onChange={(e) => upd({ label: e.target.value })} />
                <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => set({ requirements: c.requirements.filter((_, j) => j !== i) })}>
                  <Trash2 size={14} />
                </Button>
              </div>
              <div className="flex flex-wrap gap-3">
                {ACTIVITIES.filter((a) => a !== 'research').map((a) => (
                  <label key={a} className="flex items-center gap-1 text-caption">
                    <Checkbox
                      checked={r.appliesTo.includes(a)}
                      onCheckedChange={(v) => upd({ appliesTo: v === true ? [...r.appliesTo, a] : r.appliesTo.filter((x) => x !== a) })}
                    />
                    {ACTIVITY_LABEL[a]}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </Section>

      <Section
        title="Sources"
        description="What the answers rely on. Answers cite these by id."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              set({
                sources: [...c.sources, { id: `s${c.sources.length + 1}`, citation: 'New source', title: '', url: null, type: 'statute', effectiveDate: null, summary: '' }],
              })
            }
          >
            <Plus size={14} className="mr-1" aria-hidden />
            Add
          </Button>
        }
      >
        {c.sources.map((s, i) => {
          const upd = (patch: Partial<typeof s>) => set({ sources: c.sources.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div key={i} className="grid gap-2 border-b border-border pb-3 last:border-0 xl:grid-cols-[4rem_1fr_1fr_9rem_9rem_2rem] xl:border-0 xl:pb-0">
              <Input aria-label="Id" value={s.id} onChange={(e) => upd({ id: e.target.value })} />
              <Input aria-label="Citation" value={s.citation} onChange={(e) => upd({ citation: e.target.value })} title={s.summary} />
              <Input aria-label="URL" value={s.url ?? ''} onChange={(e) => upd({ url: e.target.value.trim() || null })} />
              <Select aria-label="Type" value={s.type} onChange={(e) => upd({ type: e.target.value as typeof s.type })}>
                {SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
              <Input aria-label="Effective date" type="date" value={s.effectiveDate ?? ''} onChange={(e) => upd({ effectiveDate: e.target.value || null })} />
              <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => set({ sources: c.sources.filter((_, j) => j !== i) })}>
                <Trash2 size={14} />
              </Button>
            </div>
          );
        })}
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Open questions for counsel">
          <Textarea rows={6} value={c.openQuestions.join('\n')} onChange={(e) => set({ openQuestions: e.target.value.split('\n').filter((x) => x.trim()) })} />
        </Section>
        <Section title="Steps to activate">
          <Textarea rows={6} value={c.activationSteps.join('\n')} onChange={(e) => set({ activationSteps: e.target.value.split('\n').filter((x) => x.trim()) })} />
        </Section>
        <Section title="Local rules">
          <Textarea rows={3} value={c.localRules ?? ''} onChange={(e) => set({ localRules: e.target.value || null })} />
        </Section>
        <Section title="Pending legislation" description="Bills research found; the Market Expansion agent watches these.">
          {c.pendingLegislation.length === 0 ? (
            <p className="text-caption text-muted-foreground">None found.</p>
          ) : (
            <ul className="space-y-2">
              {c.pendingLegislation.map((b) => (
                <li key={b.bill} className="text-caption">
                  <span className="font-medium">{b.bill}</span> {b.session && `(${b.session})`}: {b.status}
                  <div className="text-muted-foreground">{b.summary}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record counsel&apos;s approval of the {m.name} policy</DialogTitle>
            <DialogDescription>
              This snapshots the draft as a new version the gates rely on. It never changes afterwards; a later approval supersedes it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Counsel" htmlFor="ap-counsel">
                <Input id="ap-counsel" value={counselName} onChange={(e) => setCounselName(e.target.value)} />
              </Field>
              <Field label="Firm" htmlFor="ap-firm">
                <Input id="ap-firm" value={counselFirm} onChange={(e) => setCounselFirm(e.target.value)} />
              </Field>
            </div>
            <Field label="Counsel's memo or approval letter" htmlFor="ap-memo">
              <DocumentSelect id="ap-memo" value={memo} onChange={setMemo} placeholder="Choose the memo…" />
            </Field>
            <Field label="Review expires (default 12 months)" htmlFor="ap-exp">
              <Input id="ap-exp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </Field>
            <label className="flex items-start gap-2 text-body">
              <Checkbox checked={attest} onCheckedChange={(v) => setAttest(v === true)} className="mt-1" />
              <span>{m.attestation}</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!attest || !memo || counselName.trim().length < 2} loading={approve.isPending} onClick={() => approve.mutate()}>
              Approve version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PermissionRow({
  label,
  entry,
  onChange,
}: {
  label: string;
  entry: { permission: Permission; conditions: string | null };
  onChange: (v: { permission: Permission; conditions: string | null }) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-[1fr_9rem]">
      <p className="text-body">{label}</p>
      <Select aria-label={label} value={entry.permission} onChange={(e) => onChange({ ...entry, permission: e.target.value as Permission })}>
        {PERMS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Select>
      {entry.permission === 'conditional' && (
        <Textarea
          className="md:col-span-2"
          rows={2}
          aria-label={`${label} conditions`}
          placeholder="The conditions, in counsel's words"
          value={entry.conditions ?? ''}
          onChange={(e) => onChange({ ...entry, conditions: e.target.value || null })}
        />
      )}
    </div>
  );
}
