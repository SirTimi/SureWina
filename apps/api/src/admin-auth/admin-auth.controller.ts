import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtPayload } from './admin-auth.types';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CurrentAdmin } from './guards/current-admin.decorator';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { IsString, Length } from 'class-validator';

class ActivateMfaDto {
  @IsString() @Length(6, 6) token!: string;
}

class VerifyMfaDto {
  @IsString() challengeId!: string;
  @IsString() @Length(6, 11) code!: string;   // 6-digit TOTP or XXXXX-XXXXX backup
}

class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @Length(10,200) newPassword!: string;
}

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto);
  }

  @Get('me')
  @UseGuards(AdminJwtGuard)
  getMe(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminAuthService.getMe(admin.sub);
  }

  @UseGuards(AdminJwtGuard)
  @Post('mfa/setup')
  setupMfa(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminAuthService.setupMfa(admin.sub);
  }

  @UseGuards(AdminJwtGuard)
  @Post('mfa/activate')
  activateMfa(@CurrentAdmin() admin: AdminJwtPayload, @Body() dto: ActivateMfaDto) {
    return this.adminAuthService.activateMfa(admin.sub, dto.token);
  }

  @Post('mfa/verify')
  verifyMfa(@Body() dto: VerifyMfaDto) {
    return this.adminAuthService.verifyMfa(dto.challengeId, dto.code);
  }

  @UseGuards(AdminJwtGuard)
  @Post('change-password')
  changePassword(
    @CurrentAdmin() admin: AdminJwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.adminAuthService.changePassword(
      admin.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}