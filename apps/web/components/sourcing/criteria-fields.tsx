'use client';

import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABEL,
  ASSET_SUBTYPES,
  ASSET_SUBTYPE_LABEL,
  OPERATOR_ONLY_SUBTYPES,
  type AssetClass,
  type AssetSubtype,
} from '@/lib/assets';
import { OWNER_KINDS, type CommercialForm, type LandForm } from '@/lib/sourcing';

const CLASS_HINT: Record<AssetClass, string> = {
  residential: 'Houses, condos and small apartment buildings (up to four units).',
  land: 'Vacant lots, rural acreage, farm and recreational land. Found by county and parcel number; many parcels have no street address.',
  commercial: 'Apartment buildings of five or more units, retail, office, industrial, storage and mixed use.',
};

const toggle = (list: string[], value: string, on: boolean) =>
  on ? Array.from(new Set([...list, value])) : list.filter((v) => v !== value);

/** Which kinds of property a market looks for. At least one. */
export function AssetClassPicker({
  value,
  onChange,
}: {
  value: AssetClass[];
  onChange: (next: AssetClass[]) => void;
}) {
  return (
    <fieldset className="space-y-2 text-sm">
      <legend className="text-muted-foreground">What to look for</legend>
      <div className="grid gap-2 md:grid-cols-3">
        {ASSET_CLASSES.map((c) => (
          <label
            key={c}
            htmlFor={`mk-cls-${c}`}
            className="flex items-start gap-2 rounded-md border border-border p-3 has-[button[data-state=checked]]:border-primary/50"
          >
            <Checkbox
              id={`mk-cls-${c}`}
              className="mt-0.5"
              checked={value.includes(c)}
              onCheckedChange={(v) => onChange(toggle(value, c, v === true) as AssetClass[])}
            />
            <span>
              <span className="font-medium">{ASSET_CLASS_LABEL[c]}</span>
              <span className="block text-xs text-muted-foreground">{CLASS_HINT[c]}</span>
            </span>
          </label>
        ))}
      </div>
      {value.length === 0 && <p className="text-xs text-destructive">Choose at least one.</p>}
    </fieldset>
  );
}

function Num({
  label,
  value,
  onChange,
  placeholder,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input type="number" min={0} step={step} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Flag({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-sm">
      <Checkbox id={id} className="mt-0.5" checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <span>
        <span>{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * The subtypes the rules can assign. Infill, development and subdividable
 * are a person's judgement about one parcel, so a filter on them would
 * match nothing a search returns.
 */
function SubtypeChecks({
  cls,
  value,
  onChange,
}: {
  cls: 'land' | 'commercial';
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const options = (ASSET_SUBTYPES[cls] as readonly AssetSubtype[]).filter((s) => !OPERATOR_ONLY_SUBTYPES.includes(s));
  return (
    <fieldset className="col-span-2 space-y-2 text-sm">
      <legend className="text-muted-foreground">Kinds (leave empty for all)</legend>
      <div className="grid gap-1.5 sm:grid-cols-2 md:grid-cols-3">
        {options.map((s) => (
          <label key={s} htmlFor={`mk-${cls}-${s}`} className="flex items-center gap-2">
            <Checkbox id={`mk-${cls}-${s}`} checked={value.includes(s)} onCheckedChange={(v) => onChange(toggle(value, s, v === true))} />
            <span>{ASSET_SUBTYPE_LABEL[s]}</span>
          </label>
        ))}
      </div>
      {cls === 'land' && (
        <p className="text-xs text-muted-foreground">
          Infill lots, development parcels and subdividable land are judgements a person makes about one parcel, so they are not search filters. Use
          &ldquo;Only parcels with development indicators&rdquo; instead.
        </p>
      )}
    </fieldset>
  );
}

function Section({ title, hint, children }: { title: string; hint: ReactNode; children: ReactNode }) {
  return (
    <section className="col-span-2 space-y-3 rounded-md border border-border p-4">
      <div>
        <h4 className="font-medium">{title}</h4>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

const COUNTY_HINT = 'Separate with commas, for example: Travis, Hays, Bastrop.';
const MISSING_FACT =
  'A record that does not say (no acreage on file, say) does not pass a filter on it, so tight filters can set most of a pull aside.';

export function LandCriteriaFields({ value, onChange }: { value: LandForm; onChange: (next: LandForm) => void }) {
  const set = <K extends keyof LandForm>(k: K) => (v: LandForm[K]) => onChange({ ...value, [k]: v });
  return (
    <Section title="Land filters" hint={MISSING_FACT}>
      <label className="col-span-2 space-y-1 text-sm">
        <span className="text-muted-foreground">Counties</span>
        <Input value={value.counties} onChange={(e) => set('counties')(e.target.value)} placeholder="Travis, Hays" />
        <span className="block text-xs text-muted-foreground">{COUNTY_HINT} With counties, a city or ZIP is optional.</span>
      </label>
      <SubtypeChecks cls="land" value={value.subtypes} onChange={set('subtypes')} />
      <Num label="Minimum acres" value={value.minAcres} onChange={set('minAcres')} placeholder="5" step="0.1" />
      <Num label="Maximum acres" value={value.maxAcres} onChange={set('maxAcres')} placeholder="100" step="0.1" />
      <Num label="Minimum assessed value ($)" value={value.minAssessed} onChange={set('minAssessed')} />
      <Num label="Maximum assessed value ($)" value={value.maxAssessed} onChange={set('maxAssessed')} placeholder="250000" />
      <Num label="Owned at least (years)" value={value.minOwnershipYears} onChange={set('minOwnershipYears')} placeholder="10" />
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Land use contains</span>
        <Input value={value.landUse} onChange={(e) => set('landUse')(e.target.value)} placeholder="vacant, agricultural" />
        <span className="block text-xs text-muted-foreground">Words or county codes from the record, separated by commas.</span>
      </label>
      <div className="col-span-2 grid gap-2 sm:grid-cols-2">
        <Flag
          id="land-vacant"
          label="Vacant only"
          hint="Drops parcels with a building on record. A record that cannot tell is kept."
          checked={value.vacantOnly}
          onChange={set('vacantOnly')}
        />
        <Flag id="land-absentee" label="Absentee owners only" hint="The owner's mailing address is elsewhere." checked={value.absenteeOnly} onChange={set('absenteeOnly')} />
        <Flag id="land-tax" label="Tax delinquent only" checked={value.taxDelinquentOnly} onChange={set('taxDelinquentOnly')} />
        <Flag id="land-liens" label="Parcels with a lien only" checked={value.liensOnly} onChange={set('liensOnly')} />
        <Flag
          id="land-dev"
          label="Only parcels with development indicators"
          hint="Size and zoning that suggest it could be split or built on. Indicators, not findings."
          checked={value.developmentIndicators}
          onChange={set('developmentIndicators')}
        />
      </div>
    </Section>
  );
}

export function CommercialCriteriaFields({ value, onChange }: { value: CommercialForm; onChange: (next: CommercialForm) => void }) {
  const set = <K extends keyof CommercialForm>(k: K) => (v: CommercialForm[K]) => onChange({ ...value, [k]: v });
  return (
    <Section title="Commercial filters" hint={MISSING_FACT}>
      <label className="col-span-2 space-y-1 text-sm">
        <span className="text-muted-foreground">Counties</span>
        <Input value={value.counties} onChange={(e) => set('counties')(e.target.value)} placeholder="Harris, Fort Bend" />
        <span className="block text-xs text-muted-foreground">{COUNTY_HINT} With counties, a city or ZIP is optional.</span>
      </label>
      <SubtypeChecks cls="commercial" value={value.subtypes} onChange={set('subtypes')} />
      <Num label="Minimum building area (sq ft)" value={value.minBuildingSqft} onChange={set('minBuildingSqft')} placeholder="5000" />
      <Num label="Maximum building area (sq ft)" value={value.maxBuildingSqft} onChange={set('maxBuildingSqft')} />
      <Num label="Minimum lot (acres)" value={value.minLotAcres} onChange={set('minLotAcres')} step="0.1" />
      <Num label="Maximum lot (acres)" value={value.maxLotAcres} onChange={set('maxLotAcres')} step="0.1" />
      <Num label="Minimum units" value={value.minUnits} onChange={set('minUnits')} placeholder="5" />
      <Num label="Maximum units" value={value.maxUnits} onChange={set('maxUnits')} />
      <Num label="Built in or after (year)" value={value.minYearBuilt} onChange={set('minYearBuilt')} placeholder="1970" />
      <Num label="Built in or before (year)" value={value.maxYearBuilt} onChange={set('maxYearBuilt')} />
      <Num label="Minimum assessed value ($)" value={value.minAssessed} onChange={set('minAssessed')} />
      <Num label="Maximum assessed value ($)" value={value.maxAssessed} onChange={set('maxAssessed')} />
      <Num label="Owned at least (years)" value={value.minOwnershipYears} onChange={set('minOwnershipYears')} placeholder="10" />
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Sold on or after</span>
        <Input type="date" value={value.soldSince} onChange={(e) => set('soldSince')(e.target.value)} />
      </label>
      <fieldset className="col-span-2 space-y-1.5 text-sm">
        <legend className="text-muted-foreground">Owner type (leave empty for any)</legend>
        <div className="flex flex-wrap gap-4">
          {OWNER_KINDS.map((k) => (
            <label key={k.value} htmlFor={`com-owner-${k.value}`} className="flex items-center gap-2">
              <Checkbox
                id={`com-owner-${k.value}`}
                checked={value.ownerKinds.includes(k.value)}
                onCheckedChange={(v) => set('ownerKinds')(toggle(value.ownerKinds, k.value, v === true))}
              />
              <span>{k.label}</span>
            </label>
          ))}
        </div>
        <span className="block text-xs text-muted-foreground">Read from the owner&rsquo;s name on the county record (LLC, Trust, a person).</span>
      </fieldset>
      <div className="col-span-2">
        <Flag
          id="com-distress"
          label="Distress only"
          hint="Keeps records with tax delinquency, a lien or a foreclosure on file."
          checked={value.distressOnly}
          onChange={set('distressOnly')}
        />
      </div>
    </Section>
  );
}
