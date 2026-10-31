import { appendFile, mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';

export function serializedWriter(write: (record: unknown) => Promise<void>): (record: unknown) => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  return (record) => {
    const task = tail.then(() => write(record));
    tail = task.catch(() => undefined);
    return task;
  };
}

/** Create the data directory and touch the file so an unwritable location fails at startup, not on the first respondent. */
export async function prepareStorage(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, 'a', 0o600);
  await handle.close();
}

export function jsonlWriter(path: string): (record: unknown) => Promise<void> {
  return serializedWriter(async (record) => {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
  });
}
