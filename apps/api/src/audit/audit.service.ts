import { Injectable, Logger } from '@nestjs/common';
import { AuditActorType, AuditSeverity } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RequestContextService } from '../common/request-context/request-context.service';
import { WriteAuditLogInput } from './audit.types';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async write(input: WriteAuditLogInput) {
    const requestId = this.requestContextService.getRequestId();

    const metadata = {
      ...(input.metadata ?? {}),
      requestId: requestId ?? null,
    };

    try {
      return await this.prismaService.auditLog.create({
        data: {
          severity: input.severity ?? AuditSeverity.INFO,
          actorType: input.actor.type,
          actorId: input.actor.id,
          action: input.action,
          resourceType: input.resource.type,
          resourceId: input.resource.id,
          metadata,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          signature: input.signature,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log for action ${input.action}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw error;
    }
  }

  async writeSystemEvent(action: string, metadata?: Record<string, unknown>) {
    return this.write({
      actor: {
        type: AuditActorType.SYSTEM,
      },
      action,
      resource: {
        type: 'System',
        id: 'surewina-api',
      },
      metadata,
    });
  }
}