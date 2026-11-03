'use client';

import { RefreshCw, Scale } from 'lucide-react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { ErrorState, LoadingState } from '@/components/states';
import { errorText } from '@/lib/disposition';
import {
  ASSET_CLASS_LABEL,
  ASSET_DECISION_LABEL,
  ASSET_DECISION_VARIANT,
  DEMAND_LABEL,
  EVIDENCE_KIND_LABEL,
  STRATEGY_LABEL,
  percent,
  rangeText,
  usd,
  type DealUnderwriting,
  type SensitivityCell,
} from '@/lib/assets';

const UNIT_TEXT = { acre: 'per acre', 'sq ft': 'per sq ft', unit: 'per unit' } as const;
const CONFIDENCE_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-caption uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-mono text-body font-semibold text-foreground">{value}</p>
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Bullets({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="space-y-1">
      <p className="text-caption uppercase tracking-wider text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-caption text-muted-foreground">{empty}</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-5 text-caption">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Value across cap rates (rows) and NOI coming in as stated or lower (columns). */
function SensitivityGrid({ cells }: { cells: SensitivityCell[] }) {
  const rates = Array.from(new Set(cells.map((c) => c.capRate))).sort((a, b) => a - b);
  const changes = Array.from(new Set(cells.map((c) => c.noiChange))).sort((a, b) => b - a);
  const at = (r: number, n: number) => cells.find((c) => c.capRate === r && c.noiChange === n);
  return (
    <div className="space-y-1">
      <p className="text-caption uppercase tracking-wider text-muted-foreground">If the numbers move</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cap rate</TableHead>
            {changes.map((n) => (
              <TableHead key={n} className="text-right">
                {n === 0 ? 'Income as stated' : `Income ${percent(Math.abs(n), 0)} lower`}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rates.map((r) => (
            <TableRow key={r}>
              <TableCell className="font-mono">{percent(r, 2)}</TableCell>
              {changes.map((n) => {
                const c = at(r, n);
                return (
                  <TableCell key={n} className="text-right font-mono">
                    {c ? usd(c.value) : '—'}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-caption text-muted-foreground">
        The cap rate is the yearly return buyers expect. A higher cap rate, or less net income than the seller reports, means a lower value.
      </p>
    </div>
  );
}

/**
 * Asset-specific underwriting (docs/asset-classes.md s5): the decision and
 * why, in order, for an owner who is not a real estate expert; the value
 * as a range with the approaches and evidence behind it; what is missing,
 * the risks and the assumptions. Every figure is arithmetic on the record.
 */
export function AssetUnderwritingPanel({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const path = `/deals/${dealId}/asset-underwriting`;
  const uw = useApiQuery<DealUnderwriting>(path, { retry: false });
  const recalc = useApiMutation<void, DealUnderwriting>(() => apiJson<DealUnderwriting>(path, { method: 'POST' }), {
    onSuccess: (out) => {
      qc.setQueryData([path, null], out);
      qc.invalidateQueries({ queryKey: [`/deals/${dealId}/workspace`] });
      toast.success('Underwriting recalculated and recorded on the deal');
    },
    onError: (err) => toast.error('Could not recalculate', { description: errorText(err) }),
  });

  if (uw.isPending) return <LoadingState label="Underwriting…" />;
  if (uw.isError) {
    return <ErrorState title="Could not load the underwriting" description={errorText(uw.error)} onRetry={() => uw.refetch()} />;
  }
  const u = uw.data;
  const classLabel = ASSET_CLASS_LABEL[u.assetClass]?.toLowerCase() ?? 'this';

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Scale size={16} className="text-primary" aria-hidden />
            <CardTitle>Should we pursue it?</CardTitle>
            <Badge variant={ASSET_DECISION_VARIANT[u.decision]} className="px-3 py-1 text-sm">
              {ASSET_DECISION_LABEL[u.decision]}
            </Badge>
            <Badge variant="outline">{STRATEGY_LABEL[u.strategy] ?? u.strategy}</Badge>
          </div>
          <Button size="sm" variant="outline" loading={recalc.isPending} onClick={() => recalc.mutate()}>
            <RefreshCw size={14} className="mr-1" aria-hidden />
            Recalculate
          </Button>
        </div>
        <CardDescription className="text-foreground">{u.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {u.unclassified && (
          <Alert variant="warning">
            <AlertTitle>The asset class is not confirmed</AlertTitle>
            <AlertDescription>
              Halo is using the residential model until a person confirms what this property is. If it is land or commercial property, these
              numbers do not apply: confirm the class on the Property tab and recalculate.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Figure label="Value range" value={rangeText(u.valuation) ?? 'Not supported yet'} hint={u.valuation ? undefined : 'Not enough evidence for a range.'} />
          <Figure label="Offer to the seller" value={rangeText(u.offerRange) ?? 'No supportable price'} />
          <Figure label="Target fee" value={usd(u.targetFee)} />
          <Figure label="Confidence" value={CONFIDENCE_LABEL[u.confidence.level] ?? u.confidence.level} hint="From the evidence on file, not a model's opinion." />
          <Figure label="Buyer demand" value={DEMAND_LABEL[u.buyerDemand.level]} hint={u.buyerDemand.detail} />
        </div>

        {u.explanation.length > 0 && (
          <div className="space-y-1">
            <p className="text-caption uppercase tracking-wider text-muted-foreground">Why</p>
            <ol className="list-decimal space-y-1 pl-5 text-body">
              {u.explanation.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ol>
          </div>
        )}

        {u.approaches.length > 0 && (
          <div className="space-y-1">
            <p className="text-caption uppercase tracking-wider text-muted-foreground">How the value was worked out</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Approach</TableHead>
                  <TableHead className="text-right">Range</TableHead>
                  <TableHead className="text-right">Per unit</TableHead>
                  <TableHead className="text-right">Based on</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {u.approaches.map((a) => (
                  <TableRow key={a.key}>
                    <TableCell className="font-medium">{a.label}</TableCell>
                    <TableCell className="text-right font-mono">{rangeText(a.range) ?? 'Not applied'}</TableCell>
                    <TableCell className="text-right font-mono">
                      {a.unitValue && a.unit ? `${rangeText(a.unitValue)} ${UNIT_TEXT[a.unit]}` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.evidenceCount} record{a.evidenceCount === 1 ? '' : 's'}
                    </TableCell>
                    <TableCell className="text-caption text-muted-foreground">{a.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {u.sensitivity && u.sensitivity.length > 0 && <SensitivityGrid cells={u.sensitivity} />}

        <div className="grid gap-4 md:grid-cols-3">
          <Bullets title="Missing information" items={u.missing} empty="Nothing the decision needs is missing." />
          <Bullets title="Risks" items={u.risks} empty="No specific risk recorded." />
          <Bullets title="Assumptions" items={u.assumptions} empty="No assumptions were needed." />
        </div>

        {u.evidence.length > 0 && (
          <div className="space-y-1">
            <p className="text-caption uppercase tracking-wider text-muted-foreground">Evidence</p>
            <ul className="space-y-1">
              {u.evidence.map((e, i) => (
                <li key={`${e.kind}-${i}`} className="flex flex-wrap items-start gap-2 text-caption">
                  <Badge variant="outline">{EVIDENCE_KIND_LABEL[e.kind] ?? e.kind}</Badge>
                  <span className="min-w-0 flex-1">{e.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-caption text-muted-foreground">
          Calculated {new Date(u.computedAt).toLocaleString()} for {classLabel} property. Values are rounded to what the evidence supports.
          Setting an offer to the seller above Halo&rsquo;s limit asks you for a reason, which is recorded with the offer.
        </p>
      </CardContent>
    </Card>
  );
}
