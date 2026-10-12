'use client';

import { useMemo, useState } from 'react';
import { useApiQuery, useApiMutation, apiJson } from '@/lib/api-query';
import { apiDownload } from '@/lib/api-fetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { EmptyState } from '@/components/states';
import { Download, FileSignature, FileText, RefreshCw, Send } from 'lucide-react';

export interface ContractRow {
  id: string;
  status: string;
  createdAt: string;
  docusignEnvelopeId?: string | null;
  pdfUrl?: string | null;
  metadata?: {
    emailSubject?: string;
    env?: string;
    documents?: Array<{ id: string; title: string; fileName?: string }>;
    recipients?: Array<{ role: string; name: string }>;
    signedDocumentId?: string;
    lastEvent?: string;
  } | null;
}

interface LibraryDoc {
  id: string;
  title: string;
  category: string;
  fileName: string;
  tags: string[];
  dealId: string | null;
}

interface BuyerRow {
  id: string;
  name: string;
  email: string | null;
}

const statusVariant: Record<string, 'success' | 'destructive' | 'warning' | 'info' | 'secondary'> = {
  sent: 'info',
  delivered: 'info',
  completed: 'success',
  signed: 'success',
  declined: 'destructive',
  voided: 'destructive',
  draft: 'secondary',
};

const SIGNABLE = /\.(pdf|docx?|txt|rtf|png|jpe?g)$/i;

export function ContractsPanel({
  dealId,
  propertyAddress,
  lead,
  contracts,
  onChanged,
}: {
  dealId: string;
  propertyAddress?: string;
  lead?: { canonicalOwner?: string | null; canonicalEmail?: string | null } | null;
  contracts: ContractRow[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [includeSeller, setIncludeSeller] = useState(true);
  const [buyerId, setBuyerId] = useState('');
  const [otherName, setOtherName] = useState('');
  const [otherEmail, setOtherEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const dealDocs = useApiQuery<LibraryDoc[]>('/documents', { params: { dealId }, enabled: open });
  const templates = useApiQuery<LibraryDoc[]>('/documents', {
    params: { category: 'agreement_template' },
    enabled: open,
  });
  const buyers = useApiQuery<BuyerRow[]>('/buyers', { enabled: open });

  const candidates = useMemo(() => {
    const seen = new Set<string>();
    return [...(dealDocs.data ?? []), ...(templates.data ?? [])].filter((d) => {
      if (seen.has(d.id) || !SIGNABLE.test(d.fileName)) return false;
      seen.add(d.id);
      return true;
    });
  }, [dealDocs.data, templates.data]);

  const sellerEmail = lead?.canonicalEmail ?? null;
  const sellerName = lead?.canonicalOwner ?? 'Property owner';

  const sendMutation = useApiMutation<void, { contractId: string; envelopeId: string; status: string }>(
    () => {
      const recipients: Array<Record<string, string>> = [];
      if (includeSeller && sellerEmail) recipients.push({ role: 'seller' });
      if (buyerId) recipients.push({ role: 'buyer', buyerId });
      if (otherName.trim() && otherEmail.trim()) {
        recipients.push({ role: 'other', name: otherName.trim(), email: otherEmail.trim() });
      }
      return apiJson('/integrations/docusign/envelopes', {
        method: 'POST',
        body: JSON.stringify({
          dealId,
          documentIds: selectedDocs,
          recipients,
          ...(subject.trim() ? { emailSubject: subject.trim() } : {}),
        }),
      });
    },
    {
      onSuccess: (res) => {
        toast.success('Sent for signature', { description: `Envelope ${res.envelopeId} is ${res.status}.` });
        setOpen(false);
        setSelectedDocs([]);
        setBuyerId('');
        setOtherName('');
        setOtherEmail('');
        onChanged();
      },
      onError: (err) => toast.error('Could not send', { description: err?.message ?? 'Unknown error' }),
    },
  );

  const refresh = async (c: ContractRow) => {
    if (!c.docusignEnvelopeId) return;
    setBusyId(c.id);
    try {
      const res = await apiJson<{ status: string }>(
        `/integrations/docusign/envelopes/${c.docusignEnvelopeId}/status`,
      );
      toast.success(`Envelope is ${res.status}`);
      onChanged();
    } catch (err: any) {
      toast.error('Could not refresh', { description: err?.message });
    } finally {
      setBusyId(null);
    }
  };

  const pullSigned = async (c: ContractRow) => {
    setBusyId(c.id);
    try {
      await apiJson(`/integrations/docusign/contracts/${c.id}/store-signed`, { method: 'POST' });
      toast.success('Signed copy filed in Documents');
      onChanged();
    } catch (err: any) {
      toast.error('Could not pull the signed copy', { description: err?.message });
    } finally {
      setBusyId(null);
    }
  };

  const recipientCount =
    (includeSeller && sellerEmail ? 1 : 0) + (buyerId ? 1 : 0) + (otherName.trim() && otherEmail.trim() ? 1 : 0);
  const canSend = selectedDocs.length > 0 && recipientCount > 0 && !sendMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-primary" aria-hidden />
            <CardTitle>Contracts</CardTitle>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <FileSignature size={14} className="mr-1" aria-hidden />
            Send for signature
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {contracts.length > 0 ? (
          <div className="space-y-2">
            {contracts.map((c) => {
              const signedId = c.metadata?.signedDocumentId;
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-secondary/40 px-3 py-2"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusVariant[c.status] ?? 'secondary'}>{c.status}</Badge>
                      <span className="text-body font-medium text-foreground">
                        {c.metadata?.emailSubject ?? 'DocuSign envelope'}
                      </span>
                      {c.metadata?.env === 'demo' && <Badge variant="secondary">sandbox</Badge>}
                    </div>
                    <p className="text-caption text-muted-foreground">
                      {(c.metadata?.documents ?? []).map((d) => d.title).join(', ') || 'No document record'}
                      {' · '}
                      {(c.metadata?.recipients ?? []).map((r) => `${r.role}: ${r.name}`).join(', ') ||
                        'recipients unknown'}
                      {' · '}
                      {new Date(c.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {c.docusignEnvelopeId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => refresh(c)}
                        disabled={busyId === c.id}
                        aria-label="Refresh status"
                      >
                        <RefreshCw size={14} className={busyId === c.id ? 'animate-spin' : ''} aria-hidden />
                      </Button>
                    )}
                    {signedId ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          apiDownload(`/documents/${signedId}/download`, `signed-${c.docusignEnvelopeId}.pdf`)
                        }
                      >
                        <Download size={14} className="mr-1" aria-hidden />
                        Signed PDF
                      </Button>
                    ) : (
                      ['completed', 'signed'].includes(c.status) && (
                        <Button size="sm" variant="outline" onClick={() => pullSigned(c)} disabled={busyId === c.id}>
                          Pull signed copy
                        </Button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="No contracts yet"
            description="Pick a document from the library and send it to the seller, a buyer, or anyone else for signature."
          />
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send for signature</DialogTitle>
            <DialogDescription>
              Documents come from the library; recipients are real people on this deal. Nothing is sent to a
              placeholder address.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <section className="space-y-2">
              <p className="text-caption font-medium uppercase tracking-wider text-muted-foreground">
                Documents
              </p>
              {dealDocs.isPending || templates.isPending ? (
                <p className="text-caption text-muted-foreground">Loading the library…</p>
              ) : candidates.length === 0 ? (
                <p className="text-caption text-muted-foreground">
                  No signable document is attached to this deal and no agreement template exists yet. Upload one
                  on the Documents page first.
                </p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {candidates.map((d) => {
                    const checked = selectedDocs.includes(d.id);
                    return (
                      <li key={d.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-body hover:bg-secondary">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setSelectedDocs((s) =>
                                e.target.checked ? [...s, d.id] : s.filter((id) => id !== d.id),
                              )
                            }
                          />
                          <span className="min-w-0 flex-1 truncate">{d.title}</span>
                          <Badge variant="secondary">{d.category.replace(/_/g, ' ')}</Badge>
                          {d.dealId === dealId && <Badge variant="info">this deal</Badge>}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <p className="text-caption font-medium uppercase tracking-wider text-muted-foreground">
                Recipients
              </p>
              <label className="flex items-center gap-2 text-body">
                <input
                  type="checkbox"
                  checked={includeSeller && !!sellerEmail}
                  disabled={!sellerEmail}
                  onChange={(e) => setIncludeSeller(e.target.checked)}
                />
                <span>
                  Seller: {sellerName}{' '}
                  <span className="text-muted-foreground">
                    {sellerEmail ? `(${sellerEmail})` : '(no email on the lead)'}
                  </span>
                </span>
              </label>
              <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
                <span className="text-body">Buyer</span>
                <Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
                  <option value="">None</option>
                  {(buyers.data ?? []).map((b) => (
                    <option key={b.id} value={b.id} disabled={!b.email}>
                      {b.name}
                      {b.email ? ` (${b.email})` : ' (no email)'}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Other recipient name" value={otherName} onChange={(e) => setOtherName(e.target.value)} />
                <Input
                  placeholder="Other recipient email"
                  type="email"
                  value={otherEmail}
                  onChange={(e) => setOtherEmail(e.target.value)}
                />
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-caption font-medium uppercase tracking-wider text-muted-foreground">
                Email subject
              </p>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={`Purchase Agreement for ${propertyAddress ?? 'the property'}`}
                maxLength={100}
              />
              <p className="text-caption text-muted-foreground">
                Templates can carry the anchors [SELLER_SIGNATURE], [BUYER_SIGNATURE], [SELLER_DATE] and
                [BUYER_DATE] so the tabs land where you put them; without anchors the signer places their own.
              </p>
            </section>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => sendMutation.mutate()} disabled={!canSend}>
              <Send size={14} className="mr-1" aria-hidden />
              {sendMutation.isPending
                ? 'Sending…'
                : `Send to ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
