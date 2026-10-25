import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';

import { PaystackSignatureGuard } from '../src/payments/webhook/paystack-signature.guard';

describe('Phase 6: signed Paystack webhook boundary', () => {
  const secret = 'test-paystack-secret-do-not-use-for-money';
  const rawBody = Buffer.from('{"event":"transfer.success","data":{"reference":"sw-test-1234567890"}}');

  function harness(
    body: Buffer | undefined = rawBody,
    signature?: string,
    configuredSecret: string | undefined = secret,
  ) {
    const config = {
      get: jest.fn().mockReturnValue(configuredSecret),
    };
    const guard = new PaystackSignatureGuard(config as never);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: signature === undefined ? {} : { 'x-paystack-signature': signature },
          rawBody: body,
        }),
      }),
    };
    return { guard, context };
  }

  function sign(body: Buffer) {
    return createHmac('sha512', secret).update(body).digest('hex');
  }

  it('accepts a correctly signed exact raw body', () => {
    const { guard, context } = harness(rawBody, sign(rawBody));
    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('rejects a missing signature or raw body', () => {
    const missingSignature = harness();
    expect(() => missingSignature.guard.canActivate(missingSignature.context as never))
      .toThrow(UnauthorizedException);

    const missingBody = harness(undefined, sign(rawBody));
    expect(() => missingBody.guard.canActivate(missingBody.context as never))
      .toThrow(UnauthorizedException);
  });

  it('rejects a signature for a different body, even if the JSON looks similar', () => {
    const changed = Buffer.from('{"event": "transfer.success", "data":{"reference":"sw-test-1234567890"}}');
    const { guard, context } = harness(changed, sign(rawBody));
    expect(() => guard.canActivate(context as never))
      .toThrow(UnauthorizedException);
  });

  it('rejects malformed signatures', () => {
    const { guard, context } = harness(rawBody, 'not-valid-hex');
    expect(() => guard.canActivate(context as never))
      .toThrow(UnauthorizedException);
  });

  it('fails closed when the signing secret is absent', () => {
    const { guard, context } = harness(rawBody, sign(rawBody), '');
    expect(() => guard.canActivate(context as never))
      .toThrow(UnauthorizedException);
  });
});
