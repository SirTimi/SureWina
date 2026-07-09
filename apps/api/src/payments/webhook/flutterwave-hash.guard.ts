import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { FastifyRequest } from 'fastify';

// Flutterwave webhook auth: a static verif-hash header equal to the secret
// configured in the dashboard. Plain comparison — no body HMAC.
@Injectable()
export class FlutterwaveHashGuard implements CanActivate {
  private readonly logger = new Logger(FlutterwaveHashGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const expected = this.config.get<string>('FLUTTERWAVE_WEBHOOK_HASH');

    if (!expected) {
      this.logger.error('FLUTTERWAVE_WEBHOOK_HASH not set — rejecting webhook');
      throw new UnauthorizedException();
    }

    const received = req.headers['verif-hash'];
    if (typeof received !== 'string') {
      throw new UnauthorizedException('Missing verif-hash');
    }

    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn('Flutterwave webhook hash mismatch');
      throw new UnauthorizedException('Invalid verif-hash');
    }

    return true;
  }
}