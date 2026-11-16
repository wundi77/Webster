import { useEditor, viewPage as pageOf } from '../store';
import type { Rect } from './types';
import { absRect, bbox } from './geometry';

const S = () => useEditor.getState();
const clampZoom = (z: number) => Math.min(64, Math.max(0.02, z));

export function zoomAt(factor: number, sx: number, sy: number) {
  const s = S();
  const z = clampZoom(s.zoom * factor);
  const k = z / s.zoom;
  s.setView(z, { x: sx - (sx - s.pan.x) * k, y: sy - (sy - s.pan.y) * k });
}

export const zoomBy = (factor: number) => {
  const { viewport: v } = S();
  zoomAt(factor, v.w / 2, v.h / 2);
};

export const setZoom100 = () => zoomBy(1 / S().zoom);

export function fitRect(r: Rect | null, padding = 60) {
  const s = S();
  const { w } = s.viewport;
  // Animations-Leiste unten: Fläche darüber nutzen (eigene Zeitleiste ist höher)
  const bar = document.querySelector<HTMLElement>('.anim-bar');
  const reserve = bar ? bar.offsetHeight + 12 : 0;
  const h = s.viewport.h - reserve;
  if (!w || h <= 0) return;
  if (!r || r.w <= 0 || r.h <= 0) { s.setView(1, { x: 80, y: 80 }); return; }
  const z = clampZoom(Math.min((w - padding * 2) / r.w, (h - padding * 2) / r.h));
  s.setView(z, { x: w / 2 - (r.x + r.w / 2) * z, y: h / 2 - (r.y + r.h / 2) * z });
}

export function fitAll() {
  const page = pageOf(S());
  fitRect(bbox(page.rootIds.filter(id => page.nodes[id]?.visible).map(id => absRect(page, id))));
}

export function fitSelection() {
  const s = S();
  const page = pageOf(s);
  if (!s.selection.length) { fitAll(); return; }
  fitRect(bbox(s.selection.filter(id => page.nodes[id]).map(id => absRect(page, id))));
}

export function viewportCenterWorld() {
  const s = S();
  return { x: (s.viewport.w / 2 - s.pan.x) / s.zoom, y: (s.viewport.h / 2 - s.pan.y) / s.zoom };
}
