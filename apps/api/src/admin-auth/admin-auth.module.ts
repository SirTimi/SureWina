import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRoleGuard } from './guards/admin-role.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminJwtGuard, AdminRoleGuard],
  exports: [AdminAuthService, AdminJwtGuard, AdminRoleGuard],
})
export class AdminAuthModule {}