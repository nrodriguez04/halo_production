import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { unlink } from 'fs/promises';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { input } from '../disposition/parse-input';
import { DncRegistryService } from './dnc-registry.service';

const OPERATOR = 'control_plane:write';

const ImportSchema = z
  .object({
    source: z.string().trim().min(2).max(8),
    /** Comma- or space-separated three-digit area codes. */
    areaCodes: z.string().trim().min(3).max(20_000),
    /** The day the file was downloaded from the registry, YYYY-MM-DD. */
    fetchedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

const RequiredSchema = z
  .object({
    required: z.boolean(),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();

/** Do Not Call registry data and the scrubbing requirement (docs/communications.md s7). */
@Controller('compliance/dnc-registry')
@UseGuards(AuthGuard, PermissionsGuard)
export class DncRegistryController {
  constructor(private registry: DncRegistryService) {}

  @Get()
  status(@CurrentAccountId() a: string) {
    return this.registry.status(a);
  }

  /** One downloaded registry file, unzipped: a number per line. */
  @Post('import')
  @Permissions(OPERATOR)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: tmpdir() }),
      limits: { fileSize: 2 * 1024 ** 3 },
    }),
  )
  async import(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: unknown,
  ) {
    if (!file)
      throw new BadRequestException('Attach the registry file as "file"');
    try {
      const q = input(ImportSchema, body);
      return await this.registry.import(a, u, {
        filePath: file.path,
        fileName: file.originalname,
        source: q.source === 'national' ? 'national' : q.source.toUpperCase(),
        areaCodes: q.areaCodes.split(/[\s,]+/).filter(Boolean),
        // Noon UTC, so the date means the same day in every US zone.
        fetchedAt: new Date(`${q.fetchedAt}T12:00:00Z`),
      });
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  @Delete(':id')
  @Permissions(OPERATOR)
  remove(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
  ) {
    return this.registry.remove(a, u, id);
  }

  /** Whether marketing texts must be scrubbed. Turning it off needs a reason and is audited. */
  @Post('required')
  @Permissions(OPERATOR)
  setRequired(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Body() body: unknown,
  ) {
    const q = input(RequiredSchema, body);
    return this.registry.setRequired(a, u, q.required, q.reason);
  }
}
