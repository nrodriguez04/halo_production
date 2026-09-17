import { Module } from '@nestjs/common';
import { QueuesModule } from './queues/queues.module';
import { ProcessorsModule } from './processors/processors.module';

const imports = [QueuesModule, ProcessorsModule];

if (process.env.FEATURE_OPENCLAW === 'true') {
  try {
    // Deliberately a runtime require: a static import would pull the
    // OpenClaw module (and its optional `openclaw-node` dependency) into the
    // bundle even when FEATURE_OPENCLAW is off.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OpenClawModule } = require('./openclaw/openclaw.module');
    imports.push(OpenClawModule);
  } catch {
    console.warn('OpenClaw module could not be loaded; skipping.');
  }
}

@Module({ imports })
export class AppModule {}
