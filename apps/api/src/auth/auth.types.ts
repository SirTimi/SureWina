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