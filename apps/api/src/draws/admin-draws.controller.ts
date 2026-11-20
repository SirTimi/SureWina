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
import { DrawPrizeModel, DrawStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PrizeTierDto } from './dto/prize-tier.dto';

class PrizePreviewDto {
  @IsEnum(DrawPrizeModel)
  prizeModel!: DrawPrizeModel;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  poolPayoutBp?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  poolMinimumNgn?: number;

  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => PrizeTierDto)
  tiers!: PrizeTierDto[];

  // Revenue levels to work the plan out at.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsInt({ each: true })
  @Min(0, { each: true })
  revenuesNgn?: number[];

  // Adds the plan at this draw's sales so far.
  @IsOptional()
  @IsUUID()
  drawId?: string;
}


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

  // Declared before ':drawId' routes. Saves nothing.
  @Post('prize-preview')
  prizePreview(@Body() dto: PrizePreviewDto) {
    return this.drawsService.prizePreview(dto);
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