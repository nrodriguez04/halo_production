import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { StorageService } from './storage.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId } from '../auth/decorators';

@Controller('storage')
@UseGuards(AuthGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload/:category')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentAccountId() accountId: string,
    @Param('category') category: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const validCategories = ['contracts', 'flyers', 'marketing', 'documents'];
    if (!validCategories.includes(category)) {
      throw new BadRequestException(`Invalid category. Allowed: ${validCategories.join(', ')}`);
    }

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
      throw new BadRequestException('File too large (max 20MB)');
    }

    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const result = await this.storageService.upload(
      accountId,
      category,
      safeName,
      file.buffer,
      file.mimetype,
    );

    return {
      key: result.key,
      url: result.url,
      originalName: file.originalname,
      size: file.size,
      contentType: file.mimetype,
    };
  }

  @Get('files')
  async listFiles(
    @CurrentAccountId() accountId: string,
    @Query('category') category?: string,
  ) {
    const files = await this.storageService.list(accountId, category);
    return { files };
  }

  @Get('download/:key(*)')
  async download(
    @CurrentAccountId() accountId: string,
    @Param('key') key: string,
    @Res() res: Response,
  ) {
    if (!key.startsWith(`${accountId}/`)) {
      throw new NotFoundException('File not found');
    }

    try {
      const { body, contentType } = await this.storageService.download(key);
      res.setHeader('Content-Type', contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${key.split('/').pop()}"`);
      body.pipe(res);
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException('File not found');
      }
      throw err;
    }
  }

  @Delete(':key(*)')
  async deleteFile(
    @CurrentAccountId() accountId: string,
    @Param('key') key: string,
  ) {
    if (!key.startsWith(`${accountId}/`)) {
      throw new NotFoundException('File not found');
    }

    await this.storageService.delete(key);
    return { deleted: true, key };
  }
}
