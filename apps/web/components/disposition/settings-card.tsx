'use client';

import { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/toast';
import { Field } from './agreement-panel';
import { errorText } from '@/lib/disposition';

interface DispositionSettings {
  defaultAssignmentFee: number;
  minNetProfit: number;
  dispositionCosts: number;
  minUnderwritingConfidence: number;
  requireVerifiedPof: boolean;
  revenueRecognition: 'on_funds_received' | 'on_closing_confirmed';
  campaignFollowUpDays: number;
  campaignMaxFollowUps: number;
}

/**
 * The numbers the pricing engine and the acceptance checks run on
 * (docs/contract-flipping.md s10). Changing them needs control-plane write.
 */
export function DispositionSettingsCard() {
  const cp = useApiQuery<DispositionSettings>('/control-plane');
  const qc = useQueryClient();
  const [f, setF] = useState({
    defaultAssignmentFee: '',
    minNetProfit: '',
    dispositionCosts: '',
    minUnderwritingConfidence: '',
    requireVerifiedPof: true,
    revenueRecognition: 'on_funds_received',
    campaignFollowUpDays: '',
    campaignMaxFollowUps: '',
  });
  useEffect(() => {
    if (!cp.data) return;
    setF({
      defaultAssignmentFee: String(cp.data.defaultAssignmentFee),
      minNetProfit: String(cp.data.minNetProfit),
      dispositionCosts: String(cp.data.dispositionCosts),
      minUnderwritingConfidence: String(Math.round(cp.data.minUnderwritingConfidence * 100)),
      requireVerifiedPof: cp.data.requireVerifiedPof,
      revenueRecognition: cp.data.revenueRecognition,
      campaignFollowUpDays: String(cp.data.campaignFollowUpDays),
      campaignMaxFollowUps: String(cp.data.campaignMaxFollowUps),
    });
  }, [cp.data]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useApiMutation(
    () =>
      apiJson('/control-plane', {
        method: 'PUT',
        body: JSON.stringify({
          defaultAssignmentFee: Math.round(Number(f.defaultAssignmentFee)),
          minNetProfit: Math.round(Number(f.minNetProfit)),
          dispositionCosts: Math.round(Number(f.dispositionCosts)),
          minUnderwritingConfidence: Number(f.minUnderwritingConfidence) / 100,
          requireVerifiedPof: f.requireVerifiedPof,
          revenueRecognition: f.revenueRecognition,
          campaignFollowUpDays: Math.round(Number(f.campaignFollowUpDays)),
          campaignMaxFollowUps: Math.round(Number(f.campaignMaxFollowUps)),
        }),
      }),
    {
      onSuccess: () => {
        toast.success('Disposition settings saved');
        qc.invalidateQueries({ queryKey: ['/control-plane'] });
      },
      onError: (err) => toast.error('Could not save', { description: errorText(err) }),
    },
  );
  if (cp.isError) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Settings2 size={16} className="text-primary" aria-hidden />
          <CardTitle>Disposition settings</CardTitle>
        </div>
        <CardDescription>What pricing, acceptance and revenue reporting run on.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Target fee ($)" htmlFor="s-fee">
            <Input id="s-fee" inputMode="numeric" value={f.defaultAssignmentFee} onChange={set('defaultAssignmentFee')} />
          </Field>
          <Field label="Minimum net profit ($)" htmlFor="s-min">
            <Input id="s-min" inputMode="numeric" value={f.minNetProfit} onChange={set('minNetProfit')} />
          </Field>
          <Field label="Typical costs per deal ($)" htmlFor="s-costs">
            <Input id="s-costs" inputMode="numeric" value={f.dispositionCosts} onChange={set('dispositionCosts')} />
          </Field>
          <Field label="ARV confirmed above (%)" htmlFor="s-conf">
            <Input id="s-conf" inputMode="numeric" value={f.minUnderwritingConfidence} onChange={set('minUnderwritingConfidence')} />
          </Field>
          <Field label="Revenue counts when" htmlFor="s-rev">
            <Select id="s-rev" value={f.revenueRecognition} onChange={set('revenueRecognition')}>
              <option value="on_funds_received">The fee is received</option>
              <option value="on_closing_confirmed">The closing is confirmed</option>
            </Select>
          </Field>
          <Field label="Follow up after (days)" htmlFor="s-fu">
            <Input id="s-fu" inputMode="numeric" value={f.campaignFollowUpDays} onChange={set('campaignFollowUpDays')} />
          </Field>
          <Field label="At most follow-ups" htmlFor="s-fumax">
            <Input id="s-fumax" inputMode="numeric" value={f.campaignMaxFollowUps} onChange={set('campaignMaxFollowUps')} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-body text-foreground">
          <Checkbox
            checked={f.requireVerifiedPof}
            onCheckedChange={(v) => setF((x) => ({ ...x, requireVerifiedPof: v === true }))}
          />
          Require verified proof of funds before an offer can be accepted
        </label>
        <Button size="sm" loading={save.isPending} disabled={cp.isPending} onClick={() => save.mutate(undefined)}>
          Save settings
        </Button>
      </CardContent>
    </Card>
  );
}
