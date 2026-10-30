import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { DiagramPreview } from '../core/DiagramPreview.js';

type OpenPromise = { id: string; pinned: boolean };

/** Presents renderer-supplied annotations over an inert image. */
export function DiagramPromises({ diagram, width, height, viewport }: {
  diagram: DiagramPreview;
  width: number;
  height: number;
  viewport: RefObject<HTMLDivElement | null>;
}) {
  const [open, show] = useState<OpenPromise>();
  const popupId = useId();
  const popup = useRef<HTMLDivElement>(null), rows = useRef(new Map<string, HTMLDivElement>());
  const active = diagram.promises.find(promise => promise.id === open?.id);
  const scaleX = width / diagram.width, scaleY = height / diagram.height;

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && (target.closest('button[data-promise-label]') || popup.current?.contains(target))) return;
      show(undefined);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); show(undefined);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  useLayoutEffect(() => {
    const area = viewport.current, bubble = popup.current, row = active && rows.current.get(active.id);
    if (!area || !bubble || !row) return;
    const positionBubble = () => {
      const bounds = area.getBoundingClientRect(), anchor = row.getBoundingClientRect();
      const maxHeight = Math.max(40, bounds.height - 16), maxWidth = Math.max(80, bounds.width - 16);
      bubble.style.maxWidth = 'min(28rem, ' + maxWidth + 'px)'; bubble.style.maxHeight = maxHeight + 'px';
      const box = bubble.getBoundingClientRect();
      const left = Math.max(bounds.left + 8, Math.min(anchor.right - box.width, bounds.right - box.width - 8));
      const below = anchor.bottom + box.height <= bounds.bottom - 8;
      const top = Math.max(bounds.top + 8, Math.min(below ? anchor.bottom : anchor.top - box.height, bounds.bottom - box.height - 8));
      bubble.style.left = left + 'px'; bubble.style.top = top + 'px';
    };
    positionBubble();
    area.addEventListener('scroll', positionBubble);
    window.addEventListener('resize', positionBubble);
    const resize = new ResizeObserver(positionBubble); resize.observe(area);
    return () => { area.removeEventListener('scroll', positionBubble); window.removeEventListener('resize', positionBubble); resize.disconnect(); };
  }, [active, width, height, viewport]);

  const inspect = (id: string) => show(previous => previous?.pinned || previous?.id === id ? previous : { id, pinned: false });
  const leave = (target: EventTarget | null) => {
    if (target instanceof Node && popup.current?.contains(target)) return;
    if (target instanceof Element && target.closest('button[data-promise-label]')) return;
    show(previous => previous?.pinned ? previous : undefined);
  };
  return <>
    {diagram.promises.filter(promise => promise.promises.length > 0).map(promise => <div key={promise.id}
      ref={node => { if (node) rows.current.set(promise.id, node); else rows.current.delete(promise.id); }}
      data-promise-row={promise.label} className="expec-promise-row"
      style={{ left: promise.x * scaleX, top: promise.y * scaleY, width: promise.width * scaleX, height: promise.height * scaleY }}
      onMouseLeave={event => leave(event.relatedTarget)}>
      <button type="button" data-promise-label={promise.label} className="expec-promise-indicator"
        aria-label={promise.label + ': ' + promise.promises.length + (promise.promises.length === 1 ? ' promise' : ' promises')}
        aria-expanded={active?.id === promise.id} aria-controls={active?.id === promise.id ? popupId : undefined}
        aria-describedby={active?.id === promise.id ? popupId : undefined}
        onMouseEnter={() => inspect(promise.id)} onMouseMove={() => inspect(promise.id)} onFocus={() => inspect(promise.id)}
        onBlur={event => { if (!popup.current?.matches(':hover')) leave(event.relatedTarget); }}
        onClick={() => show(previous => previous?.id === promise.id && previous.pinned ? undefined : { id: promise.id, pinned: true })}>
        <span aria-hidden="true">💭</span> {promise.promises.length}
      </button>
    </div>)}
    {active && <div ref={popup} id={popupId} role="tooltip" aria-label={'Promises for ' + active.label}
      data-promise-bubble data-promise-label={active.label} data-promise-pinned={open?.pinned ? 'true' : 'false'}
      className="expec-promise-bubble"
      onMouseLeave={event => leave(event.relatedTarget)}>
      <strong>{active.label}</strong>
      {open?.pinned && <span className="expec-promise-pin">Pinned</span>}
      <ul>{active.promises.map((promise, index) => <li data-promise-text key={index}>{promise}</li>)}</ul>
    </div>}
  </>;
}
