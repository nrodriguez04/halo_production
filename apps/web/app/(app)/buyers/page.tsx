'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { errorText } from '@/lib/disposition';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';
import { SearchFilterBar } from '@/components/search-filter-bar';
import { LoadingState, EmptyState, ErrorState, SkeletonTable } from '@/components/states';
import { Plus, Upload, UserCheck } from 'lucide-react';

// email / phone arrive masked (e.g. "d•••@acme.com") unless the user has
// pii:read; either may be null.
interface Buyer {
  id: string;
  name: string;
  email: string | null;
  phone?: string | null;
  preferences?: {
    locations?: string[];
    priceRange?: { min: number; max: number };
    propertyTypes?: string[];
  };
  createdAt: string;
  status?: string;
  pofStatus?: string;
  source?: string;
}

export default function BuyersPage() {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const queryClient = useQueryClient();

  const {
    data: buyers = [],
    isPending,
    isError,
    error,
    refetch,
  } = useApiQuery<Buyer[]>('/buyers');

  const addBuyerMutation = useApiMutation<typeof form, Buyer>(
    (input) =>
      apiJson<Buyer>('/buyers', {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          email: input.email,
          phone: input.phone || undefined,
          preferences: {},
        }),
      }),
    {
      onSuccess: () => {
        toast.success('Buyer added');
        setForm({ name: '', email: '', phone: '' });
        setShowAdd(false);
        queryClient.invalidateQueries({ queryKey: ['/buyers'] });
      },
      onError: (err: any) => toast.error('Could not add buyer', { description: err?.message }),
    },
  );

  const filtered = buyers.filter(
    (b) =>
      !search ||
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      (b.email ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Buyers"
        description="Cash buyers, end investors, and their stated preferences for matching."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>
              <Upload size={16} className="mr-2" />
              Import list
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus size={16} className="mr-2" />
              Add Buyer
            </Button>
          </>
        }
      />

      <SearchFilterBar value={search} onChange={setSearch} placeholder="Search buyers…" />

      {isPending ? (
        <LoadingState skeleton>
          <SkeletonTable rows={5} cols={4} />
        </LoadingState>
      ) : isError ? (
        <ErrorState
          title="Couldn't load buyers"
          description={error?.message ?? 'The buyers service did not respond.'}
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title={search ? 'No buyers match' : 'No buyers yet'}
          description={
            search ? 'Try a different search term.' : 'Add buyers to start matching them to deals.'
          }
          action={
            !search && (
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus size={16} className="mr-2" />
                Add Buyer
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{filtered.length} buyers</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Preferences</TableHead>
                  <TableHead>Funds</TableHead>
                  <TableHead>Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((buyer) => (
                  <TableRow key={buyer.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary"
                        >
                          <UserCheck size={14} />
                        </span>
                        <Link href={`/buyers/${buyer.id}`} className="font-medium text-foreground hover:underline">
                          {buyer.name}
                        </Link>
                        {buyer.status && buyer.status !== 'active' && (
                          <Badge variant="destructive">{buyer.status.replace(/_/g, ' ')}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{buyer.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {buyer.preferences?.locations?.map((l) => (
                          <Badge key={l} variant="secondary">
                            {l}
                          </Badge>
                        ))}
                        {buyer.preferences?.priceRange && (
                          <Badge variant="outline">
                            ${(buyer.preferences.priceRange.min / 1000).toFixed(0)}k – ${(buyer.preferences.priceRange.max / 1000).toFixed(0)}k
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={buyer.pofStatus === 'verified' ? 'success' : 'secondary'}>
                        {buyer.pofStatus ?? 'none'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(buyer.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Buyer</DialogTitle>
            <DialogDescription>
              Capture contact info now; preferences can be added later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="buyer-name" className="text-caption font-medium text-muted-foreground">
                Name
              </label>
              <Input
                id="buyer-name"
                placeholder="Acme Holdings"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="buyer-email" className="text-caption font-medium text-muted-foreground">
                Email
              </label>
              <Input
                id="buyer-email"
                type="email"
                placeholder="contact@acme.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="buyer-phone" className="text-caption font-medium text-muted-foreground">
                Phone (optional)
              </label>
              <Input
                id="buyer-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={addBuyerMutation.isPending}
              disabled={!form.name || !form.email}
              onClick={() => addBuyerMutation.mutate(form)}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ImportBuyersDialog open={showImport} onOpenChange={setShowImport} onDone={() => queryClient.invalidateQueries({ queryKey: ['/buyers'] })} />
    </div>
  );
}

/**
 * Import an authorized buyer list: one buyer per line, `name, email, phone,
 * areas (separated by ;), price from, price to`. Email consent is recorded
 * only when you state how everyone on the list asked for deals.
 */
function ImportBuyersDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [text, setText] = useState('');
  const [source, setSource] = useState('import');
  const [sourceDetail, setSourceDetail] = useState('');
  const [consentBasis, setConsentBasis] = useState('');
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.split(',').map((c) => c.trim()))
    .filter((c) => c[0])
    .map(([name, email, phone, areas, min, max]) => ({
      name,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      ...(areas ? { locations: areas.split(';').map((a) => a.trim()).filter(Boolean) } : {}),
      ...(min && Number(min) ? { priceMin: Number(min) } : {}),
      ...(max && Number(max) ? { priceMax: Number(max) } : {}),
    }));
  const run = useApiMutation<void, { created: number; updated: number; consentsRecorded: number; skipped: string[] }>(
    () =>
      apiJson('/buyers/import', {
        method: 'POST',
        body: JSON.stringify({
          source,
          sourceDetail,
          rows,
          ...(consentBasis.trim() ? { emailConsentBasis: consentBasis.trim() } : {}),
        }),
      }),
    {
      onSuccess: (r) => {
        toast.success(`${r.created} added, ${r.updated} updated, ${r.consentsRecorded} consent(s) recorded`, {
          description: r.skipped.length ? `Skipped: ${r.skipped.slice(0, 5).join('; ')}` : undefined,
        });
        onDone();
        onOpenChange(false);
        setText('');
      },
      onError: (e) => toast.error('Import failed', { description: errorText(e) }),
    },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a buyer list</DialogTitle>
          <DialogDescription>
            Only lists you are allowed to use. One buyer per line: name, email, phone, areas (separated by ;), price from,
            price to. Existing buyers (same email or phone) are filled in, never overwritten.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={8}
          className="font-mono text-caption"
          placeholder={'Jane Investor, jane@example.com, 4045550100, Atlanta;30310, 100000, 250000'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="imp-src" className="text-caption uppercase tracking-wider text-muted-foreground">Source</label>
            <Select id="imp-src" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="import">A list we own</option>
              <option value="referral">Referral</option>
              <option value="inbound_inquiry">Inbound inquiries</option>
              <option value="public_record">Public records</option>
            </Select>
          </div>
          <div className="space-y-1">
            <label htmlFor="imp-detail" className="text-caption uppercase tracking-wider text-muted-foreground">Which list</label>
            <Input id="imp-detail" value={sourceDetail} onChange={(e) => setSourceDetail(e.target.value)} placeholder="e.g. Website buyer signups, Oct 2026" />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="imp-consent" className="text-caption uppercase tracking-wider text-muted-foreground">
            Email consent (only if every buyer on the list asked for deals by email)
          </label>
          <Textarea id="imp-consent" rows={2} value={consentBasis} onChange={(e) => setConsentBasis(e.target.value)} placeholder="How they asked: e.g. 'Signed up on our buyers list form, which says we will email them deals'" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={rows.length === 0 || !sourceDetail.trim()} loading={run.isPending} onClick={() => run.mutate()}>
            Import {rows.length} buyer(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
