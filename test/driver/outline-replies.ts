import type { DocumentSymbol, Range } from 'vscode-languageserver';
import { SymbolKind } from 'vscode-languageserver';

export type OutlineSymbol = { name: string; kind: string; range: Range; selectionRange: Range; children: readonly OutlineSymbol[] };

/** Actual native replies, retained by request number so later edits cannot rewrite history. */
export class OutlineReplies {
  private readonly requests: Array<readonly OutlineSymbol[]> = [];
  record(symbols: readonly OutlineSymbol[]): void { this.requests.push(symbols); }
  reply(request: number): readonly OutlineSymbol[] {
    if (!Number.isInteger(request) || request < 1 || request > this.requests.length) throw new Error('No actual outline request ' + request);
    return this.requests[request - 1];
  }
  symbol(request: number, path: readonly number[]): OutlineSymbol {
    let siblings = this.reply(request), found: OutlineSymbol | undefined;
    if (!path.length) throw new Error('An outline path needs a sibling position.');
    for (const position of path) {
      if (!Number.isInteger(position) || position < 1 || !(found = siblings[position - 1])) throw new Error('No actual outline symbol at ' + path.join('.'));
      siblings = found.children;
    }
    return found!;
  }
  count(request: number): number {
    const count = (siblings: readonly OutlineSymbol[]): number => siblings.reduce((total, symbol) => total + 1 + count(symbol.children), 0);
    return count(this.reply(request));
  }
  rangesContainNames(request: number): boolean {
    const before = (left: Range['start'], right: Range['start']): boolean => left.line < right.line || left.line === right.line && left.character <= right.character;
    const contains = (outer: Range, inner: Range): boolean => before(outer.start, inner.start) && before(inner.end, outer.end);
    const valid = (siblings: readonly OutlineSymbol[], parent?: Range): boolean => siblings.every(symbol =>
      contains(symbol.range, symbol.selectionRange) && (!parent || contains(parent, symbol.range)) && valid(symbol.children, symbol.range));
    return valid(this.reply(request));
  }
}

export function protocolOutline(symbols: readonly DocumentSymbol[]): readonly OutlineSymbol[] {
  return symbols.map(symbol => {
    const kind = Object.entries(SymbolKind).find(([, value]) => value === symbol.kind)?.[0];
    if (!kind) throw new Error('The actual protocol outline has an unknown native kind.');
    return { name: symbol.name, kind, range: symbol.range, selectionRange: symbol.selectionRange,
      children: protocolOutline(symbol.children ?? []) };
  });
}
