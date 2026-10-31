import { hasOwn, MAX_EVENTS, MAX_INPUT_LENGTH, validPolicy } from './model.js';
import type { BehaviorPolicy, EngineState, Event, Field, FormModel, ImportIssue, Observation, ReplayResult, Scalar, Target, TransitionResult } from './model.js';

const dict = <T>(source?: Record<string, T>): Record<string, T> => Object.assign(Object.create(null), source);
const issue = (code: string, message: string, path = 'events'): ImportIssue => ({ code, message, path });
const copy = (s: EngineState): EngineState => ({ ...s, current: { ...s.current }, history: [...s.history], rawInputs: dict(s.rawInputs), answers: dict(s.answers) });
const visit = (s: EngineState): Observation => s.current.kind === 'ending'
  ? { type: 'ending', ref: s.current.ref }
  : { type: 'visit', field: s.current.ref, ...(hasOwn(s.rawInputs, s.current.ref) ? { input: s.rawInputs[s.current.ref] } : {}) };

export function init(model: FormModel, policy: BehaviorPolicy): EngineState {
  if (!validPolicy(policy)) throw new TypeError('An explicit valid behavior policy is required.');
  if (!model.fields.length) throw new TypeError('The form has no fields.');
  return { current: { kind: 'field', ref: model.fields[0]!.ref }, history: [], rawInputs: dict(), answers: dict(), phase: 'editing' };
}

export function nextTarget(model: FormModel, field: string, answers: Record<string, Scalar>): Target {
  const branch = model.branch;
  if (branch && branch.at === field && hasOwn(answers, branch.condition.field) && answers[branch.condition.field] === branch.condition.choice) return branch.whenTrue;
  const target = model.defaultNext[field];
  if (!target) throw new TypeError('The validated form has a missing route.');
  return target;
}

/** Current forward route, separate from navigation history and retained draft memory. */
export function reachableFields(model: FormModel, answers: Record<string, Scalar>): string[] {
  let target: Target = { kind: 'field', ref: model.fields[0]!.ref };
  const refs: string[] = [];
  while (target.kind === 'field') {
    if (refs.includes(target.ref) || refs.length >= model.fields.length) throw new TypeError('Invalid cyclic route.');
    refs.push(target.ref);
    target = nextTarget(model, target.ref, answers);
  }
  return refs;
}

function parseInput(field: Field, state: EngineState): { ok: true; value?: Scalar } | { ok: false; error: ImportIssue } {
  const present = hasOwn(state.rawInputs, field.ref);
  const raw = present ? state.rawInputs[field.ref]! : '';
  const invalid = (code: string, message: string) => ({ ok: false as const, error: issue(code, message, `fields.${field.ref}`) });
  if (!present || raw === '') {
    if (field.required) return invalid('REQUIRED', 'This answer is required.');
    if (present && field.kind === 'text') return { ok: true, value: '' };
    return { ok: true };
  }
  if (field.kind === 'text') {
    if (raw.length > field.maxLength) return invalid('TEXT_TOO_LONG', `Use at most ${field.maxLength} characters.`);
    return { ok: true, value: raw };
  }
  if (field.kind === 'choice') {
    if (!field.choices.some(c => c.ref === raw)) return invalid('INVALID_CHOICE', 'Select a supported choice.');
    return { ok: true, value: raw };
  }
  // Deliberately strict local numeric grammar: no whitespace coercion, hex, exponent, infinity,
  // decimal notation for whole-number fields, or signed zero. The lexeme is never normalised.
  const grammar = field.integerOnly ? /^-?(?:0|[1-9]\d*)$/ : /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
  if (!grammar.test(raw)) return invalid('INVALID_NUMBER', field.integerOnly ? 'Enter a whole number without decimals.' : 'Enter a valid decimal number.');
  const n = Number(raw);
  if (Object.is(n, -0)) return invalid('INVALID_NUMBER', 'Enter zero without a sign.');
  if (!Number.isFinite(n) || (field.integerOnly && !Number.isSafeInteger(n))) return invalid('INVALID_NUMBER', 'Enter a safe whole number.');
  if (field.min !== undefined && n < field.min) return invalid('NUMBER_TOO_SMALL', `Enter at least ${field.min}.`);
  if (field.max !== undefined && n > field.max) return invalid('NUMBER_TOO_LARGE', `Enter at most ${field.max}.`);
  return { ok: true, value: n };
}

function validEvent(value: unknown): value is Event {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const e = value as Record<string, unknown>;
  if (e.type === 'set') return Object.keys(e).length === 3 && typeof e.field === 'string' && typeof e.input === 'string' && e.input.length <= MAX_INPUT_LENGTH;
  return Object.keys(e).length === 1 && (e.type === 'next' || e.type === 'back' || e.type === 'submit');
}

export function transition(model: FormModel, state: EngineState, event: Event, policy: BehaviorPolicy): TransitionResult {
  const fail = (error: ImportIssue): TransitionResult => ({ ok: false, state, error });
  if (!validPolicy(policy)) return fail(issue('INVALID_POLICY', 'An explicit valid policy is required.', 'policy'));
  if (!validEvent(event)) return fail(issue('INVALID_EVENT', 'Invalid or oversized event.'));
  if (state.phase === 'submitted') return fail(issue('ALREADY_SUBMITTED', 'Start a new response to edit after submission.'));
  const next = copy(state);
  if (event.type === 'set') {
    if (state.phase !== 'editing' || state.current.kind !== 'field' || event.field !== state.current.ref) return fail(issue('INACTIVE_FIELD', 'Only the current question can be edited.'));
    next.rawInputs[event.field] = event.input;
    return { ok: true, state: next, observations: [] };
  }
  if (event.type === 'back') {
    const previous = next.history.pop();
    if (!previous) return fail(issue('NO_PREVIOUS_FIELD', 'There is no previous question.'));
    next.current = { kind: 'field', ref: previous };
    next.phase = 'editing';
    return { ok: true, state: next, observations: [visit(next)] };
  }
  if (event.type === 'submit') {
    if (state.phase !== 'ready' || state.current.kind !== 'ending') return fail(issue('NOT_READY', 'Complete the form before submitting.'));
    // Recheck current active values. The server reaches this state by replaying validated events.
    for (const ref of reachableFields(model, next.answers)) {
      const field = model.fields.find(f => f.ref === ref)!;
      const result = parseInput(field, next);
      if (!result.ok) return fail(result.error);
      if (result.value !== undefined) next.answers[ref] = result.value;
      else delete next.answers[ref];
    }
    next.phase = 'submitted';
    return { ok: true, state: next, observations: [{ type: 'submitted', ref: state.current.ref }] };
  }
  if (state.phase !== 'editing' || state.current.kind !== 'field') return fail(issue('NOT_EDITING', 'There is no current question to advance.'));
  const field = model.fields.find(f => f.ref === state.current.ref);
  if (!field) return fail(issue('UNKNOWN_FIELD', 'Current field is missing.'));
  const parsed = parseInput(field, state);
  if (!parsed.ok) return fail(parsed.error);
  if (parsed.value !== undefined) next.answers[field.ref] = parsed.value;
  else delete next.answers[field.ref];
  if (model.branch?.at === field.ref && !hasOwn(next.answers, field.ref)) return fail(issue('REQUIRED_BRANCH', 'The branching question requires an answer.'));
  if (policy.restoration === 'clear' && model.branch?.at === field.ref) {
    const reachable = new Set(reachableFields(model, next.answers));
    for (const ref of Object.keys(next.rawInputs)) if (!reachable.has(ref)) delete next.rawInputs[ref];
    for (const ref of Object.keys(next.answers)) if (!reachable.has(ref)) delete next.answers[ref];
  }
  next.history.push(field.ref);
  next.current = { ...nextTarget(model, field.ref, next.answers) };
  next.phase = next.current.kind === 'ending' ? 'ready' : 'editing';
  return { ok: true, state: next, observations: [visit(next)] };
}

export function replay(model: FormModel, events: readonly unknown[], policy: BehaviorPolicy): ReplayResult {
  let state = init(model, policy);
  const observations: Observation[] = [visit(state)];
  if (!Array.isArray(events) || events.length > MAX_EVENTS) return { ok: false, state, observations, error: issue('EVENT_LIMIT', `Use at most ${MAX_EVENTS} events.`), eventIndex: -1 };
  for (let i = 0; i < events.length; i++) {
    if (!validEvent(events[i])) return { ok: false, state, observations, error: issue('INVALID_EVENT', 'Invalid or oversized event.', `events[${i}]`), eventIndex: i };
    const result = transition(model, state, events[i] as Event, policy);
    if (!result.ok) return { ...result, observations, eventIndex: i };
    state = result.state;
    observations.push(...result.observations);
  }
  return { ok: true, state, observations };
}
