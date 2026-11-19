// Eigene Kopfzeile / Fußzeile: festlegen, auf allen Seiten einsetzen, fixieren, schmaler beim Scrollen, Menü-Bereich
import { useState } from 'react';
import { useEditor, viewPage } from '../store';
import type { WNode } from '../model/types';
import { allPages, isPageBoard } from '../model/pageRules';
import { instanceRootOf } from '../model/components';
import { isComponentPage, showMain } from '../model/library';
import { ROLE_NAMES, makeRegion, placeEverywhere, regionStatus, removeEverywhere, setMenuBoard, setRole, type Role } from '../model/regions';
import { Seg } from '../ui/controls';
import { Icons } from '../ui/icons';

const S = () => useEditor.getState();

export function RegionSection({ node }: { node: WNode }) {
  const page = useEditor(viewPage);
  const doc = useEditor(s => s.doc);
  const compPage = useEditor(s => isComponentPage(s.doc, s.pageId));
  const [msg, setMsg] = useState<string | null>(null);

  // Original einer Komponente (kein Varianten-Teil)
  if (node.isMain && !node.parentId && node.type === 'board') return <MainRegion node={node} msg={msg} setMsg={setMsg} />;

  // Kopie einer Kopf-/Fußzeile auf einer Seite
  const root = instanceRootOf(page, node.id);
  if (root && root === node.id) {
    const main = allPages(doc).map(p => p.nodes[node.componentId!]).find(n => n?.isMain);
    if (!main?.role) return null;
    return (
      <section className="section comp-section">
        <div className="field-label">Das ist die {ROLE_NAMES[main.role]} der Website</div>
        <p className="hint">Gestaltung, Menü und Verhalten stellst du im Original ein – dann gilt es auf allen Seiten.</p>
        <div className="row"><button type="button" className="btn grow" onClick={() => showMain(main.id)}>{ROLE_NAMES[main.role]} bearbeiten</button></div>
      </section>
    );
  }

  // Selbst gebautes Board direkt auf einer Seite: zur Kopf-/Fußzeile machen
  if (!compPage && node.type === 'board' && !node.mainId && !node.isMain && node.parentId && isPageBoard(page, node.parentId)) {
    const run = (role: Role) => {
      const r = makeRegion(role);
      if (r) setMsg(`${ROLE_NAMES[role]} festgelegt und auf ${r.placed + 1} Seite(n) eingesetzt${r.replaced ? `, ${r.replaced} alte ersetzt` : ''}.`);
    };
    return (
      <section className="section comp-section">
        <div className="field-label">Eigene Kopf- oder Fußzeile</div>
        <p className="hint">Macht dieses Board zur Komponente und setzt es auf allen Seiten ein. Eine vorhandene Kopf- bzw. Fußzeile wird dabei ersetzt.</p>
        <div className="row">
          <button type="button" className="btn grow" onClick={() => run('header')}>Als Kopfzeile</button>
          <button type="button" className="btn grow" onClick={() => run('footer')}>Als Fußzeile</button>
        </div>
        {msg && <p className="proto-hint" aria-live="polite">{msg}</p>}
      </section>
    );
  }
  return null;
}

function MainRegion({ node, msg, setMsg }: { node: WNode; msg: string | null; setMsg: (m: string | null) => void }) {
  const page = useEditor(viewPage);
  const doc = useEditor(s => s.doc);
  const state = useEditor(s => s.interaction);
  const role = node.role ?? null;
  const st = role ? regionStatus(doc, node.id) : null;
  const boards = Object.values(page.nodes).filter(n => n.type === 'board' && n.id !== node.id && inside(page.nodes, n.id, node.id));
  const menu = boards.find(b => b.navLinks);
  const mut = (fn: (n: WNode) => void, key: string) => S().mutate(pg => { const n = pg.nodes[node.id]; if (n) fn(n); }, { key });

  const pin = node.pin?.mode ?? 'none';
  const shrinkPad = (n: WNode) => n.layout ? { ...n.layout, padding: [Math.round(n.layout.padding[0] / 2), n.layout.padding[1], Math.round(n.layout.padding[2] / 2), n.layout.padding[3]] as [number, number, number, number] } : null;
  const shrinks = !!node.scrolled && (node.layout ? !!node.scrolled.layout : node.scrolled.h !== undefined);

  return (
    <section className="section comp-section">
      <div className="field-label">Verwendung auf der Website</div>
      <Seg value={role ?? 'none'} onChange={v => { setRole(node.id, v === 'none' ? null : v as Role); setMsg(null); }} options={[
        { value: 'none', icon: <span>Normal</span>, title: 'Eine ganz normale Komponente' },
        { value: 'header', icon: <span>Kopfzeile</span>, title: 'Steht oben auf jeder Seite, mit Menü' },
        { value: 'footer', icon: <span>Fußzeile</span>, title: 'Steht unten auf jeder Seite' },
      ]} />
      {role && st && (
        <>
          <p className="hint">Auf {st.has} von {st.total} Seiten eingesetzt.</p>
          <div className="row">
            <button type="button" className="btn grow" title="Setzt die Komponente auf jeder Seite ein und ersetzt dort eine andere Kopf- bzw. Fußzeile"
              onClick={() => { const r = placeEverywhere(node.id); setMsg(r.placed || r.replaced ? `Auf ${r.placed} Seite(n) eingesetzt${r.replaced ? `, ${r.replaced} alte ersetzt` : ''}.` : 'Ist schon auf allen Seiten.'); }}>
              <Icons.plus /> Auf allen Seiten einsetzen</button>
            <button type="button" className="btn" disabled={!st.has} title="Nimmt die Kopien von allen Seiten – die Komponente selbst bleibt erhalten"
              onClick={() => { const c = removeEverywhere(node.id); setMsg(`Von ${c} Seite(n) entfernt.`); }}>Überall entfernen</button>
          </div>
        </>
      )}
      {msg && <p className="proto-hint" aria-live="polite">{msg}</p>}

      {role === 'header' && (
        <>
          <div className="field" style={{ marginTop: 10 }}>
            <div className="field-label">Beim Scrollen</div>
            <select className="select" aria-label="Kopfzeile beim Scrollen" value={pin} onChange={e => {
              const v = e.target.value;
              mut(n => { n.pin = v === 'none' ? null : { mode: v as 'sticky' | 'fixed', h: 'left', v: 'top', bottom: 24 }; }, 'pin');
            }}>
              <option value="none">Scrollt mit der Seite weg</option>
              <option value="sticky">Bleibt oben stehen</option>
              <option value="fixed">Schwebt über der Seite (Inhalt beginnt dahinter)</option>
            </select>
          </div>
          {pin !== 'none' && (
            <label className="check">
              <input type="checkbox" checked={shrinks} onChange={e => mut(n => {
                const sc = { ...(n.scrolled ?? {}) };
                if (e.target.checked) {
                  if (n.layout) sc.layout = shrinkPad(n)!; else sc.h = Math.round(n.h * 0.75);
                  n.scrollAt ??= 80;
                } else { delete sc.layout; delete sc.h; }
                n.scrolled = Object.keys(sc).length ? sc : null;
              }, 'scrolled')} />
              Wird beim Scrollen schmaler
            </label>
          )}
          {pin !== 'none' && (
            <div className="row">
              <button type="button" className={`btn grow${state === 'scrolled' ? ' active' : ''}`}
                onClick={() => S().setInteraction(state === 'scrolled' ? 'normal' : 'scrolled')}>
                {state === 'scrolled' ? 'Bearbeitung beenden' : 'Aussehen nach dem Scrollen gestalten'}</button>
            </div>
          )}
          <div className="field" style={{ marginTop: 10 }}>
            <div className="field-label">Menü-Bereich</div>
            <select className="select" aria-label="Menü-Bereich" value={menu?.id ?? ''} onChange={e => setMenuBoard(node.id, e.target.value || null)}>
              <option value="">Kein Menü</option>
              {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <p className="hint">{boards.length
            ? 'Das Board mit den Menüpunkten. Es kann auf kleinen Bildschirmen zum ☰-Symbol werden – Einstellungen dazu unten unter „Menü“.'
            : 'Lege in der Kopfzeile ein Board für die Menüpunkte an (z. B. mit ⇧A um mehrere Texte), dann wähle es hier aus.'}</p>
        </>
      )}
      {role === 'footer' && <p className="hint">Die Fußzeile bleibt immer ganz unten – auch wenn die Seite wenig Inhalt hat. Neue Elemente landen davor.</p>}
    </section>
  );
}

function inside(nodes: Record<string, WNode>, id: string, ancestor: string) {
  for (let n = nodes[id]; n; n = nodes[n.parentId ?? '']) if (n.id === ancestor) return true;
  return false;
}
