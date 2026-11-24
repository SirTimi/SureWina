import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  // JwtModule is needed because AdminJwtGuard injects JwtService.
  imports: [JwtModule.register({})],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
