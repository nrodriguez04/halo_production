'use client';

import { useState } from 'react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { LoadingState, EmptyState, SkeletonTable } from '@/components/states';
import { useReducedMotion, staggerDelay } from '@/lib/motion';
import { RefreshCw, GitMerge, GitBranch, GitCompare } from 'lucide-react';

interface DuplicateLead {
  id: string;
  canonicalAddress?: string;
  canonicalCity?: string;
  canonicalState?: string;
  canonicalOwner?: string;
  canonicalPhone?: string;
  canonicalEmail?: string;
  status: string;
  createdAt: string;
}

interface DuplicatePair {
  lead1: DuplicateLead;
  lead2: DuplicateLead;
  similarity: number;
  reasons: string[];
}

function FieldRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5 last:border-0">
      <span className="text-caption text-muted-foreground">{label}</span>
      <span className="truncate text-right text-body font-medium text-foreground">
        {value || '—'}
      </span>
    </div>
  );
}

function LeadColumn({ lead, label }: { lead: DuplicateLead; label: string }) {
  const place = [lead.canonicalCity, lead.canonicalState].filter(Boolean).join(', ');
  return (
    <div className="rounded-md border border-border bg-card/60 p-4">
      <h3 className="mb-3 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </h3>
      <FieldRow label="Address" value={lead.canonicalAddress} />
      <FieldRow label="Place" value={place} />
      <FieldRow label="Owner" value={lead.canonicalOwner} />
      <FieldRow label="Phone" value={lead.canonicalPhone} />
      <FieldRow label="Email" value={lead.canonicalEmail} />
      <div className="flex items-baseline justify-between gap-3 pt-2">
        <span className="text-caption text-muted-foreground">Status</span>
        <Badge variant="info">{lead.status}</Badge>
      </div>
      <div className="mt-2 text-caption text-muted-foreground">
        Created {new Date(lead.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
}

export default function DataTriagePage() {
  const queryClient = useQueryClient();
  const reduced = useReducedMotion();
  const [selectedPair, setSelectedPair] = useState<DuplicatePair | null>(null);
  const [action, setAction] = useState<'merge' | 'distinct' | null>(null);

  const {
    data: duplicates = [],
    isPending,
    isFetching,
    refetch,
  } = useApiQuery<DuplicatePair[]>('/leads/duplicates', {
    params: { threshold: 0.7 },
  });

  const closeModal = () => {
    setSelectedPair(null);
    setAction(null);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/leads/duplicates'] });
    queryClient.invalidateQueries({ queryKey: ['/leads'] });
    closeModal();
  };

  const mergeMutation = useApiMutation<{ sourceId: string; targetId: string }, unknown>(
    ({ sourceId, targetId }) =>
      apiJson('/leads/merge', { method: 'POST', body: JSON.stringify({ sourceId, targetId }) }),
    {
      onSuccess: () => {
        toast.success('Leads merged');
        invalidate();
      },
      onError: (err: any) => toast.error('Merge failed', { description: err?.message }),
    },
  );

  const markDistinctMutation = useApiMutation<{ lead1Id: string; lead2Id: string }, unknown>(
    ({ lead1Id, lead2Id }) =>
      apiJson('/leads/mark-distinct', {
        method: 'POST',
        body: JSON.stringify({ lead1Id, lead2Id }),
      }),
    {
      onSuccess: () => {
        toast.success('Marked as distinct');
        invalidate();
      },
      onError: (err: any) => toast.error('Could not mark distinct', { description: err?.message }),
    },
  );

  const isConfirming = mergeMutation.isPending || markDistinctMutation.isPending;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Data Triage"
        description="Review and resolve potential duplicate leads detected by similarity scoring."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            loading={isFetching}
          >
            <RefreshCw size={16} className="mr-2" />
            Refresh
          </Button>
        }
      />

      {isPending ? (
        <LoadingState skeleton>
          <SkeletonTable rows={3} cols={2} />
        </LoadingState>
      ) : duplicates.length === 0 ? (
        <EmptyState
          icon={GitCompare}
          title="No potential duplicates"
          description="The duplicate detector found no pairs above the similarity threshold."
        />
      ) : (
        <div className="space-y-4">
          {duplicates.map((pair, i) => (
            <Card
              key={`${pair.lead1.id}-${pair.lead2.id}`}
              className="animate-fade-up"
              style={{ animationDelay: staggerDelay(i, reduced, 30) }}
            >
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="warning">{(pair.similarity * 100).toFixed(0)}% similar</Badge>
                    <span className="text-caption text-muted-foreground">
                      {pair.reasons.join(' · ')}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedPair(pair);
                        setAction('merge');
                      }}
                    >
                      <GitMerge size={14} className="mr-2" />
                      Merge
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedPair(pair);
                        setAction('distinct');
                      }}
                    >
                      <GitBranch size={14} className="mr-2" />
                      Mark Distinct
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <LeadColumn lead={pair.lead1} label="Lead 1" />
                  <LeadColumn lead={pair.lead2} label="Lead 2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedPair && !!action} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action === 'merge' ? 'Confirm Merge' : 'Mark as Distinct'}</DialogTitle>
            <DialogDescription>
              {action === 'merge'
                ? 'Merge Lead 1 into Lead 2? This combines all data and deletes Lead 1.'
                : 'Mark these leads as distinct? They will no longer appear in duplicate detection.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeModal} disabled={isConfirming}>
              Cancel
            </Button>
            <Button
              variant={action === 'merge' ? 'default' : 'secondary'}
              loading={isConfirming}
              onClick={() => {
                if (!selectedPair) return;
                action === 'merge'
                  ? mergeMutation.mutate({
                      sourceId: selectedPair.lead1.id,
                      targetId: selectedPair.lead2.id,
                    })
                  : markDistinctMutation.mutate({
                      lead1Id: selectedPair.lead1.id,
                      lead2Id: selectedPair.lead2.id,
                    });
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
