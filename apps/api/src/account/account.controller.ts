import {
  Body, Controller, Delete, Get, Patch, Post, Put, UseGuards,
} from '@nestjs/common';
import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { CustomerJwtPayload } from '../auth/auth.types';
import { AccountService } from './account.service';
import {
  SetBankDto, SetSpendLimitDto, TakeBreakDto,
  UpdateNotificationsDto, UpdateProfileDto,
} from './dto/account.dto';

@Controller('account')
@UseGuards(CustomerJwtGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('me')
  me(@CurrentUser() u: CustomerJwtPayload) {
    return this.account.me(u.sub);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() u: CustomerJwtPayload, @Body() dto: UpdateProfileDto) {
    return this.account.updateProfile(u.sub, dto);
  }

  @Patch('notifications')
  updateNotifications(@CurrentUser() u: CustomerJwtPayload, @Body() dto: UpdateNotificationsDto) {
    return this.account.updateNotifications(u.sub, dto);
  }

  @Put('spend-limit')
  setSpendLimit(@CurrentUser() u: CustomerJwtPayload, @Body() dto: SetSpendLimitDto) {
    return this.account.setSpendLimit(u.sub, dto.period, dto.capNgn);
  }

  @Delete('spend-limit')
  removeSpendLimit(@CurrentUser() u: CustomerJwtPayload) {
    return this.account.removeSpendLimit(u.sub);
  }

  @Post('break')
  takeBreak(@CurrentUser() u: CustomerJwtPayload, @Body() dto: TakeBreakDto) {
    return this.account.takeBreak(u.sub, dto.days);
  }

  @Put('bank')
  setBank(@CurrentUser() u: CustomerJwtPayload, @Body() dto: SetBankDto) {
    return this.account.setBank(u.sub, dto.accountNumber, dto.bankCode);
  }
}