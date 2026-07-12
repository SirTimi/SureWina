import {
    Controller,
    Get
} from '@nestjs/common'
import {StatsService} from './stats.service'

@Controller('stats')
export class StatsController {
    constructor(private readonly stats: StatsService){}

    @Get('recent')
    recent(){
        return this.stats.recent();
    }
}
