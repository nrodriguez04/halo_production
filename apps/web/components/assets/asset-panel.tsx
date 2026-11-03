'use client';

import { useState } from 'react';
import { CheckCircle2, CircleDashed, CircleDot, ExternalLink, Landmark, MapPinned, Waves } from 'lucide-react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { ErrorState, LoadingState } from '@/components/states';
import { Field } from '@/components/disposition/agreement-panel';
import { DocumentSelect } from '@/components/disposition/document-select';
import { AssetClassBadge } from '@/components/assets/asset-class-badge';
import { day, errorText } from '@/lib/disposition';
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABEL,
  ASSET_SUBTYPES,
  ASSET_SUBTYPE_LABEL,
  BASIS_TEXT,
  DILIGENCE_STAGES,
  DILIGENCE_STAGE_LABEL,
  FACT_STATUSES,
  FACT_STATUS_LABEL,
  FACT_STATUS_VARIANT,
  OPERATOR_ONLY_SUBTYPES,
  assetLabel,
  factValueText,
  isAssetClass,
  type AssetClass,
  type AssetFact,
  type AssetSubtype,
  type AssetView,
  type DiligenceStatusItem,
  type FactStatus,
} from '@/lib/assets';

/** The deal's property as the workspace returns it: what the asset view does not repeat. */
export interface AssetPanelProperty {
  id: string;
  state: string;
  county?: string | null;
}

function useAssetRefresh(propertyId: string, dealId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [`/properties/${propertyId}/asset`] });
    qc.invalidateQueries({ queryKey: [`/deals/${dealId}/asset-underwriting`] });
    qc.invalidateQueries({ queryKey: [`/deals/${dealId}/workspace`] });
    qc.invalidateQueries({ queryKey: ['/deals'] });
  };
}

/**
 * What the property is and what is known about it (docs/asset-classes.md
 * s2, s4, s8): its asset class and how that was decided, the facts its
 * class turns on with how each is known, the free federal flood and
 * wetlands maps, and the due-diligence checklist by stage.
 */
export function AssetPanel({ dealId, property }: { dealId: string; property: AssetPanelProperty }) {
  const view = useApiQuery<AssetView>(`/properties/${property.id}/asset`, { params: { dealId } });
  if (view.isPending) return <LoadingState label="Loading the property…" />;
  if (view.isError) {
    return <ErrorState title="Could not load the property" description={errorText(view.error)} onRetry={() => view.refetch()} />;
  }
  const v = view.data;
  return (
    <div className="space-y-4">
      <ClassificationCard dealId={dealId} property={property} view={v} />
      <FactsCard dealId={dealId} propertyId={property.id} view={v} />
      {v.diligence.length > 0 && <DiligenceCard items={v.diligence} />}
    </div>
  );
}

// ------------------------------------------------------- classification

function ClassificationCard({ dealId, property, view }: { dealId: string; property: AssetPanelProperty; view: AssetView }) {
  const refresh = useAssetRefresh(property.id, dealId);
  const [editing, setEditing] = useState(false);

  const setClass = useApiMutation<{ assetClass: AssetClass | null; subtype?: string | null; reason?: string | null }, unknown>(
    (body) => apiJson(`/properties/${property.id}/asset-class`, { method: 'PUT', body: JSON.stringify(body) }),
    {
      onSuccess: (_out, body) => {
        toast.success(body.assetClass ? `Recorded as ${assetLabel(body.assetClass, body.subtype)}` : 'Handed back to the rules');
        setEditing(false);
        refresh();
      },
      onError: (err) => toast.error('Could not save the asset class', { description: errorText(err) }),
    },
  );

  const s = view.suggestion;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Landmark size={16} className="text-primary" aria-hidden />
            <CardTitle>What this property is</CardTitle>
            <AssetClassBadge assetClass={view.assetClass} subtype={view.assetSubtype} showSubtype />
          </div>
          {view.assetClass && !editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Change
            </Button>
          )}
        </div>
        <CardDescription>
          {view.label}. The asset class decides how Halo values the deal, which facts matter and which contracts apply.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {view.assetClass ? (
          <div className="space-y-1 text-body">
            <p>
              <span className="text-muted-foreground">How it was decided: </span>
              {view.basis ? BASIS_TEXT[view.basis] : 'Not recorded'}
              {view.basis === 'rules' && view.confidence ? ` (${view.confidence} confidence)` : ''}
              {view.setAt ? `, ${day(view.setAt)}` : ''}.
            </p>
            {view.reasons.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-caption text-muted-foreground">
                {view.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <Alert variant="warning">
            <AlertTitle>Not classified yet</AlertTitle>
            <AlertDescription>
              <p>
                Halo could not tell from the record what kind of property this is
                {view.unresolved ? `: ${view.unresolved}` : '.'} Until a person confirms it, the deal is valued with the residential model, which
                does not fit land or commercial property.
              </p>
              {view.reasons.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-caption">
                  {view.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
              {s && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span>The record suggests {assetLabel(s.assetClass, s.subtype)}.</span>
                  <Button
                    size="sm"
                    loading={setClass.isPending}
                    onClick={() =>
                      setClass.mutate({ assetClass: s.assetClass, subtype: s.subtype, reason: 'Confirmed the suggestion on the deal page' })
                    }
                  >
                    Confirm: {assetLabel(s.assetClass, s.subtype)}
                  </Button>
                  {s.subtype && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={setClass.isPending}
                      onClick={() =>
                        setClass.mutate({ assetClass: s.assetClass, subtype: null, reason: 'Confirmed the suggested class on the deal page' })
                      }
                    >
                      Confirm {ASSET_CLASS_LABEL[s.assetClass]} only
                    </Button>
                  )}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {view.providerLabels.length > 0 && (
          <p className="text-caption text-muted-foreground">
            The data source{view.dataSource ? ` (${view.dataSource})` : ''} called it: {view.providerLabels.map((l) => `"${l}"`).join(', ')}.
          </p>
        )}

        {view.developmentIndicators.length > 0 && (
          <div className="text-caption">
            <p className="font-medium">Development indicators</p>
            <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
              {view.developmentIndicators.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <p className="text-muted-foreground">Signs the parcel could be split or built on. Only a planner or engineer can confirm them.</p>
          </div>
        )}

        {(!view.assetClass || editing) && (
          <ClassPicker
            initialClass={view.assetClass ?? s?.assetClass ?? null}
            initialSubtype={view.assetClass ? view.assetSubtype : (s?.subtype ?? null)}
            saving={setClass.isPending}
            onSave={(body) => setClass.mutate(body)}
            onCancel={view.assetClass ? () => setEditing(false) : undefined}
            onClear={view.basis === 'operator' ? () => setClass.mutate({ assetClass: null }) : undefined}
          />
        )}

        <UseCodeMapping dealId={dealId} property={property} view={view} />
      </CardContent>
    </Card>
  );
}

function SubtypeSelect({
  id,
  cls,
  value,
  onChange,
  excludeOperatorOnly,
}: {
  id: string;
  cls: AssetClass | null;
  value: string;
  onChange: (v: string) => void;
  excludeOperatorOnly?: boolean;
}) {
  const options = cls
    ? (ASSET_SUBTYPES[cls] as readonly AssetSubtype[]).filter((st) => !excludeOperatorOnly || !OPERATOR_ONLY_SUBTYPES.includes(st))
    : [];
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={!cls}>
      <option value="">Not sure</option>
      {options.map((st) => (
        <option key={st} value={st}>
          {ASSET_SUBTYPE_LABEL[st]}
        </option>
      ))}
    </Select>
  );
}

/** A person settles the class. It stands over the rules and is audited. */
function ClassPicker({
  initialClass,
  initialSubtype,
  saving,
  onSave,
  onCancel,
  onClear,
}: {
  initialClass: AssetClass | null;
  initialSubtype: string | null;
  saving: boolean;
  onSave: (body: { assetClass: AssetClass; subtype: string | null; reason: string | null }) => void;
  onCancel?: () => void;
  onClear?: () => void;
}) {
  const [cls, setCls] = useState<AssetClass | ''>(initialClass ?? '');
  const [subtype, setSubtype] = useState(initialSubtype ?? '');
  const [reason, setReason] = useState('');
  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <p className="text-caption uppercase tracking-wider text-muted-foreground">{onCancel ? 'Change the asset class' : 'Or choose it yourself'}</p>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Asset class" htmlFor="ap-class">
          <Select
            id="ap-class"
            value={cls}
            onChange={(e) => {
              setCls(e.target.value as AssetClass | '');
              setSubtype('');
            }}
          >
            <option value="">Choose…</option>
            {ASSET_CLASSES.map((c) => (
              <option key={c} value={c}>
                {ASSET_CLASS_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Kind (optional)" htmlFor="ap-subtype">
          <SubtypeSelect id="ap-subtype" cls={cls || null} value={subtype} onChange={setSubtype} />
        </Field>
        <Field label="Why (optional, recorded)" htmlFor="ap-reason">
          <Input id="ap-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Drove by: vacant lot" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!cls}
          loading={saving}
          onClick={() => cls && onSave({ assetClass: cls, subtype: subtype || null, reason: reason.trim() || null })}
        >
          Save
        </Button>
        {onCancel && (
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {onClear && (
          <Button size="sm" variant="ghost" disabled={saving} onClick={onClear} title="Remove the person's choice and let the rules classify it again">
            Let the rules decide again
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * County use codes are numbers that differ by county, so Halo cannot read
 * them alone. Saying once what a code means classifies every record with
 * it that a person has not classified by hand.
 */
function UseCodeMapping({ dealId, property, view }: { dealId: string; property: AssetPanelProperty; view: AssetView }) {
  const refresh = useAssetRefresh(property.id, dealId);
  const qc = useQueryClient();
  const [cls, setCls] = useState<AssetClass | ''>(view.assetClass ?? view.suggestion?.assetClass ?? '');
  const [subtype, setSubtype] = useState(() => {
    const st = view.assetClass ? view.assetSubtype : view.suggestion?.subtype;
    return st && !OPERATOR_ONLY_SUBTYPES.includes(st as AssetSubtype) ? st : '';
  });
  const apply = useApiMutation<void, { applied: number }>(
    () =>
      apiJson('/asset-code-mappings', {
        method: 'POST',
        body: JSON.stringify({
          state: property.state,
          county: property.county ?? null,
          provider: view.dataSource ?? null,
          code: view.useCode,
          assetClass: cls,
          subtype: subtype || null,
        }),
      }),
    {
      onSuccess: (out) => {
        toast.success(`Use code "${view.useCode}" saved`, {
          description: `Applied to ${out.applied} propert${out.applied === 1 ? 'y' : 'ies'} with that code.`,
        });
        qc.invalidateQueries({ queryKey: ['/asset-code-mappings'] });
        qc.invalidateQueries({ queryKey: ['/leads'] });
        qc.invalidateQueries({ queryKey: ['/properties/search'] });
        refresh();
      },
      onError: (err) => toast.error('Could not save the use code', { description: errorText(err) }),
    },
  );

  if (!view.useCode) return null;
  const county = property.county?.trim();
  const where = county ? (/\b(county|parish|borough)$/i.test(county) ? county : `${county} County`) : property.state;
  if (view.codeMapping) {
    return (
      <p className="text-caption text-muted-foreground">
        County use code &ldquo;{view.useCode}&rdquo; is confirmed as {assetLabel(view.codeMapping.assetClass, view.codeMapping.subtype)}
        {view.codeMapping.county ? ' in this county' : ` across ${property.state}`}.
      </p>
    );
  }
  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div>
        <p className="font-medium">County use code &ldquo;{view.useCode}&rdquo;</p>
        <p className="text-caption text-muted-foreground">
          Use codes are numbers that mean different things in different counties, so Halo does not guess at them. If every &ldquo;
          {view.useCode}&rdquo; in {where} is the same kind of property, say so once: Halo classifies every record with that code
          {view.dataSource ? ` from ${view.dataSource}` : ''} that a person has not classified by hand, now and in future pulls.
          {!property.county && ' This record has no county, so it applies across the whole state.'}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-44">
          <Field label="Means" htmlFor="ap-map-class">
            <Select
              id="ap-map-class"
              value={cls}
              onChange={(e) => {
                setCls(e.target.value as AssetClass | '');
                setSubtype('');
              }}
            >
              <option value="">Choose…</option>
              {ASSET_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {ASSET_CLASS_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-56">
          <Field label="Kind (optional)" htmlFor="ap-map-subtype">
            <SubtypeSelect id="ap-map-subtype" cls={cls || null} value={subtype} onChange={setSubtype} excludeOperatorOnly />
          </Field>
        </div>
        <Button size="sm" variant="outline" disabled={!isAssetClass(cls)} loading={apply.isPending} onClick={() => apply.mutate()}>
          Apply this to every {view.useCode} in {where}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- facts

function FactsCard({ dealId, propertyId, view }: { dealId: string; propertyId: string; view: AssetView }) {
  const refresh = useAssetRefresh(propertyId, dealId);
  const [recording, setRecording] = useState<string | null>(null);

  const publicRecords = useApiMutation<void, { flood: string | null; wetlands: string[]; errors: string[] }>(
    () => apiJson(`/properties/${propertyId}/public-records`, { method: 'POST' }),
    {
      onSuccess: (out) => {
        const found = [
          out.flood ? `Flood zone ${out.flood}` : 'No flood zone on the FEMA map here',
          out.wetlands.length ? `${out.wetlands.length} mapped wetland feature${out.wetlands.length === 1 ? '' : 's'}` : 'no mapped wetlands',
        ].join('; ');
        if (out.errors.length) toast.warning('Some maps did not answer', { description: out.errors.join(' ') });
        else toast.success('Flood and wetlands maps checked', { description: found });
        refresh();
      },
      onError: (err) => toast.error('Could not check the maps', { description: errorText(err) }),
    },
  );

  if (view.facts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Property facts</CardTitle>
          <CardDescription>
            {view.assetClass === 'residential'
              ? 'Houses are valued from the after-repair value and repairs on the Overview tab; there is no land or commercial checklist for them.'
              : 'Confirm what kind of property this is to see the facts and the due-diligence checklist that go with it.'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Property facts</CardTitle>
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={!view.canCheckPublicRecords}
              loading={publicRecords.isPending}
              onClick={() => publicRecords.mutate()}
            >
              <Waves size={14} className="mr-1" aria-hidden />
              Check flood and wetlands maps
            </Button>
            {!view.canCheckPublicRecords && (
              <span className="text-caption text-muted-foreground">
                <MapPinned size={12} className="mr-1 inline" aria-hidden />
                Needs the property&rsquo;s map coordinates, and this record has none yet.
              </span>
            )}
          </div>
        </div>
        <CardDescription>
          Every fact says how it is known. A missing fact is never good news: Halo treats an unknown as a risk. The flood and wetlands check reads
          the free federal maps (FEMA and the US Fish and Wildlife Service) at the parcel&rsquo;s coordinates; a map is an indicator, not a survey.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {view.criticalUnknowns.length > 0 && (
          <Alert variant="warning">
            <AlertTitle>Still unknown and needed for a decision</AlertTitle>
            <AlertDescription>{view.criticalUnknowns.join(', ')}.</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          {view.facts.map((f) => (
            <FactRow
              key={f.key}
              fact={f}
              dealId={dealId}
              propertyId={propertyId}
              open={recording === f.key}
              onOpen={() => setRecording(recording === f.key ? null : f.key)}
              onSaved={() => {
                setRecording(null);
                refresh();
              }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function FactRow({
  fact,
  dealId,
  propertyId,
  open,
  onOpen,
  onSaved,
}: {
  fact: AssetFact;
  dealId: string;
  propertyId: string;
  open: boolean;
  onOpen: () => void;
  onSaved: () => void;
}) {
  const value = factValueText(fact);
  return (
    <div className="space-y-1.5 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {fact.label}
          {fact.critical && <Badge variant="outline">needed for the decision</Badge>}
        </p>
        <Badge variant={FACT_STATUS_VARIANT[fact.status]}>{FACT_STATUS_LABEL[fact.status]}</Badge>
      </div>
      <p className={value ? 'text-body text-foreground' : 'text-body text-muted-foreground'}>{value ?? 'Nothing on file'}</p>
      {(fact.source || fact.observedAt) && (
        <p className="text-caption text-muted-foreground">
          Source:{' '}
          {fact.sourceUrl ? (
            <a href={fact.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
              {fact.source ?? 'link'}
              <ExternalLink size={11} aria-hidden />
            </a>
          ) : (
            (fact.source ?? 'not recorded')
          )}
          {fact.observedAt ? ` · ${day(fact.observedAt)}` : ''}
        </p>
      )}
      {fact.note && <p className="text-caption text-muted-foreground">{fact.note}</p>}
      <p className="text-caption text-muted-foreground">{fact.help}</p>
      <Button size="sm" variant="ghost" className="-ml-2" onClick={onOpen} aria-expanded={open}>
        {open ? 'Close' : 'Record'}
      </Button>
      {open && <FactForm fact={fact} dealId={dealId} propertyId={propertyId} onSaved={onSaved} />}
    </div>
  );
}

function initialValue(f: AssetFact): string {
  if (f.value == null) return '';
  if (typeof f.value === 'boolean') return f.value ? 'true' : 'false';
  return String(f.value);
}

/** A person records a fact: the value, how it is known, and where it came from. */
function FactForm({ fact, dealId, propertyId, onSaved }: { fact: AssetFact; dealId: string; propertyId: string; onSaved: () => void }) {
  const [value, setValue] = useState(initialValue(fact));
  const [status, setStatus] = useState<FactStatus>(fact.status === 'unknown' || fact.status === 'needs_diligence' ? 'reported' : fact.status);
  const [source, setSource] = useState(fact.source && fact.source !== 'operator' ? fact.source : '');
  const [sourceUrl, setSourceUrl] = useState(fact.sourceUrl ?? '');
  const [documentId, setDocumentId] = useState(fact.documentId ?? '');
  const [note, setNote] = useState('');

  const parsed: number | boolean | string | null =
    value.trim() === ''
      ? null
      : fact.type === 'number'
        ? Number(value)
        : fact.type === 'boolean'
          ? value === 'true'
          : value.trim();
  const problems: string[] = [];
  if (fact.type === 'number' && typeof parsed === 'number' && !Number.isFinite(parsed)) problems.push('Enter a number.');
  if (parsed == null && !documentId && status !== 'unknown' && status !== 'needs_diligence') {
    problems.push('Give a value or a document, or mark it unknown.');
  }
  if (status === 'verified' && !documentId && !source.trim()) problems.push('A verified fact needs its source or a document.');
  if (sourceUrl.trim() && !/^https?:\/\/\S+$/i.test(sourceUrl.trim())) problems.push('The link must start with http:// or https://.');

  const save = useApiMutation<void, unknown>(
    () =>
      apiJson(`/properties/${propertyId}/facts`, {
        method: 'POST',
        body: JSON.stringify({
          key: fact.key,
          value: parsed,
          status,
          ...(source.trim() ? { source: source.trim() } : {}),
          ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
          ...(documentId ? { documentId } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      }),
    {
      onSuccess: () => {
        toast.success(`${fact.label} recorded`);
        onSaved();
      },
      onError: (err) => toast.error(`Could not record ${fact.label.toLowerCase()}`, { description: errorText(err) }),
    },
  );

  const id = `fact-${fact.key}`;
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={fact.unit ? `Value (${fact.unit})` : 'Value'} htmlFor={`${id}-value`}>
          {fact.type === 'boolean' ? (
            <Select id={`${id}-value`} value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="">Not known</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </Select>
          ) : (
            <Input
              id={`${id}-value`}
              type={fact.type === 'number' ? 'number' : 'text'}
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={fact.type === 'document' ? 'A short summary (optional)' : fact.unit === '%' ? 'For 6.5%, enter 6.5' : ''}
            />
          )}
        </Field>
        <Field label="How it is known" htmlFor={`${id}-status`}>
          <Select id={`${id}-status`} value={status} onChange={(e) => setStatus(e.target.value as FactStatus)}>
            {FACT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {FACT_STATUS_LABEL[st]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Source" htmlFor={`${id}-source`}>
          <Input
            id={`${id}-source`}
            value={source}
            maxLength={200}
            onChange={(e) => setSource(e.target.value)}
            placeholder="County appraisal district, the seller, a survey…"
          />
        </Field>
        <Field label="Link to the source (optional)" htmlFor={`${id}-url`}>
          <Input id={`${id}-url`} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Document on this deal (optional)" htmlFor={`${id}-doc`}>
            <DocumentSelect id={`${id}-doc`} dealId={dealId} value={documentId} onChange={setDocumentId} placeholder="No document" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Note (optional)" htmlFor={`${id}-note`}>
            <Input id={`${id}-note`} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </div>
      {fact.settledBy === 'professional' && (
        <p className="text-caption text-muted-foreground">
          Only a professional&rsquo;s report settles this one. Until a report is on file it stays &ldquo;needs professional due diligence&rdquo;
          unless you mark it verified with its source.
        </p>
      )}
      {problems.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-caption text-destructive">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <Button size="sm" disabled={problems.length > 0} loading={save.isPending} onClick={() => save.mutate()}>
        Record {fact.label.toLowerCase()}
      </Button>
    </div>
  );
}

// ------------------------------------------------------------ diligence

const DILIGENCE_BADGE: Record<DiligenceStatusItem['status'], { label: string; variant: 'success' | 'info' | 'outline' }> = {
  done: { label: 'Done', variant: 'success' },
  reported: { label: 'On file, not verified', variant: 'info' },
  open: { label: 'Open', variant: 'outline' },
};

function DiligenceCard({ items }: { items: DiligenceStatusItem[] }) {
  const done = items.filter((i) => i.status === 'done').length;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Due-diligence checklist</CardTitle>
          <Badge variant="outline">
            {done} of {items.length} done
          </Badge>
        </div>
        <CardDescription>
          What a careful buyer checks before each step. An item is done when its fact is verified, or when a document on this deal carries the
          tag <code>diligence:</code> followed by the item&rsquo;s name (for example <code>diligence:title</code>). Halo never marks an item done on
          its own.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {DILIGENCE_STAGES.map((stage) => {
          const list = items.filter((i) => i.stage === stage);
          if (!list.length) return null;
          return (
            <div key={stage} className="space-y-2">
              <p className="text-caption uppercase tracking-wider text-muted-foreground">{DILIGENCE_STAGE_LABEL[stage]}</p>
              <ul className="space-y-2">
                {list.map((i) => {
                  const b = DILIGENCE_BADGE[i.status];
                  const Icon = i.status === 'done' ? CheckCircle2 : i.status === 'reported' ? CircleDot : CircleDashed;
                  return (
                    <li key={i.key} className="flex gap-2 rounded-md border border-border p-2.5">
                      <Icon
                        size={16}
                        aria-hidden
                        className={
                          i.status === 'done' ? 'mt-0.5 shrink-0 text-emerald-400' : i.status === 'reported' ? 'mt-0.5 shrink-0 text-blue-400' : 'mt-0.5 shrink-0 text-muted-foreground'
                        }
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{i.label}</span>
                          <Badge variant={b.variant}>{b.label}</Badge>
                        </div>
                        <p className="text-caption text-muted-foreground">
                          {i.detail} {i.help}
                          {i.document ? ` Document tag: diligence:${i.key}.` : ''}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
