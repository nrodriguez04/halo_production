'use client';

import { useState } from 'react';
import { PhoneOff } from 'lucide-react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { apiUpload } from '@/lib/api-fetch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ErrorState, LoadingState } from '@/components/states';
import { toast } from '@/components/ui/toast';
import { Field } from '@/components/disposition/agreement-panel';
import { day, errorText } from '@/lib/disposition';

interface RegistryList {
  id: string;
  source: string;
  areaCodes: string[];
  fetchedAt: string;
  expiresAt: string;
  current: boolean;
  numberCount: number;
  skipped: number;
  fileName: string | null;
  shared: boolean;
}

interface RegistryStatus {
  required: boolean;
  maxAgeDays: number;
  coveredAreaCodes: string[];
  lists: RegistryList[];
}

interface ImportResult {
  numbers: number;
  skipped: number;
  retired: number;
}

const PATH = '/compliance/dnc-registry';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Do Not Call registry data (docs/communications.md s7): what is covered,
 * what has lapsed, and the import of a downloaded file.
 */
export function DncRegistryCard() {
  const qc = useQueryClient();
  const status = useApiQuery<RegistryStatus>(PATH);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState('national');
  const [areaCodes, setAreaCodes] = useState('');
  const [fetchedAt, setFetchedAt] = useState(today());
  const [decision, setDecision] = useState<'required' | 'not_required'>('required');
  const [reason, setReason] = useState('');

  const refresh = () => qc.invalidateQueries({ queryKey: [PATH] });

  const upload = useApiMutation<void, ImportResult>(
    () => {
      const form = new FormData();
      form.append('file', file as File);
      form.append('source', source.trim());
      form.append('areaCodes', areaCodes);
      form.append('fetchedAt', fetchedAt);
      return apiUpload<ImportResult>(`${PATH}/import`, form);
    },
    {
      onSuccess: (out) => {
        toast.success(`Imported ${out.numbers.toLocaleString('en-US')} numbers`, {
          description: `${out.skipped.toLocaleString('en-US')} lines skipped${out.retired ? `; ${out.retired} older list(s) replaced` : ''}.`,
        });
        setFile(null);
        refresh();
      },
      onError: (err) => toast.error('Import failed', { description: errorText(err) }),
    },
  );

  const remove = useApiMutation<string>((id) => apiJson(`${PATH}/${id}`, { method: 'DELETE' }), {
    onSuccess: () => {
      toast.success('Removed');
      refresh();
    },
    onError: (err) => toast.error('Could not remove it', { description: errorText(err) }),
  });

  const record = useApiMutation<void>(
    () =>
      apiJson(`${PATH}/required`, {
        method: 'POST',
        body: JSON.stringify({ required: decision === 'required', reason }),
      }),
    {
      onSuccess: () => {
        toast.success('Recorded');
        setReason('');
        refresh();
      },
      onError: (err) => toast.error('Could not record it', { description: errorText(err) }),
    },
  );

  const codes = areaCodes.split(/[\s,]+/).filter(Boolean);
  const codesValid = codes.length > 0 && codes.every((c) => /^[2-9]\d{2}$/.test(c));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <PhoneOff size={16} className="text-primary" aria-hidden />
          <CardTitle>Do Not Call registry</CardTitle>
          {status.data && (
            <Badge variant={status.data.required ? 'warning' : 'secondary'}>
              scrubbing {status.data.required ? 'required' : 'not required'}
            </Badge>
          )}
        </div>
        <CardDescription>
          Marketing texts are checked against the registry data imported here. An area code is covered for {status.data?.maxAgeDays ?? 31} days after the
          download. While scrubbing is required, a marketing text is refused when its area code is not covered, or when the number is listed and there is
          no written consent on file. Replies and deal paperwork are not checked.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isPending ? (
          <LoadingState />
        ) : status.isError ? (
          <ErrorState title="Could not load" description={errorText(status.error)} onRetry={() => status.refetch()} />
        ) : (
          <>
            <p className="text-body">
              {status.data.coveredAreaCodes.length ? (
                <>
                  Covered today: <span className="font-mono">{status.data.coveredAreaCodes.join(', ')}</span>
                </>
              ) : (
                <span className="text-amber-400">No area code is covered, so no marketing text can go out while scrubbing is required.</span>
              )}
            </p>
            {status.data.lists.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Area codes</TableHead>
                      <TableHead>Downloaded</TableHead>
                      <TableHead>Covers until</TableHead>
                      <TableHead className="text-right">Numbers</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {status.data.lists.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <Badge variant="outline">{l.source === 'national' ? 'National' : l.source}</Badge>
                        </TableCell>
                        <TableCell className="max-w-64 truncate font-mono text-caption" title={l.areaCodes.join(', ')}>
                          {l.areaCodes.join(', ')}
                        </TableCell>
                        <TableCell className="text-caption">{day(l.fetchedAt)}</TableCell>
                        <TableCell>
                          <Badge variant={l.current ? 'success' : 'destructive'}>{l.current ? day(l.expiresAt) : 'lapsed'}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-caption">{l.numberCount.toLocaleString('en-US')}</TableCell>
                        <TableCell>
                          {!l.shared && (
                            <Button size="sm" variant="ghost" loading={remove.isPending} onClick={() => remove.mutate(l.id)}>
                              Remove
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-caption text-muted-foreground">
            Download the registry for the area codes you subscribed to at telemarketing.donotcall.gov, unzip it, and import each file: one number per line.
            A new download of the same area codes replaces the old one.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1">
              <Field label="File" htmlFor="dnc-file">
                <Input id="dnc-file" type="file" accept=".txt,.csv,text/plain,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </Field>
            </div>
            <div className="w-40">
              <Field label="List" htmlFor="dnc-source">
                <Select id="dnc-source" value={source === 'national' ? 'national' : 'state'} onChange={(e) => setSource(e.target.value === 'national' ? 'national' : '')}>
                  <option value="national">National registry</option>
                  <option value="state">A state list</option>
                </Select>
              </Field>
            </div>
            {source !== 'national' && (
              <div className="w-20">
                <Field label="State" htmlFor="dnc-state">
                  <Input id="dnc-state" maxLength={2} className="uppercase" value={source} onChange={(e) => setSource(e.target.value.toUpperCase())} />
                </Field>
              </div>
            )}
            <div className="min-w-48 flex-1">
              <Field label="Area codes in the file" htmlFor="dnc-codes">
                <Input id="dnc-codes" placeholder="214, 469, 972" value={areaCodes} onChange={(e) => setAreaCodes(e.target.value)} />
              </Field>
            </div>
            <div className="w-40">
              <Field label="Downloaded on" htmlFor="dnc-date">
                <Input id="dnc-date" type="date" value={fetchedAt} max={today()} onChange={(e) => setFetchedAt(e.target.value)} />
              </Field>
            </div>
            <Button
              size="sm"
              disabled={!file || !codesValid || (source !== 'national' && !/^[A-Z]{2}$/.test(source))}
              loading={upload.isPending}
              onClick={() => upload.mutate()}
            >
              Import
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="w-48">
            <Field label="Counsel's answer" htmlFor="dnc-decision">
              <Select id="dnc-decision" value={decision} onChange={(e) => setDecision(e.target.value as 'required' | 'not_required')}>
                <option value="required">Scrubbing required</option>
                <option value="not_required">Scrubbing not required</option>
              </Select>
            </Field>
          </div>
          <div className="min-w-64 flex-1">
            <Field label="Reason (who said so, and where it is written)" htmlFor="dnc-reason">
              <Input id="dnc-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
          <Button size="sm" variant="outline" disabled={reason.trim().length < 10} loading={record.isPending} onClick={() => record.mutate()}>
            Record
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
