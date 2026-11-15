// Dialog „Icon einfügen“: Sammlung mit Suche (auch auf Deutsch), Social-Media-Logos, eigene SVG-Datei
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '../ui/icons';
import { useDialog } from './SiteSettings';
import { iconLabel, importSvgFile, insertIcon, loadIcons, replaceIcon, type IconEntry } from '../model/vector';

const POPULAR = ['phone', 'mail', 'map-pin', 'clock', 'calendar', 'house', 'user', 'users', 'search', 'menu', 'x', 'check', 'circle-check', 'plus',
  'arrow-right', 'arrow-left', 'arrow-up-right', 'chevron-right', 'chevron-down', 'external-link', 'download', 'share-2', 'heart', 'star', 'thumbs-up',
  'shopping-cart', 'shopping-bag', 'gift', 'tag', 'credit-card', 'euro', 'truck', 'package', 'store', 'coffee', 'utensils', 'wine', 'cake',
  'leaf', 'sun', 'sparkles', 'flame', 'droplet', 'camera', 'image', 'video', 'circle-play', 'headphones', 'mic', 'book-open', 'graduation-cap',
  'briefcase', 'building', 'handshake', 'award', 'trophy', 'shield-check', 'lock', 'key-round', 'settings', 'wrench', 'hammer', 'lightbulb', 'rocket',
  'target', 'chart-bar', 'trending-up', 'globe', 'wifi', 'car', 'bike', 'plane', 'bed-double', 'dog', 'paw-print', 'stethoscope', 'heart-pulse',
  'dumbbell', 'scissors', 'gem', 'info', 'circle-question-mark', 'triangle-exclamation-point', 'message-circle', 'quote', 'bell', 'bookmark', 'eye', 'link', 'printer', 'file-text'];
const PAGE = 240;

function IconGlyph({ e }: { e: IconEntry }) {
  const inner = e.brand ? `<g fill="currentColor">${e.markup}</g>`
    : `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${e.markup}</g>`;
  return <span className="icon-glyph" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" width="24" height="24">${inner}</svg>` }} />;
}

export function IconPicker() {
  const open = useDialog(s => s.open === 'icons');
  return open ? <IconPickerInner /> : null;
}

function IconPickerInner() {
  const replaceId = useDialog(s => s.tab);
  const close = () => useDialog.getState().show(null);
  const [data, setData] = useState<{ lucide: IconEntry[]; brands: IconEntry[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'icons' | 'brands'>('icons');
  const [limit, setLimit] = useState(PAGE);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadIcons().then(setData, () => setErr('Die Icons konnten nicht geladen werden.')); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  useEffect(() => setLimit(PAGE), [q, tab]);

  const list = useMemo(() => {
    if (!data) return [];
    const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      if (tab === 'brands') return data.brands;
      const byName = new Map(data.lucide.map(e => [e.name, e]));
      const top = POPULAR.map(n => byName.get(n)).filter(Boolean) as IconEntry[];
      return [...top, ...data.lucide.filter(e => !POPULAR.includes(e.name))];
    }
    const pool = tab === 'brands' ? data.brands : [...data.brands, ...data.lucide];
    const hits = pool.filter(e => words.every(w => e.tags.includes(w)));
    // Treffer im Namen zuerst
    const score = (e: IconEntry) => (e.name.startsWith(words[0]) ? 0 : e.tags.split(' ').some(t => t === words[0]) ? 1 : 2);
    return hits.sort((a, b) => score(a) - score(b) || a.name.length - b.name.length);
  }, [data, q, tab]);

  const pick = (e: IconEntry) => {
    if (replaceId) replaceIcon(replaceId, e); else insertIcon(e);
    close();
  };

  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="dialog icon-dialog" role="dialog" aria-modal="true" aria-labelledby="icon-title">
        <header className="dialog-head">
          <h2 id="icon-title">{replaceId ? 'Anderes Icon wählen' : 'Icon einfügen'}</h2>
          <button type="button" className="ibtn" aria-label="Schließen" title="Schließen (Esc)" onClick={close}><Icons.close /></button>
        </header>
        <div className="icon-bar">
          <input className="textinput icon-search" autoFocus value={q} onChange={e => setQ(e.target.value)} spellCheck={false}
            placeholder="Suchen, z. B. Telefon, Pfeil, Warenkorb, Instagram …" aria-label="Icons suchen" />
          <div className="seg" role="tablist" aria-label="Sammlung">
            <button type="button" role="tab" aria-selected={tab === 'icons'} className={`seg-text${tab === 'icons' ? ' active' : ''}`} onClick={() => setTab('icons')}>Icons</button>
            <button type="button" role="tab" aria-selected={tab === 'brands'} className={`seg-text${tab === 'brands' ? ' active' : ''}`} onClick={() => setTab('brands')}>Social Media</button>
          </div>
        </div>
        <div className="dialog-body icon-body">
          {err && <p className="notice warn">{err}</p>}
          {!data && !err && <p className="icon-empty">Icons werden geladen …</p>}
          {data && !list.length && <p className="icon-empty">Kein Icon gefunden. Versuche ein anderes Wort – auch englische Begriffe funktionieren.</p>}
          {data && list.length > 0 && (!q && tab === 'icons'
            ? [['Beliebt', list.slice(0, Math.min(limit, POPULAR.length))], ['Alle Icons', list.slice(POPULAR.length, limit)]] as const
            : [[null, list.slice(0, limit)]] as const
          ).map(([label, items]) => items.length > 0 && (
            <section key={label ?? 'hits'}>
              {label && <div className="icon-section">{label}</div>}
              <div className="icon-grid">
                {items.map(e => (
                  <button key={e.name} type="button" className="icon-cell" title={iconLabel(e)} aria-label={iconLabel(e)} onClick={() => pick(e)}>
                    <IconGlyph e={e} />
                  </button>
                ))}
              </div>
            </section>
          ))}
          {list.length > limit && (
            <div className="icon-more"><button type="button" className="btn" onClick={() => setLimit(l => l + PAGE * 2)}>Mehr anzeigen ({list.length - limit} weitere)</button></div>
          )}
        </div>
        <footer className="dialog-foot">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Icons.download /> Eigene SVG-Datei …</button>
          <input ref={fileRef} type="file" accept=".svg,image/svg+xml" hidden onChange={async ev => {
            const f = ev.target.files?.[0];
            ev.target.value = '';
            if (!f) return;
            const r = await importSvgFile(f, undefined, replaceId ?? undefined);
            if (r) setErr(r); else close();
          }} />
          <span className="muted icon-credit">Icons: Lucide (ISC) · Logos: Simple Icons (CC0). Logos nur für Verweise auf das eigene Profil verwenden.</span>
        </footer>
      </div>
    </div>
  );
}
