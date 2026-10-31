import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { createApp } from '../src/server.js';
import type { Event } from '../src/model.js';

// Synthetic local records only. These assertions are not original-system observations.
const fixture = (): any => JSON.parse(readFileSync('tests/fixtures/synthetic-form.json', 'utf8'));
const skipped = (contact = 'Synthetic product response'): Event[] => [
  { type: 'set', field: 'request', input: 'no' }, { type: 'next' },
  { type: 'set', field: 'contact', input: contact }, { type: 'next' }, { type: 'submit' },
];

/** A small independent CSV reader: delimiters/newlines inside quoted fields are data. */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < csv.length; i++) {
    const character = csv[i];
    if (quoted) {
      if (character === '"') {
        if (csv[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += character;
      continue;
    }
    if (character === '"' && !cell && !closed) { quoted = true; continue; }
    if (character === ',') { row.push(cell); cell = ''; closed = false; continue; }
    if (character === '\r' || character === '\n') {
      if (character === '\r' && csv[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = ''; closed = false; continue;
    }
    assert.equal(closed, false, 'CSV data cannot follow a closing quote without a delimiter');
    cell += character;
  }
  assert.equal(quoted, false, 'CSV quoted fields must close');
  if (cell || row.length || closed) { row.push(cell); rows.push(row); }
  if (rows.length) assert.ok(rows.every(item => item.length === rows[0].length), 'Every CSV row must have identical column count');
  return rows;
}

async function app(t: TestContext, writer?: (path: string) => (record: unknown) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'formlift-product-'));
  const dataFile = join(directory, 'responses.jsonl');
  const server = createApp({ dataFile, ...(writer ? { persist: writer(dataFile) } : {}) });
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  t.after(async () => {
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, value: unknown) => fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value),
  });
  const imported = async (input = fixture()) => {
    const response = await post('/api/import', input); assert.equal(response.status, 200); return response.json();
  };
  const save = async (formHash: string, events = skipped()) => {
    const response = await post('/api/responses', { formHash, events }); assert.equal(response.status, 201); return response.json();
  };
  const results = async (formHash: string) => {
    const response = await fetch(`${base}/api/results?formHash=${formHash}`); assert.equal(response.status, 200); return response.json();
  };
  const csv = (formHash: string, revision: string) => fetch(`${base}/api/results.csv?formHash=${formHash}&revision=${revision}`);
  return { directory, dataFile, base, post, imported, save, results, csv };
}

test('RESULTS-01: missing log is empty and actual saved receipts are returned newest first', async t => {
  const { imported, results, save, dataFile } = await app(t);
  const form = await imported();
  const empty = await results(form.formHash);
  assert.equal(empty.total, 0); assert.equal(empty.returned, 0); assert.equal(empty.limit, 500); assert.equal(empty.truncated, false);
  assert.deepEqual(empty.records, []);
  assert.equal(empty.revision, createHash('sha256').update('').digest('hex'));
  assert.deepEqual(empty.fields, form.model.fields.map(({ ref, label }: any) => ({ ref, label })));
  const first = await save(form.formHash, skipped('Synthetic first'));
  const second = await save(form.formHash, skipped('Synthetic second'));
  const snapshot = await results(form.formHash);
  assert.equal(snapshot.total, 2); assert.equal(snapshot.returned, 2);
  assert.deepEqual(snapshot.records.map((record: any) => record.responseId), [second.responseId, first.responseId]);
  assert.deepEqual(snapshot.records[0].answers, second.answers);
  assert.deepEqual(Object.keys(snapshot.records[0]).sort(), ['answers', 'receivedAt', 'responseId']);
  assert.equal(snapshot.revision, createHash('sha256').update(await readFile(dataFile)).digest('hex'));
});

test('RESULTS-02: active hash isolation and same-definition reimport recover only the intended results', async t => {
  const { base, imported, results, save } = await app(t);
  const first = await imported(); const stored = await save(first.formHash, skipped('Synthetic original-only'));
  const changed = fixture(); changed.fields[2].title = 'Different contact prompt';
  const second = await imported(changed);
  assert.notEqual(first.formHash, second.formHash);
  assert.equal((await fetch(`${base}/api/results?formHash=${first.formHash}`)).status, 409);
  const empty = await results(second.formHash);
  assert.equal(empty.total, 0); assert.equal(JSON.stringify(empty).includes('Synthetic original-only'), false);
  const other = await save(second.formHash, skipped('Synthetic other-form-only'));
  const reimported = await imported(); assert.equal(reimported.formHash, first.formHash);
  const original = await results(first.formHash);
  assert.deepEqual(original.records.map((record: any) => record.responseId), [stored.responseId]);
  assert.equal(JSON.stringify(original).includes(other.responseId), false);
  assert.equal(JSON.stringify(original).includes('Synthetic other-form-only'), false);
});

test('RESULTS-03: inbox and CSV expose the same latest-500 bounded selection and full matching total', async t => {
  const { imported, results, save, csv, dataFile } = await app(t);
  const form = await imported(); const seed = await save(form.formHash);
  const records = Array.from({ length: 501 }, (_, index) => ({ ...seed, responseId: randomUUID(), receivedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString() }));
  await writeFile(dataFile, records.map(record => JSON.stringify(record)).join('\n') + '\n');
  const snapshot = await results(form.formHash);
  assert.equal(snapshot.total, 501); assert.equal(snapshot.returned, 500); assert.equal(snapshot.limit, 500); assert.equal(snapshot.truncated, true);
  const expectedIds = records.slice(1).reverse().map(record => record.responseId);
  assert.deepEqual(snapshot.records.map((record: any) => record.responseId), expectedIds);
  const response = await csv(form.formHash, snapshot.revision); assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/csv/);
  assert.match(response.headers.get('content-disposition') || '', /attachment/);
  const parsed = parseCsv(await response.text());
  assert.equal(parsed.length, 501);
  assert.deepEqual(parsed.slice(1).map(row => row[0]), expectedIds);
});

test('CSV-01: values round-trip with quotes/newlines, formula protection, numeric negatives, zero, empty, and missing', async t => {
  const { imported, save, results, csv, dataFile } = await app(t);
  const input = fixture(); input.fields[1].validations.min_value = -10;
  input.fields[2].title = '=Risk,\n"Contact"'; input.fields[2].validations.required = false;
  const form = await imported(input);
  const formula = '=SUM(1,2)\n"quoted"';
  const included = (budget: string, contact?: string): Event[] => [
    { type: 'set', field: 'request', input: 'yes' }, { type: 'next' },
    { type: 'set', field: 'budget', input: budget }, { type: 'next' },
    ...(contact === undefined ? [] : [{ type: 'set' as const, field: 'contact', input: contact }]),
    { type: 'next' }, { type: 'submit' },
  ];
  const negative = await save(form.formHash, included('-5', formula));
  const zeroEmpty = await save(form.formHash, included('0', ''));
  const absent = await save(form.formHash, [
    { type: 'set', field: 'request', input: 'no' }, { type: 'next' }, { type: 'next' }, { type: 'submit' },
  ]);
  const snapshot = await results(form.formHash);
  const before = await readFile(dataFile, 'utf8');
  const response = await csv(form.formHash, snapshot.revision); assert.equal(response.status, 200);
  const parsed = parseCsv(await response.text());
  assert.deepEqual(parsed[0], [
    'responseId', 'receivedAt', 'Request a quote? [request]', 'Request a quote? [request].presence', 'Request a quote? [request].type',
    'Budget? [budget]', 'Budget? [budget].presence', 'Budget? [budget].type',
    "'=Risk,\n\"Contact\" [contact]", "'=Risk,\n\"Contact\" [contact].presence", "'=Risk,\n\"Contact\" [contact].type",
  ]);
  const byId = new Map(parsed.slice(1).map(row => [row[0], row]));
  assert.deepEqual(byId.get(negative.responseId)?.slice(5), ['-5', 'value', 'number', `'${formula}`, 'value', 'string']);
  assert.deepEqual(byId.get(zeroEmpty.responseId)?.slice(5), ['0', 'value', 'number', '', 'value', 'string']);
  assert.deepEqual(byId.get(absent.responseId)?.slice(5), ['', 'missing', '', '', 'missing', '']);
  assert.equal(await readFile(dataFile, 'utf8'), before, 'CSV sanitation must not mutate canonical stored data');
});

test('CSV-02: text formula prefixes and leading controls are neutralized without rewriting stored values', async t => {
  const { imported, save, results, csv, dataFile } = await app(t);
  const form = await imported();
  const values = ['+1+2', '-2+3', '@SUM(A1:A2)', '\t=2+2', ' \r\n=3', '＝2+2'];
  const saved = [];
  for (const value of values) saved.push(await save(form.formHash, skipped(value)));
  const snapshot = await results(form.formHash); const before = await readFile(dataFile, 'utf8');
  const response = await csv(form.formHash, snapshot.revision); assert.equal(response.status, 200);
  const parsed = parseCsv(await response.text());
  const byId = new Map(parsed.slice(1).map(row => [row[0], row]));
  saved.forEach((record, index) => assert.equal(byId.get(record.responseId)?.[8], `'${values[index]}`));
  assert.equal(await readFile(dataFile, 'utf8'), before);
});

test('CSV-03: stale or missing revisions never export a newer response set silently', async t => {
  const { base, imported, results, save, csv } = await app(t);
  const form = await imported(); const initial = await results(form.formHash);
  assert.equal((await fetch(`${base}/api/results.csv?formHash=${form.formHash}`)).status, 409);
  await save(form.formHash);
  assert.equal((await csv(form.formHash, initial.revision)).status, 409);
  const current = await results(form.formHash);
  assert.notEqual(initial.revision, current.revision);
  assert.equal((await csv(form.formHash, current.revision)).status, 200);
});

test('RESULTS-04: bounded, malformed, partial, and invalid UTF-8 logs fail without leaking contents or paths', async t => {
  const { imported, base, save, dataFile, directory } = await app(t);
  const form = await imported(); const seed = await save(form.formHash);
  const malformedCases: Array<string | Buffer> = [
    '{"private":"SYNTHETIC_SECRET_BAD_JSON"\n',
    JSON.stringify(seed),
    JSON.stringify({ ...seed, answers: seed.answers.slice(0, 2) }) + '\n',
    JSON.stringify({ ...seed, answers: [seed.answers[0], seed.answers[0], seed.answers[2]] }) + '\n',
    JSON.stringify({ formHash: 'another-form' }) + '\nSYNTHETIC_SECRET_BAD_JSON\n',
    Buffer.from([0xff, 0x0a]),
  ];
  for (const data of malformedCases) {
    await writeFile(dataFile, data);
    const response = await fetch(`${base}/api/results?formHash=${form.formHash}`);
    assert.equal(response.status, 422);
    const body = await response.text();
    assert.equal(body.includes('SYNTHETIC_SECRET_BAD_JSON'), false); assert.equal(body.includes(directory), false);
  }
  await writeFile(dataFile, Buffer.alloc(8 * 1024 * 1024 + 1, 0x20));
  assert.equal((await fetch(`${base}/api/results?formHash=${form.formHash}`)).status, 413);
  await writeFile(dataFile, JSON.stringify(seed) + '\n');
  assert.equal((await fetch(`${base}/api/results?formHash=${form.formHash}`)).status, 200, 'A failed read must not poison later reads');
});

test('RESULTS-05: no/stale form, wrong methods, foreign origin, and unreadable path are explicit errors', async t => {
  const { base, imported, post, dataFile, directory } = await app(t);
  for (const path of ['/api/results', '/api/results.csv']) assert.equal((await fetch(base + path)).status, 409);
  const form = await imported();
  for (const path of ['/api/results', '/api/results.csv']) {
    assert.equal((await fetch(`${base}${path}?formHash=stale`)).status, 409);
    assert.equal((await post(`${path}?formHash=${form.formHash}`, {})).status, 405);
    assert.equal((await fetch(`${base}${path}?formHash=${form.formHash}`, { headers: { origin: 'https://invalid.example' } })).status, 403);
  }
  await mkdir(dataFile);
  const response = await fetch(`${base}/api/results?formHash=${form.formHash}`);
  assert.equal(response.status, 503); assert.equal((await response.text()).includes(directory), false);
});

test('RESULTS-06: a read waits for an in-process append and never returns a partial record', async t => {
  let start!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { start = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const { imported, post, base } = await app(t, path => async record => {
    const text = JSON.stringify(record) + '\n'; const middle = Math.floor(text.length / 2);
    await writeFile(path, text.slice(0, middle)); start(); await held; await appendFile(path, text.slice(middle));
  });
  const form = await imported();
  const writing = post('/api/responses', { formHash: form.formHash, events: skipped() });
  await started;
  let settled = false;
  const reading = fetch(`${base}/api/results?formHash=${form.formHash}`).then(response => { settled = true; return response; });
  try {
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(settled, false, 'A read must remain queued while the append is incomplete');
  } finally { release(); }
  assert.equal((await writing).status, 201);
  const response = await reading; assert.equal(response.status, 200);
  assert.equal((await response.json()).total, 1);
});

test('RESULTS-07: a failed write does not poison subsequent reads or writes', async t => {
  let attempts = 0;
  const { imported, post, results } = await app(t, path => async record => {
    if (++attempts === 1) throw new Error('Synthetic storage failure');
    await appendFile(path, JSON.stringify(record) + '\n');
  });
  const form = await imported();
  assert.equal((await post('/api/responses', { formHash: form.formHash, events: skipped() })).status, 500);
  assert.equal((await results(form.formHash)).total, 0);
  assert.equal((await post('/api/responses', { formHash: form.formHash, events: skipped() })).status, 201);
  assert.equal((await results(form.formHash)).total, 1);
});
