import { Global, Module } from '@nestjs/common';
import { NotificationQueueService } from './notification-queue.service';

@Global()
@Module({
  providers: [NotificationQueueService],
  exports: [NotificationQueueService],
})
export class QueueModule {}