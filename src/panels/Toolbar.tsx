import { useEffect, useRef, useState } from 'react';
import { useEditor, type Tool } from '../store';
import { Icons } from '../ui/icons';
import { IconButton } from '../ui/controls';
import { openImagePicker } from '../model/commands';
import { useDialog } from './SiteSettings';

const TOOLS: { tool: Tool; icon: keyof typeof Icons; title: string }[] = [
  { tool: 'move', icon: 'move', title: 'Verschieben (V)' },
  { tool: 'rect', icon: 'rect', title: 'Rechteck (R) – kann auch andere Elemente aufnehmen' },
  { tool: 'ellipse', icon: 'ellipse', title: 'Ellipse (E)' },
];
const AFTER: { tool: Tool; icon: keyof typeof Icons; title: string }[] = [
  { tool: 'text', icon: 'text', title: 'Text (T)' },
  { tool: 'image', icon: 'image', title: 'Bild einfügen (K)' },
  { tool: 'hand', icon: 'hand', title: 'Hand – Ansicht verschieben (H oder Leertaste halten)' },
];
export const SHAPES: { tool: Tool; icon: keyof typeof Icons; label: string; key?: string }[] = [
  { tool: 'line', icon: 'line', label: 'Linie', key: 'L' },
  { tool: 'arrow', icon: 'arrow', label: 'Pfeil', key: '⇧L' },
  { tool: 'triangle', icon: 'triangle', label: 'Dreieck' },
  { tool: 'polygon', icon: 'hexagon', label: 'Vieleck' },
  { tool: 'star', icon: 'star', label: 'Stern' },
];

function ShapeMenu() {
  const tool = useEditor(s => s.tool);
  const setTool = useEditor(s => s.setTool);
  const [last, setLast] = useState<Tool>('line');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = SHAPES.find(s => s.tool === tool) ?? SHAPES.find(s => s.tool === last)!;
  useEffect(() => { if (SHAPES.some(s => s.tool === tool)) setLast(tool); }, [tool]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', key, true); };
  }, [open]);
  const I = Icons[cur.icon];
  const active = SHAPES.some(s => s.tool === tool);
  // Steht die Leiste in der unteren Hälfte, klappt das Menü nach oben auf
  const bar = ref.current?.closest('.toolbar') as HTMLElement | null;
  const up = !!bar?.parentElement && bar.offsetTop + bar.offsetHeight / 2 > bar.parentElement.clientHeight / 2;
  return (
    <div className="tool-menu" ref={ref}>
      <IconButton icon={<I />} title="Formen: Linie, Pfeil, Dreieck, Vieleck, Stern" active={active || open}
        onClick={() => setOpen(o => !o)} />
      {open && (
        <div className={`tool-pop${up ? ' up' : ''}`} role="menu" aria-label="Formen">
          {SHAPES.map(s => {
            const SI = Icons[s.icon];
            return (
              <button key={s.tool} type="button" role="menuitem" className={tool === s.tool ? 'active' : ''}
                onClick={() => { setTool(s.tool); setOpen(false); }}>
                <SI /> {s.label}{s.key && <kbd>{s.key}</kbd>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Toolbar() {
  const tool = useEditor(s => s.tool);
  const setTool = useEditor(s => s.setTool);
  const btn = (t: typeof TOOLS[number]) => {
    const I = Icons[t.icon];
    return (
      <IconButton key={t.tool} icon={<I />} title={t.title} active={tool === t.tool}
        onClick={() => { if (t.tool === 'image') { setTool('move'); openImagePicker(); } else setTool(t.tool); }} />
    );
  };
  const { ref, pos, grip } = useDraggable();
  return (
    <div ref={ref} className={`toolbar${pos ? ' moved' : ''}`} role="toolbar" aria-label="Werkzeuge"
      style={pos ? { left: pos.x, top: pos.y } : undefined}>
      <div className="toolbar-grip" title="Ziehen, um die Werkzeugleiste zu verschieben – Doppelklick: zurück in die Mitte" {...grip}>
        <svg width="8" height="16" viewBox="0 0 8 16" aria-hidden fill="currentColor">
          {[3, 8, 13].flatMap(y => [<circle key={'a' + y} cx="2" cy={y} r="1.1" />, <circle key={'b' + y} cx="6" cy={y} r="1.1" />])}
        </svg>
      </div>
      {TOOLS.map(btn)}
      <ShapeMenu />
      <IconButton icon={<Icons.smile />} title="Icon einfügen (I)" onClick={() => { setTool('move'); useDialog.getState().show('icons'); }} />
      {AFTER.map(btn)}
    </div>
  );
}

// ---------- Werkzeugleiste mit der Maus verschieben ----------

const POS_KEY = 'webster.toolbar-pos';
type Pos = { x: number; y: number };

function loadPos(): Pos | null {
  try { const v = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null'); return v && typeof v.x === 'number' && typeof v.y === 'number' ? v : null; }
  catch { return null; }
}

/** Position innerhalb der Arbeitsfläche halten */
function clampPos(el: HTMLElement, p: Pos): Pos {
  const parent = el.parentElement;
  if (!parent) return p;
  const maxX = Math.max(0, parent.clientWidth - el.offsetWidth);
  const maxY = Math.max(0, parent.clientHeight - el.offsetHeight);
  return { x: Math.round(Math.min(Math.max(0, p.x), maxX)), y: Math.round(Math.min(Math.max(0, p.y), maxY)) };
}

function useDraggable() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(loadPos);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const save = (p: Pos | null) => {
    try { if (p) localStorage.setItem(POS_KEY, JSON.stringify(p)); else localStorage.removeItem(POS_KEY); } catch { /* ignorieren */ }
  };

  // Wird das Fenster kleiner, bleibt die Leiste sichtbar
  useEffect(() => {
    const el = ref.current, parent = el?.parentElement;
    if (!el || !parent) return;
    const ro = new ResizeObserver(() => setPos(p => (p ? clampPos(el, p) : p)));
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const grip = {
    onPointerDown: (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el || e.button !== 0) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const el = ref.current, d = drag.current;
      if (!el || !d || !el.parentElement) return;
      const pr = el.parentElement.getBoundingClientRect();
      setPos(clampPos(el, { x: e.clientX - pr.left - d.dx, y: e.clientY - pr.top - d.dy }));
    },
    onPointerUp: () => {
      if (!drag.current) return;
      drag.current = null;
      setPos(p => { save(p); return p; });
    },
    onDoubleClick: () => { setPos(null); save(null); },
  };
  return { ref, pos, grip };
}
