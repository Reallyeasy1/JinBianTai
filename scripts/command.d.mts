export type LaunchError = { code: string; message: string };
export type CommandRecord = {
  command: string; startedAt: string; finishedAt: string; exitCode: number | null; signal: string | null;
  launched: boolean; launchError?: LaunchError;
};
export type ResolvedNpm = { command: string; prefix: string[]; label: string; error?: undefined } | { error: LaunchError };
export function resolveNpm(options?: {
  platform?: string; env?: Record<string, string | undefined>; execPath?: string; exists?: (path: string) => boolean;
}): ResolvedNpm;
export function runCommand(command: string, args: string[], options?: { label?: string; prefix?: string[]; spawn?: (...args: any[]) => any }): {
  record: CommandRecord; stdout: string; stderr: string; status: number | null;
};
export function unlaunched(label: string, args: string[], error: LaunchError): CommandRecord;
export function outcome(commands: CommandRecord[], passed: boolean): { status: 'PASS' | 'FAIL' | 'BLOCKED'; exitCode: 0 | 1 | 2 };
