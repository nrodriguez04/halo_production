'use client';

import { useState } from 'react';
import { useApiQuery } from '@/lib/api-query';
import { useDebouncedValue } from '@/lib/use-debounce';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Upload, Search, Plus, Loader2 } from 'lucide-react';

interface Lead {
  id: string;
  status: string;
  canonicalAddress?: string;
  canonicalCity?: string;
  canonicalState?: string;
  canonicalZip?: string;
  score?: number;
  tags: string[];
  createdAt: string;
}

const statusVariant = (status: string) => {
  switch (status) {
    case 'new': return 'info' as const;
    case 'enriched': return 'success' as const;
    case 'contacted': return 'warning' as const;
    default: return 'secondary' as const;
  }
};

export default function LeadsPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250);

  const {
    data: leads = [],
    isPending,
    isError,
    error,
    isFetching,
  } = useApiQuery<Lead[]>('/leads', {
    params: { search: debouncedSearch || undefined, take: 200 },
    placeholderData: (prev) => prev, // keep previous results visible while typing
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading leads...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Leads</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Upload size={16} className="mr-2" />
            Import CSV
          </Button>
          <Button size="sm">
            <Plus size={16} className="mr-2" />
            New Lead
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search address, city, or owner..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-9"
        />
        {isFetching && (
          <Loader2
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        )}
      </div>

      {isError && (
        <Card>
          <CardContent className="py-4 text-destructive text-sm">
            Failed to load leads{error?.message ? `: ${error.message}` : ''}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{leads.length} leads</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No leads found
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">
                        {lead.canonicalAddress || 'N/A'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {[lead.canonicalCity, lead.canonicalState, lead.canonicalZip]
                          .filter(Boolean)
                          .join(', ')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(lead.status)}>{lead.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {lead.score ? lead.score.toFixed(2) : '--'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
