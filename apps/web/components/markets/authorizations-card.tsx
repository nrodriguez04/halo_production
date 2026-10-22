'use client';

import { useState } from 'react';
import { BadgeCheck, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
import { day, toIsoDate } from '@/lib/disposition';
import { useMarketAction } from './use-market-action';
import { AUTHORIZATION_KIND_LABEL, type MarketDetail } from '@/lib/markets';

const STATUS_VARIANT = { pending: 'warning', active: 'success', expired: 'destructive', revoked: 'destructive' } as const;

/**
 * Licences, registrations and broker agreements for one market. A record
 * counts only once a person verifies it against its evidence, and only
 * until it expires; changing it means verifying it again.
 */
export function AuthorizationsCard({ m }: { m: MarketDetail }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('entity_registration');
  const [holderName, setHolderName] = useState('');
  const [holderType, setHolderType] = useState('company');
  const [identifier, setIdentifier] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [revokeReason, setRevokeReason] = useState<Record<string, string>>({});

  const create = useMarketAction(
    m.state,
    () => ({
      path: `/markets/${m.state}/authorizations`,
      body: {
        kind,
        holderName,
        holderType,
        identifier: identifier.trim() || null,
        expiresAt: toIsoDate(expiresAt) ?? null,
        documentId: documentId || null,
      },
    }),
    { success: 'Recorded. Verify it against the evidence to count it.', failure: 'Could not record it' },
    () => setOpen(false),
  );
  const verify = useMarketAction<string>(m.state, (id) => ({ path: `/markets/authorizations/${id}/verify` }), {
    success: 'Verified',
    failure: 'Could not verify',
  });
  const revoke = useMarketAction<string>(
    m.state,
    (id) => ({ path: `/markets/authorizations/${id}/revoke`, body: { reason: revokeReason[id] ?? '' } }),
    { success: 'Revoked', failure: 'Could not revoke' },
  );

  const required = (m.approved ?? m.draft)?.requirements ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Licences and registrations</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus size={14} className="mr-1" aria-hidden />
            Record one
          </Button>
        </div>
        <CardDescription>
          {required.length ? `The policy requires: ${required.map((r) => r.label).join('; ')}.` : 'The policy lists no licence or registration.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {m.authorizations.length === 0 && <p className="text-caption text-muted-foreground">None recorded.</p>}
        {m.authorizations.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
            <div>
              <p className="font-medium">
                {AUTHORIZATION_KIND_LABEL[a.kind] ?? a.kind} · {a.holderName}
              </p>
              <p className="text-caption text-muted-foreground">
                {a.identifier ?? 'no number'} · expires {day(a.expiresAt)} · {a.verifiedAt ? `verified ${day(a.verifiedAt)}` : 'not verified'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_VARIANT[a.status]}>{a.status}</Badge>
              {a.status !== 'revoked' && !a.verifiedAt && (
                <Button size="sm" loading={verify.isPending} onClick={() => verify.mutate(a.id)}>
                  <BadgeCheck size={14} className="mr-1" aria-hidden />
                  Verify
                </Button>
              )}
              {a.status !== 'revoked' && (
                <>
                  <Input
                    className="w-40"
                    placeholder="Reason to revoke"
                    value={revokeReason[a.id] ?? ''}
                    onChange={(e) => setRevokeReason({ ...revokeReason, [a.id]: e.target.value })}
                  />
                  <Button size="sm" variant="outline" disabled={(revokeReason[a.id] ?? '').trim().length < 3} onClick={() => revoke.mutate(a.id)}>
                    Revoke
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a licence or registration in {m.name}</DialogTitle>
            <DialogDescription>Attach the evidence. It counts once a person verifies it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Kind" htmlFor="au-kind">
              <Select id="au-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                {Object.keys(AUTHORIZATION_KIND_LABEL).map((k) => (
                  <option key={k} value={k}>
                    {AUTHORIZATION_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Held by" htmlFor="au-holder">
                <Input id="au-holder" value={holderName} onChange={(e) => setHolderName(e.target.value)} />
              </Field>
              <Field label="Holder" htmlFor="au-type">
                <Select id="au-type" value={holderType} onChange={(e) => setHolderType(e.target.value)}>
                  <option value="company">Our company</option>
                  <option value="operator">An operator</option>
                  <option value="broker_partner">A partner broker</option>
                </Select>
              </Field>
              <Field label="Number" htmlFor="au-id">
                <Input id="au-id" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
              </Field>
              <Field label="Expires" htmlFor="au-exp">
                <Input id="au-exp" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </Field>
            </div>
            <Field label="Evidence" htmlFor="au-doc">
              <DocumentSelect id="au-doc" value={documentId} onChange={setDocumentId} placeholder="The licence, certificate or agreement…" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={holderName.trim().length < 2} loading={create.isPending} onClick={() => create.mutate()}>
              Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
