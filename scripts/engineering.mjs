import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { sourceFingerprint } from './fingerprint.mjs';

// Keep the release input reproducible: only executed checks can produce PASS.
// PASS = every check ran and passed; FAIL = a launched check failed; BLOCKED = toolchain/runtime missing.
class Blocked extends Error {}
const startedAt = new Date().toISOString();
const commands = [];
let status = 'FAIL';
let fingerprint = null;
let counts = { executed: 0, passed: 0, failed: 0, skipped: 0 };
// Invoke node directly: Windows Node 22+ refuses to spawn npm.cmd without a shell (EINVAL).
function run(command, args) {
  const began = new Date().toISOString();
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  commands.push({ command: [command === process.execPath ? 'node' : command, ...args].join(' '), startedAt: began, finishedAt: new Date().toISOString(), exitCode: result.status, signal: result.signal, launched: !result.error });
  if (result.error) throw new Blocked(`Toolchain unavailable: ${args[0]} could not be launched (${result.error.code ?? 'error'}). Run npm ci first.`);
  return result;
}
export function requiredNodeMajor(engines) {
  return Number(/>=\s*(\d+)/.exec(engines?.node ?? '')?.[1] ?? 0);
}
try {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const minimum = requiredNodeMajor(pkg.engines);
  if (Number(process.versions.node.split('.')[0]) < minimum) throw new Blocked(`Node ${minimum} or later is required; this is ${process.version}. Results on another runtime cannot certify the release.`);
  for (const tool of ['node_modules/typescript/bin/tsc', 'node_modules/esbuild/package.json']) {
    try { await access(tool); } catch { throw new Blocked(`Toolchain unavailable: ${tool} is missing. Run npm ci first.`); }
  }
  fingerprint = await sourceFingerprint();
  if (run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']).status !== 0) throw new Error('Typecheck failed.');
  if (run(process.execPath, ['scripts/build.mjs']).status !== 0) throw new Error('Build failed.');
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
  if (error instanceof Blocked) status = 'BLOCKED';
  console.error(error instanceof Error ? error.message : 'Engineering verification could not complete.');
}
await mkdir('reports', { recursive: true });
const report = { schemaVersion: 'formlift-engineering/1', status, fingerprint, classification: 'SYNTHETIC_ENGINEERING_ONLY', referenceCases: 0, startedAt, finishedAt: new Date().toISOString(), runtime: { node: process.version, platform: process.platform, architecture: process.arch }, counts, commands };
await writeFile('reports/engineering.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Engineering: ${status}. Source reference cases: 0.`);
process.exitCode = status === 'PASS' ? 0 : status === 'BLOCKED' ? 2 : 1;
