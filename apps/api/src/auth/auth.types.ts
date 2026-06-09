export type OtpChallenge = {
  challengeId: string;
  phoneE164: string;
  otpHash: string;
  attempts: number;
  createdAt: string;
  expiresAt: string;
};

export type CustomerJwtPayload = {
  sub: string;
  phoneNumber: string;
  type: 'customer';
};

export type CustomerRefreshJwtPayload = {
  sub: string;
  phoneNumber: string;
  type: 'customer_refresh';
  sessionId: string;
};

export type CustomerRefreshSession = {
  sessionId: string;
  userId: string;
  phoneNumber: string;
  refreshTokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
};

export type AuthResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
  user: {
    userId: string;
    phoneNumber: string;
    email: string | null;
    displayName: string | null;
    kycStatus: string;
  };
};

export type AuthTokenBundle = AuthResponse & {
  refreshToken: string;
  refreshExpiresAt: Date;
};