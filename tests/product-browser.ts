import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createApp } from '../src/server.js';
import { sourceFingerprint } from '../scripts/verify.js';

// These journeys use synthetic data and actual local HTTP/JSONL persistence.
type Check = { id: string; description: string; status: 'PASS' | 'FAIL'; error?: string };
class Blocked extends Error {}
const startedAt = new Date().toISOString();
const fingerprint = await sourceFingerprint(process.cwd());
const temporary = await mkdtemp(join(tmpdir(), 'formlift-product-browser-'));
const dataFile = join(temporary, 'responses.jsonl');
const artifacts = resolve('.formlift/product-browser');
const server = createApp({ dataFile, publicDir: resolve('dist/public') });
const checks: Check[] = [];
const planned = 3;
let browser: Browser | undefined;
let browserVersion: string | undefined;
let base = '';
let status: 'PASS' | 'FAIL' | 'BLOCKED' = 'BLOCKED';
let exit = 2;
let blocker: string | undefined;
let buildFingerprint: string | undefined;
let finishedFingerprint: string | undefined;
await mkdir(artifacts, { recursive: true });
await mkdir(resolve('reports'), { recursive: true });

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replaceAll(process.cwd(), '<repository>').replaceAll(temporary, '<test-data>')
    .replace(/\/(?:workspace|tmp|root|home|opt)\/[^\s"'<>]+/g, '<local-path>')
    .replace(/\b[A-Za-z]:\\[^\s"'<>]+/g, '<local-path>');
}
async function fixture() { return JSON.parse(await readFile('tests/fixtures/synthetic-form.json', 'utf8')); }
async function rows(): Promise<any[]> {
  try { const text = await readFile(dataFile, 'utf8'); return text.trim() ? text.trim().split('\n').map(line => JSON.parse(line)) : []; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}
async function upload(page: Page, value: unknown) {
  await page.locator('#tab-run').click();
  const imported = page.waitForResponse(response => new URL(response.url()).pathname === '/api/import' && response.request().method() === 'POST');
  await page.locator('#form-file').setInputFiles({ name: 'synthetic-product.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  assert.equal((await imported).status(), 200);
  await page.waitForFunction(() => !(document.querySelector('#form-file') as HTMLInputElement)?.disabled);
  await page.locator('#question-title').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#tab-run').getAttribute('aria-selected'), 'true');
}
async function choose(page: Page, value: string) {
  await page.locator(`input[name="answer"][value="${value}"]`).check();
  await page.locator('#next-question').click();
}
async function save(page: Page, contact: string) {
  await page.locator('#answer-input').fill(contact);
  await page.locator('#next-question').click();
  await page.locator('#submit-response').click();
  await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved locally');
  await page.locator('#tab-inspect').click();
  const receipt = JSON.parse(await page.locator('#receipt-json').textContent() || 'null');
  assert.ok((await rows()).some(record => record.responseId === receipt.responseId));
  await page.locator('#tab-run').click();
  return receipt;
}
async function noOverflow(page: Page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'No page-level horizontal overflow');
}
async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), 10_000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
async function selected(page: Page, name: string) {
  for (const task of ['run', 'inspect', 'responses', 'costs']) {
    const tab = page.locator(`#tab-${task}`);
    assert.equal(await tab.getAttribute('role'), 'tab');
    assert.equal(await tab.getAttribute('aria-selected'), String(task === name));
    assert.equal(await tab.getAttribute('tabindex'), task === name ? '0' : '-1');
    const controls = await tab.getAttribute('aria-controls'); assert.ok(controls);
    const panel = page.locator(`#${controls}`);
    assert.equal(await panel.getAttribute('role'), 'tabpanel');
    assert.equal(await panel.getAttribute('aria-labelledby'), `tab-${task}`);
    assert.equal(await panel.isVisible(), task === name);
  }
}
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"') { if (csv[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += c;
      continue;
    }
    if (c === '"' && !cell && !closed) { quoted = true; continue; }
    if (c === ',') { row.push(cell); cell = ''; closed = false; continue; }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && csv[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = ''; closed = false; continue;
    }
    assert.equal(closed, false); cell += c;
  }
  assert.equal(quoted, false);
  if (cell || row.length || closed) { row.push(cell); rows.push(row); }
  assert.ok(rows.every(row => row.length === rows[0].length));
  return rows;
}
async function loadedCount(page: Page, count: number) {
  await page.waitForFunction(expected => document.querySelectorAll('#results-body tr[data-response-id]').length === expected &&
    !(document.querySelector('#results-refresh') as HTMLButtonElement)?.disabled, count);
}
async function check(id: string, description: string, action: (page: Page, context: BrowserContext) => Promise<void>) {
  const context = await browser!.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(10_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try { await action(page, context); assert.deepEqual(errors, []); checks.push({ id, description, status: 'PASS' }); }
  catch (error) {
    checks.push({ id, description, status: 'FAIL', error: safeError(error) });
    await page.screenshot({ path: join(artifacts, `${id}-failure.png`), fullPage: true }).catch(() => undefined);
  } finally { await context.close(); }
}

try {
  try {
    const stamp = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
    if (stamp.schemaVersion !== 'formlift-build/1' || stamp.fingerprint !== fingerprint) throw new Error('Stale build');
    buildFingerprint = stamp.fingerprint;
  } catch { throw new Blocked('A build matching current source is required.'); }
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
    }); browserVersion = browser.version();
  } catch (error) { throw new Blocked(`Browser unavailable: ${safeError(error).split('\n')[0]}`); }

  await check('PRODUCT-TABS', 'Accessible task navigation preserves uncommitted input and honest route progress on desktop/mobile', async page => {
    await page.goto(base, { waitUntil: 'networkidle' });
    await upload(page, await fixture()); await selected(page, 'run');
    let saves = 0; page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/responses')) saves++; });
    assert.match(await page.locator('#question-progress').innerText(), /route not chosen/i);
    await choose(page, 'yes');
    assert.match(await page.locator('#question-progress').innerText(), /2 of 3/);
    await page.locator('#answer-input').fill('123');
    const before = await page.locator('#event-trace').textContent();
    await page.locator('#tab-inspect').click(); await selected(page, 'inspect');
    await page.locator('#tab-inspect').press('ArrowRight'); await selected(page, 'responses');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'tab-responses');
    await page.locator('#tab-responses').press('Home'); await selected(page, 'run');
    assert.equal(await page.locator('#answer-input').inputValue(), '123');
    await page.locator('#tab-run').press('End'); await selected(page, 'costs');
    await page.locator('#tab-costs').press('ArrowRight'); await selected(page, 'run');
    assert.equal(await page.locator('#answer-input').inputValue(), '123');
    assert.equal(await page.locator('#event-trace').textContent(), before, 'Tab changes must not flush or add events');
    await page.locator('#back-question').click(); await choose(page, 'no');
    assert.match(await page.locator('#question-progress').innerText(), /2 of 2/);
    await page.screenshot({ path: join(artifacts, 'run-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const task of ['run', 'inspect', 'responses', 'costs']) { await page.locator(`#tab-${task}`).click(); await noOverflow(page); }
    await page.locator('#tab-inspect').click();
    for (const column of ['route', 'draft', 'committed', 'projected']) {
      const cell = page.locator(`#branch-rows tr[data-field="budget"] [data-column="${column}"]`);
      assert.equal(await cell.isVisible(), true);
      const box = await cell.boundingBox(); assert.ok(box);
      assert.ok(box.x >= 0 && box.x + box.width <= 390, `${column} must fit on a mobile card without a sideways scroll`);
    }
    await page.screenshot({ path: join(artifacts, 'inspect-mobile.png'), fullPage: true });
    assert.equal(saves, 0); assert.equal((await rows()).length, 0);
  });

  await check('PRODUCT-RESULTS', 'Two real responses, persisted inbox, parsed CSV download, reload, and form isolation', async page => {
    const input = await fixture(); input.fields[2].title = 'Synthetic contact, "name"';
    await page.goto(base, { waitUntil: 'networkidle' }); await upload(page, input);
    await choose(page, 'no');
    const first = await save(page, 'Synthetic, "first"');
    await page.locator('#restart-run').click(); await choose(page, 'yes');
    await page.locator('#answer-input').fill('0'); await page.locator('#next-question').click();
    const second = await save(page, '=2+2');
    await page.locator('#view-responses').click(); await loadedCount(page, 2); await selected(page, 'responses');
    const displayed = await page.locator('#results-body tr[data-response-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-response-id')));
    assert.deepEqual(displayed, [second.responseId, first.responseId]);
    assert.match(await page.locator('#results-body').innerText(), /Synthetic, "first"/);
    assert.match(await page.locator('#results-body').innerText(), /=2\+2/);
    const stored = (await rows()).filter(record => record.formHash === first.formHash);
    assert.equal(stored.length, 2);
    const pendingDownload = page.waitForEvent('download'); await page.locator('#results-export').click();
    const download = await pendingDownload; const destination = join(temporary, 'product-results.csv'); await download.saveAs(destination);
    assert.equal(await download.failure(), null);
    const parsed = parseCsv(await readFile(destination, 'utf8'));
    assert.equal(parsed.length, 3); assert.deepEqual(parsed[0].slice(0, 2), ['responseId', 'receivedAt']);
    assert.equal(parsed[0][8], 'Synthetic contact, "name" [contact]');
    const byId = new Map(parsed.slice(1).map(row => [row[0], row]));
    assert.deepEqual(byId.get(first.responseId)?.slice(5), ['', 'missing', '', 'Synthetic, "first"', 'value', 'string']);
    assert.deepEqual(byId.get(second.responseId)?.slice(5), ['0', 'value', 'number', "'=2+2", 'value', 'string']);
    for (const record of stored) assert.equal(byId.get(record.responseId)?.[1], record.receivedAt);
    assert.equal(stored.find(record => record.responseId === second.responseId).answers.find((answer: any) => answer.field === 'contact').answer.value, '=2+2');
    await page.screenshot({ path: join(artifacts, 'responses-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page);
    await page.screenshot({ path: join(artifacts, 'responses-mobile.png'), fullPage: true });
    await page.reload({ waitUntil: 'networkidle' }); await upload(page, input);
    await page.locator('#tab-responses').click(); await loadedCount(page, 2);
    const changed = structuredClone(input); changed.fields[2].title = 'Different synthetic form';
    await upload(page, changed); await page.locator('#tab-responses').click(); await loadedCount(page, 0);
    assert.equal((await page.locator('#results-body').innerText()).includes('Synthetic, "first"'), false);
    await upload(page, input); await page.locator('#tab-responses').click(); await loadedCount(page, 2);
    assert.equal((await rows()).filter(record => record.formHash === first.formHash).length, 2, 'Reload/import/CSV must not create responses');
  });

  await check('PRODUCT-SNAPSHOT', 'CSV detects a changed snapshot and stale asynchronous inbox responses cannot replace a newly imported form', async page => {
    const input = await fixture(); input.fields[2].title = 'Synthetic snapshot case';
    await page.goto(base, { waitUntil: 'networkidle' }); await upload(page, input);
    await choose(page, 'no'); const receipt = await save(page, 'Synthetic snapshot first');
    await page.locator('#tab-responses').click(); await loadedCount(page, 1);
    const appended = await fetch(base + '/api/responses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      formHash: receipt.formHash, events: [{ type: 'set', field: 'request', input: 'no' }, { type: 'next' },
        { type: 'set', field: 'contact', input: 'Synthetic snapshot second' }, { type: 'next' }, { type: 'submit' }],
    }) }); assert.equal(appended.status, 201);
    let downloads = 0; page.on('download', () => { downloads++; });
    await page.locator('#results-export').click(); await page.locator('#results-error').waitFor({ state: 'visible' });
    assert.match(await page.locator('#results-error').innerText(), /refresh/i);
    assert.equal(await page.locator('#results-export').isDisabled(), true); assert.equal(downloads, 0);
    await page.locator('#results-refresh').click(); await loadedCount(page, 2);
    assert.equal(await page.locator('#results-export').isEnabled(), true);
    let captured!: () => void, release!: () => void, fulfilled!: () => void;
    const capturedResponse = new Promise<void>(resolve => { captured = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const sent = new Promise<void>(resolve => { fulfilled = resolve; });
    await page.route('**/api/results?**', async route => {
      if (new URL(route.request().url()).searchParams.get('formHash') !== receipt.formHash) { await route.continue(); return; }
      const response = await route.fetch(); captured(); await held;
      // Aborting a superseded fetch is also a valid way to prevent stale UI data.
      await route.fulfill({ response }).catch(() => undefined); fulfilled();
    });
    try {
      await page.locator('#results-refresh').click(); await bounded(capturedResponse, 'Capturing old response');
      const changed = structuredClone(input); changed.fields[2].title = 'New form while old response is in flight';
      await upload(page, changed); await page.locator('#tab-responses').click(); await loadedCount(page, 0);
      release(); await bounded(sent, 'Settling old response');
      // Wait for the delayed fetch to settle through the browser event loop before checking identity.
      await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('#results-body tr[data-response-id]').count(), 0);
      assert.equal((await page.locator('#results-body').innerText()).includes('Synthetic snapshot first'), false);
      assert.equal(await page.locator('#results-error').isVisible(), false);
    } finally { release(); await page.unroute('**/api/results?**'); }
  });

  status = checks.some(check => check.status === 'FAIL') ? 'FAIL' : 'PASS'; exit = status === 'PASS' ? 0 : 1;
} catch (error) {
  if (error instanceof Blocked) { status = 'BLOCKED'; exit = 2; blocker = safeError(error); }
  else { status = 'FAIL'; exit = 1; checks.push({ id: 'HARNESS', description: 'Browser harness setup/execution', status: 'FAIL', error: safeError(error) }); }
} finally {
  await browser?.close();
  if (server.listening) await new Promise<void>(done => server.close(() => done()));
  try {
    finishedFingerprint = await sourceFingerprint(process.cwd());
    if (finishedFingerprint !== fingerprint) { status = 'FAIL'; exit = 1; checks.push({ id: 'BUILD-INTEGRITY', description: 'Source remained unchanged during execution', status: 'FAIL', error: 'Source changed during verification.' }); }
  } catch { if (status !== 'FAIL') { status = 'BLOCKED'; exit = 2; } blocker = 'Could not verify source identity at completion.'; }
  const journeys = checks.filter(check => !['HARNESS', 'BUILD-INTEGRITY'].includes(check.id));
  const report = { schemaVersion: 'formlift-product-browser/1', status, classification: 'SYNTHETIC_ENGINEERING_ONLY', referenceCases: 0,
    fingerprint, buildFingerprint: buildFingerprint ?? null, finishedFingerprint: finishedFingerprint ?? null,
    startedAt, finishedAt: new Date().toISOString(), runtime: { node: process.version, platform: process.platform, architecture: process.arch },
    browser: { engine: 'chromium', version: browserVersion ?? null,
      executable: process.env.CHROMIUM_EXECUTABLE_PATH ? 'environment-override' : 'playwright-default' },
    counts: { planned, executed: journeys.length, passed: journeys.filter(check => check.status === 'PASS').length,
      failed: journeys.filter(check => check.status === 'FAIL').length, skipped: Math.max(0, planned - journeys.length), infrastructureFailures: checks.length - journeys.length },
    checks, ...(blocker ? { blocker } : {}),
  };
  await writeFile('reports/product-browser.json', JSON.stringify(report, null, 2) + '\n');
  await rm(temporary, { recursive: true, force: true }); console.log(JSON.stringify(report, null, 2));
}
process.exitCode = exit;
