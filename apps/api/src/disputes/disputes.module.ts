import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { DisputesService } from './disputes.service'

@Module({
    imports: [JwtModule.register({})],
    providers: [ DisputesService],
    exports: [ DisputesService]
})

export class DisputesModule{}