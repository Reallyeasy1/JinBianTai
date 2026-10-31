import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from './server.js';
import { prepareStorage } from './storage.js';
import { validPolicy, type BehaviorPolicy } from './model.js';

const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
let policy: BehaviorPolicy | undefined;
if (process.env.FORMLIFT_POLICY_FILE) {
  const input: unknown = JSON.parse(await readFile(process.env.FORMLIFT_POLICY_FILE, 'utf8'));
  if (!validPolicy(input)) throw new Error('Invalid policy file. See docs/IMPLEMENTATION.md.');
  policy = input;
}
const dataFile = process.env.FORMLIFT_DATA_FILE ?? resolve('data/responses.jsonl');
try { await prepareStorage(dataFile); }
catch { console.error('FormLift: the response file location is not writable. Check FORMLIFT_DATA_FILE and directory permissions.'); process.exit(1); }
const server = createApp({ policy, dataFile });
server.listen(port, '127.0.0.1', () => {
  console.log(`FormLift: http://127.0.0.1:${port}`);
  console.log('Engineering mode. Typeform reference verification is BLOCKED until genuine evidence is supplied.');
});
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
let stopping = false;
function shutdown(): void {
  if (stopping) { server.closeAllConnections(); return; }
  stopping = true;
  console.log('FormLift: stopping. In-flight requests get two seconds; press Ctrl-C again to drop them now.');
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => server.closeAllConnections(), 2_000).unref();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, shutdown);
