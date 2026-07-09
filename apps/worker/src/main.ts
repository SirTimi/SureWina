import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

// Standalone application context — the worker has no HTTP server. It exists
// to run BullMQ consumers (and later, cron-scheduled jobs).
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  new Logger('Worker').log('Surewina worker started');
}

void bootstrap();