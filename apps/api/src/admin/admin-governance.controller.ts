import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AdminPrincipal } from '@surewina/types';
import { CurrentAdmin } from './permissions/admin-principal.decorator.js';
import { RequireAdminAction } from './permissions/admin-permissions.decorator.js';
import { AdminPermissionGuard } from './permissions/admin-permission.guard.js';

type AdminRequestBody = {
  initiatedByAdminUserId?: string;
  createdByAdminUserId?: string;
  requestedByAdminUserId?: string;
  note?: string;
};

@Controller('admin/governance')
@UseGuards(AdminPermissionGuard)
export class AdminGovernanceController {
  @Get('agents')
  @RequireAdminAction('VIEW_AGENTS')
  viewAgents(@CurrentAdmin() admin: AdminPrincipal) {
    return {
      ok: true,
      actor: admin.email,
      action: 'VIEW_AGENTS',
      message: 'Agent list access granted.',
    };
  }

  @Post('agents/profile-requests')
  @RequireAdminAction('INITIATE_AGENT_PROFILING')
  initiateAgentProfiling(@CurrentAdmin() admin: AdminPrincipal, @Body() body: AdminRequestBody) {
    return {
      ok: true,
      actor: admin.email,
      action: 'INITIATE_AGENT_PROFILING',
      status: 'PENDING_REVIEW',
      requestedByAdminUserId: body.requestedByAdminUserId ?? admin.adminUserId,
    };
  }

  @Post('agents/onboarding/:applicationId/approve')
  @RequireAdminAction('APPROVE_AGENT_ONBOARDING')
  approveAgentOnboarding(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('applicationId') applicationId: string,
    @Body() body: AdminRequestBody,
  ) {
    return {
      ok: true,
      actor: admin.email,
      action: 'APPROVE_AGENT_ONBOARDING',
      applicationId,
      initiatedByAdminUserId: body.initiatedByAdminUserId ?? null,
    };
  }

  @Post('draws/setup-requests')
  @RequireAdminAction('CREATE_DRAW_SETUP_REQUEST')
  createDrawSetupRequest(@CurrentAdmin() admin: AdminPrincipal, @Body() body: AdminRequestBody) {
    return {
      ok: true,
      actor: admin.email,
      action: 'CREATE_DRAW_SETUP_REQUEST',
      status: 'PENDING_APPROVAL',
      requestedByAdminUserId: body.requestedByAdminUserId ?? admin.adminUserId,
    };
  }

  @Post('draws/setup-requests/:requestId/approve')
  @RequireAdminAction('APPROVE_DRAW_SETUP')
  approveDrawSetup(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('requestId') requestId: string,
    @Body() body: AdminRequestBody,
  ) {
    return {
      ok: true,
      actor: admin.email,
      action: 'APPROVE_DRAW_SETUP',
      requestId,
      initiatedByAdminUserId: body.initiatedByAdminUserId ?? null,
    };
  }

  @Post('draws/ticket-price-change')
  @RequireAdminAction('CHANGE_TICKET_PRICE')
  changeTicketPrice(@CurrentAdmin() admin: AdminPrincipal, @Body() body: AdminRequestBody) {
    return {
      ok: true,
      actor: admin.email,
      action: 'CHANGE_TICKET_PRICE',
      status: 'AUTHORIZED',
      initiatedByAdminUserId: body.initiatedByAdminUserId ?? null,
    };
  }

  @Post('draws/formula-change')
  @RequireAdminAction('CHANGE_DRAW_FORMULA')
  changeDrawFormula(@CurrentAdmin() admin: AdminPrincipal, @Body() body: AdminRequestBody) {
    return {
      ok: true,
      actor: admin.email,
      action: 'CHANGE_DRAW_FORMULA',
      status: 'AUTHORIZED',
      initiatedByAdminUserId: body.initiatedByAdminUserId ?? null,
    };
  }

  @Get('audit-logs')
  @RequireAdminAction('VIEW_AUDIT_LOGS')
  viewAuditLogs(@CurrentAdmin() admin: AdminPrincipal) {
    return {
      ok: true,
      actor: admin.email,
      action: 'VIEW_AUDIT_LOGS',
      message: 'Audit log access granted.',
    };
  }

  @Post('admins')
  @RequireAdminAction('MANAGE_ADMINS')
  createAdmin(@CurrentAdmin() admin: AdminPrincipal, @Body() body: AdminRequestBody) {
    return {
      ok: true,
      actor: admin.email,
      action: 'MANAGE_ADMINS',
      status: 'PENDING_APPROVAL',
      createdByAdminUserId: body.createdByAdminUserId ?? admin.adminUserId,
    };
  }
}
