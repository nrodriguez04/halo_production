'use client';

import { Suspense, useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { apiDownload, apiUpload } from '@/lib/api-fetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';
import { SearchFilterBar } from '@/components/search-filter-bar';
import { LoadingState, EmptyState, ErrorState, SkeletonTable } from '@/components/states';
import { useDebouncedValue } from '@/lib/use-debounce';
import { Download, FileText, ShieldCheck, Trash2, Upload } from 'lucide-react';

interface Doc {
  id: string;
  category: string;
  title: string;
  description: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  dealId: string | null;
  leadId: string | null;
  buyerId: string | null;
  jurisdiction: string | null;
  status: string;
  tags: string[];
  createdAt: string;
}

interface ChecklistItem {
  key: string;
  title: string;
  category: string;
  jurisdiction: string;
  why: string;
  reference?: string;
  have: boolean;
  documents: Array<{ id: string; title: string }>;
}

const CATEGORIES = [
  { value: 'agreement_template', label: 'Agreement template' },
  { value: 'contract', label: 'Signed contract' },
  { value: 'disclosure', label: 'Disclosure' },
  { value: 'compliance', label: 'Compliance record' },
  { value: 'closing', label: 'Closing paperwork' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other', label: 'Other' },
];
const categoryLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp';

const emptyUpload = {
  category: 'agreement_template',
  title: '',
  description: '',
  jurisdiction: '',
  tags: '',
  checklistKey: '',
};
type UploadForm = typeof emptyUpload;

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The page reads ?dealId= and ?buyerId=, so it renders on the client inside
 * a Suspense boundary; without one, a static prerender of the route fails.
 */
export default function DocumentsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <DocumentsLibrary />
    </Suspense>
  );
}

function DocumentsLibrary() {
  const params = useSearchParams();
  const dealId = params.get('dealId') ?? '';
  const buyerId = params.get('buyerId') ?? '';
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<string>(params.get('tab') === 'compliance' ? 'compliance' : 'library');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, 250);
  const [state, setState] = useState('TX');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [form, setForm] = useState<UploadForm>(emptyUpload);
  const [fileName, setFileName] = useState('');

  const docs = useApiQuery<Doc[]>('/documents', {
    params: {
      category: category || undefined,
      dealId: dealId || undefined,
      buyerId: buyerId || undefined,
      q: q || undefined,
    },
    placeholderData: (prev) => prev,
  });
  const checklist = useApiQuery<ChecklistItem[]>('/documents/checklist', {
    params: { state: state.trim().length === 2 ? state.trim().toUpperCase() : undefined },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/documents'] });
    queryClient.invalidateQueries({ queryKey: ['/documents/checklist'] });
    queryClient.invalidateQueries({ queryKey: ['/documents/summary'] });
  };

  const uploadMutation = useApiMutation<UploadForm, Doc>(
    async (f) => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error('Choose a file first');
      const body = new FormData();
      body.append('file', file);
      body.append('category', f.category);
      if (f.title.trim()) body.append('title', f.title.trim());
      if (f.description.trim()) body.append('description', f.description.trim());
      if (f.jurisdiction.trim()) body.append('jurisdiction', f.jurisdiction.trim().toUpperCase());
      if (f.tags.trim()) body.append('tags', f.tags.trim());
      if (f.checklistKey) body.append('checklistKey', f.checklistKey);
      if (dealId) body.append('dealId', dealId);
      if (buyerId) body.append('buyerId', buyerId);
      return apiUpload<Doc>('/documents', body);
    },
    {
      onSuccess: (doc) => {
        toast.success(`Uploaded ${doc.title}`);
        setUploadOpen(false);
        setForm(emptyUpload);
        setFileName('');
        refresh();
      },
      onError: (err: { message: string }) => toast.error('Upload failed', { description: err.message }),
    },
  );

  const removeMutation = useApiMutation<Doc, unknown>(
    (doc) => apiJson(`/documents/${doc.id}`, { method: 'DELETE' }),
    {
      onSuccess: () => {
        toast.success('Document removed');
        refresh();
      },
      onError: (err: { message: string }) => toast.error('Could not remove', { description: err.message }),
    },
  );

  const download = (doc: { id: string; fileName?: string; title: string }) =>
    apiDownload(`/documents/${doc.id}/download`, doc.fileName ?? doc.title).catch((err) =>
      toast.error('Download failed', { description: (err as Error).message }),
    );

  const openUpload = (preset: Partial<UploadForm> = {}) => {
    setForm({ ...emptyUpload, ...preset });
    setFileName('');
    setUploadOpen(true);
  };
  const setField =
    (field: keyof UploadForm) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const items = checklist.data ?? [];
  const ready = items.filter((i) => i.have).length;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Documents"
        description="Agreements, disclosures, compliance records and closing paperwork, with the checklist a wholesale deal needs."
        actions={
          <Button size="sm" onClick={() => openUpload()}>
            <Upload size={16} className="mr-2" />
            Upload document
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="library">
            <FileText size={14} className="mr-1" />
            Library {docs.data ? `(${docs.data.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="compliance">
            <ShieldCheck size={14} className="mr-1" />
            Compliance checklist {items.length ? `(${ready}/${items.length})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[260px] flex-1">
              <SearchFilterBar value={search} onChange={setSearch} placeholder="Search title or file name" />
            </div>
            <div className="w-56">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            {dealId && <Badge variant="info">Deal {dealId.slice(0, 8)}</Badge>}
            {buyerId && <Badge variant="info">Buyer {buyerId.slice(0, 8)}</Badge>}
          </div>

          {docs.isPending ? (
            <LoadingState skeleton>
              <SkeletonTable rows={5} cols={6} />
            </LoadingState>
          ) : docs.isError ? (
            <ErrorState
              title="Couldn't load documents"
              description={docs.error?.message}
              onRetry={() => docs.refetch()}
            />
          ) : (docs.data ?? []).length === 0 ? (
            <EmptyState
              title="No documents yet"
              description="Upload your purchase agreement, assignment contract and disclosures to start the library."
              action={
                <Button size="sm" onClick={() => openUpload()}>
                  <Upload size={16} className="mr-2" />
                  Upload document
                </Button>
              }
            />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {docs.data!.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <div className="font-medium">{d.title}</div>
                          <div className="text-xs text-muted-foreground">{d.fileName}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{categoryLabel(d.category)}</Badge>
                        </TableCell>
                        <TableCell>{d.jurisdiction ?? 'any'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {d.tags.map((t) => (
                              <Badge key={t} variant={t.startsWith('checklist:') ? 'success' : 'secondary'}>
                                {t.replace('checklist:', 'checklist: ')}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>{size(d.sizeBytes)}</TableCell>
                        <TableCell>{new Date(d.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => download(d)}>
                            <Download size={14} className="mr-1" />
                            Download
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-1"
                            aria-label={`Remove ${d.title}`}
                            onClick={() => removeMutation.mutate(d)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="compliance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {items.length ? `${ready} of ${items.length} on file` : 'Checklist'}
                </span>
                <label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                  Operating state
                  <Input
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    maxLength={2}
                    className="w-16 uppercase"
                  />
                </label>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                The paperwork a wholesale operation keeps on file. Upload a template or record
                against each item; the statute references are pointers for your counsel to
                confirm, not legal advice.
              </p>
              {checklist.isPending ? (
                <LoadingState />
              ) : (
                items.map((item) => (
                  <div
                    key={item.key}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div className="min-w-[260px] flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{item.title}</span>
                        <Badge variant={item.have ? 'success' : 'warning'}>
                          {item.have ? 'On file' : 'Missing'}
                        </Badge>
                        <Badge variant="outline">{categoryLabel(item.category)}</Badge>
                        {item.jurisdiction !== 'all' && <Badge variant="info">{item.jurisdiction}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{item.why}</p>
                      {item.reference && (
                        <p className="text-xs text-muted-foreground">Reference: {item.reference}</p>
                      )}
                      {item.documents.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {item.documents.map((d) => (
                            <Button key={d.id} variant="link" size="sm" className="h-auto p-0" onClick={() => download(d)}>
                              <Download size={12} className="mr-1" />
                              {d.title}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      variant={item.have ? 'outline' : 'default'}
                      size="sm"
                      onClick={() =>
                        openUpload({
                          category: item.category,
                          checklistKey: item.key,
                          title: item.title,
                          jurisdiction: item.jurisdiction === 'all' ? '' : item.jurisdiction,
                        })
                      }
                    >
                      <Upload size={14} className="mr-1" />
                      {item.have ? 'Upload newer' : 'Upload'}
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              uploadMutation.mutate(form);
            }}
          >
            <DialogHeader>
              <DialogTitle>Upload document</DialogTitle>
              <DialogDescription>
                PDF, Word, Excel, CSV, text or images up to 25 MB. Stored privately per account.
                {dealId ? ' This document will be linked to the current deal.' : ''}
                {buyerId ? ' This document will be linked to the current buyer.' : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-4">
              <label className="col-span-2 space-y-1 text-sm">
                <span className="text-muted-foreground">File</span>
                <Input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPT}
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Category</span>
                <Select value={form.category} onChange={setField('category')}>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Checklist item (optional)</span>
                <Select value={form.checklistKey} onChange={setField('checklistKey')}>
                  <option value="">None</option>
                  {items.map((i) => (
                    <option key={i.key} value={i.key}>
                      {i.title}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="col-span-2 space-y-1 text-sm">
                <span className="text-muted-foreground">Title</span>
                <Input value={form.title} onChange={setField('title')} placeholder={fileName || 'Defaults to the file name'} />
              </label>
              <label className="col-span-2 space-y-1 text-sm">
                <span className="text-muted-foreground">Description</span>
                <Textarea value={form.description} onChange={setField('description')} rows={2} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">State (if specific)</span>
                <Input value={form.jurisdiction} onChange={setField('jurisdiction')} placeholder="TX" maxLength={2} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Tags (comma separated)</span>
                <Input value={form.tags} onChange={setField('tags')} placeholder="template, 2026" />
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={uploadMutation.isPending} disabled={!fileName}>
                Upload
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
