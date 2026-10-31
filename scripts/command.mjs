import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Locate the npm CLI script so it can be launched through the current Node binary.
 * Windows refuses to spawn `npm.cmd` without a shell (EINVAL), and a shell would hide launch errors as exit codes.
 */
export function resolveNpm({ platform = process.platform, env = process.env, execPath = process.execPath, exists = existsSync } = {}) {
  const candidates = [];
  if (env.npm_execpath && /\.[cm]?js$/i.test(env.npm_execpath)) candidates.push(env.npm_execpath);
  if (platform === 'win32') candidates.push(join(dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  for (const script of candidates) if (exists(script)) return { command: execPath, prefix: [script], label: 'npm' };
  if (platform !== 'win32') return { command: 'npm', prefix: [], label: 'npm' };
  return { error: { code: 'NPM_NOT_FOUND', message: `npm CLI script not found (checked ${candidates.length} location${candidates.length === 1 ? '' : 's'}).` } };
}

/** Run without a shell. A spawn error means the command never launched; that is not a test failure. */
// `prefix` (such as the npm CLI script path) is launched but kept out of the recorded command to avoid local paths in reports.
export function runCommand(command, args, { label = command, prefix = [], spawn = spawnSync } = {}) {
  const startedAt = new Date().toISOString();
  const result = spawn(command, [...prefix, ...args], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const record = {
    command: [label, ...args].join(' '), startedAt, finishedAt: new Date().toISOString(),
    exitCode: result.status ?? null, signal: result.signal ?? null, launched: !result.error,
  };
  if (result.error) record.launchError = { code: result.error.code ?? 'UNKNOWN', message: result.error.message };
  return { record, stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
}

/** Record for a command that could not be resolved, so it never started. */
export function unlaunched(label, args, error) {
  const now = new Date().toISOString();
  return { command: [label, ...args].join(' '), startedAt: now, finishedAt: now, exitCode: null, signal: null, launched: false, launchError: error };
}

/**
 * Exit 0 complete success; 1 a command ran and detected failure; 2 blocked or incomplete
 * (a required command could not launch, or checks ran without failures but some were skipped).
 */
export function outcome(commands, passed, incomplete = false) {
  if (commands.some(command => !command.launched)) return { status: 'BLOCKED', exitCode: 2 };
  if (passed) return { status: 'PASS', exitCode: 0 };
  return incomplete ? { status: 'BLOCKED', exitCode: 2 } : { status: 'FAIL', exitCode: 1 };
}

/** Test totals with zero failures where every non-passing test was skipped: incomplete, not failed. */
export function onlySkipped(exitCode, counts) {
  return exitCode === 0 && counts.executed > 0 && counts.failed === 0 && counts.skipped > 0 && counts.passed + counts.skipped === counts.executed;
}
