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

export type AdminMfaChallengeResponse = {
  mfaRequired: true;
  challengeId: string;
  expiresInSeconds: number;
};

export type AdminLoginResult = AdminAuthResponse | AdminMfaChallengeResponse;

export type AdminMfaChallenge = {
  adminUserId: string;
  createdAt: string;
};