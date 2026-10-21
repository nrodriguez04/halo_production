'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, FileText, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

interface PackageContent {
  headline: string;
  description: string | null;
  property: {
    address: string;
    city: string;
    state: string;
    zip: string;
    facts: Record<string, string | number>;
    factsSource: string | null;
  };
  price: { askingPrice: number; buyerDeposit: number | null };
  valuation: {
    arv: number | null;
    arvConfidence: number | null;
    arvConfirmed: boolean;
    repairEstimate: number | null;
    basis: string;
    compsSummary: string | null;
    comps: Array<{ address: string; soldPrice: number; soldAt: string | null; sqft: number | null; distanceMiles: number | null; source: string }>;
  };
  timeline: { closeBy: string | null; inspectionEndsAt: string | null };
  rightsOffered: string;
  risks: string[];
  disclosures: string[];
  documents: Array<{ id: string; title: string; contentType: string }>;
  photos: Array<{ id: string; title: string }>;
  accessNotes: string | null;
  seller: string;
}

interface View {
  package: PackageContent;
  version: number;
  greeting: string | null;
  identified: boolean;
  expiresAt: string;
}

const money = (n: number | null | undefined) => (n == null ? '—' : `$${Math.round(n).toLocaleString('en-US')}`);
const FACT_LABEL: Record<string, string> = {
  propertyType: 'Type',
  beds: 'Beds',
  baths: 'Baths',
  sqft: 'Sq ft',
  yearBuilt: 'Built',
};

/**
 * A buyer's deal page. It shows the approved package only: the asking
 * price, estimates labelled as estimates, the risks we know of and exactly
 * what is being sold (our contract, not the deed). A response is recorded
 * as the buyer's own statement; nothing here binds anyone.
 */
export default function PublicDealPage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<View | null>(null);
  const [gone, setGone] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/public/deal-pages/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (r.ok) setView(await r.json());
        else setGone(r.status === 410 ? 'This opportunity is no longer available.' : 'This link is not valid.');
      })
      .catch(() => setGone('The page could not be loaded. Try again shortly.'));
  }, [token]);

  if (gone) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Card>
          <CardContent className="py-12 text-center text-body text-muted-foreground">{gone}</CardContent>
        </Card>
      </main>
    );
  }
  if (!view) {
    return <main className="mx-auto max-w-2xl p-6 text-body text-muted-foreground">Loading…</main>;
  }
  const p = view.package;
  const fileUrl = (id: string) => `${API}/public/deal-pages/${encodeURIComponent(token)}/files/${id}`;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <p className="text-caption uppercase tracking-wider text-muted-foreground">{p.seller} · off-market contract</p>
        <h1 className="text-h1 font-bold text-foreground">{p.headline}</h1>
        <p className="text-body text-muted-foreground">
          {p.property.address}, {p.property.city}, {p.property.state} {p.property.zip}
        </p>
        {view.greeting && <p className="text-body text-foreground">Prepared for {view.greeting}.</p>}
      </header>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 pt-6 md:grid-cols-4">
          <Fact label="Price" value={money(p.price.askingPrice)} strong />
          <Fact label={p.valuation.arvConfirmed ? 'ARV (estimate)' : 'ARV (unconfirmed estimate)'} value={money(p.valuation.arv)} />
          <Fact label="Repairs (estimate)" value={money(p.valuation.repairEstimate)} />
          <Fact label="Must close by" value={p.timeline.closeBy ?? '—'} />
          {Object.entries(p.property.facts).map(([k, v]) => (
            <Fact key={k} label={FACT_LABEL[k] ?? k} value={String(v)} />
          ))}
          {p.price.buyerDeposit != null && <Fact label="Deposit" value={money(p.price.buyerDeposit)} />}
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle>What is being offered</CardTitle>
        </CardHeader>
        <CardContent className="text-body text-foreground">{p.rightsOffered}</CardContent>
      </Card>

      {p.photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {p.photos.map((ph) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={ph.id} src={fileUrl(ph.id)} alt={ph.title} className="aspect-video w-full rounded-md border border-border object-cover" />
          ))}
        </div>
      )}

      {p.description && (
        <Card>
          <CardContent className="whitespace-pre-wrap pt-6 text-body text-foreground">{p.description}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Valuation</CardTitle>
            <CardDescription>{p.valuation.basis}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-body text-foreground">
            {p.valuation.compsSummary && <p className="text-muted-foreground">{p.valuation.compsSummary}</p>}
            {p.valuation.comps.length > 0 && (
              <ul className="space-y-1">
                {p.valuation.comps.map((c, i) => (
                  <li key={i}>
                    {c.address}: {money(c.soldPrice)}
                    {c.soldAt ? ` (${c.soldAt})` : ''}
                    {c.sqft ? `, ${c.sqft} sq ft` : ''}
                    {c.distanceMiles != null ? `, ${c.distanceMiles} mi` : ''} · {c.source}
                  </li>
                ))}
              </ul>
            )}
            {p.property.factsSource && (
              <p className="text-caption text-muted-foreground">Property facts from {p.property.factsSource}.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} className="text-amber-400" aria-hidden />
              <CardTitle>Known risks</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {p.risks.length === 0 ? (
              <p className="text-body text-muted-foreground">None we know of. Do your own due diligence.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-body text-foreground">
                {p.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {p.documents.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {p.documents.map((d) => (
                <li key={d.id}>
                  <a href={fileUrl(d.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-body text-primary hover:underline">
                    <FileText size={14} aria-hidden />
                    {d.title}
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {p.accessNotes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Access</CardTitle>
          </CardHeader>
          <CardContent className="text-body text-foreground">{p.accessNotes}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Disclosures</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-caption text-muted-foreground">
            {p.disclosures.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <RespondCard token={token} identified={view.identified} askingPrice={p.price.askingPrice} />

      <p className="text-center text-caption text-muted-foreground">
        This page works until {new Date(view.expiresAt).toLocaleDateString()} or until the opportunity closes.
      </p>
    </main>
  );
}

function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-caption uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={strong ? 'font-mono text-h3 font-bold text-primary' : 'font-mono text-body font-semibold text-foreground'}>{value}</p>
    </div>
  );
}

function RespondCard({ token, identified, askingPrice }: { token: string; identified: boolean; askingPrice: number }) {
  const [intent, setIntent] = useState<'offer' | 'interested' | 'not_interested' | 'unsubscribe'>('offer');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState(String(askingPrice));
  const [deposit, setDeposit] = useState('');
  const [closeBy, setCloseBy] = useState('');
  const [financing, setFinancing] = useState('cash');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [ack, setAck] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState('');

  const submit = async () => {
    setState('sending');
    setError(null);
    try {
      const res = await fetch(`${API}/public/deal-pages/${encodeURIComponent(token)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent,
          ...(!identified ? { name, email } : {}),
          ...(intent === 'offer'
            ? {
                amount: Number(amount),
                ...(deposit ? { earnestMoney: Number(deposit) } : {}),
                ...(closeBy ? { closeBy: new Date(`${closeBy}T12:00:00`).toISOString() } : {}),
                financing,
                acknowledgedDisclosures: ack,
              }
            : {}),
          ...(message ? { message } : {}),
          ...(consent ? { consentToEmail: true } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body?.message === 'string' ? body.message : 'Could not send your response.');
      }
      setDone(
        intent === 'offer'
          ? 'Your offer was received. We will be in touch; nothing is binding until a written assignment is signed.'
          : intent === 'interested'
            ? 'Thanks: we will be in touch.'
            : intent === 'unsubscribe'
              ? 'You will not receive more deals from us.'
              : 'Thanks for letting us know.',
      );
      setState('done');
    } catch (e) {
      setError((e as Error).message);
      setState('idle');
    }
  };

  if (state === 'done') {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-body text-foreground">
          <CheckCircle2 size={18} className="text-emerald-400" aria-hidden />
          {done}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Respond</CardTitle>
        <CardDescription>Make an offer, tell us you are interested, or pass.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['offer', 'Make an offer'],
              ['interested', 'Interested'],
              ['not_interested', 'Not for me'],
              ['unsubscribe', 'Stop sending me deals'],
            ] as const
          ).map(([v, label]) => (
            <Button key={v} size="sm" variant={intent === v ? 'default' : 'outline'} onClick={() => setIntent(v)}>
              {label}
            </Button>
          ))}
        </div>
        {!identified && (
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
            <Input placeholder="Your email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Your email" />
          </div>
        )}
        {intent === 'offer' && (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-caption uppercase tracking-wider text-muted-foreground">Your price (total)</span>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-caption uppercase tracking-wider text-muted-foreground">Deposit you can put down</span>
              <Input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-caption uppercase tracking-wider text-muted-foreground">You can close by</span>
              <Input type="date" value={closeBy} onChange={(e) => setCloseBy(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-caption uppercase tracking-wider text-muted-foreground">Funding</span>
              <Select value={financing} onChange={(e) => setFinancing(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="hard_money">Hard money</option>
                <option value="private_money">Private money</option>
                <option value="conventional">Conventional</option>
              </Select>
            </label>
          </div>
        )}
        {intent !== 'unsubscribe' && (
          <Textarea rows={3} placeholder="Anything we should know" value={message} onChange={(e) => setMessage(e.target.value)} />
        )}
        {intent === 'offer' && (
          <label className="flex items-start gap-2 text-body text-foreground">
            <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
            I have read what is being offered and the disclosures above, and I understand estimates are not guarantees.
          </label>
        )}
        {intent !== 'unsubscribe' && intent !== 'not_interested' && (
          <label className="flex items-center gap-2 text-body text-foreground">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
            Email me deals like this
          </label>
        )}
        {error && <p className="text-body text-destructive">{error}</p>}
        <div className="flex items-center gap-2">
          <Button
            loading={state === 'sending'}
            disabled={
              (intent === 'offer' && (!Number(amount) || !ack)) ||
              (!identified && (!name.trim() || !email.trim()))
            }
            onClick={submit}
          >
            {intent === 'offer' ? 'Send offer' : intent === 'unsubscribe' ? 'Unsubscribe' : 'Send'}
          </Button>
          {intent === 'offer' && <Badge variant="outline">Not binding until a written assignment is signed</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}
