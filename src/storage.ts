import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export function serializedWriter(write: (record: unknown) => Promise<void>): (record: unknown) => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  return (record) => {
    const task = tail.then(() => write(record));
    tail = task.catch(() => undefined);
    return task;
  };
}

export function jsonlWriter(path: string): (record: unknown) => Promise<void> {
  return serializedWriter(async (record) => {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
  });
}
