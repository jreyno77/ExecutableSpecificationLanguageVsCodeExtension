import { onTestFinished } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { IGrammar, IOnigLib, IToken, StateStack } from 'vscode-textmate';
import { InstalledExpecEditor } from './installed-extension.js';

let oniguruma: Promise<IOnigLib> | undefined;
function engine(): Promise<IOnigLib> {
  return oniguruma ??= (async () => {
    const { createOnigScanner, createOnigString, loadWASM } = await import('vscode-oniguruma');
    const require = createRequire(import.meta.url);
    await loadWASM(await readFile(require.resolve('vscode-oniguruma/release/onig.wasm')));
    return { createOnigScanner, createOnigString };
  })();
}

/** Each example gets its own registry and line stack over actual installed grammar bytes. */
export class ExpecSyntax {
  private lines: { text: string; tokens: IToken[] }[] = [];
  private constructor(private readonly grammar: IGrammar, private readonly initial: StateStack) {}

  static async prepare(): Promise<ExpecSyntax> {
    const { INITIAL, Registry, parseRawGrammar } = await import('vscode-textmate');
    const asset = await (await InstalledExpecEditor.prepare()).grammar();
    const raw = parseRawGrammar(asset.text, asset.path);
    if (raw.scopeName !== asset.scopeName) throw new Error('Installed grammar scope differs from its contribution.');
    const registry = new Registry({ onigLib: engine(), loadGrammar: async scope => scope === raw.scopeName ? raw : null });
    try {
      const grammar = await registry.loadGrammar(raw.scopeName);
      if (!grammar) throw new Error('The actual TextMate engine did not load the installed expec grammar.');
      onTestFinished(() => registry.dispose());
      return new ExpecSyntax(grammar, INITIAL);
    } catch (error) {
      registry.dispose();
      throw error;
    }
  }

  tokenize(text: string): void {
    let stack = this.initial;
    this.lines = text.split(/\r?\n/).map(line => {
      const result = this.grammar.tokenizeLine(line, stack);
      stack = result.ruleStack;
      return { text: line, tokens: result.tokens };
    });
  }

  scopeAt(line: number, column: number): string {
    const row = this.lines[line - 1];
    if (!Number.isInteger(line) || !Number.isInteger(column) || !row || column < 1 || column > row.text.length) {
      throw new RangeError('The requested one-based syntax position is outside the tokenized document.');
    }
    const token = row.tokens.find(token => token.startIndex <= column - 1 && column - 1 < token.endIndex);
    const scope = token?.scopes.at(-1);
    if (!scope) throw new Error('TextMate returned no scope at the requested position.');
    return scope;
  }
}