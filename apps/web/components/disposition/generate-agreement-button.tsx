'use client';

import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@/lib/api-query';
import { useDealAction } from './use-deal-action';

/**
 * Fill the reviewed template for this deal's state with the recorded terms.
 * The draft lands in the documents library on the deal; it is sent for
 * signature from the Contracts card like any other document.
 */
export function GenerateAgreementButton({
  dealId,
  kind,
  label,
}: {
  dealId: string;
  kind: 'purchase_agreement' | 'assignment';
  label: string;
}) {
  const qc = useQueryClient();
  const generate = useDealAction<void, { title: string; fields: string[] }>(
    dealId,
    () => ({ path: `/deals/${dealId}/agreements/generate`, body: { kind } }),
    {
      success: (out) => `${out.title} is in the deal's documents; review it, then send it for signature`,
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
