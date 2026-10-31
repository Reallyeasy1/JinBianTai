import { spawnSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { sourceFingerprint } from './fingerprint.mjs';

// Clean-start check: copy the current source tree (tracked and untracked, honouring .gitignore) into a
// temporary directory, install from the lockfile, run the engineering suite, start the server, and exercise
// the import/response/readback path. PASS only when every step actually ran and succeeded.
class Blocked extends Error {}
const root = process.cwd();
const startedAt = new Date().toISOString();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const commands = [];
let status = 'FAIL';
let smoke = null;
let fingerprint = null;
let engineeringCounts = null;
let temporary;

function record(command, began, result) {
  commands.push({ command, startedAt: began, finishedAt: new Date().toISOString(), exitCode: result.status ?? null, signal: result.signal ?? null, launched: !result.error });
  if (result.error) throw new Blocked(`${command} could not be launched (${result.error.code ?? 'error'}).`);
}
function run(command, args, options) {
  const began = new Date().toISOString();
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, shell: process.platform === 'win32', ...options });
  record([command, ...args].join(' '), began, result);
  return result;
}
async function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); });
  });
}
async function waitFor(url, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try { if ((await fetch(url)).ok) return true; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

try {
  fingerprint = await sourceFingerprint(root);
  const listing = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (listing.error || listing.status !== 0) throw new Blocked('git is required to enumerate the source tree for a clean copy.');
  const files = listing.stdout.split('\0').filter(Boolean).filter(file => !file.startsWith('reports/'));
  temporary = await mkdtemp(join(tmpdir(), 'formlift-clean-'));
  for (const file of files) {
    await mkdir(dirname(join(temporary, file)), { recursive: true });
    await copyFile(join(root, file), join(temporary, file));
  }
  if (run(npm, ['ci', '--no-audit', '--no-fund'], { cwd: temporary }).status !== 0) throw new Error('npm ci failed in the clean copy.');
  if (run(npm, ['test'], { cwd: temporary }).status !== 0) throw new Error('npm test failed in the clean copy.');
  const engineering = JSON.parse(await readFile(join(temporary, 'reports/engineering.json'), 'utf8'));
  engineeringCounts = engineering.counts;
  if (engineering.status !== 'PASS' || engineering.fingerprint !== fingerprint) throw new Error('The clean copy did not reproduce the current source fingerprint with a passing suite.');
  const port = await freePort();
  const dataFile = join(temporary, 'data', 'responses.jsonl');
  const began = new Date().toISOString();
  const child = spawn(npm, ['start'], { cwd: temporary, env: { ...process.env, PORT: String(port), FORMLIFT_DATA_FILE: dataFile }, stdio: 'ignore', shell: process.platform === 'win32' });
  const base = `http://127.0.0.1:${port}`;
  try {
    if (!(await waitFor(`${base}/api/status`))) throw new Error('npm start did not answer on its port.');
    const definition = await readFile(join(temporary, 'tests/fixtures/synthetic-form.json'), 'utf8');
    const page = await fetch(`${base}/`);
    if (!page.ok) throw new Error('The page did not load.');
    const imported = await fetch(`${base}/api/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: definition });
    if (imported.status !== 200) throw new Error('Import did not succeed.');
    const { formHash } = await imported.json();
    const events = [{ type: 'set', field: 'request', input: 'no' }, { type: 'next' }, { type: 'set', field: 'contact', input: 'Clean install check' }, { type: 'next' }, { type: 'submit' }];
    const saved = await fetch(`${base}/api/responses`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ formHash, events }) });
    if (saved.status !== 201) throw new Error('Response was not saved.');
    const receipt = await saved.json();
    const rows = (await readFile(dataFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    if (!rows.some(row => row.responseId === receipt.responseId)) throw new Error('Saved response was not read back from the JSONL file.');
    smoke = { startup: 'PASS', steps: ['GET /api/status', 'GET /', 'POST /api/import', 'POST /api/responses', 'JSONL readback'], referenceStatus: 'BLOCKED' };
    commands.push({ command: 'npm start', startedAt: began, finishedAt: new Date().toISOString(), exitCode: 0, signal: null, launched: true });
    status = 'PASS';
  } finally {
    child.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 300));
  }
} catch (error) {
  if (error instanceof Blocked) status = 'BLOCKED';
  else if (!smoke) smoke = { startup: commands.some(c => c.command === 'npm start') ? 'PASS' : 'FAIL', error: error instanceof Error ? error.message : 'Clean-start check failed.' };
  console.error(error instanceof Error ? error.message : 'Clean-start check could not complete.');
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
await mkdir(resolve(root, 'reports'), { recursive: true });
const report = { schemaVersion: 'formlift-reproducibility/1', status, fingerprint, classification: 'SYNTHETIC_ENGINEERING_ONLY', referenceCases: 0, startedAt, finishedAt: new Date().toISOString(), runtime: { node: process.version, platform: process.platform, architecture: process.arch }, commands, smoke, engineeringCounts };
await writeFile(resolve(root, 'reports/reproducibility.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Reproducibility: ${status}. Source reference cases: 0.`);
process.exitCode = status === 'PASS' ? 0 : status === 'BLOCKED' ? 2 : 1;
