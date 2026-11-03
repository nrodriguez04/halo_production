'use client';

import { useState } from 'react';
import { Globe2 } from 'lucide-react';
import { useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { Field } from '@/components/disposition/agreement-panel';
import { day, errorText } from '@/lib/disposition';
import { ACTIVITIES, ACTIVITY_LABEL, type NationwideStatus } from '@/lib/markets';
import { ASSET_CLASSES, ASSET_CLASS_LABEL, isAssetClass, type AssetClass } from '@/lib/assets';

/** Research is open in every state with or without the decision; the decision is about the rest. */
const OPENABLE = ACTIVITIES.filter((a) => a !== 'research');

/** "contacting sellers, signing purchase agreements and closing signed contracts". */
function joined(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The owner opens all 50 states and DC at once, on their own legal
 * judgment (docs/markets.md s12), for the activities and asset classes
 * they choose, or closes them again. Only an owner or an admin can; the
 * api refuses anyone else. What the decision never waives is listed.
 */
export function NationwideCard({ status }: { status: NationwideStatus }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [attest, setAttest] = useState(false);
  const [reason, setReason] = useState('');
  const [activities, setActivities] = useState<string[]>([...OPENABLE]);
  const [classes, setClasses] = useState<AssetClass[]>([...ASSET_CLASSES]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['/markets'] });
    qc.invalidateQueries({ queryKey: ['/markets/nationwide'] });
  };

  const open = useApiMutation<void>(
    () =>
      apiJson('/markets/nationwide', {
        method: 'POST',
        body: JSON.stringify({
          openedByName: name.trim(),
          note: note.trim() || null,
          attest: true,
          activities: ['research', ...activities],
          assetClasses: classes,
        }),
      }),
    {
      onSuccess: () => {
        toast.success('All 50 states and DC are open for what you chose');
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

  const toggle = <T extends string>(list: T[], value: T, on: boolean): T[] =>
    on ? Array.from(new Set([...list, value])) : list.filter((v) => v !== value);

  const openActivities = (status.activities ?? []).filter((a) => a !== 'research').map((a) => (ACTIVITY_LABEL[a] ?? a).toLowerCase());
  const openClasses = (status.assetClasses ?? []).filter(isAssetClass).map((c) => ASSET_CLASS_LABEL[c].toLowerCase());
  const scope =
    openActivities.length && openClasses.length
      ? `${joined(openActivities)}, for ${joined(openClasses)} property`
      : 'every activity and asset class';

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
            ? `All 50 states and DC are open for ${scope}, on ${status.openedByName}'s decision of ${day(status.openedAt!)}. Halo has not verified the law in any of them. Block a single state on its page to close it.`
            : 'Open all 50 states and DC at once on your own legal judgment, instead of approving each state. You choose what to open and for which kinds of property. You still need your own purchase and assignment agreements on the Templates page (accepted once, for all states).'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.open ? (
          <>
            {status.closedStates.length > 0 && (
              <p className="text-caption text-muted-foreground">
                Still closed by a person: {status.closedStates.map((s) => `${s.state} (${s.status.toLowerCase()})`).join(', ')}.
              </p>
            )}
            {status.note && <p className="text-caption text-muted-foreground">Note: {status.note}</p>}
          </>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="text-caption uppercase tracking-wider text-muted-foreground">What to open everywhere</legend>
              <p className="text-caption text-muted-foreground">
                {ACTIVITY_LABEL.research} is open in every state already, with or without this decision.
              </p>
              {OPENABLE.map((a) => (
                <label key={a} htmlFor={`nw-act-${a}`} className="flex items-center gap-2 text-body">
                  <Checkbox
                    id={`nw-act-${a}`}
                    checked={activities.includes(a)}
                    onCheckedChange={(v) => setActivities((l) => toggle(l, a, v === true))}
                  />
                  <span>{ACTIVITY_LABEL[a]}</span>
                </label>
              ))}
              {activities.length === 0 && <p className="text-caption text-destructive">Choose at least one activity.</p>}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-caption uppercase tracking-wider text-muted-foreground">For which kinds of property</legend>
              {ASSET_CLASSES.map((c) => (
                <label key={c} htmlFor={`nw-cls-${c}`} className="flex items-center gap-2 text-body">
                  <Checkbox
                    id={`nw-cls-${c}`}
                    checked={classes.includes(c)}
                    onCheckedChange={(v) => setClasses((l) => toggle(l, c, v === true))}
                  />
                  <span>{ASSET_CLASS_LABEL[c]}</span>
                </label>
              ))}
              <p className="text-caption text-muted-foreground">
                The rules for assigning a contract on a house say little about acreage or a shopping center. Leave land or commercial unchecked until
                you are comfortable with how those deals work in every state.
              </p>
              {classes.length === 0 && <p className="text-caption text-destructive">Choose at least one asset class.</p>}
            </fieldset>
          </div>
        )}

        {(status.neverWaived ?? []).length > 0 && (
          <div className="rounded-md border border-border bg-secondary/30 p-3">
            <p className="text-caption font-medium uppercase tracking-wider text-muted-foreground">What this decision never overrides</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-caption text-muted-foreground">
              {status.neverWaived!.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {status.open ? (
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
              <Button
                size="sm"
                disabled={!attest || name.trim().length < 2 || activities.length === 0 || classes.length === 0}
                loading={open.isPending}
                onClick={() => open.mutate()}
              >
                Open all 50 states and DC
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
