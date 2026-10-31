import { symlink } from 'node:fs/promises';

/**
 * Create a link for symlink-protection tests.
 * Directory links use junctions on Windows: they need no privilege and `lstat` reports them as symbolic links.
 * File symlinks need Administrator rights or Developer Mode on Windows; when unavailable this returns the reason
 * instead of throwing, so the caller can record an explicit skip. A skip is incomplete coverage, never a pass.
 */
export async function createLink(target: string, path: string, type: 'dir' | 'file'): Promise<{ created: true } | { created: false; reason: string }> {
  try {
    await symlink(target, path, process.platform === 'win32' && type === 'dir' ? 'junction' : type);
    return { created: true };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform === 'win32' && type === 'file' && (code === 'EPERM' || code === 'EACCES')) {
      return { created: false, reason: `Windows denied file symlink creation (${code}); enable Developer Mode or run elevated to cover this case.` };
    }
    throw error;
  }
}
