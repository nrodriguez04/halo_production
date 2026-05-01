'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-fetch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';

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
    case 'new': return 'secondary' as const;
    case 'contacted': return 'info' as const;
    case 'negotiating': return 'warning' as const;
    case 'under_contract': return 'default' as const;
    case 'marketing': return 'info' as const;
    case 'assigned': return 'success' as const;
    case 'closed': return 'success' as const;
    case 'lost': return 'destructive' as const;
    default: return 'secondary' as const;
  }
};

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDeals();
  }, []);

  const fetchDeals = async () => {
    try {
      const response = await apiFetch('/deals');
      if (!response.ok) {
        console.error('Failed to fetch deals:', response.status, response.statusText);
        return;
      }
      const data = await response.json();
      setDeals(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch deals:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading deals...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Deals</h1>
        <Button size="sm">
          <Plus size={16} className="mr-2" />
          New Deal
        </Button>
      </div>

      {deals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">No deals found</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {deals.map((deal) => (
            <Link key={deal.id} href={`/deals/${deal.id}`}>
              <Card className="hover:border-primary/30 transition-colors cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <Badge variant={stageVariant(deal.stage)}>
                          {deal.stage.replace('_', ' ')}
                        </Badge>
                        {deal.property && (
                          <span className="text-sm text-muted-foreground">
                            {deal.property.address}, {deal.property.city}, {deal.property.state}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-8">
                        {deal.arv != null && (
                          <div>
                            <div className="text-xs text-muted-foreground">ARV</div>
                            <div className="text-sm font-semibold text-foreground">${deal.arv.toLocaleString()}</div>
                          </div>
                        )}
                        {deal.repairEstimate != null && (
                          <div>
                            <div className="text-xs text-muted-foreground">Repairs</div>
                            <div className="text-sm font-semibold text-foreground">${deal.repairEstimate.toLocaleString()}</div>
                          </div>
                        )}
                        {deal.mao != null && (
                          <div>
                            <div className="text-xs text-muted-foreground">MAO</div>
                            <div className="text-sm font-semibold text-foreground">${deal.mao.toLocaleString()}</div>
                          </div>
                        )}
                        {deal.offerAmount != null && (
                          <div>
                            <div className="text-xs text-muted-foreground">Offer</div>
                            <div className="text-sm font-semibold text-primary">${deal.offerAmount.toLocaleString()}</div>
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(deal.createdAt).toLocaleDateString()}
                    </span>
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
