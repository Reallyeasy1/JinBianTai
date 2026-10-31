import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importForm } from '../src/importer.js';
import { normalizeStoredResponse } from '../src/evidence.js';

/** Offline intake only. No API calls, source runs, or invented expected answers. */
class IntakeError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const usage = `Offline evidence intake (run from the repository root):
  evidence.js init --definition FILE --out evidence/private/RUN
  evidence.js normalize --definition FILE --capture FILE --response-id ID --unfiltered --out evidence/private/RUN/D1

Output directories must be new, inside evidence/private, with no symlinks or traversal.
--unfiltered declares that the capture contains the complete answers section without a fields filter.
Exit 0 means a private draft was written, NOT that source compatibility passed.
Exit 1 means invalid input/failure; exit 2 means source input is missing or incomplete.
Never pass credentials; this command reads existing files only.`;

function argumentsFor(argv: string[]): { command: 'init' | 'normalize'; values: Map<string, string> } {
  const command = argv[0];
  if (command !== 'init' && command !== 'normalize') throw new IntakeError('ARGUMENTS', 'Choose init or normalize; use --help for syntax.');
  const allowed = command === 'init' ? ['--definition', '--out'] : ['--definition', '--capture', '--response-id', '--unfiltered', '--out'];
  const values = new Map<string, string>();
  for (let i = 1; i < argv.length; i++) {
    const key = argv[i]!;
    if (!allowed.includes(key) || values.has(key)) throw new IntakeError('ARGUMENTS', 'Unknown or repeated argument; use --help for syntax.');
    if (key === '--unfiltered') { values.set(key, 'true'); continue; }
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new IntakeError('ARGUMENTS', 'An argument value is missing; use --help for syntax.');
    values.set(key, value);
  }
  for (const key of allowed.filter(key => key !== '--unfiltered')) if (!values.has(key)) throw new IntakeError('ARGUMENTS', 'A required argument is missing; use --help for syntax.');
  return { command, values };
}

async function input(path: string, maxBytes: number): Promise<{ bytes: Buffer; value: unknown }> {
  let handle;
  try {
    // Do not follow a final symlink or read a FIFO/device supplied as a JSON file.
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new IntakeError('INPUT_FILE', 'Input must be a regular JSON file, not a symlink.');
    if (!stat.size || stat.size > maxBytes) throw new IntakeError('INPUT_SIZE', 'Input is empty or exceeds the documented size limit.');
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const checked = await handle.stat();
    if (!checked.isFile() || !checked.size || checked.size > maxBytes) throw new IntakeError('INPUT_SIZE', 'Input is empty or exceeds the documented size limit.');
    const buffer = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = await handle.read(buffer, length, buffer.length - length, length);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (!length || length > maxBytes) throw new IntakeError('INPUT_SIZE', 'Input is empty or exceeds the documented size limit.');
    const bytes = buffer.subarray(0, length);
    try { return { bytes, value: JSON.parse(bytes.toString('utf8')) }; }
    catch { throw new IntakeError('INPUT_JSON', 'Input is not valid JSON.'); }
  } catch (error) {
    if (error instanceof IntakeError) throw error;
    throw new IntakeError('INPUT_FILE', 'Input could not be read as a regular JSON file.');
  } finally { await handle?.close(); }
}

async function createPrivateDirectory(requested: string): Promise<string> {
  if (isAbsolute(requested) || requested.includes('\\')) throw new IntakeError('OUTPUT_PATH', 'Output must use a relative evidence/private path.');
  const pieces = requested.split('/');
  if (pieces.length < 3 || pieces[0] !== 'evidence' || pieces[1] !== 'private' || pieces.some(part => !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(part) || part === '.' || part === '..')) {
    throw new IntakeError('OUTPUT_PATH', 'Output must be a new directory strictly inside evidence/private, without traversal.');
  }
  const root = await realpath(process.cwd());
  let current = root;
  for (let i = 0; i < pieces.length; i++) {
    current = resolve(current, pieces[i]!);
    const final = i === pieces.length - 1;
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new IntakeError('OUTPUT_PATH', 'Output paths cannot contain symlinks or non-directory components.');
      if (final) throw new IntakeError('OUTPUT_EXISTS', 'Output already exists; choose a new private directory to preserve earlier evidence.');
    } catch (error) {
      if (error instanceof IntakeError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new IntakeError('OUTPUT_PATH', 'Output directory could not be inspected.');
      try { await mkdir(current, { mode: 0o700 }); }
      catch { throw new IntakeError('OUTPUT_PATH', 'Output directory could not be created exclusively.'); }
    }
    const resolved = await realpath(current);
    const rel = relative(root, resolved);
    if (resolved !== current || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new IntakeError('OUTPUT_PATH', 'Output directory cannot escape the local private path.');
  }
  return current;
}

async function writePackage(directory: string, files: Record<string, string | Buffer>) {
  try {
    for (const [name, contents] of Object.entries(files)) await writeFile(resolve(directory, name), contents, { flag: 'wx', mode: 0o600 });
  } catch {
    // Only remove the new directory exclusively created by this invocation.
    await rm(directory, { recursive: true, force: true });
    throw new IntakeError('OUTPUT_WRITE', 'The new private package could not be written completely.');
  }
}

const checklist = `# Private source-capture checklist

This is a DRAFT, not source evidence. The copied definition has not been authenticated.
Do not fill missing observations from FormLift output. Use synthetic respondent data in an owned form.

1. D1/direct-yes: take the included route and actually submit. Save the complete selected stored response as D1.capture.json.
2. D2/direct-no: take the skipped route and submit. Save D2.capture.json.
3. D3/abandoned-submission: answer and commit the conditional question, go Back, change to the skipped route, and submit. Save D3.capture.json.
4. D4/branch-return: answer and commit the conditional question, switch to the skipped route, then return. Record the original UI's displayed value, including absence versus empty. Save a faithful observation record as D4.capture.json.

For each case, fill the actual action events and capturedAt in manifest.draft.json. Select development/heldout/regression before examining replacement outputs. Direct-yes/direct-no mean included/skipped paths, regardless of visible choice labels.
For stored cases, normalize the explicit response ID with --unfiltered into the case directory; use D1/expected.json (and equivalent D2/D3 paths). Never declare --unfiltered after requesting only selected fields.
Transcribe D4's original UI checkpoints into D4/expected.json with an observations array; include the initial visit. Do not infer restoration from a stored response.

Missing recent responses are pending, not proof that answers are absent. Preserve raw captures privately. Record the actual collection method, source mode, sanitization, and independently observed restoration/submission policy.
Only a genuinely completed and reviewed package may be manually labelled OBSERVED in a NEW manifest.json. Hash actual capture and expected files. Drafts deliberately fail reference readiness.
See docs/CAPTURE_WORKFLOW.md and docs/REFERENCE_FORMAT.md. Never publish raw account data or credentials.
`;

export async function main(argv = process.argv.slice(2)): Promise<number> {
  if (argv.length === 1 && argv[0] === '--help') { console.log(usage); return 0; }
  try {
    const { command, values } = argumentsFor(argv);
    const definition = await input(values.get('--definition')!, 256 * 1024);
    if (!importForm(definition.value).ok) throw new IntakeError('UNSUPPORTED_DEFINITION', 'Definition is outside the supported subset; inspect it locally before collecting comparisons.');
    if (command === 'init') {
      const manifest = {
        schemaVersion: 'formlift-evidence/1', kind: 'DRAFT_NOT_EVIDENCE', source: 'typeform',
        definition: { path: 'definition.json', sha256: hash(definition.bytes) },
        policy: null,
        provenance: { captureMethod: null, sourceMode: null, independentExpectations: false, sanitization: [] },
        normalization: { version: 'typeform-stored-answers-1', removedFields: [] },
        cases: ['direct-yes', 'direct-no', 'abandoned-submission', 'branch-return'].map((purpose, index) => ({
          id: `D${index + 1}`, split: null, purpose, capturedAt: null, channel: index === 3 ? 'ui' : 'stored', events: [],
          capture: { path: `D${index + 1}.capture.json`, sha256: null },
          expected: { path: `D${index + 1}/expected.json`, sha256: null },
        })),
      };
      const directory = await createPrivateDirectory(values.get('--out')!);
      await writePackage(directory, { 'definition.json': definition.bytes, 'manifest.draft.json': JSON.stringify(manifest, null, 2) + '\n', 'CAPTURE_CHECKLIST.md': checklist });
      console.log(JSON.stringify({ status: 'CREATED_DRAFT', referenceStatus: 'BLOCKED', cases: 4, message: 'Private draft created. No source observations or expected answers were generated.' }));
      return 0;
    }
    const capture = await input(values.get('--capture')!, 2 * 1024 * 1024);
    const result = normalizeStoredResponse(definition.value, capture.value, { responseId: values.get('--response-id')!, unfiltered: values.has('--unfiltered') });
    if (!result.ok) {
      console.log(JSON.stringify({ status: result.status, referenceStatus: 'BLOCKED', code: result.code, message: result.message }));
      return result.status === 'BLOCKED' ? 2 : 1;
    }
    const expected = JSON.stringify({ answers: result.answers }, null, 2) + '\n';
    const projection = {
      classification: 'DRAFT_NOT_EVIDENCE', scope: 'stored.answers', projectionVersion: result.projectionVersion,
      definitionSha256: hash(definition.bytes), captureSha256: hash(capture.bytes), expectedSha256: hash(expected),
      responseId: result.responseId, submittedAt: result.submittedAt, normalizedAt: new Date().toISOString(), unfilteredDeclared: true,
      provenanceNotice: 'Values were projected from a supplied file; this does not authenticate its source. Normalization time is not capture time. Review source provenance, definition version, completeness, and privacy before use.',
    };
    const directory = await createPrivateDirectory(values.get('--out')!);
    await writePackage(directory, { 'expected.json': expected, 'projection.json': JSON.stringify(projection, null, 2) + '\n' });
    console.log(JSON.stringify({ status: 'NORMALIZED_DRAFT', referenceStatus: 'BLOCKED', fields: result.answers.length, message: 'Private stored-answer projection written. Source provenance and UI restoration still require independent evidence.' }));
    return 0;
  } catch (error) {
    const known = error instanceof IntakeError ? error : new IntakeError('INTAKE_FAILED', 'Offline intake could not complete; inspect local file availability and permissions.');
    console.error(JSON.stringify({ status: 'FAIL', referenceStatus: 'BLOCKED', code: known.code, message: known.message }));
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
