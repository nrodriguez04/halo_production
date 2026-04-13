'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Upload, Search, Plus } from 'lucide-react';

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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      const response = await apiFetch('/leads');
      const data = await response.json();
      setLeads(data);
    } catch (error) {
      console.error('Failed to fetch leads:', error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = leads.filter(
    (l) =>
      !search ||
      l.canonicalAddress?.toLowerCase().includes(search.toLowerCase()) ||
      l.canonicalCity?.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
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
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{filtered.length} leads</CardTitle>
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
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No leads found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((lead) => (
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
