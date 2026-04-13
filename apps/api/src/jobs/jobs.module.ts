import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  controllers: [JobsController],
  providers: [JobsService, PrismaService],
  exports: [JobsService],
})
export class JobsModule {}
