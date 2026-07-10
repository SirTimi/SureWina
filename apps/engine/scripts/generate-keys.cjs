// One-off: generates the engine's Ed25519 signing keypair and the AES-256
// seed-seal key. Prints .env lines. Run once; NEVER commit the output.
const { generateKeyPairSync, randomBytes } = require('crypto');

const { publicKey, privateKey } = generateKeyPairSync('ed25519');

const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const priv = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const sealKey = randomBytes(32).toString('hex');

console.log('# Add to apps/engine/.env  (keep PRIVATE + SEAL out of git!)');
console.log(`ENGINE_SIGNING_PRIVATE_KEY=${priv}`);
console.log(`ENGINE_SEED_SEAL_KEY=${sealKey}`);
console.log('');
console.log('# Public key — safe to publish; the verifier (7.6) uses it:');
console.log(`ENGINE_SIGNING_PUBLIC_KEY=${pub}`);