'use client';

import { useEffect, useState } from 'react';
import { Gavel, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from './agreement-panel';
import { DocumentSelect } from './document-select';
import { useDealAction } from './use-deal-action';
import { dateInput, day, toIsoDate, type GateCheck, type TaxSaleRecord } from '@/lib/disposition';

const INTEREST = [
  { value: 'unknown', label: 'Not yet determined' },
  { value: 'tax_deed', label: 'Tax deed (ownership)' },
  { value: 'tax_lien_certificate', label: 'Tax lien certificate' },
  { value: 'auction_bid', label: 'Auction bid, not yet conveyed' },
];

const TITLE = [
  { value: 'unverified', label: 'Not checked' },
  { value: 'clouded', label: 'Clouded' },
  { value: 'quiet_title_needed', label: 'Needs a quiet-title action' },
  { value: 'insurable', label: 'Insurable' },
];

const TRANSFERABLE = [
  { value: 'unknown', label: 'Not yet determined' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const GATE_VARIANT = { pass: 'success', review: 'warning', fail: 'destructive' } as const;

interface TaxSaleForm {
  interestType: string;
  county: string;
  auctionDate: string;
  advertisedPrice: string;
  winningBid: string;
  redemptionEndsAt: string;
  redeemed: string;
  titleStatus: string;
  transferable: string;
  evidenceDocumentId: string;
  notes: string;
}

function formFrom(r: TaxSaleRecord | null): TaxSaleForm {
  return {
    interestType: r?.interestType ?? 'unknown',
    county: r?.county ?? '',
    auctionDate: dateInput(r?.auctionDate),
    advertisedPrice: r?.advertisedPrice != null ? String(r.advertisedPrice) : '',
    winningBid: r?.winningBid != null ? String(r.winningBid) : '',
    redemptionEndsAt: dateInput(r?.redemptionEndsAt),
    redeemed: r?.redeemed ? 'yes' : 'no',
    titleStatus: r?.titleStatus ?? 'unverified',
    transferable: r?.transferable ?? 'unknown',
    evidenceDocumentId: r?.evidenceDocumentId ?? '',
    notes: r?.notes ?? '',
  };
}

function body(f: TaxSaleForm) {
  const num = (s: string) => (s.trim() ? Number(s) : null);
  return {
    interestType: f.interestType,
    county: f.county.trim() || null,
    auctionDate: toIsoDate(f.auctionDate) ?? null,
    advertisedPrice: num(f.advertisedPrice),
    winningBid: num(f.winningBid),
    redemptionEndsAt: toIsoDate(f.redemptionEndsAt) ?? null,
    redeemed: f.redeemed === 'yes',
    titleStatus: f.titleStatus,
    transferable: f.transferable,
    evidenceDocumentId: f.evidenceDocumentId || null,
    notes: f.notes.trim() || null,
  };
}

/**
 * A tax-sale acquisition (docs/contract-flipping.md s4). What was bought at
 * the sale decides whether there is anything to sell: a lien certificate or
 * an unconveyed bid is not ownership, and a deed is not marketable until
 * redemption is over and title is insurable. Nothing here is assumed; a
 * person records it from the deed and the county and title records, then
 * verifies it.
 */
export function TaxSalePanel({
  dealId,
  acquisitionType,
  record,
  check,
}: {
  dealId: string;
  acquisitionType: string | undefined;
  record: TaxSaleRecord | null;
  check: GateCheck | undefined;
}) {
  const isTaxSale = acquisitionType === 'tax_sale' || !!record;
  const [open, setOpen] = useState(isTaxSale);
  const [form, setForm] = useState<TaxSaleForm>(formFrom(record));
  useEffect(() => setForm(formFrom(record)), [record]);
  useEffect(() => {
    if (isTaxSale) setOpen(true);
  }, [isTaxSale]);
  const set = (k: keyof TaxSaleForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useDealAction(dealId, () => ({ path: `/deals/${dealId}/tax-sale`, method: 'PUT', body: body(form) }), {
    success: record?.verifiedAt ? 'Saved. A changed fact clears the verification.' : 'Tax-sale interest recorded',
    failure: 'Could not record the tax-sale interest',
  });
  const verify = useDealAction(dealId, () => ({ path: `/deals/${dealId}/tax-sale/verify`, body: {} }), {
    success: 'Tax-sale interest verified',
    failure: 'Could not verify',
  });

  if (!open) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4">
          <p className="text-body text-muted-foreground">
            Bought at a tax sale? Record what was acquired before this deal is marketed.
          </p>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Gavel size={14} className="mr-1" aria-hidden />
            This is a tax-sale deal
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gavel size={16} className="text-primary" aria-hidden />
            <CardTitle>Tax-sale interest</CardTitle>
            {record?.verifiedAt ? (
              <Badge variant="success">verified {day(record.verifiedAt)}</Badge>
            ) : (
              record && <Badge variant="warning">not verified</Badge>
            )}
          </div>
          {record && !record.verifiedAt && (
            <Button size="sm" loading={verify.isPending} onClick={() => verify.mutate()}>
              <ShieldCheck size={14} className="mr-1" aria-hidden />
              Verify against the deed and records
            </Button>
          )}
        </div>
        <CardDescription>
          Only a tax deed with the redemption period over, title a title company will insure and the deed on file can be verified.
          Changing a verified fact clears the verification.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {check && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-secondary/30 p-3">
            <Badge variant={GATE_VARIANT[check.status]}>{check.status}</Badge>
            <div className="space-y-0.5">
              <p className="text-body">{check.detail}</p>
              {check.fix && <p className="text-caption text-muted-foreground">{check.fix}</p>}
            </div>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="What was acquired" htmlFor="ts-interest">
            <Select id="ts-interest" value={form.interestType} onChange={set('interestType')}>
              {INTEREST.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="County" htmlFor="ts-county">
            <Input id="ts-county" value={form.county} onChange={set('county')} />
          </Field>
          <Field label="Auction date" htmlFor="ts-auction">
            <Input id="ts-auction" type="date" value={form.auctionDate} onChange={set('auctionDate')} />
          </Field>
          <Field label="Advertised minimum" htmlFor="ts-advertised">
            <Input id="ts-advertised" inputMode="decimal" value={form.advertisedPrice} onChange={set('advertisedPrice')} />
          </Field>
          <Field label="Winning bid" htmlFor="ts-bid">
            <Input id="ts-bid" inputMode="decimal" value={form.winningBid} onChange={set('winningBid')} />
          </Field>
          <Field label="Redemption period ends" htmlFor="ts-redemption">
            <Input id="ts-redemption" type="date" value={form.redemptionEndsAt} onChange={set('redemptionEndsAt')} />
          </Field>
          <Field label="Redeemed by the owner" htmlFor="ts-redeemed">
            <Select id="ts-redeemed" value={form.redeemed} onChange={set('redeemed')}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
          <Field label="Title" htmlFor="ts-title">
            <Select id="ts-title" value={form.titleStatus} onChange={set('titleStatus')}>
              {TITLE.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Transferable" htmlFor="ts-transferable">
            <Select id="ts-transferable" value={form.transferable} onChange={set('transferable')}>
              {TRANSFERABLE.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Deed or county record" htmlFor="ts-evidence">
          <DocumentSelect
            id="ts-evidence"
            dealId={dealId}
            value={form.evidenceDocumentId}
            onChange={(v) => setForm((f) => ({ ...f, evidenceDocumentId: v }))}
          />
        </Field>
        <Field label="Notes" htmlFor="ts-notes">
          <Textarea id="ts-notes" rows={2} value={form.notes} onChange={set('notes')} />
        </Field>
        <Button size="sm" variant="outline" loading={save.isPending} onClick={() => save.mutate()}>
          {record ? 'Save' : 'Record tax-sale interest'}
        </Button>
      </CardContent>
    </Card>
  );
}
