import type { Branch, Field, FormModel, ImportIssue, ImportResult, Target } from './model.js';
import { MAX_INPUT_LENGTH } from './model.js';

/**
 * Adapter for a strict documented subset, not a verified recovery of Typeform behavior.
 * Sources: typeform.com/developers/create/reference/create-form/ and /create/logic-jumps/.
 * Choice conditions use `is` with a `choice` reference, not string-label equality.
 */
type Obj = Record<string, unknown>;
const object = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const dangerous = new Set(['__proto__', 'prototype', 'constructor']);
const refOk = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x) && !dangerous.has(x);
const nonempty = (x: unknown, max = MAX_INPUT_LENGTH): x is string => typeof x === 'string' && x.length > 0 && x.length <= max;

export function importForm(input: unknown): ImportResult {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const error = (path: string, code: string, message: string) => errors.push({ path, code, message });
  const warn = (path: string, message: string) => warnings.push({ path, code: 'COSMETIC_IGNORED', message });
  const rejectRecall = (value: unknown, path: string) => {
    if (typeof value === 'string' && /\{\{[\s\S]*?\}\}/.test(value)) error(path, 'UNSUPPORTED_RECALL', 'Dynamic recall/interpolation is outside this subset.');
  };
  const keys = (o: Obj, allowed: string[], path: string) => {
    for (const k of Object.keys(o)) if (!allowed.includes(k) || dangerous.has(k)) error(`${path}.${k}`, 'UNSUPPORTED_PROPERTY', 'This property is not supported by the declared import subset.');
  };
  const mapObject = (value: unknown, path: string): Obj => {
    if (value === undefined) return {};
    if (!object(value)) { error(path, 'INVALID_OBJECT', 'Expected an object.'); return {}; }
    return value;
  };
  if (!object(input)) return { ok: false, errors: [{ code: 'INVALID_FORM', path: '$', message: 'Expected a form-definition JSON object.' }] };
  keys(input, ['id', 'title', 'type', 'fields', 'logic', 'thankyou_screens', 'welcome_screens', 'settings', 'theme', 'workspace', 'hidden', 'variables', '_links', 'created_at', 'last_updated_at', 'published_at', 'language'], '$');
  if (!nonempty(input.title)) error('$.title', 'INVALID_TITLE', 'A nonempty title of at most 4,096 characters is required.');
  rejectRecall(input.title, '$.title');
  if (input.type !== undefined && input.type !== 'form' && input.type !== 'quiz') error('$.type', 'UNSUPPORTED_FORM_TYPE', 'Only ordinary form definitions are supported.');
  if (input.type === 'quiz') error('$.type', 'UNSUPPORTED_FORM_TYPE', 'Quiz scoring is outside this subset.');
  if (input.hidden !== undefined && (!Array.isArray(input.hidden) || input.hidden.length)) error('$.hidden', 'UNSUPPORTED_HIDDEN_FIELDS', 'Hidden fields are not supported.');
  const variables = mapObject(input.variables, '$.variables');
  for (const [key, value] of Object.entries(variables)) if (!['score', 'price'].includes(key) || value !== 0) error(`$.variables.${key}`, 'UNSUPPORTED_VARIABLE', 'Only unused zero-valued score/price metadata is accepted.');
  if (input.welcome_screens !== undefined && (!Array.isArray(input.welcome_screens) || input.welcome_screens.length)) error('$.welcome_screens', 'UNSUPPORTED_WELCOME', 'Welcome screens are outside this compatibility subset.');
  const settings = mapObject(input.settings, '$.settings');
  const cosmeticSettings = ['language', 'is_public', 'is_trial', 'show_progress_bar', 'progress_bar', 'show_typeform_branding', 'show_time_to_complete', 'show_number_of_submissions', 'show_question_number', 'meta', 'are_uploads_public', 'autosave_progress', 'show_cookie_consent', 'show_keyboard_instructions', 'use_lead_qualification', 'is_closed', 'is_password_protected'];
  keys(settings, cosmeticSettings, '$.settings');
  for (const [key, value] of Object.entries(settings)) {
    if (['autosave_progress', 'use_lead_qualification', 'is_closed', 'is_password_protected'].includes(key) && value !== false) error(`$.settings.${key}`, 'UNSUPPORTED_SETTING', 'This behavior-affecting setting must be false.');
  }
  for (const k of ['settings', 'theme', 'workspace', '_links', 'created_at', 'last_updated_at', 'published_at', 'language']) if (input[k] !== undefined) warn(`$.${k}`, 'Known presentation/account metadata is not reproduced or fetched.');
  if (!Array.isArray(input.fields) || input.fields.length < 1 || input.fields.length > 6) error('$.fields', 'FIELD_LIMIT', 'Supply one to six supported fields.');
  const fields: Field[] = [];
  const fieldRefs = new Set<string>();
  const fieldIds = new Set<string>();
  for (const [i, raw] of (Array.isArray(input.fields) ? input.fields.slice(0, 7) : []).entries()) {
    const path = `$.fields[${i}]`;
    if (!object(raw)) { error(path, 'INVALID_FIELD', 'Expected a field object.'); continue; }
    keys(raw, ['id', 'ref', 'type', 'title', 'properties', 'validations', 'attachment', 'layout'], path);
    if (!refOk(raw.ref) || fieldRefs.has(raw.ref)) { error(`${path}.ref`, 'INVALID_FIELD_REF', 'Field refs must be safe, unique, nonempty identifiers.'); continue; }
    fieldRefs.add(raw.ref);
    if (raw.id !== undefined) {
      if (typeof raw.id !== 'string' || fieldIds.has(raw.id)) error(`${path}.id`, 'INVALID_FIELD_ID', 'Source field IDs must be strings and unique.');
      else fieldIds.add(raw.id);
    }
    if (!nonempty(raw.title)) error(`${path}.title`, 'INVALID_FIELD_TITLE', 'A nonempty bounded field title is required.');
    rejectRecall(raw.title, `${path}.title`);
    for (const k of ['attachment', 'layout']) if (raw[k] !== undefined) warn(`${path}.${k}`, 'Media/layout is ignored and external URLs are never fetched.');
    const props = mapObject(raw.properties, `${path}.properties`);
    const vals = mapObject(raw.validations, `${path}.validations`);
    if (vals.required !== undefined && typeof vals.required !== 'boolean') error(`${path}.validations.required`, 'INVALID_REQUIRED', 'required must be Boolean.');
    const base = { ref: raw.ref, label: typeof raw.title === 'string' ? raw.title : '', required: vals.required === true };
    if (props.description !== undefined) warn(`${path}.properties.description`, 'Descriptions are not rendered in this narrow importer.');
    if (raw.type === 'short_text') {
      keys(props, ['description'], `${path}.properties`);
      keys(vals, ['required', 'max_length'], `${path}.validations`);
      const max = vals.max_length === undefined ? MAX_INPUT_LENGTH : vals.max_length;
      if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > MAX_INPUT_LENGTH) error(`${path}.validations.max_length`, 'UNSUPPORTED_TEXT_LENGTH', 'Supported text maximum is 1–4,096 characters.');
      fields.push({ ...base, kind: 'text', maxLength: typeof max === 'number' ? max : MAX_INPUT_LENGTH });
    } else if (raw.type === 'number') {
      keys(props, ['description'], `${path}.properties`);
      keys(vals, ['required', 'min_value', 'max_value'], `${path}.validations`);
      const f: Field = { ...base, kind: 'number', integerOnly: true };
      for (const [src, dest] of [['min_value', 'min'], ['max_value', 'max']] as const) if (vals[src] !== undefined) {
        const v = vals[src];
        if (typeof v !== 'number' || !Number.isSafeInteger(v)) error(`${path}.validations.${src}`, 'UNSUPPORTED_NUMBER_BOUND', 'Only safe-integer numeric bounds are supported.');
        else f[dest] = v;
      }
      if (f.min !== undefined && f.max !== undefined && f.min > f.max) error(`${path}.validations`, 'INVALID_NUMBER_RANGE', 'Minimum exceeds maximum.');
      fields.push(f);
    } else if (raw.type === 'multiple_choice') {
      keys(props, ['description', 'choices', 'allow_multiple_selection', 'allow_other_choice', 'randomize', 'vertical_alignment'], `${path}.properties`);
      keys(vals, ['required'], `${path}.validations`);
      for (const k of ['allow_multiple_selection', 'allow_other_choice', 'randomize']) if (props[k] !== undefined && props[k] !== false) error(`${path}.properties.${k}`, 'UNSUPPORTED_CHOICE_BEHAVIOR', 'Only fixed single-select choices without Other are supported.');
      if (!Array.isArray(props.choices) || props.choices.length < 2 || props.choices.length > 20) error(`${path}.properties.choices`, 'CHOICE_LIMIT', 'Supply two to twenty choices.');
      const choices: Array<{ ref: string; label: string }> = [];
      const refs = new Set<string>();
      for (const [j, c] of (Array.isArray(props.choices) ? props.choices.slice(0, 21) : []).entries()) {
        const cp = `${path}.properties.choices[${j}]`;
        if (!object(c)) { error(cp, 'INVALID_CHOICE', 'Expected a choice object.'); continue; }
        keys(c, ['id', 'ref', 'label'], cp);
        if (!refOk(c.ref) || refs.has(c.ref)) { error(`${cp}.ref`, 'INVALID_CHOICE_REF', 'Choice refs must be safe and unique within a field.'); continue; }
        refs.add(c.ref);
        if (!nonempty(c.label, 255)) error(`${cp}.label`, 'INVALID_CHOICE_LABEL', 'Choice labels must contain 1–255 characters.');
        rejectRecall(c.label, `${cp}.label`);
        choices.push({ ref: c.ref, label: typeof c.label === 'string' ? c.label : '' });
      }
      fields.push({ ...base, kind: 'choice', choices });
    } else error(`${path}.type`, 'UNSUPPORTED_FIELD_TYPE', 'Only short_text, number, and single-select multiple_choice are supported.');
  }
  const endings: Array<{ ref: string; title: string }> = [];
  if (input.thankyou_screens !== undefined && !Array.isArray(input.thankyou_screens)) error('$.thankyou_screens', 'INVALID_ENDINGS', 'Expected an array.');
  const endingRefs = new Set<string>();
  for (const [i, raw] of (Array.isArray(input.thankyou_screens) ? input.thankyou_screens.slice(0, 3) : []).entries()) {
    const path = `$.thankyou_screens[${i}]`;
    if (!object(raw)) { error(path, 'INVALID_ENDING', 'Expected an ending object.'); continue; }
    keys(raw, ['id', 'ref', 'type', 'title', 'properties', 'attachment', 'layout'], path);
    if (raw.type !== undefined && raw.type !== 'thankyou_screen') error(`${path}.type`, 'UNSUPPORTED_ENDING_TYPE', 'Only ordinary thankyou_screen endings are supported; redirects are outside this subset.');
    if (!refOk(raw.ref) || endingRefs.has(raw.ref)) { error(`${path}.ref`, 'INVALID_ENDING_REF', 'Ending refs must be safe and unique.'); continue; }
    endingRefs.add(raw.ref);
    if (!nonempty(raw.title)) error(`${path}.title`, 'INVALID_ENDING_TITLE', 'A nonempty ending title is required.');
    rejectRecall(raw.title, `${path}.title`);
    const p = mapObject(raw.properties, `${path}.properties`);
    keys(p, ['show_button', 'button_text', 'button_mode', 'redirect_url', 'share_icons'], `${path}.properties`);
    if (p.redirect_url || (p.show_button === true && p.button_mode && p.button_mode !== 'reload')) error(`${path}.properties`, 'UNSUPPORTED_REDIRECT', 'Redirect behavior is not supported.');
    if (Object.keys(p).length || raw.attachment || raw.layout) warn(path, 'Ending decoration and action buttons are not reproduced.');
    endings.push({ ref: raw.ref, title: typeof raw.title === 'string' ? raw.title : '' });
  }
  if (!endingRefs.has('default')) { endings.push({ ref: 'default', title: 'Thank you' }); endingRefs.add('default'); }
  if (endings.length > 2 || (Array.isArray(input.thankyou_screens) && input.thankyou_screens.length > 2)) error('$.thankyou_screens', 'ENDING_LIMIT', 'At most two endings including the default are supported.');
  const defaultNext: Record<string, Target> = Object.create(null);
  fields.forEach((f, i) => { defaultNext[f.ref] = i + 1 < fields.length ? { kind: 'field', ref: fields[i + 1]!.ref } : { kind: 'ending', ref: 'default' }; });
  let branch: Branch | null = null;
  const logic = input.logic === undefined ? [] : input.logic;
  if (!Array.isArray(logic) || logic.length > 1) error('$.logic', 'LOGIC_LIMIT', 'At most one field-triggered logic definition is supported.');
  if (Array.isArray(logic) && logic.length === 1) {
    const rule = logic[0];
    if (!object(rule)) error('$.logic[0]', 'INVALID_LOGIC', 'Expected a logic object.');
    else {
      keys(rule, ['type', 'ref', 'actions'], '$.logic[0]');
      const trigger = fields.find(f => f.ref === rule.ref);
      if (rule.type !== 'field' || !trigger || trigger.kind !== 'choice' || !trigger.required) error('$.logic[0]', 'UNSUPPORTED_TRIGGER', 'The trigger must be a required single-choice field.');
      if (!Array.isArray(rule.actions) || !rule.actions.length || rule.actions.length > 2) error('$.logic[0].actions', 'ACTION_LIMIT', 'Use one choice predicate and optionally one last always jump.');
      const actions = Array.isArray(rule.actions) ? rule.actions : [];
      for (const [i, action] of actions.slice(0, 3).entries()) {
        const ap = `$.logic[0].actions[${i}]`;
        if (!object(action)) { error(ap, 'INVALID_ACTION', 'Expected an action object.'); continue; }
        keys(action, ['action', 'details', 'condition'], ap);
        const details = mapObject(action.details, `${ap}.details`);
        keys(details, ['to'], `${ap}.details`);
        const to = mapObject(details.to, `${ap}.details.to`);
        keys(to, ['type', 'value'], `${ap}.details.to`);
        const condition = mapObject(action.condition, `${ap}.condition`);
        keys(condition, ['op', 'vars'], `${ap}.condition`);
        let target: Target | undefined;
        if (to.type === 'field' && typeof to.value === 'string' && fields.some(f => f.ref === to.value)) target = { kind: 'field', ref: to.value };
        else if (to.type === 'thankyou' && typeof to.value === 'string' && endingRefs.has(to.value)) target = { kind: 'ending', ref: to.value };
        else error(`${ap}.details.to`, 'UNKNOWN_TARGET', 'Jump target must identify an imported field or ending.');
        if (action.action !== 'jump') error(`${ap}.action`, 'UNSUPPORTED_ACTION', 'Only jump actions are supported.');
        if (condition.op === 'always') {
          if (!Array.isArray(condition.vars) || condition.vars.length !== 0 || i !== actions.length - 1) error(`${ap}.condition`, 'INVALID_DEFAULT', 'An always jump must be last with empty vars.');
          if (trigger && target) defaultNext[trigger.ref] = target;
        } else if (condition.op === 'is' && Array.isArray(condition.vars) && condition.vars.length === 2) {
          const [operand, choice] = condition.vars;
          if (object(operand)) keys(operand, ['type', 'value'], `${ap}.condition.vars[0]`);
          if (object(choice)) keys(choice, ['type', 'value'], `${ap}.condition.vars[1]`);
          if (branch || !trigger || trigger.kind !== 'choice' || !object(operand) || operand.type !== 'field' || operand.value !== trigger.ref || !object(choice) || choice.type !== 'choice' || !trigger.choices.some(c => c.ref === choice.value)) error(`${ap}.condition`, 'UNSUPPORTED_PREDICATE', 'One is predicate must compare the trigger field with one of its choice refs.');
          else if (target) branch = { at: trigger.ref, condition: { kind: 'choice-equals', field: trigger.ref, choice: choice.value as string }, whenTrue: target };
        } else error(`${ap}.condition`, 'UNSUPPORTED_PREDICATE', 'Only a single documented choice-is predicate is supported.');
      }
      if (!branch) error('$.logic[0]', 'MISSING_PREDICATE', 'Logic must contain one supported choice predicate.');
    }
  }
  // Strictly forward edges make every accepted route finite, including both branch outcomes.
  for (const [i, field] of fields.entries()) {
    const targets = [defaultNext[field.ref], ...(branch?.at === field.ref ? [branch.whenTrue] : [])];
    for (const target of targets) if (target?.kind === 'field' && fields.findIndex(f => f.ref === target.ref) <= i) error(`$.fields[${i}]`, 'UNSUPPORTED_BACKWARD_ROUTE', 'Only forward routing is supported; Back is a respondent action.');
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 30) };
  const model: FormModel = { schemaVersion: 1, formHash: '', title: input.title as string, fields, branch, defaultNext, endings };
  warnings.push({ code: 'UNVERIFIED_ADAPTER', path: '$', message: 'Documented-schema adapter only. No genuine source behavior has been verified by importing this file.' });
  warnings.push({ code: 'LOCAL_LIMITS', path: '$.fields', message: 'Local limits: safe-integer numbers, 4,096-character text, fixed choices, forward routing. These are not Typeform guarantees.' });
  return { ok: true, model, warnings };
}
