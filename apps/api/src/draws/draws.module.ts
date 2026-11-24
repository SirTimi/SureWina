import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DrawsService } from './draws.service';
import { DrawsController } from './draws.controller';
import { AdminDrawsController } from './admin-draws.controller';
import { DrawApprovalsController } from './draw-approvals.controller';
import { DrawReleaseService } from './draw-release.service';

@Module({
  // JwtModule is needed because AdminJwtGuard injects JwtService.
  imports: [JwtModule.register({})],
  controllers: [DrawsController, AdminDrawsController, DrawApprovalsController],
  providers: [DrawsService, DrawReleaseService],
  exports: [DrawsService, DrawReleaseService],
})
export class DrawsModule {}
