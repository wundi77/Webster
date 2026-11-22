import { isAnimInstance } from '../model/animCore';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { SectionsInsertSection } from './SectionsInsert';
import { NavInsertSection } from './NavSection';
import { FormInsertSection } from './FormSection';
import { EmbedInsertSection } from './EmbedSection';
import { BlocksInsertSection } from './BlocksSection';
import { CodeInsertSection } from './CodeSection';
import { useDialog } from './SiteSettings';
import { useEditor, viewPage } from '../store';
import { Icons, TypeIcon } from '../ui/icons';
import { IconButton } from '../ui/controls';
import {
  addPage, addPageFromTemplate, openImagePicker, addTemplate, containerOf, deletePage, deleteTemplate, duplicatePage, duplicateTemplate, movePage, renamePage,
  renameTemplate, saveAsTemplate, setHomePage, reparent, topLevel, updateNodes,
} from '../model/commands';
import { isAncestor } from '../model/geometry';
import { AssetsPanel } from './AssetsPanel';
import { HistoryPanel } from './HistoryPanel';
import { CommentsPanel } from './CommentsPanel';
import { isInstanceRoot } from '../model/components';
import { askConfirm } from '../ui/ConfirmDialog';
import type { Page } from '../model/types';
import { withScrolled } from '../model/hover';
const NO_PAGES: Page[] = [];

export type LeftArea = 'layers' | 'insert' | 'library' | 'history' | 'comments';
const AREA_KEY = 'webster.leftArea';
const AREAS: { id: LeftArea; label: string; sub: string; icon: ReactNode }[] = [
  { id: 'layers', label: 'Seiten & Ebenen', sub: 'Seiten deiner Website und was darauf liegt', icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true"><path d="M8 2l6 3-6 3-6-3 6-3z" /><path d="M2 8l6 3 6-3" /><path d="M2 11l6 3 6-3" /></svg> },
  { id: 'insert', label: 'Einfügen', sub: 'Fertige Abschnitte und Bausteine – Klick fügt ein', icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="3" /><path d="M8 5v6M5 8h6" /></svg> },
  { id: 'library', label: 'Bibliothek', sub: 'Komponenten, Farben, Schriften und Bilder dieses Projekts', icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="8" cy="8" r="6" /><circle cx="6" cy="6.5" r="1" /><circle cx="10" cy="6.5" r="1" /><circle cx="6.5" cy="10.5" r="1" /></svg> },
  { id: 'history', label: 'Verlauf', sub: 'Klick auf einen Schritt springt dorthin zurück', icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 2" /></svg> },
  { id: 'comments', label: 'Kommentare', sub: 'Website zum Ansehen weitergeben und Rückmeldungen abhaken', icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true"><path d="M3 3h10a1 1 0 011 1v6a1 1 0 01-1 1H7l-3 2.5V11H3a1 1 0 01-1-1V4a1 1 0 011-1z" /></svg> },
];
const loadArea = (): LeftArea => { try { const v = localStorage.getItem(AREA_KEY); if (AREAS.some(a => a.id === v)) return v as LeftArea; } catch { /* kein Speicher */ } return 'layers'; };
/** Welcher Bereich links offen ist */
export const useLeftArea = create<{ area: LeftArea; setArea: (a: LeftArea) => void }>(set => ({
  area: loadArea(),
  setArea: area => { set({ area }); try { localStorage.setItem(AREA_KEY, area); } catch { /* kein Speicher */ } },
}));

/** Schmale Symbolleiste ganz links: ein Bereich zur Zeit */
export function LeftRail() {
  const { area, setArea } = useLeftArea();
  const openComments = useEditor(s => (s.doc.comments ?? []).filter(c => !c.done).length);
  return (
    <nav className="rail" aria-label="Bereiche" role="tablist" aria-orientation="vertical">
      {AREAS.map(a => (
        <button key={a.id} type="button" role="tab" aria-selected={area === a.id} aria-label={a.label} title={a.label}
          className={`rail-btn${area === a.id ? ' on' : ''}`} onClick={() => setArea(a.id)}>
          {a.icon}<span className="rail-label">{a.id === 'layers' ? 'Seiten' : a.label}</span>
          {a.id === 'comments' && openComments > 0 && <span className="rail-badge" aria-label={`${openComments} offen`}>{openComments}</span>}
        </button>
      ))}
    </nav>
  );
}

export function LeftPanel() {
  const area = useLeftArea(s => s.area);
  const a = AREAS.find(x => x.id === area)!;
  return (
    <>
      <div className="area-head">
        <h2>{a.label}</h2>
        <span>{a.sub}</span>
      </div>
      <div className="panel-body" role="tabpanel" aria-label={a.label}>
        {area === 'layers' ? <><PagesSection /><TemplatesSection /><LayersSection /></>
          : area === 'insert' ? <InsertPanel />
          : area === 'library' ? <AssetsPanel />
          : area === 'comments' ? <CommentsPanel />
          : <HistoryPanel />}
      </div>
    </>
  );
}

/** Bereich „Einfügen“: alles, was man auf die Seite setzen kann */
function InsertPanel() {
  return (
    <div className="insert-panel">
      <section className="section">
        <div className="insert-quick">
          <button type="button" className="btn" onClick={() => { useEditor.getState().setTool('move'); useDialog.getState().show('icons'); }}><Icons.smile /> Icon …</button>
          <button type="button" className="btn" onClick={() => { useEditor.getState().setTool('move'); openImagePicker(); }}><Icons.image /> Bild …</button>
        </div>
        <p className="hint">Formen und Text zeichnest du mit der Werkzeugleiste über der Arbeitsfläche.</p>
      </section>
      <SectionsInsertSection />
      <NavInsertSection />
      <FormInsertSection />
      <EmbedInsertSection />
      <BlocksInsertSection />
      <CodeInsertSection />
    </div>
  );
}

function PagesSection() {
  const pages = useEditor(s => s.doc.pages);
  const pageId = useEditor(s => s.pageId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const templates = useEditor(s => s.doc.templatePages) ?? NO_PAGES;
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null);
  const headRef = useRef<HTMLDivElement>(null);
  // Ziehen zum Umsortieren: Ziel = Einfügeposition 0…pages.length
  const dragId = useRef<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const del = async (id: string, name: string) => {
    if (await askConfirm({ title: 'Seite wirklich löschen?', message: `„${name}“ wird mit allen Inhalten gelöscht. Rückgängig mit ⌘Z.`, confirmLabel: 'Löschen', danger: true })) deletePage(id);
  };

  const finishDrop = () => {
    const id = dragId.current;
    dragId.current = null;
    if (id == null || dropAt == null) { setDropAt(null); return; }
    const from = pages.findIndex(p => p.id === id);
    setDropAt(null);
    movePage(id, dropAt > from ? dropAt - 1 : dropAt);
  };

  return (
    <section className="section pages">
      <div className="section-head" ref={headRef}><span>Seiten</span>
        <IconButton icon={<Icons.plus />} title={templates.length ? 'Seite hinzufügen – leer oder aus einer Vorlage' : 'Seite hinzufügen'}
          onClick={() => {
            if (!templates.length) { addPage(); return; }
            const r = headRef.current?.getBoundingClientRect();
            setAddMenu({ x: r ? Math.max(8, r.right - 230) : 40, y: r ? r.bottom + 4 : 80 });
          }} />
      </div>
      {addMenu && <PageMenu x={addMenu.x} y={addMenu.y} onClose={() => setAddMenu(null)} items={[
        { label: 'Leere Seite', action: addPage },
        'sep',
        ...templates.map(t => ({ label: `Aus Vorlage „${t.name}“`, action: () => addPageFromTemplate(t.id) })),
      ]} />}
      <div onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(null); }}>
        {pages.map((p, i) => {
          const home = i === 0;
          const cls = ['page-row', p.id === pageId && 'active', dropAt === i && 'drop-before', dropAt === pages.length && i === pages.length - 1 && 'drop-after']
            .filter(Boolean).join(' ');
          return (
            <div key={p.id} className={cls} draggable={pages.length > 1 && renaming !== p.id}
              title={pages.length > 1 ? 'Ziehen, um die Reihenfolge zu ändern – die oberste Seite ist die Startseite' : undefined}
              onClick={() => useEditor.getState().setPage(p.id)} onDoubleClick={() => setRenaming(p.id)}
              onContextMenu={e => { e.preventDefault(); setMenu({ id: p.id, x: e.clientX, y: e.clientY }); }}
              onDragStart={e => { dragId.current = p.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.name); }}
              onDragOver={e => {
                if (!dragId.current) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
              }}
              onDrop={e => { e.preventDefault(); finishDrop(); }}
              onDragEnd={() => { dragId.current = null; setDropAt(null); }}>
              {home ? <Icons.home className="ticon" /> : <Icons.file className="ticon" />}
              {renaming === p.id ? (
                <input autoFocus defaultValue={p.name} onClick={e => e.stopPropagation()}
                  onBlur={e => { if (e.target.value.trim()) renamePage(p.id, e.target.value.trim()); setRenaming(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }} />
              ) : <span className="lname">{p.name}</span>}
              {home && renaming !== p.id && <span className="page-home-tag">Als Startseite definiert</span>}
              {!home && (
                <button className="lbtn" title="Als Startseite festlegen" aria-label="Als Startseite festlegen"
                  onClick={e => { e.stopPropagation(); setHomePage(p.id); }}>
                  <Icons.home />
                </button>
              )}
              <button className="lbtn" title="Seite duplizieren" aria-label="Seite duplizieren"
                onClick={e => { e.stopPropagation(); duplicatePage(p.id); }}>
                <Icons.copy />
              </button>
              {pages.length > 1 && (
                <button className="lbtn lbtn-danger" title="Seite löschen" aria-label="Seite löschen"
                  onClick={e => { e.stopPropagation(); del(p.id, p.name); }}>
                  <Icons.trash />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {menu && (() => {
        const i = pages.findIndex(p => p.id === menu.id);
        const p = pages[i];
        if (!p) return null;
        return <PageMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={[
          { label: 'Als Startseite festlegen', disabled: i === 0, action: () => setHomePage(p.id) },
          { label: 'Nach oben', disabled: i === 0, action: () => movePage(p.id, i - 1) },
          { label: 'Nach unten', disabled: i === pages.length - 1, action: () => movePage(p.id, i + 1) },
          'sep',
          { label: 'Seite duplizieren', action: () => duplicatePage(p.id) },
          { label: 'Als Vorlage speichern', action: () => saveAsTemplate(p.id) },
          { label: 'Umbenennen', action: () => setRenaming(p.id) },
          { label: 'Seite löschen', disabled: pages.length <= 1, action: () => del(p.id, p.name) },
        ]} />;
      })()}
    </section>
  );
}

/** Vorlagen-Seiten: Muster für neue Seiten – ohne Verknüpfung zu den daraus erstellten Seiten */
function TemplatesSection() {
  const templates = useEditor(s => s.doc.templatePages) ?? NO_PAGES;
  const pageId = useEditor(s => s.pageId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const del = async (id: string, name: string) => {
    if (await askConfirm({ title: 'Vorlage wirklich löschen?', message: `„${name}“ wird gelöscht. Seiten, die aus ihr erstellt wurden, bleiben unverändert. Rückgängig mit ⌘Z.`, confirmLabel: 'Löschen', danger: true })) deleteTemplate(id);
  };
  const onTemplate = templates.some(t => t.id === pageId);
  const [openState, setOpen] = useState(false);
  const open = openState || onTemplate;
  return (
    <section className={`section pages templates${open ? '' : ' closed'}`}>
      <div className="section-head">
        <button type="button" className="section-toggle" aria-expanded={open} onClick={() => setOpen(!open)} title={open ? 'Zuklappen' : 'Aufklappen'}>
          <svg className="sec-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 3.8 5 6.3l2.5-2.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="sec-title">Vorlagen</span>
          {!open && <span className="sec-sum">{templates.length ? templates.length : 'Muster für neue Seiten'}</span>}
        </button>
        {open && <IconButton icon={<Icons.plus />} title="Neue, leere Vorlage anlegen" onClick={addTemplate} />}
      </div>
      {open && <>
      {!templates.length && (
        <p className="hint">Muster für neue Seiten, z. B. mit festem Raster. Mit „+“ anlegen oder per Rechtsklick auf eine Seite „Als Vorlage speichern“. Neue Seiten sind unabhängige Kopien.</p>
      )}
      {templates.map(t => (
        <div key={t.id} className={`page-row${t.id === pageId ? ' active' : ''}`}
          onClick={() => useEditor.getState().setPage(t.id)} onDoubleClick={() => setRenaming(t.id)}
          onContextMenu={e => { e.preventDefault(); setMenu({ id: t.id, x: e.clientX, y: e.clientY }); }}>
          <Icons.template className="ticon" />
          {renaming === t.id ? (
            <input autoFocus defaultValue={t.name} onClick={e => e.stopPropagation()}
              onBlur={e => { if (e.target.value.trim()) renameTemplate(t.id, e.target.value.trim()); setRenaming(null); }}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }} />
          ) : <span className="lname">{t.name}</span>}
          <button className="lbtn" title="Neue Seite aus dieser Vorlage" aria-label="Neue Seite aus dieser Vorlage"
            onClick={e => { e.stopPropagation(); addPageFromTemplate(t.id); }}>
            <Icons.plus />
          </button>
          <button className="lbtn" title="Vorlage duplizieren" aria-label="Vorlage duplizieren"
            onClick={e => { e.stopPropagation(); duplicateTemplate(t.id); }}>
            <Icons.copy />
          </button>
          <button className="lbtn lbtn-danger" title="Vorlage löschen" aria-label="Vorlage löschen"
            onClick={e => { e.stopPropagation(); del(t.id, t.name); }}>
            <Icons.trash />
          </button>
        </div>
      ))}
      {menu && (() => {
        const t = templates.find(x => x.id === menu.id);
        if (!t) return null;
        return <PageMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={[
          { label: 'Neue Seite aus dieser Vorlage', action: () => addPageFromTemplate(t.id) },
          'sep',
          { label: 'Vorlage duplizieren', action: () => duplicateTemplate(t.id) },
          { label: 'Umbenennen', action: () => setRenaming(t.id) },
          { label: 'Vorlage löschen', action: () => del(t.id, t.name) },
        ]} />;
      })()}
      </>}
    </section>
  );
}

type MenuItem = { label: string; action: () => void; disabled?: boolean } | 'sep';

/** Kleines Rechtsklick-Menü für eine Seite */
function PageMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', h, true);
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('pointerdown', h, true); window.removeEventListener('keydown', k); };
  }, [onClose]);
  return (
    <div ref={ref} className="ctx" style={{ left: Math.min(x, window.innerWidth - 220), top: Math.min(y, window.innerHeight - 200) }}
      onContextMenu={e => e.preventDefault()}>
      {items.map((it, i) => it === 'sep'
        ? <div key={i} className="menu-sep" />
        : <button key={i} type="button" className="menu-item" disabled={it.disabled} onClick={() => { onClose(); it.action(); }}><span>{it.label}</span></button>)}
    </div>
  );
}

type DropPos = 'before' | 'after' | 'inside';

function LayersSection() {
  const page = useEditor(viewPage);
  const selection = useEditor(s => s.selection);
  const hover = useEditor(s => s.hoverId);
  const scrolledMode = useEditor(s => s.interaction === 'scrolled');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; pos: DropPos } | null>(null);
  const dragIds = useRef<string[] | null>(null);
  const anchor = useRef<string | null>(null);

  const rows: { id: string; depth: number }[] = [];
  // In Layout-Boards entspricht die Reihenfolge der Liste der Reihenfolge auf der Seite
  const flowOrder = (parentId: string | null) => !!(parentId && page.nodes[parentId]?.layout);
  const walk = (ids: string[], depth: number, parentId: string | null) => {
    for (const id of flowOrder(parentId) ? ids : [...ids].reverse()) {
      const n = page.nodes[id];
      if (!n) continue;
      rows.push({ id, depth });
      // Eingebaute Animation: ein geschlossenes Element, ihr Inhalt wird im Animations-Editor bearbeitet
      if (n.children.length && !collapsed.has(id) && !isAnimInstance(n)) walk(n.children, depth + 1, id);
    }
  };
  walk(page.rootIds, 0, null);

  const s = useEditor.getState();

  const select = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && anchor.current && rows.some(r => r.id === anchor.current)) {
      const a = rows.findIndex(r => r.id === anchor.current), b = rows.findIndex(r => r.id === id);
      const range = rows.slice(Math.min(a, b), Math.max(a, b) + 1).map(r => r.id);
      s.setSelection(topLevel(page, range));
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      s.setSelection(selection.includes(id) ? selection.filter(x => x !== id) : [...selection, id]);
    } else s.setSelection([id]);
    anchor.current = id;
  };

  const onDragOver = (e: React.DragEvent, id: string) => {
    if (!dragIds.current) return;
    e.preventDefault();
    const n = page.nodes[id];
    if (dragIds.current.some(d => d === id || isAncestor(page, d, id))) { setDrop(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    const pos: DropPos = n.type === 'board' ? (y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside') : (y < 0.5 ? 'before' : 'after');
    if (drop?.id !== id || drop.pos !== pos) setDrop({ id, pos });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const ids = dragIds.current;
    const d = drop;
    dragIds.current = null;
    setDrop(null);
    if (!ids || !d) return;
    const target = page.nodes[d.id];
    if (d.pos === 'inside') {
      s.mutate(pg => reparent(pg, ids, target.id));
      setCollapsed(c => { const n = new Set(c); n.delete(target.id); return n; });
    } else {
      const idx = containerOf(page, target.parentId).indexOf(target.id);
      // Normale Ebenenliste ist umgekehrt ("darüber" = weiter vorne = höherer Index), in Layouts nicht
      const above = d.pos === 'before';
      const index = flowOrder(target.parentId) ? (above ? idx : idx + 1) : (above ? idx + 1 : idx);
      s.mutate(pg => reparent(pg, ids, target.parentId, index));
    }
  };

  if (!rows.length) {
    return <p className="empty-hint">Noch keine Ebenen. Wähle oben ein Werkzeug, z. B. <b>Rechteck (R)</b>, und ziehe auf der Arbeitsfläche einen Rahmen auf.</p>;
  }

  return (
    <section className="section layers-section">
      <div className="section-head"><span>Ebenen</span></div>
      <div className="layers" onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null); }}>
        {rows.map(({ id, depth }) => {
          const n = page.nodes[id];
          const vis = scrolledMode ? withScrolled(n).visible : n.visible;
          const sel = selection.includes(id);
          const hasKids = n.children.length > 0 && !isAnimInstance(n);
          const dropCls = drop?.id === id ? ` drop-${drop.pos}` : '';
          return (
            <div key={id}
              className={`layer${n.isMain || n.mainId || n.variantSet ? ' comp' : ''}${sel ? ' sel' : ''}${hover === id ? ' hover' : ''}${!vis ? ' hidden-node' : ''}${dropCls}`}
              style={{ paddingLeft: 6 + depth * 14 }}
              draggable={renaming !== id}
              onDragStart={e => {
                dragIds.current = sel ? topLevel(page, selection) : [id];
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', id);
              }}
              onDragOver={e => onDragOver(e, id)} onDrop={onDrop}
              onDragEnd={() => { dragIds.current = null; setDrop(null); }}
              onClick={e => select(id, e)}
              onDoubleClick={() => setRenaming(id)}
              onMouseEnter={() => s.setHover(id)} onMouseLeave={() => s.setHover(null)}>
              <span className="caret" onClick={e => {
                e.stopPropagation();
                if (!hasKids) return;
                setCollapsed(c => { const x = new Set(c); if (x.has(id)) x.delete(id); else x.add(id); return x; });
              }}>
                {hasKids && (collapsed.has(id) ? <Icons.chevronRight width={12} height={12} /> : <Icons.chevronDown width={12} height={12} />)}
              </span>
              <TypeIcon type={n.type} main={n.isMain || n.variantSet} instance={isInstanceRoot(n)} />
              {renaming === id ? (
                <input autoFocus defaultValue={n.name} onClick={e => e.stopPropagation()}
                  onBlur={e => { const v = e.target.value.trim(); if (v) updateNodes([id], m => { m.name = v; }); setRenaming(null); }}
                  onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }} />
              ) : <span className="lname">{n.name}</span>}
              {n.link && <span title="Verlinkt"><Icons.link className="link-icon" /></span>}
              <button className={`lbtn${n.locked ? ' on' : ''}`} title={n.locked ? 'Entsperren' : 'Sperren'} aria-label={n.locked ? 'Entsperren' : 'Sperren'}
                onClick={e => { e.stopPropagation(); updateNodes([id], m => { m.locked = !m.locked; }); }}>
                {n.locked ? <Icons.lock /> : <Icons.unlock />}
              </button>
              <button className={`lbtn${!vis ? ' on' : ''}`} title={vis ? 'Ausblenden' : 'Einblenden'} aria-label={vis ? 'Ausblenden' : 'Einblenden'}
                onClick={e => { e.stopPropagation(); updateNodes([id], m => { m.visible = !m.visible; }); }}>
                {vis ? <Icons.eye /> : <Icons.eyeOff />}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
