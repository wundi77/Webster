// Kommentare von Kunden/Kollegen: Datei „zum Ansehen“ herunterladen, Kommentar-Datei wieder einlesen, abhaken
import { create } from 'zustand';
import { useEditor, viewPage } from '../store';
import { absRect } from './geometry';
import { centerOn } from './viewport';
import type { ReviewComment, WDocument } from './types';
import { buildReviewHtml, REVIEW_KIND, reviewSlug } from '../export/review';
import { labelChange } from './history';
import { allPages } from './pageRules';

const S = () => useEditor.getState();

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Datei zum Weitergeben herunterladen (in der Sprache, die gerade bearbeitet wird) */
export function downloadReviewFile(): { name: string; mb: number } {
  const s = S();
  const name = `${reviewSlug(s.doc)}-zum-ansehen.html`;
  const html = buildReviewHtml(s.doc, s.lang);
  download(name, html, 'text/html');
  return { name, mb: new Blob([html]).size / 1_000_000 };
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo);

/** Kommentar-Datei prüfen (kommt von außen – nichts ungeprüft übernehmen) */
export function parseComments(text: string, doc: WDocument): { list: ReviewComment[] } | { error: string } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { error: 'Das ist keine Kommentar-Datei von Webster.' }; }
  const r = raw as { kind?: unknown; comments?: unknown };
  if (!r || r.kind !== REVIEW_KIND || !Array.isArray(r.comments)) return { error: 'Das ist keine Kommentar-Datei von Webster.' };
  const pageIds = new Set(doc.pages.map(p => p.id));
  const list: ReviewComment[] = [];
  for (const c0 of r.comments.slice(0, 2000)) {
    const c = c0 as Record<string, unknown>;
    const id = str(c?.id, 64), pageId = str(c?.pageId, 64), body = str(c?.text, 4000).trim();
    if (!/^[\w-]+$/.test(id) || !pageId || !body) continue;
    list.push({
      id, pageId, nodeId: typeof c.nodeId === 'string' ? c.nodeId.slice(0, 64) : null,
      px: num(c.px, 0, 1), py: num(c.py, 0, 1), vw: Math.round(num(c.vw, 0, 10000)),
      author: str(c.author, 80).trim(), text: body,
      at: Number.isNaN(Date.parse(str(c.at, 40))) ? new Date().toISOString() : str(c.at, 40),
      lang: typeof c.lang === 'string' ? c.lang.slice(0, 8) : null,
    });
  }
  if (!list.length) return { error: 'In der Datei stehen keine Kommentare.' };
  if (!list.some(c => pageIds.has(c.pageId))) return { error: 'Diese Kommentare gehören zu einem anderen Projekt (keine der Seiten gibt es hier).' };
  return { list };
}

/** Eingelesene Kommentare übernehmen; schon vorhandene werden übersprungen (zweimal einlesen schadet nicht) */
export function addComments(list: ReviewComment[]): { added: number; known: number } {
  const have = new Set((S().doc.comments ?? []).map(c => c.id));
  const fresh = list.filter(c => !have.has(c.id));
  if (fresh.length) {
    S().mutate((_, d) => { d.comments = [...(d.comments ?? []), ...fresh]; }, { key: 'comments-import', system: true });
    labelChange(S().doc, `${fresh.length} Kommentar${fresh.length === 1 ? '' : 'e'} eingelesen`);
  }
  return { added: fresh.length, known: list.length - fresh.length };
}

export async function importCommentFile(file: File): Promise<string> {
  if (file.size > 5_000_000) return 'Die Datei ist zu groß für eine Kommentar-Datei.';
  const res = parseComments(await file.text(), S().doc);
  if ('error' in res) return res.error;
  const { added, known } = addComments(res.list);
  if (!added) return 'Diese Kommentare sind schon alle da.';
  return `${added} Kommentar${added === 1 ? '' : 'e'} eingelesen${known ? ` (${known} waren schon da)` : ''}.`;
}

export function setCommentDone(id: string, done: boolean) {
  S().mutate((_, d) => { const c = d.comments?.find(x => x.id === id); if (c) c.done = done; }, { key: `comment-${id}`, system: true });
  labelChange(S().doc, done ? 'Kommentar erledigt' : 'Kommentar wieder offen');
}

export function deleteComments(ids: string[]) {
  S().mutate((_, d) => { d.comments = (d.comments ?? []).filter(c => !ids.includes(c.id)); if (!d.comments.length) delete d.comments; }, { key: 'comment-del', system: true });
  labelChange(S().doc, ids.length === 1 ? 'Kommentar gelöscht' : `${ids.length} Kommentare gelöscht`);
}

/** Zur kommentierten Stelle springen: Seite öffnen und Ebene auswählen */
export function showComment(c: ReviewComment) {
  const s = S();
  if (!allPages(s.doc).some(p => p.id === c.pageId)) return;
  if (s.pageId !== c.pageId) s.setPage(c.pageId);
  const pg = allPages(S().doc).find(p => p.id === c.pageId);
  if (c.nodeId && pg?.nodes[c.nodeId]) {
    S().setSelection([c.nodeId]);
    const r = absRect(viewPage(S()), c.nodeId);
    centerOn(r.x + c.px * r.w, r.y + c.py * r.h);
  }
  useCommentFocus.setState({ id: c.id });
}

/** Welcher Kommentar gerade hervorgehoben ist (Liste ↔ Nadel auf der Arbeitsfläche) */
export const useCommentFocus = create<{ id: string | null }>(() => ({ id: null }));
