// Bewegte Bausteine: einfügen (ohne Auswahl) und einstellen (Karussell, Vorher-Nachher, Animation)
import { useRef, useState } from 'react';
import { useEditor, pageOf } from '../store';
import type { WNode } from '../model/types';
import { addAnimationFile, insertAnimation, insertCarousel, insertCompare, insertCounter, insertMarquee, MAX_ANIM_MB, showSlide, slideOf, useSlides } from '../model/blocks';
import { currentPageHasRoot } from '../model/embed';
import { uid } from '../model/factory';
import { NumberField, Section, Seg } from '../ui/controls';
import { newAnimation, openAnimation } from '../model/anim';
import { insertAccordion, insertPopup, insertTabs } from '../model/sections';
import { allPages } from '../model/pageRules';

const S = () => useEditor.getState();
const NO_ANIMS: never[] = [];
const setNode = (id: string, fn: (n: WNode) => void, key: string) => S().mutate(pg => { const n = pg.nodes[id]; if (n) fn(n); }, { key });

function AnimFileButton({ label, onDone }: { label: string; onDone: (id: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="btn grow" onClick={() => ref.current?.click()}>{label}</button>
      <input ref={ref} type="file" accept=".json,application/json" hidden onChange={async e => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setErr(null);
        const r = await addAnimationFile(f);
        if (r.error) setErr(r.error); else if (r.id) onDone(r.id);
      }} />
      {err && <p className="notice warn">{err}</p>}
    </>
  );
}

const BLOCKS: { label: string; tip: string; demo: string; run: () => void }[] = [
  { label: 'Karussell', tip: 'Folien zum Durchblättern – mit Pfeilen und Punkten', demo: 'fd-car', run: insertCarousel },
  { label: 'Vorher-Nachher', tip: 'Zwei Bilder übereinander mit Schieberegler', demo: 'fd-cmp', run: insertCompare },
  { label: 'Laufband', tip: 'Text läuft endlos durch', demo: 'fd-marquee', run: insertMarquee },
  { label: 'Zahl', tip: 'Eine große Zahl, die beim Erscheinen hochzählt', demo: 'fd-count', run: insertCounter },
  { label: 'Akkordeon', tip: 'Einträge zum Auf- und Zuklappen – z. B. häufige Fragen', demo: 'fd-acc', run: insertAccordion },
  { label: 'Reiter', tip: 'Mehrere Inhalte an einer Stelle, umschalten per Knopf', demo: 'fd-tabs', run: insertTabs },
  { label: 'Pop-up', tip: 'Fenster über der Seite – öffnet per Knopf oder nach einer Wartezeit', demo: 'fd-pop', run: insertPopup },
];

export function BlocksInsertSection() {
  const hasRoot = useEditor(s => { void s.pageId; return currentPageHasRoot(); });
  const anims = useEditor(s => s.doc.library.animations ?? NO_ANIMS);
  return (
    <Section title="Bewegte Bausteine">
      <div className="fx-tiles">
        {BLOCKS.map(b => (
          <button key={b.label} type="button" className="fx-tile" title={b.tip} disabled={!hasRoot} onClick={b.run}>
            <span className={`fx-demo ${b.demo}`}><i /><i /><i /></span>{b.label}
          </button>
        ))}
      </div>
      <OwnAnimInsert hasRoot={hasRoot} />
      <div className="fx-group">Fertige Animation</div>
      {anims.length > 0 && (
        <div className="row">
          <select className="select grow" aria-label="Animation aus der Sammlung einfügen" value="" onChange={e => e.target.value && insertAnimation(e.target.value)}>
            <option value="">Aus der Sammlung einfügen …</option>
            {anims.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      )}
      {hasRoot && <div className="row"><AnimFileButton label="Animation hochladen …" onDone={id => insertAnimation(id)} /></div>}
      <p className="proto-hint">Kostenlose Animationen gibt es z. B. bei LottieFiles – dort als „Lottie JSON“ herunterladen (bis {MAX_ANIM_MB} MB). Wird unten auf der Seite eingefügt.</p>
    </Section>
  );
}

export function CarouselSection({ node }: { node: WNode }) {
  const C = node.carousel!;
  const sel = useEditor(s => slideOf(pageOf(s), node.id, s.selection[0]));
  const ui = useSlides(s => s[node.id] ?? 0);
  const n = node.children.length;
  const cur = Math.min(n - 1, Math.max(0, sel >= 0 ? sel : ui));
  const set = (fn: (c: NonNullable<WNode['carousel']>) => void, key: string) => setNode(node.id, x => { if (x.carousel) { const c = { ...x.carousel }; fn(c); x.carousel = c; } }, key);
  const go = (i: number) => { const j = (i + n) % n; showSlide(node.id, j); if (sel >= 0) S().setSelection([node.id]); };
  const addSlide = () => {
    let newId = '';
    S().mutate(pg => {
      const car = pg.nodes[node.id];
      const src = pg.nodes[car.children[cur]];
      if (!src) return;
      // Kopie der gezeigten Folie (mit Inhalt)
      const map = new Map<string, string>();
      const copy = (id: string, parent: string): string => {
        const o = pg.nodes[id];
        const nid = uid();
        map.set(id, nid);
        const c: WNode = JSON.parse(JSON.stringify(o));
        c.id = nid; c.parentId = parent; c.isMain = false; c.componentId = undefined; c.mainId = undefined;
        pg.nodes[nid] = c;
        c.children = o.children.map(ch => copy(ch, nid));
        return nid;
      };
      newId = copy(src.id, car.id);
      pg.nodes[newId].name = `Folie ${car.children.length + 1}`;
      car.children.splice(cur + 1, 0, newId);
    }, { key: 'slide-add' });
    showSlide(node.id, cur + 1);
    if (newId) S().setSelection([node.id]);
  };
  const delSlide = () => {
    if (n <= 1) return;
    S().mutate(pg => {
      const car = pg.nodes[node.id];
      const id = car.children[cur];
      const rm = (x: string) => { const o = pg.nodes[x]; if (!o) return; o.children.forEach(rm); delete pg.nodes[x]; };
      car.children.splice(cur, 1);
      rm(id);
    }, { key: 'slide-del' });
    showSlide(node.id, Math.max(0, cur - 1));
    S().setSelection([node.id]);
  };
  return (
    <Section title="Karussell">
      <div className="row">
        <span className="lbl">Folie</span>
        <button type="button" className="btn" title="Vorherige Folie zeigen" aria-label="Vorherige Folie zeigen" onClick={() => go(cur - 1)}>‹</button>
        <span className="grow" style={{ textAlign: 'center' }}>{cur + 1} von {n}</span>
        <button type="button" className="btn" title="Nächste Folie zeigen" aria-label="Nächste Folie zeigen" onClick={() => go(cur + 1)}>›</button>
      </div>
      <div className="row">
        <button type="button" className="btn grow" onClick={addSlide}>Folie hinzufügen</button>
        <button type="button" className="btn" disabled={n <= 1} onClick={delSlide}>Folie löschen</button>
      </div>
      <div className="row">
        <span className="lbl">Pfeile</span>
        <Seg value={C.arrows ? 'yes' : 'no'} onChange={v => set(c => { c.arrows = v === 'yes'; }, 'car-arrows')} options={[
          { value: 'yes', icon: <span>Ja</span>, title: 'Pfeile links und rechts zeigen' }, { value: 'no', icon: <span>Nein</span>, title: 'Keine Pfeile' }]} />
      </div>
      <div className="row">
        <span className="lbl">Punkte</span>
        <Seg value={C.dots ? 'yes' : 'no'} onChange={v => set(c => { c.dots = v === 'yes'; }, 'car-dots')} options={[
          { value: 'yes', icon: <span>Ja</span>, title: 'Punkte unten zeigen' }, { value: 'no', icon: <span>Nein</span>, title: 'Keine Punkte' }]} />
      </div>
      <div className="row">
        <span className="lbl">Von selbst</span>
        <Seg value={C.auto ? 'yes' : 'no'} onChange={v => set(c => { c.auto = v === 'yes' ? 5 : null; }, 'car-auto')} options={[
          { value: 'yes', icon: <span>Ja</span>, title: 'Blättert von selbst weiter (hält an, wenn die Maus darüber ist)' }, { value: 'no', icon: <span>Nein</span>, title: 'Nur per Klick oder Wischen' }]} />
        {C.auto && <NumberField className="w72" title="Sekunden pro Folie" suffix="s" min={2} max={30} precision={0} value={C.auto} onChange={v => set(c => { c.auto = v; }, 'car-auto-s')} />}
      </div>
      <p className="proto-hint">Auf der Arbeitsfläche siehst du immer eine Folie – blättere hier oder wähle eine Ebene darin in der Ebenenliste. Auf dem Handy wischt man mit dem Finger.</p>
    </Section>
  );
}

export function CompareSection({ node }: { node: WNode }) {
  return (
    <Section title="Vorher-Nachher">
      <div className="row">
        <span className="lbl">Regler bei</span>
        <input type="range" className="grow" min={0} max={100} value={node.compare!.pos} aria-label="Startstelle des Reglers"
          onChange={e => setNode(node.id, n => { n.compare = { pos: +e.target.value }; }, 'cmp-pos')} />
        <span style={{ width: 36, textAlign: 'right' }}>{node.compare!.pos} %</span>
      </div>
      <p className="proto-hint">Darin liegen zwei Bilder übereinander: „Vorher“ (unten) und „Nachher“ (oben). Wähle eines aus und tausche im Reiter „Dokument“ das Bild. Besucher ziehen den Regler mit Maus oder Finger.</p>
    </Section>
  );
}

export function LottieSection({ node }: { node: WNode }) {
  const L = node.lottie!;
  const anims = useEditor(s => s.doc.library.animations ?? NO_ANIMS);
  const set = (patch: Partial<NonNullable<WNode['lottie']>>, key: string) => setNode(node.id, n => { if (n.lottie) n.lottie = { ...n.lottie, ...patch }; }, key);
  return (
    <Section title="Animation">
      <div className="row">
        <select className="select grow" aria-label="Animation" value={L.ref} onChange={e => set({ ref: e.target.value }, 'lottie-ref')}>
          {!anims.some(a => a.id === L.ref) && <option value={L.ref}>Fehlt</option>}
          {anims.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className="row"><AnimFileButton label="Andere hochladen …" onDone={id => set({ ref: id }, 'lottie-ref')} /></div>
      <div className="row">
        <span className="lbl">Startet</span>
        <select className="select grow" aria-label="Wann die Animation startet" value={L.play} onChange={e => set({ play: e.target.value as 'auto' }, 'lottie-play')}>
          <option value="view">Wenn sie ins Bild kommt</option>
          <option value="auto">Sofort</option>
          <option value="hover">Wenn die Maus darüber fährt</option>
        </select>
      </div>
      <div className="row">
        <span className="lbl">Wiederholen</span>
        <Seg value={L.loop ? 'yes' : 'no'} onChange={v => set({ loop: v === 'yes' }, 'lottie-loop')} options={[
          { value: 'yes', icon: <span>Ja</span>, title: 'Läuft immer wieder' }, { value: 'no', icon: <span>Nein</span>, title: 'Läuft einmal und bleibt dann stehen' }]} />
      </div>
      <p className="proto-hint">Auf der Arbeitsfläche steht sie still, in der Vorschau läuft sie.</p>
    </Section>
  );
}


function OwnAnimInsert({ hasRoot }: { hasRoot: boolean }) {
  return (
    <>
      <div className="fx-group">Eigene Animation</div>
      <div className="row">
        <button type="button" className="btn grow" onClick={newAnimation} title="Öffnet den Animations-Editor mit Zeitleiste">＋ Neue Animation zeichnen</button>
      </div>
      <p className="proto-hint">Animierte Icons, Grafiken oder Diagramme selbst zeichnen und mit Zuständen oder einer Zeitleiste bewegen. Fertige Animationen findest du links unter „Assets → Komponenten (Animationen)“ – von dort auf die Fläche ziehen.</p>
    </>
  );
}

/** Ausgewählte Kopie einer eigenen Animation */
export function OwnAnimSection({ node }: { node: WNode }) {
  const info = useEditor(s => {
    const cid = node.componentId;
    if (!cid) return null;
    const pm = allPages(s.doc).find(p => p.nodes[cid]?.isMain);
    const m = pm?.nodes[cid];
    return m?.animation ? `${cid}|${m.name}` : null;
  });
  if (!info) return null;
  const [id, name] = info.split('|');
  return (
    <Section title="Eigene Animation">
      <p className="proto-hint" style={{ marginTop: 0 }}><b>{name}</b> – auf der Arbeitsfläche siehst du das Ende, auf der Website läuft sie ab.</p>
      <div className="row"><button type="button" className="btn primary grow" onClick={() => openAnimation(id)}>Animation bearbeiten</button></div>
    </Section>
  );
}
