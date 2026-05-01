import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '..', '.env.local') });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger as NestLogger } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import * as express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnv } from './env';

async function bootstrap() {
  validateEnv();
  const app = await NestFactory.create(AppModule);
  app.useLogger(app.get(Logger));

  const httpAdapter = app.getHttpAdapter().getInstance() as express.Application;
  httpAdapter.disable('x-powered-by');

  try {
    app.use(helmet({ contentSecurityPolicy: false }));
  } catch {
    httpAdapter.disable('x-powered-by');
  }

  // CORS
  const origins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.use(express.json({ limit: '512kb' }));
  app.use(express.urlencoded({ extended: true, limit: '512kb' }));

  app.use((req: any, _res: any, next: any) => {
    if (req.body && typeof req.body === 'object') {
      const depth = (obj: any, d = 0): number => {
        if (d > 20) return d;
        if (typeof obj !== 'object' || obj === null) return d;
        let max = d;
        for (const k of Object.keys(obj)) {
          max = Math.max(max, depth(obj[k], d + 1));
          if (max > 20) return max;
        }
        return max;
      };
      if (depth(req.body) > 20) {
        return _res.status(400).json({ statusCode: 400, message: 'Request body nested too deeply' });
      }
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3001;
  await app.listen(port);
  const logger = new NestLogger('Bootstrap');
  logger.log(`API server running on http://localhost:${port}`);
}

bootstrap();
