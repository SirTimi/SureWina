import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  createHmac,
  timingSafeEqual,
} from 'crypto';

import type {
  FastifyRequest,
} from 'fastify';

@Injectable()
export class MonnifyWebhookSignatureGuard
  implements CanActivate
{
  private readonly logger =
    new Logger(
      MonnifyWebhookSignatureGuard.name,
    );

  constructor(
    private readonly config:
      ConfigService,
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean {
    const request =
      context
        .switchToHttp()
        .getRequest<
          FastifyRequest & {
            rawBody?: Buffer;
          }
        >();

    const signature =
      request.headers[
        'monnify-signature'
      ];

    /*
     * Monnify documentation states that sandbox webhook
     * notifications may not contain the signature header.
     *
     * We allow unsigned sandbox webhooks ONLY when explicitly
     * enabled and NEVER in production.
     */
    if (
      typeof signature !== 'string'
    ) {
      if (
        this.canAcceptUnsignedSandbox()
      ) {
        this.logger.warn(
          'Accepting unsigned Monnify sandbox webhook',
        );

        return true;
      }

      throw new UnauthorizedException(
        'Missing Monnify signature',
      );
    }

    const secret =
      this.config.get<string>(
        'MONNIFY_SECRET_KEY',
      );

    if (!secret) {
      this.logger.error(
        'MONNIFY_SECRET_KEY is not configured',
      );

      throw new UnauthorizedException();
    }

    if (!request.rawBody) {
      throw new UnauthorizedException(
        'Raw webhook body is unavailable',
      );
    }

    /*
     * SHA512 hex = 128 hexadecimal characters.
     */
    if (
      !/^[a-f0-9]{128}$/i.test(
        signature,
      )
    ) {
      throw new UnauthorizedException(
        'Invalid Monnify signature format',
      );
    }

    const expected =
      createHmac(
        'sha512',
        secret,
      )
        .update(request.rawBody)
        .digest('hex');

    const actualBuffer =
      Buffer.from(
        signature,
        'hex',
      );

    const expectedBuffer =
      Buffer.from(
        expected,
        'hex',
      );

    if (
      actualBuffer.length !==
        expectedBuffer.length ||
      !timingSafeEqual(
        actualBuffer,
        expectedBuffer,
      )
    ) {
      this.logger.warn(
        'Monnify webhook signature mismatch',
      );

      throw new UnauthorizedException(
        'Invalid Monnify signature',
      );
    }

    return true;
  }

  private canAcceptUnsignedSandbox():
    boolean {
    const nodeEnv =
      this.config.get<string>(
        'NODE_ENV',
      ) ?? 'development';

    if (nodeEnv === 'production') {
      return false;
    }

    const baseUrl =
      this.config.get<string>(
        'MONNIFY_BASE_URL',
      ) ?? '';

    const isSandbox =
      baseUrl.includes(
        'sandbox.monnify.com',
      );

    const allowUnsigned =
      this.config.get<boolean>(
        'MONNIFY_ALLOW_UNSIGNED_SANDBOX_WEBHOOKS',
      ) ?? false;

    return (
      isSandbox &&
      allowUnsigned
    );
  }
}