// Bilder bearbeiten: zuschneiden, drehen, spiegeln, Helligkeit/Kontrast/Farbe – und beim Hinzufügen
// automatisch verkleinern, damit die Website schnell lädt. Gerechnet wird im Browser (Canvas).
import { useEditor } from '../store';
import { allPages } from './pageRules';

/** Längste Seite neuer Bilder in px */
export const MAX_SIDE = 2400;
/** Ab dieser Dateigröße wird neu komprimiert, auch wenn das Bild klein genug ist */
const MAX_BYTES = 900 * 1024;

export const mimeOf = (src: string) => src.slice(5, src.search(/[;,]/));
export const dataUrlBytes = (src: string) => Math.round((src.length - src.indexOf(',') - 1) * 0.75);
/** Animierte GIFs und Vektorgrafiken nie umrechnen */
const untouchable = (mime: string) => mime === 'image/gif' || mime === 'image/svg+xml';

export function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Bild konnte nicht gelesen werden'));
    img.src = src;
  });
}

/** Hat das Bild durchsichtige Stellen? (Stichprobe auf verkleinerter Kopie) */
function hasAlpha(c: HTMLCanvasElement): boolean {
  const s = Math.min(1, 256 / Math.max(c.width, c.height));
  const t = document.createElement('canvas');
  t.width = Math.max(1, Math.round(c.width * s)); t.height = Math.max(1, Math.round(c.height * s));
  const x = t.getContext('2d')!;
  x.drawImage(c, 0, 0, t.width, t.height);
  const d = x.getImageData(0, 0, t.width, t.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}

/** Fertige Leinwand speichern: durchsichtig → WebP (bzw. PNG), sonst JPEG */
function encode(c: HTMLCanvasElement, alphaPossible: boolean): string {
  if (alphaPossible && hasAlpha(c)) {
    const webp = c.toDataURL('image/webp', 0.9);
    return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
  }
  return c.toDataURL('image/jpeg', 0.86);
}

/** Beim Hinzufügen: zu große Bilder verkleinern (Original bleibt, wenn es schon klein genug ist) */
export async function shrinkImage(src: string, w: number, h: number): Promise<{ src: string; w: number; h: number }> {
  const mime = mimeOf(src);
  if (untouchable(mime) || !src.startsWith('data:image/')) return { src, w, h };
  const big = Math.max(w, h) > MAX_SIDE;
  if (!big && dataUrlBytes(src) <= MAX_BYTES) return { src, w, h };
  try {
    const img = await loadImg(src);
    const s = Math.min(1, MAX_SIDE / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * s); c.height = Math.round(h * s);
    const x = c.getContext('2d')!;
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, c.width, c.height);
    const out = encode(c, mime !== 'image/jpeg');
    // nur übernehmen, wenn es wirklich kleiner wird (oder die Maße zu groß waren)
    if (!big && dataUrlBytes(out) >= dataUrlBytes(src)) return { src, w, h };
    return { src: out, w: c.width, h: c.height };
  } catch { return { src, w, h }; }
}

export interface ImageEdit {
  /** Ausschnitt in Anteilen (0–1) des gedrehten Bildes */
  crop: { x: number; y: number; w: number; h: number };
  /** Drehung in 90°-Schritten im Uhrzeigersinn */
  rotate: 0 | 90 | 180 | 270;
  flip: boolean;
  /** 1 = unverändert */
  brightness: number; contrast: number; saturation: number;
}
export const noEdit = (): ImageEdit => ({ crop: { x: 0, y: 0, w: 1, h: 1 }, rotate: 0, flip: false, brightness: 1, contrast: 1, saturation: 1 });

/** Gedrehtes/gespiegeltes Bild als Leinwand */
export function orient(img: HTMLImageElement, rotate: ImageEdit['rotate'], flip: boolean): HTMLCanvasElement {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const side = rotate === 90 || rotate === 270;
  const c = document.createElement('canvas');
  c.width = side ? ih : iw; c.height = side ? iw : ih;
  const x = c.getContext('2d')!;
  x.translate(c.width / 2, c.height / 2);
  x.rotate((rotate * Math.PI) / 180);
  if (flip) x.scale(-1, 1);
  x.drawImage(img, -iw / 2, -ih / 2);
  return c;
}

/** Helligkeit, Kontrast, Sättigung – rechnet genau wie CSS-Filter (in dieser Reihenfolge), damit Vorschau und Ergebnis gleich aussehen */
function adjust(c: HTMLCanvasElement, e: ImageEdit) {
  if (e.brightness === 1 && e.contrast === 1 && e.saturation === 1) return;
  const x = c.getContext('2d')!;
  const im = x.getImageData(0, 0, c.width, c.height);
  const d = im.data, b = e.brightness, k = e.contrast, s = e.saturation;
  const m = [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s];
  const cl = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let i = 0; i < d.length; i += 4) {
    let r = cl(d[i] * b), g = cl(d[i + 1] * b), bl = cl(d[i + 2] * b);
    r = cl((r - 127.5) * k + 127.5); g = cl((g - 127.5) * k + 127.5); bl = cl((bl - 127.5) * k + 127.5);
    d[i] = cl(m[0] * r + m[1] * g + m[2] * bl);
    d[i + 1] = cl(m[3] * r + m[4] * g + m[5] * bl);
    d[i + 2] = cl(m[6] * r + m[7] * g + m[8] * bl);
  }
  x.putImageData(im, 0, 0);
}

/** Bearbeitung anwenden → neues Bild */
export async function renderEdit(src: string, e: ImageEdit): Promise<{ src: string; w: number; h: number }> {
  const img = await loadImg(src);
  const o = orient(img, e.rotate, e.flip);
  const sx = Math.round(e.crop.x * o.width), sy = Math.round(e.crop.y * o.height);
  const sw = Math.max(1, Math.round(e.crop.w * o.width)), sh = Math.max(1, Math.round(e.crop.h * o.height));
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  c.getContext('2d')!.drawImage(o, sx, sy, sw, sh, 0, 0, sw, sh);
  adjust(c, e);
  return { src: encode(c, mimeOf(src) !== 'image/jpeg'), w: sw, h: sh };
}

/**
 * Bearbeitetes Bild übernehmen: das Bild in der Bibliothek wird ersetzt (überall, wo es vorkommt).
 * rev zählt hoch – so bekommt die Datei im Projektordner einen neuen Namen und wird beim Speichern neu geschrieben.
 * Ebenen mit fester Höhe bekommen das neue Seitenverhältnis. Rückgängig (⌘Z) stellt das alte Bild wieder her.
 */
export function applyImageEdit(imageId: string, out: { src: string; w: number; h: number }) {
  useEditor.getState().mutate((_, d) => {
    const a = d.library.images.find(i => i.id === imageId);
    if (!a) return;
    const oldRatio = a.h / a.w, ratio = out.h / out.w;
    a.src = out.src; a.w = out.w; a.h = out.h; a.rev = (a.rev ?? 0) + 1;
    if (Math.abs(oldRatio - ratio) < 0.01) return;
    for (const p of allPages(d)) for (const id in p.nodes) {
      const n = p.nodes[id];
      if (n.imageRef !== imageId || n.sizingV !== 'fixed') continue;
      n.h = Math.round(n.w * ratio);
      for (const bp of ['tablet', 'mobile'] as const) {
        const o = n.overrides?.[bp];
        if (o && o.w !== undefined) o.h = Math.round(o.w * ratio);
      }
    }
  }, { key: 'image-edit' });
}
