'use client';

import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@/lib/api-query';
import { useDealAction } from './use-deal-action';

/**
 * Fill the counsel-approved template for this deal's state with the
 * recorded terms. The draft (and its PDF, when one can be made) lands in
 * the documents library on the deal; it is sent for signature from the
 * Contracts card like any other document.
 */
export function GenerateAgreementButton({
  dealId,
  kind,
  label,
}: {
  dealId: string;
  kind: 'purchase_agreement' | 'assignment_agreement' | 'seller_disclosure' | 'buyer_disclosure' | 'cancellation_notice';
  label: string;
}) {
  const qc = useQueryClient();
  const generate = useDealAction<void, { title: string; fields: string[]; pdfNote: string | null }>(
    dealId,
    () => ({ path: `/deals/${dealId}/documents/generate`, body: { kind } }),
    {
      success: (out) =>
        `${out.title} is in the deal's documents; review it, then send it for signature${out.pdfNote ? `. ${out.pdfNote}` : ''}`,
      failure: 'Could not generate the agreement',
    },
    () => qc.invalidateQueries({ queryKey: ['/documents'] }),
  );
  return (
    <Button size="sm" variant="outline" loading={generate.isPending} onClick={() => generate.mutate()}>
      <FileText size={14} className="mr-1" aria-hidden />
      {label}
    </Button>
  );
}
