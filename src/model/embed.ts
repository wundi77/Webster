// Videos & Karten: YouTube, Vimeo, Google Maps, OpenStreetMap (erst nach Zustimmung geladen)
// und eigene Videodateien (werden mit der Website ausgeliefert).
import type { Embed, EmbedKind, Page, VideoAsset, WDocument, WNode } from './types';
import { createNode, makeFill, uid } from './factory';
import { siteRoot } from '../export/html';
import { appendChild } from './commands';
import { findLegalPage } from './legal';
import { useEditor, viewPage } from '../store';

export { EMBED_INFO, MAX_VIDEO_MB, defaultEmbed, youtubeId, vimeoId, embedSrc, embedOpenUrl } from './embedCore';
import { EMBED_INFO, defaultEmbed, embedSrc, MAX_VIDEO_MB } from './embedCore';

/** Ist die Einbettung vollständig eingerichtet? */
export function embedReady(doc: WDocument, e: Embed): boolean {
  if (e.kind === 'video') return !!e.videoRef && doc.library.videos.some(v => v.id === e.videoRef);
  return !!embedSrc(e, false);
}

/** Neue Ebene ins ausgewählte Board oder unten auf die Seite setzen */
export function placeNew(pg: Page, n: WNode, selection: string[]) {
  const sel = selection.length === 1 ? pg.nodes[selection[0]] : undefined;
  const target = sel?.type === 'board' && !sel.embed && !sel.nav ? sel : pg.nodes[siteRoot(pg)?.id ?? ''];
  if (!target) return false;
  pg.nodes[n.id] = n;
  n.parentId = target.id;
  if (target.layout) {
    appendChild(pg, target.id, n.id);
    n.sizingH = 'fill';
    n.maxW = n.w;
    return true;
  }
  if (target.site) {
    const bottom = Math.max(0, ...target.children.map(c => pg.nodes[c]).filter(c => c && !c.nav && c.name !== 'Fußzeile').map(c => c.y + c.h));
    const foot = target.children.map(c => pg.nodes[c]).find(c => c?.name === 'Fußzeile');
    n.x = 120; n.y = bottom + 80;
    n.overrides = { tablet: { x: 40, w: Math.min(n.w, 688), h: Math.round(Math.min(n.w, 688) * n.h / n.w) }, mobile: { x: 20, w: 350, h: Math.round(350 * n.h / n.w) } };
    const grow = n.h + 80;
    if (foot) { foot.y += grow; for (const bp of ['tablet', 'mobile'] as const) if (foot.overrides?.[bp]?.y !== undefined) (foot.overrides[bp] as { y: number }).y += grow; }
    target.h += grow;
    for (const bp of ['tablet', 'mobile'] as const) if (target.overrides?.[bp]?.h !== undefined) target.overrides[bp]!.h = (target.overrides[bp]!.h as number) + grow;
    const fi = foot ? target.children.indexOf(foot.id) : -1;
    if (fi >= 0) target.children.splice(fi, 0, n.id); else target.children.push(n.id);
  } else {
    n.x = Math.max(0, Math.round((target.w - n.w) / 2));
    n.y = Math.max(0, Math.round((target.h - n.h) / 2));
    target.children.push(n.id);
  }
  return true;
}

/** Video oder Karte einfügen */
export function insertEmbed(kind: EmbedKind, videoRef: string | null = null): string | null {
  const s = useEditor.getState();
  const info = EMBED_INFO[kind];
  let w = info.w, h = info.h;
  if (videoRef) {
    const v = s.doc.library.videos.find(x => x.id === videoRef);
    if (v && v.w && v.h) h = Math.round(w * v.h / v.w);
  }
  const node = createNode('rect', {
    name: info.label, w, h, fills: [makeFill(kind === 'osm' || kind === 'gmaps' ? '#E5E3DF' : '#1A1A1A')], radius: 8,
    embed: { ...defaultEmbed(kind), videoRef },
  });
  let ok = false;
  s.mutate(pg => { ok = placeNew(pg, node, s.selection); });
  if (!ok) return null;
  s.setSelection([node.id]);
  return node.id;
}

export function setEmbed(id: string, patch: Partial<Embed>, key = 'embed') {
  useEditor.getState().mutate(pg => {
    const n = pg.nodes[id];
    if (n?.embed) n.embed = { ...n.embed, ...patch };
  }, { key });
}

/** Videodatei lesen (mit Größe in Pixeln) */
export function readVideo(file: File): Promise<{ src: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const src = String(reader.result);
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => resolve({ src, w: v.videoWidth || 1280, h: v.videoHeight || 720 });
      v.onerror = () => resolve({ src, w: 1280, h: 720 });
      v.src = src;
    };
    reader.readAsDataURL(file);
  });
}

/** Videodatei in die Bibliothek aufnehmen; gibt die ID zurück (oder eine Fehlermeldung) */
export async function addVideoFile(file: File): Promise<{ id?: string; error?: string }> {
  if (!/^video\/(mp4|webm|quicktime)$/.test(file.type)) return { error: 'Bitte ein Video im Format MP4 oder WebM wählen (MOV vom iPhone geht meist auch).' };
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
    return { error: `Das Video ist ${Math.round(file.size / 1024 / 1024)} MB groß. Erlaubt sind bis ${MAX_VIDEO_MB} MB – größere Videos besser bei YouTube oder Vimeo hochladen und hier einbetten.` };
  }
  const { src, w, h } = await readVideo(file);
  const asset: VideoAsset = { id: uid(), name: file.name.replace(/\.[^.]+$/, '') || 'Video', src, w, h, size: file.size, type: file.type === 'video/quicktime' ? 'video/mp4' : file.type };
  useEditor.getState().mutate((_, d) => { d.library.videos.push(asset); }, { system: true });
  return { id: asset.id };
}

/** Adresse auf der Karte finden (OpenStreetMap-Suche „Nominatim“) */
export async function geocode(address: string): Promise<{ lat: number; lon: number; label: string } | null> {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`, {
    headers: { 'Accept-Language': 'de' },
  });
  if (!r.ok) throw new Error(String(r.status));
  const j = await r.json() as { lat: string; lon: string; display_name: string }[];
  return j[0] ? { lat: +j[0].lat, lon: +j[0].lon, label: j[0].display_name } : null;
}

/** Koordinaten aus einem openstreetmap.org-Link (#map=zoom/lat/lon oder mlat/mlon) */
export function parseOsmLink(url: string): { lat: number; lon: number; zoom?: number } | null {
  const m = url.match(/#map=(\d+)\/(-?[\d.]+)\/(-?[\d.]+)/);
  if (m) return { zoom: +m[1], lat: +m[2], lon: +m[3] };
  const a = url.match(/mlat=(-?[\d.]+)/), b = url.match(/mlon=(-?[\d.]+)/);
  if (a && b) return { lat: +a[1], lon: +b[1] };
  const c = url.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  return c ? { lat: +c[1], lon: +c[2] } : null;
}

/** Welche fremden Dienste werden eingebettet? */
export function usedServices(doc: WDocument): EmbedKind[] {
  const set = new Set<EmbedKind>();
  for (const p of doc.pages) if (siteRoot(p)) for (const id in p.nodes) { const e = p.nodes[id].embed; if (e && e.kind !== 'video') set.add(e.kind); }
  return [...set];
}

/** Dienste, die in der Datenschutzerklärung noch nicht erwähnt sind */
export function servicesMissingInPolicy(doc: WDocument): EmbedKind[] {
  const page = findLegalPage(doc, 'datenschutz');
  if (!page) return [];
  const txt = Object.values(page.nodes).map(n => n.text ?? '').join(' ');
  return usedServices(doc).filter(k => !txt.includes(EMBED_INFO[k].service!));
}

/** Abschnitte für eingebettete Dienste an die Datenschutzerklärung anhängen */
export function addPolicySections(kinds: EmbedKind[]) {
  const s = useEditor.getState();
  const page = findLegalPage(s.doc, 'datenschutz');
  if (!page || !kinds.length) return;
  s.mutate((_, d) => {
    const pg = d.pages.find(p => p.id === page.id)!;
    const content = Object.values(pg.nodes).find(n => n.name === 'Inhalt' && n.type === 'board') ?? pg.nodes[siteRoot(pg)?.id ?? ''];
    if (!content) return;
    const tpl = Object.values(pg.nodes).find(n => n.type === 'text' && n.textStyle?.fontWeight === 700 && n.name === 'Zwischenüberschrift');
    const body = Object.values(pg.nodes).find(n => n.type === 'text' && n.name === 'Text');
    const font = tpl?.textStyle?.fontFamily ?? 'Inter';
    for (const k of kinds) {
      const info = EMBED_INFO[k];
      const isMap = k === 'gmaps' || k === 'osm';
      const sec = createNode('board', {
        name: info.service!, sizingH: 'fill', sizingV: 'auto', fills: [], clip: false, parentId: content.id,
        layout: { type: 'flex', direction: 'column', wrap: false, gap: 6, rowGap: 6, padding: [0, 0, 0, 0], justify: 'start', align: 'start', justifyItems: 'stretch', columns: [], rows: [] },
      });
      const h = createNode('text', { ...(tpl ? { textStyle: { ...tpl.textStyle! }, fills: tpl.fills.map(f => ({ ...f, id: uid() })) } : {}), name: 'Zwischenüberschrift', text: `Eingebettete Inhalte: ${info.service}`, sizingH: 'fill', sizingV: 'auto', parentId: sec.id });
      if (!tpl) h.textStyle = { ...h.textStyle!, fontFamily: font, fontSize: 20, fontWeight: 700 };
      const t = createNode('text', {
        ...(body ? { textStyle: { ...body.textStyle! }, fills: body.fills.map(f => ({ ...f, id: uid() })) } : {}),
        name: 'Text', sizingH: 'fill', sizingV: 'auto', parentId: sec.id,
        text: `Auf dieser Website ${isMap ? 'sind Karten' : 'sind Videos'} von ${info.service} (${info.provider}) eingebunden. Sie werden erst geladen, wenn Sie auf „${isMap ? 'Karte' : 'Video'} laden“ klicken. Erst dann wird eine Verbindung zu den Servern von ${info.service} hergestellt und dabei unter anderem Ihre IP-Adresse übertragen. Rechtsgrundlage ist Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die Sie durch den Klick erteilen und durch Schließen des Browsers widerrufen. [Prüfen: Datenschutzhinweise des Anbieters verlinken]`,
      });
      pg.nodes[sec.id] = sec; pg.nodes[h.id] = h; pg.nodes[t.id] = t;
      sec.children.push(h.id, t.id);
      appendChild(pg, content.id, sec.id);
    }
  });
}

export const isEmbed = (n: WNode | undefined) => !!n?.embed;
export const currentPageHasRoot = () => !!siteRoot(viewPage(useEditor.getState()));
