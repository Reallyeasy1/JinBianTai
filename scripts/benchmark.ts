import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { cpus, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { importForm } from '../src/importer.js';
import { replay } from '../src/engine.js';
import type { CanonicalAnswers, Event } from '../src/model.js';
import { serializeResponse } from '../src/response.js';
import { createApp, ENGINEERING_POLICY } from '../src/server.js';
import { sourceFingerprint } from './fingerprint.mjs';

// Fixed public synthetic workloads. This script never reads customer responses or source captures.
const REPLAY_COUNT = 1_000;
const HTTP_COUNT = 100;
type Workload = 'setup' | 'replay' | 'http' | 'readback' | 'integrity' | 'cleanup';
type Failure = { workload: Workload; operation: number | null; code: string };
type Counts = { requested: number; executed: number; successful: number; failed: number };
class BenchmarkError extends Error {
  constructor(readonly code: string) { super(code); }
}
const errors: Failure[] = [];
const recordFailure = (workload: Workload, operation: number | null, error: unknown): void => {
  // Error messages and stacks can contain local account/path information; only bounded codes are public.
  errors.push({ workload, operation, code: error instanceof BenchmarkError ? error.code : 'UNEXPECTED_EXECUTION_ERROR' });
};
const sha256 = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');
const rounded = (value: number): number => Number(value.toFixed(6));

function timing(samples: number[], elapsedMs: number | null, successful: number) {
  const ordered = [...samples].sort((a, b) => a - b);
  const percentile = (fraction: number): number | null => ordered.length
    ? rounded(ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)]) : null;
  return {
    elapsedMs: elapsedMs === null ? null : rounded(elapsedMs),
    successfulOperationsPerSecond: elapsedMs !== null && elapsedMs > 0 ? rounded(successful * 1_000 / elapsedMs) : null,
    latencyMs: { samples: samples.length, p50: percentile(0.5), p95: percentile(0.95), percentileMethod: 'nearest-rank' },
  };
}

function workload(index: number): { name: string; events: Event[]; expected: CanonicalAnswers } {
  const variant = index % 3;
  const contact = `Synthetic benchmark respondent ${index}`;
  const events: Event[] = variant === 1
    ? [{ type: 'set', field: 'request', input: 'no' }, { type: 'next' }]
    : [
      { type: 'set', field: 'request', input: 'yes' }, { type: 'next' },
      { type: 'set', field: 'budget', input: variant === 0 ? '0' : '500' }, { type: 'next' },
      ...(variant === 2 ? [
        { type: 'back' }, { type: 'back' },
        { type: 'set', field: 'request', input: 'no' }, { type: 'next' },
      ] as Event[] : []),
    ];
  events.push({ type: 'set', field: 'contact', input: contact }, { type: 'next' }, { type: 'submit' });
  // Independent synthetic expectations: do not derive these from the replacement serializer.
  const expected: CanonicalAnswers = [
    { field: 'request', answer: { presence: 'value', valueType: 'string', value: variant === 0 ? 'yes' : 'no' } },
    { field: 'budget', answer: variant === 0 ? { presence: 'value', valueType: 'number', value: 0 } : { presence: 'missing' } },
    { field: 'contact', answer: { presence: 'value', valueType: 'string', value: contact } },
  ];
  return { name: ['included-zero', 'skipped', 'abandoned-answer'][variant], events, expected };
}

const startedAt = new Date().toISOString();
let fingerprint: string | null = null;
let buildFingerprint: string | null = null;
let finishedFingerprint: string | null = null;
let definitionSha256: string | null = null;
const replayCounts: Counts = { requested: REPLAY_COUNT, executed: 0, successful: 0, failed: 0 };
const httpCounts: Counts = { requested: HTTP_COUNT, executed: 0, successful: 0, failed: 0 };
const replayLatencies: number[] = [];
const httpLatencies: number[] = [];
let replayElapsed: number | null = null;
let httpElapsed: number | null = null;
let http201 = 0;
let persistedRecords = 0;
let checkedRecords = 0;
let savedBytes = 0;
let readbackMs: number | null = null;
let directory: string | undefined;
let server: ReturnType<typeof createApp> | undefined;

try {
  fingerprint = await sourceFingerprint();
  const stamp: unknown = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
  if (!stamp || typeof stamp !== 'object' ||
      (stamp as { schemaVersion?: unknown }).schemaVersion !== 'formlift-build/1' ||
      typeof (stamp as { fingerprint?: unknown }).fingerprint !== 'string') {
    throw new BenchmarkError('BUILD_METADATA_INVALID');
  }
  buildFingerprint = (stamp as { fingerprint: string }).fingerprint;
  if (fingerprint !== buildFingerprint) throw new BenchmarkError('BUILD_SOURCE_MISMATCH');
  const definition = await readFile('tests/fixtures/synthetic-form.json');
  definitionSha256 = sha256(definition);
  const imported = importForm(JSON.parse(definition.toString('utf8')));
  if (!imported.ok) throw new BenchmarkError('SYNTHETIC_FIXTURE_REJECTED');

  // Preconstruct input vectors. Per-operation latency includes replay + serialization only;
  // whole-workload elapsed/throughput also includes correctness checks and loop overhead.
  const replayInputs = Array.from({ length: REPLAY_COUNT }, (_, index) => workload(index));
  const replayStart = performance.now();
  for (let index = 0; index < replayInputs.length; index++) {
    const input = replayInputs[index];
    replayCounts.executed++;
    const operationStart = performance.now();
    try {
      const result = replay(imported.model, input.events, ENGINEERING_POLICY);
      if (!result.ok || result.state.phase !== 'submitted') throw new BenchmarkError('REPLAY_REJECTED');
      const answers = serializeResponse(imported.model, result.state, ENGINEERING_POLICY);
      replayLatencies.push(performance.now() - operationStart);
      if (!isDeepStrictEqual(answers, input.expected)) throw new BenchmarkError('REPLAY_ANSWER_MISMATCH');
      replayCounts.successful++;
    } catch (error) {
      if (replayLatencies.length < replayCounts.executed) replayLatencies.push(performance.now() - operationStart);
      replayCounts.failed++;
      recordFailure('replay', index, error);
    }
  }
  replayElapsed = performance.now() - replayStart;

  directory = await mkdtemp(join(tmpdir(), 'formlift-benchmark-'));
  const dataFile = join(directory, 'responses.jsonl');
  server = createApp({ dataFile });
  await new Promise<void>((done, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', done);
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const importResponse = await fetch(`${base}/api/import`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: definition.toString('utf8'),
    signal: AbortSignal.timeout(10_000),
  });
  if (importResponse.status !== 200) throw new BenchmarkError('HTTP_IMPORT_FAILED');
  const active = await importResponse.json() as { formHash?: unknown };
  if (typeof active.formHash !== 'string') throw new BenchmarkError('HTTP_FORM_IDENTITY_MISSING');
  const expectedByReceipt = new Map<string, CanonicalAnswers>();
  const httpInputs = Array.from({ length: HTTP_COUNT }, (_, index) => workload(index));
  const httpStart = performance.now();
  for (let index = 0; index < httpInputs.length; index++) {
    const input = httpInputs[index];
    httpCounts.executed++;
    const operationStart = performance.now();
    try {
      const response = await fetch(`${base}/api/responses`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ formHash: active.formHash, events: input.events }),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 201) http201++;
      const receipt = await response.json() as { responseId?: unknown; formHash?: unknown; answers?: unknown };
      httpLatencies.push(performance.now() - operationStart);
      if (response.status !== 201) throw new BenchmarkError('HTTP_NOT_CREATED');
      if (typeof receipt.responseId !== 'string' || !receipt.responseId || receipt.formHash !== active.formHash) {
        throw new BenchmarkError('HTTP_RECEIPT_IDENTITY_INVALID');
      }
      if (expectedByReceipt.has(receipt.responseId)) throw new BenchmarkError('HTTP_DUPLICATE_RECEIPT');
      expectedByReceipt.set(receipt.responseId, input.expected);
      if (!isDeepStrictEqual(receipt.answers, input.expected)) throw new BenchmarkError('HTTP_ANSWER_MISMATCH');
      httpCounts.successful++;
    } catch (error) {
      if (httpLatencies.length < httpCounts.executed) httpLatencies.push(performance.now() - operationStart);
      httpCounts.failed++;
      recordFailure('http', index, error);
    }
  }
  httpElapsed = performance.now() - httpStart;

  const readbackStart = performance.now();
  try {
    const bytes = await readFile(dataFile);
    savedBytes = bytes.length;
    const text = bytes.toString('utf8');
    if (!text.endsWith('\n')) throw new BenchmarkError('JSONL_INCOMPLETE_FINAL_RECORD');
    const lines = text.trimEnd().split('\n');
    persistedRecords = lines.length;
    if (persistedRecords !== HTTP_COUNT) recordFailure('readback', null, new BenchmarkError('JSONL_RECORD_COUNT_MISMATCH'));
    const ids = new Set<string>();
    for (let index = 0; index < lines.length; index++) {
      try {
        const row = JSON.parse(lines[index]) as { responseId?: unknown; formHash?: unknown; answers?: unknown };
        if (typeof row.responseId !== 'string' || ids.has(row.responseId) || !expectedByReceipt.has(row.responseId)) {
          throw new BenchmarkError('JSONL_RECEIPT_IDENTITY_INVALID');
        }
        ids.add(row.responseId);
        if (row.formHash !== active.formHash || !isDeepStrictEqual(row.answers, expectedByReceipt.get(row.responseId))) {
          throw new BenchmarkError('JSONL_ANSWER_MISMATCH');
        }
        checkedRecords++;
      } catch (error) { recordFailure('readback', index, error); }
    }
    if (checkedRecords !== HTTP_COUNT) recordFailure('readback', null, new BenchmarkError('JSONL_VERIFIED_COUNT_MISMATCH'));
  } catch (error) { recordFailure('readback', null, error); }
  readbackMs = performance.now() - readbackStart;
} catch (error) {
  recordFailure('setup', null, error);
} finally {
  if (server?.listening) {
    try {
      await new Promise<void>((done, reject) => {
        server!.close(error => error ? reject(error) : done());
        server!.closeIdleConnections();
      });
    } catch (error) { recordFailure('cleanup', null, error); }
  }
  if (directory) {
    try { await rm(directory, { recursive: true, force: true }); }
    catch (error) { recordFailure('cleanup', null, error); }
  }
  try {
    finishedFingerprint = await sourceFingerprint();
    const finalStamp = JSON.parse(await readFile('dist/build-info.json', 'utf8')) as { schemaVersion?: unknown; fingerprint?: unknown };
    if (fingerprint === null || fingerprint !== finishedFingerprint || finalStamp.schemaVersion !== 'formlift-build/1' || finalStamp.fingerprint !== fingerprint) {
      throw new BenchmarkError('SOURCE_OR_BUILD_CHANGED');
    }
  } catch (error) { recordFailure('integrity', null, error); }
}

const complete = replayCounts.successful === REPLAY_COUNT && httpCounts.successful === HTTP_COUNT && checkedRecords === HTTP_COUNT;
const status = errors.length === 0 && complete ? 'PASS' : 'FAIL';
const cpuInfo = cpus();
const report = {
  schemaVersion: 'formlift-benchmark/1', status, classification: 'SYNTHETIC_ENGINEERING_ONLY', referenceCases: 0,
  startedAt, finishedAt: new Date().toISOString(), fingerprint, buildFingerprint, finishedFingerprint, definitionSha256,
  command: 'node dist/scripts/benchmark.js', parameters: { replayCount: REPLAY_COUNT, httpCount: HTTP_COUNT, concurrency: 1 },
  runtime: { node: process.version, platform: process.platform, architecture: process.arch, cpuModel: cpuInfo[0]?.model ?? 'unavailable', logicalCpuCount: cpuInfo.length },
  policyId: ENGINEERING_POLICY.id,
  cases: ['included-zero', 'skipped', 'abandoned-answer'],
  replay: {
    ...replayCounts, ...timing(replayLatencies, replayElapsed, replayCounts.successful),
    boundary: 'Replay plus serialization latency; elapsed/throughput also include synthetic correctness checks and loop overhead. No HTTP or persistence.',
  },
  http: {
    ...httpCounts, ...timing(httpLatencies, httpElapsed, httpCounts.successful), status201: http201,
    boundary: 'Sequential localhost requests, authoritative replay, JSONL append, response transport and JSON parse. Elapsed includes answer checks. Readback measured separately.',
  },
  persistence: { records: persistedRecords, verifiedRecords: checkedRecords, bytes: savedBytes, readbackMs: readbackMs === null ? null : rounded(readbackMs) },
  errors,
  limitations: [
    'Fixed synthetic three-question workload; no genuine Typeform observations or baseline measurements.',
    'Client and server run in one Node process on one machine with concurrency 1; this is not hosted or concurrent-user capacity.',
    'Append acknowledgement and immediate readback are not an fsync or power-loss durability guarantee.',
    'No human entry time, internet latency, hosted uptime, maintenance effort, electrical power, or monetary savings are measured.',
    'Inputs are preconstructed; no warmup is excluded. Percentiles use nearest rank over all attempted operations, including failures.',
    'Failed or incomplete measurements must not be used as successful performance claims.',
  ],
};
try {
  await mkdir(resolve('reports'), { recursive: true });
  await writeFile(resolve('reports/benchmark.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = status === 'PASS' ? 0 : 1;
} catch {
  console.error('Benchmark report could not be written. No saved measurement is available from this run.');
  process.exitCode = 1;
}
