import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { V2nSmsService } from './v2n-sms.service';
import { NotificationsWorker } from './notifications.worker';
import { ClaimsSweepService } from './claims-sweep.service';
import {CommissionSweepService} from './commission-sweep.service';
import {RemittanceSweepService} from './remittance-sweep.service';
import { DrawSchedulerService } from './draw-scheduler.service'
import { RemittanceDeadlineService } from './remittance-deadline.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
  ],
  providers: [PrismaService, V2nSmsService, NotificationsWorker, ClaimsSweepService, CommissionSweepService, RemittanceSweepService, DrawSchedulerService, RemittanceDeadlineService],
})
export class AppModule {}