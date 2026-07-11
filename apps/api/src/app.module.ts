import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { AgentAuthModule } from './agent-auth/agent-auth.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestContextMiddleware } from './common/request-context/request-context.middleware';
import { RequestContextModule } from './common/request-context/request-context.module';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';
import { DrawsModule } from './draws/draws.module';
import { ResultsModule } from './results/results.module'
import { PaymentsModule } from './payments/payments.module';
import { QueueModule } from './queue/queue.module';
import { TicketsModule } from './tickets/tickets.module';
import { ClaimsModule } from './claims/claims.module';
import {StorageModule} from './storage/storage.module';
import { AgentOpsModule } from './agent-ops/agent-ops.module';
import { AdminOpsModule } from './admin-ops/admin-ops.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      envFilePath: [
        '../../.env.local',
        '../../.env',
        '.env.local',
        '.env',
      ],
    }),
    RequestContextModule,
    DatabaseModule,
    RedisModule,
    AuditModule,
    AuthModule,
    AgentAuthModule,
    AdminAuthModule,
    HealthModule,
    DrawsModule,
    ResultsModule,
    PaymentsModule,
    QueueModule,
    TicketsModule,
    ClaimsModule,
    StorageModule,
    AgentOpsModule,
    AdminOpsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes({
      path: '{*path}',
      method: RequestMethod.ALL,
    });
  }
}