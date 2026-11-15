// Rote Abstandslinien mit Pixelzahl (beim Verschieben, Größe ändern, ⌥ + Darüberfahren, Pfeiltasten)
import type { Page, Pt } from '../model/types';
import { useEditor } from '../store';
import { absRect, bbox } from '../model/geometry';
import { measureBetween, measureContext, measureGaps, useAltKey, useMeasureFlash, type Measure } from './measure';

const fmt = (v: number) => String(Math.round(v)); // ganze Pixel

export function MeasureLayer({ page, zoom, pan, live }: { page: Page; zoom: number; pan: Pt; live: Measure[] }) {
  const selection = useEditor(s => s.selection);
  const hover = useEditor(s => s.hoverId);
  const editing = useEditor(s => s.editingTextId);
  useEditor(s => s.geom); // nach dem Neumessen neu zeichnen
  const alt = useAltKey(s => s.alt);
  const flash = useMeasureFlash(s => s.until);

  let list = live;
  const sel = selection.filter(id => page.nodes[id]);
  if (!list.length && sel.length && !editing) {
    const box = bbox(sel.map(id => absRect(page, id)));
    if (box && alt) {
      // ⌥: Abstand zur Ebene unter der Maus, sonst zum umgebenden Board
      const target = hover && !sel.includes(hover) && page.nodes[hover] ? hover : page.nodes[sel[0]].parentId;
      if (target) list = measureBetween(box, absRect(page, target));
    } else if (box && flash > Date.now()) {
      const ctx = measureContext(page, sel);
      list = measureGaps(box, ctx.others, ctx.container);
    }
  }
  if (!list.length) return null;

  const X = (v: number) => v * zoom + pan.x;
  const Y = (v: number) => v * zoom + pan.y;
  return (
    <div className="measure-layer">
      {list.map((m, i) => {
        const len = m.b - m.a;
        const horiz = m.axis === 'x';
        const style = horiz
          ? { left: X(m.a), top: Y(m.at), width: len * zoom }
          : { left: X(m.at), top: Y(m.a), height: len * zoom };
        return (
          <div key={i} className={`measure ${horiz ? 'mx' : 'my'}${m.eq ? ' eq' : ''}`} style={style}>
            <span className="measure-label">{fmt(len)}</span>
          </div>
        );
      })}
    </div>
  );
}
