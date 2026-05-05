'use client';

import { useState } from 'react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { useDebouncedValue } from '@/lib/use-debounce';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';
import { SearchFilterBar } from '@/components/search-filter-bar';
import { LoadingState, EmptyState, ErrorState, SkeletonTable } from '@/components/states';
import { Upload, Plus, Loader2, Check, X, Users } from 'lucide-react';

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
    case 'new':
      return 'info' as const;
    case 'enriching':
      return 'info' as const;
    case 'enriched':
      return 'success' as const;
    case 'contacted':
      return 'warning' as const;
    case 'qualified':
      return 'success' as const;
    case 'disqualified':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
};

// The lifecycle controller validates legal transitions, but we hide
// buttons for terminal statuses so the UI never renders a click target
// that the api will just reject.
const canQualify = (status: string) => status === 'enriched' || status === 'contacted';
const canDisqualify = (status: string) => status !== 'disqualified';

export default function LeadsPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250);
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const {
    data: leads = [],
    isPending,
    isError,
    error,
    refetch,
  } = useApiQuery<Lead[]>('/leads', {
    params: { search: debouncedSearch || undefined, take: 200 },
    placeholderData: (prev) => prev,
  });

  const transitionMutation = useApiMutation<
    { leadId: string; next: 'qualified' | 'disqualified'; reason?: string },
    unknown
  >(
    ({ leadId, next, reason }) =>
      apiJson(`/lead-lifecycle/${leadId}/transition`, {
        method: 'POST',
        body: JSON.stringify({ next, reason }),
      }),
    {
      onMutate: ({ leadId }) => {
        setPendingId(leadId);
      },
      onSuccess: (_data, variables) => {
        toast.success(
          variables.next === 'qualified' ? 'Lead qualified' : 'Lead disqualified',
        );
      },
      onError: (err: any) => {
        toast.error('Transition failed', { description: err?.message });
      },
      onSettled: () => {
        setPendingId(null);
        queryClient.invalidateQueries({ queryKey: ['/leads'] });
      },
    },
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Leads"
        description="Source records, enrichment status, and qualification controls."
        actions={
          <>
            <Button variant="outline" size="sm">
              <Upload size={16} className="mr-2" />
              Import CSV
            </Button>
            <Button size="sm">
              <Plus size={16} className="mr-2" />
              New Lead
            </Button>
          </>
        }
      />

      <SearchFilterBar
        value={search}
        onChange={setSearch}
        placeholder="Search address, city, or owner…"
      />

      {isPending ? (
        <LoadingState skeleton>
          <SkeletonTable rows={6} cols={5} />
        </LoadingState>
      ) : isError ? (
        <ErrorState
          title="Couldn't load leads"
          description={error?.message ?? 'The server returned an error.'}
          onRetry={() => refetch()}
        />
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No leads yet"
          description={
            debouncedSearch
              ? 'No leads match that search. Try clearing it or import a CSV.'
              : 'Import a CSV or add a lead manually to get started.'
          }
          action={
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
          }
        />
      ) : (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{leads.length} leads</CardTitle>
            <Badge variant="secondary" className="font-mono">
              {debouncedSearch ? `Filtered: "${debouncedSearch}"` : 'All'}
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => {
                  const busy = pendingId === lead.id;
                  return (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {lead.canonicalAddress || 'N/A'}
                        </div>
                        <div className="text-caption text-muted-foreground">
                          {[lead.canonicalCity, lead.canonicalState, lead.canonicalZip]
                            .filter(Boolean)
                            .join(', ')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(lead.status)}>{lead.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {lead.score ? lead.score.toFixed(2) : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {canQualify(lead.status) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() =>
                                    transitionMutation.mutate({ leadId: lead.id, next: 'qualified' })
                                  }
                                  aria-label={`Qualify lead ${lead.canonicalAddress ?? lead.id}`}
                                >
                                  {busy ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <Check size={14} />
                                  )}
                                  <span className="ml-1">Qualify</span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Mark this lead as qualified</TooltipContent>
                            </Tooltip>
                          )}
                          {canDisqualify(lead.status) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() =>
                                    transitionMutation.mutate({
                                      leadId: lead.id,
                                      next: 'disqualified',
                                      reason: 'manual',
                                    })
                                  }
                                  aria-label={`Disqualify lead ${lead.canonicalAddress ?? lead.id}`}
                                >
                                  {busy ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <X size={14} />
                                  )}
                                  <span className="ml-1">Disqualify</span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Reject this lead</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
