import { spawnSync } from 'node:child_process';
import { mkdir, copyFile, readdir, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { sourceFingerprint } from './fingerprint.mjs';
// Freeze source identity before compilation so a later edit cannot certify stale code.
const fingerprint = await sourceFingerprint();
// Avoid executing stale compiled modules/tests after a source file is removed.
await rm('dist', { recursive: true, force: true });
const compiled = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc'], { stdio: 'inherit' });
if (compiled.status !== 0) process.exit(compiled.status ?? 1);
await mkdir('dist/public', { recursive: true });
for (const file of await readdir('public')) await copyFile(`public/${file}`, `dist/public/${file}`);
await copyFile('tests/fixtures/synthetic-form.json', 'dist/public/demo.json');
await build({ entryPoints: ['src/client.ts'], bundle: true, outfile: 'dist/public/client.js', platform: 'browser', target: 'es2022', sourcemap: true });
await mkdir('dist/scripts', { recursive: true });
await copyFile('scripts/fingerprint.mjs', 'dist/scripts/fingerprint.mjs');
if (await sourceFingerprint() !== fingerprint) throw new Error('Source changed during build. Rebuild from stable sources.');
await writeFile('dist/build-info.json', JSON.stringify({ schemaVersion: 'formlift-build/1', fingerprint }, null, 2) + '\n');
console.log('Built local server and browser assets. No source evidence was inferred.');
