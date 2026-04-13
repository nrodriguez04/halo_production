import { Module } from '@nestjs/common';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [PropertiesController],
  providers: [PropertiesService, PrismaService],
  exports: [PropertiesService],
})
export class PropertiesModule {}

