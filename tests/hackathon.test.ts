import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { importForm } from '../src/importer.js';
import { init, replay } from '../src/engine.js';
import { inspectState, inspectReplay } from '../src/inspect.js';
import { calculateCosts, type CostInputs } from '../src/cost.js';
import { createApp, ENGINEERING_POLICY } from '../src/server.js';
import type { BehaviorPolicy, Event, FormModel } from '../src/model.js';

// All input and expectations in this file are synthetic engineering cases.
const fixture = (): any => JSON.parse(readFileSync('tests/fixtures/synthetic-form.json', 'utf8'));
function model(input = fixture()): FormModel {
  const imported = importForm(input);
  assert.equal(imported.ok, true);
  if (!imported.ok) throw new Error('Synthetic fixture was rejected');
  return imported.model;
}
const included: Event[] = [
  { type: 'set', field: 'request', input: 'yes' }, { type: 'next' },
  { type: 'set', field: 'budget', input: '500' }, { type: 'next' },
];
const abandoned: Event[] = [...included,
  { type: 'back' }, { type: 'back' },
  { type: 'set', field: 'request', input: 'no' }, { type: 'next' },
];
const complete: Event[] = [...abandoned,
  { type: 'set', field: 'contact', input: 'SYNTHETIC_PRIVATE_SENTINEL_73' },
  { type: 'next' }, { type: 'submit' },
];
function view(events: readonly unknown[], policy: BehaviorPolicy = ENGINEERING_POLICY, input = fixture()) {
  const form = model(input);
  const result = replay(form, events, policy);
  assert.equal(result.ok, true);
  return inspectState(form, result.state, policy);
}
const row = (inspection: ReturnType<typeof inspectState>, field: string) => {
  const found = inspection.rows.find(item => item.field === field);
  assert.ok(found, `Inspector must include the ${field} field`);
  return found;
};

test('LAB-01: abandoned answer separates raw draft, committed number, and excluded output', () => {
  const inspection = view(abandoned);
  assert.deepEqual(inspection.route, ['request', 'contact']);
  assert.equal(inspection.routeResolved, true);
  const budget = row(inspection, 'budget');
  assert.equal(budget.active, false);
  assert.deepEqual(budget.draft, { presence: 'value', valueType: 'string', value: '500' });
  assert.deepEqual(budget.committed, { presence: 'value', valueType: 'number', value: 500 });
  assert.deepEqual(budget.projected, { presence: 'missing' });
});

test('LAB-01: changing projection and restoration axes produces distinct inspectable outcomes', () => {
  const allAnswered = view(abandoned, { ...ENGINEERING_POLICY, submission: 'answered' });
  assert.equal(row(allAnswered, 'budget').active, false);
  assert.deepEqual(row(allAnswered, 'budget').projected, { presence: 'value', valueType: 'number', value: 500 });
  const cleared = view(abandoned, { ...ENGINEERING_POLICY, restoration: 'clear' });
  for (const channel of ['draft', 'committed', 'projected'] as const) {
    assert.deepEqual(row(cleared, 'budget')[channel], { presence: 'missing' });
  }
});

test('LAB-01: an uncommitted edit does not replace the committed projection', () => {
  const inspection = view([...included, { type: 'back' }, { type: 'set', field: 'budget', input: '700' }]);
  assert.deepEqual(row(inspection, 'budget').draft, { presence: 'value', valueType: 'string', value: '700' });
  assert.deepEqual(row(inspection, 'budget').committed, { presence: 'value', valueType: 'number', value: 500 });
  assert.deepEqual(row(inspection, 'budget').projected, { presence: 'value', valueType: 'number', value: 500 });
});

test('LAB-02: prefix replay is isolated and rejects invalid positions or histories', () => {
  const form = model();
  const history = structuredClone(abandoned);
  const final = replay(form, history, ENGINEERING_POLICY);
  assert.equal(final.ok, true);
  const before = JSON.stringify({ form, history, state: final.state });
  const initial = inspectReplay(form, history, ENGINEERING_POLICY, 0);
  assert.equal(initial.routeResolved, false);
  assert.deepEqual(row(initial, 'budget').draft, { presence: 'missing' });
  const committed = inspectReplay(form, history, ENGINEERING_POLICY, 4);
  assert.equal(row(committed, 'budget').active, true);
  assert.deepEqual(row(committed, 'budget').projected, { presence: 'value', valueType: 'number', value: 500 });
  assert.deepEqual(inspectReplay(form, history, ENGINEERING_POLICY, history.length), inspectState(form, final.state, ENGINEERING_POLICY));
  assert.equal(JSON.stringify({ form, history, state: final.state }), before);
  for (const index of [-1, history.length + 1, 1.5, NaN, Infinity]) {
    assert.throws(() => inspectReplay(form, history, ENGINEERING_POLICY, index));
  }
  assert.throws(() => inspectReplay(form, [{ type: 'back' }], ENGINEERING_POLICY, 1));
});

test('LAB-04: zero, empty optional text, and missing answers remain distinct', () => {
  const input = fixture();
  input.fields[2].validations.required = false;
  const inspection = view([
    { type: 'set', field: 'request', input: 'yes' }, { type: 'next' },
    { type: 'set', field: 'budget', input: '0' }, { type: 'next' },
    { type: 'set', field: 'contact', input: '' }, { type: 'next' },
  ], ENGINEERING_POLICY, input);
  assert.deepEqual(row(inspection, 'budget').projected, { presence: 'value', valueType: 'number', value: 0 });
  assert.deepEqual(row(inspection, 'contact').projected, { presence: 'value', valueType: 'string', value: '' });
  const fresh = inspectState(model(), init(model(), ENGINEERING_POLICY), ENGINEERING_POLICY);
  assert.deepEqual(row(fresh, 'contact').draft, { presence: 'missing' });
  assert.deepEqual(row(fresh, 'contact').projected, { presence: 'missing' });
});

const costInput = (): CostInputs => ({
  comparable: true, monthlyResponses: 100, baselineMonthly: 29, baselineLimit: 100,
  baselineLaborHours: 0, setupHours: 2, hourlyRate: 20, maintenanceHours: 0.25,
  hardwareMonthly: 0, powerStorageMonthly: 1, amortizationMonths: 12,
});
function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);
}

test('COST-01: independently calculated first month, recurring, and amortized economics retain losses', () => {
  const input = costInput();
  const before = JSON.stringify(input);
  const result = calculateCosts(input);
  assert.equal(result.status, 'ESTIMATE');
  if (result.status !== 'ESTIMATE') throw new Error('Expected an illustrative estimate');
  assert.equal(result.baselineMonthlyTotal, 29);
  assert.equal(result.localRecurring, 6);
  assert.equal(result.setupCost, 40);
  assert.equal(result.firstMonth, 46);
  assert.equal(result.firstMonthSaving, -17);
  close(result.amortizedMonthly, 112 / 12);
  close(result.monthlySaving, 236 / 12);
  close(result.reductionPercent!, 236 / 348 * 100);
  assert.equal(result.periodBaseline, 348);
  assert.equal(result.periodLocal, 112);
  assert.equal(result.periodSaving, 236);
  assert.equal(JSON.stringify(input), before);
});

test('COST-01: a free baseline cannot manufacture percentage savings and labor/hardware remain costs', () => {
  const free = calculateCosts({ ...costInput(), baselineMonthly: 0 });
  assert.equal(free.status, 'ESTIMATE');
  if (free.status !== 'ESTIMATE') throw new Error('A zero subscription is valid');
  assert.equal(free.reductionPercent, null);
  close(free.monthlySaving, -112 / 12);
  const allocated = calculateCosts({ ...costInput(), baselineLaborHours: 0.5, hardwareMonthly: 7 });
  assert.equal(allocated.status, 'ESTIMATE');
  if (allocated.status !== 'ESTIMATE') throw new Error('Expected an estimate');
  assert.equal(allocated.baselineMonthlyTotal, 39);
  assert.equal(allocated.localRecurring, 13);
});

test('COST-02: unsuitable workflows and excess source usage do not produce savings estimates', () => {
  for (const input of [{ ...costInput(), comparable: false }, { ...costInput(), monthlyResponses: 101 }]) {
    const result = calculateCosts(input);
    assert.equal(result.status, 'NOT_COMPARABLE');
    if (result.status === 'NOT_COMPARABLE') assert.ok(result.reasons.length > 0);
    assert.equal('monthlySaving' in result, false);
    assert.equal('reductionPercent' in result, false);
  }
});

test('COST-02: invalid numeric inputs are rejected instead of coerced or rounded into an estimate', () => {
  for (const value of [-1, NaN, Infinity, 1_000_001]) {
    assert.equal(calculateCosts({ ...costInput(), baselineMonthly: value }).status, 'INVALID');
  }
  for (const field of ['monthlyResponses', 'baselineLimit', 'amortizationMonths'] as const) {
    for (const value of [0, 0.5]) assert.equal(calculateCosts({ ...costInput(), [field]: value }).status, 'INVALID');
  }
  assert.equal(calculateCosts({ ...costInput(), baselineMonthly: '29' } as unknown as CostInputs).status, 'INVALID');
});

async function app(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'formlift-export-'));
  const dataFile = join(directory, 'responses.jsonl');
  const server = createApp({ dataFile });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, value: unknown) => fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value),
  });
  const imported = async (input = fixture()) => {
    const response = await post('/api/import', input);
    assert.equal(response.status, 200);
    return response.json();
  };
  return { base, post, imported, dataFile };
}
function exportPayload(html: string): any {
  const match = html.match(/<script\b[^>]*\bid=["']formlift-data["'][^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(match, 'Export requires a dedicated inert data block');
  return JSON.parse(match[1]);
}

test('OFF-02: export contains definition/policy only even after a response is actually saved', async t => {
  const { base, post, imported, dataFile } = await app(t);
  const form = await imported();
  assert.equal((await post('/api/responses', { formHash: form.formHash, events: complete })).status, 201);
  const before = await readFile(dataFile, 'utf8');
  const response = await fetch(`${base}/api/export?formHash=${form.formHash}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  assert.match(response.headers.get('content-disposition') ?? '', /attachment/);
  const html = await response.text();
  assert.equal(html.includes('SYNTHETIC_PRIVATE_SENTINEL_73'), false);
  const payload = exportPayload(html);
  assert.equal(payload.model.formHash, form.formHash);
  assert.deepEqual(payload.policy, form.policy);
  assert.equal(payload.evidenceStatus, 'UNVERIFIED');
  assert.equal(payload.referenceStatus, 'BLOCKED');
  for (const key of ['answers', 'events', 'rawInputs', 'receipt', 'responseId']) assert.equal(key in payload, false);
  assert.equal(await readFile(dataFile, 'utf8'), before, 'Export does not append a response');
});

test('OFF-03: script-closing imported text stays in inert data and the artifact has no external dependencies', async t => {
  const { base, imported } = await app(t);
  const input = fixture();
  const hostile = '</script><script>globalThis.__formliftInjected=1</script><img src="https://invalid.example/track">\u2028\u2029';
  input.fields[2].title = hostile;
  const form = await imported(input);
  const html = await (await fetch(`${base}/api/export?formHash=${form.formHash}`)).text();
  assert.equal(html.includes(hostile), false);
  assert.equal(exportPayload(html).model.fields[2].label, hostile);
  assert.match(html, /connect-src\s+'none'/);
  assert.equal(/<script\b[^>]*\bsrc\s*=/i.test(html), false);
  assert.equal(/<link\b[^>]*\bhref\s*=/i.test(html), false);
});

test('OFF-05: absent/stale identities, wrong methods, and foreign origins cannot export a different form', async t => {
  const { base, post, imported } = await app(t);
  assert.equal((await fetch(base + '/api/export')).status, 409);
  const first = await imported();
  assert.equal((await fetch(base + '/api/export')).status, 409);
  const changed = fixture(); changed.fields[2].title = 'A different form';
  const second = await imported(changed);
  assert.notEqual(first.formHash, second.formHash);
  assert.equal((await fetch(`${base}/api/export?formHash=${first.formHash}`)).status, 409);
  assert.equal((await fetch(`${base}/api/export?formHash=${second.formHash}`, { headers: { origin: 'https://invalid.example' } })).status, 403);
  assert.equal((await post(`/api/export?formHash=${second.formHash}`, {})).status, 405);
  assert.equal((await fetch(`${base}/api/export?formHash=${second.formHash}`)).status, 200);
});
