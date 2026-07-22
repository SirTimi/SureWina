import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DisputeCategory,
  DisputeEventType,
  DisputeRaisedByType,
  DisputeStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type Actor = { type: DisputeRaisedByType; id: string };

// Which transitions are legal. Terminal states go nowhere.
const ALLOWED: Record<DisputeStatus, DisputeStatus[]> = {
  OPEN: [DisputeStatus.UNDER_REVIEW, DisputeStatus.REJECTED],
  UNDER_REVIEW: [DisputeStatus.ESCALATED, DisputeStatus.RESOLVED, DisputeStatus.REJECTED],
  ESCALATED: [DisputeStatus.UNDER_REVIEW, DisputeStatus.RESOLVED, DisputeStatus.REJECTED],
  RESOLVED: [],
  REJECTED: [],
};

@Injectable()
export class DisputesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    category: DisputeCategory;
    subject: string;
    customerPhone: string;
    raisedBy: Actor;
    ticketRef?: string;
    paymentTxnId?: string;
    claimId?: string;
    agentCode?: string;
  }) {
    const dispute = await this.prisma.$transaction(async (tx) => {
      const created = await tx.dispute.create({
        data: {
          disputeRef: 'PENDING',
          category: input.category,
          subject: input.subject,
          customerPhone: input.customerPhone,
          raisedByType: input.raisedBy.type,
          raisedByAdminId:
            input.raisedBy.type === DisputeRaisedByType.ADMIN ? input.raisedBy.id : null,
          ticketRef: input.ticketRef ?? null,
          paymentTxnId: input.paymentTxnId ?? null,
          claimId: input.claimId ?? null,
          agentCode: input.agentCode ?? null,
        },
      });

      const disputeRef = `DSP-${new Date().getUTCFullYear()}-${String(created.disputeSeq).padStart(6, '0')}`;
      const withRef = await tx.dispute.update({
        where: { disputeId: created.disputeId },
        data: { disputeRef },
      });

      await tx.disputeEvent.create({
        data: {
          disputeId: created.disputeId,
          type: DisputeEventType.CREATED,
          actorType: input.raisedBy.type,
          actorId: input.raisedBy.id,
          note: input.subject,
          toStatus: DisputeStatus.OPEN,
        },
      });

      return withRef;
    });

    return dispute;
  }

  async addNote(disputeId: string, actor: Actor, note: string) {
    const dispute = await this.mustExist(disputeId);
    await this.prisma.disputeEvent.create({
      data: {
        disputeId,
        type: DisputeEventType.NOTE_ADDED,
        actorType: actor.type,
        actorId: actor.id,
        note,
      },
    });
    return this.detail(dispute.disputeId);
  }

  async assign(disputeId: string, actor: Actor, assigneeAdminId: string) {
    await this.mustExist(disputeId);
    await this.prisma.$transaction([
      this.prisma.dispute.update({
        where: { disputeId },
        data: { assignedToAdminId: assigneeAdminId },
      }),
      this.prisma.disputeEvent.create({
        data: {
          disputeId,
          type: DisputeEventType.ASSIGNED,
          actorType: actor.type,
          actorId: actor.id,
          note: `Assigned to ${assigneeAdminId}`,
        },
      }),
    ]);
    return this.detail(disputeId);
  }

  // The core state machine. Every move is guarded and leaves an event.
  async transition(
    disputeId: string,
    actor: Actor,
    to: DisputeStatus,
    note?: string,
  ) {
    const dispute = await this.mustExist(disputeId);

    if (!ALLOWED[dispute.status].includes(to)) {
      throw new ConflictException(
        `Cannot move a dispute from ${dispute.status} to ${to}`,
      );
    }

    const isResolution = to === DisputeStatus.RESOLVED || to === DisputeStatus.REJECTED;
    if (isResolution && (!note || note.trim().length < 4)) {
      throw new ConflictException('A resolution or rejection requires a note');
    }

    await this.prisma.$transaction([
      this.prisma.dispute.update({
        where: { disputeId },
        data: {
          status: to,
          ...(isResolution
            ? {
                resolutionNote: note,
                resolvedByAdminId: actor.id,
                resolvedAt: new Date(),
              }
            : {}),
        },
      }),
      this.prisma.disputeEvent.create({
        data: {
          disputeId,
          type: isResolution
            ? DisputeEventType.RESOLUTION_RECORDED
            : DisputeEventType.STATUS_CHANGED,
          actorType: actor.type,
          actorId: actor.id,
          note: note ?? null,
          fromStatus: dispute.status,
          toStatus: to,
        },
      }),
    ]);

    return this.detail(disputeId);
  }

  async list(filters: { status?: DisputeStatus; customerPhone?: string }) {
    const where: Prisma.DisputeWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.customerPhone
        ? { customerPhone: { endsWith: filters.customerPhone.replace(/[^\d+]/g, '') } }
        : {}),
    };
    const rows = await this.prisma.dispute.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: { _count: { select: { events: true } } },
    });
    return {
      disputes: rows.map((d) => ({
        disputeId: d.disputeId,
        disputeRef: d.disputeRef,
        category: d.category,
        status: d.status,
        customerPhone: d.customerPhone,
        subject: d.subject,
        raisedByType: d.raisedByType,
        assignedToAdminId: d.assignedToAdminId,
        eventCount: d._count.events,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
    };
  }

  async detail(disputeId: string) {
    const d = await this.prisma.dispute.findUnique({
      where: { disputeId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!d) throw new NotFoundException('Dispute not found');

    return {
      disputeId: d.disputeId,
      disputeRef: d.disputeRef,
      category: d.category,
      status: d.status,
      raisedByType: d.raisedByType,
      raisedByAdminId: d.raisedByAdminId,
      customerPhone: d.customerPhone,
      subject: d.subject,
      links: {
        ticketRef: d.ticketRef,
        paymentTxnId: d.paymentTxnId,
        claimId: d.claimId,
        agentCode: d.agentCode,
      },
      assignedToAdminId: d.assignedToAdminId,
      resolutionNote: d.resolutionNote,
      resolvedByAdminId: d.resolvedByAdminId,
      resolvedAt: d.resolvedAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      events: d.events.map((e) => ({
        eventId: e.eventId,
        type: e.type,
        actorType: e.actorType,
        actorId: e.actorId,
        note: e.note,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  // For the customer portal: only this customer's disputes.
  async listForCustomer(customerPhone: string) {
    const rows = await this.prisma.dispute.findMany({
      where: { customerPhone },
      orderBy: { createdAt: 'desc' },
    });
    return {
      disputes: rows.map((d) => ({
        disputeRef: d.disputeRef,
        category: d.category,
        status: d.status,
        subject: d.subject,
        createdAt: d.createdAt.toISOString(),
        resolutionNote: d.status === 'RESOLVED' || d.status === 'REJECTED' ? d.resolutionNote : null,
      })),
    };
  }

  private async mustExist(disputeId: string) {
    const d = await this.prisma.dispute.findUnique({ where: { disputeId } });
    if (!d) throw new NotFoundException('Dispute not found');
    return d;
  }
}