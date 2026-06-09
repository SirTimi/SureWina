import { AuditActorType, AuditSeverity } from '@prisma/client';

export type AuditActor = {
  type: AuditActorType;
  id?: string;
};

export type AuditResource = {
  type: string;
  id: string;
};

export type WriteAuditLogInput = {
  severity?: AuditSeverity;
  actor: AuditActor;
  action: string;
  resource: AuditResource;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  signature?: string;
};