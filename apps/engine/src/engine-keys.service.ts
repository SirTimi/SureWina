import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  KeyObject,
  randomBytes,
  sign,
  verify,
} from 'crypto';

@Injectable()
export class EngineKeysService implements OnModuleInit {
  private readonly logger = new Logger(EngineKeysService.name);
  private privateKey!: KeyObject;
  private publicKey!: KeyObject;
  private sealKey!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const priv = this.config.getOrThrow<string>('ENGINE_SIGNING_PRIVATE_KEY');
    const pub = this.config.getOrThrow<string>('ENGINE_SIGNING_PUBLIC_KEY');
    const seal = this.config.getOrThrow<string>('ENGINE_SEED_SEAL_KEY');

    this.privateKey = createPrivateKey({
      key: Buffer.from(priv, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
    this.publicKey = createPublicKey({
      key: Buffer.from(pub, 'base64'),
      format: 'der',
      type: 'spki',
    });
    this.sealKey = Buffer.from(seal, 'hex');
    if (this.sealKey.length !== 32) {
      throw new Error('ENGINE_SEED_SEAL_KEY must be 32 bytes of hex');
    }

    // Boot self-test: sign + verify a probe so a bad keypair fails loudly
    // at startup, never silently at draw time.
    const probe = Buffer.from('engine-boot-probe');
    const sig = sign(null, probe, this.privateKey);
    if (!verify(null, probe, this.publicKey, sig)) {
      throw new Error('Ed25519 self-test failed: key pair mismatch');
    }
    this.logger.log('Engine keys loaded; Ed25519 self-test passed');
  }

  signPayload(payload: string): string {
    return sign(null, Buffer.from(payload, 'utf8'), this.privateKey).toString('base64');
  }

  // AES-256-GCM. Output format: base64(iv):base64(ciphertext):base64(tag)
  seal(plaintext: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.sealKey, iv);
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`;
  }

  unseal(sealed: string): Buffer {
    const [ivB64, ctB64, tagB64] = sealed.split(':');
    if (!ivB64 || !ctB64 || !tagB64) {
      throw new Error('Malformed sealed seed');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.sealKey,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64')),
      decipher.final(),
    ]);
  }
}