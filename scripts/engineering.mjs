import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { sourceFingerprint } from './fingerprint.mjs';

// Keep the release input reproducible: only executed checks can produce PASS.
const startedAt = new Date().toISOString();
const commands = [];
let status = 'FAIL';
let fingerprint = null;
let counts = { executed: 0, passed: 0, failed: 0, skipped: 0 };
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(command, args) {
  const began = new Date().toISOString();
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  commands.push({ command: [command === process.execPath ? 'node' : command, ...args].join(' '), startedAt: began, finishedAt: new Date().toISOString(), exitCode: result.status, signal: result.signal, launched: !result.error });
  return result;
}
try {
  fingerprint = await sourceFingerprint();
  if (run(npm, ['run', 'typecheck']).status !== 0) throw new Error('Typecheck failed.');
  if (run(npm, ['run', 'build']).status !== 0) throw new Error('Build failed.');
  const buildInfo = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
  if (buildInfo.schemaVersion !== 'formlift-build/1' || buildInfo.fingerprint !== fingerprint || await sourceFingerprint() !== fingerprint) throw new Error('Build does not match the frozen source contents.');
  const files = (await readdir('dist/tests')).filter(file => file.endsWith('.test.js')).sort().map(file => `dist/tests/${file}`);
  if (!files.length) throw new Error('No engineering tests found.');
  const result = run(process.execPath, ['--test', '--test-reporter=tap', ...files]);
  const metric = label => Number(result.stdout?.match(new RegExp(`^# ${label} (\\d+)$`, 'm'))?.[1] ?? -1);
  counts = { executed: metric('tests'), passed: metric('pass'), failed: metric('fail'), skipped: metric('skipped') };
  if (result.status !== 0 || counts.executed <= 0 || counts.passed !== counts.executed || counts.failed !== 0 || counts.skipped !== 0) throw new Error('Engineering tests failed or were incomplete.');
  if (await sourceFingerprint() !== fingerprint) throw new Error('Source changed during verification.');
  status = 'PASS';
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Engineering verification could not complete.');
}
await mkdir('reports', { recursive: true });
const report = { schemaVersion: 'formlift-engineering/1', status, fingerprint, classification: 'SYNTHETIC_ENGINEERING_ONLY', referenceCases: 0, startedAt, finishedAt: new Date().toISOString(), runtime: { node: process.version, platform: process.platform, architecture: process.arch }, counts, commands };
await writeFile('reports/engineering.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Engineering: ${status}. Source reference cases: 0.`);
process.exitCode = status === 'PASS' ? 0 : 1;
