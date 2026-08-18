import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { AdminRole } from '@prisma/client';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { DepartmentOnly } from '../admin-auth/decorators/department-only.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { PrismaService } from '../database/prisma.service';
import { RedemptionService } from './redemption.service';

class RedeemDto {
  @IsString() @Length(6, 32) ticketRef!: string;
  @IsString() @Length(6, 6) code!: string;
}

// Collection point counter. Restricted to support staff by department rather
// than by tier — handing over a prize is the job, not a level of seniority,
// and a finance officer with super clearance has no business doing it.
@Controller('collection-point')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.SUPPORT_AGENT)
@DepartmentOnly()
export class RedemptionController {
  constructor(
    private readonly redemption: RedemptionService,
    private readonly prisma: PrismaService,
  ) {}

  private async pointOf(adminUserId: string): Promise<string | null> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { adminUserId },
      select: { collectionPointId: true },
    });
    return admin?.collectionPointId ?? null;
  }

  @Post('verify')
  async verify(@CurrentAdmin() a: AdminJwtPayload, @Body() dto: RedeemDto) {
    return this.redemption.verify({
      adminUserId: a.sub,
      pointId: await this.pointOf(a.sub),
      ticketRef: dto.ticketRef.trim().toUpperCase(),
      code: dto.code.trim(),
    });
  }

  @Post('confirm')
  async confirm(@CurrentAdmin() a: AdminJwtPayload, @Body() dto: RedeemDto) {
    return this.redemption.confirmHandover({
      adminUserId: a.sub,
      pointId: await this.pointOf(a.sub),
      ticketRef: dto.ticketRef.trim().toUpperCase(),
      code: dto.code.trim(),
    });
  }
}