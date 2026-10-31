import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server.js';

// Reproduce a public, synthetic, answer-free artifact through the real export API.
const server = createApp();
try {
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const imported = await fetch(`${base}/api/import`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: await readFile('tests/fixtures/synthetic-form.json', 'utf8') });
  assert.equal(imported.status, 200);
  const { formHash } = await imported.json();
  const response = await fetch(`${base}/api/export?formHash=${formHash}`);
  assert.equal(response.status, 200);
  await mkdir('examples', { recursive: true });
  await writeFile('examples/formlift-demo.html', await response.text());
  console.log('Created examples/formlift-demo.html: synthetic standalone form, no respondent answers.');
} finally {
  if (server.listening) await new Promise<void>(done => { server.close(() => done()); server.closeIdleConnections(); });
}
