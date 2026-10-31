import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server.js';

const fixture = (): any => JSON.parse(readFileSync('tests/fixtures/synthetic-form.json', 'utf8'));
const events = [
  { type: 'set', field: 'request', input: 'no' }, { type: 'next' },
  { type: 'set', field: 'contact', input: 'Synthetic API user' }, { type: 'next' }, { type: 'submit' },
];
async function app(t: TestContext, persist?: (record: unknown) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'formlift-test-'));
  const dataFile = join(directory, 'responses.jsonl');
  const server = createApp({ dataFile, ...(persist ? { persist } : {}) });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  const imported = async (input = fixture()) => {
    const response = await post('/api/import', input); assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(typeof body.formHash, 'string'); return body;
  };
  return { base, post, imported, dataFile };
}

test('API-01: import, server replay, receipt, and actual file read-back', async t => {
  const { post, imported, dataFile } = await app(t); const form = await imported();
  const response = await post('/api/responses', { formHash: form.formHash, events });
  assert.equal(response.status, 201);
  const receipt = await response.json();
  const rows = (await readFile(dataFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].responseId, receipt.responseId);
  assert.equal(rows[0].formHash, form.formHash);
  assert.deepEqual(receipt.answers.find((row: any) => row.field === 'budget').answer, { presence: 'missing' });
  assert.deepEqual(receipt.answers.find((row: any) => row.field === 'contact').answer,
    { presence: 'value', valueType: 'string', value: 'Synthetic API user' });
});

test('API-02: failed import leaves the previous model usable', async t => {
  const { post, imported } = await app(t); const form = await imported();
  const invalid = fixture(); invalid.fields[1].type = 'file_upload';
  assert.equal((await post('/api/import', invalid)).status, 422);
  assert.equal((await post('/api/responses', { formHash: form.formHash, events })).status, 201);
});

test('API-02: replaced definition hash and invalid histories never append', async t => {
  const { post, imported, dataFile } = await app(t); const original = await imported();
  const changed = fixture(); changed.fields[2].title = 'Renamed contact'; const newer = await imported(changed);
  assert.notEqual(newer.formHash, original.formHash);
  assert.equal((await post('/api/responses', { formHash: original.formHash, events })).status, 409);
  assert.equal((await post('/api/responses', { formHash: newer.formHash, events: [{ type: 'submit' }] })).status, 422);
  assert.equal((await post('/api/responses', { formHash: newer.formHash, events: [null] })).status, 422);
  const existing = await readFile(dataFile, 'utf8').catch((error: NodeJS.ErrnoException) => {
    assert.equal(error.code, 'ENOENT'); return '';
  });
  assert.equal(existing, '');
});

test('API-03: storage failures are visible and do not poison later writes', async t => {
  let attempts = 0; const persisted: unknown[] = [];
  const { post, imported } = await app(t, async record => {
    if (++attempts === 1) throw new Error('Private path must not be exposed');
    persisted.push(record);
  });
  const form = await imported();
  const failed = await post('/api/responses', { formHash: form.formHash, events });
  assert.equal(failed.status, 500);
  const failure = await failed.json(); assert.equal(failure.error.code, 'PERSIST_FAILED');
  assert.ok(!JSON.stringify(failure).includes('Private path'));
  assert.equal((await post('/api/responses', { formHash: form.formHash, events })).status, 201);
  assert.equal(persisted.length, 1);
});

test('API-03: concurrent submissions produce complete, distinct JSONL records', async t => {
  const { post, imported, dataFile } = await app(t); const form = await imported();
  const responses = await Promise.all(Array.from({ length: 4 }, () => post('/api/responses', { formHash: form.formHash, events })));
  assert.ok(responses.every(response => response.status === 201));
  const rows = (await readFile(dataFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(rows.length, 4);
  assert.equal(new Set(rows.map(row => row.responseId)).size, 4);
});

test('API-04: oversized definition and excessive events reject', async t => {
  const { post, imported } = await app(t); const form = await imported();
  assert.equal((await post('/api/import', { title: 'x'.repeat(256 * 1024) })).status, 413);
  assert.equal((await post('/api/responses', { formHash: form.formHash, events: Array.from({ length: 201 }, () => ({ type: 'back' })) })).status, 413);
});

test('API-04: the artifact hash covers the exact accepted bytes and invalid UTF-8 is rejected', async t => {
  const { base, post, dataFile } = await app(t);
  const raw = Buffer.from(JSON.stringify(fixture()), 'utf8');
  const imported = await fetch(`${base}/api/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw });
  assert.equal(imported.status, 200);
  const { formHash } = await imported.json();
  const saved = await post('/api/responses', { formHash, events });
  assert.equal(saved.status, 201);
  const record = JSON.parse((await readFile(dataFile, 'utf8')).trim().split('\n').pop()!);
  assert.equal(record.artifactHash, createHash('sha256').update(raw).digest('hex'));
  const broken = Buffer.concat([raw.subarray(0, 12), Buffer.from([0xff]), raw.subarray(12)]);
  const rejected = await fetch(`${base}/api/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: broken });
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).error.code, 'INVALID_ENCODING');
  assert.equal((await post('/api/responses', { formHash, events })).status, 201, 'A rejected import leaves the active form usable');
});

test('API-04: JSON syntax, content type, unknown route, and methods are bounded errors', async t => {
  const { base, post } = await app(t);
  assert.equal((await fetch(base + '/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await fetch(base + '/api/import', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await post('/api/unknown', {})).status, 404);
  assert.equal((await fetch(base + '/api/import')).status, 405);
});

test('SAFE-01: cross-origin browser mutations reject while own origin works', async t => {
  const { base, post } = await app(t);
  assert.equal((await post('/api/import', fixture(), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('/api/import', fixture(), { origin: base })).status, 200);
});

test('R7: status is explicit that engineering results are not reference verification', async t => {
  const { base } = await app(t); const response = await fetch(base + '/api/status');
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.mode, 'ENGINEERING_ONLY');
  assert.equal(status.referenceStatus, 'BLOCKED');
  assert.equal(status.policy.status, 'SYNTHETIC');
});
