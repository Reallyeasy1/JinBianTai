import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { outcome, resolveNpm, runCommand, unlaunched } from '../scripts/command.mjs';

test('npm resolves to the CLI script through Node on Windows, never npm.cmd', () => {
  const viaEnv = resolveNpm({ platform: 'win32', env: { npm_execpath: 'C:\\npm\\bin\\npm-cli.js' }, execPath: 'C:\\node\\node.exe', exists: () => true });
  assert.deepEqual(viaEnv, { command: 'C:\\node\\node.exe', prefix: ['C:\\npm\\bin\\npm-cli.js'], label: 'npm' });
  const bundled = resolveNpm({ platform: 'win32', env: {}, execPath: 'C:\\node\\node.exe', exists: path => path.endsWith('npm-cli.js') });
  assert.equal(bundled.error, undefined);
  assert.equal(bundled.command, 'C:\\node\\node.exe');
  assert.match(bundled.prefix[0], /node_modules[\\/]npm[\\/]bin[\\/]npm-cli\.js$/);
  // A non-JavaScript npm_execpath (for example a .cmd shim) is not launched directly.
  const shim = resolveNpm({ platform: 'win32', env: { npm_execpath: 'C:\\npm\\npm.cmd' }, execPath: 'C:\\node\\node.exe', exists: () => false });
  assert.equal(shim.error?.code, 'NPM_NOT_FOUND');
  assert.deepEqual(resolveNpm({ platform: 'linux', env: {}, execPath: '/usr/bin/node', exists: () => false }), { command: 'npm', prefix: [], label: 'npm' });
});

test('the resolved npm actually launches on this platform', () => {
  const npm = resolveNpm();
  if (npm.error) assert.fail(`npm could not be resolved: ${npm.error.message}`);
  const result = runCommand(npm.command, ['--version'], { label: npm.label, prefix: npm.prefix });
  assert.equal(result.record.launched, true, JSON.stringify(result.record.launchError));
  assert.equal(result.record.command, 'npm --version');
  assert.equal(result.status, 0);
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test('a command that cannot launch is BLOCKED with its actual error, not a failure', () => {
  const result = runCommand(join(tmpdir(), 'formlift-no-such-executable-7d1f'), ['--version'], { label: 'missing-tool' });
  assert.equal(result.record.launched, false);
  assert.equal(result.record.exitCode, null);
  assert.equal(typeof result.record.launchError?.code, 'string');
  assert.ok(result.record.launchError?.message);
  assert.deepEqual(outcome([result.record], false), { status: 'BLOCKED', exitCode: 2 });
  // Launch failure dominates even if a caller mistakenly reports success.
  assert.deepEqual(outcome([result.record], true), { status: 'BLOCKED', exitCode: 2 });
  const unresolved = unlaunched('npm', ['run', 'typecheck'], { code: 'NPM_NOT_FOUND', message: 'missing' });
  assert.deepEqual(outcome([unresolved], false), { status: 'BLOCKED', exitCode: 2 });
});

test('a command that runs and fails is FAIL; complete success is PASS', () => {
  const failed = runCommand(process.execPath, ['-e', 'process.exit(3)'], { label: 'node' });
  assert.equal(failed.record.launched, true);
  assert.equal(failed.record.exitCode, 3);
  assert.deepEqual(outcome([failed.record], false), { status: 'FAIL', exitCode: 1 });
  const ok = runCommand(process.execPath, ['-e', 'process.exit(0)'], { label: 'node' });
  assert.deepEqual(outcome([ok.record], true), { status: 'PASS', exitCode: 0 });
  assert.deepEqual(outcome([], false), { status: 'FAIL', exitCode: 1 });
});

test('engineering wrapper exits 1 with a FAIL report when a launched check fails', async t => {
  const root = await mkdtemp(join(tmpdir(), 'formlift-runner-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'));
  for (const file of ['engineering.mjs', 'fingerprint.mjs', 'command.mjs']) await copyFile(resolve('scripts', file), join(root, 'scripts', file));
  // Stand-in npm CLI: typecheck runs and reports a failure.
  await writeFile(join(root, 'fake-npm.js'), "process.exit(process.argv.includes('typecheck') ? 1 : 0);\n");
  const result = spawnSync(process.execPath, ['scripts/engineering.mjs'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, npm_execpath: join(root, 'fake-npm.js') },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /Engineering: FAIL\./);
  const report = JSON.parse(await readFile(join(root, 'reports/engineering.json'), 'utf8'));
  assert.equal(report.status, 'FAIL');
  assert.equal(report.commands.length, 1);
  assert.equal(report.commands[0].launched, true);
  assert.equal(report.commands[0].exitCode, 1);
  assert.equal(report.commands[0].command, 'npm run typecheck');
});
