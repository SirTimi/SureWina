import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtPayload } from './admin-auth.types';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CurrentAdmin } from './guards/current-admin.decorator';
import { AdminJwtGuard } from './guards/admin-jwt.guard';

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
}