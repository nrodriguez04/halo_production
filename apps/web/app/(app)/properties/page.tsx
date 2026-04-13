'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/api-fetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Search, RefreshCw } from 'lucide-react';

const PropertyMap = dynamic(() => import('@/components/property-map'), { ssr: false });

interface Property {
  id: string;
  address: string;
  city: string;
  state: string;
  zip?: string;
  estimatedValue?: number;
  confidence?: number;
  deals?: Array<{ id: string; stage: string }>;
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');

  useEffect(() => {
    fetchProperties();
  }, [stateFilter]);

  const fetchProperties = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('city', search);
      if (stateFilter) params.set('state', stateFilter);
      const res = await apiFetch(`/properties/search?${params.toString()}`);
      if (res.ok) setProperties(await res.json());
    } catch {
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Properties</h1>
        <Button variant="outline" size="sm" onClick={fetchProperties}>
          <RefreshCw size={16} className="mr-2" /> Refresh
        </Button>
      </div>

      <PropertyMap />

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Filter by city..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" onKeyDown={(e) => e.key === 'Enter' && fetchProperties()} />
        </div>
        <Select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="w-32">
          <option value="">All States</option>
          {['TX','CA','FL','GA','AZ','NC','TN','OH','IN','MO','CO','NV'].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle>{properties.length} properties</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>City/State</TableHead>
                <TableHead>Estimated Value</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Deals</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {properties.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No properties found</TableCell>
                </TableRow>
              ) : (
                properties.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium text-foreground">{p.address}</TableCell>
                    <TableCell className="text-muted-foreground">{p.city}, {p.state}</TableCell>
                    <TableCell className="text-foreground">{p.estimatedValue ? `$${p.estimatedValue.toLocaleString()}` : '--'}</TableCell>
                    <TableCell>
                      {p.confidence != null ? (
                        <Badge variant={p.confidence > 0.7 ? 'success' : p.confidence > 0.4 ? 'warning' : 'destructive'}>
                          {(p.confidence * 100).toFixed(0)}%
                        </Badge>
                      ) : '--'}
                    </TableCell>
                    <TableCell>
                      {(p.deals?.length || 0) > 0 ? (
                        <div className="flex gap-1">
                          {p.deals!.map((d) => <Badge key={d.id} variant="info">{d.stage}</Badge>)}
                        </div>
                      ) : <span className="text-muted-foreground">--</span>}
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
