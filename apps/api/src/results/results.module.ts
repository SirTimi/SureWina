import { Module } from '@nestjs/common';
import { ResultsService } from './results.service';
import { ResultsController } from './results.controller';
import { StatsService } from './stats.service'
import { StatsController } from './stats.controller'
@Module({
  controllers: [ResultsController, StatsController],
  providers: [ResultsService, StatsService],
  exports: [ResultsService],
})
export class ResultsModule {}