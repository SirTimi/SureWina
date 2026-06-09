import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST') ?? 'localhost';
    const port = this.configService.get<number>('REDIS_PORT') ?? 6379;
    const password = this.configService.get<string>('REDIS_PASSWORD') || undefined;
    const db = this.configService.get<number>('REDIS_DB') ?? 0;

    this.client = new Redis({
      host,
      port,
      password,
      db,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });

    this.client.on('error', (error) => {
      this.logger.error(`Redis error: ${error.message}`);
    });

    void this.client.connect();
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Redis disconnected');
    }
  }

  getClient() {
    return this.client;
  }

  async ping() {
    const response = await this.client.ping();
    return response === 'PONG';
  }
}