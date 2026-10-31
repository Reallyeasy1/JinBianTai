import { init, transition } from './engine.js';
import type { BehaviorPolicy, EngineState, Event as EngineEvent, Field, FormModel } from './model.js';

type ImportResponse = {
  formHash: string; model: FormModel; policy: BehaviorPolicy; evidenceStatus: string;
  warnings: Array<{ code: string; path: string; message: string }>;
};
type Answer = { field: string; answer: { presence: string; value?: unknown; valueType?: string } };
type Receipt = { responseId: string; formHash: string; receivedAt: string; answers: Answer[]; [key: string]: unknown };

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
};
const runner = $('runner-content');
const fileInput = $<HTMLInputElement>('form-file');
const demoButton = $<HTMLButtonElement>('load-demo');
const resetButton = $<HTMLButtonElement>('reset-run');
let model: FormModel | null = null;
let policy: BehaviorPolicy | null = null;
let state: EngineState | null = null;
let events: EngineEvent[] = [];
let receipt: Receipt | null = null;
let busy = false;
let dirty = false;
let formSource = '';
const MAX_EVENTS = 200;
const MAX_SUBMISSION_BYTES = 64 * 1024;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function announce(message: string): void { $('announcer').textContent = message; }
function setImportError(message: string): void {
  const node = $('import-error');
  node.textContent = message;
  node.hidden = !message;
}

function setBusy(value: boolean): void {
  busy = value;
  fileInput.disabled = value;
  demoButton.disabled = value;
  resetButton.disabled = value || !model;
  runner.setAttribute('aria-busy', String(value));
  runner.querySelectorAll<HTMLInputElement | HTMLButtonElement>('button,input').forEach(control => {
    if (value) {
      control.dataset.wasDisabled = String(control.disabled);
      control.disabled = true;
    } else if (control.dataset.wasDisabled !== undefined) {
      control.disabled = control.dataset.wasDisabled === 'true';
      delete control.dataset.wasDisabled;
    }
  });
}

async function requestJson(path: string, options?: RequestInit): Promise<unknown> {
  const response = await fetch(path, options);
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = data as { error?: { message?: string; issues?: Array<{ path?: string; message?: string }> } };
    const issues = error.error?.issues?.slice(0, 3).map(item => `${item.path || 'Form'}: ${item.message || 'Unsupported value'}`).join(' · ');
    throw new Error([error.error?.message || `Request failed (${response.status}).`, issues].filter(Boolean).join(' '));
  }
  return data;
}

function renderPolicy(): void {
  $('policy-restoration').textContent = policy ? (policy.restoration === 'retain' ? 'Keep draft answers' : 'Clear abandoned answers') : 'Unavailable';
  $('policy-submission').textContent = policy ? (policy.submission === 'active' ? 'Active path only' : 'All answered fields') : 'Unavailable';
  $('mode-badge').textContent = policy?.status === 'OBSERVED' ? 'Operator-supplied policy · unverified' : 'Synthetic behavior policy';
}

function updateInspector(): void {
  resetButton.disabled = busy || !model;
  $('event-count').textContent = `${events.length} ${events.length === 1 ? 'event' : 'events'}`;
  $('definition-name').textContent = model?.title || 'Not loaded';
  $('question-count').textContent = model ? String(model.fields.length) : '—';
  $('save-status').textContent = receipt ? 'Saved locally' : 'Not submitted';
  $('event-trace').textContent = events.length ? JSON.stringify(events, null, 2) : 'No events yet.';
  $('receipt-details').hidden = !receipt;
  $('receipt-json').textContent = receipt ? JSON.stringify(receipt, null, 2) : '';
  const badge = $('form-status');
  badge.textContent = receipt ? 'Saved locally' : model ? (formSource === 'synthetic' ? 'Synthetic demo' : 'Imported · unverified') : 'No form loaded';
  badge.className = `status-pill ${receipt ? 'success' : model ? 'amber' : 'neutral'}`;
}

async function importDefinition(raw: string, source: string): Promise<void> {
  if (busy) return;
  setImportError('');
  setBusy(true);
  try {
    if (new TextEncoder().encode(raw).length > 256 * 1024) throw new Error('The form definition exceeds the 256 KiB local limit.');
    const result = await requestJson('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw }) as ImportResponse;
    model = result.model;
    model.formHash = result.formHash;
    policy = result.policy;
    state = init(model, policy);
    events = [];
    receipt = null;
    dirty = false;
    formSource = source;
    const notice = $('import-notice');
    notice.replaceChildren(element('span', '', 'Definition loaded. Behavior remains unverified against Typeform.'));
    if (result.warnings.length) {
      const list = element('ul');
      result.warnings.slice(0, 5).forEach(warning => list.append(element('li', '', warning.message)));
      notice.append(list);
    }
    notice.hidden = false;
    renderPolicy();
    renderRunner();
    updateInspector();
    announce('Form loaded. First question ready.');
  } catch (error) {
    setImportError(error instanceof Error ? error.message : 'The form could not be loaded.');
  } finally {
    setBusy(false);
    focusQuestion();
  }
}

function fieldError(message: string): void {
  const node = document.getElementById('field-error');
  if (node) {
    node.textContent = message;
    node.hidden = !message;
  }
}

function canAppend(candidate: EngineEvent): boolean {
  if (events.length >= MAX_EVENTS) { fieldError('This run reached the 200-event local limit. Start a fresh run to continue.'); return false; }
  if (new TextEncoder().encode(JSON.stringify({ formHash: model?.formHash, events: [...events, candidate] })).length > MAX_SUBMISSION_BYTES) {
    fieldError('This run exceeds the 64 KiB local submission limit. Start a fresh, shorter run.');
    return false;
  }
  return true;
}

function applyEvent(event: EngineEvent): boolean {
  if (!model || !state || !policy || !canAppend(event)) return false;
  const result = transition(model, state, event, policy);
  if (!result.ok) { fieldError(result.error.message); return false; }
  state = result.state;
  events.push(event);
  updateInspector();
  return true;
}

function flushInput(): boolean {
  if (!dirty || !state || state.current.kind !== 'field') return true;
  const field = model?.fields.find(item => item.ref === state?.current.ref);
  if (!field) return false;
  const input = field.kind === 'choice'
    ? runner.querySelector<HTMLInputElement>('input[name="answer"]:checked')?.value
    : runner.querySelector<HTMLInputElement>('#answer-input')?.value;
  if (input === undefined) return true;
  if (Object.prototype.hasOwnProperty.call(state.rawInputs, field.ref) && state.rawInputs[field.ref] === input) { dirty = false; return true; }
  if (!applyEvent({ type: 'set', field: field.ref, input })) return false;
  dirty = false;
  return true;
}

function navigate(type: 'next' | 'back'): void {
  if (busy || !flushInput() || !applyEvent({ type })) return;
  renderRunner();
  focusQuestion();
}

function button(text: string, id: string, action: () => void, secondary = false): HTMLButtonElement {
  const node = element('button', `button${secondary ? ' secondary' : ''}`, text);
  node.type = 'button';
  node.id = id;
  node.addEventListener('click', action);
  return node;
}

function focusQuestion(): void {
  const target = runner.querySelector<HTMLElement>('input:checked')
    ?? runner.querySelector<HTMLElement>('input, #submit-response, #restart-run');
  target?.focus({ preventScroll: true });
}

function renderField(field: Field): void {
  if (!model || !state) return;
  const caption = element('div', 'form-caption');
  caption.append(element('span', 'form-name', model.title), element('span', '', formSource === 'synthetic' ? 'SYNTHETIC INPUT' : 'UNVERIFIED INPUT'));
  runner.append(caption, element('p', 'question-tag', `QUESTION ${model.fields.findIndex(item => item.ref === field.ref) + 1} / ${model.fields.length}`));
  const title = element('h3', 'question-title', field.label);
  title.id = 'question-title';
  runner.append(title);
  const hints = [field.required ? 'Required' : 'Optional'];
  if (field.kind === 'number') {
    if (field.min !== undefined) hints.push(`Minimum ${field.min}`);
    if (field.max !== undefined) hints.push(`Maximum ${field.max}`);
    if (field.integerOnly) hints.push('Whole numbers');
  }
  runner.append(element('p', 'field-hint', hints.join(' · ')));
  const currentValue = state.rawInputs[field.ref];
  if (field.kind === 'choice') {
    const choices = element('fieldset', 'choice-list');
    choices.setAttribute('aria-labelledby', title.id);
    choices.setAttribute('aria-describedby', 'field-error');
    for (const choice of field.choices) {
      const label = element('label', 'choice-option');
      const radio = element('input');
      radio.type = 'radio';
      radio.name = 'answer';
      radio.value = choice.ref;
      radio.checked = currentValue === choice.ref;
      radio.addEventListener('change', () => { dirty = true; fieldError(''); });
      label.append(radio, element('span', '', choice.label));
      choices.append(label);
    }
    runner.append(choices);
  } else {
    const input = element('input', 'answer-input');
    input.id = 'answer-input';
    // Keep lexical numeric input intact so the shared engine owns validation.
    input.type = 'text';
    input.inputMode = field.kind === 'number' ? 'decimal' : 'text';
    input.autocomplete = 'off';
    input.maxLength = field.kind === 'text' ? Math.min(field.maxLength ?? 4096, 4096) : 4096;
    input.value = currentValue ?? '';
    input.placeholder = field.kind === 'number' ? 'Enter a number…' : 'Type your answer…';
    input.setAttribute('aria-labelledby', title.id);
    input.setAttribute('aria-describedby', 'field-error');
    input.setAttribute('aria-required', String(field.required));
    input.addEventListener('input', () => { dirty = true; fieldError(''); });
    runner.append(input);
  }
  const error = element('p', 'inline-error');
  error.id = 'field-error';
  error.role = 'alert';
  error.hidden = true;
  runner.append(error);
  const actions = element('div', 'question-actions');
  const back = button('← Back', 'back-question', () => navigate('back'), true);
  back.disabled = state.history.length === 0;
  actions.append(back);
  const forward = element('div', 'forward-actions');
  forward.append(element('span', 'keyboard-hint', 'Enter to continue'), button('Continue →', 'next-question', () => navigate('next')));
  actions.append(forward);
  runner.append(actions);
}

function reset(): void {
  if (!model || !policy || busy) return;
  state = init(model, policy);
  events = [];
  receipt = null;
  dirty = false;
  renderRunner();
  updateInspector();
  focusQuestion();
}

function renderRunner(): void {
  if (!model || !state || !policy) return;
  runner.replaceChildren();
  dirty = false;
  if (receipt) {
    runner.append(element('div', 'saved-icon', '✓'), element('p', 'question-tag', 'SAVED ON THIS DEVICE'), element('h3', 'question-title', 'A response you can inspect.'));
    const ending = model.endings.find(item => item.ref === state?.current.ref);
    if (ending?.title) runner.append(element('p', 'ready-text', `Ending: ${ending.title}`));
    runner.append(element('p', 'ready-text', 'The server replayed your accepted events and saved the resulting answers. This confirms the local flow, not Typeform compatibility.'));
    const list = element('dl', 'summary-list');
    for (const row of receipt.answers) {
      const field = model.fields.find(item => item.ref === row.field);
      const wrapper = element('div', 'summary-row');
      const value = row.answer.presence === 'missing' ? 'Not included' : row.answer.presence === 'null' ? 'null' : String(row.answer.value ?? '');
      const display = row.answer.value === '' ? 'Empty string' : value;
      const dd = element('dd', '', display);
      dd.append(element('span', 'value-type', row.answer.presence === 'value' ? row.answer.valueType || 'value' : row.answer.presence));
      wrapper.append(element('dt', '', field?.label || row.field), dd);
      list.append(wrapper);
    }
    runner.append(list, element('p', 'receipt-note', `Receipt ${receipt.responseId}`));
    const actions = element('div', 'question-actions');
    actions.append(button('Download receipt', 'download-receipt', downloadReceipt, true), button('Start a fresh run ↗', 'restart-run', reset));
    runner.append(actions);
  } else if (state.current.kind === 'field') {
    const field = model.fields.find(item => item.ref === state?.current.ref);
    if (field) renderField(field);
  } else {
    runner.append(element('div', 'ready-icon', '↗'), element('p', 'question-tag', 'READY TO SAVE'), element('h3', 'question-title', 'Take one last look.'));
    runner.append(element('p', 'ready-text', 'Your answers are ready. Go back to explore another branch, or submit to save a response locally. Nothing has been saved yet.'));
    const error = element('p', 'inline-error');
    error.id = 'field-error'; error.role = 'alert'; error.hidden = true;
    runner.append(error);
    const actions = element('div', 'question-actions');
    actions.append(button('← Back', 'back-question', () => navigate('back'), true), button('Save response ↗', 'submit-response', () => { void submit(); }));
    runner.append(actions);
  }
  updateInspector();
}

async function submit(): Promise<void> {
  if (!model || !state || !policy || busy) return;
  const event: EngineEvent = { type: 'submit' };
  if (!canAppend(event)) return;
  const candidate = transition(model, state, event, policy);
  if (!candidate.ok) { fieldError(candidate.error.message); return; }
  fieldError('');
  setBusy(true);
  const submitButton = document.getElementById('submit-response');
  if (submitButton) submitButton.textContent = 'Saving…';
  try {
    const response = await requestJson('/api/responses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ formHash: model.formHash, events: [...events, event] }) }) as Receipt;
    state = candidate.state;
    events.push(event);
    receipt = response;
    renderRunner();
    announce('Response saved locally. Receipt available.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Save was not confirmed.';
    fieldError(`${message} Your run is preserved. If the connection was interrupted, retrying may create a duplicate.`);
    if (submitButton) submitButton.textContent = 'Retry save ↗';
  } finally {
    setBusy(false);
  }
}

function downloadReceipt(): void {
  if (!receipt) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' }));
  const anchor = element('a');
  anchor.href = url;
  anchor.download = 'formlift-response.json';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

demoButton.addEventListener('click', () => {
  if (busy) return;
  void fetch('/demo.json').then(response => {
    if (!response.ok) throw new Error('The synthetic fixture could not be loaded.');
    return response.text();
  }).then(raw => importDefinition(raw, 'synthetic')).catch(error => setImportError(error instanceof Error ? error.message : 'Demo unavailable.'));
});
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (file.size > 256 * 1024) { setImportError('The file exceeds the 256 KiB local limit.'); fileInput.value = ''; return; }
  void file.text().then(raw => importDefinition(raw, 'imported')).catch(() => setImportError('The file could not be read.'));
  fileInput.value = '';
});
resetButton.addEventListener('click', reset);
runner.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Enter' || event.isComposing || event.target instanceof HTMLButtonElement || busy) return;
  if (state?.phase === 'editing') { event.preventDefault(); navigate('next'); }
});

void requestJson('/api/status').then(data => {
  const status = data as { policy: BehaviorPolicy; referenceStatus: string };
  policy = status.policy;
  renderPolicy();
  $('reference-verdict').textContent = status.referenceStatus === 'BLOCKED' ? 'Blocked' : 'Unverified';
}).catch(() => {
  $('reference-verdict').textContent = 'Unavailable';
  $('reference-description').textContent = 'The local server could not be reached. Start it and reload this page.';
  renderPolicy();
});
