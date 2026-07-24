import { AdminRole, AdminTier } from '@prisma/client';

export type AdminJwtPayload = {
  sub: string;
  email: string;
  role: AdminRole;
  tier: AdminTier;
  type: 'admin';
};

export type AdminAuthResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
  admin: {
    adminUserId: string;
    email: string;
    fullName: string;
    role: AdminRole;
    tier: AdminTier
    mfaEnabled: boolean;
    lastLoginAt: Date | null;
  };
};