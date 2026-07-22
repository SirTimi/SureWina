import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';

const CACHE_TTL_MS = 60_000;

// DB-backed settings with env fallback: the DB value wins when present,
// otherwise the env var, otherwise the coded default. Cached for a minute so
// hot paths (WHT on every payout) don't hit the DB each time.
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cache = new Map<string, { value: string | null; at: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getNumber(key: string, fallback: number): Promise<number> {
    const raw = await this.getRaw(key);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
      this.logger.warn(`Setting ${key} is not numeric ('${raw}') — using fallback`);
    }
    const env = Number(this.config.get(key));
    return Number.isFinite(env) ? env : fallback;
  }

  private async getRaw(key: string): Promise<string | null> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    const value = row?.value ?? null;
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  invalidate(key?: string) {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }
}