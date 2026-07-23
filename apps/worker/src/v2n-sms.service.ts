import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

const V2N_BASE = 'https://v2nmobile.com/api';

@Injectable()
export class V2nSmsService {
  private readonly logger = new Logger(V2nSmsService.name);

  constructor(private readonly config: ConfigService) {}

  // Sends an SMS via V2N Mobile (VAS2Nets gateway). DEV MODE: with no
  // credentials, logs instead of sending — local dev stays testable and
  // never spends wallet balance. Throws on real failure so BullMQ retries.
  async sendSms(to: string, message: string, messageId?: string): Promise<void> {
    const user = this.config.get<string>('V2N_USERNAME');
    const pass = this.config.get<string>('V2N_PASSWORD');
    const sender = this.config.get<string>('V2N_SENDER_ID') ?? 'SureWina';

    if (!user || !pass) {
      this.logger.log(`[DEV SMS] to=${to} :: ${message}`);
      return;
    }

    const auth = Buffer.from(`${user}:${pass}`).toString('base64');
    const id = messageId ?? randomUUID();

    const res = await fetch(`${V2N_BASE}/push`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sms: [
          {
            id,
            receiver: to.replace(/\D/g, ''), // V2N wants msisdn without '+'
            sender,
            message,
            type: 'sms',
          },
        ],
      }),
    });

    if (res.status === 412) {
      // Prepaid wallet empty. Throwing lets BullMQ retry — by the time the
      // backoff elapses the wallet may be topped up.
      throw new Error('V2N wallet balance exhausted (412)');
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`V2N send failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const result = (await res.json()) as {
      total: number;
      accepted: number;
      description?: string;
    };

    // 200 with accepted:0 is a silent drop — treat as failure so it retries.
    if (!result.accepted) {
      throw new Error(
        `V2N accepted 0 of ${result.total}: ${result.description ?? 'no description'}`,
      );
    }

    this.logger.log(`SMS sent to ${to} (${result.accepted}/${result.total})`);
  }
}