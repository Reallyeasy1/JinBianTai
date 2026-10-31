import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { importForm } from '../src/importer.js';
import { init, replay, transition } from '../src/engine.js';
import { serializeResponse } from '../src/response.js';
import type { BehaviorPolicy, Event, FormModel, EngineState } from '../src/model.js';

// Independently authored engineering expectations, never source observations.
const policy: BehaviorPolicy = {
  id: 'qa-synthetic-retain-active', status: 'SYNTHETIC',
  restoration: 'retain', submission: 'active',
};
const fixture = (): any => JSON.parse(readFileSync('tests/fixtures/synthetic-form.json', 'utf8'));
function model(input: unknown = fixture()): FormModel {
  const result = importForm(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('Synthetic test input rejected');
  return result.model;
}
const set = (field: string, input: string): Event => ({ type: 'set', field, input });
const next: Event = { type: 'next' };
const back: Event = { type: 'back' };
const submit: Event = { type: 'submit' };
const yesPath = (budget = '500', contact = 'Sample User'): Event[] => [
  set('request', 'yes'), next, set('budget', budget), next,
  set('contact', contact), next, submit,
];
const noPath = (contact = 'Sample User'): Event[] => [
  set('request', 'no'), next, set('contact', contact), next, submit,
];
const leaveBranch: Event[] = [
  set('request', 'yes'), next, set('budget', '500'), next,
  back, back, set('request', 'no'), next,
];
function run(events: Event[], form = model(), chosenPolicy = policy): EngineState {
  const result = replay(form, events, chosenPolicy);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('Engineering replay failed');
  return result.state;
}
function answer(form: FormModel, state: EngineState, ref: string, chosenPolicy = policy) {
  const result = serializeResponse(form, state, chosenPolicy).find(row => row.field === ref);
  assert.ok(result, `Missing canonical field ${ref}`);
  return result.answer;
}
function rejects(input: unknown) {
  const result = importForm(input);
  assert.equal(result.ok, false, 'Unsupported input must not be silently accepted');
  if (!result.ok) {
    assert.ok(result.errors.length);
    assert.ok(result.errors.every(issue => typeof issue.path === 'string' && issue.message.length > 0));
  }
}

test('IMP-01: synthetic supported shape preserves references, type, and order', () => {
  const form = model();
  assert.deepEqual(form.fields.map(field => field.ref), ['request', 'budget', 'contact']);
  assert.deepEqual(form.fields.map(field => field.kind), ['choice', 'number', 'text']);
  assert.equal(form.branch?.at, 'request');
  assert.deepEqual(form.branch?.whenTrue, { kind: 'field', ref: 'contact' });
});

test('IMP-02: malformed structures and unsupported semantic field types reject', () => {
  for (const input of [null, [], 'not an object', {}, { fields: [] }]) rejects(input);
  const input = fixture(); input.fields[1].type = 'file_upload'; rejects(input);
});

test('IMP-02: too many fields and multiple selection reject', () => {
  const tooMany = fixture();
  tooMany.fields.push(...Array.from({ length: 4 }, (_, i) => ({
    ref: `extra-${i}`, type: 'short_text', title: 'Extra', properties: {}, validations: {},
  })));
  rejects(tooMany);
  const multi = fixture(); multi.fields[0].properties.allow_multiple_selection = true; rejects(multi);
});

test('IMP-03: duplicate references, unknown jump targets, and forward cycles reject', () => {
  const duplicate = fixture(); duplicate.fields[1].ref = 'request'; rejects(duplicate);
  const dangling = fixture(); dangling.logic[0].actions[0].details.to.value = 'unknown'; rejects(dangling);
  const cycle = fixture(); cycle.logic[0].actions[0].details.to.value = 'request'; rejects(cycle);
});

test('IMP-02: unsupported operators and unknown behavioral extensions reject', () => {
  const operator = fixture(); operator.logic[0].actions[0].condition.op = 'greater_than'; rejects(operator);
  const scoring = fixture(); scoring.logic[0].actions[0].action = 'add'; rejects(scoring);
  const unknown = fixture(); unknown.new_routing_feature = { enabled: true }; rejects(unknown);
});

test('IMP-02: dynamic recall text is rejected instead of silently changing semantics', () => {
  for (const edit of [
    (input: any) => { input.title = 'Welcome {{field:contact}}'; },
    (input: any) => { input.fields[2].title = 'Hi {{field:request}}'; },
    (input: any) => { input.fields[0].properties.choices[0].label = '{{var:score}}'; },
    (input: any) => { input.thankyou_screens[0].title = 'Thanks {{field:contact}}'; },
  ]) {
    const input = fixture(); edit(input); rejects(input);
  }
});

test('IMP-04: consistent reference and label changes are not hardcoded', () => {
  const original = fixture();
  const changed = JSON.parse(JSON.stringify(original)
    .replaceAll('"request"', '"decision-42"').replaceAll('"budget"', '"quantity-7"')
    .replaceAll('"contact"', '"visitor-9"').replaceAll('"yes"', '"accept-1"')
    .replaceAll('"no"', '"decline-2"'));
  changed.fields[0].title = 'A different prompt';
  changed.fields[0].properties.choices[1].label = 'Skip';
  const form = model(changed);
  const state = run([set('decision-42', 'decline-2'), next, set('visitor-9', 'Other sample'), next, submit], form);
  assert.deepEqual(answer(form, state, 'quantity-7'), { presence: 'missing' });
  assert.deepEqual(answer(form, state, 'visitor-9'), { presence: 'value', valueType: 'string', value: 'Other sample' });
});

test('ENG-01: included route commits a typed number and reaches the ending', () => {
  const form = model(); const state = run(yesPath('375'), form);
  assert.equal(state.phase, 'submitted');
  assert.deepEqual(state.current, { kind: 'ending', ref: 'default' });
  assert.deepEqual(answer(form, state, 'budget'), { presence: 'value', valueType: 'number', value: 375 });
});

test('ENG-01: skipped route never invents an unanswered numeric value', () => {
  const form = model(); const state = run(noPath(), form);
  assert.deepEqual(answer(form, state, 'budget'), { presence: 'missing' });
  assert.equal(state.answers.budget, undefined);
});

test('ENG-02/03: retained draft is independent of final active-route submission', () => {
  const form = model();
  const state = run([...leaveBranch, set('contact', 'Synthetic'), next, submit], form);
  assert.equal(state.rawInputs.budget, '500');
  assert.equal(state.answers.budget, 500);
  assert.deepEqual(answer(form, state, 'budget'), { presence: 'missing' });
});

test('ENG-02: returning to an abandoned branch restores the explicit retain policy', () => {
  const form = model();
  const state = run([...leaveBranch, back, set('request', 'yes'), next], form);
  assert.deepEqual(state.current, { kind: 'field', ref: 'budget' });
  assert.equal(state.rawInputs.budget, '500');
});

test('ENG-02: explicit clear policy removes abandoned raw and committed answers', () => {
  const form = model(); const clearPolicy: BehaviorPolicy = { ...policy, restoration: 'clear' };
  const state = run([...leaveBranch, back, set('request', 'yes'), next], form, clearPolicy);
  assert.equal(state.rawInputs.budget, undefined);
  assert.equal(state.answers.budget, undefined);
});

test('ENG-03: explicit answered policy includes a committed inactive answer', () => {
  const form = model(); const allPolicy: BehaviorPolicy = { ...policy, submission: 'answered' };
  const state = run([...leaveBranch, set('contact', 'Synthetic'), next, submit], form, allPolicy);
  assert.deepEqual(answer(form, state, 'budget', allPolicy), { presence: 'value', valueType: 'number', value: 500 });
});

test('ENG-04: zero is a number, while optional untouched and entered empty text differ', () => {
  const form = model();
  assert.deepEqual(answer(form, run(yesPath('0'), form), 'budget'), { presence: 'value', valueType: 'number', value: 0 });
  const input = fixture(); input.fields[2].validations.required = false;
  const optional = model(input);
  const untouched = run([set('request', 'no'), next, next, submit], optional);
  const empty = run([set('request', 'no'), next, set('contact', ''), next, submit], optional);
  assert.deepEqual(answer(optional, untouched, 'contact'), { presence: 'missing' });
  assert.deepEqual(answer(optional, empty, 'contact'), { presence: 'value', valueType: 'string', value: '' });
});

test('ENG-04: numeric bounds and safe-integer contract reject invalid values', () => {
  const form = model();
  for (const invalid of ['', 'NaN', 'Infinity', 'abc', '-1', '10001', '1.5', '9007199254740992', '-0', '1.0', '0.0', '10000.00', '1e3', '0x10', ' 5']) {
    const ready = run([set('request', 'yes'), next, set('budget', invalid)], form);
    const result = transition(form, ready, next, policy);
    assert.equal(result.ok, false, `Expected rejection for ${JSON.stringify(invalid)}`);
    assert.deepEqual(result.state, ready, 'Rejected Next must preserve visible input and cursor');
  }
});

test('IMP-03: fields and endings that no route reaches are rejected rather than dropped', () => {
  const unreachable = fixture();
  unreachable.logic[0].actions.push({ action: 'jump', details: { to: { type: 'thankyou', value: 'default' } }, condition: { op: 'always', vars: [] } });
  const result = importForm(unreachable);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some(issue => issue.code === 'UNREACHABLE_FIELD' && issue.path === '$.fields[1]'));
  const customEnding = fixture();
  customEnding.thankyou_screens = [{ ref: 'tys_custom', title: 'Imported thanks' }];
  const ending = importForm(customEnding);
  assert.equal(ending.ok, false);
  if (!ending.ok) assert.ok(ending.errors.some(issue => issue.code === 'UNREACHABLE_ENDING' && issue.path === '$.thankyou_screens[0]'));
  const targeted = fixture();
  targeted.thankyou_screens = [{ ref: 'default', title: 'Thank you' }, { ref: 'tys_quote', title: 'Quote requested' }];
  targeted.logic[0].actions[0].details.to = { type: 'thankyou', value: 'tys_quote' };
  const form = model(targeted);
  assert.deepEqual(form.endings.map(e => e.ref), ['default', 'tys_quote']);
  assert.equal(run([set('request', 'no'), next], form).current.ref, 'tys_quote');
});

test('ENG-04: an invalid field can be left with Back without being committed', () => {
  const form = model();
  const state = run([set('request', 'yes'), next, set('budget', 'invalid'), back, set('request', 'no'), next, set('contact', 'Synthetic'), next, submit], form);
  assert.deepEqual(answer(form, state, 'budget'), { presence: 'missing' });
});

test('ENG-05: fresh sessions and replay results have no mutable state leakage', () => {
  const form = model(); const first = run(yesPath(), form); const second = run(yesPath(), form);
  assert.deepEqual(first, second);
  first.rawInputs.contact = 'Changed outside engine'; first.answers.budget = 999;
  assert.equal(second.rawInputs.contact, 'Sample User');
  assert.equal(second.answers.budget, 500);
  assert.equal(init(form, policy).answers.budget, undefined);
});

test('ENG-06: inactive edits, premature Submit, Back at start, and post-submit events reject', () => {
  const form = model(); const initial = init(form, policy);
  for (const event of [set('budget', '500'), submit, back]) {
    const result = transition(form, initial, event, policy);
    assert.equal(result.ok, false); assert.deepEqual(result.state, initial);
  }
  const ended = run(noPath(), form);
  assert.equal(transition(form, ended, back, policy).ok, false);
  assert.equal(transition(form, ended, submit, policy).ok, false);
});

test('ENG-06: malformed event input rejects rather than throwing or mutating', () => {
  const form = model();
  for (const event of [null, {}, { type: 'set', field: 'request', input: 1 }, { type: 'delete' }]) {
    assert.equal(replay(form, [event] as Event[], policy).ok, false);
  }
});

test('ENG-07: committed edits preserve the latest value across repeated branch changes', () => {
  const form = model();
  const state = run([...leaveBranch, back, set('request', 'yes'), next,
    set('budget', '225'), next, set('contact', '例 Sample'), next, submit], form);
  assert.deepEqual(answer(form, state, 'budget'), { presence: 'value', valueType: 'number', value: 225 });
  assert.deepEqual(answer(form, state, 'contact'), { presence: 'value', valueType: 'string', value: '例 Sample' });
});

test('SAFE-01: hostile reference keys reject and never mutate object prototypes', () => {
  const input = fixture(); input.fields[1].ref = '__proto__'; rejects(input);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('IMP-02: documented ordinary ending type imports while redirect and unknown types reject', () => {
  const input = fixture();
  input.thankyou_screens[0].type = 'thankyou_screen';
  assert.equal(importForm(input).ok, true);
  input.thankyou_screens[0].type = 'url_redirect';
  const redirect = importForm(input);
  assert.equal(redirect.ok, false);
  if (!redirect.ok) assert.ok(redirect.errors.some(error => error.code === 'UNSUPPORTED_ENDING_TYPE'));
  input.thankyou_screens[0].type = 'future_behavior';
  assert.equal(importForm(input).ok, false);
});
