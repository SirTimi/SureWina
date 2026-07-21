import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
  Get,
  Query
} from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { DrawsService } from './draws.service';
import { CreateDrawDto } from './dto/create-draw.dto';
import { UpdateDrawDto } from './dto/update-draw.dto';
import { DrawStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator'


class ListDrawsQueryDto {
  @IsOptional()
  @IsEnum(DrawStatus)
  status?: DrawStatus;
}

@Controller('admin/draws')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.OPERATOR)
export class AdminDrawsController {
  constructor(private readonly drawsService: DrawsService) {}

  @Get()
  list(@Query() q: ListDrawsQueryDto) {
    return this.drawsService.listForAdmin(q.status);
  }

  @Get(':drawId')
  detail(@Param('drawId') drawId: string) {
    return this.drawsService.detailForAdmin(drawId);
  }

  @Get(':drawId/pre-checks')
  preChecks(@Param('drawId') drawId: string) {
    return this.drawsService.preChecks(drawId);
  }

  @Post()
  create(@Body() dto: CreateDrawDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.drawsService.create(dto, admin.sub);
  }

  @Patch(':drawId')
  update(
    @Param('drawId') drawId: string,
    @Body() dto: UpdateDrawDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.drawsService.update(drawId, dto, admin.sub);
  }

  @Post(':drawId/cancel')
  cancel(
    @Param('drawId') drawId: string,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.drawsService.cancel(drawId, admin.sub);
  }

  @Get('seeds/list')
  seeds(@Query() q: ListDrawsQueryDto) {
    return this.drawsService.seedRegistry(q.status);
  }
}