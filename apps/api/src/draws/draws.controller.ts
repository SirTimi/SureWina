import { Controller, Get, Param } from '@nestjs/common';
import { DrawsService } from './draws.service';

@Controller('draws')
export class DrawsController {
  constructor(private readonly drawsService: DrawsService) {}

  @Get('active')
  listActive() {
    return this.drawsService.listActive();
  }

  @Get(':drawCode')
  getByCode(@Param('drawCode') drawCode: string) {
    return this.drawsService.getByCode(drawCode);
  }
}