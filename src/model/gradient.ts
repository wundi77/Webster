// Farbverläufe und Farbumrechnung (rein, ohne Store – für Editor und Export)
import type { Fill, Gradient, GradientStop, GradientType } from './types';

// ---------- Farbumrechnung ----------

export interface RGB { r: number; g: number; b: number }
export interface HSV { h: number; s: number; v: number }

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  h = h.slice(0, 6).padEnd(6, '0');
  return { r: parseInt(h.slice(0, 2), 16) || 0, g: parseInt(h.slice(2, 4), 16) || 0, b: parseInt(h.slice(4, 6), 16) || 0 };
}
const hx = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
export const rgbToHex = ({ r, g, b }: RGB) => `#${hx(r)}${hx(g)}${hx(b)}`.toUpperCase();

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
export function hsvToRgb({ h, s, v }: HSV): RGB {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return { r: f(5) * 255, g: f(3) * 255, b: f(1) * 255 };
}
export function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const { h } = rgbToHsv({ r, g, b });
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}
export function hslToRgb(h: number, s: number, l: number): RGB {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

/** Farbe aus Text lesen: #hex, rgb(…), rgba(…), hsl(…), hsla(…) */
export function parseColor(text: string): { color: string; opacity?: number } | null {
  const t = text.trim().toLowerCase();
  const hex = t.replace(/^#/, '');
  if (/^[0-9a-f]{3}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/.test(hex)) {
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    return { color: '#' + full.slice(0, 6).toUpperCase(), ...(full.length === 8 ? { opacity: parseInt(full.slice(6), 16) / 255 } : {}) };
  }
  const m = t.match(/^(rgba?|hsla?)\(([^)]+)\)$/);
  if (!m) return null;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean).map(p => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p)));
  if (parts.length < 3 || parts.slice(0, 3).some(isNaN)) return null;
  const alpha = parts[3] !== undefined && !isNaN(parts[3]) ? Math.max(0, Math.min(1, parts[3])) : undefined;
  const rgb = m[1].startsWith('rgb')
    ? { r: parts[0], g: parts[1], b: parts[2] }
    : hslToRgb(parts[0], parts[1] > 1 ? parts[1] / 100 : parts[1], parts[2] > 1 ? parts[2] / 100 : parts[2]);
  return { color: rgbToHex(rgb), ...(alpha !== undefined ? { opacity: alpha } : {}) };
}

const r1 = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function rgbaStr(hex: string, a: number) {
  const { r, g, b } = hexToRgb(hex);
  return a >= 1 ? rgbToHex({ r, g, b }) : `rgba(${r}, ${g}, ${b}, ${r1(a, 3)})`;
}

// ---------- Verläufe ----------

export const GRADIENT_LABEL: Record<GradientType, string> = { linear: 'Linear', radial: 'Kreisförmig', conic: 'Kegelförmig' };

let n = 0;
export const stopId = () => `s${Date.now().toString(36)}${(n++).toString(36)}`;

export function defaultGradient(color = '#6A55F5', type: GradientType = 'linear'): Gradient {
  return { type, angle: type === 'conic' ? 0 : 180, stops: [{ id: stopId(), color, opacity: 1, pos: 0 }, { id: stopId(), color: '#FFFFFF', opacity: 1, pos: 1 }] };
}

export const sortedStops = (g: Gradient) => [...g.stops].sort((a, b) => a.pos - b.pos);

/** Farbe an einer Stelle des Verlaufs (für neue Farbpunkte) */
export function colorAt(g: Gradient, pos: number): { color: string; opacity: number } {
  const s = sortedStops(g);
  if (pos <= s[0].pos) return { color: s[0].color, opacity: s[0].opacity };
  for (let i = 1; i < s.length; i++) {
    if (pos <= s[i].pos) {
      const a = s[i - 1], b = s[i], t = (pos - a.pos) / Math.max(1e-6, b.pos - a.pos);
      const A = hexToRgb(a.color), B = hexToRgb(b.color);
      return { color: rgbToHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t }), opacity: r1(a.opacity + (b.opacity - a.opacity) * t) };
    }
  }
  const l = s[s.length - 1];
  return { color: l.color, opacity: l.opacity };
}

/** CSS-Verlauf; opacity = Deckkraft der ganzen Füllung */
export function gradientCss(g: Gradient, opacity = 1): string {
  const stops = sortedStops(g).map(s => `${rgbaStr(s.color, s.opacity * opacity)} ${r1(s.pos * 100)}%`).join(', ');
  if (g.type === 'radial') return `radial-gradient(closest-side, ${stops})`;
  if (g.type === 'conic') return `conic-gradient(from ${r1(g.angle)}deg, ${stops})`;
  return `linear-gradient(${r1(g.angle)}deg, ${stops})`;
}

/** Kurzer Name, z. B. „Linear 90°“ */
const SHORT: Record<GradientType, string> = { linear: 'Linear', radial: 'Kreis', conic: 'Kegel' };
export const gradientLabel = (g: Gradient) => `${SHORT[g.type]}${g.type !== 'radial' ? ` ${Math.round(g.angle)}°` : ''}`;

/** Kennung für einen SVG-Verlauf einer Ebene (gleicher Verlauf → gleiche Kennung, in Editor und Export) */
export function svgGradientId(nodeId: string, g: Gradient, opacity: number): string {
  const s = JSON.stringify([g.type, r1(g.angle), sortedStops(g).map(x => [x.color, x.opacity, x.pos]), opacity]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `wg-${nodeId}-${(h >>> 0).toString(36)}`;
}

/** SVG-<linearGradient>/<radialGradient> (kegelförmig gibt es in SVG nicht → linear) */
export function svgGradientDef(id: string, g: Gradient, opacity: number): string {
  const stops = sortedStops(g).map(s => {
    const { r, g: gg, b } = hexToRgb(s.color);
    return `<stop offset="${r1(s.pos * 100)}%" stop-color="${rgbToHex({ r, g: gg, b })}"${s.opacity * opacity < 1 ? ` stop-opacity="${r1(s.opacity * opacity, 3)}"` : ''}/>`;
  }).join('');
  if (g.type === 'radial') return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="50%" cy="50%" r="50%">${stops}</radialGradient>`;
  const a = (g.angle * Math.PI) / 180, sx = Math.sin(a) / 2, sy = Math.cos(a) / 2;
  const p = (v: number) => `${r1((0.5 + v) * 100)}%`;
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${p(-sx)}" y1="${p(sy)}" x2="${p(sx)}" y2="${p(-sy)}">${stops}</linearGradient>`;
}

/** Hat die (oberste sichtbare) Füllung einen Verlauf? */
export const fillGradient = (f: Fill | undefined): Gradient | null => (f?.visible && f.gradient?.stops?.length ? f.gradient : null);

export function setStops(g: Gradient, stops: GradientStop[]): Gradient { return { ...g, stops }; }
