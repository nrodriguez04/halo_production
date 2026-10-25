'use client';

import { useState } from 'react';
import { Globe2 } from 'lucide-react';
import { useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { Field } from '@/components/disposition/agreement-panel';
import { day, errorText } from '@/lib/disposition';
import type { NationwideStatus } from '@/lib/markets';

/**
 * The owner opens all 50 states and DC at once, on their own legal
 * judgment (docs/markets.md s12), or closes them again. Only an owner or an
 * admin can; the api refuses anyone else.
 */
export function NationwideCard({ status }: { status: NationwideStatus }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [attest, setAttest] = useState(false);
  const [reason, setReason] = useState('');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['/markets'] });
    qc.invalidateQueries({ queryKey: ['/markets/nationwide'] });
  };

  const open = useApiMutation<void>(
    () =>
      apiJson('/markets/nationwide', {
        method: 'POST',
        body: JSON.stringify({ openedByName: name.trim(), note: note.trim() || null, attest: true }),
      }),
    {
      onSuccess: () => {
        toast.success('All 50 states and DC are open');
        setAttest(false);
        refresh();
      },
      onError: (err) => toast.error('Not opened', { description: errorText(err) }),
    },
  );

  const close = useApiMutation<void>(
    () => apiJson('/markets/nationwide/close', { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) }),
    {
      onSuccess: () => {
        toast.success('Each state is back to its own approval');
        setReason('');
        refresh();
      },
      onError: (err) => toast.error('Not closed', { description: errorText(err) }),
    },
  );

  return (
    <Card className={status.open ? 'border-primary/40' : undefined}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Globe2 size={16} className="text-primary" aria-hidden />
          <CardTitle>Operate in every state</CardTitle>
          <Badge variant={status.open ? 'success' : 'secondary'}>{status.open ? 'open nationwide' : 'per-state approval'}</Badge>
        </div>
        <CardDescription>
          {status.open
            ? `All 50 states and DC are open for seller outreach, contracting, assignment, double closes and buyer marketing, on ${status.openedByName}'s decision of ${day(status.openedAt!)}. Halo has not verified the law in any of them. Block a single state on its page to close it; messaging rules (consent, Do Not Call, quiet hours, opt-outs) still apply.`
            : 'Open all 50 states and DC at once on your own legal judgment, instead of approving each state. No per-state policy, registration, operator or self-test is needed. You still need your own purchase and assignment agreements on the Templates page (accepted once, for all states), and messaging rules still apply.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.open ? (
          <>
            {status.closedStates.length > 0 && (
              <p className="text-caption text-muted-foreground">
                Still closed by a person: {status.closedStates.map((s) => `${s.state} (${s.status.toLowerCase()})`).join(', ')}.
              </p>
            )}
            {status.note && <p className="text-caption text-muted-foreground">Note: {status.note}</p>}
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1">
                <Field label="Why you are closing it" htmlFor="nw-reason">
                  <Input id="nw-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
              </div>
              <Button size="sm" variant="outline" disabled={reason.trim().length < 3} loading={close.isPending} onClick={() => close.mutate()}>
                Return to per-state approval
              </Button>
            </div>
          </>
        ) : (
          <>
            <label className="flex items-start gap-2 text-body">
              <input type="checkbox" className="mt-1" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
              <span>{status.attestation}</span>
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-64">
                <Field label="Your full name" htmlFor="nw-name">
                  <Input id="nw-name" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
              </div>
              <div className="min-w-64 flex-1">
                <Field label="Note (optional)" htmlFor="nw-note">
                  <Input id="nw-note" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
              </div>
              <Button size="sm" disabled={!attest || name.trim().length < 2} loading={open.isPending} onClick={() => open.mutate()}>
                Open all 50 states and DC
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
