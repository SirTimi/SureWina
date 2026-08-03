import { Global, Module } from '@nestjs/common';
import { V2nSmsProvider } from './v2n-sms.provider';
import { ZohoEmailProvider } from './zoho-email.provider'
@Global()
@Module({
  providers: [V2nSmsProvider, ZohoEmailProvider],
  exports: [V2nSmsProvider, ZohoEmailProvider],
})
export class NotificationsModule {}