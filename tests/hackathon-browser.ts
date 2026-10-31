import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser, type BrowserContext, type Download, type Page } from 'playwright';
import { createApp } from '../src/server.js';
import { sourceFingerprint } from '../scripts/verify.js';

// This suite verifies our synthetic local/offline product, not Typeform compatibility.
type Check = { id: string; description: string; status: 'PASS' | 'FAIL'; error?: string };
class Blocked extends Error {}
const startedAt = new Date().toISOString();
const fingerprint = await sourceFingerprint(process.cwd());
const temporary = await mkdtemp(join(tmpdir(), 'formlift-hackathon-browser-'));
const dataFile = join(temporary, 'responses.jsonl');
const artifacts = resolve('.formlift/hackathon-browser');
const server = createApp({ dataFile, publicDir: resolve('dist/public') });
const checks: Check[] = [];
const planned = 4;
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
async function persisted(): Promise<any[]> {
  try {
    const data = await readFile(dataFile, 'utf8');
    return data.trim() ? data.trim().split('\n').map(line => JSON.parse(line)) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
async function jsonDownload(download: Download, name: string): Promise<any> {
  const destination = join(temporary, name);
  await download.saveAs(destination);
  assert.equal(await download.failure(), null);
  return JSON.parse(await readFile(destination, 'utf8'));
}
async function noOverflow(page: Page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Page must not overflow horizontally');
}
async function check(id: string, description: string, action: (page: Page, context: BrowserContext) => Promise<void>) {
  const context = await browser!.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await action(page, context);
    assert.deepEqual(errors, [], 'No unhandled client exceptions');
    checks.push({ id, description, status: 'PASS' });
  } catch (error) {
    checks.push({ id, description, status: 'FAIL', error: safeError(error) });
    await page.screenshot({ path: join(artifacts, `${id}-failure.png`), fullPage: true }).catch(() => undefined);
  } finally {
    await context.close();
  }
}

try {
  try {
    const stamp = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
    if (stamp.schemaVersion !== 'formlift-build/1' || stamp.fingerprint !== fingerprint) throw new Error('Stale build');
    buildFingerprint = stamp.fingerprint;
  } catch { throw new Blocked('A build matching the current source is required.'); }
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
    });
    browserVersion = browser.version();
  } catch (error) { throw new Blocked(`Browser unavailable: ${safeError(error).split('\n')[0]}`); }

  await check('LAB-BROWSER', 'Synthetic branch experiment, isolated prefix inspection, trace download, and actual server persistence', async page => {
    await page.goto(base, { waitUntil: 'networkidle' });
    const beforeRows = (await persisted()).length;
    let posts = 0;
    page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/responses') posts++; });
    await page.locator('#load-demo').click();
    await page.locator('#question-title').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#run-experiment').isEnabled(), true, 'A fresh synthetic form can start the guided experiment');
    await page.locator('#run-experiment').click();
    await page.locator('#submit-response').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#run-experiment').isDisabled(), true);
    await page.locator('#tab-inspect').click();
    const budget = page.locator('#branch-rows tr[data-field="budget"]');
    assert.match(await budget.locator('[data-column="draft"]').innerText(), /500/);
    assert.match(await budget.locator('[data-column="committed"]').innerText(), /500/);
    assert.match(await budget.locator('[data-column="projected"]').innerText(), /missing/i);
    assert.match(await budget.locator('[data-column="route"]').innerText(), /skipped/i);
    assert.equal(posts, 0, 'Guided experiment must not silently submit');
    const history = JSON.parse(await page.locator('#event-trace').textContent() || 'null');
    assert.ok(history.length > 8);
    await page.locator('#replay-step').focus();
    await page.locator('#replay-step').press('Home');
    assert.match(await budget.locator('[data-column="draft"]').innerText(), /missing/i);
    assert.deepEqual(JSON.parse(await page.locator('#event-trace').textContent() || 'null'), history);
    assert.equal((await persisted()).length, beforeRows);
    await page.locator('#replay-live').click();
    assert.match(await budget.locator('[data-column="draft"]').innerText(), /500/);
    const traceDownload = page.waitForEvent('download');
    await page.locator('#download-trace').click();
    const trace = await jsonDownload(await traceDownload, 'trace.json');
    assert.deepEqual(trace.events, history);
    assert.equal(posts, 0, 'Inspecting or downloading history must not submit');
    await page.locator('#tab-run').click();
    await page.locator('#submit-response').click();
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved locally');
    await page.locator('#tab-inspect').click();
    const receipt = JSON.parse(await page.locator('#receipt-json').textContent() || 'null');
    assert.deepEqual(receipt.answers.find((item: any) => item.field === 'budget').answer, { presence: 'missing' });
    const rows = await persisted();
    assert.equal(rows.length, beforeRows + 1);
    assert.deepEqual(rows.find(item => item.responseId === receipt.responseId)?.answers, receipt.answers);
    assert.equal(posts, 1);
    assert.equal(await page.locator('#reference-verdict').innerText(), 'Blocked');
    await noOverflow(page);
    await page.screenshot({ path: join(artifacts, 'branch-lab-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page);
    await page.screenshot({ path: join(artifacts, 'branch-lab-mobile.png'), fullPage: true });
    await page.locator('#tab-run').click();
    await page.locator('#reset-run').click();
    assert.equal(await page.locator('#run-experiment').isEnabled(), true, 'Reset makes the synthetic experiment available again');
    await page.locator('input[name="answer"][value="yes"]').check();
    assert.equal(await page.locator('#run-experiment').isDisabled(), true, 'Uncommitted respondent input must not be overwritten by the guide');
    await page.locator('#reset-run').click();
    assert.equal(await page.locator('#run-experiment').isEnabled(), true);
    await page.locator('#run-experiment').click();
    await page.locator('#submit-response').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#run-experiment').isDisabled(), true);
    assert.equal(posts, 1, 'Preparing the guide again does not silently submit another response');
    assert.equal((await persisted()).length, beforeRows + 1);
  });

  await check('OFFLINE-BROWSER', 'Downloaded standalone file works without network, renders hostile labels inertly, and downloads an explicitly offline receipt', async (page, context) => {
    const fixture = JSON.parse(await readFile('tests/fixtures/synthetic-form.json', 'utf8'));
    const hostile = '</script><script>window.__formliftInjected=1</script><img src="https://invalid.example/track"> Contact';
    fixture.fields[2].title = hostile;
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('#form-file').setInputFiles({ name: 'synthetic-inert-label.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.locator('#question-title').waitFor({ state: 'visible' });
    const beforeRows = (await persisted()).length;
    const exported = page.waitForEvent('download');
    await page.locator('#export-offline').click();
    const download = await exported;
    const destination = join(temporary, 'offline-form.html');
    await download.saveAs(destination);
    assert.equal(await download.failure(), null);
    const httpRequests: string[] = [];
    const offline = await context.newPage();
    const offlineErrors: string[] = [];
    offline.on('pageerror', error => offlineErrors.push(error.message));
    offline.on('request', request => { if (/^https?:/.test(request.url())) httpRequests.push(request.url()); });
    await context.setOffline(true);
    await offline.goto(pathToFileURL(destination).href, { waitUntil: 'load' });
    await offline.locator('#offline-question-title').waitFor({ state: 'visible' });
    assert.equal(await offline.locator('#offline-question-title').innerText(), 'Request a quote?');
    await offline.locator('input[name="answer"][value="yes"]').check();
    await offline.locator('#offline-next').click();
    await offline.locator('#offline-answer').fill('0');
    await offline.locator('#offline-next').click();
    assert.equal(await offline.locator('#offline-question-title').innerText(), hostile);
    assert.equal(await offline.locator('#offline-question-title img, #offline-question-title script').count(), 0);
    assert.equal(await offline.evaluate(() => (window as unknown as Record<string, unknown>).__formliftInjected), undefined);
    await offline.locator('#offline-answer').fill('Synthetic Offline Respondent');
    await offline.locator('#offline-next').click();
    await offline.locator('#offline-prepare').click();
    const result = JSON.parse(await offline.locator('#offline-result').innerText());
    assert.equal(result.persistence, 'DOWNLOAD_REQUIRED');
    assert.equal(result.evidenceStatus, 'UNVERIFIED');
    assert.deepEqual(result.answers.find((item: any) => item.field === 'budget').answer, { presence: 'value', valueType: 'number', value: 0 });
    assert.equal('responseId' in result, false);
    assert.equal('receivedAt' in result, false);
    const receiptDownload = offline.waitForEvent('download');
    await offline.locator('#offline-download').click();
    const receipt = await jsonDownload(await receiptDownload, 'offline-response.json');
    assert.deepEqual(receipt, result);
    assert.equal((await persisted()).length, beforeRows, 'Offline receipt does not become a server response');
    assert.deepEqual(httpRequests, [], 'The file must not even attempt remote HTTP requests');
    assert.deepEqual(offlineErrors, []);
    await offline.setViewportSize({ width: 390, height: 844 });
    await noOverflow(offline);
    await offline.screenshot({ path: join(artifacts, 'offline-mobile.png'), fullPage: true });
    await offline.locator('#offline-reset').click();
    await offline.locator('input[name="answer"][value="yes"]').check();
    await offline.locator('#offline-next').click();
    assert.equal(await offline.locator('#offline-answer').inputValue(), '', 'A new offline run cannot inherit the previous respondent');
  });

  await check('COST-BROWSER', 'Cost scenarios require an equivalence declaration and retain free-baseline losses', async page => {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('#tab-costs').click();
    await page.locator('#cost-title').click();
    await page.locator('#cost-example').click();
    assert.equal(await page.locator('#cost-comparable').isChecked(), false);
    assert.match(await page.locator('#cost-result').innerText(), /not comparable/i);
    await page.locator('#cost-comparable').check();
    assert.match(await page.locator('#cost-result').innerText(), /46\.00/);
    assert.match(await page.locator('#cost-result').innerText(), /-\s*\$?\s*17(?:\.00)?/);
    await page.locator('#cost-baselineMonthly').fill('0');
    assert.match(await page.locator('#cost-result').innerText(), /-\s*\$?\s*46(?:\.00)?/);
    assert.doesNotMatch(await page.locator('#cost-result').innerText(), /Infinity|NaN/);
    await page.locator('#cost-monthlyResponses').fill('101');
    assert.match(await page.locator('#cost-result').innerText(), /not comparable/i);
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page);
  });

  await check('OFFLINE-PRESENCE', 'Untouched optional text remains missing while intentionally cleared text remains an empty value offline', async (page, context) => {
    const fixture = JSON.parse(await readFile('tests/fixtures/synthetic-form.json', 'utf8'));
    fixture.fields[2].validations.required = false;
    const imported = await fetch(base + '/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixture) });
    assert.equal(imported.status, 200);
    const form = await imported.json();
    const exported = await fetch(`${base}/api/export?formHash=${form.formHash}`);
    assert.equal(exported.status, 200);
    const destination = join(temporary, 'offline-optional.html');
    await writeFile(destination, await exported.text());
    await context.setOffline(true);
    await page.goto(pathToFileURL(destination).href, { waitUntil: 'load' });
    const complete = async () => {
      await page.locator('#offline-next').click();
      await page.locator('#offline-prepare').click();
      return JSON.parse(await page.locator('#offline-result').innerText()).answers.find((item: any) => item.field === 'contact').answer;
    };
    await page.locator('input[name="answer"][value="no"]').check();
    await page.locator('#offline-next').click();
    assert.deepEqual(await complete(), { presence: 'missing' });
    await page.locator('#offline-reset').click();
    await page.locator('input[name="answer"][value="no"]').check();
    await page.locator('#offline-next').click();
    await page.locator('#offline-answer').fill('A draft to clear');
    await page.locator('#offline-answer').fill('');
    assert.deepEqual(await complete(), { presence: 'value', valueType: 'string', value: '' });
  });

  status = checks.some(item => item.status === 'FAIL') ? 'FAIL' : 'PASS';
  exit = status === 'PASS' ? 0 : 1;
} catch (error) {
  if (error instanceof Blocked) { blocker = safeError(error); status = 'BLOCKED'; exit = 2; }
  else { status = 'FAIL'; exit = 1; checks.push({ id: 'HARNESS', description: 'Browser harness setup/execution', status: 'FAIL', error: safeError(error) }); }
} finally {
  await browser?.close();
  if (server.listening) await new Promise<void>(done => server.close(() => done()));
  try {
    finishedFingerprint = await sourceFingerprint(process.cwd());
    if (finishedFingerprint !== fingerprint) {
      status = 'FAIL'; exit = 1;
      checks.push({ id: 'BUILD-INTEGRITY', description: 'Source remained unchanged during browser verification', status: 'FAIL', error: 'Source changed during verification.' });
    }
  } catch { if (status !== 'FAIL') { status = 'BLOCKED'; exit = 2; } blocker = 'Could not verify source identity at completion.'; }
  const journeys = checks.filter(item => !['HARNESS', 'BUILD-INTEGRITY'].includes(item.id));
  const report = {
    schemaVersion: 'formlift-hackathon-browser/1', status, classification: 'SYNTHETIC_ENGINEERING_ONLY', referenceCases: 0,
    startedAt, finishedAt: new Date().toISOString(), fingerprint, buildFingerprint: buildFingerprint ?? null, finishedFingerprint: finishedFingerprint ?? null,
    browser: { engine: 'chromium', version: browserVersion ?? null, executable: process.env.CHROMIUM_EXECUTABLE_PATH ? 'environment-override' : 'playwright-default' },
    counts: { planned, executed: journeys.length, passed: journeys.filter(item => item.status === 'PASS').length,
      failed: journeys.filter(item => item.status === 'FAIL').length, skipped: Math.max(0, planned - journeys.length), infrastructureFailures: checks.length - journeys.length },
    checks, ...(blocker ? { blocker } : {}),
  };
  await writeFile('reports/hackathon-browser.json', JSON.stringify(report, null, 2) + '\n');
  await rm(temporary, { recursive: true, force: true });
  console.log(JSON.stringify(report, null, 2));
}
process.exitCode = exit;
