import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Hash testable sources rather than generated reports, evidence, or git metadata. */
export async function sourceFingerprint(root = process.cwd()) {
  const hash = createHash('sha256');
  async function add(path) {
    const full = resolve(root, path);
    let entries;
    try { entries = await readdir(full, { withFileTypes: true }); }
    catch (error) {
      if (error.code === 'ENOENT') return;
      if (error.code !== 'ENOTDIR') throw error;
      hash.update(path.replaceAll('\\', '/')).update('\0').update(await readFile(full)).update('\0');
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) throw new Error(`Source fingerprint refuses symlink: ${path}/${entry.name}`);
      await add(`${path}/${entry.name}`);
    }
  }
  for (const path of ['src', 'scripts', 'tests', 'public', 'package.json', 'package-lock.json', 'tsconfig.json']) await add(path);
  return hash.digest('hex');
}
