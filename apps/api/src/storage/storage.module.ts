import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';

@Module({
  imports: [
    MulterModule.register({
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  ],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
