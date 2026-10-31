import { mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';

/** The existing log does not end with a complete line. Nothing is written; the damaged bytes are preserved for review. */
export class StorageDamagedError extends Error {
  constructor() { super('The response log ends with an incomplete line.'); }
}

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
    const file = await open(path, 'a+', 0o600);
    try {
      // Appending after an interrupted write would merge this record into the partial line and make it unreadable.
      const { size } = await file.stat();
      if (size > 0) {
        const last = Buffer.alloc(1);
        const { bytesRead } = await file.read(last, 0, 1, size - 1);
        if (bytesRead !== 1 || last[0] !== 0x0a) throw new StorageDamagedError();
      }
      await file.appendFile(`${JSON.stringify(record)}\n`, 'utf8');
    } finally {
      await file.close();
    }
  });
}
