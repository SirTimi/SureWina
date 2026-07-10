import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

// Minimal blob-storage abstraction. Local disk in dev; the production
// implementation (S3 + SSE-KMS, 90-day lifecycle) implements this same
// method and swaps in via the module.
export interface BlobStorage {
  save(key: string, data: Buffer): Promise<string>;
}

@Injectable()
export class StorageService implements BlobStorage {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly config: ConfigService) {}

  async save(key: string, data: Buffer): Promise<string> {
    const root = this.config.get<string>('KYC_STORAGE_DIR') ?? './storage';
    const fullPath = join(root, key);
    await mkdir(join(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, data);
    this.logger.log(`Stored ${key} (${data.length} bytes)`);
    return key; // the stored key is what goes in the DB, never an absolute path
  }
}