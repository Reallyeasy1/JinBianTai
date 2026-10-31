import { init, transition, reachableFields } from './engine.js';
import type { BehaviorPolicy, EngineState, Event as EngineEvent, Field, FormModel, Presence } from './model.js';
import { inspectState, inspectReplay } from './inspect.js';
import { calculateCosts, type CostInputs } from './cost.js';

type ImportResponse = {
  formHash: string; model: FormModel; policy: BehaviorPolicy; evidenceStatus: string;
  warnings: Array<{ code: string; path: string; message: string }>;
};
type Answer = { field: string; answer: { presence: string; value?: unknown; valueType?: string } };
type Receipt = { responseId: string; formHash: string; receivedAt: string; answers: Answer[]; [key: string]: unknown };
type ResultRecord = { responseId: string; receivedAt: string; answers: Array<{ field: string; answer: Presence }> };
type ResultsSnapshot = { formHash: string; revision: string; fields: Array<{ ref: string; label: string }>;
  total: number; returned: number; limit: number; truncated: boolean; records: ResultRecord[] };
type Task = 'run' | 'inspect' | 'responses' | 'costs';

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
};
const runner = $('runner-content');
const fileInput = $<HTMLInputElement>('form-file');
const demoButton = $<HTMLButtonElement>('load-demo');
const resetButton = $<HTMLButtonElement>('reset-run');
const experimentButton = $<HTMLButtonElement>('run-experiment');
const exportButton = $<HTMLButtonElement>('export-offline');
const refreshResultsButton = $<HTMLButtonElement>('results-refresh');
const exportResultsButton = $<HTMLButtonElement>('results-export');
let model: FormModel | null = null;
let policy: BehaviorPolicy | null = null;
let state: EngineState | null = null;
let events: EngineEvent[] = [];
let receipt: Receipt | null = null;
let busy = false;
let dirty = false;
let formSource = '';
let replayIndex: number | null = null;
let currentTask: Task = 'run';
let resultsSnapshot: ResultsSnapshot | null = null;
let resultsGeneration = 0;
let resultsLoading = false;
let resultsExporting = false;
const MAX_EVENTS = 200;
const MAX_SUBMISSION_BYTES = 64 * 1024;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function announce(message: string): void { $('announcer').textContent = message; }
function canStartExperiment(): boolean {
  return !model || (formSource === 'synthetic' && events.length === 0 && !dirty && !receipt);
}
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
  experimentButton.disabled = value || !canStartExperiment();
  exportButton.disabled = value || !model;
  updateResultsButtons();
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
  if (!value && currentTask === 'responses' && model && !resultsSnapshot && !resultsLoading) void refreshResults();
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
  experimentButton.disabled = busy || !canStartExperiment();
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
  $('inspect-empty').hidden = !!model;
  updateProgress();
  renderBranchInspector();
}

async function importDefinition(raw: string, source: string): Promise<boolean> {
  if (busy) return false;
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
    replayIndex = null;
    receipt = null;
    dirty = false;
    formSource = source;
    clearResults();
    selectTask('run');
    $('workspace-description').textContent = model.title;
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
    return true;
  } catch (error) {
    setImportError(error instanceof Error ? error.message : 'The form could not be loaded.');
    return false;
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
  replayIndex = null;
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
  runner.append(caption, element('p', 'question-tag', field.kind === 'choice' ? 'Choose one' : field.kind === 'number' ? 'Whole number' : 'Short answer'));
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
      radio.addEventListener('change', () => { dirty = true; experimentButton.disabled = true; fieldError(''); });
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
    input.addEventListener('input', () => { dirty = true; experimentButton.disabled = true; fieldError(''); });
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
  replayIndex = null;
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
    const review = element('div', 'receipt-actions');
    review.append(button('View saved responses', 'view-responses', () => selectTask('responses'), true),
      button('Inspect this run', 'view-inspector', () => selectTask('inspect'), true));
    runner.append(review);
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
    replayIndex = null;
    receipt = response;
    clearResults();
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

function updateProgress(): void {
  const output = $('question-progress');
  if (!model || !state) { output.textContent = 'Load a form to begin'; return; }
  if (receipt) { output.textContent = 'Completed · response saved locally'; return; }
  if (state.current.kind === 'ending') { output.textContent = 'Route complete · ready to save'; return; }
  const route = reachableFields(model, state.answers);
  const position = route.indexOf(state.current.ref) + 1;
  const resolved = !model.branch || Object.prototype.hasOwnProperty.call(state.answers, model.branch.condition.field);
  output.textContent = resolved
    ? `Step ${position} of ${route.length} on this route`
    : `Question ${position} · route not chosen`;
}

const tasks: Task[] = ['run', 'inspect', 'responses', 'costs'];
function selectTask(task: Task, focusTab = false): void {
  currentTask = task;
  for (const item of tasks) {
    const selected = item === task;
    const tab = $<HTMLButtonElement>(`tab-${item}`);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(`panel-${item}`).hidden = !selected;
  }
  if (focusTab) $(`tab-${task}`).focus();
  // Switching tasks deliberately does not flush input, render the questionnaire, or submit.
  if (task === 'responses' && model && !resultsLoading && !resultsSnapshot && !busy) void refreshResults();
}
for (const [index, task] of tasks.entries()) {
  const tab = $<HTMLButtonElement>(`tab-${task}`);
  tab.addEventListener('click', () => selectTask(task));
  tab.addEventListener('keydown', event => {
    let destination: number | undefined;
    if (event.key === 'ArrowRight') destination = (index + 1) % tasks.length;
    if (event.key === 'ArrowLeft') destination = (index + tasks.length - 1) % tasks.length;
    if (event.key === 'Home') destination = 0;
    if (event.key === 'End') destination = tasks.length - 1;
    if (destination !== undefined) { event.preventDefault(); selectTask(tasks[destination], true); }
  });
}

function updateResultsButtons(): void {
  refreshResultsButton.disabled = busy || resultsLoading || !model;
  exportResultsButton.disabled = busy || resultsLoading || resultsExporting || !resultsSnapshot || resultsSnapshot.formHash !== model?.formHash;
}

function clearResults(): void {
  resultsGeneration++;
  resultsSnapshot = null;
  resultsLoading = false;
  resultsExporting = false;
  $('results-body').replaceChildren();
  $('results-head').replaceChildren();
  $('results-table').setAttribute('aria-busy', 'false');
  $('results-scroll').hidden = true;
  $('results-error').hidden = true;
  $('results-error').textContent = '';
  $('results-count').textContent = model ? 'Exact form · saved records' : 'No form selected';
  $('results-status').dataset.state = 'empty';
  $('results-status').textContent = model ? 'Open this tab or refresh to load saved responses.' : 'Load a form to see its saved responses.';
  updateResultsButtons();
}

function renderResults(snapshot: ResultsSnapshot): void {
  $('results-count').textContent = `${snapshot.total} saved · ${snapshot.returned} shown`;
  const status = $('results-status');
  status.dataset.state = snapshot.returned ? 'loaded' : 'empty';
  status.textContent = snapshot.returned
    ? snapshot.truncated
      ? `Showing the latest ${snapshot.returned} of ${snapshot.total} matching responses. CSV exports exactly these rows.`
      : `Showing all ${snapshot.returned} saved responses for this form. CSV exports this same snapshot.`
    : 'No saved responses for this form yet. Complete a questionnaire and choose Save response.';
  $('results-scroll').hidden = snapshot.returned === 0;
  const head = element('tr');
  for (const label of ['Received', ...snapshot.fields.map(field => field.label), 'Record details']) {
    const th = element('th', '', label); th.scope = 'col'; head.append(th);
  }
  $('results-head').replaceChildren(head);
  const body = $('results-body'); body.replaceChildren();
  for (const record of snapshot.records) {
    const tr = element('tr'); tr.dataset.responseId = record.responseId;
    const received = element('td');
    const date = new Date(record.receivedAt);
    const when = element('span', '', Number.isNaN(date.getTime()) ? record.receivedAt : date.toLocaleString());
    when.title = record.receivedAt;
    received.append(when, element('small', 'response-id', record.responseId.slice(0, 8)));
    tr.append(received);
    for (const field of snapshot.fields) {
      const cell = element('td');
      const answer = record.answers.find(item => item.field === field.ref)?.answer;
      if (!answer || answer.presence === 'missing') {
        cell.append(element('span', '', 'Missing'), element('small', 'result-type', 'not included'));
      } else if (answer.presence === 'null') {
        cell.append(element('span', '', 'null'), element('small', 'result-type', 'explicit null'));
      } else {
        cell.append(element('span', '', answer.value === '' ? 'Empty string' : String(answer.value)), element('small', 'result-type', answer.valueType));
      }
      tr.append(cell);
    }
    const detailCell = element('td');
    const details = element('details', 'record-details');
    details.append(element('summary', '', 'Response JSON'), element('pre', '', JSON.stringify(record, null, 2)));
    detailCell.append(details); tr.append(detailCell); body.append(tr);
  }
}

async function refreshResults(): Promise<void> {
  if (!model || busy) return;
  const formHash = model.formHash;
  const generation = ++resultsGeneration;
  resultsLoading = true;
  resultsSnapshot = null;
  resultsExporting = false;
  $('results-error').hidden = true;
  $('results-error').textContent = '';
  $('results-scroll').hidden = true;
  $('results-body').replaceChildren();
  $('results-status').dataset.state = 'loading';
  $('results-status').textContent = 'Reading saved responses…';
  $('results-count').textContent = 'Loading this form’s records';
  $('results-table').setAttribute('aria-busy', 'true');
  updateResultsButtons();
  try {
    const snapshot = await requestJson(`/api/results?formHash=${encodeURIComponent(formHash)}`) as ResultsSnapshot;
    if (generation !== resultsGeneration || model?.formHash !== formHash) return;
    if (snapshot.formHash !== formHash || typeof snapshot.revision !== 'string' || !Array.isArray(snapshot.records) || !Array.isArray(snapshot.fields)) {
      throw new Error('The server returned an unexpected response snapshot. Refresh to try again.');
    }
    resultsSnapshot = snapshot;
    renderResults(snapshot);
  } catch (error) {
    if (generation !== resultsGeneration || model?.formHash !== formHash) return;
    resultsSnapshot = null;
    $('results-status').dataset.state = 'error';
    $('results-status').textContent = 'Responses could not be loaded.';
    $('results-count').textContent = 'No current snapshot';
    $('results-error').textContent = error instanceof Error ? error.message : 'Refresh to try again.';
    $('results-error').hidden = false;
  } finally {
    if (generation === resultsGeneration) {
      resultsLoading = false;
      $('results-table').setAttribute('aria-busy', 'false');
      updateResultsButtons();
    }
  }
}

refreshResultsButton.addEventListener('click', () => { void refreshResults(); });
exportResultsButton.addEventListener('click', () => { void (async () => {
  const snapshot = resultsSnapshot;
  if (!model || busy || resultsLoading || resultsExporting || !snapshot || snapshot.formHash !== model.formHash) return;
  const generation = resultsGeneration;
  resultsExporting = true;
  $('results-error').hidden = true;
  updateResultsButtons();
  try {
    const query = new URLSearchParams({ formHash: snapshot.formHash, revision: snapshot.revision });
    const response = await fetch(`/api/results.csv?${query.toString()}`);
    if (generation !== resultsGeneration || model?.formHash !== snapshot.formHash) return;
    if (!response.ok) {
      if (response.status === 409) {
        resultsSnapshot = null;
        $('results-status').dataset.state = 'error';
        $('results-status').textContent = 'This snapshot is out of date. Refresh to load the current saved responses.';
        $('results-count').textContent = 'Outdated snapshot';
        throw new Error('Saved responses changed. Refresh the inbox before exporting the new snapshot.');
      }
      throw new Error('CSV export could not be completed. Refresh and try again.');
    }
    const blob = await response.blob();
    if (generation !== resultsGeneration || model?.formHash !== snapshot.formHash) return;
    const url = URL.createObjectURL(blob);
    const anchor = element('a'); anchor.href = url; anchor.download = 'formlift-responses.csv'; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('CSV download requested for the displayed response snapshot.');
  } catch (error) {
    if (generation !== resultsGeneration || model?.formHash !== snapshot.formHash) return;
    $('results-error').textContent = error instanceof Error ? error.message : 'CSV export failed.';
    $('results-error').hidden = false;
  } finally {
    if (generation === resultsGeneration) { resultsExporting = false; updateResultsButtons(); }
  }
})(); });

function formatPresence(value: Presence): string {
  if (value.presence === 'missing') return 'Missing';
  if (value.presence === 'null') return 'null';
  return `${JSON.stringify(value.value)} (${value.valueType})`;
}

function renderBranchInspector(): void {
  $('branch-inspector').hidden = !model || !state || !policy;
  if (!model || !state || !policy) return;
  if (replayIndex !== null) replayIndex = Math.max(0, Math.min(events.length, replayIndex));
  const view = replayIndex === null ? inspectState(model, state, policy) : inspectReplay(model, events, policy, replayIndex);
  const slider = $<HTMLInputElement>('replay-step');
  slider.max = String(events.length); slider.value = String(replayIndex ?? events.length);
  $('replay-label').textContent = replayIndex === null
    ? `Live accepted state · ${events.length} events`
    : `Replay step ${replayIndex} of ${events.length} · live respondent unchanged`;
  $('branch-route').textContent = `${view.routeResolved ? 'Current route' : 'Provisional route — branch not committed'}: ${view.route.map(ref => model!.fields.find(field => field.ref === ref)!.label).join(' → ')}`;
  const body = $('branch-rows'); body.replaceChildren();
  for (const row of view.rows) {
    const tr = element('tr'); tr.dataset.field = row.field;
    const label = element('th', '', row.label); label.scope = 'row';
    label.append(element('small', '', row.field)); tr.append(label);
    for (const [column, content] of [
      ['route', row.active ? 'On route' : 'Skipped'], ['draft', formatPresence(row.draft)],
      ['committed', formatPresence(row.committed)], ['projected', formatPresence(row.projected)],
    ]) {
      const td = element('td', column === 'projected' ? 'projection-cell' : '', content); td.dataset.column = column; tr.append(td);
      td.dataset.label = ({ route: 'Route', draft: 'Raw draft', committed: 'Committed', projected: 'Output preview' } as Record<string, string>)[column];
    }
    if (!row.active && row.draft.presence !== 'missing') tr.className = 'retained-row';
    body.append(tr);
  }
}
$<HTMLInputElement>('replay-step').addEventListener('input', event => {
  replayIndex = Number((event.target as HTMLInputElement).value); renderBranchInspector();
});
$('replay-live').addEventListener('click', () => { replayIndex = null; renderBranchInspector(); });
$('download-trace').addEventListener('click', () => {
  if (!model || !policy) return;
  const data = { schemaVersion: 'formlift-replay/1', classification: 'LOCAL_ENGINEERING_NOT_SOURCE_EVIDENCE', model, policy, events };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const anchor = element('a'); anchor.href = url; anchor.download = 'formlift-replay-includes-answers.json'; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});
exportButton.addEventListener('click', () => { void (async () => {
  if (!model || busy) return;
  setBusy(true); setImportError('');
  try {
    const response = await fetch(`/api/export?formHash=${encodeURIComponent(model.formHash)}`);
    if (!response.ok) throw new Error('Export unavailable or the active form changed. Reimport the intended definition and try again.');
    const url = URL.createObjectURL(await response.blob());
    const anchor = element('a'); anchor.href = url; anchor.download = 'formlift-offline.html'; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('Offline form download requested. Open the HTML file in a browser; prior answers are not included.');
  } catch (error) { setImportError(error instanceof Error ? error.message : 'Export failed.'); }
  finally { setBusy(false); }
})(); });

const costFields: Array<[Exclude<keyof CostInputs, 'comparable'>, string]> = [
  ['monthlyResponses', 'Responses each month'], ['baselineMonthly', 'Source subscription / month ($)'],
  ['baselineLimit', 'Responses included in that price'], ['baselineLaborHours', 'Source administration / month (hours)'],
  ['setupHours', 'Incremental migration / setup (hours)'], ['hourlyRate', 'Labor value / hour ($)'],
  ['maintenanceHours', 'Local collection / maintenance / month (hours)'], ['hardwareMonthly', 'Hardware allocation / month ($)'],
  ['powerStorageMonthly', 'Power / storage / backups / month ($)'], ['amortizationMonths', 'Comparison period (months)'],
];
for (const [key, title] of costFields) {
  const label = element('label', '', title); const input = element('input');
  input.type = 'number'; input.min = '0'; input.max = '1000000'; input.step = 'any'; input.id = `cost-${key}`;
  input.addEventListener('input', renderCosts); label.append(input); $('cost-inputs').append(label);
}
function renderCosts(): void {
  const input = Object.fromEntries(costFields.map(([key]) => {
    const value = $<HTMLInputElement>(`cost-${key}`).value;
    return [key, value.trim() === '' ? NaN : Number(value)];
  })) as Omit<CostInputs, 'comparable'>;
  const result = calculateCosts({ ...input, comparable: $<HTMLInputElement>('cost-comparable').checked });
  const output = $('cost-result'); output.replaceChildren();
  if (result.status !== 'ESTIMATE') {
    output.append(element('strong', '', result.status === 'NOT_COMPARABLE' ? 'Not comparable' : 'Complete the scenario'));
    output.append(element('p', 'fine-print', result.reasons.join(' '))); return;
  }
  const dollars = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  output.append(element('strong', '', 'Illustrative estimate — not measured savings'));
  const list = element('dl', 'cost-output');
  const rows: Array<[string, string]> = [
    ['Source monthly total', dollars(result.baselineMonthlyTotal)], ['Local recurring / month', dollars(result.localRecurring)],
    ['One-time setup', dollars(result.setupCost)], ['Local first month', dollars(result.firstMonth)],
    ['First-month saving (negative = more costly)', dollars(result.firstMonthSaving)],
    ['Local monthly cost with setup spread over the period', dollars(result.amortizedMonthly)],
    [`Source / local total over ${input.amortizationMonths} months`, `${dollars(result.periodBaseline)} / ${dollars(result.periodLocal)}`],
    ['Period saving', dollars(result.periodSaving)],
    ['Reduction over this period', result.reductionPercent === null ? 'Not applicable: zero-cost baseline' : `${result.reductionPercent.toFixed(1)}%`],
  ];
  for (const [label, value] of rows) { const row = element('div'); row.append(element('dt', '', label), element('dd', '', value)); list.append(row); }
  output.append(list);
}
$('cost-comparable').addEventListener('change', renderCosts);
$('cost-example').addEventListener('click', () => {
  const sample: Omit<CostInputs, 'comparable'> = { monthlyResponses: 100, baselineMonthly: 29, baselineLimit: 100,
    baselineLaborHours: 0, setupHours: 2, hourlyRate: 20, maintenanceHours: .25, hardwareMonthly: 0,
    powerStorageMonthly: 1, amortizationMonths: 12 };
  for (const [key] of costFields) $<HTMLInputElement>(`cost-${key}`).value = String(sample[key]);
  $<HTMLInputElement>('cost-comparable').checked = false;
  renderCosts();
});

async function loadDemo(experiment = false): Promise<void> {
  if (busy || (experiment && !canStartExperiment())) return;
  setBusy(true);
  let raw: string;
  try {
    const response = await fetch('/demo.json');
    if (!response.ok) throw new Error('The synthetic fixture could not be loaded.');
    raw = await response.text();
  } catch (error) { setImportError(error instanceof Error ? error.message : 'Demo unavailable.'); return; }
  finally { setBusy(false); }
  if (!await importDefinition(raw, 'synthetic') || !experiment) return;
  // This is a labelled engineering history, never a purported original-system observation.
  const sequence: EngineEvent[] = [
    { type: 'set', field: 'request', input: 'yes' }, { type: 'next' },
    { type: 'set', field: 'budget', input: '500' }, { type: 'next' },
    { type: 'back' }, { type: 'back' }, { type: 'set', field: 'request', input: 'no' }, { type: 'next' },
    { type: 'back' }, { type: 'set', field: 'request', input: 'yes' }, { type: 'next' },
    { type: 'back' }, { type: 'set', field: 'request', input: 'no' }, { type: 'next' },
    { type: 'set', field: 'contact', input: 'Synthetic experiment' }, { type: 'next' },
  ];
  for (const event of sequence) {
    if (!applyEvent(event)) { setImportError('The experiment stopped under this local policy. Inspect the accepted events.'); break; }
  }
  renderRunner(); focusQuestion();
  announce('Synthetic branch experiment prepared. Inspect the state, then explicitly save the response.');
}
demoButton.addEventListener('click', () => { void loadDemo(); });
experimentButton.addEventListener('click', () => { void loadDemo(true); });
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
