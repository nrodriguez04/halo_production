'use client';

import { useState } from 'react';
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
import { Plus, UserCheck } from 'lucide-react';

interface Buyer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  preferences?: {
    locations?: string[];
    priceRange?: { min: number; max: number };
    propertyTypes?: string[];
  };
  createdAt: string;
}

export default function BuyersPage() {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
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
      b.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Buyers"
        description="Cash buyers, end investors, and their stated preferences for matching."
        actions={
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={16} className="mr-2" />
            Add Buyer
          </Button>
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
                        <span className="font-medium text-foreground">{buyer.name}</span>
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
    </div>
  );
}
