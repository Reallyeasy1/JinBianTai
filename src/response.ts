import { reachableFields } from './engine.js';
import { hasOwn, validPolicy } from './model.js';
import type { BehaviorPolicy, CanonicalAnswers, EngineState, FormModel, Presence } from './model.js';

/** Local projection under an explicit policy. This alone is never Typeform evidence. */
export function serializeResponse(model: FormModel, state: EngineState, policy: BehaviorPolicy): CanonicalAnswers {
  if (!validPolicy(policy)) throw new TypeError('An explicit valid policy is required.');
  if (state.phase !== 'submitted') throw new TypeError('Only a submitted state can be serialized.');
  const active = new Set(reachableFields(model, state.answers));
  return model.fields.map(field => {
    let answer: Presence = { presence: 'missing' };
    if ((policy.submission === 'answered' || active.has(field.ref)) && hasOwn(state.answers, field.ref)) {
      const value = state.answers[field.ref]!;
      answer = typeof value === 'number' ? { presence: 'value', valueType: 'number', value } : { presence: 'value', valueType: 'string', value };
    }
    return { field: field.ref, answer };
  });
}
