'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, CircleDashed, MailCheck, ShieldOff } from 'lucide-react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { toast } from '@/components/ui/toast';
import { Field } from '@/components/disposition/agreement-panel';
import { day, errorText } from '@/lib/disposition';

interface Check {
  key: string;
  label: string;
  ok: boolean;
  required: boolean;
  detail: string;
}

interface Readiness {
  switches: Record<string, boolean>;
  email: Check[];
  sms: Check[];
  canSend: Record<string, boolean>;
  webhooks: Record<string, string> | null;
}

interface Deliverability {
  days: number;
  sent: number;
  delivered: number;
  blocked: number;
  hardBounces: number;
  softBounces: number;
  complaints: number;
  unsubscribes: number;
  opens: number;
  clicks: number;
  bounceRate: number | null;
  complaintRate: number | null;
  warnings: string[];
}

interface Suppressions {
  counts: Record<string, number>;
  entries: Array<{ id: string; channel: string; contact: string | null; source: string; reason: string | null; createdAt: string; removable: boolean }>;
}

const CAN_SEND_LABEL: Record<string, string> = {
  internalTest: 'Internal test sends',
  transactionalEmail: 'Transactional and reply email',
  marketingEmail: 'Marketing email',
  sms: 'Texts (replies and transactional)',
  marketingSms: 'Marketing texts',
};

function Checks({ list }: { list: Check[] }) {
  return (
    <ul className="space-y-1">
      {list.map((c) => (
        <li key={c.key} className="flex gap-2 text-caption">
          {c.ok ? (
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden />
          ) : (
            <CircleDashed size={14} className={`mt-0.5 shrink-0 ${c.required ? 'text-amber-400' : 'text-muted-foreground'}`} aria-hidden />
          )}
          <span>
            <span className="font-medium">{c.label}</span>
            {!c.required && <span className="text-muted-foreground"> (optional)</span>}: <span className="text-muted-foreground">{c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const pct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(n < 0.01 ? 2 : 1)}%`);

/**
 * Communications settings (docs/communications.md): what is configured, the
 * switches (set on the Control Plane), an internal test send, delivery
 * health and the suppression list. Nothing here turns external sending on.
 */
export default function CommunicationsSettingsPage() {
  const qc = useQueryClient();
  const readiness = useApiQuery<Readiness>('/communications/readiness');
  const deliverability = useApiQuery<Deliverability>('/communications/deliverability');
  const suppressions = useApiQuery<Suppressions>('/communications/suppressions');
  const [to, setTo] = useState('');
  const [suppressEmail, setSuppressEmail] = useState('');
  const [suppressReason, setSuppressReason] = useState('');

  const testSend = useApiMutation<void, { provider: string }>(
    () => apiJson('/communications/test-send', { method: 'POST', body: JSON.stringify({ to }) }),
    {
      onSuccess: (out) => toast.success(`Test sent through ${out.provider}. Check the inbox.`),
      onError: (err) => toast.error('Test send failed', { description: errorText(err) }),
    },
  );
  const suppress = useApiMutation<void>(
    () => apiJson('/communications/suppressions', { method: 'POST', body: JSON.stringify({ email: suppressEmail, reason: suppressReason }) }),
    {
      onSuccess: () => {
        toast.success('Added to the suppression list');
        setSuppressEmail('');
        setSuppressReason('');
        qc.invalidateQueries({ queryKey: ['/communications/suppressions'] });
      },
      onError: (err) => toast.error('Could not add it', { description: errorText(err) }),
    },
  );
  const remove = useApiMutation<string>(
    (id) => apiJson(`/communications/suppressions/${id}`, { method: 'DELETE', body: JSON.stringify({ reason: 'Removed from the communications settings page' }) }),
    {
      onSuccess: () => {
        toast.success('Removed');
        qc.invalidateQueries({ queryKey: ['/communications/suppressions'] });
      },
      onError: (err) => toast.error('Could not remove it', { description: errorText(err) }),
    },
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow={
          <Link href="/communications" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft size={12} aria-hidden /> Communications
          </Link>
        }
        title="Communications settings"
        description="What is configured, what the switches allow, delivery health and who must not be contacted. External sending is turned on only on the Control Plane, by someone authorized to do it."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/admin">Control Plane</Link>
          </Button>
        }
      />
      {readiness.isPending ? (
        <LoadingState />
      ) : readiness.isError ? (
        <ErrorState title="Could not load" description={errorText(readiness.error)} onRetry={() => readiness.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>What can go out today</CardTitle>
              <CardDescription>Configuration and the Control Plane switches together.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {Object.entries(readiness.data.canSend).map(([k, v]) => (
                  <Badge key={k} variant={v ? 'success' : 'outline'}>
                    {CAN_SEND_LABEL[k] ?? k}: {v ? 'yes' : 'no'}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(readiness.data.switches).map(([k, v]) => (
                  <Badge key={k} variant={v ? 'warning' : 'secondary'}>
                    {k}: {v ? 'on' : 'off'}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <MailCheck size={16} className="text-primary" aria-hidden />
                <CardTitle>Internal test send</CardTitle>
              </div>
              <CardDescription>Goes only to an address on EMAIL_INTERNAL_RECIPIENTS, through the real provider, whatever the switches say.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1">
                <Field label="Send to" htmlFor="test-to">
                  <Input id="test-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
                </Field>
              </div>
              <Button size="sm" disabled={!to.includes('@') || !readiness.data.canSend.internalTest} loading={testSend.isPending} onClick={() => testSend.mutate()}>
                Send test
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Email configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <Checks list={readiness.data.email} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>SMS configuration</CardTitle>
              <CardDescription>Inbound texts are matched to leads and buyers. Unsolicited automated texting stays off.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Checks list={readiness.data.sms} />
              {readiness.data.webhooks && (
                <div className="space-y-1">
                  <p className="text-caption font-medium uppercase tracking-wider text-muted-foreground">Webhook URLs to configure at the providers</p>
                  {Object.entries(readiness.data.webhooks).map(([k, v]) => (
                    <p key={k} className="break-all font-mono text-caption">
                      {k}: {v}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Delivery health (30 days)</CardTitle>
          <CardDescription>From provider events: bounces and complaints suppress addresses automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          {deliverability.data ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {[
                  ['Sent', deliverability.data.sent],
                  ['Delivered', deliverability.data.delivered],
                  ['Hard bounces', `${deliverability.data.hardBounces} (${pct(deliverability.data.bounceRate)})`],
                  ['Complaints', `${deliverability.data.complaints} (${pct(deliverability.data.complaintRate)})`],
                  ['Unsubscribes', deliverability.data.unsubscribes],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p className="text-caption uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="font-mono text-h3">{value}</p>
                  </div>
                ))}
              </div>
              {deliverability.data.warnings.map((w) => (
                <p key={w} className="text-caption text-amber-400">
                  {w}
                </p>
              ))}
            </div>
          ) : (
            <LoadingState />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShieldOff size={16} className="text-primary" aria-hidden />
            <CardTitle>Suppression list</CardTitle>
          </div>
          <CardDescription>
            Everyone Halo must not contact. An opt-out the person made themselves (unsubscribe, STOP, complaint) can only be reversed by them.
            {suppressions.data && ` ${Object.entries(suppressions.data.counts).map(([k, v]) => `${k}: ${v}`).join(', ')}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1">
              <Field label="Email to suppress" htmlFor="sup-email">
                <Input id="sup-email" type="email" value={suppressEmail} onChange={(e) => setSuppressEmail(e.target.value)} />
              </Field>
            </div>
            <div className="min-w-56 flex-1">
              <Field label="Reason" htmlFor="sup-reason">
                <Input id="sup-reason" value={suppressReason} onChange={(e) => setSuppressReason(e.target.value)} />
              </Field>
            </div>
            <Button size="sm" variant="outline" disabled={!suppressEmail.includes('@') || suppressReason.trim().length < 3} loading={suppress.isPending} onClick={() => suppress.mutate()}>
              Suppress
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(suppressions.data?.entries ?? []).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-caption">{e.contact ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{e.source.replace(/_/g, ' ')}</Badge>
                    </TableCell>
                    <TableCell className="text-caption text-muted-foreground">{e.reason ?? '—'}</TableCell>
                    <TableCell className="text-caption">{day(e.createdAt)}</TableCell>
                    <TableCell>
                      {e.removable && (
                        <Button size="sm" variant="ghost" loading={remove.isPending} onClick={() => remove.mutate(e.id)}>
                          Remove
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
