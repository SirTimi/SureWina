import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

// A real user needs a handful of codes an hour at most; an attacker needs
// thousands. Keying on the phone number — the thing each SMS actually costs
// money against — is what protects the wallet. IP limits can't: carriers
// CGNAT most Nigerian mobile traffic, so IPs are neither stable nor unique.
const COOLDOWN_SECONDS = 30;
const HOURLY_LIMIT = 5;
const DAILY_LIMIT = 15;

@Injectable()
export class OtpRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(OtpRateLimitGuard.name);

  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ body?: { phoneE164?: string } }>();

    const raw = request.body?.phoneE164;

    // No usable phone in the body — let the validation pipe return a 400
    // rather than masking a malformed request as a rate-limit error.
    if (typeof raw !== 'string' || raw.length < 6) return true;

    // Normalise so +2349039070031 and 2349039070031 share one bucket.
    const phone = raw.replace(/\D/g, '');

    const cooldownKey = `otp:cooldown:${phone}`;
    const hourKey = `otp:count:hour:${phone}`;
    const dayKey = `otp:count:day:${phone}`;

    if (await this.redis.getJson(cooldownKey)) {
      this.deny(phone, 'cooldown');
    }

    const hourly = await this.redis.increment(hourKey);
    if (hourly === 1) await this.redis.expire(hourKey, 3_600);

    const daily = await this.redis.increment(dayKey);
    if (daily === 1) await this.redis.expire(dayKey, 86_400);

    if (hourly > HOURLY_LIMIT) this.deny(phone, `hourly ${hourly}/${HOURLY_LIMIT}`);
    if (daily > DAILY_LIMIT) this.deny(phone, `daily ${daily}/${DAILY_LIMIT}`);

    await this.redis.setJson(cooldownKey, 1, COOLDOWN_SECONDS);
    return true;
  }

  private deny(phone: string, reason: string): never {
    this.logger.warn(`OTP rate limit hit for ****${phone.slice(-4)} (${reason})`);

    // Deliberately generic: the response must not reveal whether a number
    // is registered, or which limit was hit.
    throw new HttpException(
      'Too many verification requests for this number. Please wait and try again, or call 0700-SUREWINA for a voice code.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}