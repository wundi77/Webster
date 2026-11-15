import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { WDocument } from '../model/types';
import { loadSavedDocument } from '../persist';
import { migrateDocument } from '../model/factory';
import { renderPreviewPage } from '../export/html';
import { listenForDocs } from './bridge';
import { Icons } from '../ui/icons';

type Device = 'full' | 'desktop' | 'tablet' | 'mobile';
const DEVICES: { id: Device; label: string; width: number | null; icon: keyof typeof Icons }[] = [
  { id: 'full', label: 'Fensterbreite', width: null, icon: 'board' },
  { id: 'desktop', label: 'Desktop', width: 1440, icon: 'desktop' },
  { id: 'tablet', label: 'Tablet', width: 768, icon: 'tablet' },
  { id: 'mobile', label: 'Mobil', width: 390, icon: 'mobile' },
];

const prepare = (d: WDocument): WDocument => migrateDocument(structuredClone(d));
const hashPage = () => decodeURIComponent(location.hash.replace(/^#preview=?/, ''));

export function PreviewApp() {
  const [doc, setDoc] = useState<WDocument | null>(null);
  const [pageId, setPageId] = useState(hashPage);
  const [device, setDevice] = useState<Device>('full');
  const [replay, setReplay] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const scroll = useRef(0);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let theme = 'dark';
    try { theme = localStorage.getItem('webster.theme') ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); } catch { /* egal */ }
    document.documentElement.dataset.theme = theme;
    let live = false;
    loadSavedDocument().then(d => { if (d && !live) setDoc(prepare(d)); });
    const stop = listenForDocs(d => { live = true; setDoc(prepare(d)); });
    const onHash = () => setPageId(hashPage());
    window.addEventListener('hashchange', onHash);
    return () => { stop(); window.removeEventListener('hashchange', onHash); };
  }, []);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const page = doc ? doc.pages.find(p => p.id === pageId) ?? doc.pages[0] : null;
  useEffect(() => { if (doc && page) document.title = `Vorschau: ${page.name} – ${doc.name}`; }, [doc, page]);

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

  const dev = DEVICES.find(d => d.id === device)!;
  const width = dev.width ?? stageSize.w;
  const scale = dev.width && stageSize.w && dev.width > stageSize.w - 32 ? (stageSize.w - 32) / dev.width : 1;

  return (
    <div className="preview-app">
      <header className="preview-bar">
        <div className="brand"><Icons.logo /> <span>Vorschau</span></div>
        {doc && (
          <select className="select" value={page?.id} aria-label="Seite" onChange={e => go(e.target.value)}>
            {doc.pages.map((p, i) => <option key={p.id} value={p.id}>{p.name}{i === 0 ? ' (Startseite)' : ''}</option>)}
          </select>
        )}
        <div className="spacer" />
        <div className="bp-switch" role="radiogroup" aria-label="Bildschirmgröße">
          {DEVICES.map(d => {
            const I = Icons[d.icon];
            return (
              <button key={d.id} type="button" role="radio" aria-checked={device === d.id} className={`bp-btn${device === d.id ? ' active' : ''}`}
                title={d.width ? `${d.label} (${d.width} px)` : 'So breit wie dieses Fenster'} onClick={() => setDevice(d.id)}>
                <I /><span>{d.label}</span>
              </button>
            );
          })}
        </div>
        <div className="spacer" />
        <span className="preview-size">{Math.round(width)} px{scale < 1 ? ` · ${Math.round(scale * 100)} %` : ''}</span>
        <button type="button" className="ibtn" title="Neu laden (Animationen erneut abspielen)" aria-label="Neu laden"
          onClick={() => { scroll.current = 0; setReplay(r => r + 1); }}><Icons.reset /></button>
      </header>
      <div className="preview-stage" ref={stage}>
        {!doc ? <p className="empty-hint">Lade Dokument …</p> : (
          <div className="preview-frame-wrap" style={{
            width: width * scale, height: dev.width ? stageSize.h - 32 : stageSize.h,
            margin: dev.width ? '16px auto' : 0,
          }}>
            <iframe key={replay} ref={frame} title="Vorschau" srcDoc={html} onLoad={onLoad}
              style={{
                width, height: (dev.width ? stageSize.h - 32 : stageSize.h) / scale,
                transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: '0 0',
              }} />
          </div>
        )}
      </div>
    </div>
  );
}
