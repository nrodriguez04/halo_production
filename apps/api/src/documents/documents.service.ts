import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Document } from '@prisma/client';
import type { Readable } from 'stream';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  CHECKLIST_TAG_PREFIX,
  checklistFor,
  type ChecklistItem,
  type DocumentCategory,
} from './documents.checklist';

export interface DocumentFilter {
  category?: DocumentCategory;
  dealId?: string;
  leadId?: string;
  buyerId?: string;
  q?: string;
  status?: 'active' | 'archived' | 'all';
}

export interface DocumentInput {
  category: DocumentCategory;
  title?: string;
  description?: string;
  dealId?: string;
  leadId?: string;
  buyerId?: string;
  jurisdiction?: string;
  tags?: string[];
  /** Marks the document as satisfying a checklist item. */
  checklistKey?: string;
}

export interface DocumentPatch {
  title?: string;
  description?: string | null;
  category?: DocumentCategory;
  dealId?: string | null;
  leadId?: string | null;
  buyerId?: string | null;
  jurisdiction?: string | null;
  status?: 'active' | 'archived';
  tags?: string[];
  /** null clears the checklist link. */
  checklistKey?: string | null;
}

export interface UploadedDocumentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ChecklistStatus extends ChecklistItem {
  have: boolean;
  documents: Array<{ id: string; title: string; updatedAt: Date }>;
}

/** Object-storage prefix under the tenant: `<accountId>/documents/<file>`. */
export const DOCUMENT_STORAGE_CATEGORY = 'documents';
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_NAME = /\.(pdf|docx?|xlsx?|csv|txt|png|jpe?g|gif|webp)$/i;

/**
 * The tenant's document library. Bytes go to object storage through
 * StorageService; this service owns the metadata rows, tenant scoping and the
 * compliance checklist that scores the library.
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  list(accountId: string, filter: DocumentFilter = {}): Promise<Document[]> {
    const status = filter.status ?? 'active';
    return this.prisma.document.findMany({
      where: {
        accountId,
        ...(status !== 'all' ? { status } : {}),
        ...(filter.category ? { category: filter.category } : {}),
        ...(filter.dealId ? { dealId: filter.dealId } : {}),
        ...(filter.leadId ? { leadId: filter.leadId } : {}),
        ...(filter.buyerId ? { buyerId: filter.buyerId } : {}),
        ...(filter.q
          ? {
              OR: [
                { title: { contains: filter.q, mode: 'insensitive' } },
                { fileName: { contains: filter.q, mode: 'insensitive' } },
                { description: { contains: filter.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(accountId: string, id: string): Promise<Document> {
    const doc = await this.prisma.document.findFirst({
      where: { id, accountId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async create(
    accountId: string,
    userId: string,
    input: DocumentInput,
    file: UploadedDocumentFile | undefined,
  ): Promise<Document> {
    if (!file?.buffer?.length)
      throw new BadRequestException('No file uploaded');
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('File too large (max 25MB)');
    }
    if (!ALLOWED_NAME.test(file.originalname)) {
      throw new BadRequestException(
        'Unsupported file type; upload PDF, Word, Excel, CSV, text or image files',
      );
    }

    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const contentType = file.mimetype || 'application/octet-stream';
    const stored = await this.storage.upload(
      accountId,
      DOCUMENT_STORAGE_CATEGORY,
      safeName,
      file.buffer,
      contentType,
    );

    const tags = new Set(
      (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
    );
    if (input.checklistKey) {
      tags.add(`${CHECKLIST_TAG_PREFIX}${input.checklistKey}`);
    }

    return this.prisma.document.create({
      data: {
        accountId,
        category: input.category,
        title: input.title?.trim() || file.originalname,
        description: input.description?.trim() || null,
        storageKey: stored.key,
        fileName: file.originalname,
        contentType,
        sizeBytes: file.size,
        dealId: input.dealId || null,
        leadId: input.leadId || null,
        buyerId: input.buyerId || null,
        jurisdiction: input.jurisdiction?.trim().toUpperCase() || null,
        tags: Array.from(tags),
        uploadedBy: userId,
      },
    });
  }

  async update(
    accountId: string,
    id: string,
    patch: DocumentPatch,
  ): Promise<Document> {
    const doc = await this.get(accountId, id);
    const data: Prisma.DocumentUpdateInput = {};
    if (patch.title !== undefined) data.title = patch.title.trim();
    if (patch.description !== undefined) {
      data.description = patch.description?.trim() || null;
    }
    if (patch.category !== undefined) data.category = patch.category;
    if (patch.dealId !== undefined) data.dealId = patch.dealId || null;
    if (patch.leadId !== undefined) data.leadId = patch.leadId || null;
    if (patch.buyerId !== undefined) data.buyerId = patch.buyerId || null;
    if (patch.jurisdiction !== undefined) {
      data.jurisdiction = patch.jurisdiction?.trim().toUpperCase() || null;
    }
    if (patch.status !== undefined) data.status = patch.status;

    if (patch.tags !== undefined || patch.checklistKey !== undefined) {
      const base = patch.tags ?? doc.tags;
      const kept = base
        .map((t) => t.trim())
        .filter(
          (t) =>
            t &&
            (patch.checklistKey === undefined ||
              !t.startsWith(CHECKLIST_TAG_PREFIX)),
        );
      if (patch.checklistKey) {
        kept.push(`${CHECKLIST_TAG_PREFIX}${patch.checklistKey}`);
      }
      data.tags = Array.from(new Set(kept));
    }

    return this.prisma.document.update({ where: { id }, data });
  }

  /** Removes the bytes and the row. A missing object is not an error. */
  async remove(accountId: string, id: string): Promise<void> {
    const doc = await this.get(accountId, id);
    try {
      await this.storage.delete(doc.storageKey);
    } catch (err) {
      this.logger.warn(
        `Could not delete object ${doc.storageKey}: ${(err as Error).message}`,
      );
    }
    await this.prisma.document.delete({ where: { id } });
  }

  async download(
    accountId: string,
    id: string,
  ): Promise<{ body: Readable; contentType: string; fileName: string }> {
    const doc = await this.get(accountId, id);
    const { body, contentType } = await this.storage.download(doc.storageKey);
    return {
      body,
      contentType: contentType || doc.contentType,
      fileName: doc.fileName,
    };
  }

  /** Every checklist item for the jurisdiction, with the active documents that satisfy it. */
  async checklist(
    accountId: string,
    jurisdiction?: string,
  ): Promise<ChecklistStatus[]> {
    const items = checklistFor(jurisdiction);
    const tagged = await this.prisma.document.findMany({
      where: {
        accountId,
        status: 'active',
        tags: { hasSome: items.map((i) => `${CHECKLIST_TAG_PREFIX}${i.key}`) },
      },
      select: { id: true, title: true, tags: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    return items.map((item) => {
      const tag = `${CHECKLIST_TAG_PREFIX}${item.key}`;
      const documents = tagged
        .filter((d) => d.tags.includes(tag))
        .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
      return { ...item, have: documents.length > 0, documents };
    });
  }

  /** Counts for the dashboard card. */
  async summary(accountId: string, jurisdiction?: string) {
    const [documents, items] = await Promise.all([
      this.prisma.document.count({ where: { accountId, status: 'active' } }),
      this.checklist(accountId, jurisdiction),
    ]);
    return {
      documents,
      checklist: {
        total: items.length,
        ready: items.filter((i) => i.have).length,
        missing: items.filter((i) => !i.have).map((i) => i.title),
      },
    };
  }
}
