'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BadgeCheck, Home, Mail, ShieldCheck, Trash2 } from 'lucide-react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson, apiFetch } from '@/lib/api-query';
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
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { toast } from '@/components/ui/toast';
import { Field } from '@/components/disposition/agreement-panel';
import { DocumentSelect } from '@/components/disposition/document-select';
import { day, errorText, money, toIsoDate } from '@/lib/disposition';

interface Profile {
  buyer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    status: string;
    source: string;
    sourceDetail: string | null;
    fundingType: string;
    pofStatus: string;
    pofAmount: number | null;
    pofExpiresAt: string | null;
    notes: string | null;
    preferences: Record<string, any> | null;
  };
  evidence: {
    statedBuyBox: {
      locations: string[];
      propertyTypes: string[];
      priceMin: number | null;
      priceMax: number | null;
      maxRepairs: number | null;
      minArv: number | null;
    };
    historicalPurchases: { count: number; verified: number; range: { min: number; max: number } | null };
    proofOfFunds: { status: string; amount: number | null; verifiedAt: string | null; expiresAt: string | null };
    engagement: { sent: number; replies: number; interested: number } | null;
    outcomes: { offers: number; accepted: number; closed: number; fellThrough: number } | null;
    contactable: { optedOut: boolean; emailConsent: boolean; smsConsent: boolean };
  };
  transactions: Array<{
    id: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    price: number | null;
    closedAt: string | null;
    source: string;
    sourceRef: string | null;
  }>;
  offers: Array<{
    id: string;
    amount: number;
    status: string;
    createdAt: string;
    deal: { id: string; property: { address: string; city: string; state: string } | null };
  }>;
  consents: Array<{ id: string; channel: string; source: string; grantedAt: string; revokedAt: string | null }>;
}

const SOURCE_LABEL: Record<string, string> = {
  public_record: 'Public record',
  halo_closing: 'Closed with us',
  buyer_provided: 'Buyer said',
  manual: 'Entered',
};

/**
 * One cash buyer, evidence by kind. What they told us, what they bought
 * (and where we learned it), what funds a person verified, how they
 * engaged and how their deals with us ended.
 */
export default function BuyerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const path = `/buyers/${id}/profile`;
  const profile = useApiQuery<Profile>(path, { enabled: !!id });
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [path] });
  const [editOpen, setEditOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [pofOpen, setPofOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);

  const removeTx = useApiMutation<string>(
    (txId) => apiFetch(`/buyers/${id}/transactions/${txId}`, { method: 'DELETE' }).then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
    }),
    { onSuccess: () => { toast.success('Purchase removed'); refresh(); }, onError: (e) => toast.error('Could not remove', { description: errorText(e) }) },
  );
  const revoke = useApiMutation<string>(
    (channel) => apiFetch(`/buyers/${id}/consents/${channel}`, { method: 'DELETE' }).then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
    }),
    { onSuccess: () => { toast.success('Consent revoked'); refresh(); }, onError: (e) => toast.error('Could not revoke', { description: errorText(e) }) },
  );

  if (profile.isPending) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Loading…" />
        <LoadingState />
      </div>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Buyer" />
        <ErrorState title="Could not load this buyer" description={errorText(profile.error)} onRetry={() => profile.refetch()} />
      </div>
    );
  }
  const { buyer, evidence, transactions, offers, consents } = profile.data;
  const box = evidence.statedBuyBox;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Buyer"
        title={buyer.name}
        description={[buyer.company, buyer.email, buyer.phone].filter(Boolean).join(' · ')}
        actions={
          <>
            <Badge variant={buyer.status === 'active' ? 'success' : 'destructive'}>{buyer.status.replace(/_/g, ' ')}</Badge>
            <Badge variant="outline">source: {buyer.source.replace(/_/g, ' ')}</Badge>
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              Edit profile
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Stated buy box</CardTitle>
            <CardDescription>What they told us. Not evidence of what they buy.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-body text-foreground">
            <p>Areas: {box.locations.length ? box.locations.join(', ') : 'any'}</p>
            <p>Price: {box.priceMin != null || box.priceMax != null ? `${money(box.priceMin)} to ${money(box.priceMax)}` : 'any'}</p>
            <p>Types: {box.propertyTypes.length ? box.propertyTypes.join(', ') : 'any'}</p>
            <p>Max repairs: {money(box.maxRepairs)} · Min ARV: {money(box.minArv)}</p>
            <p>Funding: {buyer.fundingType.replace(/_/g, ' ')}</p>
            {buyer.sourceDetail && <p className="text-caption text-muted-foreground">From: {buyer.sourceDetail}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-primary" aria-hidden />
                <CardTitle>Proof of funds</CardTitle>
                <Badge variant={evidence.proofOfFunds.status === 'verified' ? 'success' : 'warning'}>{evidence.proofOfFunds.status}</Badge>
              </div>
              <Button size="sm" variant="outline" onClick={() => setPofOpen(true)}>
                Update
              </Button>
            </div>
            <CardDescription>Only a document a person checked counts as verified.</CardDescription>
          </CardHeader>
          <CardContent className="text-body text-foreground">
            {evidence.proofOfFunds.status === 'verified' ? (
              <p>
                {money(evidence.proofOfFunds.amount)} verified {day(evidence.proofOfFunds.verifiedAt)}
                {evidence.proofOfFunds.expiresAt ? ` · expires ${day(evidence.proofOfFunds.expiresAt)}` : ''}
              </p>
            ) : (
              <p className="text-muted-foreground">No verified proof of funds. Offers from this buyer cannot be accepted until there is.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Engagement and outcomes</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            {[
              ['Messages sent', evidence.engagement?.sent ?? 0],
              ['Replies', evidence.engagement?.replies ?? 0],
              ['Interested', evidence.engagement?.interested ?? 0],
              ['Offers', evidence.outcomes?.offers ?? 0],
              ['Closed with us', evidence.outcomes?.closed ?? 0],
              ['Walked away', evidence.outcomes?.fellThrough ?? 0],
            ].map(([label, value]) => (
              <div key={label as string}>
                <p className="text-caption uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="font-mono text-h3 font-bold text-foreground">{value}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Mail size={16} className="text-primary" aria-hidden />
                <CardTitle>Consent</CardTitle>
                {evidence.contactable.optedOut && <Badge variant="destructive">opted out</Badge>}
              </div>
              <Button size="sm" variant="outline" onClick={() => setConsentOpen(true)} disabled={evidence.contactable.optedOut}>
                Record consent
              </Button>
            </div>
            <CardDescription>Halo emails or texts a buyer only with a consent on file for that channel.</CardDescription>
          </CardHeader>
          <CardContent>
            {consents.length === 0 ? (
              <p className="text-body text-muted-foreground">No consent recorded.</p>
            ) : (
              <ul className="space-y-1">
                {consents.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-body text-foreground">
                    <span>
                      <Badge variant={c.revokedAt ? 'secondary' : 'success'} className="mr-2">
                        {c.channel}
                      </Badge>
                      {c.source} · {day(c.grantedAt)}
                      {c.revokedAt ? ` · revoked ${day(c.revokedAt)}` : ''}
                    </span>
                    {!c.revokedAt && (
                      <Button size="sm" variant="ghost" onClick={() => revoke.mutate(c.channel)}>
                        Revoke
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Home size={16} className="text-primary" aria-hidden />
              <CardTitle>Purchases</CardTitle>
              <Badge variant="outline">
                {evidence.historicalPurchases.verified} of {evidence.historicalPurchases.count} verified
              </Badge>
            </div>
            <Button size="sm" variant="outline" onClick={() => setTxOpen(true)}>
              Add a purchase
            </Button>
          </div>
          <CardDescription>Public records and closings with us are evidence; what a buyer says is a claim, weighed half.</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-body text-muted-foreground">No purchases on record.</p>
          ) : (
            <ul className="space-y-1">
              {transactions.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-secondary/40">
                  <span className="text-body text-foreground">
                    <Badge variant={t.source === 'public_record' || t.source === 'halo_closing' ? 'info' : 'secondary'} className="mr-2">
                      {SOURCE_LABEL[t.source] ?? t.source}
                    </Badge>
                    {[t.address, t.city, t.state, t.zip].filter(Boolean).join(', ')} · {money(t.price)} · {day(t.closedAt)}
                    {t.sourceRef ? <span className="text-caption text-muted-foreground"> · {t.sourceRef}</span> : null}
                  </span>
                  {t.source !== 'halo_closing' && (
                    <Button size="icon-sm" variant="ghost" aria-label="Remove purchase" onClick={() => removeTx.mutate(t.id)}>
                      <Trash2 size={14} aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BadgeCheck size={16} className="text-primary" aria-hidden />
            <CardTitle>Offers on our deals</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {offers.length === 0 ? (
            <p className="text-body text-muted-foreground">None yet.</p>
          ) : (
            <ul className="space-y-1">
              {offers.map((o) => (
                <li key={o.id} className="text-body text-foreground">
                  <Link href={`/deals/${o.deal.id}`} className="hover:underline">
                    {o.deal.property ? `${o.deal.property.address}, ${o.deal.property.city}` : o.deal.id}
                  </Link>{' '}
                  · {money(o.amount)} · <Badge variant="secondary">{o.status}</Badge> · {day(o.createdAt)}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {editOpen && <EditProfileDialog id={id} profile={profile.data} onClose={() => setEditOpen(false)} onSaved={refresh} />}
      <TransactionDialog id={id} open={txOpen} onOpenChange={setTxOpen} onSaved={refresh} />
      <ProofOfFundsDialog id={id} open={pofOpen} onOpenChange={setPofOpen} onSaved={refresh} />
      <ConsentDialog id={id} open={consentOpen} onOpenChange={setConsentOpen} onSaved={refresh} />
    </div>
  );
}

function useBuyerPost(path: string, method: string, success: string, onSaved: () => void, onClose: () => void) {
  return useApiMutation<Record<string, unknown>>((body) => apiJson(path, { method, body: JSON.stringify(body) }), {
    onSuccess: () => {
      toast.success(success);
      onSaved();
      onClose();
    },
    onError: (e) => toast.error('Could not save', { description: errorText(e) }),
  });
}

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const num = (s: string) => (s.trim() ? Number(s) : null);

function EditProfileDialog({ id, profile, onClose, onSaved }: { id: string; profile: Profile; onClose: () => void; onSaved: () => void }) {
  const b = profile.buyer;
  const box = profile.evidence.statedBuyBox;
  const [f, setF] = useState({
    company: b.company ?? '',
    status: b.status,
    fundingType: b.fundingType,
    notes: b.notes ?? '',
    locations: box.locations.join(', '),
    propertyTypes: box.propertyTypes.join(', '),
    priceMin: box.priceMin != null ? String(box.priceMin) : '',
    priceMax: box.priceMax != null ? String(box.priceMax) : '',
    maxRepairs: box.maxRepairs != null ? String(box.maxRepairs) : '',
    minArv: box.minArv != null ? String(box.minArv) : '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useBuyerPost(`/buyers/${id}/profile`, 'PATCH', 'Profile saved', onSaved, onClose);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit {b.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Company" htmlFor="e-company">
            <Input id="e-company" value={f.company} onChange={set('company')} />
          </Field>
          <Field label="Status" htmlFor="e-status">
            <Select id="e-status" value={f.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="do_not_market">Do not market</option>
            </Select>
          </Field>
          <Field label="Funding" htmlFor="e-funding">
            <Select id="e-funding" value={f.fundingType} onChange={set('fundingType')}>
              {['unknown', 'cash', 'hard_money', 'private_money', 'conventional'].map((v) => (
                <option key={v} value={v}>
                  {v.replace('_', ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Areas (cities, ST, zips; comma separated)" htmlFor="e-loc">
            <Input id="e-loc" value={f.locations} onChange={set('locations')} />
          </Field>
          <Field label="Price from" htmlFor="e-min">
            <Input id="e-min" inputMode="decimal" value={f.priceMin} onChange={set('priceMin')} />
          </Field>
          <Field label="Price to" htmlFor="e-max">
            <Input id="e-max" inputMode="decimal" value={f.priceMax} onChange={set('priceMax')} />
          </Field>
          <Field label="Property types" htmlFor="e-types">
            <Input id="e-types" value={f.propertyTypes} onChange={set('propertyTypes')} />
          </Field>
          <Field label="Max repairs" htmlFor="e-rep">
            <Input id="e-rep" inputMode="decimal" value={f.maxRepairs} onChange={set('maxRepairs')} />
          </Field>
          <Field label="Min ARV" htmlFor="e-arv">
            <Input id="e-arv" inputMode="decimal" value={f.minArv} onChange={set('minArv')} />
          </Field>
        </div>
        <Textarea rows={3} placeholder="Notes" value={f.notes} onChange={set('notes')} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                company: f.company || null,
                status: f.status,
                fundingType: f.fundingType,
                notes: f.notes || null,
                preferences: {
                  locations: list(f.locations),
                  propertyTypes: list(f.propertyTypes),
                  priceRange: { min: num(f.priceMin), max: num(f.priceMax) },
                  maxRepairEstimate: num(f.maxRepairs),
                  minARV: num(f.minArv),
                  strategies: [],
                },
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransactionDialog({ id, open, onOpenChange, onSaved }: { id: string; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [f, setF] = useState({ address: '', city: '', state: '', zip: '', price: '', closedAt: '', source: 'public_record', sourceRef: '' });
  useEffect(() => {
    if (open) setF({ address: '', city: '', state: '', zip: '', price: '', closedAt: '', source: 'public_record', sourceRef: '' });
  }, [open]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useBuyerPost(`/buyers/${id}/transactions`, 'POST', 'Purchase recorded', onSaved, () => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a purchase</DialogTitle>
          <DialogDescription>A public-record purchase needs its recording number or the record&apos;s link.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Address" htmlFor="t-addr">
            <Input id="t-addr" value={f.address} onChange={set('address')} />
          </Field>
          <Field label="City" htmlFor="t-city">
            <Input id="t-city" value={f.city} onChange={set('city')} />
          </Field>
          <Field label="State" htmlFor="t-state">
            <Input id="t-state" maxLength={2} value={f.state} onChange={(e) => setF((x) => ({ ...x, state: e.target.value.toUpperCase() }))} />
          </Field>
          <Field label="Zip" htmlFor="t-zip">
            <Input id="t-zip" value={f.zip} onChange={set('zip')} />
          </Field>
          <Field label="Price" htmlFor="t-price">
            <Input id="t-price" inputMode="decimal" value={f.price} onChange={set('price')} />
          </Field>
          <Field label="Closed on" htmlFor="t-date">
            <Input id="t-date" type="date" value={f.closedAt} onChange={set('closedAt')} />
          </Field>
          <Field label="Where we learned it" htmlFor="t-source">
            <Select id="t-source" value={f.source} onChange={set('source')}>
              <option value="public_record">Public record</option>
              <option value="buyer_provided">The buyer told us</option>
              <option value="manual">Other</option>
            </Select>
          </Field>
          <Field label="Reference" htmlFor="t-ref">
            <Input id="t-ref" value={f.sourceRef} onChange={set('sourceRef')} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!f.city && !f.zip}
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                ...(f.address ? { address: f.address } : {}),
                ...(f.city ? { city: f.city } : {}),
                ...(f.state ? { state: f.state } : {}),
                ...(f.zip ? { zip: f.zip } : {}),
                ...(f.price ? { price: Number(f.price) } : {}),
                ...(f.closedAt ? { closedAt: toIsoDate(f.closedAt) } : {}),
                source: f.source,
                ...(f.sourceRef ? { sourceRef: f.sourceRef } : {}),
              })
            }
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProofOfFundsDialog({ id, open, onOpenChange, onSaved }: { id: string; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [status, setStatus] = useState('verified');
  const [amount, setAmount] = useState('');
  const [doc, setDoc] = useState('');
  const [expires, setExpires] = useState('');
  const save = useBuyerPost(`/buyers/${id}/proof-of-funds`, 'POST', 'Proof of funds updated', onSaved, () => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Proof of funds</DialogTitle>
          <DialogDescription>Verifying means you looked at the document and it shows the amount. Upload it attached to this buyer first.</DialogDescription>
        </DialogHeader>
        <Field label="Status" htmlFor="pf-status">
          <Select id="pf-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="requested">Requested</option>
            <option value="received">Received (not yet checked)</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </Select>
        </Field>
        <Field label="Amount it shows" htmlFor="pf-amount">
          <Input id="pf-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Document" htmlFor="pf-doc">
          <DocumentSelect id="pf-doc" buyerId={id} value={doc} onChange={setDoc} />
        </Field>
        <Field label="Valid until" htmlFor="pf-exp">
          <Input id="pf-exp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={status === 'verified' && (!doc || !amount)}
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                status,
                ...(amount ? { amount: Number(amount) } : {}),
                ...(doc ? { documentId: doc } : {}),
                ...(expires ? { expiresAt: toIsoDate(expires) } : {}),
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConsentDialog({ id, open, onOpenChange, onSaved }: { id: string; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [channel, setChannel] = useState('email');
  const [source, setSource] = useState('written');
  const [evidence, setEvidence] = useState('');
  const save = useBuyerPost(`/buyers/${id}/consents`, 'POST', 'Consent recorded', onSaved, () => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record consent</DialogTitle>
          <DialogDescription>
            Record it only when the buyer actually agreed to receive deals on this channel. Texting needs their written
            consent.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Channel" htmlFor="cs-ch">
            <Select id="cs-ch" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="email">Email</option>
              <option value="sms">Text</option>
            </Select>
          </Field>
          <Field label="How they agreed" htmlFor="cs-src">
            <Select id="cs-src" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="written">In writing</option>
              <option value="form">A signup form</option>
              <option value="verbal">Verbally</option>
              <option value="existing_relationship">Existing business relationship</option>
            </Select>
          </Field>
        </div>
        <Textarea rows={3} placeholder="Evidence: where, when and what they agreed to" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!evidence.trim()} loading={save.isPending} onClick={() => save.mutate({ channel, source, evidence })}>
            Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
