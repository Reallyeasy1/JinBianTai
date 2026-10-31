import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, realpath, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importForm } from '../src/importer.js';
import { init, transition, replay } from '../src/engine.js';
import { serializeResponse } from '../src/response.js';
import { compareValues, isCanonicalAnswers } from '../src/comparison.js';
import type { BehaviorPolicy, Event, FormModel, Observation, Target } from '../src/model.js';

type ObjectValue = Record<string, unknown>;
type Status = 'PASS' | 'FAIL' | 'BLOCKED';
type Issue = { code: string; message: string; path?: string };
type Expected = { answers?: unknown; observations?: unknown[] };
type EvidenceCase = { id: string; split: string; purpose: string; capturedAt: string; channel: string; captureSha256: string; expectedSha256: string; events: Event[]; expected: Expected };
export type VerificationReport = {
  schemaVersion: 'formlift-verification/1';
  mode: string;
  status: Status;
  exitCode: 0 | 1 | 2;
  generatedAt: string;
  fingerprint: string;
  evidenceStatus: 'BLOCKED' | 'PROVIDED_OBSERVATIONS';
  issues: Issue[];
  counts: { captured: number; eligible: number; executed: number; passed: number; failed: number; unverified: number };
  provenanceNotice: string;
  cases?: unknown[];
  definitionSha256?: string;
  manifestSha256?: string;
  policyId?: string;
  normalizationVersion?: string;
  engineering?: unknown;
  browser?: unknown;
  hackathonBrowser?: unknown;
  productBrowser?: unknown;
};
type Readiness = { report: VerificationReport; model?: FormModel; policy?: BehaviorPolicy; cases: EvidenceCase[] };
const isObject = (v: unknown): v is ObjectValue => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const validHash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const timestamp = (v: unknown): v is string => text(v) && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
const safeIdentifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(v);
const SAFE_MESSAGES = {
  ARTIFACT_DESCRIPTOR: 'Artifact requires a relative path and lowercase SHA-256.',
  ARTIFACT_PATH: 'Artifact path must remain inside the manifest package.',
  MISSING_ARTIFACT: 'A required artifact is unavailable.',
  ARTIFACT_READ: 'A required artifact could not be read.',
  ARTIFACT_SIZE: 'Artifact must be nonempty and at most 2 MiB.',
  ARTIFACT_HASH: 'Artifact hash does not match its declared SHA-256.',
  INVALID_JSON: 'Artifact does not contain valid JSON.',
  UNSUPPORTED_DEFINITION: 'Definition does not fit the supported form contract.',
  CASE_SCHEMA: 'Case requires a safe unique identifier, split, timestamp, channel, purpose, and bounded events.',
  EXPECTED_SCHEMA: 'Expected artifact must contain valid canonical answers and/or observations for its selected channel.',
  EXPECTED_FIELDS: 'Expected canonical answers must include every model field, including missing entries.'
} as const;
type SafeReason = keyof typeof SAFE_MESSAGES;
class EvidenceInputError extends Error {
  constructor(readonly reason: SafeReason) { super(SAFE_MESSAGES[reason]); }
}
function inputIssue(error: unknown, fallbackCode: string, fallbackMessage: string, path: string): Issue {
  return {
    code: error instanceof EvidenceInputError && error.reason === 'MISSING_ARTIFACT' ? 'MISSING_ARTIFACT' : fallbackCode,
    message: error instanceof EvidenceInputError ? SAFE_MESSAGES[error.reason] : fallbackMessage,
    path
  };
}
function parseArtifact(bytes: Buffer): unknown {
  try { return JSON.parse(bytes.toString('utf8')) as unknown; }
  catch { throw new EvidenceInputError('INVALID_JSON'); }
}

export { sourceFingerprint } from './fingerprint.mjs';
import { sourceFingerprint } from './fingerprint.mjs';

function base(mode: string, fingerprint: string): VerificationReport {
  return {
    schemaVersion: 'formlift-verification/1', mode, status: 'BLOCKED', exitCode: 2,
    generatedAt: new Date().toISOString(), fingerprint, evidenceStatus: 'BLOCKED', issues: [],
    counts: { captured: 0, eligible: 0, executed: 0, passed: 0, failed: 0, unverified: 0 },
    provenanceNotice: 'Artifact hashes and declared provenance are checked. This tool cannot authenticate who captured the source or independently prove the capture is genuine. No source behavior is inferred from synthetic fixtures.'
  };
}

function finish(report: VerificationReport): void {
  const failed = report.issues.some(issue => !['MISSING_EVIDENCE', 'MISSING_ARTIFACT', 'MISSING_COVERAGE', 'MISSING_REPORT', 'INCOMPLETE_REPORT'].includes(issue.code));
  report.status = failed ? 'FAIL' : report.issues.length ? 'BLOCKED' : 'PASS';
  report.exitCode = failed ? 1 : report.issues.length ? 2 : 0;
}

async function checkedArtifact(directory: string, descriptor: unknown): Promise<Buffer> {
  if (!isObject(descriptor) || !text(descriptor.path) || !validHash(descriptor.sha256)) throw new EvidenceInputError('ARTIFACT_DESCRIPTOR');
  if (isAbsolute(descriptor.path)) throw new EvidenceInputError('ARTIFACT_PATH');
  try {
    const basePath = await realpath(directory);
    const lexical = relative(basePath, resolve(basePath, descriptor.path));
    if (lexical === '..' || lexical.startsWith(`..${sep}`) || isAbsolute(lexical)) throw new EvidenceInputError('ARTIFACT_PATH');
    const candidate = await realpath(resolve(basePath, descriptor.path));
    const rel = relative(basePath, candidate);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new EvidenceInputError('ARTIFACT_PATH');
    const bytes = await readFile(candidate);
    if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new EvidenceInputError('ARTIFACT_SIZE');
    if (sha256(bytes) !== descriptor.sha256) throw new EvidenceInputError('ARTIFACT_HASH');
    return bytes;
  } catch (error) {
    if (error instanceof EvidenceInputError) throw error;
    throw new EvidenceInputError((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'MISSING_ARTIFACT' : 'ARTIFACT_READ');
  }
}

function observationsValid(value: unknown): value is Observation[] {
  return Array.isArray(value) && value.every(row => isObject(row) && (
    (row.type === 'visit' && text(row.field) && (row.input === undefined || (typeof row.input === 'string' && row.input.length <= 4096)) && Object.keys(row).every(key => ['type', 'field', 'input'].includes(key))) ||
    (['ending', 'submitted'].includes(String(row.type)) && text(row.ref) && Object.keys(row).sort().join(',') === 'ref,type')
  ));
}

/** Derive experimental structure from graph paths and events, never purpose labels. */
function coveredPurposes(model: FormModel, policy: BehaviorPolicy, item: EvidenceCase): Set<string> {
  const covered = new Set<string>();
  const branch = model.branch;
  if (!branch) return covered;
  function path(takeBranch: boolean): string[] {
    const result: string[] = [];
    let target: Target = { kind: 'field', ref: model.fields[0]!.ref };
    while (target.kind === 'field') {
      if (result.includes(target.ref) || result.length >= model.fields.length) return [];
      result.push(target.ref);
      target = branch && target.ref === branch.at && takeBranch ? branch.whenTrue : model.defaultNext[target.ref]!;
      if (!target) return [];
    }
    return result;
  }
  const yes = path(true), no = path(false);
  const yesLarger = no.every(ref => yes.includes(ref)) && yes.length > no.length;
  const noLarger = yes.every(ref => no.includes(ref)) && no.length > yes.length;
  if (!yesLarger && !noLarger) return covered; // No identifiable included/skipped conditional block.
  const includedPath = yesLarger ? yes : no;
  const skippedPath = yesLarger ? no : yes;
  const conditional = new Set(includedPath.filter(ref => !skippedPath.includes(ref)));
  const visited = [model.fields[0]!.ref];
  const answered = new Set<string>();
  const abandoned = new Set<string>();
  const restored = new Set<string>();
  let state = init(model, policy);
  let committedBranches = 0;
  let including: boolean | undefined;
  let hadBack = false;
  let observationIndex = 1; // replay starts with the first field visit.
  for (const event of item.events) {
    const before = state;
    const result = transition(model, state, event, policy);
    if (!result.ok) return covered;
    state = result.state;
    if (event.type === 'back') hadBack = true;
    if (event.type === 'next' && before.current.kind === 'field') {
      const field = before.current.ref;
      if (conditional.has(field) && Object.hasOwn(state.answers, field) && typeof before.rawInputs[field] === 'string' && before.rawInputs[field] !== '') answered.add(field);
      if (field === branch.at) {
        committedBranches++;
        const takesBranch = state.answers[branch.condition.field] === branch.condition.choice;
        including = takesBranch === yesLarger;
        if (!including) for (const ref of answered) abandoned.add(ref);
      }
    }
    for (const observation of result.observations) {
      if (observation.type === 'visit') {
        visited.push(observation.field);
        const sourceCheckpoint = item.expected.observations?.[observationIndex];
        if (including && abandoned.has(observation.field) && isObject(sourceCheckpoint) && sourceCheckpoint.type === 'visit' && sourceCheckpoint.field === observation.field) restored.add(observation.field);
      }
      observationIndex++;
    }
  }
  const submitted = state.phase === 'submitted';
  const responseChannel = item.channel !== 'ui' && item.expected.answers !== undefined;
  if (submitted && responseChannel && !hadBack && committedBranches === 1) {
    if (including && JSON.stringify(visited) === JSON.stringify(includedPath)) covered.add('direct-yes');
    if (!including && JSON.stringify(visited) === JSON.stringify(skippedPath)) covered.add('direct-no');
  }
  if (submitted && responseChannel && including === false && abandoned.size) covered.add('abandoned-submission');
  if (item.channel === 'ui' && restored.size && item.expected.observations) {
    const sourceVisits = item.expected.observations.filter(row => isObject(row) && row.type === 'visit').map(row => (row as ObjectValue).field);
    if (JSON.stringify(sourceVisits) === JSON.stringify(visited)) covered.add('branch-return');
  }
  return covered;
}

function eventsValid(events: unknown): events is Event[] {
  if (!Array.isArray(events) || !events.length || events.length > 200) return false;
  return events.every(event => isObject(event) && (
    (event.type === 'set' && text(event.field) && typeof event.input === 'string' && event.input.length <= 4096 && Object.keys(event).sort().join(',') === 'field,input,type') ||
    (['next', 'back', 'submit'].includes(String(event.type)) && Object.keys(event).length === 1)
  ));
}

export async function verifyReadiness(root = process.cwd(), manifestPath = 'evidence/public/manifest.json'): Promise<Readiness> {
  const report = base('readiness', await sourceFingerprint(root));
  const cases: EvidenceCase[] = [];
  let raw: unknown;
  const path = resolve(root, manifestPath);
  try { const contents = await readFile(path); report.manifestSha256 = sha256(contents); raw = JSON.parse(contents.toString('utf8')); }
  catch (error) {
    report.issues.push({ code: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'MISSING_EVIDENCE' : 'INVALID_MANIFEST', message: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'No reference manifest supplied. Genuine form definition, restoration observation, and response-content captures are required.' : 'Reference manifest is not readable valid JSON.', path: 'manifest' });
    finish(report); return { report, cases };
  }
  if (!isObject(raw) || raw.schemaVersion !== 'formlift-evidence/1' || raw.kind !== 'OBSERVED' || raw.source !== 'typeform') {
    report.issues.push({ code: 'MISSING_EVIDENCE', message: 'Manifest is not an OBSERVED Typeform evidence package. Placeholders and synthetic data cannot pass readiness.' });
    return { report, cases };
  }
  if (!isObject(raw.provenance) || !text(raw.provenance.captureMethod) || !['published', 'preview'].includes(String(raw.provenance.sourceMode)) || raw.provenance.independentExpectations !== true || !Array.isArray(raw.provenance.sanitization) || !raw.provenance.sanitization.every(text)) {
    report.issues.push({ code: 'INVALID_PROVENANCE', message: 'Provide captureMethod, sourceMode, independentExpectations:true, and explicit sanitization steps.' });
  }
  const policy = raw.policy;
  const policyValid = isObject(policy) && safeIdentifier(policy.id) && policy.status === 'OBSERVED' && ['retain', 'clear'].includes(String(policy.restoration)) && ['active', 'answered'].includes(String(policy.submission));
  if (!policyValid) {
    report.issues.push({ code: 'INVALID_POLICY', message: 'An observed, explicit restoration/submission policy is required.' });
  }
  if (!isObject(raw.normalization) || !safeIdentifier(raw.normalization.version) || !Array.isArray(raw.normalization.removedFields) || !raw.normalization.removedFields.every(text)) {
    report.issues.push({ code: 'INVALID_NORMALIZATION', message: 'Declare normalization version and removedFields (which may be empty).' });
  } else if (raw.normalization.removedFields.some(field => !['response_id', 'token', 'landed_at', 'submitted_at', 'event_id'].includes(String(field)))) {
    report.issues.push({ code: 'INVALID_NORMALIZATION', message: 'Only response_id, token, landed_at, submitted_at, and event_id may be removed. Answer values and presence must remain intact.' });
  }
  if (isObject(policy) && safeIdentifier(policy.id)) report.policyId = policy.id;
  if (isObject(raw.normalization) && safeIdentifier(raw.normalization.version)) report.normalizationVersion = raw.normalization.version;
  let model: FormModel | undefined;
  try {
    const bytes = await checkedArtifact(dirname(path), raw.definition);
    const imported = importForm(parseArtifact(bytes));
    if (!imported.ok) throw new EvidenceInputError('UNSUPPORTED_DEFINITION');
    model = imported.model;
    report.definitionSha256 = sha256(bytes);
    model.formHash = sha256(JSON.stringify({ model, policy }));
  } catch (error) {
    report.issues.push(inputIssue(error, 'INVALID_DEFINITION', 'Definition could not be checked.', 'definition'));
  }
  const ids = new Set<string>();
  const purposes = new Set<string>();
  if (!Array.isArray(raw.cases) || !raw.cases.length) {
    report.issues.push({ code: 'MISSING_EVIDENCE', message: 'No captured reference cases; zero cases cannot pass.' });
  } else {
    report.counts.captured = raw.cases.length;
    for (const [caseIndex, item] of raw.cases.entries()) {
      try {
        if (!isObject(item) || !safeIdentifier(item.id) || ids.has(item.id) || !['development', 'heldout', 'regression'].includes(String(item.split)) || !timestamp(item.capturedAt) || !['ui', 'wire', 'webhook', 'stored'].includes(String(item.channel)) || !safeIdentifier(item.purpose) || !eventsValid(item.events)) throw new EvidenceInputError('CASE_SCHEMA');
        ids.add(item.id);
        await checkedArtifact(dirname(path), item.capture);
        const expected: unknown = parseArtifact(await checkedArtifact(dirname(path), item.expected));
        if (!isObject(expected) || !Object.keys(expected).length || Object.keys(expected).some(key => key !== 'answers' && key !== 'observations')) throw new EvidenceInputError('EXPECTED_SCHEMA');
        if (expected.answers !== undefined && !isCanonicalAnswers(expected.answers)) throw new EvidenceInputError('EXPECTED_SCHEMA');
        if (expected.observations !== undefined && !observationsValid(expected.observations)) throw new EvidenceInputError('EXPECTED_SCHEMA');
        if (item.channel === 'ui' ? !Array.isArray(expected.observations) || !expected.observations.length : !isCanonicalAnswers(expected.answers) || !(expected.answers as unknown[]).length) throw new EvidenceInputError('EXPECTED_SCHEMA');
        if (model && expected.answers !== undefined) {
          const actualRefs = (expected.answers as {field:string}[]).map(answer => answer.field).sort();
          if (JSON.stringify(actualRefs) !== JSON.stringify(model.fields.map(field => field.ref).sort())) throw new EvidenceInputError('EXPECTED_FIELDS');
        }
        cases.push({ id: item.id, split: String(item.split), purpose: item.purpose, capturedAt: item.capturedAt, channel: String(item.channel), captureSha256: String((item.capture as ObjectValue).sha256), expectedSha256: String((item.expected as ObjectValue).sha256), events: item.events, expected: expected as Expected });
      } catch (error) {
        report.issues.push(inputIssue(error, 'INVALID_CASE', 'Case could not be validated.', isObject(item) && safeIdentifier(item.id) ? item.id : `case-${caseIndex + 1}`));
      }
    }
  }
  if (model && policyValid) for (const item of cases) {
    if (coveredPurposes(model, policy as BehaviorPolicy, item).has(item.purpose)) purposes.add(item.purpose);
    else if (['direct-yes', 'direct-no', 'abandoned-submission', 'branch-return'].includes(item.purpose)) report.issues.push({ code: 'MISSING_COVERAGE', message: 'Declared experiment purpose is not demonstrated by its event history and source checkpoints.', path: item.id });
  }
  for (const purpose of ['direct-yes', 'direct-no', 'abandoned-submission', 'branch-return']) if (!purposes.has(purpose)) report.issues.push({ code: 'MISSING_COVERAGE', message: `Missing required experimental purpose: ${purpose}` });
  report.counts.eligible = cases.length;
  report.counts.unverified = report.counts.captured - cases.length;
  finish(report);
  if (report.status === 'PASS') report.evidenceStatus = 'PROVIDED_OBSERVATIONS';
  return { report, model, policy: policy as BehaviorPolicy, cases };
}

export async function verifyReference(root = process.cwd(), manifestPath?: string): Promise<VerificationReport> {
  const ready = await verifyReadiness(root, manifestPath);
  const report = { ...ready.report, mode: 'reference' };
  if (report.status !== 'PASS' || !ready.model || !ready.policy) return report;
  report.cases = ready.cases.map(item => {
    const identity = { id: item.id, split: item.split, channel: item.channel, capturedAt: item.capturedAt, captureSha256: item.captureSha256, expectedSha256: item.expectedSha256 };
    const result = replay(ready.model!, item.events, ready.policy!);
    report.counts.executed++;
    if (!result.ok) {
      report.counts.failed++;
      return { ...identity, status: 'FAIL', error: result.error };
    }
    const actual: Expected = {};
    if (item.expected.observations !== undefined) actual.observations = result.observations;
    if (item.expected.answers !== undefined) {
      if (result.state.phase !== 'submitted') {
        report.counts.failed++;
        return { ...identity, status: 'FAIL', error: 'Response-content case did not submit' };
      }
      actual.answers = serializeResponse(ready.model!, result.state, ready.policy!);
    }
    const comparison = compareValues(item.expected, actual);
    if (comparison.status === 'PASS') report.counts.passed++; else report.counts.failed++;
    return { ...identity, ...comparison };
  });
  if (report.counts.failed) report.issues.push({ code: 'REFERENCE_MISMATCH', message: `${report.counts.failed} independently provided reference cases did not match.` });
  finish(report);
  return report;
}

export async function verifyRelease(root = process.cwd(), manifestPath?: string): Promise<VerificationReport> {
  const report = { ...await verifyReference(root, manifestPath), mode: 'release' };
  for (const [name, field] of [['engineering', 'engineering'], ['e2e', 'browser'], ['hackathon-browser', 'hackathonBrowser'], ['product-browser', 'productBrowser']] as const) {
    try {
      const saved: unknown = JSON.parse(await readFile(resolve(root, `reports/${name}.json`), 'utf8'));
      report[field] = saved;
      if (!isObject(saved) || saved.status !== 'PASS') report.issues.push({ code: isObject(saved) && saved.status === 'FAIL' ? 'CHECK_FAILED' : 'INCOMPLETE_REPORT', message: `${name} verification is not an automated PASS.` });
      else if (saved.fingerprint !== report.fingerprint) report.issues.push({ code: 'STALE_REPORT', message: `${name} result belongs to different source contents. Rerun it.` });
      else if (!isObject(saved.counts) || !Number.isSafeInteger(saved.counts.executed) || Number(saved.counts.executed) <= 0 || saved.counts.failed !== 0 || saved.counts.passed !== saved.counts.executed || saved.counts.skipped !== 0 || (saved.counts.planned !== undefined && saved.counts.planned !== saved.counts.executed)) report.issues.push({ code: 'INCOMPLETE_REPORT', message: `${name} report must show nonzero executed checks, every planned check passing, zero failures, and zero skipped checks.` });
    } catch { report.issues.push({ code: 'MISSING_REPORT', message: `${name} verification report unavailable.` }); }
  }
  for (const path of ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'package-lock.json']) {
    try { if (!(await readFile(resolve(root, path))).length) throw new Error('empty'); }
    catch { report.issues.push({ code: 'MISSING_ARTIFACT', message: `Required release artifact missing: ${path}` }); }
  }
  finish(report);
  return report;
}

async function privateReportDirectory(root: string): Promise<string> {
  // Build one directory at a time: recursive mkdir would follow a preexisting
  // reports/private link before we could check where captured values will go.
  const canonicalRoot = await realpath(root);
  let directory = canonicalRoot;
  for (const name of ['reports', 'private']) {
    directory = resolve(directory, name);
    try { await mkdir(directory, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const entry = await lstat(directory);
    if (entry.isSymbolicLink() || !entry.isDirectory() || await realpath(directory) !== directory) throw new Error('Private report directory is unsafe.');
    const withinRoot = relative(canonicalRoot, directory);
    if (withinRoot === '..' || withinRoot.startsWith(`..${sep}`) || isAbsolute(withinRoot)) throw new Error('Private report directory is outside the project.');
  }
  return directory;
}

async function assertReportFile(path: string): Promise<void> {
  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink() || !entry.isFile()) throw new Error('Private report target is unsafe.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function writePrivateReport(root: string, name: string, contents: string): Promise<void> {
  const directory = await privateReportDirectory(root);
  const target = resolve(directory, name);
  await assertReportFile(target);
  const temporary = resolve(directory, `.report-${randomUUID()}.tmp`);
  try {
    // Exclusive creation never follows an existing temporary-file link. Rename
    // replaces the directory entry instead of opening/truncating its target,
    // so an intervening destination link cannot redirect the captured values.
    await writeFile(temporary, contents, { flag: 'wx', mode: 0o600 });
    if (await privateReportDirectory(root) !== directory) throw new Error('Private report directory changed.');
    await assertReportFile(target);
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (!['readiness', 'reference', 'release'].includes(mode ?? '')) throw new Error('Usage: verify.js readiness|reference|release [--manifest relative-path]');
  const marker = process.argv.indexOf('--manifest');
  if (marker !== -1 && !process.argv[marker + 1]) throw new Error('--manifest requires a path');
  const manifest = marker === -1 ? undefined : process.argv[marker + 1];
  const root = process.cwd();
  const report = mode === 'readiness' ? (await verifyReadiness(root, manifest)).report : mode === 'reference' ? await verifyReference(root, manifest) : await verifyRelease(root, manifest);
  // Explicit manifests may refer to private captures even when their path says
  // "public". Detailed differences remain private unless the operator reviews
  // and publishes them separately; the pure verification APIs are unchanged.
  const privateOutput = marker !== -1;
  const reportDirectory = privateOutput ? await privateReportDirectory(root) : resolve(root, 'reports');
  if (privateOutput) await assertReportFile(resolve(reportDirectory, `${mode}.json`));
  else await mkdir(reportDirectory, { recursive: true });
  const serialized = JSON.stringify(report, null, 2) + '\n';
  // Timestamped reference runs preserve the first held-out result instead of overwriting it.
  if (mode === 'reference' && report.counts.executed) await writeFile(resolve(reportDirectory, `reference-${Date.now()}.json`), serialized, { flag: 'wx', ...(privateOutput ? { mode: 0o600 } : {}) });
  if (privateOutput) await writePrivateReport(root, `${mode}.json`, serialized);
  else await writeFile(resolve(reportDirectory, `${mode}.json`), serialized);
  const output = privateOutput ? {
    mode: report.mode, status: report.status, exitCode: report.exitCode,
    fingerprint: report.fingerprint, counts: report.counts,
    issues: report.issues.map(issue => ({ code: issue.code })),
  } : report;
  console.log(JSON.stringify(output, null, 2));
  process.exitCode = report.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Verification could not complete. Check the command, local inputs, and filesystem permissions.'); process.exitCode = 1; });
}
