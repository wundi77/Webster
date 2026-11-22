// Öffnungszeiten: ein Board mit einer Zeile je Wochentag. Die Zeiten stehen als Daten am Board,
// die sichtbaren Zeilen werden daraus erzeugt – so passt „Jetzt geöffnet“ auf der Website immer dazu.
import type { DayHours, Page, WNode } from './types';
import { useEditor } from '../store';
import { dayText } from './hoursCore';
export { DAY_NAMES, defaultHours, dayText } from './hoursCore';

/** Öffnungszeiten-Board, zu dem eine Ebene gehört */
export function hoursOf(page: Page, id: string): WNode | undefined {
  let n: WNode | undefined = page.nodes[id];
  while (n) {
    if (n.hours) return n;
    if (n.openBadge && page.nodes[n.openBadge]?.hours) return page.nodes[n.openBadge];
    n = page.nodes[n.parentId ?? ''];
  }
  // Abschnitt ausgewählt: Öffnungszeiten darin suchen (nicht in der ganzen Seite)
  if (!page.nodes[id] || page.nodes[id].site) return undefined;
  const walk = (nid: string): WNode | undefined => {
    const k = page.nodes[nid];
    if (!k) return undefined;
    if (k.hours) return k;
    for (const c of k.children) { const f = walk(c); if (f) return f; }
    return undefined;
  };
  return walk(id);
}

/** Zeilentexte aus den Daten neu schreiben (Zeile i = Tag i, zweiter Text = Zeit) */
export function syncHours(pg: Page, board: WNode) {
  if (!board.hours) return;
  board.children.forEach((rid, i) => {
    const row = pg.nodes[rid];
    const day = board.hours!.days[i];
    if (!row || !day) return;
    const texts = row.children.map(c => pg.nodes[c]).filter(c => c?.type === 'text');
    const time = texts[1];
    if (time) { time.text = dayText(day); time.opacity = day.closed ? 0.6 : 1; }
  });
}

export function setDay(boardId: string, index: number, patch: Partial<DayHours>) {
  useEditor.getState().mutate(pg => {
    const b = pg.nodes[boardId];
    if (!b?.hours) return;
    const days = b.hours.days.map((d, i) => (i === index ? { ...d, ...patch } : d));
    if (patch.from2 === '' || patch.to2 === '') { delete days[index].from2; delete days[index].to2; }
    b.hours = { days };
    syncHours(pg, b);
  }, { key: `hours-${index}` });
}

/** Zeiten eines Tages auf alle Werktage (Mo–Fr) übertragen */
export function copyToWeekdays(boardId: string, index: number) {
  useEditor.getState().mutate(pg => {
    const b = pg.nodes[boardId];
    if (!b?.hours) return;
    const src = b.hours.days[index];
    b.hours = { days: b.hours.days.map((d, i) => (i < 5 ? { ...src } : d)) };
    syncHours(pg, b);
  }, { key: 'hours-copy' });
}

