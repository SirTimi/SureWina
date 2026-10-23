
import { validate } from 'class-validator';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import { ClaimsController } from '../src/claims/claims.controller';
import { CustomerJwtGuard } from '../src/auth/guards/customer-jwt.guard';
import { StartKycIdentityDto } from '../src/claims/dto/start-kyc-identity.dto';

describe('Phase 2C: Paystack identity start', () => {
  const input = {
    consent: true,
    bvn: '12345678901',
    firstName: 'Test',
    lastName: 'Customer',
    email: 'test@example.com',
    bankCode: '058',
    accountNumber: '0123456789',
  };

  it('requires explicit consent', async () => {
    const refused = Object.assign(
      new StartKycIdentityDto(),
      input,
      { consent: false },
    );

    const errors = await validate(refused);

    expect(
      errors.some((error) => error.property === 'consent'),
    ).toBe(true);
  });

  it('accepts valid request fields', async () => {
    const dto = Object.assign(
      new StartKycIdentityDto(),
      input,
    );

    expect(await validate(dto)).toEqual([]);
  });

  it('routes identity verification through the authenticated customer', async () => {
    const coordinator = {
      start: jest.fn().mockResolvedValue({
        status: 'SUBMITTED',
      }),
    };

    const controller = new ClaimsController(
      {} as never,
      coordinator as never,
      {} as never,
    );

    const dto = Object.assign(
      new StartKycIdentityDto(),
      input,
    );

    const result = await controller.startKycIdentity(
      'claim-123',
      dto,
      { phoneNumber: '+2348012345678' } as never,
    );

    expect(coordinator.start).toHaveBeenCalledWith(
      'claim-123',
      '+2348012345678',
      dto,
    );

    expect(result).toEqual({
      status: 'SUBMITTED',
    });
  });

  it('registers the route under customer authentication', () => {
    const route = Reflect.getMetadata(
      PATH_METADATA,
      ClaimsController.prototype.startKycIdentity,
    );

    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      ClaimsController,
    );

    expect(route).toBe(':claimId/kyc/identity/start');
    expect(guards).toContain(CustomerJwtGuard);
  });
});
