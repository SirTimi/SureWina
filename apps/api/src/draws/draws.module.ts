import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DrawsService } from './draws.service';
import { DrawsController } from './draws.controller';
import { AdminDrawsController } from './admin-draws.controller';

@Module({
  // JwtModule is needed because AdminJwtGuard injects JwtService.
  imports: [JwtModule.register({})],
  controllers: [DrawsController, AdminDrawsController],
  providers: [DrawsService],
  exports: [DrawsService],
})
export class DrawsModule {}