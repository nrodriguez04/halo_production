'use client';

import { useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { Tag } from 'lucide-react';

/** GET /deals/:id `buyerPrice` (packages/shared buyerAskingPrice). */
export interface BuyerPrice {
  price: number;
  basis: 'asking_price' | 'contract_price' | 'offer' | 'mao' | 'arv';
  sellerPrice: number | null;
  fee: number | null;
}

export interface DealPricing {
  contractPrice?: number | null;
  assignmentPrice?: number | null;
  assignmentFee?: number | null;
}

const money = (n: number | null | undefined) =>
  n == null ? '—' : `$${Math.round(n).toLocaleString()}`;

function basisText(p: BuyerPrice): string {
  switch (p.basis) {
    case 'asking_price':
      return 'Set on this deal';
    case 'contract_price':
      return `Contract price ${money(p.sellerPrice)} + ${money(p.fee)} fee`;
    case 'offer':
      return `Offer to the seller ${money(p.sellerPrice)} + ${money(p.fee)} fee`;
    case 'mao':
      return `MAO ${money(p.sellerPrice)} + ${money(p.fee)} fee`;
    case 'arv':
      return '70% of ARV less repairs';
  }
}

const toField = (n: number | null | undefined) => (n == null ? '' : String(n));

/** Blank is null (use the default); anything else must be a non-negative number. */
function toAmount(s: string): number | null | undefined {
  const t = s.replace(/[$,\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * What buyers are asked to pay for this deal. Buyer marketing (the
 * Disposition Matcher's blast, flyers, buyer matching) uses this figure and
 * never the offer made to the seller.
 */
export function BuyerPricePanel({
  dealId,
  buyerPrice,
  pricing,
  onSaved,
}: {
  dealId: string;
  buyerPrice: BuyerPrice | null | undefined;
  pricing: DealPricing | null | undefined;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState('');
  const [contract, setContract] = useState('');
  const [fee, setFee] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAsking(toField(pricing?.assignmentPrice));
    setContract(toField(pricing?.contractPrice));
    setFee(toField(pricing?.assignmentFee));
  }, [open, pricing]);

  async function save() {
    const values = {
      assignmentPrice: toAmount(asking),
      contractPrice: toAmount(contract),
      assignmentFee: toAmount(fee),
    };
    if (Object.values(values).some((v) => v === undefined)) {
      toast.error('Enter amounts as positive numbers, or leave them blank');
      return;
    }
    setSaving(true);
    try {
      await apiJson(`/deal-economics/${dealId}`, {
        method: 'PUT',
        body: JSON.stringify(values),
      });
      toast.success('Buyer price saved');
      setOpen(false);
      onSaved();
    } catch (err: any) {
      toast.error('Could not save the buyer price', { description: err?.message });
    } finally {
      setSaving(false);
    }
  }

  const fields: Array<{
    id: string;
    label: string;
    hint: string;
    value: string;
    set: (v: string) => void;
  }> = [
    {
      id: 'bp-asking',
      label: 'Asking price for buyers',
      hint: 'When set, buyers see exactly this.',
      value: asking,
      set: setAsking,
    },
    {
      id: 'bp-contract',
      label: 'Contract price with the seller',
      hint: 'Blank uses the offer amount on the deal.',
      value: contract,
      set: setContract,
    },
    {
      id: 'bp-fee',
      label: 'Assignment fee for this deal',
      hint: 'Blank uses the default fee from Agents settings.',
      value: fee,
      set: setFee,
    },
  ];

  return (
    <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
      <div className="space-y-1">
        <p className="text-caption uppercase tracking-wider text-muted-foreground">Buyer price</p>
        <p className="font-mono text-h3 font-bold text-primary">
          {buyerPrice ? money(buyerPrice.price) : '—'}
        </p>
        <p className="text-caption text-muted-foreground">
          {buyerPrice
            ? basisText(buyerPrice)
            : 'Needs an offer, a contract price or an ARV'}
          . Buyer marketing shows this; the offer to the seller never reaches buyers.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Tag size={14} className="mr-2" aria-hidden />
        Set price
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buyer price</DialogTitle>
            <DialogDescription>
              Buyers pay the contract price plus your assignment fee. Leave a field blank to use
              the default.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {fields.map((f) => (
              <div key={f.id} className="space-y-1">
                <label className="text-caption font-medium text-foreground" htmlFor={f.id}>
                  {f.label}
                </label>
                <Input
                  id={f.id}
                  inputMode="numeric"
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  placeholder="—"
                />
                <p className="text-caption text-muted-foreground">{f.hint}</p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
