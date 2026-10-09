import type { GenerationWriteProblem } from './GenerationWriteProblem.js';

// Private, plain-data protocol of the one owned generation child.
export type HostMessage =
  | { type: 'start'; manifest: string }
  | { type: 'cancel' }
  | { type: 'permission'; id: number; problems: GenerationWriteProblem[]; error?: string };
export type WorkerMessage =
  | { type: 'ready'; runtimeVersion: string }
  | { type: 'check'; id: number; root: string }
  | { type: 'result'; report: string; exitCode?: number; error?: string };

export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function compatibleNode(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return !!match && Number(match[1]) === 24 && Number(match[2]) >= 19;
}
export function writeProblems(value: unknown): GenerationWriteProblem[] {
  if (!Array.isArray(value)) throw Error('Editor permission must return a plain problem array.');
  return value.map(problem => {
    if (!object(problem) || typeof problem.code !== 'string' || typeof problem.path !== 'string' || typeof problem.message !== 'string')
      throw Error('Editor permission returned an invalid problem.');
    return { code: problem.code, path: problem.path, message: problem.message };
  });
}
export function errorText(error: unknown): string {
  const parts: string[] = [];
  const path = new Set<object>();
  let length = 0;
  let nodes = 0;
  let truncated = false;
  const marker = '[error details truncated]';
  const limit = 8192;
  const append = (text: string): void => {
    if (truncated) return;
    if (parts.length) { parts.push('\n'); length++; }
    const remaining = Math.max(0, limit - length);
    parts.push(text.slice(0, remaining));
    length += Math.min(text.length, remaining);
    if (text.length > remaining) truncated = true;
  };
  const visit = (value: unknown, depth: number): void => {
    if (truncated) return;
    const identity = value !== null && (typeof value === 'object' || typeof value === 'function') ? value as object : undefined;
    if (identity && path.has(identity)) { append('[circular error]'); return; }
    if (++nodes > 32 || depth > 8) { truncated = true; return; }
    if (identity) path.add(identity);
    try {
      if (value instanceof Error) {
        append(String(value.message));
        if (value instanceof AggregateError) {
          const errors: unknown = value.errors;
          if (!Array.isArray(errors)) append('[unreadable aggregate errors]');
          else for (let index = 0; index < errors.length && !truncated; index++) visit(errors[index], depth + 1);
        }
        const cause: unknown = value.cause;
        if (cause !== undefined) visit(cause, depth + 1);
      } else append(String(value));
    } catch { append('[unreadable error]'); }
    finally { if (identity) path.delete(identity); }
  };
  visit(error, 0);
  const text = parts.join('');
  return truncated ? text.slice(0, limit - marker.length - 1) + '\n' + marker : text;
}