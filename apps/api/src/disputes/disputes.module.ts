import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { DisputesService } from './disputes.service'
import { AdminDisputesController} from './admin-disputes.controller'
import { CustomerDisputesController } from './customer-disputes.controller'
import { AuditModule } from '../audit/audit.module'
@Module({
    imports: [JwtModule.register({}), AuditModule],
    controllers: [ AdminDisputesController, CustomerDisputesController],
    providers: [ DisputesService],
    exports: [ DisputesService]
})

export class DisputesModule{}