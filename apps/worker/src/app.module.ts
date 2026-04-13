import { Module } from '@nestjs/common';
import { QueuesModule } from './queues/queues.module';
import { ProcessorsModule } from './processors/processors.module';

const imports = [QueuesModule, ProcessorsModule];

if (process.env.FEATURE_OPENCLAW === 'true') {
  try {
    const { OpenClawModule } = require('./openclaw/openclaw.module');
    imports.push(OpenClawModule);
  } catch {
    console.warn('OpenClaw module could not be loaded; skipping.');
  }
}

@Module({ imports })
export class AppModule {}
