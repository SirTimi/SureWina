import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { FastifyRequest } from 'fastify';

// Verifies the x-paystack-signature header: HMAC-SHA512 of the raw body,
// keyed with the Paystack secret key. Runs before the controller so an
// unsigned/forged request never reaches business logic.
@Injectable()
export class PaystackSignatureGuard implements CanActivate {
  private readonly logger = new Logger(PaystackSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<FastifyRequest & { rawBody?: Buffer }>();

    const secret = this.config.get<string>('PAYSTACK_SECRET_KEY');
    if (!secret) {
      this.logger.error('PAYSTACK_SECRET_KEY not set — rejecting webhook');
      throw new UnauthorizedException();
    }

    const signature = req.headers['x-paystack-signature'];
    if (typeof signature !== 'string' || !req.rawBody) {
      throw new UnauthorizedException('Missing signature or body');
    }

    const expected = createHmac('sha512', secret)
      .update(req.rawBody)
      .digest('hex');

    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      this.logger.warn('Paystack webhook signature mismatch');
      throw new UnauthorizedException('Invalid signature');
    }

    return true;
  }
}