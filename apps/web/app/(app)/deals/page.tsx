'use client';

import Link from 'next/link';
import { useApiQuery } from '@/lib/api-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/page-header';
import { LoadingState, EmptyState, ErrorState, SkeletonTable } from '@/components/states';
import { useReducedMotion, staggerDelay } from '@/lib/motion';
import { Plus, Handshake, ArrowRight } from 'lucide-react';

interface Deal {
  id: string;
  stage: string;
  arv?: number;
  repairEstimate?: number;
  mao?: number;
  offerAmount?: number;
  createdAt: string;
  property?: {
    address: string;
    city: string;
    state: string;
  };
}

const stageVariant = (stage: string) => {
  switch (stage) {
    case 'new':
      return 'secondary' as const;
    case 'contacted':
      return 'info' as const;
    case 'negotiating':
      return 'warning' as const;
    case 'under_contract':
      return 'default' as const;
    case 'marketing':
      return 'info' as const;
    case 'assigned':
      return 'success' as const;
    case 'closed':
      return 'success' as const;
    case 'lost':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
};

function FinancialField({
  label,
  value,
  highlight,
}: {
  label: string;
  value?: number;
  highlight?: boolean;
}) {
  if (value == null) {
    return (
      <div className="space-y-0.5">
        <p className="text-caption uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="font-mono text-body text-muted-foreground">—</p>
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      <p className="text-caption uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-mono text-body font-semibold ${highlight ? 'text-primary' : 'text-foreground'}`}>
        ${value.toLocaleString()}
      </p>
    </div>
  );
}

export default function DealsPage() {
  const reduced = useReducedMotion();
  const { data: deals = [], isPending, isError, error, refetch } = useApiQuery<Deal[]>('/deals');

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Deals"
        description="Pipeline view across all wholesaling opportunities."
        actions={
          <Button size="sm">
            <Plus size={16} className="mr-2" />
            New Deal
          </Button>
        }
      />

      {isPending ? (
        <LoadingState skeleton>
          <SkeletonTable rows={5} cols={4} />
        </LoadingState>
      ) : isError ? (
        <ErrorState
          title="Couldn't load deals"
          description={error?.message ?? 'The deals service did not respond.'}
          onRetry={() => refetch()}
        />
      ) : deals.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="No deals in pipeline"
          description="Convert a qualified lead to start a deal, or create one manually."
          action={
            <Button size="sm">
              <Plus size={16} className="mr-2" />
              New Deal
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {deals.map((deal, i) => (
            <Link
              key={deal.id}
              href={`/deals/${deal.id}`}
              prefetch
              className="block animate-fade-up rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              style={{ animationDelay: staggerDelay(i, reduced, 30) }}
            >
              <Card variant="interactive" className="group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge variant={stageVariant(deal.stage)}>
                          {deal.stage.replace('_', ' ')}
                        </Badge>
                        {deal.property && (
                          <span className="text-body text-muted-foreground">
                            {deal.property.address}, {deal.property.city}, {deal.property.state}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-8">
                        <FinancialField label="ARV" value={deal.arv} />
                        <FinancialField label="Repairs" value={deal.repairEstimate} />
                        <FinancialField label="MAO" value={deal.mao} />
                        <FinancialField label="Offer" value={deal.offerAmount} highlight />
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-caption text-muted-foreground">
                        {new Date(deal.createdAt).toLocaleDateString()}
                      </span>
                      <ArrowRight
                        size={16}
                        aria-hidden
                        className="text-muted-foreground transition-transform duration-fast ease-out-expo group-hover:translate-x-0.5 group-hover:text-foreground"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
