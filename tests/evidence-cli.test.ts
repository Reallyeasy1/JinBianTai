import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import { verifyReadiness } from '../scripts/verify.js';
import { createLink } from './links.js';

// All inputs here are independently authored synthetic engineering fixtures.
// They are NOT source observations, even where a source-shaped timestamp exists.
const cli = fileURLToPath(new URL('../scripts/evidence.js', import.meta.url));
const definitionBytes = readFileSync('tests/fixtures/synthetic-form.json');
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const responseId = 'synthetic-selected';
const submittedAt = '2026-01-01T00:00:00Z';
const selectedResponse = () => ({
  response_id: responseId, submitted_at: submittedAt,
  answers: [
    { field: { ref: 'request', type: 'multiple_choice' }, type: 'choice', choice: { label: 'No' } },
    { field: { ref: 'budget', type: 'number' }, type: 'number', number: 500 },
    { field: { ref: 'contact', type: 'short_text' }, type: 'text', text: '' },
  ],
});
const collection = () => ({ items: [
  { response_id: 'synthetic-other', submitted_at: submittedAt, answers: [] },
  selectedResponse(),
] });
const expectedAnswers = [
  { field: 'request', answer: { presence: 'value', valueType: 'string', value: 'no' } },
  { field: 'budget', answer: { presence: 'value', valueType: 'number', value: 500 } },
  { field: 'contact', answer: { presence: 'value', valueType: 'string', value: '' } },
];

async function workspace(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'formlift-evidence-cli-'));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  await writeFile(join(root, 'source-definition.json'), definitionBytes);
  await writeFile(join(root, 'source-response.json'), JSON.stringify(collection()));
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root, encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024,
    });
    assert.equal(result.error, undefined, 'The local CLI process must execute');
    assert.equal(result.signal, null, 'The CLI must terminate normally');
    return { ...result, output: result.stdout + result.stderr };
  };
  const normalize = (extra: string[] = [], output = 'evidence/private/run/D1') => run('normalize',
    '--definition', 'source-definition.json', '--capture', 'source-response.json',
    '--response-id', responseId, '--unfiltered', '--out', output, ...extra);
  return { root, run, normalize };
}

async function absent(path: string): Promise<void> {
  await assert.rejects(access(path), (error: NodeJS.ErrnoException) => error.code === 'ENOENT');
}

test('evidence init copies exact definition bytes and leaves all source findings unset', async t => {
  const { root, run } = await workspace(t);
  const result = run('init', '--definition', 'source-definition.json', '--out', 'evidence/private/run');
  assert.equal(result.status, 0, result.output);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.status, 'CREATED_DRAFT');
  assert.equal(summary.referenceStatus, 'BLOCKED');
  const out = join(root, 'evidence/private/run');
  assert.deepEqual(await readFile(join(out, 'definition.json')), definitionBytes);
  const manifest = JSON.parse(await readFile(join(out, 'manifest.draft.json'), 'utf8'));
  assert.equal(manifest.kind, 'DRAFT_NOT_EVIDENCE');
  assert.equal(manifest.source, 'typeform');
  assert.equal(manifest.definition.sha256, sha(definitionBytes));
  assert.equal(manifest.policy, null);
  assert.deepEqual(manifest.provenance, { captureMethod: null, sourceMode: null, independentExpectations: false, sanitization: [] });
  assert.deepEqual(manifest.cases.map((row: any) => row.id), ['D1', 'D2', 'D3', 'D4']);
  assert.deepEqual(manifest.cases.map((row: any) => row.purpose), ['direct-yes', 'direct-no', 'abandoned-submission', 'branch-return']);
  for (const row of manifest.cases) {
    assert.equal(row.split, null, 'A scaffold must not invent the operator\'s test split');
    assert.equal(row.capturedAt, null);
    assert.deepEqual(row.events, []);
    assert.equal(row.capture.sha256, null);
    assert.equal(row.expected.sha256, null);
    await absent(join(out, row.capture.path));
    await absent(join(out, row.expected.path));
  }
  assert.ok((await readFile(join(out, 'CAPTURE_CHECKLIST.md'), 'utf8')).length > 100);
  const readiness = await verifyReadiness(root, 'evidence/private/run/manifest.draft.json');
  assert.equal(readiness.report.status, 'BLOCKED');
  assert.equal(readiness.report.exitCode, 2);
  assert.equal(readiness.report.counts.executed, 0);
});

test('evidence normalization selects exact captured response, preserves abandoned answers, and hashes actual bytes', async t => {
  const { root, normalize } = await workspace(t);
  const result = normalize();
  assert.equal(result.status, 0, result.output);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.status, 'NORMALIZED_DRAFT');
  assert.equal(summary.referenceStatus, 'BLOCKED');
  const out = join(root, 'evidence/private/run/D1');
  const expectedBytes = await readFile(join(out, 'expected.json'));
  assert.deepEqual(JSON.parse(expectedBytes.toString()), { answers: expectedAnswers });
  const meta = JSON.parse(await readFile(join(out, 'projection.json'), 'utf8'));
  assert.equal(meta.classification, 'DRAFT_NOT_EVIDENCE');
  assert.equal(meta.scope, 'stored.answers');
  assert.equal(meta.projectionVersion, 'typeform-stored-answers/1');
  assert.equal(meta.responseId, responseId);
  assert.equal(meta.submittedAt, submittedAt);
  assert.equal(meta.definitionSha256, sha(definitionBytes));
  assert.equal(meta.captureSha256, sha(await readFile(join(root, 'source-response.json'))));
  assert.equal(meta.expectedSha256, sha(expectedBytes));
  assert.equal(meta.unfilteredDeclared, true);
  assert.ok(Number.isFinite(Date.parse(meta.normalizedAt)));
  assert.equal(Object.hasOwn(meta, 'capturedAt'), false, 'Normalization time is not a source capture time');
  assert.deepEqual((await readdir(out)).sort(), ['expected.json', 'projection.json']);
  await absent(join(root, 'evidence/public'));
});

test('evidence outputs cannot overwrite prior capture work', async t => {
  const { root, run, normalize } = await workspace(t);
  assert.equal(run('init', '--definition', 'source-definition.json', '--out', 'evidence/private/run').status, 0);
  const manifestPath = join(root, 'evidence/private/run/manifest.draft.json');
  const first = await readFile(manifestPath);
  assert.equal(run('init', '--definition', 'source-definition.json', '--out', 'evidence/private/run').status, 1);
  assert.deepEqual(await readFile(manifestPath), first);
  assert.equal(normalize().status, 0);
  const expectedPath = join(root, 'evidence/private/run/D1/expected.json');
  const expected = await readFile(expectedPath);
  const changed = collection(); changed.items[1]!.answers[1]!.number = 777;
  await writeFile(join(root, 'source-response.json'), JSON.stringify(changed));
  assert.equal(normalize().status, 1);
  assert.deepEqual(await readFile(expectedPath), expected);
});

test('absent, incomplete, and undeclared-full responses stay blocked without generated expectations', async t => {
  const { root, run } = await workspace(t);
  const examples: unknown[] = [
    { items: [] },
    { items: [{ response_id: responseId, answers: [] }] },
    { items: [{ response_id: responseId, submitted_at: submittedAt }] },
    { items: [{ response_id: responseId, submitted_at: submittedAt, answers: null }] },
    { items: [{ ...selectedResponse(), response_type: 'partial' }] },
  ];
  for (const [index, value] of examples.entries()) {
    await writeFile(join(root, 'source-response.json'), JSON.stringify(value));
    const out = `evidence/private/blocked-${index}`;
    const result = run('normalize', '--definition', 'source-definition.json', '--capture', 'source-response.json', '--response-id', responseId, '--unfiltered', '--out', out);
    assert.equal(result.status, 2, result.output);
    assert.equal(JSON.parse(result.stdout).status, 'BLOCKED');
    await absent(join(root, out));
  }
  await writeFile(join(root, 'source-response.json'), JSON.stringify(collection()));
  const result = run('normalize', '--definition', 'source-definition.json', '--capture', 'source-response.json', '--response-id', responseId, '--out', 'evidence/private/filtered');
  assert.equal(result.status, 2, result.output);
  await absent(join(root, 'evidence/private/filtered'));
});

test('output paths reject public storage, absolute paths, and traversal', async t => {
  const { root, run } = await workspace(t);
  for (const out of ['evidence/public/run', 'evidence/private/../public/run', join(root, 'evidence/private/absolute')]) {
    const result = run('init', '--definition', 'source-definition.json', '--out', out);
    assert.equal(result.status, 1, result.output);
  }
  await absent(join(root, 'evidence/public/run'));
  await absent(join(root, 'evidence/private/absolute'));
});

test('output symlink ancestors cannot redirect private captures elsewhere', async t => {
  const { root, run } = await workspace(t);
  const outside = await mkdtemp(join(tmpdir(), 'formlift-evidence-outside-'));
  t.after(async () => { await rm(outside, { recursive: true, force: true }); });
  await mkdir(join(root, 'evidence'));
  await createLink(outside, join(root, 'evidence/private'), 'dir');
  const result = run('init', '--definition', 'source-definition.json', '--out', 'evidence/private/run');
  assert.equal(result.status, 1, result.output);
  assert.deepEqual(await readdir(outside), []);
});

test('oversized and symlinked inputs reject without partial output', async t => {
  const { root, run, normalize } = await workspace(t);
  await writeFile(join(root, 'large-definition.json'), Buffer.alloc(256 * 1024 + 1, ' '));
  assert.equal(run('init', '--definition', 'large-definition.json', '--out', 'evidence/private/large').status, 1);
  await absent(join(root, 'evidence/private/large'));
  await writeFile(join(root, 'source-response.json'), Buffer.alloc(2 * 1024 * 1024 + 1, ' '));
  assert.equal(normalize().status, 1);
  await absent(join(root, 'evidence/private/run/D1'));
  const link = await createLink(join(root, 'source-definition.json'), join(root, 'definition-link.json'), 'file');
  if (!link.created) { t.skip(`Symlinked-input case not executed: ${link.reason}`); return; }
  assert.equal(run('init', '--definition', 'definition-link.json', '--out', 'evidence/private/link').status, 1);
  await absent(join(root, 'evidence/private/link'));
});

test('malformed files and arguments return bounded errors without private values or paths', async t => {
  const { root, run } = await workspace(t);
  const secret = 'PRIVATE_CLI_SENTINEL_5291';
  await writeFile(join(root, `${secret}.json`), `{"token":"${secret}","broken":}`);
  const results = [
    run('init', '--definition', `${secret}.json`, '--out', 'evidence/private/malformed'),
    run('init', '--definition', `${secret}-missing.json`, '--out', 'evidence/private/missing'),
    run('normalize', '--definition', 'source-definition.json', '--capture', `${secret}.json`, '--response-id', secret, '--unfiltered', '--out', 'evidence/private/bad-capture'),
    run('init', '--definition', 'source-definition.json', '--out', 'evidence/private/bad-flag', `--${secret}`),
  ];
  for (const result of results) {
    assert.equal(result.status, 1);
    assert.equal(result.output.includes(secret), false);
    assert.equal(result.output.includes(root), false);
    assert.ok(result.output.length < 2048, 'Diagnostics stay bounded');
  }
});
