'use client';

import { useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
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
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { toast } from '@/components/ui/toast';
import { Field } from '@/components/disposition/agreement-panel';
import { day, errorText, toIsoDate } from '@/lib/disposition';

interface Policy {
  id: string;
  state: string;
  status: 'draft' | 'reviewed' | 'retired';
  assignmentAllowed: string;
  doubleCloseAllowed: string;
  licenseRequired: string;
  licenseDocumentId: string | null;
  publicMarketingAllowed: string;
  buyerDisclosureKeys: string[];
  conditions: string | null;
  references: string | null;
  notes: string | null;
  reviewedAt: string | null;
  reviewExpiresAt: string | null;
}

interface PolicyList {
  policies: Policy[];
  needsReview: Array<{ state: string; openDeals: number }>;
  templates: string[];
  checklistKeys: Array<{ key: string; title: string }>;
}

const PERMISSION = ['unknown', 'allowed', 'conditional', 'prohibited'];
const TRI = ['unknown', 'yes', 'no'];

/**
 * State rules (docs/contract-flipping.md s4): what the operator, with
 * counsel, has confirmed about assigning contracts in each state. A state
 * without a reviewed policy holds its deals for review; Halo never assumes
 * wholesaling is allowed somewhere.
 */
export default function StatesPage() {
  const list = useApiQuery<PolicyList>('/compliance/jurisdictions');
  const [editing, setEditing] = useState<string | null>(null);
  const [newState, setNewState] = useState('');
  const qc = useQueryClient();
  const fromTemplate = useApiMutation<string>(
    (state) => apiJson(`/compliance/jurisdictions/${state}/from-template`, { method: 'POST' }),
    {
      onSuccess: (_o, state) => {
        toast.success(`${state} draft started from the template`);
        qc.invalidateQueries({ queryKey: ['/compliance/jurisdictions'] });
        setEditing(state);
      },
      onError: (err) => toast.error('Could not start the draft', { description: errorText(err) }),
    },
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Compliance"
        title="State rules"
        description="Record what counsel confirmed about assigning contracts in each state you operate in. Until a state's policy is reviewed, its deals cannot be marketed."
      />
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState title="Could not load" description={errorText(list.error)} onRetry={() => list.refetch()} />
      ) : (
        <>
          {list.data.needsReview.length > 0 && (
            <Card className="border-amber-500/30">
              <CardHeader className="pb-3">
                <CardTitle>States holding deals for review</CardTitle>
                <CardDescription>These states have open deals and no reviewed policy.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {list.data.needsReview.map((n) => (
                  <Button key={n.state} size="sm" variant="outline" onClick={() => setEditing(n.state)}>
                    {n.state} · {n.openDeals} deal(s)
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Scale size={16} className="text-primary" aria-hidden />
                  <CardTitle>Policies</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    className="w-20 uppercase"
                    maxLength={2}
                    placeholder="ST"
                    value={newState}
                    onChange={(e) => setNewState(e.target.value.toUpperCase())}
                    aria-label="State code"
                  />
                  <Button size="sm" variant="outline" disabled={newState.length !== 2} onClick={() => setEditing(newState)}>
                    Add state
                  </Button>
                  {list.data.templates
                    .filter((t) => !list.data.policies.some((p) => p.state === t))
                    .map((t) => (
                      <Button key={t} size="sm" variant="ghost" onClick={() => fromTemplate.mutate(t)}>
                        Start {t} from template
                      </Button>
                    ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {list.data.policies.length === 0 ? (
                <EmptyState
                  icon={Scale}
                  title="No state reviewed yet"
                  description="Add the states you operate in. Templates are pointers for counsel, not answers."
                />
              ) : (
                <ul className="space-y-2">
                  {list.data.policies.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-h3 font-bold text-foreground">{p.state}</span>
                          <Badge variant={p.status === 'reviewed' ? 'success' : p.status === 'retired' ? 'secondary' : 'warning'}>
                            {p.status}
                          </Badge>
                          <Badge variant="outline">assignment: {p.assignmentAllowed}</Badge>
                          <Badge variant="outline">licence: {p.licenseRequired}</Badge>
                          {p.buyerDisclosureKeys.length > 0 && <Badge variant="outline">{p.buyerDisclosureKeys.length} buyer disclosure(s)</Badge>}
                        </div>
                        <p className="text-caption text-muted-foreground">
                          {p.reviewedAt ? `Reviewed ${day(p.reviewedAt)}` : 'Not reviewed'}
                          {p.reviewExpiresAt ? ` · until ${day(p.reviewExpiresAt)}` : ''}
                          {p.conditions ? ` · ${p.conditions}` : ''}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setEditing(p.state)}>
                        Open
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <TemplatesCard />
          {editing && (
            <PolicyDialog
              state={editing}
              policy={list.data.policies.find((p) => p.state === editing) ?? null}
              checklistKeys={list.data.checklistKeys}
              onClose={() => setEditing(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function PolicyDialog({
  state,
  policy,
  checklistKeys,
  onClose,
}: {
  state: string;
  policy: Policy | null;
  checklistKeys: Array<{ key: string; title: string }>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    assignmentAllowed: 'unknown',
    doubleCloseAllowed: 'unknown',
    licenseRequired: 'unknown',
    publicMarketingAllowed: 'unknown',
    conditions: '',
    references: '',
    notes: '',
  });
  const [keys, setKeys] = useState<string[]>([]);
  const [expires, setExpires] = useState('');
  useEffect(() => {
    setF({
      assignmentAllowed: policy?.assignmentAllowed ?? 'unknown',
      doubleCloseAllowed: policy?.doubleCloseAllowed ?? 'unknown',
      licenseRequired: policy?.licenseRequired ?? 'unknown',
      publicMarketingAllowed: policy?.publicMarketingAllowed ?? 'unknown',
      conditions: policy?.conditions ?? '',
      references: policy?.references ?? '',
      notes: policy?.notes ?? '',
    });
    setKeys(policy?.buyerDisclosureKeys ?? []);
  }, [policy]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const done = () => qc.invalidateQueries({ queryKey: ['/compliance/jurisdictions'] });

  const save = useApiMutation(
    () =>
      apiJson(`/compliance/jurisdictions/${state}`, {
        method: 'PUT',
        body: JSON.stringify({
          assignmentAllowed: f.assignmentAllowed,
          doubleCloseAllowed: f.doubleCloseAllowed,
          licenseRequired: f.licenseRequired,
          publicMarketingAllowed: f.publicMarketingAllowed,
          buyerDisclosureKeys: keys,
          conditions: f.conditions || null,
          references: f.references || null,
          notes: f.notes || null,
        }),
      }),
    {
      onSuccess: () => {
        toast.success(`${state} saved`, { description: policy?.status === 'reviewed' ? 'Changing a reviewed answer puts it back to draft.' : undefined });
        done();
      },
      onError: (err) => toast.error('Could not save', { description: errorText(err) }),
    },
  );
  const review = useApiMutation(
    () =>
      apiJson(`/compliance/jurisdictions/${state}/review`, {
        method: 'POST',
        body: JSON.stringify({ references: f.references, ...(expires ? { reviewExpiresAt: toIsoDate(expires) } : {}) }),
      }),
    {
      onSuccess: () => {
        toast.success(`${state} reviewed`, { description: 'Deals in this state can now pass the gate.' });
        done();
        onClose();
      },
      onError: (err) => toast.error('Could not mark reviewed', { description: errorText(err) }),
    },
  );

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{state} policy</DialogTitle>
          <DialogDescription>
            Answers come from counsel, not from Halo. Leave a question unknown until you know; unknown is never treated as
            permission.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Assigning a purchase contract" htmlFor="p-assign">
            <Select id="p-assign" value={f.assignmentAllowed} onChange={set('assignmentAllowed')}>
              {PERMISSION.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Licence required" htmlFor="p-licence">
            <Select id="p-licence" value={f.licenseRequired} onChange={set('licenseRequired')}>
              {TRI.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Double close" htmlFor="p-double">
            <Select id="p-double" value={f.doubleCloseAllowed} onChange={set('doubleCloseAllowed')}>
              {PERMISSION.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Marketing to buyers with no prior relationship" htmlFor="p-public">
            <Select id="p-public" value={f.publicMarketingAllowed} onChange={set('publicMarketingAllowed')}>
              {PERMISSION.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {f.assignmentAllowed === 'conditional' && (
          <Field label="Conditions" htmlFor="p-cond">
            <Textarea id="p-cond" rows={2} value={f.conditions} onChange={set('conditions')} />
          </Field>
        )}
        <div className="space-y-1">
          <p className="text-caption uppercase tracking-wider text-muted-foreground">Buyers must receive (on file for the deal)</p>
          <div className="grid gap-1 md:grid-cols-2">
            {checklistKeys.map((k) => (
              <label key={k.key} className="flex items-center gap-2 text-body text-foreground">
                <Checkbox
                  checked={keys.includes(k.key)}
                  onCheckedChange={(v) => setKeys((ks) => (v === true ? [...ks, k.key] : ks.filter((x) => x !== k.key)))}
                />
                {k.title}
              </label>
            ))}
          </div>
        </div>
        <Field label="What the review relied on (statutes, counsel memo)" htmlFor="p-refs">
          <Textarea id="p-refs" rows={3} value={f.references} onChange={set('references')} />
        </Field>
        <Field label="Notes" htmlFor="p-notes">
          <Textarea id="p-notes" rows={2} value={f.notes} onChange={set('notes')} />
        </Field>
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-secondary/30 p-3">
          <Field label="Review valid until (optional)" htmlFor="p-exp">
            <Input id="p-exp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
          <Button
            variant="outline"
            disabled={!policy || !f.references.trim() || review.isPending}
            onClick={() => review.mutate(undefined)}
            title={policy ? undefined : 'Save the policy first'}
          >
            Mark reviewed
          </Button>
          <p className="text-caption text-muted-foreground">
            Save first. A review must answer whether assignment is allowed and whether a licence is required.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TemplateRow {
  id: string;
  title: string;
  fileName: string;
  jurisdiction: string | null;
  fillable: boolean;
  reviewed: boolean;
  kinds: string[];
}

const FIELDS_HINT =
  'Purchase agreement blanks: {{effective_date}} {{buyer_entity}} {{seller_name}} {{property_address}} {{property_city}} {{property_state}} {{property_zip}} {{purchase_price}} {{earnest_money}} {{earnest_money_due}} {{inspection_ends}} {{closing_deadline}}. ' +
  'Assignment blanks: {{effective_date}} {{assignor_entity}} {{assignee_name}} {{seller_name}} {{property_address}} {{property_city}} {{property_state}} {{property_zip}} {{original_contract_date}} {{original_purchase_price}} {{assignment_price}} {{assignment_fee}} {{buyer_deposit}} {{buyer_deposit_due}} {{closing_deadline}} {{closing_agent}}.';

/**
 * Agreement templates: the wording counsel approved, as text with blanks.
 * Marking one reviewed lets Halo fill it for deals in its state; the
 * blanks are checked at review so a reviewed template never asks for a
 * field Halo cannot fill.
 */
function TemplatesCard() {
  const qc = useQueryClient();
  const list = useApiQuery<TemplateRow[]>('/agreement-templates');
  const [kind, setKind] = useState<Record<string, string>>({});
  const [state, setState] = useState<Record<string, string>>({});
  const review = useApiMutation<{ id: string; kind: string; jurisdiction: string | null }>(
    ({ id, kind, jurisdiction }) =>
      apiJson(`/agreement-templates/${id}/review`, { method: 'POST', body: JSON.stringify({ kind, jurisdiction }) }),
    {
      onSuccess: () => {
        toast.success('Template marked reviewed');
        qc.invalidateQueries({ queryKey: ['/agreement-templates'] });
      },
      onError: (err) => toast.error('Could not mark reviewed', { description: errorText(err) }),
    },
  );
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Agreement templates</CardTitle>
        <CardDescription>
          Upload the wording counsel approved as a .txt file (Documents, category Agreement template). Halo fills only the
          blanks, from verified records, and refuses a template with a blank it cannot fill.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.isPending ? (
          <LoadingState />
        ) : (list.data ?? []).length === 0 ? (
          <p className="text-body text-muted-foreground">No agreement template in the library yet.</p>
        ) : (
          <ul className="space-y-2">
            {(list.data ?? []).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-body font-medium text-foreground">{t.title}</p>
                  <p className="text-caption text-muted-foreground">
                    {t.fileName} · {t.jurisdiction ?? 'every state'}
                    {t.kinds.length ? ` · ${t.kinds.map((k) => k.replace('_', ' ')).join(', ')}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {t.reviewed ? <Badge variant="success">reviewed</Badge> : <Badge variant="warning">not reviewed</Badge>}
                  {!t.fillable ? (
                    <Badge variant="secondary">not fillable (save as .txt)</Badge>
                  ) : (
                    <>
                      <Select
                        aria-label="Kind"
                        value={kind[t.id] ?? t.kinds[0] ?? 'purchase_agreement'}
                        onChange={(e) => setKind((k) => ({ ...k, [t.id]: e.target.value }))}
                      >
                        <option value="purchase_agreement">Purchase agreement</option>
                        <option value="assignment">Assignment</option>
                      </Select>
                      <Input
                        className="w-20 uppercase"
                        maxLength={2}
                        placeholder="ST"
                        aria-label="State"
                        value={state[t.id] ?? t.jurisdiction ?? ''}
                        onChange={(e) => setState((x) => ({ ...x, [t.id]: e.target.value.toUpperCase() }))}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        loading={review.isPending}
                        onClick={() =>
                          review.mutate({
                            id: t.id,
                            kind: kind[t.id] ?? t.kinds[0] ?? 'purchase_agreement',
                            jurisdiction: (state[t.id] ?? t.jurisdiction ?? '') || null,
                          })
                        }
                      >
                        Mark reviewed
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-caption text-muted-foreground">{FIELDS_HINT}</p>
      </CardContent>
    </Card>
  );
}
