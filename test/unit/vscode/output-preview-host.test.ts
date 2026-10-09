import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionContext, WebviewPanel } from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { OutputPreviewHost } from '../../../src/vscode/OutputPreviewHost.js';

const native = vi.hoisted(() => ({ commands: new Map<string, () => void>(), active: undefined as any, selection: undefined as any, close: undefined as any, panels: [] as any[], released: [] as string[] }));
vi.mock('vscode', () => ({
  ViewColumn: { Beside: 2 },
  Uri: { joinPath: (uri: any, ...parts: string[]) => ({ toString: () => uri.toString() + '/' + parts.join('/') }) },
  commands: { registerCommand: (name: string, action: () => void) => { native.commands.set(name, action); return { dispose: () => { native.released.push(name); native.commands.delete(name); } }; } },
  workspace: { onDidCloseTextDocument: (action: any) => { native.close = action; return { dispose: () => { native.released.push('closed'); } }; } },
  window: {
    get activeTextEditor() { return native.active; },
    onDidChangeActiveTextEditor: (action: any) => { native.selection = action; return { dispose: () => { native.released.push('selection'); } }; },
    createWebviewPanel: (_type: string, _title: string, _column: number, options: any) => {
      const panel = { options, visible: true, messages: [] as unknown[], subscriptions: [] as (() => void)[], htmlSets: 0,
        reveal: vi.fn(), message: undefined as any, closed: undefined as any, changed: undefined as any,
        dispose: vi.fn(() => { panel.closed?.(); }),
        onDidDispose: (action: any) => { panel.closed = action; return { dispose: () => { native.released.push('panel-close'); } }; },
        onDidChangeViewState: (action: any) => { panel.changed = action; return { dispose: () => { native.released.push('panel-view'); } }; },
        webview: { cspSource: 'vscode-webview://owned', _html: '',
          get html() { return this._html; }, set html(value: string) { this._html = value; panel.htmlSets++; },
          asWebviewUri: (uri: any) => ({ toString: () => 'vscode-resource:' + uri.toString() }),
          onDidReceiveMessage: (action: any) => { panel.message = action; return { dispose: () => { native.released.push('panel-message'); } }; },
          postMessage: (value: unknown) => { panel.messages.push(value); return Promise.resolve(true); },
        },
      }; native.panels.push(panel); return panel as unknown as WebviewPanel;
    },
  },
}));
vi.mock('vscode-languageclient/node', () => ({ State: { Stopped: 1, Running: 2, Starting: 3, StartFailed: 4 } }));

function recording(extensionUri = 'file:///extension') {
  const notifications: Array<{ method: string; value: any }> = [], listeners = new Map<string, (value: any) => void>();
  const errors: unknown[] = [];
  let stateChanged: ((value: any) => void) | undefined;
  const client = { state: 1, error: (...value: unknown[]) => { errors.push(value); },
    onDidChangeState: (action: any) => { stateChanged = action; return { dispose: () => { native.released.push('client-state'); } }; },
    onNotification: (method: string, action: any) => { listeners.set(method, action); return { dispose: () => { native.released.push(method); listeners.delete(method); } }; },
    sendNotification: (method: string, value: unknown) => { notifications.push({ method, value }); return Promise.resolve(); },
  };
  const context = { extensionUri: { toString: () => extensionUri }, subscriptions: [] } as unknown as ExtensionContext;
  const host = new OutputPreviewHost(context, client as unknown as LanguageClient);
  return { host, context, client, errors, notifications,
    running: () => { client.state = 2; stateChanged?.({ newState: 2 }); },
    stopped: () => { client.state = 1; stateChanged?.({ newState: 1 }); },
    present: (value: any) => { listeners.get('expec/previewPublication')!(value); },
    show: () => native.commands.get('expec.showOutputPreviews')!(),
  };
}
const editor = (uri: string, languageId = 'expec') => ({ document: { uri: { toString: () => uri }, languageId } });
const publication = (version: number) => ({ uri: 'untitled:Book.expec', version, tabs: [], message: '<script>literal</script>' });

beforeEach(() => { native.commands.clear(); native.active = editor('untitled:Book.expec'); native.selection = undefined; native.close = undefined; native.panels = []; native.released = []; });
describe('preview host at the native API boundary', () => {
  it('registers once without opening a panel or starting another client', () => {
    const { host, context } = recording(); host.start(); host.start();
    expect([...native.commands.keys()]).toEqual(['expec.showOutputPreviews']); expect(native.panels).toEqual([]);
    expect(context.subscriptions).toContain(host); host.dispose();
  });
  it('replays the latest saved configuration and selected URI on startup and restart', () => {
    const r = recording(); r.host.start();
    const configuration = { file: '/workspace/expec.json', text: '{saved}', writable: true };
    r.host.configurationChanged(configuration); expect(r.notifications).toEqual([]);
    r.running(); expect(r.notifications).toEqual([
      { method: 'expec/previewConfiguration', value: { configuration } },
      { method: 'expec/previewSelection', value: { uri: 'untitled:Book.expec' } },
    ]);
    r.stopped(); r.host.configurationChanged(undefined); native.selection(editor('file:///second.expec'));
    r.running(); expect(r.notifications.slice(-2)).toEqual([
      { method: 'expec/previewConfiguration', value: { configuration: undefined } },
      { method: 'expec/previewSelection', value: { uri: 'file:///second.expec' } },
    ]); r.host.dispose();
  });
  it('retains authored selection when the panel takes focus and clears a real non-language selection', () => {
    const r = recording(); r.host.start(); r.running(); const count = r.notifications.length;
    native.selection(undefined); expect(r.notifications).toHaveLength(count);
    native.selection(editor('file:///readme.md', 'markdown'));
    expect(r.notifications.at(-1)).toEqual({ method: 'expec/previewSelection', value: { uri: undefined } }); r.host.dispose();
  });
  it('replays only the latest plain publication to the exact ready panel and a recreated panel', () => {
    const r = recording(); r.host.start(); r.present(publication(1)); r.show(); const first = native.panels[0];
    expect(first.messages).toEqual([]); r.present(publication(2)); first.message({ type: 'expec-preview-ready' });
    expect(first.messages).toEqual([{ type: 'expec-preview', publication: publication(2) }]);
    r.show(); expect(native.panels).toHaveLength(1); expect(first.reveal).toHaveBeenCalledOnce();
    first.dispose(); r.present(publication(3)); r.show(); const second = native.panels[1];
    first.message({ type: 'expec-preview-ready' }); expect(second.messages).toEqual([]);
    second.message({ type: 'expec-preview-ready' }); expect(second.messages.at(-1)).toEqual({ type: 'expec-preview', publication: publication(3) });
    expect(first.htmlSets).toBe(1); expect(second.htmlSets).toBe(1); r.host.dispose();
  });
  it('restricts assets to the packaged application and keeps literal content outside HTML', () => {
    const r = recording(); r.host.start(); r.present(publication(1)); r.show(); const panel = native.panels[0];
    expect(panel.options.enableScripts).toBe(true); expect(panel.options.enableForms).toBe(false); expect(panel.options.enableCommandUris).toBe(false);
    expect(panel.options.localResourceRoots.map((uri: any) => uri.toString())).toEqual(['file:///extension/dist/webview']);
    expect(panel.webview.html).toContain("default-src 'none'"); expect(panel.webview.html).toContain('img-src data:');
    expect(panel.webview.html).toContain('dist/webview/preview.js'); expect(panel.webview.html).toContain('dist/webview/preview.css');
    expect(panel.webview.html).toContain('data-expec-output-previews'); expect(panel.webview.html).not.toContain('<script>literal</script>'); r.host.dispose();
  });
  it('escapes special characters in actual packaged asset attributes', () => {
    const r = recording('file:///extension?path=&"<>');
    r.host.start();
    try {
      r.show();
      const html = native.panels[0].webview.html;
      expect(html).toContain('href="vscode-resource:file:///extension?path=&amp;&quot;&lt;&gt;/dist/webview/preview.css"');
      expect(html).toContain('src="vscode-resource:file:///extension?path=&amp;&quot;&lt;&gt;/dist/webview/preview.js"');
      expect(html).not.toContain('file:///extension?path=&"<>');
    } finally { r.host.dispose(); }
  });
  it('attempts every owned cleanup when one native subscription throws and ignores later events', () => {
    const r = recording(); r.host.start(); r.running(); r.show();
    const failure = new Error('native cleanup failed'); const panel = native.panels[0]; panel.dispose.mockImplementationOnce(() => { throw failure; });
    expect(() => r.host.dispose()).toThrow(failure); expect(native.released).toEqual(expect.arrayContaining(['expec.showOutputPreviews', 'selection', 'closed', 'client-state', 'expec/previewPublication', 'panel-close', 'panel-message', 'panel-view']));
    const count = r.notifications.length; native.selection(editor('file:///late.expec')); r.host.configurationChanged(undefined); r.host.present(publication(4));
    expect(r.notifications).toHaveLength(count); expect(() => r.host.dispose()).not.toThrow();
  });
});