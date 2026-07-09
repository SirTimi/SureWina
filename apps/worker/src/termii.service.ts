import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TermiiService {
  private readonly logger = new Logger(TermiiService.name);

  constructor(private readonly config: ConfigService) {}

  // Sends an SMS via Termii. DEV MODE: if no API key is configured, logs the
  // message instead of sending — keeps local dev fully testable without an
  // account. Throws on real send failure so BullMQ retries with backoff.
  async sendSms(to: string, message: string): Promise<void> {
    const apiKey = this.config.get<string>('TERMII_API_KEY');
    const senderId = this.config.get<string>('TERMII_SENDER_ID') ?? 'Surewina';
    const baseUrl =
      this.config.get<string>('TERMII_BASE_URL') ?? 'https://api.ng.termii.com';

    if (!apiKey) {
      this.logger.log(`[DEV SMS] to=${to} :: ${message}`);
      return;
    }

    const res = await fetch(`${baseUrl}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        to,
        from: senderId,
        sms: message,
        type: 'plain',
        channel: 'generic',
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Termii send failed (${res.status}): ${body.slice(0, 200)}`);
    }

    this.logger.log(`SMS sent to ${to}`);
  }
}