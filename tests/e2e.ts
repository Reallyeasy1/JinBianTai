import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createApp } from '../src/server.js';
import { sourceFingerprint } from '../scripts/verify.js';

// These are synthetic engineering journeys, not captured Typeform comparisons.
type Check = { id: string; status: 'PASS' | 'FAIL'; description: string; error?: string };
class VerificationBlocked extends Error {}
const startedAt = new Date().toISOString();
const fingerprint = await sourceFingerprint(process.cwd());
const checks: Check[] = [];
const reportPath = resolve('reports/e2e.json');
const privateArtifacts = resolve('.formlift/e2e');
await mkdir(resolve('reports'), { recursive: true });
await mkdir(privateArtifacts, { recursive: true });

const temporary = await mkdtemp(join(tmpdir(), 'formlift-browser-'));
const dataFile = join(temporary, 'responses.jsonl');
const server = createApp({ dataFile, publicDir: resolve('dist/public') });
let browser: Browser | undefined;
let browserVersion: string | undefined;
let base = '';
let status: 'PASS' | 'FAIL' | 'BLOCKED' = 'BLOCKED';
let blocker: string | undefined;
let exit = 2;
let buildFingerprint: string | undefined;
let finishedFingerprint: string | undefined;

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replaceAll(process.cwd(), '<repository>')
    .replaceAll(temporary, '<test-data>')
    .replace(/\/(?:workspace|tmp|root|home|opt)\/[^\s"'<>]+/g, '<local-path>')
    .replace(/\b[A-Za-z]:\\[^\s"'<>]+/g, '<local-path>');
}

async function requireCurrentBuild(): Promise<void> {
  let stamp: unknown;
  try {
    stamp = JSON.parse(await readFile(resolve('dist/build-info.json'), 'utf8'));
  } catch {
    throw new VerificationBlocked('Build metadata is missing or unreadable. Rebuild before browser verification.');
  }
  if (!stamp || typeof stamp !== 'object' ||
      (stamp as { schemaVersion?: unknown }).schemaVersion !== 'formlift-build/1' ||
      typeof (stamp as { fingerprint?: unknown }).fingerprint !== 'string') {
    throw new VerificationBlocked('Build metadata is invalid. Rebuild before browser verification.');
  }
  buildFingerprint = (stamp as { fingerprint: string }).fingerprint;
  if (buildFingerprint !== fingerprint) {
    throw new VerificationBlocked('The compiled build does not match current source. Rebuild before browser verification.');
  }
}

async function rows(): Promise<any[]> {
  try {
    const text = await readFile(dataFile, 'utf8');
    return text.trim() ? text.trim().split('\n').map(line => JSON.parse(line)) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function importFixture(page: Page, value?: unknown): Promise<void> {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('#form-file').setInputFiles(value === undefined
    ? resolve('tests/fixtures/synthetic-form.json')
    : { name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await page.locator('#question-title').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#question-title').textContent(), 'Request a quote?');
  assert.equal(await page.locator('#reference-verdict').textContent(), 'Blocked');
}

async function choice(page: Page, value: 'yes' | 'no'): Promise<void> {
  await page.locator(`input[name="answer"][value="${value}"]`).check();
  await page.locator('#next-question').click();
}

async function complete(page: Page, contact: string): Promise<any> {
  await page.locator('#answer-input').fill(contact);
  await page.locator('#next-question').click();
  await page.locator('#submit-response').click();
  await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved locally');
  await page.locator('#tab-inspect').click();
  const receipt = JSON.parse(await page.locator('#receipt-json').textContent() || 'null');
  assert.ok(receipt?.responseId, 'Visible receipt must have an identifier');
  const persisted = await rows();
  const record = persisted.find(row => row.responseId === receipt.responseId);
  assert.ok(record, 'Browser receipt must correspond to an actual persisted JSONL record');
  assert.deepEqual(record.answers, receipt.answers);
  await page.locator('#tab-run').click();
  return receipt;
}

function answer(receipt: any, field: string): unknown {
  const row = receipt.answers.find((value: any) => value.field === field);
  assert.ok(row, `Canonical output missing ${field}`);
  return row.answer;
}

async function check(id: string, description: string, action: (page: Page) => Promise<void>): Promise<void> {
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  try {
    context = await browser!.newContext({ viewport: { width: 1440, height: 1100 } });
    page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await action(page);
    assert.deepEqual(errors, [], 'No unhandled client exceptions');
    checks.push({ id, status: 'PASS', description });
  } catch (error) {
    checks.push({ id, status: 'FAIL', description, error: safeError(error) });
    await page?.screenshot({ path: join(privateArtifacts, `${id}-failure.png`), fullPage: true }).catch(() => undefined);
  } finally {
    await context?.close();
  }
}

try {
  await requireCurrentBuild();
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
    });
    browserVersion = browser.version();
  } catch (error) {
    blocker = `Browser unavailable: ${safeError(error).split('\n')[0]}`;
  }

  if (browser) {
    await check('UI-01', 'Upload, included route, keyboard navigation, zero, and persisted receipt', async page => {
      await importFixture(page);
      await choice(page, 'yes');
      assert.equal(await page.locator('#question-title').textContent(), 'Budget?');
      await page.locator('#answer-input').fill('0');
      await page.locator('#answer-input').press('Enter');
      assert.equal(await page.locator('#question-title').textContent(), 'Contact name');
      const receipt = await complete(page, 'Synthetic Browser User');
      assert.deepEqual(answer(receipt, 'budget'), { presence: 'value', valueType: 'number', value: 0 });
      assert.equal(await page.locator('#reference-verdict').textContent(), 'Blocked');
      await page.locator('#tab-inspect').click();
      await page.locator('#receipt-details').evaluate(element => { (element as HTMLDetailsElement).open = true; });
      await page.screenshot({ path: join(privateArtifacts, 'desktop.png'), fullPage: true });
      await page.locator('#tab-run').click();
      await page.locator('#restart-run').click();
      await choice(page, 'yes');
      assert.equal(await page.locator('#answer-input').inputValue(), '', 'A fresh respondent run cannot inherit the previous budget');
      assert.equal(await page.locator('#save-status').textContent(), 'Not submitted');
    });

    await check('UI-02', 'Branch return restores the draft; final inactive branch is absent from saved answers', async page => {
      await importFixture(page); await choice(page, 'yes');
      await page.locator('#answer-input').fill('500'); await page.locator('#next-question').click();
      await page.locator('#back-question').click(); await page.locator('#back-question').click();
      await choice(page, 'no');
      assert.equal(await page.locator('#question-title').textContent(), 'Contact name');
      await page.locator('#back-question').click(); await choice(page, 'yes');
      assert.equal(await page.locator('#answer-input').inputValue(), '500');
      await page.locator('#next-question').click();
      await page.locator('#back-question').click(); await page.locator('#back-question').click();
      await choice(page, 'no');
      const receipt = await complete(page, 'Synthetic Branch User');
      assert.deepEqual(answer(receipt, 'budget'), { presence: 'missing' });
      await page.locator('#tab-inspect').click();
      const history = JSON.parse(await page.locator('#event-trace').textContent() || '[]');
      assert.ok(history.some((event: any) => event.type === 'set' && event.field === 'budget' && event.input === '500'));
    });

    await check('UI-03', 'Rejected import preserves the running form and draft input', async page => {
      await importFixture(page); await choice(page, 'yes');
      await page.locator('#answer-input').fill('123');
      await page.locator('#form-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{') });
      await page.locator('#import-error').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#question-title').textContent(), 'Budget?');
      assert.equal(await page.locator('#answer-input').inputValue(), '123');
      await page.locator('#next-question').click();
      const receipt = await complete(page, 'Synthetic Recovery User');
      assert.deepEqual(answer(receipt, 'budget'), { presence: 'value', valueType: 'number', value: 123 });
    });

    await check('UI-04', 'Invalid numeric input remains correctable and Back can leave it', async page => {
      await importFixture(page); await choice(page, 'yes');
      await page.locator('#answer-input').fill('not-a-number'); await page.locator('#next-question').click();
      await page.locator('#field-error').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#question-title').textContent(), 'Budget?');
      assert.equal(await page.locator('#answer-input').inputValue(), 'not-a-number');
      await page.locator('#back-question').click(); await choice(page, 'no');
      const receipt = await complete(page, 'Synthetic Validation User');
      assert.deepEqual(answer(receipt, 'budget'), { presence: 'missing' });
    });

    await check('SAFE-01', 'Imported HTML-like labels render inertly with no image execution or external fetch', async page => {
      const fixture = JSON.parse(await readFile('tests/fixtures/synthetic-form.json', 'utf8'));
      const label = '<img src="https://invalid.example/tracker" onerror="window.__formliftXss=1">Contact';
      fixture.fields[2].title = label;
      const externalRequests: string[] = [];
      page.on('request', request => { if (request.url().startsWith('https://invalid.example/')) externalRequests.push(request.url()); });
      await importFixture(page, fixture); await choice(page, 'no');
      assert.equal(await page.locator('#question-title').textContent(), label);
      assert.equal(await page.locator('#question-title img').count(), 0);
      const receipt = await complete(page, 'Synthetic Safe User');
      assert.equal(await page.evaluate(() => (window as unknown as Record<string, unknown>).__formliftXss), undefined);
      assert.deepEqual(externalRequests, []);
      assert.deepEqual(answer(receipt, 'contact'), { presence: 'value', valueType: 'string', value: 'Synthetic Safe User' });
    });

    await check('ENG-07', 'Typing over 200 characters uses committed field changes rather than one event per keystroke', async page => {
      const fixture = JSON.parse(await readFile('tests/fixtures/synthetic-form.json', 'utf8'));
      fixture.fields[2].validations.max_length = 512;
      await importFixture(page, fixture); await choice(page, 'no');
      const input = 'Synthetic '.repeat(25);
      await page.locator('#answer-input').pressSequentially(input);
      await page.locator('#next-question').click();
      await page.locator('#submit-response').click();
      await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved locally');
      await page.locator('#tab-inspect').click();
      const receipt = JSON.parse(await page.locator('#receipt-json').textContent() || 'null');
      assert.deepEqual(answer(receipt, 'contact'), { presence: 'value', valueType: 'string', value: input });
      const history = JSON.parse(await page.locator('#event-trace').textContent() || '[]');
      assert.equal(history.length, 5, 'One field commit per answer, two Next events, and one Submit');
      assert.ok((await rows()).some(row => row.responseId === receipt.responseId));
    });

    status = checks.some(result => result.status === 'FAIL') ? 'FAIL' : 'PASS';
    exit = status === 'PASS' ? 0 : 1;
  }
} catch (error) {
  if (error instanceof VerificationBlocked) {
    status = 'BLOCKED'; exit = 2; blocker = safeError(error);
  } else {
    status = 'FAIL'; exit = 1;
    checks.push({ id: 'HARNESS', status: 'FAIL', description: 'Browser test harness setup/execution', error: safeError(error) });
  }
} finally {
  await browser?.close();
  if (server.listening) await new Promise<void>(done => server.close(() => done()));
  try {
    finishedFingerprint = await sourceFingerprint(process.cwd());
    if (finishedFingerprint !== fingerprint) {
      status = 'FAIL'; exit = 1;
      checks.push({ id: 'BUILD-INTEGRITY', status: 'FAIL', description: 'Source remains unchanged throughout browser verification', error: 'Source changed during browser verification; the journey results cannot verify the current build.' });
    }
  } catch {
    if (status !== 'FAIL') { status = 'BLOCKED'; exit = 2; }
    blocker = 'Source integrity could not be verified at completion; no current-build pass is available.';
  }
  const journeys = checks.filter(row => row.id !== 'HARNESS' && row.id !== 'BUILD-INTEGRITY');
  const report = {
    status, fingerprint, classification: 'SYNTHETIC_ENGINEERING_ONLY',
    buildFingerprint: buildFingerprint ?? null, finishedFingerprint: finishedFingerprint ?? null,
    browser: { engine: 'chromium', version: browserVersion ?? null, executable: process.env.CHROMIUM_EXECUTABLE_PATH ? 'environment-override' : 'playwright-default' },
    referenceCases: 0, startedAt, finishedAt: new Date().toISOString(),
    checks, counts: { planned: 6, executed: journeys.length, passed: journeys.filter(row => row.status === 'PASS').length, failed: journeys.filter(row => row.status === 'FAIL').length, skipped: Math.max(0, 6 - journeys.length), infrastructureFailures: checks.length - journeys.length },
    ...(blocker ? { blocker } : {}),
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  await rm(temporary, { recursive: true, force: true });
  console.log(JSON.stringify(report, null, 2));
}
process.exitCode = exit;
