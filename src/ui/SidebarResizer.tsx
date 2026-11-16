// Griff am Rand einer Seitenleiste: mit der Maus breiter/schmaler ziehen, Doppelklick = Standardbreite.
import { useEffect, useState } from 'react';

const DEFAULTS = { left: 256, right: 276 } as const;
const MIN = 200, MAX = 560;
type Side = keyof typeof DEFAULTS;

const key = (side: Side) => `webster-sidebar-${side}`;
const load = (side: Side): number => {
  try { const v = Number(localStorage.getItem(key(side))); if (v >= MIN && v <= MAX) return v; } catch { /* kein Speicher */ }
  return DEFAULTS[side];
};
const save = (side: Side, w: number) => { try { localStorage.setItem(key(side), String(w)); } catch { /* kein Speicher */ } };

/** Breite der Seitenleiste (in px), gemerkt für das nächste Öffnen */
export function useSidebarWidth(side: Side) {
  const [w, setW] = useState(() => load(side));
  useEffect(() => save(side, w), [side, w]);
  return [w, setW] as const;
}

export function SidebarResizer({ side, width, onChange }: { side: Side; width: number; onChange: (w: number) => void }) {
  const [drag, setDrag] = useState(false);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX, startW = width;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(true);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      onChange(Math.round(Math.min(MAX, Math.max(MIN, startW + (side === 'left' ? dx : -dx)))));
    };
    const up = () => { setDrag(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className={`sidebar-resizer ${side}${drag ? ' active' : ''}`} role="separator" aria-orientation="vertical"
      aria-label={side === 'left' ? 'Breite der linken Leiste' : 'Breite der rechten Leiste'} aria-valuenow={width} aria-valuemin={MIN} aria-valuemax={MAX}
      tabIndex={0} title="Ziehen, um die Breite zu ändern · Doppelklick: Standardbreite"
      onPointerDown={onPointerDown} onDoubleClick={() => onChange(DEFAULTS[side])}
      onKeyDown={e => {
        const step = e.shiftKey ? 40 : 10;
        const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft', shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
        if (e.key === grow) { e.preventDefault(); onChange(Math.min(MAX, width + step)); }
        if (e.key === shrink) { e.preventDefault(); onChange(Math.max(MIN, width - step)); }
      }} />
  );
}
