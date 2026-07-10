import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  BadRequestException,
  Req,
  Query
} from '@nestjs/common';
import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { CustomerJwtPayload } from '../auth/auth.types';
import { ClaimsService } from './claims.service';
import { ChooseClaimDto } from './dto/choose-claim.dto';
import { SubmitBankDto, SubmitBvnDto } from './dto/kyc.dto';
import { BookCollectionDto } from './dto/fulfillment.dto';
import type { FastifyRequest } from 'fastify';
@Controller('claims')
@UseGuards(CustomerJwtGuard)
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Get()
  listMine(@CurrentUser() user: CustomerJwtPayload) {
    return this.claimsService.listMine(user.phoneNumber);
  }

  @Get(':claimId')
  getMine(
    @Param('claimId') claimId: string,
    @CurrentUser() user: CustomerJwtPayload,
  ) {
    return this.claimsService.getMine(claimId, user.phoneNumber);
  }

  @Post(':claimId/choose')
  choose(
    @Param('claimId') claimId: string,
    @Body() dto: ChooseClaimDto,
    @CurrentUser() user: CustomerJwtPayload,
  ) {
    return this.claimsService.choose(claimId, user.phoneNumber, dto.path);
  }

  @Post(':claimId/kyc/bvn')
  submitBvn(
    @Param('claimId') claimId: string,
    @Body() dto: SubmitBvnDto,
    @CurrentUser() user: CustomerJwtPayload,
  ) {
    return this.claimsService.submitBvn(claimId, user.phoneNumber, dto.bvn);
  }

  @Post(':claimId/kyc/bank')
  submitBank(
    @Param('claimId') claimId: string,
    @Body() dto: SubmitBankDto,
    @CurrentUser() user: CustomerJwtPayload,
  ) {
    return this.claimsService.submitBank(
      claimId,
      user.phoneNumber,
      dto.accountNumber,
      dto.bankCode,
    );
  }

  @Post(':claimId/kyc/documents')
  async submitDocuments(
    @Param('claimId') claimId: string,
    @CurrentUser() user: CustomerJwtPayload,
    @Req() req: FastifyRequest,
  ) {
    if (!req.isMultipart()) {
      throw new BadRequestException('Expected multipart/form-data');
    }

    const ALLOWED: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'application/pdf': 'pdf',
    };

    const files: { kind: 'idDoc' | 'selfie'; buffer: Buffer; ext: string }[] = [];

    for await (const part of req.parts()) {
      if (part.type !== 'file') continue;
      if (part.fieldname !== 'idDoc' && part.fieldname !== 'selfie') {
        // Drain unknown file fields so the stream completes, then reject.
        await part.toBuffer();
        throw new BadRequestException(
          `Unknown file field "${part.fieldname}" — use idDoc or selfie`,
        );
      }
      const ext = ALLOWED[part.mimetype];
      if (!ext) {
        await part.toBuffer();
        throw new BadRequestException(
          `Unsupported file type ${part.mimetype} — JPEG, PNG or PDF only`,
        );
      }
      files.push({
        kind: part.fieldname,
        buffer: await part.toBuffer(),
        ext,
      });
    }

    return this.claimsService.submitDocuments(claimId, user.phoneNumber, files);
  }

  @Get('collection-points/list')
  listCollectionPoints(@Query('stateCode') stateCode?: string) {
    return this.claimsService.listCollectionPoints(stateCode);
  }

  @Post(':claimId/book-collection')
  bookCollection(
    @Param('claimId') claimId: string,
    @Body() dto: BookCollectionDto, // { collectionPointId: IsString; preferredDate: IsISO8601 }
    @CurrentUser() user: CustomerJwtPayload,
  ) {
    return this.claimsService.bookCollection(claimId, user.phoneNumber, dto.collectionPointId, dto.preferredDate);
  }

  @Post(':claimId/payout/account')
  confirmPayoutAccount(
    @Param('claimId') claimId: string,
    @Body() dto: SubmitBankDto, // reuse from 8.3
    @CurrentUser() user: CustomerJwtPayload,
  ) {
    return this.claimsService.confirmPayoutAccount(claimId, user.phoneNumber, dto.accountNumber, dto.bankCode);
  }
}