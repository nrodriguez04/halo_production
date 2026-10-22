'use client';

import { useState } from 'react';
import { FilePlus2, FileSignature, Gavel, Layers } from 'lucide-react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { toast } from '@/components/ui/toast';
import { Field } from '@/components/disposition/agreement-panel';
import { DocumentSelect } from '@/components/disposition/document-select';
import { day, errorText } from '@/lib/disposition';
import { TEMPLATE_KIND_LABEL } from '@/lib/markets';

interface Version {
  id: string;
  version: number;
  status: 'draft' | 'validated' | 'approved' | 'retired';
  format: 'docx' | 'txt';
  states: string[];
  fields: string[];
  unknownFields: string[];
  missingRequired: string[];
  counselName: string | null;
  approvedAt: string | null;
  createdAt: string;
  document: { id: string; title: string; fileName: string } | null;
}

interface Template {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  disclosureKey: string | null;
  retiredAt: string | null;
  starter: boolean;
  versions: Version[];
}

interface Registry {
  kinds: Array<{ kind: string; label: string; fields: Array<{ key: string; description: string; required: boolean }> }>;
  jurisdictions: string[];
}

const VERSION_VARIANT = { draft: 'warning', validated: 'info', approved: 'success', retired: 'outline' } as const;

/** A template action: refreshes templates and the market matrix, and says why on failure. */
function useTemplateCall<I>(fn: (i: I) => Promise<unknown>, ok: string, fail: string, done?: () => void) {
  const qc = useQueryClient();
  return useApiMutation<I, unknown>(fn, {
    onSuccess: () => {
      toast.success(ok);
      qc.invalidateQueries({ queryKey: ['/templates'] });
      qc.invalidateQueries({ queryKey: ['/markets'] });
      done?.();
    },
    onError: (err) => toast.error(fail, { description: errorText(err) }),
  });
}

const statesOf = (s: string) =>
  s
    .split(/[\s,]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);

/**
 * Document templates (docs/markets.md s6): counsel's text, versioned. A
 * version is checked on upload, approved for named states on counsel's
 * say-so, and only then generates documents for deals there.
 */
export default function TemplatesPage() {
  const list = useApiQuery<{ pdfConverter: boolean; templates: Template[] }>('/templates');
  const registry = useApiQuery<Registry>('/templates/registry');

  const [createOpen, setCreateOpen] = useState(false);
  const [kind, setKind] = useState('purchase_agreement');
  const [name, setName] = useState('');
  const [disclosureKey, setDisclosureKey] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [states, setStates] = useState('');
  const [versionFor, setVersionFor] = useState<Template | null>(null);
  const [approveFor, setApproveFor] = useState<Version | null>(null);
  const [counselName, setCounselName] = useState('');
  const [counselFirm, setCounselFirm] = useState('');
  const [approvalDoc, setApprovalDoc] = useState('');
  const [attest, setAttest] = useState(false);


  const create = useTemplateCall<void>(
    () =>
      apiJson('/templates', {
        method: 'POST',
        body: JSON.stringify({ kind, name, disclosureKey: disclosureKey.trim() || null, documentId, states: statesOf(states) }),
      }),
    'Template uploaded and checked',
    'Could not add the template',
    () => setCreateOpen(false),
  );
  const addVersion = useTemplateCall<void>(
    () =>
      apiJson(`/templates/${versionFor?.id}/versions`, {
        method: 'POST',
        body: JSON.stringify({ documentId, states: statesOf(states) }),
      }),
    'New version uploaded and checked',
    'Could not add the version',
    () => setVersionFor(null),
  );
  const approve = useTemplateCall<void>(
    () =>
      apiJson(`/templates/versions/${approveFor?.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          counselName,
          counselFirm: counselFirm.trim() || null,
          approvalDocumentId: approvalDoc,
          attest: true,
          states: statesOf(states),
        }),
      }),
    'Approved: it now generates documents in those states',
    'Could not approve',
    () => setApproveFor(null),
  );
  const retire = useTemplateCall<string>(
    (id) => apiJson(`/templates/versions/${id}/retire`, { method: 'POST', body: JSON.stringify({ reason: 'Retired from the Templates page' }) }),
    'Version retired',
    'Could not retire',
  );
  const starters = useTemplateCall<void>(
    () => apiJson('/templates/starter', { method: 'POST' }),
    'Starter scaffolds installed: merge fields only, not legal text',
    'Could not install the scaffolds',
  );

  const openCreate = () => {
    setKind('purchase_agreement');
    setName('');
    setDisclosureKey('');
    setDocumentId('');
    setStates('');
    setCreateOpen(true);
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Compliance"
        title="Templates"
        description="Purchase and assignment agreements, disclosures and notices, as counsel wrote them (.docx or .txt with {{field}} blanks). Halo fills the blanks; it never writes clauses."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" loading={starters.isPending} onClick={() => starters.mutate()}>
              <Layers size={14} className="mr-1" aria-hidden />
              Install starter scaffolds
            </Button>
            <Button size="sm" onClick={openCreate}>
              <FilePlus2 size={14} className="mr-1" aria-hidden />
              Add template
            </Button>
          </div>
        }
      />
      {list.data && !list.data.pdfConverter && (
        <Card className="border-amber-500/30">
          <CardContent className="py-3 text-caption">
            PDF conversion of Word documents is not configured (PDF_CONVERTER_URL). Text templates still get PDFs; Word documents are generated as .docx, which DocuSign accepts.
          </CardContent>
        </Card>
      )}
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState title="Could not load templates" description={errorText(list.error)} onRetry={() => list.refetch()} />
      ) : list.data.templates.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No templates yet"
          description="Upload counsel's documents to the library, then add them here for the states they cover. Starter scaffolds show the merge fields."
        />
      ) : (
        <div className="space-y-4">
          {list.data.templates.map((t) => (
            <Card key={t.id} className={t.retiredAt ? 'opacity-60' : undefined}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{t.name}</CardTitle>
                    <Badge variant="outline">{TEMPLATE_KIND_LABEL[t.kind] ?? t.kind}</Badge>
                    {t.starter && <Badge variant="warning">starter scaffold: not legal text</Badge>}
                    {t.disclosureKey && <Badge variant="outline">for {t.disclosureKey}</Badge>}
                  </div>
                  {!t.retiredAt && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setVersionFor(t);
                        setDocumentId('');
                        setStates(t.versions[0]?.states.join(', ') ?? '');
                      }}
                    >
                      New version
                    </Button>
                  )}
                </div>
                {t.description && <CardDescription>{t.description}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-2">
                {t.versions.map((v) => (
                  <div key={v.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border p-3">
                    <div className="space-y-1">
                      <p className="font-medium">
                        v{v.version} · {v.format} · {v.states.length ? v.states.join(', ') : 'no state'}
                      </p>
                      <p className="text-caption text-muted-foreground">
                        {v.document?.title ?? 'file'} · {v.fields.length} field(s): {v.fields.join(', ')}
                      </p>
                      {v.unknownFields.length > 0 && <p className="text-caption text-destructive">Unknown fields: {v.unknownFields.join(', ')}</p>}
                      {v.missingRequired.length > 0 && <p className="text-caption text-destructive">Missing required fields: {v.missingRequired.join(', ')}</p>}
                      {v.approvedAt && (
                        <p className="text-caption text-muted-foreground">
                          Approved {day(v.approvedAt)} on the advice of {v.counselName}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={VERSION_VARIANT[v.status]}>{v.status}</Badge>
                      {v.status === 'validated' && !t.starter && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setApproveFor(v);
                            setStates(v.states.join(', '));
                            setCounselName('');
                            setCounselFirm('');
                            setApprovalDoc('');
                            setAttest(false);
                          }}
                        >
                          <Gavel size={14} className="mr-1" aria-hidden />
                          Approve
                        </Button>
                      )}
                      {v.status !== 'retired' && (
                        <Button size="sm" variant="ghost" onClick={() => retire.mutate(v.id)}>
                          Retire
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {registry.data && (
        <Card>
          <CardHeader>
            <CardTitle>Merge fields</CardTitle>
            <CardDescription>What each kind of template may use. Required fields must appear in every template of that kind.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {registry.data.kinds.map((k) => (
              <div key={k.kind}>
                <p className="font-medium">{k.label}</p>
                <ul className="mt-1 space-y-0.5">
                  {k.fields.map((f) => (
                    <li key={f.key} className="text-caption">
                      <code className="text-primary">{`{{${f.key}}}`}</code> {f.required && <Badge variant="outline">required</Badge>}{' '}
                      <span className="text-muted-foreground">{f.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a template</DialogTitle>
            <DialogDescription>Upload the file to the documents library first. Halo checks its merge fields now.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Kind" htmlFor="tp-kind">
                <Select id="tp-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                  {Object.keys(TEMPLATE_KIND_LABEL).map((k) => (
                    <option key={k} value={k}>
                      {TEMPLATE_KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Name" htmlFor="tp-name">
                <Input id="tp-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
            <Field label="File (.docx or .txt)" htmlFor="tp-doc">
              <DocumentSelect id="tp-doc" value={documentId} onChange={setDocumentId} placeholder="Choose the template file…" />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="States it covers (e.g. TX, OK, or ALL)" htmlFor="tp-states">
                <Input id="tp-states" value={states} onChange={(e) => setStates(e.target.value)} />
              </Field>
              <Field label="Disclosure key (disclosures only)" htmlFor="tp-disc">
                <Input id="tp-disc" value={disclosureKey} onChange={(e) => setDisclosureKey(e.target.value)} />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!documentId || name.trim().length < 3} loading={create.isPending} onClick={() => create.mutate()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!versionFor} onOpenChange={(o) => !o && setVersionFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New version of {versionFor?.name}</DialogTitle>
            <DialogDescription>Earlier versions stay on the record; a new one needs its own approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="File (.docx or .txt)" htmlFor="tv-doc">
              <DocumentSelect id="tv-doc" value={documentId} onChange={setDocumentId} placeholder="Choose the new file…" />
            </Field>
            <Field label="States it covers" htmlFor="tv-states">
              <Input id="tv-states" value={states} onChange={(e) => setStates(e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVersionFor(null)}>
              Cancel
            </Button>
            <Button disabled={!documentId} loading={addVersion.isPending} onClick={() => addVersion.mutate()}>
              Upload version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!approveFor} onOpenChange={(o) => !o && setApproveFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record counsel&apos;s approval of v{approveFor?.version}</DialogTitle>
            <DialogDescription>Only approve text counsel actually reviewed, for the states counsel approved it for.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Counsel" htmlFor="ta-counsel">
                <Input id="ta-counsel" value={counselName} onChange={(e) => setCounselName(e.target.value)} />
              </Field>
              <Field label="Firm" htmlFor="ta-firm">
                <Input id="ta-firm" value={counselFirm} onChange={(e) => setCounselFirm(e.target.value)} />
              </Field>
            </div>
            <Field label="States approved for" htmlFor="ta-states">
              <Input id="ta-states" value={states} onChange={(e) => setStates(e.target.value)} />
            </Field>
            <Field label="Counsel's approval (memo or letter)" htmlFor="ta-doc">
              <DocumentSelect id="ta-doc" value={approvalDoc} onChange={setApprovalDoc} placeholder="Choose the approval…" />
            </Field>
            <label className="flex items-start gap-2 text-body">
              <Checkbox checked={attest} onCheckedChange={(v) => setAttest(v === true)} className="mt-1" />
              <span>Counsel reviewed this exact text and approved it for these states.</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveFor(null)}>
              Cancel
            </Button>
            <Button disabled={!attest || !approvalDoc || counselName.trim().length < 2 || statesOf(states).length === 0} loading={approve.isPending} onClick={() => approve.mutate()}>
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
