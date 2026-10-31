import { readFile } from 'node:fs/promises';
import { createApp } from './server.js';
import { validPolicy, type BehaviorPolicy } from './model.js';

const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
let policy: BehaviorPolicy | undefined;
if (process.env.FORMLIFT_POLICY_FILE) {
  const input: unknown = JSON.parse(await readFile(process.env.FORMLIFT_POLICY_FILE, 'utf8'));
  if (!validPolicy(input)) throw new Error('Invalid policy file. See docs/IMPLEMENTATION.md.');
  policy = input;
}
const server = createApp({ policy, dataFile: process.env.FORMLIFT_DATA_FILE });
server.listen(port, '127.0.0.1', () => {
  console.log(`FormLift: http://127.0.0.1:${port}`);
  console.log('Engineering mode. Typeform reference verification is BLOCKED until genuine evidence is supplied.');
});
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { server.close(); server.closeIdleConnections(); });
