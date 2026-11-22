// Verbindung Editor ↔ Vorschau-Tab: Der Editor schickt jede Änderung live an offene Vorschauen.
import type { WDocument } from '../model/types';

const CHANNEL = 'webster-preview';
export type PreviewMsg = { type: 'hello' } | { type: 'bye' } | { type: 'editor-ready' } | { type: 'doc'; doc: WDocument };

/** Im Editor: Dokument an offene Vorschau-Tabs senden */
export function startPreviewBridge(getDoc: () => WDocument, subscribe: (fn: () => void) => () => void) {
  if (typeof BroadcastChannel === 'undefined') return;
  // Im Vorschau-Tab wird der Editor-Speicher mitgeladen (über gemeinsame Module). Dort darf er nicht senden,
  // sonst antwortet er mit seinem leeren Startdokument und überschreibt das echte aus dem Editor.
  if (location.hash.startsWith('#preview')) return;
  const ch = new BroadcastChannel(CHANNEL);
  let open = false;
  let timer: number | undefined;
  const send = () => ch.postMessage({ type: 'doc', doc: getDoc() } satisfies PreviewMsg);
  ch.onmessage = (e: MessageEvent<PreviewMsg>) => {
    if (e.data.type === 'hello') { open = true; send(); }
  };
  // Nach Neuladen des Editors: offene Vorschauen melden sich erneut
  ch.postMessage({ type: 'editor-ready' } satisfies PreviewMsg);
  subscribe(() => {
    if (!open) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(send, 120);
  });
}

/** In der Vorschau: Updates empfangen */
export function listenForDocs(onDoc: (d: WDocument) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (e: MessageEvent<PreviewMsg>) => {
    if (e.data.type === 'doc') onDoc(e.data.doc);
    if (e.data.type === 'editor-ready') ch.postMessage({ type: 'hello' } satisfies PreviewMsg);
  };
  ch.postMessage({ type: 'hello' } satisfies PreviewMsg);
  return () => ch.close();
}

/** lang: zweite Sprache, in der gerade bearbeitet wird */
export function openPreview(pageId: string, lang?: string | null) {
  window.open(`${location.origin}${location.pathname}#preview=${pageId}${lang ? `&lang=${lang}` : ''}`, 'webster-preview');
}
