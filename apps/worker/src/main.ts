import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log('Worker started and listening for jobs...');
  
  // Keep the process alive
  process.on('SIGTERM', async () => {
    await app.close();
    process.exit(0);
  });
}

bootstrap();

