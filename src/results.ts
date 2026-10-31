import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isCanonicalAnswers } from './comparison.js';
import type { CanonicalAnswers, FormModel } from './model.js';

export const RESULT_LIMIT = 500;
export const RESULT_BYTES = 8 * 1024 * 1024;
export type SavedResult = { responseId: string; receivedAt: string; answers: CanonicalAnswers };
export type ResultSnapshot = {
  formHash: string; revision: string; fields: Array<{ ref: string; label: string }>;
  total: number; returned: number; limit: number; truncated: boolean; records: SavedResult[];
};
export class ResultsError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const invalid = () => new ResultsError(422, 'RESULTS_INVALID', 'The response log is incomplete or invalid. Preserve the file and review it before retrying.');

/** Bounded snapshot. The caller serializes this with in-process append operations. */
export async function readResults(path: string, model: FormModel): Promise<ResultSnapshot> {
  let bytes = Buffer.alloc(0);
  let file;
  try {
    file = await open(path, 'r');
    if (!(await file.stat()).isFile()) throw new ResultsError(503, 'RESULTS_UNAVAILABLE', 'The response log is unavailable.');
    // Read no more than one byte beyond the limit, even if another process grows the file.
    const buffer = Buffer.alloc(RESULT_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > RESULT_BYTES) throw new ResultsError(413, 'RESULTS_TOO_LARGE', 'The response log exceeds the 8 MiB inbox limit. Back up and archive it before starting a new local log.');
    bytes = buffer.subarray(0, length);
  } catch (error) {
    if (error instanceof ResultsError) throw error;
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new ResultsError(503, 'RESULTS_UNAVAILABLE', 'The response log could not be read.');
  } finally {
    try { await file?.close(); }
    catch { throw new ResultsError(503, 'RESULTS_UNAVAILABLE', 'The response log could not be closed cleanly. Retry before exporting.'); }
  }
  let raw: string;
  try { raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw invalid(); }
  if (raw && !raw.endsWith('\n')) throw invalid();
  const records: SavedResult[] = [];
  const refs = new Set(model.fields.map(field => field.ref));
  let total = 0;
  for (const line of raw ? raw.slice(0, -1).split('\n') : []) {
    if (!line.trim()) throw invalid();
    let value: any;
    try { value = JSON.parse(line); } catch { throw invalid(); }
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.formHash !== 'string') throw invalid();
    if (value.formHash !== model.formHash) continue;
    if (value.schemaVersion !== 1 || typeof value.responseId !== 'string' || !value.responseId || value.responseId.length > 128 ||
        typeof value.receivedAt !== 'string' || value.receivedAt.length > 64 || !Number.isFinite(Date.parse(value.receivedAt)) ||
        !isCanonicalAnswers(value.answers) || value.answers.length !== model.fields.length ||
        !value.answers.every((row: { field: string }) => refs.has(row.field))) throw invalid();
    total++;
    records.push({ responseId: value.responseId, receivedAt: value.receivedAt, answers: value.answers });
    if (records.length > RESULT_LIMIT) records.shift();
  }
  return { formHash: model.formHash, revision: createHash('sha256').update(bytes).digest('hex'),
    fields: model.fields.map(({ ref, label }) => ({ ref, label })),
    total, returned: records.length, limit: RESULT_LIMIT, truncated: total > RESULT_LIMIT, records: records.reverse() };
}

function csvCell(value: string | number | boolean, protectText = true): string {
  let text = String(value);
  // Quoting alone does not stop spreadsheet formulas. Numeric negative values are data, not text formulas.
  if (protectText && (/^[\s\u0000-\u001f\u007f]*[=+\-@＝＋－＠]/u.test(text) || /^[\t\r\n]/.test(text))) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/** Spreadsheet-oriented export; canonical JSON remains the lossless source of truth. */
export function resultsCsv(snapshot: ResultSnapshot): string {
  const columns = ['responseId', 'receivedAt'];
  for (const field of snapshot.fields) {
    const name = `${field.label} [${field.ref}]`;
    columns.push(name, `${name}.presence`, `${name}.type`);
  }
  const lines = [columns.map(value => csvCell(value)).join(',')];
  for (const record of snapshot.records) {
    const cells = [csvCell(record.responseId), csvCell(record.receivedAt)];
    for (const field of snapshot.fields) {
      const answer = record.answers.find(row => row.field === field.ref)!.answer;
      cells.push(answer.presence === 'value' ? csvCell(answer.value, answer.valueType === 'string') : csvCell(''),
        csvCell(answer.presence), csvCell(answer.presence === 'value' ? answer.valueType : ''));
    }
    lines.push(cells.join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
