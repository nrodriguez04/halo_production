'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Plus, Search, UserCheck } from 'lucide-react';

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
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });

  useEffect(() => {
    fetchBuyers();
  }, []);

  const fetchBuyers = async () => {
    try {
      const res = await apiFetch('/buyers');
      const data = await res.json();
      setBuyers(Array.isArray(data) ? data : []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const addBuyer = async () => {
    const res = await apiFetch('/buyers', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        preferences: {},
      }),
    });
    if (res.ok) {
      setForm({ name: '', email: '', phone: '' });
      setShowAdd(false);
      fetchBuyers();
    }
  };

  const filtered = buyers.filter(
    (b) => !search || b.name.toLowerCase().includes(search.toLowerCase()) || b.email.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading buyers...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Buyers</h1>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus size={16} className="mr-2" /> Add Buyer
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardHeader><CardTitle>New Buyer</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={addBuyer} disabled={!form.name || !form.email}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search buyers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardHeader><CardTitle>{filtered.length} buyers</CardTitle></CardHeader>
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
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No buyers found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((buyer) => (
                  <TableRow key={buyer.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserCheck size={16} className="text-primary" />
                        <span className="font-medium text-foreground">{buyer.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{buyer.email}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {buyer.preferences?.locations?.map((l) => (
                          <Badge key={l} variant="secondary">{l}</Badge>
                        ))}
                        {buyer.preferences?.priceRange && (
                          <Badge variant="outline">
                            ${(buyer.preferences.priceRange.min / 1000).toFixed(0)}k - ${(buyer.preferences.priceRange.max / 1000).toFixed(0)}k
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(buyer.createdAt).toLocaleDateString()}
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
