'use client';

import { useState } from 'react';
import { Receipt } from 'lucide-react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ErrorState, LoadingState } from '@/components/states';
import { toast } from '@/components/ui/toast';
import { Field } from '@/components/disposition/agreement-panel';
import { day, errorText, money } from '@/lib/disposition';

/** Mirrors SPEND_CATEGORIES in packages/shared/src/data/funnel.ts. */
const CATEGORIES = {
  direct_mail: 'Direct mail',
  ads: 'Ads',
  lists: 'Lists and data',
  skip_tracing: 'Skip tracing (outside Hālo)',
  cold_calling: 'Cold calling',
  texting: 'Texting (outside Hālo)',
  software: 'Software',
  other: 'Other',
} as const;
type Category = keyof typeof CATEGORIES;

interface SpendRow {
  id: string;
  category: Category;
  amountUsd: number;
  spentOn: string;
  source: string | null;
  state: string | null;
  vendor: string | null;
  note: string | null;
}

const PATH = '/analytics/funnel/spend';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The lead source a spend names, spelled as the leads' `source:` tags are. */
function sourceKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Spend no provider call records (docs/data-pipeline.md s5.1): a mail drop,
 * an ad campaign, a bought list. Entered here, it counts as cost in the
 * funnel for the source and the state it names.
 */
export function SpendCard({ from, to, sources }: { from: string; to: string; sources: string[] }) {
  const qc = useQueryClient();
  const list = useApiQuery<SpendRow[]>(PATH, { params: { from, to } });
  const [spentOn, setSpentOn] = useState(today());
  const [category, setCategory] = useState<Category>('direct_mail');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [state, setState] = useState('');
  const [vendor, setVendor] = useState('');
  const [note, setNote] = useState('');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [PATH] });
    qc.invalidateQueries({ queryKey: ['/analytics/funnel'] });
  };

  const add = useApiMutation<void>(
    () =>
      apiJson(PATH, {
        method: 'POST',
        body: JSON.stringify({
          spentOn,
          category,
          amountUsd: Number(amount),
          source: source.trim() || null,
          state: state.trim() || null,
          vendor: vendor.trim() || null,
          note: note.trim() || null,
        }),
      }),
    {
      onSuccess: () => {
        toast.success('Spend recorded');
        setAmount('');
        setNote('');
        refresh();
      },
      onError: (err) => toast.error('Could not record it', { description: errorText(err) }),
    },
  );

  const remove = useApiMutation<string>((id) => apiJson(`${PATH}/${id}`, { method: 'DELETE' }), {
    onSuccess: () => {
      toast.success('Removed');
      refresh();
    },
    onError: (err) => toast.error('Could not remove it', { description: errorText(err) }),
  });

  const amountValid = Number(amount) > 0 && Number(amount) <= 10_000_000;
  const stateValid = state.trim() === '' || /^[A-Za-z]{2}$/.test(state.trim());
  const key = sourceKey(source);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Receipt size={16} className="text-primary" aria-hidden />
          <CardTitle>Spend outside Hālo</CardTitle>
        </div>
        <CardDescription>
          Mail drops, ads, bought lists and other money spent getting leads that no provider call records. Each entry counts as cost for the source and the
          state it names, and in the total either way. It is matched to the period by the day it was spent, so a longer period lines spend up with the leads
          it brought in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState title="Could not load" description={errorText(list.error)} onRetry={() => list.refetch()} />
        ) : list.data.length === 0 ? (
          <p className="text-body text-muted-foreground">No spend entered for this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Spent</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-caption">{day(s.spentOn)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{CATEGORIES[s.category] ?? s.category}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-caption">{s.source?.replace(/_/g, ' ') ?? '—'}</TableCell>
                    <TableCell className="font-mono text-caption">{s.state ?? '—'}</TableCell>
                    <TableCell className="max-w-48 truncate text-caption" title={s.note ?? undefined}>
                      {s.vendor ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-caption">{money(s.amountUsd)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" loading={remove.isPending && remove.variables === s.id} onClick={() => remove.mutate(s.id)}>
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-40">
              <Field label="Spent on" htmlFor="spend-date">
                <Input id="spend-date" type="date" value={spentOn} max={today()} onChange={(e) => setSpentOn(e.target.value)} />
              </Field>
            </div>
            <div className="w-52">
              <Field label="Category" htmlFor="spend-category">
                <Select id="spend-category" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                  {(Object.keys(CATEGORIES) as Category[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORIES[c]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-36">
              <Field label="Amount (USD)" htmlFor="spend-amount">
                <Input id="spend-amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
            </div>
            <div className="min-w-48 flex-1">
              <Field label="Lead source it bought" htmlFor="spend-source">
                <Input id="spend-source" list="spend-sources" placeholder="direct_mail_q4" value={source} onChange={(e) => setSource(e.target.value)} />
              </Field>
              <datalist id="spend-sources">
                {sources.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="w-20">
              <Field label="State" htmlFor="spend-state">
                <Input id="spend-state" maxLength={2} className="uppercase" value={state} onChange={(e) => setState(e.target.value.toUpperCase())} />
              </Field>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-56">
              <Field label="Vendor" htmlFor="spend-vendor">
                <Input id="spend-vendor" maxLength={120} value={vendor} onChange={(e) => setVendor(e.target.value)} />
              </Field>
            </div>
            <div className="min-w-64 flex-1">
              <Field label="Note" htmlFor="spend-note">
                <Input id="spend-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
            <Button size="sm" disabled={!amountValid || !stateValid || !spentOn} loading={add.isPending} onClick={() => add.mutate()}>
              Record spend
            </Button>
          </div>
          <p className="text-caption text-muted-foreground">
            {key && !sources.includes(key)
              ? `No lead in this period carries the source "${key}" yet. The spend still counts, under that source, and leads tagged source:${key} will line up with it.`
              : 'Name the source exactly as the leads carry it (the source: tag on each lead) so the spend lines up with what it brought in. Leave it empty for spend that bought no one source, such as software.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
