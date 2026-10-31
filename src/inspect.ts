import { reachableFields, replay } from './engine.js';
import { hasOwn, MAX_EVENTS } from './model.js';
import type { BehaviorPolicy, EngineState, FormModel, Presence, Scalar } from './model.js';
import { projectAnswers } from './response.js';

const presence = (values: Record<string, Scalar>, field: string): Presence => {
  if (!hasOwn(values, field)) return { presence: 'missing' };
  const value = values[field];
  return typeof value === 'number'
    ? { presence: 'value', valueType: 'number', value }
    : { presence: 'value', valueType: 'string', value };
};

/** Read-only view of accepted engine state, including unfinished runs. */
export function inspectState(model: FormModel, state: EngineState, policy: BehaviorPolicy) {
  const route = reachableFields(model, state.answers);
  const projected = projectAnswers(model, state, policy);
  return {
    route,
    routeResolved: !model.branch || hasOwn(state.answers, model.branch.condition.field),
    rows: model.fields.map((field, index) => ({
      field: field.ref, label: field.label, active: route.includes(field.ref),
      draft: presence(state.rawInputs, field.ref),
      committed: presence(state.answers, field.ref),
      projected: projected[index].answer,
    })),
  };
}

/** A prefix replay is independent of the live session and has no persistence hook. */
export function inspectReplay(model: FormModel, events: readonly unknown[], policy: BehaviorPolicy, index: number) {
  if (!Array.isArray(events) || events.length > MAX_EVENTS || !Number.isInteger(index) || index < 0 || index > events.length) {
    throw new TypeError('Choose a valid accepted event prefix.');
  }
  const result = replay(model, events.slice(0, index), policy);
  if (!result.ok) throw new TypeError(`Invalid replay at event ${result.eventIndex}: ${result.error.code}`);
  return inspectState(model, result.state, policy);
}
