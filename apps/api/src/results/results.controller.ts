import { Controller, Get, Param, Query } from '@nestjs/common';
import { ResultsService } from './results.service';
import { ListResultsQueryDto } from './dto/list-results-query.dto';

@Controller('results')
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Get()
  listPast(@Query() query: ListResultsQueryDto) {
    return this.resultsService.listPast(query);
  }

  @Get(':drawCode')
  getByDrawCode(@Param('drawCode') drawCode: string) {
    return this.resultsService.getByDrawCode(drawCode);
  }
}