import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

// Records a cutoff per admin: any token issued before it is dead. Cheaper
// and simpler than tracking individual tokens, and it revokes every session
// an admin has at once — which is what "revoke access" should mean.
@Injectable()
export class AdminTokenRevocationService {
  // Slightly longer than the 30m token lifetime: once every token issued
  // before the cutoff has expired on its own, the marker is redundant.
  private readonly ttlSeconds = 40 * 60;

  constructor(private readonly redis: RedisService) {}

  private key(adminUserId: string) {
    return `admin:revoked-before:${adminUserId}`;
  }

  async revokeAll(adminUserId: string): Promise<void> {
    // Seconds, to match the JWT `iat` claim.
    const now = Math.floor(Date.now() / 1000);
    await this.redis.setJson(this.key(adminUserId), now, this.ttlSeconds);
  }

  async isRevoked(adminUserId: string, issuedAtSeconds?: number): Promise<boolean> {
    if (!issuedAtSeconds) return false;
    const cutoff = await this.redis.getJson<number>(this.key(adminUserId));
    if (!cutoff) return false;
    // `<=` so a token minted in the same second as the revocation still dies.
    return issuedAtSeconds <= cutoff;
  }
}