import { OutputTabs } from './OutputTabs.js';
import type { PreviewPublication } from '../core/PreviewPublication.js';

declare function acquireVsCodeApi(): { postMessage(value: unknown): void };
const host = acquireVsCodeApi();
const tabs = new OutputTabs('output-host');
const context = document.getElementById('preview-context')!;
const explanation = document.getElementById('preview-message')!;
window.addEventListener('message', ({ data }: MessageEvent<{ type: string; publication: PreviewPublication }>) => {
  if (data?.type !== 'expec-preview') return;
  const publication = data.publication;
  context.textContent = publication.uri ?? '';
  context.dataset.sourceUri = publication.uri ?? '';
  context.dataset.sourceVersion = String(publication.version ?? '');
  explanation.textContent = publication.message ?? '';
  tabs.present(publication.tabs);
});
window.addEventListener('pagehide', () => tabs.dispose(), { once: true });
host.postMessage({ type: 'expec-preview-ready' });
