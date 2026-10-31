import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { sourceFingerprint } from './fingerprint.mjs';
import { onlySkipped, outcome, resolveNpm, runCommand, unlaunched } from './command.mjs';

// Keep the release input reproducible: only executed checks can produce PASS.
// Exit 0 PASS; exit 1 FAIL (a check ran and failed); exit 2 BLOCKED (a required command could not launch,
// or tests ran without failures but some were skipped, so coverage is incomplete).
const startedAt = new Date().toISOString();
const commands = [];
let passed = false;
let incomplete = false;
let fingerprint = null;
let counts = { executed: 0, passed: 0, failed: 0, skipped: 0 };
class Blocked extends Error {}
const npm = resolveNpm();
function run(command, args, label, prefix = []) {
  const result = runCommand(command, args, { label, prefix });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  commands.push(result.record);
  if (!result.record.launched) throw new Blocked(`Could not launch ${result.record.command}: ${result.record.launchError.code} ${result.record.launchError.message}`);
  return result;
}
function runNpm(args) {
  if (npm.error) {
    commands.push(unlaunched('npm', args, npm.error));
    throw new Blocked(`Could not launch npm ${args.join(' ')}: ${npm.error.code} ${npm.error.message}`);
  }
  return run(npm.command, args, npm.label, npm.prefix);
}
try {
  fingerprint = await sourceFingerprint();
  if (runNpm(['run', 'typecheck']).status !== 0) throw new Error('Typecheck failed.');
  if (runNpm(['run', 'build']).status !== 0) throw new Error('Build failed.');
  const buildInfo = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
  if (buildInfo.schemaVersion !== 'formlift-build/1' || buildInfo.fingerprint !== fingerprint || await sourceFingerprint() !== fingerprint) throw new Error('Build does not match the frozen source contents.');
  const files = (await readdir('dist/tests')).filter(file => file.endsWith('.test.js')).sort().map(file => `dist/tests/${file}`);
  if (!files.length) throw new Error('No engineering tests found.');
  const result = run(process.execPath, ['--test', '--test-reporter=tap', ...files], 'node');
  const metric = label => Number(result.stdout.match(new RegExp(`^# ${label} (\\d+)$`, 'm'))?.[1] ?? -1);
  counts = { executed: metric('tests'), passed: metric('pass'), failed: metric('fail'), skipped: metric('skipped') };
  if (onlySkipped(result.status, counts)) { incomplete = true; throw new Error(`Engineering tests incomplete: ${counts.skipped} skipped, none failed.`); }
  if (result.status !== 0 || counts.executed <= 0 || counts.passed !== counts.executed || counts.failed !== 0 || counts.skipped !== 0) throw new Error('Engineering tests failed or were incomplete.');
  if (await sourceFingerprint() !== fingerprint) throw new Error('Source changed during verification.');
  passed = true;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Engineering verification could not complete.');
}
const { status, exitCode } = outcome(commands, passed, incomplete);
await mkdir('reports', { recursive: true });
const report = { schemaVersion: 'formlift-engineering/1', status, fingerprint, classification: 'SYNTHETIC_ENGINEERING_ONLY', referenceCases: 0, startedAt, finishedAt: new Date().toISOString(), runtime: { node: process.version, platform: process.platform, architecture: process.arch }, counts, commands };
await writeFile('reports/engineering.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Engineering: ${status}. Source reference cases: 0.`);
process.exitCode = exitCode;
