import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { CustomerAdminService } from './customer-admin.service';

const E164 = /^\+[1-9]\d{7,14}$/;

class PhoneQueryDto {
  @Matches(E164, { message: 'phoneNumber must be E.164 (e.g. +2348012345678)' })
  phoneNumber!: string;
}

class BlockPhoneDto {
  @Matches(E164, { message: 'phoneNumber must be E.164 (e.g. +2348012345678)' })
  phoneNumber!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}

@Controller('admin/customers')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.OPERATOR)
export class CustomerAdminController {
  constructor(private readonly customerAdmin: CustomerAdminService) {}

  @Get('detail')
  detail(@Query() query: PhoneQueryDto) {
    return this.customerAdmin.detail(query.phoneNumber);
  }

  @Post('block')
  block(@Body() dto: BlockPhoneDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.customerAdmin.block(dto.phoneNumber, dto.reason, admin.sub);
  }

  @Post('unblock')
  unblock(@Body() dto: PhoneQueryDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.customerAdmin.unblock(dto.phoneNumber, admin.sub);
  }
}