'use client';

import Link from 'next/link';
import { useApiQuery } from '@/lib/api-query';
import { Select } from '@/components/ui/select';

interface LibraryDoc {
  id: string;
  title: string;
  category: string;
  fileName: string;
  createdAt: string;
}

/**
 * Picks a document already in the library for this deal (or buyer). Halo's
 * records point at files it holds; a missing file is uploaded on the
 * Documents page first.
 */
export function DocumentSelect({
  id,
  dealId,
  buyerId,
  value,
  onChange,
  placeholder = 'Choose a document…',
}: {
  id?: string;
  dealId?: string;
  buyerId?: string;
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const docs = useApiQuery<LibraryDoc[]>('/documents', {
    params: dealId ? { dealId } : { buyerId },
  });
  const uploadHref = dealId ? `/documents?dealId=${dealId}` : buyerId ? `/documents?buyerId=${buyerId}` : '/documents';
  return (
    <div className="space-y-1">
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{docs.isPending ? 'Loading…' : placeholder}</option>
        {(docs.data ?? []).map((d) => (
          <option key={d.id} value={d.id}>
            {d.title} ({d.category.replace(/_/g, ' ')})
          </option>
        ))}
      </Select>
      <p className="text-caption text-muted-foreground">
        Not listed?{' '}
        <Link href={uploadHref} className="text-primary underline-offset-2 hover:underline">
          Upload it on the Documents page
        </Link>
        {buyerId ? ' with this buyer selected.' : dealId ? ' with this deal selected.' : '.'}
      </p>
    </div>
  );
}
