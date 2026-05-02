// Module-level singleton PrismaClient shared by all BullMQ processors.
// Each processor previously called `new PrismaClient()` at the module level,
// creating one independent connection pool per processor. With 4+ processors
// in one worker process that risked exhausting Postgres `max_connections`
// under load. This single instance keeps the pool size bounded.
//
// NestJS-managed code paths (e.g. video.processor.ts) continue to use the
// `PrismaService` injectable in `prisma.service.ts`, which composes well with
// DI/testing. This file is for module-level usage from BullMQ processor
// classes that don't go through the Nest container at construction time.
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __halo_worker_prisma__: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__halo_worker_prisma__ ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__halo_worker_prisma__ = prisma;
}
