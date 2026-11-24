import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminRole, AdminTier, DrawType, PoolRevenueBasis } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { MinTier } from '../admin-auth/decorators/min-tier.decorator';
import { PrizeTierDto } from '../draws/dto/prize-tier.dto';
import { ProductsService } from './products.service';

class ProductTermsDto {
  @IsString() @Length(2, 60) name!: string;
  @IsString() @Length(2, 40) ticketLabel!: string;
  @IsInt() @Min(1) ticketPriceNgn!: number;
  @IsString() @Length(3, 200) prizeDescription!: string;

  // Daily products only.
  @IsOptional() @IsInt() @Min(1) @Max(10000) poolPayoutBp?: number;
  @IsOptional() @IsInt() @Min(0) poolMinimumNgn?: number;
  @IsOptional() @IsEnum(PoolRevenueBasis) poolRevenueBasis?: PoolRevenueBasis;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => PrizeTierDto)
  tiers!: PrizeTierDto[];
}

class CreateProductDto extends ProductTermsDto {
  @IsString() @Length(2, 12) code!: string;
  @IsIn([DrawType.DAILY_STANDARD, DrawType.SATURDAY_JACKPOT]) kind!: DrawType;
}

class RejectDto {
  @IsString() @Length(4, 500) note!: string;
}

class ActiveDto {
  @IsBoolean() active!: boolean;
}

class ListQueryDto {
  @IsOptional() @IsIn(['true', 'false']) includeInactive?: string;
}

// Products: who may propose and who may approve match the draw schedules.
@Controller('admin/products')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.OPERATOR)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() q: ListQueryDto) {
    return this.products.list(q.includeInactive !== 'false');
  }

  @Get(':productId')
  get(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.products.get(productId);
  }

  @MinTier(AdminTier.INTERMEDIATE)
  @Post()
  create(@Body() dto: CreateProductDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.products.create(normalise(dto), admin.sub);
  }

  @MinTier(AdminTier.INTERMEDIATE)
  @Post(':productId/changes')
  propose(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: ProductTermsDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.products.proposeChange(productId, normalise(dto), admin.sub);
  }

  @MinTier(AdminTier.SUPER)
  @Post(':productId/approve')
  approve(@Param('productId', ParseUUIDPipe) productId: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.products.approve(productId, admin.sub);
  }

  @MinTier(AdminTier.SUPER)
  @Post(':productId/reject')
  reject(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: RejectDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.products.reject(productId, dto.note, admin.sub);
  }

  @MinTier(AdminTier.SUPER)
  @Patch(':productId/active')
  setActive(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: ActiveDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.products.setActive(productId, dto.active, admin.sub);
  }
}

function normalise<T extends ProductTermsDto>(dto: T) {
  return {
    ...dto,
    poolPayoutBp: dto.poolPayoutBp ?? null,
    poolMinimumNgn: dto.poolMinimumNgn ?? null,
    poolRevenueBasis: dto.poolRevenueBasis ?? null,
    tiers: dto.tiers.map((t) => ({ ...t, allocationBp: t.allocationBp ?? null, winnerCount: t.winnerCount ?? null })),
  };
}
