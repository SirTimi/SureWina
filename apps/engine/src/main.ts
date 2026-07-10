import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

// The draw engine: an isolated application context (no HTTP server). In
// production this runs as its own task with a restricted DB role; locally
// it shares the dev database but keeps its own keys and process.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  new Logger('Engine').log('Surewina draw engine started');
}

void bootstrap();