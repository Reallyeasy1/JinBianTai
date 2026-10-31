import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { compareValues, isCanonicalAnswers } from '../src/comparison.js';
import { sourceFingerprint, verifyReadiness, verifyReference, verifyRelease } from '../scripts/verify.js';
import type { Event } from '../src/model.js';

test('comparison distinguishes missing, null, empty, zero, and numeric strings', () => {
  const values = [{}, { value: null }, { value: '' }, { value: 0 }, { value: '0' }];
  for (let i = 0; i < values.length; i++) for (let j = 0; j < values.length; j++) assert.equal(compareValues(values[i], values[j]).status, i === j ? 'PASS' : 'FAIL');
});

test('comparison preserves array order while allowing object property ordering', () => {
  assert.equal(compareValues({ a: 1, b: 2 }, { b: 2, a: 1 }).status, 'PASS');
  assert.equal(compareValues(['budget', 'contact'], ['contact', 'budget']).status, 'FAIL');
});

test('canonical answers reject type coercion, duplicates, and hidden values on missing rows', () => {
  assert.equal(isCanonicalAnswers([{ field: 'budget', answer: { presence: 'value', valueType: 'number', value: 0 } }]), true);
  assert.equal(isCanonicalAnswers([{ field: 'budget', answer: { presence: 'value', valueType: 'number', value: '0' } }]), false);
  assert.equal(isCanonicalAnswers([{ field: 'budget', answer: { presence: 'missing', value: 500 } }]), false);
  assert.equal(isCanonicalAnswers([{ field: 'budget', answer: { presence: 'missing' } }, { field: 'budget', answer: { presence: 'null' } }]), false);
});

test('missing and synthetic evidence never pass readiness or reference verification', async () => {
  const root = await mkdtemp(join(tmpdir(), 'formlift-verification-'));
  try {
    const ready = await verifyReadiness(root);
    assert.equal(ready.report.exitCode, 2);
    assert.equal(ready.report.status, 'BLOCKED');
    assert.equal((await verifyReference(root)).counts.executed, 0);
    await mkdir(join(root, 'evidence/public'), { recursive: true });
    await writeFile(join(root, 'evidence/public/manifest.json'), JSON.stringify({ schemaVersion: 'formlift-evidence/1', kind: 'SYNTHETIC', source: 'typeform', cases: [] }));
    assert.equal((await verifyReadiness(root)).report.exitCode, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('release reports missing prerequisites instead of green zero-test success', async () => {
  const root = await mkdtemp(join(tmpdir(), 'formlift-release-'));
  try {
    const report = await verifyRelease(root);
    assert.equal(report.exitCode, 2);
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.issues.some(issue => issue.code === 'MISSING_REPORT'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('fingerprint changes for testable source but not generated reports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'formlift-fingerprint-'));
  try {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src/example.ts'), 'export const value = 1;');
    const first = await sourceFingerprint(root);
    await mkdir(join(root, 'reports'));
    await writeFile(join(root, 'reports/result.json'), '{}');
    assert.equal(await sourceFingerprint(root), first);
    await writeFile(join(root, 'src/example.ts'), 'export const value = 2;');
    assert.notEqual(await sourceFingerprint(root), first);
  } finally { await rm(root, { recursive: true, force: true }); }
});

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const set = (field: string, input: string): Event => ({ type: 'set', field, input });
const next: Event = { type: 'next' }, back: Event = { type: 'back' }, submit: Event = { type: 'submit' };
const included: Event[] = [set('request', 'yes'), next, set('budget', '500'), next];
const directYes: Event[] = [...included, set('contact', 'Sample'), next, submit];
const directNo: Event[] = [set('request', 'no'), next, set('contact', 'Sample'), next, submit];
const abandoned: Event[] = [...included, back, back, set('request', 'no'), next, set('contact', 'Sample'), next, submit];
const returning: Event[] = [...included, back, back, set('request', 'no'), next, back, set('request', 'yes'), next];

async function mockPackage(root: string) {
  // Mechanical test doubles, NOT Typeform observations. The source schema and
  // independently hand-written local expectations exercise validation mechanics.
  const definition = await readFile('tests/fixtures/synthetic-form.json', 'utf8');
  const capture = 'SYNTHETIC UNIT TEST DOUBLE; not a Typeform capture';
  const answers = (yes: boolean) => [
    { field: 'request', answer: { presence: 'value', valueType: 'string', value: yes ? 'yes' : 'no' } },
    { field: 'budget', answer: yes ? { presence: 'value', valueType: 'number', value: 500 } : { presence: 'missing' } },
    { field: 'contact', answer: { presence: 'value', valueType: 'string', value: 'Sample' } }
  ];
  const expected = [
    { answers: answers(true) }, { answers: answers(false) }, { answers: answers(false) },
    { observations: [
      { type: 'visit', field: 'request' }, { type: 'visit', field: 'budget' },
      { type: 'visit', field: 'contact' }, { type: 'visit', field: 'budget', input: '500' },
      { type: 'visit', field: 'request', input: 'yes' }, { type: 'visit', field: 'contact' },
      { type: 'visit', field: 'request', input: 'no' }, { type: 'visit', field: 'budget', input: '500' }
    ] }
  ];
  const manifest = {
    schemaVersion: 'formlift-evidence/1', kind: 'OBSERVED', source: 'typeform',
    definition: { path: 'definition.json', sha256: hash(definition) },
    policy: { id: 'synthetic-unit-test-metadata', status: 'OBSERVED', restoration: 'retain', submission: 'active' },
    provenance: { captureMethod: 'SYNTHETIC TEST DOUBLE', sourceMode: 'published', independentExpectations: true, sanitization: ['No real source data'] },
    normalization: { version: 'mock-1', removedFields: [] as string[] },
    cases: ['direct-yes', 'direct-no', 'abandoned-submission', 'branch-return'].map((purpose, index) => ({
      id: `MOCK-${index}`, split: 'development', purpose, capturedAt: '2026-01-01T00:00:00Z', channel: index === 3 ? 'ui' : 'wire',
      events: structuredClone([directYes, directNo, abandoned, returning][index]!),
      capture: { path: 'capture.txt', sha256: hash(capture) },
      expected: { path: `expected-${index}.json`, sha256: hash(JSON.stringify(expected[index])) }
    }))
  };
  await writeFile(join(root, 'definition.json'), definition);
  await writeFile(join(root, 'capture.txt'), capture);
  for (const [index, value] of expected.entries()) await writeFile(join(root, `expected-${index}.json`), JSON.stringify(value));
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  return manifest;
}

test('mechanical branching mock validates distinct experiment histories and detects mismatch/hash changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'formlift-mock-validator-'));
  try {
    const manifest = await mockPackage(root);
    assert.equal((await verifyReadiness(root, 'manifest.json')).report.exitCode, 0);
    const compared = await verifyReference(root, 'manifest.json');
    assert.equal(compared.exitCode, 0);
    assert.equal(compared.counts.executed, 4);
    manifest.cases[0]!.events[4] = set('contact', 'Changed');
    await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
    const mismatch = await verifyReference(root, 'manifest.json');
    assert.equal(mismatch.exitCode, 1);
    assert.equal(mismatch.counts.failed, 1);
    await writeFile(join(root, 'capture.txt'), 'tampered');
    assert.equal((await verifyReadiness(root, 'manifest.json')).report.exitCode, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('relabelled copies of a direct-No run cannot satisfy four experimental purposes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'formlift-duplicate-history-'));
  try {
    const manifest = await mockPackage(root);
    for (const item of manifest.cases) item.events = structuredClone(directNo);
    await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
    const report = (await verifyReadiness(root, 'manifest.json')).report;
    assert.equal(report.status, 'BLOCKED');
    assert.equal(report.exitCode, 2);
    assert.ok(report.issues.some(issue => issue.code === 'MISSING_COVERAGE' && issue.path === 'MOCK-0'));
    assert.ok(report.issues.some(issue => issue.code === 'MISSING_COVERAGE' && issue.path === 'MOCK-2'));
    assert.ok(report.issues.some(issue => issue.code === 'MISSING_COVERAGE' && issue.path === 'MOCK-3'));
    assert.equal((await verifyReference(root, 'manifest.json')).counts.executed, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('abandonment needs a committed conditional answer and restoration needs a source return checkpoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'formlift-structural-evidence-'));
  try {
    const manifest = await mockPackage(root);
    manifest.cases[2]!.events = [set('request', 'yes'), next, set('budget', '500'), back, set('request', 'no'), next, set('contact', 'Sample'), next, submit];
    const incompleteUI = JSON.stringify({ observations: [{ type: 'visit', field: 'request' }] });
    await writeFile(join(root, 'expected-3.json'), incompleteUI);
    manifest.cases[3]!.expected.sha256 = hash(incompleteUI);
    await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
    const report = (await verifyReadiness(root, 'manifest.json')).report;
    assert.equal(report.exitCode, 2);
    assert.ok(report.issues.some(issue => issue.code === 'MISSING_COVERAGE' && issue.path === 'MOCK-2'));
    assert.ok(report.issues.some(issue => issue.code === 'MISSING_COVERAGE' && issue.path === 'MOCK-3'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('malformed artifacts and missing private paths cannot leak secrets into public diagnostics', async () => {
  const secret = 'PRIVATE_SECRET_SENTINEL_7391';
  const root = await mkdtemp(join(tmpdir(), `${secret}-`));
  try {
    const manifest = await mockPackage(root);
    const malformed = `{"private_token":"${secret}","broken": }`;
    await writeFile(join(root, 'definition.json'), malformed);
    manifest.definition.sha256 = hash(malformed);
    await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
    const malformedDefinition = (await verifyReadiness(root, 'manifest.json')).report;
    assert.equal(malformedDefinition.exitCode, 1);
    assert.equal(JSON.stringify(malformedDefinition).includes(secret), false);
    const restored = await mockPackage(root);
    await writeFile(join(root, 'expected-0.json'), malformed);
    restored.cases[0]!.expected.sha256 = hash(malformed);
    restored.cases[1]!.capture.path = `${secret}-missing.json`;
    restored.cases[2]!.id = `private/${secret}`;
    await writeFile(join(root, 'manifest.json'), JSON.stringify(restored));
    const issues = (await verifyReadiness(root, 'manifest.json')).report;
    assert.equal(issues.exitCode, 1);
    assert.ok(issues.issues.some(issue => issue.code === 'MISSING_ARTIFACT'));
    assert.equal(JSON.stringify(issues).includes(secret), false);
    const missingManifest = (await verifyReadiness(root, join(root, `${secret}-missing-manifest.json`))).report;
    assert.equal(missingManifest.exitCode, 2);
    assert.equal(JSON.stringify(missingManifest).includes(secret), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('release rejects PASS reports with zero or inconsistent executed counts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'formlift-zero-execution-'));
  try {
    await mockPackage(root);
    for (const path of ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'package-lock.json']) await writeFile(join(root, path), 'test-only release artifact');
    await mkdir(join(root, 'reports'));
    const fingerprint = await sourceFingerprint(root);
    await writeFile(join(root, 'reports/engineering.json'), JSON.stringify({ status: 'PASS', fingerprint, counts: { executed: 0, passed: 0, failed: 0, skipped: 0 } }));
    await writeFile(join(root, 'reports/e2e.json'), JSON.stringify({ status: 'PASS', fingerprint, counts: { executed: 1, passed: 0, failed: 0, skipped: 0 } }));
    const report = await verifyRelease(root, 'manifest.json');
    assert.equal(report.exitCode, 2);
    assert.ok(report.issues.some(issue => issue.code === 'INCOMPLETE_REPORT' && issue.message.startsWith('engineering')));
    assert.ok(report.issues.some(issue => issue.code === 'INCOMPLETE_REPORT' && issue.message.startsWith('e2e')));
    await writeFile(join(root, 'reports/engineering.json'), JSON.stringify({ status: 'PASS', fingerprint, counts: { executed: 1, passed: 1, failed: 0, skipped: 2 } }));
    await writeFile(join(root, 'reports/e2e.json'), JSON.stringify({ status: 'PASS', fingerprint, counts: { planned: 6, executed: 1, passed: 1, failed: 0, skipped: 0 } }));
    const incomplete = await verifyRelease(root, 'manifest.json');
    assert.equal(incomplete.exitCode, 2);
    assert.equal(incomplete.issues.filter(issue => issue.code === 'INCOMPLETE_REPORT').length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

