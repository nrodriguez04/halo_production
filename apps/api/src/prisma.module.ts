import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * One database client for the whole api. Every module used to list
 * PrismaService among its own providers, which made a client, and a
 * connection pool, per module: dozens of pools against one Postgres.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
