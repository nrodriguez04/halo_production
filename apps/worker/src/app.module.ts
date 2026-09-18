import { Module } from '@nestjs/common';
import { QueuesModule } from './queues/queues.module';
import { ProcessorsModule } from './processors/processors.module';

@Module({ imports: [QueuesModule, ProcessorsModule] })
export class AppModule {}
