export type Ref = string;
export type Scalar = string | number;
export type Field =
  | { ref: Ref; kind: 'text'; label: string; required: boolean; maxLength: number }
  | { ref: Ref; kind: 'number'; label: string; required: boolean; min?: number; max?: number; integerOnly: boolean }
  | { ref: Ref; kind: 'choice'; label: string; required: boolean; choices: Array<{ ref: Ref; label: string }> };
export type Target = { kind: 'field'; ref: Ref } | { kind: 'ending'; ref: Ref };
export type Branch = { at: Ref; condition: { kind: 'choice-equals'; field: Ref; choice: Ref }; whenTrue: Target };
export type FormModel = {
  schemaVersion: 1; formHash: string; title: string; fields: Field[];
  branch: Branch | null; defaultNext: Record<Ref, Target>;
  endings: Array<{ ref: Ref; title: string }>;
};
export type BehaviorPolicy = {
  id: string; status: 'SYNTHETIC' | 'OBSERVED';
  restoration: 'retain' | 'clear'; submission: 'active' | 'answered';
};
export type Event = { type: 'set'; field: Ref; input: string } | { type: 'next' } | { type: 'back' } | { type: 'submit' };
export type EngineState = {
  current: Target; history: Ref[]; rawInputs: Record<Ref, string>;
  answers: Record<Ref, Scalar>; phase: 'editing' | 'ready' | 'submitted';
};
export type Observation =
  | { type: 'visit'; field: Ref; input?: string }
  | { type: 'ending'; ref: Ref }
  | { type: 'submitted'; ref: Ref };
export type ImportIssue = { code: string; path: string; message: string };
export type ImportResult = { ok: true; model: FormModel; warnings: ImportIssue[] } | { ok: false; errors: ImportIssue[] };
export type TransitionResult =
  | { ok: true; state: EngineState; observations: Observation[] }
  | { ok: false; state: EngineState; error: ImportIssue };
export type ReplayResult =
  | { ok: true; state: EngineState; observations: Observation[] }
  | { ok: false; state: EngineState; observations: Observation[]; error: ImportIssue; eventIndex: number };
export type Presence =
  | { presence: 'missing' }
  | { presence: 'null' }
  | { presence: 'value'; valueType: 'string'; value: string }
  | { presence: 'value'; valueType: 'number'; value: number }
  | { presence: 'value'; valueType: 'boolean'; value: boolean };
export type CanonicalAnswers = Array<{ field: Ref; answer: Presence }>;
export const MAX_INPUT_LENGTH = 4096;
export const MAX_EVENTS = 200;
export const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);
export function validPolicy(value: unknown): value is BehaviorPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === 'string' && p.id.length > 0 && p.id.length <= 128 &&
    (p.status === 'SYNTHETIC' || p.status === 'OBSERVED') &&
    (p.restoration === 'retain' || p.restoration === 'clear') &&
    (p.submission === 'active' || p.submission === 'answered');
}
