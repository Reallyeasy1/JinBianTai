import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { importForm } from './importer.js';
import { replay } from './engine.js';
import { serializeResponse } from './response.js';
import { validPolicy, MAX_EVENTS, type BehaviorPolicy, type FormModel } from './model.js';
import { jsonlWriter, serializedWriter } from './storage.js';
import { exportOfflineHtml } from './export.js';
import { readResults, resultsCsv, ResultsError } from './results.js';

export const ENGINEERING_POLICY: BehaviorPolicy = Object.freeze({
  id: 'engineering-retain-active-v1', status: 'SYNTHETIC', restoration: 'retain', submission: 'active',
});
export const LIMITS = Object.freeze({ definitionBytes: 256 * 1024, submissionBytes: 64 * 1024, events: MAX_EVENTS, fields: 6 });
export type AppOptions = {
  dataFile?: string; publicDir?: string; policy?: BehaviorPolicy;
  persist?: (record: unknown) => Promise<void>;
};
class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public issues?: unknown) { super(message); }
}
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function assertLocal(req: IncomingMessage) {
  const port = req.socket.localPort;
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(req.headers.host ?? '')) throw new HttpError(403, 'HOST_REJECTED', 'Use the local application address.');
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new HttpError(403, 'ORIGIN_REJECTED', 'Cross-origin requests are not accepted.');
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'ORIGIN_REJECTED', 'Cross-site requests are not accepted.');
}
async function body(req: IncomingMessage, limit: number): Promise<{ value: unknown; raw: string }> {
  if ((req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new HttpError(415, 'JSON_REQUIRED', 'Send application/json.');
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw new HttpError(415, 'ENCODING_UNSUPPORTED', 'Compressed request bodies are unsupported.');
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) { req.resume(); throw new HttpError(413, 'BODY_TOO_LARGE', `Request exceeds ${limit} bytes.`); }
  const raw = await new Promise<string>((accept, reject) => {
    const chunks: Buffer[] = []; let length = 0; let failed = false;
    req.on('data', (chunk: Buffer) => {
      if (failed) return;
      length += chunk.length;
      if (length > limit) { failed = true; chunks.length = 0; reject(new HttpError(413, 'BODY_TOO_LARGE', `Request exceeds ${limit} bytes.`)); return; }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!failed) accept(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', () => reject(new HttpError(400, 'BODY_INTERRUPTED', 'Request body could not be read.')));
    req.on('aborted', () => reject(new HttpError(400, 'BODY_INTERRUPTED', 'Request body was interrupted.')));
  });
  try { return { value: JSON.parse(raw), raw }; }
  catch { throw new HttpError(400, 'INVALID_JSON', 'Request body is not valid JSON.'); }
}
function plain(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }

export function createApp(options: AppOptions = {}): Server {
  if (!validPolicy(options.policy ?? ENGINEERING_POLICY)) throw new Error('Invalid explicit behavior policy.');
  const policy = Object.freeze({ ...(options.policy ?? ENGINEERING_POLICY) });
  const dataFile = options.dataFile ?? resolve('data/responses.jsonl');
  const persist = options.persist ? serializedWriter(options.persist) : jsonlWriter(dataFile);
  let storageTail: Promise<void> = Promise.resolve();
  function storageOperation<T>(operation: () => Promise<T>): Promise<T> {
    const task = storageTail.then(operation);
    storageTail = task.then(() => undefined, () => undefined);
    return task;
  }
  const publicDir = options.publicDir ?? resolve('dist/public');
  let active: { model: FormModel; artifactHash: string } | undefined;
  const staticFiles: Record<string, [string, string]> = {
    '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'],
    '/styles.css': ['styles.css', 'text/css; charset=utf-8'], '/client.js': ['client.js', 'text/javascript; charset=utf-8'],
    '/demo.json': ['demo.json', 'application/json; charset=utf-8'],
  };
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    try {
      assertLocal(req);
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (path === '/api/status') {
        if (req.method !== 'GET') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
        json(res, 200, { mode: 'ENGINEERING_ONLY', referenceStatus: 'BLOCKED', policy, limits: LIMITS, activeFormHash: active?.model.formHash ?? null }); return;
      }
      if (path === '/api/import') {
        if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
        const parsed = await body(req, LIMITS.definitionBytes);
        const imported = importForm(parsed.value);
        if (!imported.ok) throw new HttpError(422, 'UNSUPPORTED_FORM', 'The definition is outside the supported subset.', imported.errors);
        const model = imported.model;
        model.formHash = digest(stableJson({ model: { ...model, formHash: '' }, policy }));
        active = { model, artifactHash: digest(parsed.raw) };
        json(res, 200, { formHash: model.formHash, model, warnings: imported.warnings, evidenceStatus: 'UNVERIFIED', referenceStatus: 'BLOCKED', policy }); return;
      }
      if (path === '/api/responses') {
        if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
        const parsed = await body(req, LIMITS.submissionBytes);
        const value = parsed.value;
        if (!plain(value) || Object.keys(value).some(key => !['formHash', 'events'].includes(key)) || typeof value.formHash !== 'string' || !Array.isArray(value.events)) {
          throw new HttpError(422, 'INVALID_SUBMISSION', 'Expected only formHash and an events array.');
        }
        const snapshot = active;
        if (!snapshot || value.formHash !== snapshot.model.formHash) throw new HttpError(409, 'STALE_FORM', 'Import the current form and start a fresh response.');
        if (value.events.length > MAX_EVENTS) throw new HttpError(413, 'TOO_MANY_EVENTS', `At most ${MAX_EVENTS} events are supported.`);
        const result = replay(snapshot.model, value.events, policy);
        if (!result.ok) throw new HttpError(422, 'INVALID_REPLAY', 'The response history contains an invalid transition.', [result.error]);
        if (result.state.phase !== 'submitted') throw new HttpError(422, 'NOT_SUBMITTED', 'Complete the form before submitting.');
        const record = {
          schemaVersion: 1, responseId: randomUUID(), receivedAt: new Date().toISOString(), formHash: snapshot.model.formHash,
          artifactHash: snapshot.artifactHash, policyId: policy.id, policyStatus: policy.status,
          evidenceStatus: 'UNVERIFIED', answers: serializeResponse(snapshot.model, result.state, policy), observations: result.observations,
        };
        // No await between identity check and queue acceptance; later imports cannot change this snapshot.
        if (active !== snapshot) throw new HttpError(409, 'STALE_FORM', 'The active definition changed.');
        try { await storageOperation(() => persist(record)); }
        catch { throw new HttpError(500, 'PERSIST_FAILED', 'The response was not confirmed saved. Retry may duplicate a response after an uncertain failure.'); }
        json(res, 201, record); return;
      }
      if (path === '/api/results' || path === '/api/results.csv') {
        if (req.method !== 'GET') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
        const parameters = new URL(req.url ?? '/', 'http://localhost').searchParams;
        const snapshot = active;
        if (!snapshot || parameters.get('formHash') !== snapshot.model.formHash) throw new HttpError(409, 'STALE_FORM', 'Import the intended form before viewing its responses.');
        let results;
        try { results = await storageOperation(() => readResults(dataFile, snapshot.model)); }
        catch (error) {
          if (error instanceof ResultsError) throw new HttpError(error.status, error.code, error.message);
          throw error;
        }
        if (path === '/api/results') { json(res, 200, results); return; }
        if (parameters.get('revision') !== results.revision) throw new HttpError(409, 'STALE_RESULTS', 'Responses changed. Refresh the inbox before exporting the same snapshot.');
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="formlift-responses.csv"', 'Cache-Control': 'no-store',
          'X-FormLift-Returned': String(results.returned), 'X-FormLift-Total': String(results.total) });
        res.end(resultsCsv(results)); return;
      }
      if (path === '/api/export') {
        if (req.method !== 'GET') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
        const expectedHash = new URL(req.url ?? '/', 'http://localhost').searchParams.get('formHash');
        const snapshot = active;
        if (!snapshot || expectedHash !== snapshot.model.formHash) throw new HttpError(409, 'STALE_FORM', 'Import the current form before exporting it.');
        let bundle: string; let license: string;
        try { [bundle, license] = await Promise.all([readFile(resolve(publicDir, '../offline.js'), 'utf8'), readFile(resolve('LICENSE'), 'utf8')]); }
        catch { throw new HttpError(503, 'EXPORT_UNAVAILABLE', 'Build the offline runner before exporting.'); }
        const html = exportOfflineHtml({ model: snapshot.model, policy, artifactHash: snapshot.artifactHash }, bundle, license);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': 'attachment; filename="formlift-offline.html"', 'Cache-Control': 'no-store' });
        res.end(html); return;
      }
      if (Object.hasOwn(staticFiles, path)) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use GET or HEAD.');
        const [file, mime] = staticFiles[path];
        let contents: Buffer;
        try { contents = await readFile(resolve(publicDir, file)); }
        catch { throw new HttpError(503, 'ASSETS_UNAVAILABLE', 'Build the application before starting the server.'); }
        res.writeHead(200, { 'Content-Type': mime, 'Content-Length': contents.length, 'Cache-Control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : contents); return;
      }
      throw new HttpError(404, 'NOT_FOUND', 'No such route.');
    } catch (error) {
      req.resume();
      if (res.headersSent || res.destroyed) return;
      const known = error instanceof HttpError ? error : new HttpError(500, 'INTERNAL_ERROR', 'The local request failed.');
      json(res, known.status, { error: { code: known.code, message: known.message, ...(known.issues ? { issues: known.issues } : {}) } });
    }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000; server.keepAliveTimeout = 1_000;
  return server;
}
