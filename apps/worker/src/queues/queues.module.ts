import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  // BullMQ requires this to be null
  maxRetriesPerRequest: null,
});

@Module({
  imports: [
    BullModule.forRoot({
      connection: redis,
    }),
    BullModule.registerQueue(
      {
        name: 'lead-enrichment',
      },
      {
        name: 'underwriting',
      },
      {
        name: 'communications',
      },
      {
        name: 'marketing',
      },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}

