// Einstellungen für Akkordeon, Reiter, Pop-up und Hinweis-Texte
import { useEditor, pageOf } from '../store';
import type { WNode } from '../model/types';
import { addPart } from '../model/sections';
import { showSlide, slideOf, useSlides } from '../model/blocks';
import { NumberField, Section, Seg } from '../ui/controls';

const S = () => useEditor.getState();
const setNode = (id: string, fn: (n: WNode) => void, key: string) => S().mutate(pg => { const n = pg.nodes[id]; if (n) fn(n); }, { key });

export function AccordionSection({ node }: { node: WNode }) {
  const A = node.accordion!;
  const set = (patch: Partial<NonNullable<WNode['accordion']>>) => setNode(node.id, n => { n.accordion = { ...n.accordion!, ...patch }; }, 'acc');
  return (
    <Section title="Akkordeon">
      <div className="row">
        <span className="lbl">Offen</span>
        <Seg value={A.single ? 'one' : 'many'} onChange={v => set({ single: v === 'one' })} options={[
          { value: 'one', icon: <span>Nur einer</span>, title: 'Öffnet man einen Eintrag, schließt sich der vorherige' },
          { value: 'many', icon: <span>Mehrere</span>, title: 'Mehrere Einträge können gleichzeitig offen sein' },
        ]} />
      </div>
      <label className="check"><input type="checkbox" checked={A.firstOpen} onChange={e => set({ firstOpen: e.target.checked })} /> Erster Eintrag ist anfangs offen</label>
      <div className="row"><button type="button" className="btn grow" onClick={() => addPart(node.id)}>＋ Eintrag hinzufügen</button></div>
      <p className="proto-hint">Jeder Eintrag hat oben eine Kopfzeile (zum Anklicken), darunter den Inhalt zum Aufklappen. Auf der Arbeitsfläche ist alles offen, damit du es bearbeiten kannst – in der Vorschau klappt es.</p>
    </Section>
  );
}

export function TabsSection({ node }: { node: WNode }) {
  const sel = useEditor(s => slideOf(pageOf(s), node.id, s.selection[0]));
  const ui = useSlides(s => s[node.id] ?? 1);
  const page = useEditor(pageOf);
  const n = node.children.length;
  const cur = Math.min(n - 1, Math.max(1, sel >= 1 ? sel : ui));
  const bar = page.nodes[node.children[0]];
  const names = node.children.slice(1).map((c, i) => {
    const b = bar ? page.nodes[bar.children[i]] : undefined;
    return b?.name ?? page.nodes[c]?.name ?? `Reiter ${i + 1}`;
  });
  return (
    <Section title="Reiter">
      <div className="row">
        <span className="lbl">Zeigen</span>
        <select className="select grow" aria-label="Welchen Reiter auf der Arbeitsfläche zeigen" value={cur} onChange={e => { showSlide(node.id, +e.target.value); if (sel >= 0) S().setSelection([node.id]); }}>
          {names.map((nm, i) => <option key={i} value={i + 1}>{nm}</option>)}
        </select>
      </div>
      <div className="row"><button type="button" className="btn grow" onClick={() => { addPart(node.id); showSlide(node.id, n); }}>＋ Reiter hinzufügen</button></div>
      {bar && bar.children.length !== n - 1 && <p className="notice warn">Die Reiter-Leiste hat {bar.children.length} Knöpfe, es gibt aber {n - 1} Inhalte. Knopf 1 öffnet Inhalt 1 usw.</p>}
      <p className="proto-hint">Oben die Reiter-Leiste mit den Knöpfen, darunter je Reiter ein Inhalt. Der Knopf an Stelle 1 zeigt Inhalt 1 usw. Nicht gewählte Knöpfe erscheinen auf der Website blasser.</p>
    </Section>
  );
}

export function PopupSection({ node }: { node: WNode }) {
  const P = node.popup!;
  const set = (patch: Partial<NonNullable<WNode['popup']>>) => setNode(node.id, n => { n.popup = { ...n.popup!, ...patch }; }, 'popup');
  return (
    <Section title="Pop-up">
      <div className="row">
        <span className="lbl">Öffnet</span>
        <Seg value={P.open} onChange={v => set({ open: v as 'link' | 'delay' })} options={[
          { value: 'link', icon: <span>Per Link</span>, title: 'Öffnet sich, wenn man auf einen Knopf mit dem Link „Pop-up öffnen“ klickt' },
          { value: 'delay', icon: <span>Nach Zeit</span>, title: 'Öffnet sich von selbst nach einigen Sekunden' },
        ]} />
      </div>
      {P.open === 'delay' && (
        <>
          <div className="row"><span className="lbl">Nach</span>
            <NumberField title="Sekunden nach dem Öffnen der Seite" suffix="Sek." min={0} max={120} step={1} precision={0} value={P.delay} onChange={v => set({ delay: v })} /></div>
          <label className="check"><input type="checkbox" checked={P.once} onChange={e => set({ once: e.target.checked })} /> Nur einmal pro Besuch zeigen</label>
        </>
      )}
      <p className="proto-hint">Auf der Website ist das Pop-up versteckt und erscheint mittig über der Seite, der Rest wird abgedunkelt. Schließen per ×, Klick daneben oder Esc.
        {P.open === 'link' && ' Wähle einen Knopf aus und stelle unter „Link“ „Pop-up öffnen“ ein.'}</p>
    </Section>
  );
}

export function TooltipField({ nodes, ids }: { nodes: WNode[]; ids: string[] }) {
  const v = nodes.every(n => (n.tooltip ?? '') === (nodes[0].tooltip ?? '')) ? nodes[0].tooltip ?? '' : '';
  return (
    <>
      <div className="lbl-top" title="Kurzer Text, der in einer kleinen Blase erscheint, wenn man mit der Maus darüber fährt (oder mit der Tab-Taste hinspringt)">Hinweis beim Darüberfahren</div>
      <input className="textinput grow" style={{ width: '100%' }} placeholder="z. B. „Öffnet unsere Preisliste“" aria-label="Hinweis-Text" defaultValue={v} key={ids.join() + v}
        onBlur={e => S().mutate(pg => { ids.forEach(id => { const n = pg.nodes[id]; if (n) n.tooltip = e.target.value.trim() || undefined; }); }, { key: 'tooltip' })}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    </>
  );
}
