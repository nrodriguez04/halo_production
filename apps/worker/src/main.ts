import * as http from 'http';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateEnv } from './env';

const logger = new Logger('Worker');

async function bootstrap() {
  validateEnv();
  const app = await NestFactory.createApplicationContext(AppModule);

  const healthPort = parseInt(process.env.WORKER_HEALTH_PORT || '3003', 10);
  const healthServer = http.createServer(async (_req, res) => {
    try {
      // Basic liveness: if this code runs, the process is alive
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    } catch {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error' }));
    }
  });
  healthServer.listen(healthPort, () => {
    logger.log(`Worker health probe on http://localhost:${healthPort}`);
  });

  console.log('Worker started and listening for jobs...');

  // Keep the process alive
  process.on('SIGTERM', async () => {
    await app.close();
    process.exit(0);
  });
}

bootstrap();
