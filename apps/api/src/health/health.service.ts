import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

type DependencyStatus = {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
};

@Injectable()
export class HealthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  getHealth() {
    return {
      status: 'ok',
      service: 'surewina-api',
      timestamp: new Date().toISOString(),
    };
  }

  async getDeepHealth() {
    const [database, redis] = await Promise.all([
      this.checkDependency('database', () => this.prismaService.ping()),
      this.checkDependency('redis', () => this.redisService.ping()),
    ]);

    const isHealthy = database.status === 'up' && redis.status === 'up';

    return {
      status: isHealthy ? 'ok' : 'degraded',
      service: 'surewina-api',
      timestamp: new Date().toISOString(),
      dependencies: {
        database,
        redis,
      },
    };
  }

  private async checkDependency(
    _name: string,
    check: () => Promise<boolean>,
  ): Promise<DependencyStatus> {
    const startedAt = Date.now();

    try {
      const result = await check();

      return {
        status: result ? 'up' : 'down',
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}