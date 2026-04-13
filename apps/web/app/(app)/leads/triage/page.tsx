'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';

interface DuplicatePair {
  lead1: {
    id: string;
    canonicalAddress?: string;
    canonicalCity?: string;
    canonicalState?: string;
    canonicalOwner?: string;
    canonicalPhone?: string;
    canonicalEmail?: string;
    status: string;
    createdAt: string;
  };
  lead2: {
    id: string;
    canonicalAddress?: string;
    canonicalCity?: string;
    canonicalState?: string;
    canonicalOwner?: string;
    canonicalPhone?: string;
    canonicalEmail?: string;
    status: string;
    createdAt: string;
  };
  similarity: number;
  reasons: string[];
}

function LeadColumn({ lead, label }: { lead: DuplicatePair['lead1']; label: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground mb-3">{label}</h3>
      <div className="space-y-2 text-sm">
        <div>
          <span className="text-muted-foreground">Address: </span>
          <span className="text-foreground font-medium">{lead.canonicalAddress || 'N/A'}</span>
          {lead.canonicalCity && (
            <span className="text-muted-foreground">, {lead.canonicalCity}, {lead.canonicalState}</span>
          )}
        </div>
        <div>
          <span className="text-muted-foreground">Owner: </span>
          <span className="text-foreground font-medium">{lead.canonicalOwner || 'N/A'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Phone: </span>
          <span className="text-foreground font-medium">{lead.canonicalPhone || 'N/A'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Email: </span>
          <span className="text-foreground font-medium">{lead.canonicalEmail || 'N/A'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Status: </span>
          <Badge variant="info">{lead.status}</Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          Created: {new Date(lead.createdAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}

export default function DataTriagePage() {
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPair, setSelectedPair] = useState<DuplicatePair | null>(null);
  const [action, setAction] = useState<'merge' | 'distinct' | null>(null);

  useEffect(() => {
    fetchDuplicates();
  }, []);

  const fetchDuplicates = async () => {
    try {
      const response = await apiFetch('/leads/duplicates?threshold=0.7');
      const data = await response.json();
      setDuplicates(data);
    } catch (error) {
      console.error('Failed to fetch duplicates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async (sourceId: string, targetId: string) => {
    try {
      await apiFetch('/leads/merge', { method: 'POST', body: JSON.stringify({ sourceId, targetId }) });
      fetchDuplicates();
      setSelectedPair(null);
      setAction(null);
    } catch (error) {
      console.error('Failed to merge leads:', error);
    }
  };

  const handleMarkDistinct = async (lead1Id: string, lead2Id: string) => {
    try {
      await apiFetch('/leads/mark-distinct', { method: 'POST', body: JSON.stringify({ lead1Id, lead2Id }) });
      fetchDuplicates();
      setSelectedPair(null);
      setAction(null);
    } catch (error) {
      console.error('Failed to mark as distinct:', error);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading duplicate detection...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Data Triage</h1>
          <p className="text-sm text-muted-foreground mt-1">Review and resolve potential duplicate leads</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchDuplicates}>
          <RefreshCw size={16} className="mr-2" />
          Refresh
        </Button>
      </div>

      {duplicates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No potential duplicates found
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {duplicates.map((pair) => (
            <Card key={`${pair.lead1.id}-${pair.lead2.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="warning">{(pair.similarity * 100).toFixed(0)}% Similar</Badge>
                    <span className="text-sm text-muted-foreground">{pair.reasons.join(', ')}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { setSelectedPair(pair); setAction('merge'); }}>
                      Merge
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => { setSelectedPair(pair); setAction('distinct'); }}>
                      Mark Distinct
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6">
                  <div className="border-r border-border pr-6">
                    <LeadColumn lead={pair.lead1} label="Lead 1" />
                  </div>
                  <LeadColumn lead={pair.lead2} label="Lead 2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedPair && action && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <Card className="max-w-md w-full mx-4">
            <CardHeader>
              <CardTitle className="text-lg text-foreground">
                {action === 'merge' ? 'Confirm Merge' : 'Mark as Distinct'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {action === 'merge'
                  ? 'Merge Lead 1 into Lead 2? This will combine all data and delete Lead 1.'
                  : 'Mark these leads as distinct? They will no longer appear in duplicate detection.'}
              </p>
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  variant={action === 'merge' ? 'default' : 'secondary'}
                  onClick={() =>
                    action === 'merge'
                      ? handleMerge(selectedPair.lead1.id, selectedPair.lead2.id)
                      : handleMarkDistinct(selectedPair.lead1.id, selectedPair.lead2.id)
                  }
                >
                  Confirm
                </Button>
                <Button className="flex-1" variant="outline" onClick={() => { setSelectedPair(null); setAction(null); }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
