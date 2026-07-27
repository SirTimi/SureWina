import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service'
import { Redis } from 'ioredis';
export type SmsSendResult = {
  sent: boolean;
  devMode: boolean;
  accepted?: number;
  rejected?: number;
  reason?: string;
};

const V2N_BASE = 'https://v2nmobile.com/api';

// V2N Mobile (VAS2Nets gateway). Basic auth, prepaid wallet, batch payload.
// Dev mode (no credentials) logs instead of sending so local and preview
// environments never spend real balance.
@Injectable()
export class V2nSmsProvider {
  private readonly logger = new Logger(V2nSmsProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService
  ) {}

  private credentials(): { auth: string; sender: string } | null {
    const user = this.config.get<string>('V2N_USERNAME');
    const pass = this.config.get<string>('V2N_PASSWORD');
    if (!user || !pass) return null;
    return {
      auth: Buffer.from(`${user}:${pass}`).toString('base64'),
      sender: this.config.get<string>('V2N_SENDER_ID') ?? 'SureWina',
    };
  }

  // V2N expects msisdn without '+': +2349039070031 → 2349039070031
  private toMsisdn(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private dailyCapKey(): string {
    return `sms:sent:${new Date().toISOString().slice(0, 10)}`;
  }

  async send(to: string, message: string, messageId?: string): Promise<SmsSendResult> {
    const creds = this.credentials();

    if (!creds) {
      this.logger.warn(`[DEV SMS] to ${to}: ${message}`);
      return { sent: true, devMode: true };
    }

    const dailyCap = Number(this.config.get('SMS_DAILY_CAP') ?? 300);
    const key = this.dailyCapKey();
    const sentToday = await this.redis.increment(key);
    if (sentToday === 1) await this.redis.expire(key, 172_800); // 48h, self-cleaning

    if (sentToday > dailyCap) {
      this.logger.error(
        `SMS daily cap reached (${sentToday}/${dailyCap}) — refusing to send to ${to.slice(-4)}`,
      );
      return { sent: false, devMode: false, reason: 'DAILY_CAP_REACHED' };
    }

    // id must be unique per message — V2N rejects duplicates outright.
    const id = messageId ?? randomUUID();

    try {
      const res = await fetch(`${V2N_BASE}/push`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${creds.auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sms: [
            {
              id,
              receiver: this.toMsisdn(to),
              sender: creds.sender,
              message,
              type: 'sms',
            },
          ],
        }),
      });

      if (res.status === 401) {
        this.logger.error('V2N rejected credentials (401)');
        return { sent: false, devMode: false, reason: 'INVALID_CREDENTIALS' };
      }
      if (res.status === 412) {
        // Wallet empty: nobody can receive an OTP, so nobody can sign in.
        this.logger.error('V2N wallet balance exhausted (412) — SMS not delivered');
        return { sent: false, devMode: false, reason: 'INSUFFICIENT_BALANCE' };
      }
      if (!res.ok) {
        this.logger.error(`V2N push failed with ${res.status}`);
        return { sent: false, devMode: false, reason: `HTTP_${res.status}` };
      }

      const body = (await res.json()) as {
        status: number;
        total: number;
        accepted: number;
        rejected?: number;
        description?: string;
      };

      // 200 with accepted:0 means the gateway took the request but dropped
      // the message — treat as failure, not success.
      if (!body.accepted) {
        this.logger.error(
          `V2N accepted 0 of ${body.total}: ${body.description ?? 'no description'}`,
        );
        return {
          sent: false,
          devMode: false,
          accepted: 0,
          rejected: body.rejected,
          reason: 'REJECTED_BY_GATEWAY',
        };
      }

      return { sent: true, devMode: false, accepted: body.accepted, rejected: body.rejected };
    } catch (error) {
      this.logger.error(
        `V2N push threw: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return { sent: false, devMode: false, reason: 'NETWORK_ERROR' };
    }
  }

  // Wallet balance — for ops visibility before it hits zero.
  async accountInfo(): Promise<{ balanceNgn: number; status: string } | null> {
    const creds = this.credentials();
    if (!creds) return null;

    try {
      const res = await fetch(`${V2N_BASE}/info`, {
        headers: { Authorization: `Basic ${creds.auth}` },
      });
      if (!res.ok) return null;

      const body = (await res.json()) as {
        info?: { profile?: { balance?: string; status?: string } };
      };
      return {
        balanceNgn: Number(body.info?.profile?.balance ?? 0),
        status: body.info?.profile?.status ?? 'Unknown',
      };
    } catch {
      return null;
    }
  }
}