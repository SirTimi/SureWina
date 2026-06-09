import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../common/request-context/request-context.service';
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
    private readonly auditService: AuditService,
    private readonly requestContextService: RequestContextService,
  ) {}

  getHealth() {
    return {
      status: 'ok',
      service: 'surewina-api',
      requestId: this.requestContextService.getRequestId() ?? null,
      timestamp: new Date().toISOString(),
    };
  }

  async getDeepHealth() {
    const [database, redis] = await Promise.all([
      this.checkDependency(() => this.prismaService.ping()),
      this.checkDependency(() => this.redisService.ping()),
    ]);

    const isHealthy = database.status === 'up' && redis.status === 'up';

    await this.auditService.writeSystemEvent('HEALTH_DEEP_CHECKED', {
      status: isHealthy ? 'ok' : 'degraded',
      databaseStatus: database.status,
      redisStatus: redis.status,
    });

    return {
      status: isHealthy ? 'ok' : 'degraded',
      service: 'surewina-api',
      requestId: this.requestContextService.getRequestId() ?? null,
      timestamp: new Date().toISOString(),
      dependencies: {
        database,
        redis,
      },
    };
  }

  private async checkDependency(
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