'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { Field } from './agreement-panel';
import { DocumentSelect } from './document-select';
import { day, errorText } from '@/lib/disposition';

interface Consent {
  id: string;
  channel: string;
  source: string;
  evidence: { statement?: string; documentId?: string | null } | null;
  grantedAt: string;
  revokedAt: string | null;
}

/**
 * The seller's consent to be contacted, with its evidence
 * (docs/communications.md s4). Messages to the seller need it on the
 * channel used; an opt-out always wins over it.
 */
export function SellerConsentCard({ leadId, dealId }: { leadId: string; dealId: string }) {
  const qc = useQueryClient();
  const key = `/leads/${leadId}/consents`;
  const consents = useApiQuery<Consent[]>(key);
  const [channel, setChannel] = useState('sms');
  const [source, setSource] = useState('written');
  const [evidence, setEvidence] = useState('');
  const [doc, setDoc] = useState('');

  const record = useApiMutation<void>(
    () =>
      apiJson(key, {
        method: 'POST',
        body: JSON.stringify({ channel, source, evidence, documentId: doc || null }),
      }),
    {
      onSuccess: () => {
        toast.success('Consent recorded');
        setEvidence('');
        setDoc('');
        qc.invalidateQueries({ queryKey: [key] });
      },
      onError: (err) => toast.error('Could not record consent', { description: errorText(err) }),
    },
  );
  const revoke = useApiMutation<string>((id) => apiJson(`${key}/${id}/revoke`, { method: 'POST' }), {
    onSuccess: () => {
      toast.success('Consent revoked');
      qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (err) => toast.error('Could not revoke', { description: errorText(err) }),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-primary" aria-hidden />
          <CardTitle>Seller consent to contact</CardTitle>
        </div>
        <CardDescription>Record how the seller agreed to be contacted, and on which channel. An opt-out always overrides it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(consents.data ?? []).length === 0 ? (
          <p className="text-caption text-muted-foreground">None recorded.</p>
        ) : (
          <ul className="space-y-1">
            {consents.data!.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-caption">
                <span>
                  <Badge variant={c.revokedAt ? 'outline' : 'success'}>{c.channel}</Badge> {c.source.replace(/_/g, ' ')} · {day(c.grantedAt)}
                  {c.evidence?.statement ? ` · ${c.evidence.statement}` : ''}
                  {c.revokedAt ? ` · revoked ${day(c.revokedAt)}` : ''}
                </span>
                {!c.revokedAt && (
                  <Button size="sm" variant="ghost" loading={revoke.isPending} onClick={() => revoke.mutate(c.id)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Channel" htmlFor="sc-channel">
            <Select id="sc-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="sms">Texts</option>
              <option value="email">Email</option>
              <option value="call">Calls</option>
            </Select>
          </Field>
          <Field label="How" htmlFor="sc-source">
            <Select id="sc-source" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="written">In writing</option>
              <option value="form">A form they submitted</option>
              <option value="recorded_call">A recorded call</option>
              <option value="verbal">Verbally</option>
              <option value="other">Other</option>
            </Select>
          </Field>
        </div>
        <Field label="Evidence (what they said or signed, when)" htmlFor="sc-evidence">
          <Textarea id="sc-evidence" rows={2} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
        </Field>
        <Field label="Supporting document (optional)" htmlFor="sc-doc">
          <DocumentSelect id="sc-doc" dealId={dealId} value={doc} onChange={setDoc} placeholder="The signed form or recording…" />
        </Field>
        <Button size="sm" variant="outline" disabled={evidence.trim().length < 5} loading={record.isPending} onClick={() => record.mutate()}>
          Record consent
        </Button>
      </CardContent>
    </Card>
  );
}
