import { Global, Module } from '@nestjs/common';
import { V2nSmsProvider } from './v2n-sms.provider';

@Global()
@Module({
  providers: [V2nSmsProvider],
  exports: [V2nSmsProvider],
})
export class NotificationsModule {}