import { init, transition } from './engine.js';
import { serializeResponse } from './response.js';
import { MAX_EVENTS } from './model.js';
import type { BehaviorPolicy, Event, FormModel } from './model.js';

const data = JSON.parse(document.getElementById('formlift-data')!.textContent!) as {
  model: FormModel; policy: BehaviorPolicy; artifactHash: string;
};
const { model, policy } = data;
const container = document.getElementById('offline-runner')!;
document.getElementById('offline-title')!.textContent = model.title;
let state = init(model, policy);
let events: Event[] = [];
let dirty = false;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', id = ''): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag); value.textContent = text; if (id) value.id = id; return value;
}
function fail(message: string) { document.getElementById('offline-error')!.textContent = message; }
function accept(event: Event): boolean {
  if (events.length >= MAX_EVENTS) { fail('This run reached the 200-event limit. Start a new respondent.'); return false; }
  const result = transition(model, state, event, policy);
  if (!result.ok) { fail(result.error.message); return false; }
  state = result.state; events.push(event); return true;
}
function flush(): boolean {
  if (!dirty || state.current.kind !== 'field') return true;
  const field = model.fields.find(field => field.ref === state.current.ref)!;
  const input = field.kind === 'choice'
    ? container.querySelector<HTMLInputElement>('input[name=answer]:checked')?.value
    : container.querySelector<HTMLInputElement>('#offline-answer')?.value;
  const accepted = input === undefined || state.rawInputs[field.ref] === input || accept({ type: 'set', field: field.ref, input });
  if (accepted) dirty = false;
  return accepted;
}
function button(text: string, id: string, action: () => void): HTMLButtonElement {
  const value = node('button', text, id); value.type = 'button'; value.addEventListener('click', action); return value;
}
function advance(type: 'next' | 'back') { if (flush() && accept({ type })) render(); }
function download() {
  const result = {
    schemaVersion: 'formlift-offline-response/1', persistence: 'DOWNLOAD_REQUIRED',
    evidenceStatus: 'UNVERIFIED', preparedAt: new Date().toISOString(),
    formHash: model.formHash, artifactHash: data.artifactHash, policyId: policy.id, policyStatus: policy.status,
    answers: serializeResponse(model, state, policy), events,
  };
  return JSON.stringify(result, null, 2);
}
function render() {
  dirty = false;
  container.replaceChildren();
  const error = node('p', '', 'offline-error'); error.className = 'error'; error.role = 'alert';
  const actions = node('div'); actions.className = 'actions';
  if (state.phase === 'submitted') {
    container.append(node('h2', 'Response prepared — not sent'), node('p', 'Download the JSON file to keep these answers. This browser cannot confirm that a download was saved.'));
    const result = download();
    container.append(node('pre', result, 'offline-result'));
    actions.append(button('Download response JSON', 'offline-download', () => {
      const url = URL.createObjectURL(new Blob([result], { type: 'application/json' }));
      const link = node('a'); link.href = url; link.download = 'formlift-offline-response.json'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }));
  } else if (state.current.kind === 'ending') {
    container.append(node('h2', 'Ready to prepare your response'), node('p', 'Nothing has been saved or sent.'));
    actions.append(button('Back', 'offline-back', () => advance('back')),
      button('Prepare response', 'offline-prepare', () => { if (accept({ type: 'submit' })) render(); }));
  } else {
    const field = model.fields.find(field => field.ref === state.current.ref)!;
    container.append(node('h2', field.label, 'offline-question-title'));
    const hint = node('p', field.required ? 'Required' : 'Optional'); hint.className = 'muted'; container.append(hint);
    if (field.kind === 'choice') {
      const group = node('fieldset'); group.setAttribute('aria-labelledby', 'offline-question-title');
      for (const choice of field.choices) {
        const label = node('label'); const radio = node('input'); radio.type = 'radio'; radio.name = 'answer'; radio.value = choice.ref;
        radio.checked = state.rawInputs[field.ref] === choice.ref;
        radio.addEventListener('change', () => { dirty = true; });
        label.append(radio, node('span', choice.label)); group.append(label);
      }
      container.append(group);
    } else {
      const input = node('input', '', 'offline-answer'); input.type = 'text'; input.autocomplete = 'off';
      input.inputMode = field.kind === 'number' ? 'decimal' : 'text';
      input.maxLength = field.kind === 'text' ? field.maxLength : 4096;
      input.value = state.rawInputs[field.ref] ?? ''; input.setAttribute('aria-labelledby', 'offline-question-title');
      input.addEventListener('input', () => { dirty = true; });
      input.setAttribute('aria-describedby', 'offline-error'); input.setAttribute('aria-required', String(field.required));
      container.append(input);
    }
    const back = button('Back', 'offline-back', () => advance('back')); back.disabled = !state.history.length;
    actions.append(back, button('Continue', 'offline-next', () => advance('next')));
  }
  container.append(error, actions);
  container.querySelector<HTMLElement>('input:checked, input, #offline-prepare, #offline-download')?.focus({ preventScroll: true });
}
document.getElementById('offline-reset')!.addEventListener('click', () => { state = init(model, policy); events = []; render(); });
container.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.isComposing && !(event.target instanceof HTMLButtonElement) && state.phase === 'editing') {
    event.preventDefault(); advance('next');
  }
});
render();
