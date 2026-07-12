import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { TermiiService } from './termii.service';
import { NotificationsWorker } from './notifications.worker';
import { ClaimsSweepService } from './claims-sweep.service';
import {CommissionSweepService} from './commission-sweep.service';
import {RemittanceSweepService} from './remittance-sweep.service';
import { DrawSchedulerService } from './draw-scheduler.service'
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
  ],
  providers: [PrismaService, TermiiService, NotificationsWorker, ClaimsSweepService, CommissionSweepService, RemittanceSweepService, DrawSchedulerService],
})
export class AppModule {}