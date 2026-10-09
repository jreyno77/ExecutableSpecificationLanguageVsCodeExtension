import type { TextDocument } from 'vscode';

/** Only the native ports consumed by EditorLanguageSupport; no language behavior. */
export class CancellationError extends Error {
  constructor() { super('Canceled'); this.name = 'Canceled'; }
}
export const workspace: { textDocuments: readonly TextDocument[] } = { textDocuments: [] };
