import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assessPhase6eEvidence, phase6eTemplate } from './phase6e-acceptance';

const args = process.argv.slice(2);
const fileArg = args.find((arg) => arg.startsWith('--file='));
const jsonOutput = args.includes('--json');
const generate = args.includes('--template');

if (generate) {
  process.stdout.write(JSON.stringify(phase6eTemplate(), null, 2) + '\n');
} else {
  // No DB, provider, remote file, or payment operations.
  // The committed template deliberately reports incomplete evidence.
  const filename = fileArg
    ? resolve(fileArg.slice('--file='.length))
    : resolve(process.cwd(), '../../docs/phase6e-acceptance.template.json');

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(filename, 'utf8')) as unknown;
  } catch {
    process.stderr.write('Cannot read valid Phase 6E register JSON. No financial action was taken.\n');
    process.exitCode = 2;
  }

  if (manifest !== undefined) {
    const result = assessPhase6eEvidence(manifest);
    if (jsonOutput) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      process.stdout.write('Phase 6E financial evidence audit (offline)\n');
      for (const rail of result.rails) {
        process.stdout.write(rail.rail + ': ' + rail.documentedPasses +
          '/' + rail.total + ' documented and independently reviewed\n');
      }
      process.stdout.write('Status: ' + result.status + '\n');
      process.stdout.write('Release authorized: NO\n');
      process.stdout.write(result.note + '\n');
      if (result.issues.length) {
        process.stdout.write('Register issues: ' + result.issues.length + '\n');
        for (const issue of result.issues) process.stdout.write('- ' + issue + '\n');
      }
    }

    // Even a complete register is not a provider certificate or launch approval.
    // Exit 0 means format and review claims are complete, never money authorized.
    if (result.status !== 'DOCUMENTATION_COMPLETE_UNVERIFIED') process.exitCode = 1;
  }
}
