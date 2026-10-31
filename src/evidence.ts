import { importForm } from './importer.js';
import type { CanonicalAnswers, Presence } from './model.js';

/**
 * Projection of an independently captured Typeform Responses API collection.
 * This module intentionally does not import the runner or its answer serializer:
 * expected source answers must not depend on replacement routing or policy.
 * Schema reference: https://www.typeform.com/developers/responses/reference/retrieve-responses/
 */
export type StoredProjectionResult =
  | { ok: true; answers: CanonicalAnswers; responseId: string; submittedAt: string; projectionVersion: 'typeform-stored-answers/1' }
  | { ok: false; status: 'FAIL' | 'BLOCKED'; code: string; message: string };
export type StoredProjectionOptions = { responseId: string; unfiltered: boolean };

type Obj = Record<string, unknown>;
type SourceChoice = { ref: string; label: string; id?: string };
type SourceField = {
  ref: string;
  type: 'short_text' | 'number' | 'multiple_choice';
  id?: string;
  choices: SourceChoice[];
};
const object = (value: unknown): value is Obj => !!value && typeof value === 'object' && !Array.isArray(value);
const own = (value: object, key: string): boolean => Object.hasOwn(value, key);
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);
function timestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // Date.parse alone normalizes some impossible dates instead of rejecting them.
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]! && hour <= 23 && minute <= 59 && second <= 59;
}

class ProjectionError extends Error {
  constructor(readonly code: string, message: string, readonly status: 'FAIL' | 'BLOCKED' = 'FAIL') { super(message); }
}
function reject(code: string, message: string, status: 'FAIL' | 'BLOCKED' = 'FAIL'): never {
  throw new ProjectionError(code, message, status);
}
function allowedKeys(value: Obj, allowed: readonly string[], code: string): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) reject(code, 'The captured answer contains unsupported properties; no values were discarded.');
}

function fieldsFromDefinition(definition: unknown): SourceField[] {
  const imported = importForm(definition);
  if (!imported.ok) reject('UNSUPPORTED_DEFINITION', 'The definition does not fit the supported import subset.');
  const rows = (definition as Obj).fields as Obj[];
  const ids = new Set<string>();
  return rows.map(raw => {
    let id: string | undefined;
    if (own(raw, 'id')) {
      if (!identifier(raw.id) || ids.has(raw.id)) reject('INVALID_FIELD_IDENTITY', 'Source field IDs must be bounded, nonempty, and unique.');
      id = raw.id;
      ids.add(id);
    }
    const choices: SourceChoice[] = [];
    if (raw.type === 'multiple_choice') {
      const choiceIds = new Set<string>();
      for (const choice of (raw.properties as Obj).choices as Obj[]) {
        let choiceId: string | undefined;
        if (own(choice, 'id')) {
          if (!identifier(choice.id) || choiceIds.has(choice.id)) reject('INVALID_CHOICE_IDENTITY', 'Source choice IDs must be bounded, nonempty, and unique within their field.');
          choiceId = choice.id;
          choiceIds.add(choiceId);
        }
        choices.push({ ref: choice.ref as string, label: choice.label as string, ...(choiceId ? { id: choiceId } : {}) });
      }
    }
    return { ref: raw.ref as string, type: raw.type as SourceField['type'], ...(id ? { id } : {}), choices };
  });
}

function resolveField(value: unknown, fields: SourceField[]): SourceField {
  if (!object(value)) reject('INVALID_ANSWER_FIELD', 'A captured answer requires its source field identity.');
  allowedKeys(value, ['id', 'ref', 'type'], 'INVALID_ANSWER_FIELD');
  let selected: SourceField | undefined;
  for (const key of ['ref', 'id'] as const) {
    if (!own(value, key)) continue;
    if (!identifier(value[key])) reject('INVALID_ANSWER_FIELD', 'Captured field identifiers must be bounded nonempty strings.');
    const match = fields.find(field => field[key] === value[key]);
    if (!match) reject('UNKNOWN_FIELD', 'A captured field identifier is absent from the supplied definition.');
    if (selected && selected !== match) reject('FIELD_IDENTITY_CONFLICT', 'Captured field identifiers disagree.');
    selected = match;
  }
  if (!selected) reject('INVALID_ANSWER_FIELD', 'A captured answer requires a field reference or source ID.');
  if (own(value, 'type') && value.type !== selected.type) reject('FIELD_TYPE_CONFLICT', 'The captured field type disagrees with the supplied definition.');
  return selected;
}

function resolveChoice(value: unknown, field: SourceField): string {
  if (!object(value)) reject('INVALID_CHOICE', 'A choice answer requires a source choice identity.');
  allowedKeys(value, ['id', 'ref', 'label'], 'INVALID_CHOICE');
  let selected: SourceChoice | undefined;
  for (const key of ['ref', 'id'] as const) {
    if (!own(value, key)) continue;
    if (!identifier(value[key])) reject('INVALID_CHOICE', 'Captured choice identifiers must be bounded nonempty strings.');
    const match = field.choices.find(choice => choice[key] === value[key]);
    if (!match) reject('UNKNOWN_CHOICE', 'A captured choice identifier is absent from the supplied definition.');
    if (selected && selected !== match) reject('CHOICE_IDENTITY_CONFLICT', 'Captured choice identifiers disagree.');
    selected = match;
  }
  if (own(value, 'label')) {
    if (typeof value.label !== 'string') reject('INVALID_CHOICE', 'Captured choice labels must be strings.');
    if (selected) {
      if (selected.label !== value.label) reject('CHOICE_IDENTITY_CONFLICT', 'The captured choice label disagrees with its identifier.');
    } else {
      const matches = field.choices.filter(choice => choice.label === value.label);
      if (!matches.length) reject('UNKNOWN_CHOICE', 'The captured choice label is absent from the supplied definition.');
      if (matches.length !== 1) reject('AMBIGUOUS_CHOICE', 'The captured label identifies more than one source choice.');
      selected = matches[0];
    }
  }
  if (!selected) reject('INVALID_CHOICE', 'A captured choice requires a reference, source ID, or unique exact label.');
  return selected.ref;
}

/** A successful projection is schema conversion, not authentication or compatibility. */
export function normalizeStoredResponse(definition: unknown, capture: unknown, options: StoredProjectionOptions): StoredProjectionResult {
  try {
    if (!object(options) || options.unfiltered !== true) reject('UNFILTERED_CAPTURE_REQUIRED', 'Confirm the capture contains the complete, unfiltered answers section.', 'BLOCKED');
    if (!identifier(options.responseId)) reject('RESPONSE_ID_REQUIRED', 'Select one explicit bounded response identifier.');
    const fields = fieldsFromDefinition(definition);
    if (!object(capture) || !Array.isArray(capture.items)) reject('INVALID_COLLECTION', 'Supply a Typeform Responses API collection with an items array.');
    // A bare answer array or "latest response" selection cannot establish identity.
    if (capture.items.some(item => !object(item) || !identifier(item.response_id))) reject('INVALID_COLLECTION', 'Every collection item must have a valid response identifier.');
    const matches = (capture.items as Obj[]).filter(item => item.response_id === options.responseId);
    if (!matches.length) reject('RESPONSE_PENDING', 'The selected response is not in this capture. Recent submissions may not be available yet.', 'BLOCKED');
    if (matches.length !== 1) reject('DUPLICATE_RESPONSE', 'The collection contains duplicate selected response identifiers.');
    const selected = matches[0]!;
    if (selected.response_type === 'partial' || selected.response_type === 'started' || selected.completed === false) reject('INCOMPLETE_RESPONSE', 'A partial or started response cannot establish submitted answers.', 'BLOCKED');
    if ((own(selected, 'response_type') && selected.response_type !== 'completed') || (own(selected, 'completed') && typeof selected.completed !== 'boolean')) reject('INVALID_COMPLETION_METADATA', 'The selected response has unsupported completion metadata.');
    if (!own(selected, 'submitted_at') || selected.submitted_at === undefined || selected.submitted_at === null || selected.submitted_at === '') reject('INCOMPLETE_RESPONSE', 'The selected response has no completed-submission timestamp.', 'BLOCKED');
    if (!timestamp(selected.submitted_at)) reject('INVALID_SUBMITTED_AT', 'The selected response needs a valid ISO submission timestamp.');
    if (!own(selected, 'answers') || selected.answers === null) reject('INCOMPLETE_ANSWERS', 'The selected response lacks a complete answers array; no missing answers were inferred.', 'BLOCKED');
    if (!Array.isArray(selected.answers)) reject('INVALID_ANSWERS', 'The captured answers section must be an array.');
    if (selected.answers.some(answer => answer === null)) reject('INCOMPLETE_ANSWERS', 'An unidentifiable null answer row cannot establish complete unfiltered answers.', 'BLOCKED');

    const captured = new Map<string, Presence>();
    for (const row of selected.answers) {
      if (!object(row)) reject('INVALID_ANSWER', 'Every captured answer must be an object with a source field identity.');
      const field = resolveField(row.field, fields);
      if (captured.has(field.ref)) reject('DUPLICATE_ANSWER', 'The selected response contains multiple answers for one source field.');
      const answerType = field.type === 'short_text' ? 'text' : field.type === 'number' ? 'number' : 'choice';
      if (row.type !== answerType) reject('UNSUPPORTED_ANSWER_TYPE', 'The captured answer type is unsupported or disagrees with its source field.');
      allowedKeys(row, ['field', 'type', answerType], 'UNSUPPORTED_ANSWER_PROPERTY');
      if (!own(row, answerType)) reject('MISSING_ANSWER_VALUE', 'A present answer row is missing its declared value.');
      const value = row[answerType];
      if (value === null) {
        captured.set(field.ref, { presence: 'null' });
      } else if (answerType === 'text') {
        if (typeof value !== 'string') reject('INVALID_TEXT_VALUE', 'A captured text answer must be a string or explicit null.');
        captured.set(field.ref, { presence: 'value', valueType: 'string', value });
      } else if (answerType === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value)) reject('INVALID_NUMBER_VALUE', 'A captured number answer must be a finite number or explicit null.');
        // Keep decimals/out-of-range source values; the comparator must expose them.
        captured.set(field.ref, { presence: 'value', valueType: 'number', value });
      } else {
        captured.set(field.ref, { presence: 'value', valueType: 'string', value: resolveChoice(value, field) });
      }
    }
    return {
      ok: true,
      answers: fields.map(field => ({ field: field.ref, answer: captured.get(field.ref) ?? { presence: 'missing' } })),
      responseId: options.responseId,
      submittedAt: selected.submitted_at,
      projectionVersion: 'typeform-stored-answers/1',
    };
  } catch (error) {
    if (error instanceof ProjectionError) return { ok: false, status: error.status, code: error.code, message: error.message };
    return { ok: false, status: 'FAIL', code: 'INVALID_INPUT', message: 'The definition or capture could not be projected safely.' };
  }
}
