import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { DOCUMENT_CATEGORIES } from './documents.checklist';
import {
  DocumentsService,
  type DocumentFilter,
  type DocumentInput,
  type DocumentPatch,
} from './documents.service';

const ListQuerySchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  dealId: z.string().trim().min(1).optional(),
  leadId: z.string().trim().min(1).optional(),
  buyerId: z.string().trim().min(1).optional(),
  q: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'archived', 'all']).optional(),
});

const UploadFieldsSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  dealId: z.string().trim().optional(),
  leadId: z.string().trim().optional(),
  buyerId: z.string().trim().optional(),
  jurisdiction: z.string().trim().length(2).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  checklistKey: z.string().trim().max(60).optional(),
});

const PatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    category: z.enum(DOCUMENT_CATEGORIES).optional(),
    dealId: z.string().trim().nullable().optional(),
    leadId: z.string().trim().nullable().optional(),
    buyerId: z.string().trim().nullable().optional(),
    jurisdiction: z.string().trim().length(2).nullable().optional(),
    status: z.enum(['active', 'archived']).optional(),
    tags: z.array(z.string().trim()).optional(),
    checklistKey: z.string().trim().max(60).nullable().optional(),
  })
  .strict();

/** Multipart fields arrive as strings; an empty string means "not given". */
function cleanFields(body: unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries((body ?? {}) as Record<string, unknown>).filter(
      ([, v]) => v !== '' && v !== undefined && v !== null,
    ),
  );
}

function tagList(tags: string | string[] | undefined): string[] | undefined {
  if (tags === undefined) return undefined;
  const raw = Array.isArray(tags) ? tags : tags.split(',');
  return raw.map((t) => t.trim()).filter(Boolean);
}

@Controller('documents')
@UseGuards(AuthGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@CurrentAccountId() accountId: string, @Query() query: unknown) {
    // strictNullChecks is off here, so the zod output is cast to the filter type.
    return this.documents.list(
      accountId,
      ListQuerySchema.parse(cleanFields(query)) as DocumentFilter,
    );
  }

  /** The wholesale paperwork checklist scored against the library. */
  @Get('checklist')
  checklist(
    @CurrentAccountId() accountId: string,
    @Query('state') state?: string,
  ) {
    return this.documents.checklist(accountId, state);
  }

  @Get('summary')
  summary(
    @CurrentAccountId() accountId: string,
    @Query('state') state?: string,
  ) {
    return this.documents.summary(accountId, state);
  }

  @Get(':id')
  get(@CurrentAccountId() accountId: string, @Param('id') id: string) {
    return this.documents.get(accountId, id);
  }

  @Get(':id/download')
  async download(
    @CurrentAccountId() accountId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { body, contentType, fileName } = await this.documents.download(
      accountId,
      id,
    );
    const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    body.pipe(res);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  create(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: unknown,
  ) {
    const fields = UploadFieldsSchema.parse(cleanFields(body));
    const input: DocumentInput = {
      ...(fields as Omit<DocumentInput, 'tags'>),
      tags: tagList(fields.tags),
    };
    return this.documents.create(accountId, userId, input, file);
  }

  @Patch(':id')
  update(
    @CurrentAccountId() accountId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.documents.update(
      accountId,
      id,
      PatchSchema.parse(body) as DocumentPatch,
    );
  }

  @Delete(':id')
  async remove(@CurrentAccountId() accountId: string, @Param('id') id: string) {
    await this.documents.remove(accountId, id);
    return { deleted: true, id };
  }
}
