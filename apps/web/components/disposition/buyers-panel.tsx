'use client';

import Link from 'next/link';
import { Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/states';
import { cn } from '@/lib/utils';
import { EVIDENCE_LABEL, EVIDENCE_VARIANT, money, type BuyerMatch } from '@/lib/disposition';

/**
 * The ranked buyers for this deal, each with the evidence behind the score.
 * Evidence kinds are labelled apart: a stated buy box is not a purchase, an
 * inferred capacity is not proof of funds, and neither is an offer.
 */
export function BuyersPanel({ matches, considered }: { matches: BuyerMatch[]; considered: number }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users size={16} className="text-primary" aria-hidden />
          <CardTitle>Best-fit buyers</CardTitle>
        </div>
        <CardDescription>
          Top {matches.length} of {considered}, ranked at the buyer price. Scores are deterministic; hover a score for
          its parts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {matches.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No buyers to rank"
            description="Add cash buyers (or import an authorized list) on the Buyers page."
          />
        ) : (
          <ol className="space-y-2">
            {matches.map((m, i) => (
              <li
                key={m.buyerId}
                className={cn(
                  'rounded-md border px-3 py-2',
                  m.contactable ? 'border-border bg-secondary/30' : 'border-border/60 bg-transparent opacity-70',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="w-5 text-caption text-muted-foreground">{i + 1}.</span>
                    <Link href={`/buyers/${m.buyerId}`} className="truncate text-body font-medium text-foreground hover:underline">
                      {m.name}
                    </Link>
                    {!m.contactable && <Badge variant="destructive">cannot be offered</Badge>}
                    {m.channels.map((c) => (
                      <Badge key={c} variant="outline">
                        {c}
                      </Badge>
                    ))}
                  </div>
                  <span
                    className="font-mono text-body font-semibold text-foreground"
                    title={Object.entries(m.components)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' · ')}
                  >
                    {m.score}
                  </span>
                </div>
                <p className="mt-1 text-caption text-muted-foreground">{m.explanation}</p>
                {m.evidence.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.evidence.map((e, j) => (
                      <Badge key={j} variant={EVIDENCE_VARIANT[e.kind]} title={e.text}>
                        {EVIDENCE_LABEL[e.kind]}
                      </Badge>
                    ))}
                    {m.historicalRange && (
                      <Badge variant="outline">
                        bought {money(m.historicalRange.min)}–{money(m.historicalRange.max)}
                      </Badge>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
