import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { EngineKeysService } from './engine-keys.service';
import { SeedCommitService } from './seed-commit.service';
import { LifecycleService } from './lifecycle.service';
import { ExecutionService } from './execution.service';
import { WinnerQueueService } from './winner-queue.service';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
  ],
  providers: [
    PrismaService, 
    EngineKeysService, 
    SeedCommitService, 
    LifecycleService,
    ExecutionService,
    WinnerQueueService,
],
})
export class AppModule {}