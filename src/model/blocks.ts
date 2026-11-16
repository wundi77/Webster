// Bewegte Bausteine: Karussell, Vorher-Nachher, Laufband, Zahl zum Hochzählen, fertige Animation
import type { AnimationAsset, Page, WNode } from './types';
import { createNode, defaultTextStyle, makeFill, makeLayout, uid } from './factory';
import { placeNew } from './embed';
import { useEditor } from '../store';
import { create } from 'zustand';

const S = () => useEditor.getState();

/** Welche Folie eines Karussells die Arbeitsfläche zeigt (nur Ansicht, nicht im Dokument) */
export const useSlides = create<Record<string, number>>(() => ({}));
export const showSlide = (id: string, i: number) => useSlides.setState({ [id]: i });

/** Index der Folie, in der die Ebene liegt (oder -1) */
export function slideOf(page: Page, carouselId: string, id: string | undefined): number {
  const car = page.nodes[carouselId];
  for (let n = id ? page.nodes[id] : undefined; n && n.parentId; n = page.nodes[n.parentId]) {
    if (n.parentId === carouselId) return car.children.indexOf(n.id);
  }
  return -1;
}

const text = (t: string, size: number, weight: number, color: string, extra: Partial<WNode> = {}) =>
  createNode('text', { name: t, text: t, textStyle: { ...defaultTextStyle(), fontSize: size, fontWeight: weight, lineHeight: 1.2 }, fills: [makeFill(color)], ...extra });

function place(build: (pg: Page) => WNode) {
  const s = S();
  let id: string | null = null;
  s.mutate(pg => {
    const n = build(pg);
    if (placeNew(pg, n, s.selection)) id = n.id;
  }, { key: 'block-add' });
  if (id) s.setSelection([id]);
  return id;
}

const COLORS = ['#F5C4B3', '#CECBF6', '#9FE1CB', '#FAC775'];

export function insertCarousel() {
  return place(pg => {
    const car = createNode('board', {
      name: 'Karussell', w: 960, h: 440, radius: 16, fills: [makeFill('#F1EFE8')],
      layout: { ...makeLayout('flex', 'row'), gap: 0, padding: [0, 0, 0, 0], align: 'stretch' },
      carousel: { auto: null, arrows: true, dots: true },
    });
    pg.nodes[car.id] = car;
    for (let i = 0; i < 3; i++) {
      const slide = createNode('board', {
        name: `Folie ${i + 1}`, parentId: car.id, w: 960, h: 440, sizingH: 'fill', sizingV: 'fill', fills: [makeFill(COLORS[i])],
        layout: { ...makeLayout('flex', 'column'), padding: [48, 64, 48, 64], gap: 12, justify: 'center', align: 'center' },
      });
      const t = text(`Folie ${i + 1}`, 40, 700, '#2C2C2A', { parentId: slide.id });
      const sub = text('Ersetze mich durch ein Bild, einen Text oder beides.', 18, 400, '#444441', { parentId: slide.id });
      pg.nodes[slide.id] = slide; pg.nodes[t.id] = t; pg.nodes[sub.id] = sub;
      slide.children = [t.id, sub.id];
      car.children.push(slide.id);
    }
    return car;
  });
}

export function insertCompare() {
  return place(pg => {
    const box = createNode('board', {
      name: 'Vorher-Nachher', w: 960, h: 540, radius: 16, fills: [makeFill('#D3D1C7')],
      layout: { ...makeLayout('grid'), gap: 0, rowGap: 0, padding: [0, 0, 0, 0], columns: [{ unit: 'fr', value: 1 }], rows: [{ unit: 'fr', value: 1 }], align: 'stretch', justifyItems: 'stretch' },
      compare: { pos: 50 },
    });
    pg.nodes[box.id] = box;
    const mk = (name: string, color: string, after: boolean) => {
      const img = createNode('image', { name, parentId: box.id, w: 960, h: 540, sizingH: 'fill', sizingV: 'fill', fills: [makeFill(color)], grid: { col: 1, row: 1, colSpan: 1, rowSpan: 1 }, compareAfter: after || undefined });
      pg.nodes[img.id] = img;
      box.children.push(img.id);
    };
    mk('Vorher', '#B4B2A9', false);
    mk('Nachher', '#5DCAA5', true);
    return box;
  });
}

export function insertMarquee() {
  return place(pg => {
    const band = createNode('board', {
      name: 'Laufband', w: 1200, h: 80, fills: [makeFill('#2C2C2A')], sizingV: 'auto',
      layout: { ...makeLayout('flex', 'row'), gap: 48, padding: [20, 0, 20, 0], align: 'center' },
      motion: { loop: { kind: 'marquee', speed: 20, amount: 0 } },
    });
    pg.nodes[band.id] = band;
    for (const w of ['Frisch', '★', 'Hausgemacht', '★', 'Regional', '★', 'Mit Liebe', '★']) {
      const t = text(w, 28, 700, '#F1EFE8', { parentId: band.id });
      pg.nodes[t.id] = t;
      band.children.push(t.id);
    }
    return band;
  });
}

export function insertCounter() {
  return place(pg => {
    const box = createNode('board', {
      name: 'Zahl', w: 320, h: 140, fills: [], sizingV: 'auto',
      layout: { ...makeLayout('flex', 'column'), gap: 4, padding: [16, 16, 16, 16], align: 'start' },
    });
    const big = text('1.200', 64, 800, '#2C2C2A', { parentId: box.id, reveal: { type: 'count', duration: 1500, delay: 0 } });
    const sub = text('zufriedene Gäste', 18, 400, '#5F5E5A', { parentId: box.id });
    pg.nodes[box.id] = box; pg.nodes[big.id] = big; pg.nodes[sub.id] = sub;
    box.children = [big.id, sub.id];
    return box;
  });
}

// ---------- Fertige Animationen (Lottie) ----------

export const MAX_ANIM_MB = 3;

/** Lottie-Datei prüfen und in die Bibliothek legen */
export async function addAnimationFile(file: File): Promise<{ id?: string; error?: string }> {
  if (file.size > MAX_ANIM_MB * 1024 * 1024) return { error: `Die Datei ist zu groß (höchstens ${MAX_ANIM_MB} MB).` };
  if (/\.lottie$/i.test(file.name)) return { error: 'Bitte die Animation als „Lottie JSON“ herunterladen (Datei endet auf .json), nicht als .lottie.' };
  let data: { w?: number; h?: number; layers?: unknown; v?: string };
  const raw = await file.text();
  try { data = JSON.parse(raw); } catch { return { error: 'Das ist keine gültige Animationsdatei (Lottie JSON).' }; }
  if (!data || !Array.isArray(data.layers) || !data.w || !data.h) return { error: 'Das ist keine Lottie-Animation.' };
  const asset: AnimationAsset = { id: uid(), name: file.name.replace(/\.json$/i, ''), data: JSON.stringify(data), w: data.w, h: data.h, size: raw.length };
  S().mutate((_, d) => { d.library.animations = [...(d.library.animations ?? []), asset]; }, { key: 'anim-add' });
  return { id: asset.id };
}

export function insertAnimation(assetId: string) {
  const a = S().doc.library.animations?.find(x => x.id === assetId);
  if (!a) return null;
  const w = Math.min(400, a.w), h = Math.round(w * a.h / a.w);
  return place(() => createNode('rect', { name: a.name || 'Animation', w, h, fills: [], lottie: { ref: assetId, loop: true, play: 'view' } }));
}
