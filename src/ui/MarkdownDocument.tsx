import { useLayoutEffect, useRef, useState } from 'react';
import Markdown, { type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { OutputDocument } from '../core/OutputDocument.js';

export type MarkdownTarget = { path: string; fragment: string | undefined };
const unavailableLink = 'Link unavailable in supplied previews.';
const previewOrigin = 'https://expec-preview.invalid';
const forbiddenAddress = /[\u0000-\u001f\u007f\\?]/;
const absoluteAddress = /^(?:\/|[a-z][a-z\d+.-]*:)/i;

/** Resolve presentation links only against documents already supplied to this view. */
function documentTarget(href: string | undefined, current: string, documents: readonly OutputDocument[]): MarkdownTarget | undefined {
  if (!href || href !== href.trim()) return;
  try {
    const decoded = decodeURIComponent(href);
    if (forbiddenAddress.test(href) || forbiddenAddress.test(decoded)
      || absoluteAddress.test(href) || absoluteAddress.test(decoded)) return;
    const base = new URL(current.split('/').map(encodeURIComponent).join('/'), previewOrigin + '/');
    const address = new URL(href, base);
    if (address.origin !== previewOrigin || address.search) return;
    const path = address.pathname.slice(1).split('/').map(decodeURIComponent).join('/');
    const fragment = address.hash ? decodeURIComponent(address.hash.slice(1)) : undefined;
    if (forbiddenAddress.test(path) || fragment !== undefined && forbiddenAddress.test(fragment)) return;
    if (!documents.some(document => document.path === path
      && document.mediaType.split(';', 1)[0]!.trim().toLowerCase() === 'text/markdown')) return;
    return { path, fragment };
  } catch { return; }
}

/** Recognize generated empty anchors without admitting general authored HTML. */
const markdownOptions: NonNullable<Options['remarkRehypeOptions']> = {
  handlers: {
    html(_state, node, parent) {
      const complete = /^<a id="(expec-[0-9a-f]+)"><\/a>$/.exec(node.value);
      const opening = /^<a id="(expec-[0-9a-f]+)">$/.exec(node.value);
      const index = parent?.children.indexOf(node) ?? -1;
      const next = parent?.children[index + 1];
      const paired = index >= 0 && next?.type === 'html' && next.value === '</a>';
      const id = complete?.[1] ?? (paired ? opening?.[1] : undefined);
      return id ? { type: 'element', tagName: 'span', properties: { id, className: ['expec-markdown-anchor'] }, children: [] } : undefined;
    },
  },
};

export function MarkdownDocument({ document, documents, navigation, onNavigate }: {
  document: OutputDocument;
  documents: readonly OutputDocument[];
  navigation: MarkdownTarget | undefined;
  onNavigate: (target: MarkdownTarget) => void;
}) {
  const article = useRef<HTMLElement>(null);
  const [explanation, explain] = useState<string>();
  useLayoutEffect(() => {
    explain(undefined);
    if (!navigation) return;
    if (!navigation.fragment) { article.current?.scrollIntoView(); return; }
    const anchor = [...article.current!.querySelectorAll<HTMLElement>('[id]')]
      .find(node => node.id === navigation.fragment);
    if (anchor) anchor.scrollIntoView();
    else explain('Anchor unavailable in supplied preview.');
  }, [navigation]);
  return <>
    <p data-output-explanation>{explanation}</p>
    <article ref={article} className="expec-markdown" data-output-content>
      <Markdown remarkPlugins={[remarkGfm]} remarkRehypeOptions={markdownOptions} skipHtml
        urlTransform={href => href} components={{
          img: ({ alt }) => <span>{alt ?? ''}</span>,
          a: ({ href, children }) => {
            const target = documentTarget(href, document.path, documents);
            if (!target) return <span role="link" aria-disabled="true" title={unavailableLink}>{children}</span>;
            return <a href={target.fragment ? '#' + encodeURIComponent(target.fragment) : '#'}
              onClick={event => { event.preventDefault(); onNavigate(target); }}
              onAuxClick={event => event.preventDefault()}>{children}</a>;
          },
        }}>{document.content}</Markdown>
    </article>
  </>;
}
