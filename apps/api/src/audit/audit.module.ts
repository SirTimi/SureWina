import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditCheckpointService } from './audit-checkpoint.service'
@Global()
@Module({
  providers: [AuditService, AuditCheckpointService],
  exports: [AuditService, AuditCheckpointService],
})
export class AuditModule {}