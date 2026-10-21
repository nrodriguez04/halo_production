'use client';

import { useEffect, useState } from 'react';
import { FileCheck2, ShieldCheck } from 'lucide-react';
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
import { DocumentSelect } from './document-select';
import { useDealAction } from './use-deal-action';
import { dateInput, day, money, toIsoDate, type PurchaseAgreement } from '@/lib/disposition';

const VERIFY_ITEMS: Array<{ key: string; label: string }> = [
  { key: 'parties', label: 'Seller and buyer names match the title and our entity' },
  { key: 'property', label: 'Property address and legal description are correct' },
  { key: 'purchase_price', label: 'Purchase price matches what is recorded here' },
  { key: 'earnest_money', label: 'Earnest money amount and deadline match' },
  { key: 'closing_deadline', label: 'Closing deadline matches' },
  { key: 'assignment_clause', label: 'The assignment clause says what is recorded here' },
  { key: 'signatures', label: 'Every party signed and dated' },
];

const ASSIGNABILITY = [
  { value: 'unknown', label: 'Not yet determined' },
  { value: 'permitted', label: 'Assignable without consent' },
  { value: 'consent_required', label: "Assignable with the seller's written consent" },
  { value: 'prohibited', label: 'Assignment prohibited' },
];

interface TermsForm {
  purchasePrice: string;
  earnestMoneyAmount: string;
  earnestMoneyDueAt: string;
  inspectionEndsAt: string;
  closingDeadline: string;
  assignability: string;
  assignmentClause: string;
  sellerConsentDocumentId: string;
  notes: string;
}

function formFrom(a: PurchaseAgreement | null): TermsForm {
  return {
    purchasePrice: a?.purchasePrice != null ? String(a.purchasePrice) : '',
    earnestMoneyAmount: a?.earnestMoneyAmount != null ? String(a.earnestMoneyAmount) : '',
    earnestMoneyDueAt: dateInput(a?.earnestMoneyDueAt),
    inspectionEndsAt: dateInput(a?.inspectionEndsAt),
    closingDeadline: dateInput(a?.closingDeadline),
    assignability: a?.assignability ?? 'unknown',
    assignmentClause: a?.assignmentClause ?? '',
    sellerConsentDocumentId: a?.sellerConsentDocumentId ?? '',
    notes: a?.notes ?? '',
  };
}

function termsBody(f: TermsForm) {
  const num = (s: string) => (s.trim() ? Number(s) : null);
  return {
    purchasePrice: num(f.purchasePrice),
    earnestMoneyAmount: num(f.earnestMoneyAmount),
    earnestMoneyDueAt: toIsoDate(f.earnestMoneyDueAt) ?? null,
    inspectionEndsAt: toIsoDate(f.inspectionEndsAt) ?? null,
    closingDeadline: toIsoDate(f.closingDeadline) ?? null,
    assignability: f.assignability,
    assignmentClause: f.assignmentClause.trim() || null,
    sellerConsentDocumentId: f.sellerConsentDocumentId || null,
    notes: f.notes.trim() || null,
  };
}

const STATUS_VARIANT: Record<string, 'secondary' | 'info' | 'success' | 'destructive'> = {
  draft: 'secondary',
  sent: 'info',
  executed: 'success',
  terminated: 'destructive',
  expired: 'destructive',
};

/**
 * The seller contract: its terms, the signed copy, and the verification a
 * person does against it. Marketing waits for that verification.
 */
export function AgreementPanel({ dealId, agreement }: { dealId: string; agreement: PurchaseAgreement | null }) {
  const [form, setForm] = useState<TermsForm>(formFrom(agreement));
  const [executedDoc, setExecutedDoc] = useState('');
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [verifyNote, setVerifyNote] = useState('');
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendDate, setExtendDate] = useState('');
  const [extendDoc, setExtendDoc] = useState('');
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [terminateReason, setTerminateReason] = useState('');
  const [emdDate, setEmdDate] = useState('');

  useEffect(() => setForm(formFrom(agreement)), [agreement]);
  const set = (k: keyof TermsForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const open = agreement && ['draft', 'sent', 'executed'].includes(agreement.status) ? agreement : null;
  const base = `/deals/${dealId}/purchase-agreement`;

  const record = useDealAction<'draft' | 'executed'>(
    dealId,
    (status) => ({
      path: base,
      body: { ...termsBody(form), status, ...(status === 'executed' ? { executedDocumentId: executedDoc } : {}) },
    }),
    { success: 'Seller contract recorded', failure: 'Could not record the contract' },
  );
  const save = useDealAction(dealId, () => ({ path: base, method: 'PATCH', body: termsBody(form) }), {
    success: 'Terms saved',
    failure: 'Could not save the terms',
  });
  const markExecuted = useDealAction(
    dealId,
    () => ({ path: `${base}/executed`, body: { executedDocumentId: executedDoc } }),
    { success: 'Executed copy recorded', failure: 'Could not record the executed copy' },
  );
  const verify = useDealAction<void, { stageChanged: string | null }>(
    dealId,
    () => ({
      path: `${base}/verify`,
      body: { confirmations: Object.fromEntries(VERIFY_ITEMS.map((i) => [i.key, true])), ...(verifyNote ? { note: verifyNote } : {}) },
    }),
    {
      success: (out) => (out.stageChanged ? 'Verified: the deal is now marketed' : 'Verified. Clear the remaining checks to market it.'),
      failure: 'Could not verify',
    },
    () => setVerifyOpen(false),
  );
  const emd = useDealAction(dealId, () => ({ path: `${base}/earnest-money`, body: { depositedAt: toIsoDate(emdDate) } }), {
    success: 'Earnest money deposit recorded',
    failure: 'Could not record the deposit',
  });
  const extend = useDealAction(
    dealId,
    () => ({ path: `${base}/extend`, body: { closingDeadline: toIsoDate(extendDate), documentId: extendDoc } }),
    { success: 'Deadline extended', failure: 'Could not extend' },
    () => setExtendOpen(false),
  );
  const terminate = useDealAction(
    dealId,
    () => ({ path: `${base}/terminate`, body: { reason: terminateReason } }),
    { success: 'Contract terminated; buyer marketing stopped', failure: 'Could not terminate' },
    () => setTerminateOpen(false),
  );

  const allChecked = VERIFY_ITEMS.every((i) => checked[i.key]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileCheck2 size={16} className="text-primary" aria-hidden />
              <CardTitle>Seller contract</CardTitle>
              {agreement && <Badge variant={STATUS_VARIANT[agreement.status]}>{agreement.status}</Badge>}
              {agreement?.verifiedAt && <Badge variant="success">verified {day(agreement.verifiedAt)}</Badge>}
            </div>
            {open?.status === 'executed' && !open.verifiedAt && (
              <Button size="sm" onClick={() => setVerifyOpen(true)}>
                <ShieldCheck size={14} className="mr-1" aria-hidden />
                Verify against the signed copy
              </Button>
            )}
          </div>
          <CardDescription>
            Record the terms from the agreement. Changing a verified term clears the verification.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Purchase price" htmlFor="pa-price">
              <Input id="pa-price" inputMode="decimal" value={form.purchasePrice} onChange={set('purchasePrice')} />
            </Field>
            <Field label="Earnest money" htmlFor="pa-emd">
              <Input id="pa-emd" inputMode="decimal" value={form.earnestMoneyAmount} onChange={set('earnestMoneyAmount')} />
            </Field>
            <Field label="Earnest money due" htmlFor="pa-emd-due">
              <Input id="pa-emd-due" type="date" value={form.earnestMoneyDueAt} onChange={set('earnestMoneyDueAt')} />
            </Field>
            <Field label="Inspection period ends" htmlFor="pa-insp">
              <Input id="pa-insp" type="date" value={form.inspectionEndsAt} onChange={set('inspectionEndsAt')} />
            </Field>
            <Field label="Closing deadline" htmlFor="pa-close">
              <Input id="pa-close" type="date" value={form.closingDeadline} onChange={set('closingDeadline')} />
            </Field>
            <Field label="Assignment clause says" htmlFor="pa-assign">
              <Select id="pa-assign" value={form.assignability} onChange={set('assignability')}>
                {ASSIGNABILITY.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Assignment clause (text or where it is)" htmlFor="pa-clause">
            <Textarea id="pa-clause" rows={2} value={form.assignmentClause} onChange={set('assignmentClause')} />
          </Field>
          {form.assignability === 'consent_required' && (
            <Field label="Seller's signed consent to assign" htmlFor="pa-consent">
              <DocumentSelect
                id="pa-consent"
                dealId={dealId}
                value={form.sellerConsentDocumentId}
                onChange={(v) => setForm((f) => ({ ...f, sellerConsentDocumentId: v }))}
              />
            </Field>
          )}
          <Field label="Notes" htmlFor="pa-notes">
            <Textarea id="pa-notes" rows={2} value={form.notes} onChange={set('notes')} />
          </Field>

          {!open ? (
            <div className="space-y-3 rounded-md border border-border bg-secondary/30 p-3">
              <p className="text-body text-muted-foreground">
                Signed outside DocuSign? Pick the executed copy and record it as executed. Otherwise save the terms as a
                draft and send the agreement for signature from the Contracts card below.
              </p>
              <DocumentSelect dealId={dealId} value={executedDoc} onChange={setExecutedDoc} placeholder="Executed copy (if signed)…" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" loading={record.isPending} onClick={() => record.mutate('draft')}>
                  Save as draft
                </Button>
                <Button size="sm" disabled={!executedDoc} loading={record.isPending} onClick={() => record.mutate('executed')}>
                  Record as executed
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" loading={save.isPending} onClick={() => save.mutate()}>
                Save terms
              </Button>
              {open.status !== 'executed' && (
                <>
                  <div className="min-w-64 flex-1">
                    <DocumentSelect dealId={dealId} value={executedDoc} onChange={setExecutedDoc} placeholder="Executed copy…" />
                  </div>
                  <Button size="sm" disabled={!executedDoc} loading={markExecuted.isPending} onClick={() => markExecuted.mutate()}>
                    Record executed copy
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {open?.status === 'executed' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Deposit, deadline, termination</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="text-caption uppercase tracking-wider text-muted-foreground">Earnest money</p>
                <p className="text-body text-foreground">
                  {money(open.earnestMoneyAmount)} ·{' '}
                  {open.earnestMoneyDepositedAt ? `deposited ${day(open.earnestMoneyDepositedAt)}` : `due ${day(open.earnestMoneyDueAt)}`}
                </p>
              </div>
              {!open.earnestMoneyDepositedAt && (open.earnestMoneyAmount ?? 0) > 0 && (
                <>
                  <Input type="date" className="w-44" value={emdDate} onChange={(e) => setEmdDate(e.target.value)} aria-label="Deposit date" />
                  <Button size="sm" variant="outline" disabled={!emdDate} loading={emd.isPending} onClick={() => emd.mutate()}>
                    Record deposit
                  </Button>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setExtendOpen(true)}>
                Record a signed extension
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setTerminateOpen(true)}>
                Terminate contract
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Verify the signed contract</DialogTitle>
            <DialogDescription>
              Open the executed copy and check each term against what is recorded. Halo relies on these terms to market
              and assign the contract.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {VERIFY_ITEMS.map((i) => (
              <li key={i.key} className="flex items-start gap-2">
                <Checkbox
                  id={`v-${i.key}`}
                  checked={!!checked[i.key]}
                  onCheckedChange={(v) => setChecked((c) => ({ ...c, [i.key]: v === true }))}
                />
                <label htmlFor={`v-${i.key}`} className="text-body text-foreground">
                  {i.label}
                </label>
              </li>
            ))}
          </ul>
          <Textarea placeholder="Note (optional)" rows={2} value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!allChecked} loading={verify.isPending} onClick={() => verify.mutate()}>
              Verify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a signed extension</DialogTitle>
            <DialogDescription>The new deadline needs the extension the seller signed, in the library.</DialogDescription>
          </DialogHeader>
          <Field label="New closing deadline" htmlFor="ext-date">
            <Input id="ext-date" type="date" value={extendDate} onChange={(e) => setExtendDate(e.target.value)} />
          </Field>
          <Field label="Signed extension" htmlFor="ext-doc">
            <DocumentSelect id="ext-doc" dealId={dealId} value={extendDoc} onChange={setExtendDoc} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!extendDate || !extendDoc} loading={extend.isPending} onClick={() => extend.mutate()}>
              Extend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={terminateOpen} onOpenChange={setTerminateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terminate the seller contract</DialogTitle>
            <DialogDescription>
              Every campaign ends and every buyer link stops working at once, so Halo never advertises a contract it no
              longer holds.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={3} placeholder="Why" value={terminateReason} onChange={(e) => setTerminateReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTerminateOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!terminateReason.trim()} loading={terminate.isPending} onClick={() => terminate.mutate()}>
              Terminate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-caption uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
