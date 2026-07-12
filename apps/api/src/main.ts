import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: {
        level: process.env.LOG_LEVEL ?? 'info',
      },
    }),
    {
      // Nest's JSON parser attaches the raw buffer as request.rawBody —
      // required for webhook HMAC verification against exact received bytes.
      rawBody: true,
    },
  );

  // CORS first: preflights must be answered before anything else can
  // interfere. Browser clients (the Next portals) depend on this.
  await app.register(cors as never, {
    origin: true,
    credentials: true,
  });
  await app.register(helmet as never);
  await app.register(cookie as never);
  await app.register(multipart as never, {
    limits: { fileSize: 5 * 1024 * 1024, files: 2 }, // 5MB per file
  });

  app.setGlobalPrefix('v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') ?? 4000;
  const host = configService.get<string>('HOST') ?? '0.0.0.0';

  await app.listen(port, host);
}

void bootstrap();