import { useEffect, useMemo, useRef, useState } from 'react';
import type { WDocument } from '../model/types';
import { loadSavedDocument } from '../persist';
import { migrateDocument } from '../model/factory';
import { renderPreviewPage } from '../export/html';
import { listenForDocs } from './bridge';

const prepare = (d: WDocument): WDocument => migrateDocument(structuredClone(d));
const hashPage = () => decodeURIComponent(location.hash.replace(/^#preview=?/, ''));

export function PreviewApp() {
  const [doc, setDoc] = useState<WDocument | null>(null);
  const [pageId, setPageId] = useState(hashPage);
  const frame = useRef<HTMLIFrameElement>(null);
  const scroll = useRef(0);

  useEffect(() => {
    let live = false;
    loadSavedDocument().then(d => { if (d && !live) setDoc(prepare(d)); });
    const stop = listenForDocs(d => { live = true; setDoc(prepare(d)); });
    const onHash = () => setPageId(hashPage());
    window.addEventListener('hashchange', onHash);
    return () => { stop(); window.removeEventListener('hashchange', onHash); };
  }, []);

  const page = doc ? doc.pages.find(p => p.id === pageId) ?? doc.pages[0] : null;
  useEffect(() => { if (doc && page) document.title = page.seo?.title || page.name; }, [doc, page]);

  const html = useMemo(() => (doc && page ? renderPreviewPage(doc, page.id, id => ({ href: '#', attrs: `data-page="${id}"` })) : ''), [doc, page]);

  const go = (id: string) => { location.hash = `preview=${id}`; scroll.current = 0; };

  // Scroll-Position bei Live-Updates behalten, Links zwischen Seiten abfangen
  const onLoad = () => {
    const w = frame.current?.contentWindow;
    const d = frame.current?.contentDocument;
    if (!w || !d) return;
    w.scrollTo(0, scroll.current);
    w.addEventListener('scroll', () => { scroll.current = w.scrollY; });
    d.addEventListener('click', e => {
      const a = (e.target as Element).closest?.('a[data-page]');
      if (a) { e.preventDefault(); go(a.getAttribute('data-page')!); }
    });
  };

  // Wie die echte Website: die Seite füllt das ganze Fenster, ohne Leiste darüber
  return (
    <>
      <style>{'html, body, #root { margin: 0; height: 100%; overflow: hidden; background: #fff; }'}</style>
      {doc && <iframe ref={frame} title={page?.name ?? 'Vorschau'} srcDoc={html} onLoad={onLoad}
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 0, display: 'block' }} />}
    </>
  );
}
