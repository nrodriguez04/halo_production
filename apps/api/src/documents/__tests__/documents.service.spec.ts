import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';
import { DocumentsService } from '../documents.service';

const file = (over: Record<string, unknown> = {}) => ({
  originalname: 'Assignment Contract (v2).pdf',
  mimetype: 'application/pdf',
  size: 1234,
  buffer: Buffer.from('%PDF-1.4 fake'),
  ...over,
});

const row = (over: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  accountId: 'tenant-1',
  category: 'agreement_template',
  title: 'Assignment of contract',
  description: null,
  storageKey: 'tenant-1/documents/1-Assignment_Contract.pdf',
  fileName: 'Assignment Contract (v2).pdf',
  contentType: 'application/pdf',
  sizeBytes: 1234,
  dealId: null,
  leadId: null,
  buyerId: null,
  jurisdiction: null,
  status: 'active',
  tags: ['checklist:assignment_contract'],
  uploadedBy: 'user-1',
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  ...over,
});

describe('DocumentsService', () => {
  let prisma: any;
  let storage: { upload: jest.Mock; download: jest.Mock; delete: jest.Mock };
  let service: DocumentsService;

  beforeEach(() => {
    prisma = {
      document: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(row()),
        create: jest.fn(async ({ data }: any) => ({ id: 'doc-new', ...data })),
        update: jest.fn(async ({ data }: any) => ({ ...row(), ...data })),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(3),
      },
    };
    storage = {
      upload: jest.fn(
        async (tenant: string, category: string, name: string) => ({
          key: `${tenant}/${category}/${name}`,
          bucket: 'halo-documents',
          url: `http://localhost:9000/halo-documents/${tenant}/${category}/${name}`,
        }),
      ),
      download: jest.fn().mockResolvedValue({
        body: Readable.from(['bytes']),
        contentType: 'application/pdf',
      }),
      delete: jest.fn(),
    };
    service = new DocumentsService(prisma, storage as any);
  });

  it('stores the bytes under the tenant and writes the row with the checklist tag', async () => {
    const created = await service.create(
      'tenant-1',
      'user-1',
      {
        category: 'agreement_template',
        title: '  Assignment of contract ',
        tags: ['template', ' texas '],
        checklistKey: 'assignment_contract',
        jurisdiction: 'tx',
        dealId: '',
      },
      file(),
    );

    expect(storage.upload).toHaveBeenCalledWith(
      'tenant-1',
      'documents',
      expect.stringMatching(/^\d+-Assignment_Contract__v2_\.pdf$/),
      expect.any(Buffer),
      'application/pdf',
    );
    expect(prisma.document.create.mock.calls[0][0].data).toMatchObject({
      accountId: 'tenant-1',
      category: 'agreement_template',
      title: 'Assignment of contract',
      fileName: 'Assignment Contract (v2).pdf',
      contentType: 'application/pdf',
      sizeBytes: 1234,
      storageKey: expect.stringMatching(/^tenant-1\/documents\//),
      dealId: null,
      jurisdiction: 'TX',
      tags: ['template', 'texas', 'checklist:assignment_contract'],
      uploadedBy: 'user-1',
    });
    expect(created.id).toBe('doc-new');
  });

  it('falls back to the file name as the title', async () => {
    await service.create('tenant-1', 'user-1', { category: 'other' }, file());
    expect(prisma.document.create.mock.calls[0][0].data.title).toBe(
      'Assignment Contract (v2).pdf',
    );
  });

  it('rejects missing, oversized and unsupported files before touching storage', async () => {
    await expect(
      service.create('tenant-1', 'user-1', { category: 'other' }, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(
        'tenant-1',
        'user-1',
        { category: 'other' },
        file({ size: 30 * 1024 * 1024 }),
      ),
    ).rejects.toThrow('too large');
    await expect(
      service.create(
        'tenant-1',
        'user-1',
        { category: 'other' },
        file({ originalname: 'run.exe' }),
      ),
    ).rejects.toThrow('Unsupported file type');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('scopes reads, downloads and deletes to the tenant', async () => {
    prisma.document.findFirst.mockResolvedValueOnce(null);
    await expect(service.download('tenant-2', 'doc-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.download).not.toHaveBeenCalled();

    const out = await service.download('tenant-1', 'doc-1');
    expect(prisma.document.findFirst).toHaveBeenLastCalledWith({
      where: { id: 'doc-1', accountId: 'tenant-1' },
    });
    expect(storage.download).toHaveBeenCalledWith(
      'tenant-1/documents/1-Assignment_Contract.pdf',
    );
    expect(out.fileName).toBe('Assignment Contract (v2).pdf');
    expect(out.contentType).toBe('application/pdf');
  });

  it('removes the row even when the object is already gone', async () => {
    storage.delete.mockRejectedValueOnce(new Error('NoSuchKey'));
    await service.remove('tenant-1', 'doc-1');
    expect(prisma.document.delete).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
    });
  });

  it('replaces the checklist tag on update and keeps the other tags', async () => {
    prisma.document.findFirst.mockResolvedValueOnce(
      row({ tags: ['template', 'checklist:assignment_contract'] }),
    );
    await service.update('tenant-1', 'doc-1', {
      checklistKey: 'purchase_agreement',
      status: 'archived',
      description: '  ',
    });
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: {
        status: 'archived',
        description: null,
        tags: ['template', 'checklist:purchase_agreement'],
      },
    });
  });

  it('scores the checklist for the jurisdiction from tagged active documents', async () => {
    prisma.document.findMany.mockResolvedValueOnce([
      row(),
      row({
        id: 'doc-2',
        title: 'TX disclosure',
        tags: ['checklist:equitable_interest_disclosure'],
      }),
    ]);

    const texas = await service.checklist('tenant-1', 'tx');
    const byKey = Object.fromEntries(texas.map((i) => [i.key, i]));
    expect(byKey.assignment_contract.have).toBe(true);
    expect(byKey.assignment_contract.documents).toEqual([
      {
        id: 'doc-1',
        title: 'Assignment of contract',
        updatedAt: expect.any(Date),
      },
    ]);
    expect(byKey.equitable_interest_disclosure.have).toBe(true);
    expect(byKey.purchase_agreement.have).toBe(false);
    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accountId: 'tenant-1',
          status: 'active',
          tags: {
            hasSome: expect.arrayContaining(['checklist:assignment_contract']),
          },
        }),
      }),
    );

    const florida = await service.checklist('tenant-1', 'FL');
    expect(florida.some((i) => i.key === 'equitable_interest_disclosure')).toBe(
      false,
    );
    expect(florida.length).toBe(texas.length - 1);
  });

  it('summarises counts for the dashboard', async () => {
    prisma.document.findMany.mockResolvedValueOnce([row()]);
    const summary = await service.summary('tenant-1', 'TX');
    expect(summary.documents).toBe(3);
    expect(summary.checklist.total).toBe(12);
    expect(summary.checklist.ready).toBe(1);
    expect(summary.checklist.missing).toContain(
      'Equitable interest disclosure (Texas)',
    );
  });
});
