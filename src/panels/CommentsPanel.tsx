// Bereich „Kommentare“: Seite zum Ansehen weitergeben, Antworten einlesen, abhaken
import { useRef, useState } from 'react';
import { useEditor } from '../store';
import { deleteComments, downloadReviewFile, importCommentFile, setCommentDone, showComment, useCommentFocus } from '../model/comments';
import { allPages } from '../model/pageRules';
import { langLabel } from '../model/i18n';
import { askConfirm } from '../ui/ConfirmDialog';
import type { ReviewComment } from '../model/types';
import { useLeftArea } from './LeftPanel';

const when = (t: string) => new Date(t).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const device = (vw: number) => (vw && vw < 600 ? 'Handy' : vw && vw < 1000 ? 'Tablet' : '');

export function CommentsPanel() {
  const comments = useEditor(s => s.doc.comments);
  const doc = useEditor(s => s.doc);
  const lang = useEditor(s => s.lang);
  const focus = useCommentFocus(s => s.id);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = comments ?? [];
  const open = list.filter(c => !c.done);
  const done = list.filter(c => c.done);

  const share = () => {
    const { name, mb } = downloadReviewFile();
    const size = mb < 1 ? 'unter 1 MB' : `${mb.toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
    setMsg(mb > 20
      ? { ok: false, text: `„${name}“ wurde heruntergeladen, ist aber ${size} groß – für viele E-Mail-Programme zu groß. Verkleinere große Bilder oder schick die Datei über einen Dienst wie WeTransfer.` }
      : { ok: true, text: `„${name}“ (${size}) wurde heruntergeladen. Schick sie per E-Mail – sie lässt sich mit jedem Browser öffnen.` });
  };
  const load = async (f: File | undefined) => {
    if (!f) return;
    const text = await importCommentFile(f);
    setMsg({ ok: !/keine|nicht|anderen|groß/.test(text), text });
    if (input.current) input.current.value = '';
  };
  const removeDone = async () => {
    if (await askConfirm({ title: `${done.length} erledigte Kommentare löschen?`, message: 'Sie verschwinden aus der Liste. Mit ⌘Z holst du sie zurück.', confirmLabel: 'Löschen', danger: true }))
      deleteComments(done.map(c => c.id));
  };

  const pageName = (c: ReviewComment) => allPages(doc).find(p => p.id === c.pageId)?.name;
  const nodeName = (c: ReviewComment) => (c.nodeId ? allPages(doc).find(p => p.id === c.pageId)?.nodes[c.nodeId]?.name : undefined);

  const item = (c: ReviewComment, n: number) => {
    const page = pageName(c);
    const node = nodeName(c);
    const gone = !page || (c.nodeId && !node);
    const dev = device(c.vw);
    return (
      <li key={c.id} className={`cmt${c.done ? ' done' : ''}${focus === c.id ? ' focus' : ''}`}>
        <label className="cmt-check" title={c.done ? 'Wieder öffnen' : 'Als erledigt abhaken'}>
          <input type="checkbox" checked={!!c.done} onChange={e => setCommentDone(c.id, e.target.checked)} aria-label={c.done ? 'Wieder öffnen' : 'Erledigt'} />
        </label>
        <button type="button" className="cmt-body" onClick={() => showComment(c)} disabled={!page} title={page ? 'Zur Stelle springen' : undefined}>
          <span className="cmt-meta"><b>{c.done ? '✓' : n}</b> {c.author || 'Ohne Name'} · {when(c.at)}</span>
          <span className="cmt-text">{c.text}</span>
          <span className="cmt-where">
            {gone ? (page ? 'Die Stelle gibt es nicht mehr' : 'Die Seite gibt es nicht mehr') : `${page}${node ? ` › ${node}` : ''}`}
            {dev && ` · am ${dev} angesehen`}
            {c.lang && c.lang !== (doc.site?.lang || 'de') && ` · ${langLabel(c.lang)}`}
          </span>
        </button>
      </li>
    );
  };

  return (
    <section className="section comments-panel">
      <div className="snaps-title">Zum Ansehen weitergeben</div>
      <p className="hint">Webster macht aus deiner Website eine einzige Datei. Die schickst du per E-Mail – wer sie öffnet, kann sich durchklicken und Stellen kommentieren und schickt dir eine kleine Kommentar-Datei zurück.</p>
      <button type="button" className="btn primary wide" onClick={share}>Datei zum Ansehen herunterladen</button>
      {lang && <p className="hint keep">Die Datei zeigt die Fassung auf {langLabel(lang)}, weil du gerade in dieser Sprache bearbeitest.</p>}

      <div className="snaps-title">Kommentare einlesen</div>
      <button type="button" className="btn wide" onClick={() => input.current?.click()}>Kommentar-Datei öffnen …</button>
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={e => void load(e.target.files?.[0])} />
      {msg && <p className={`notice ${msg.ok ? 'ok' : 'warn'} keep`} role="status">{msg.text}</p>}

      <div className="snaps-title">Offen {open.length > 0 && <span className="cmt-count">{open.length}</span>}</div>
      {open.length ? <ul className="cmt-list">{open.map((c, i) => item(c, i + 1))}</ul>
        : <p className="hint keep">{list.length ? 'Alles erledigt.' : 'Noch keine Kommentare. Sie erscheinen hier und als Nadeln auf der Seite.'}</p>}
      {done.length > 0 && (
        <>
          <div className="cmt-done-head">
            <button type="button" className="btn small" onClick={() => setShowDone(v => !v)} aria-expanded={showDone}>{showDone ? 'Erledigte ausblenden' : `Erledigte zeigen (${done.length})`}</button>
            {showDone && <button type="button" className="btn small" onClick={() => void removeDone()}>Erledigte löschen</button>}
          </div>
          {showDone && <ul className="cmt-list">{done.map((c, i) => item(c, i + 1))}</ul>}
        </>
      )}
    </section>
  );
}

/** Nadeln für offene Kommentare auf der Arbeitsfläche (nur Seiten-Koordinaten → Bildschirm) */
export function CommentPins({ pageId, rectOf, sr }: {
  pageId: string;
  rectOf: (id: string) => { x: number; y: number; w: number; h: number } | null;
  sr: (r: { x: number; y: number; w: number; h: number }) => { left: number; top: number; width: number; height: number };
}) {
  const comments = useEditor(s => s.doc.comments);
  const focus = useCommentFocus(s => s.id);
  const open = (comments ?? []).filter(c => !c.done);
  if (!open.length) return null;
  let n = 0;
  const pins = open.map(c => {
    n++;
    if (c.pageId !== pageId || !c.nodeId) return null;
    const r = rectOf(c.nodeId);
    if (!r) return null;
    const p = sr({ x: r.x + c.px * r.w, y: r.y + c.py * r.h, w: 0, h: 0 });
    return (
      <button key={c.id} type="button" className={`cmt-pin${focus === c.id ? ' focus' : ''}`} style={{ left: p.left, top: p.top }}
        title={`${c.author || 'Ohne Name'}: ${c.text}`} aria-label={`Kommentar ${n}: ${c.text}`}
        onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); useLeftArea.getState().setArea('comments'); showComment(c); }}>{n}</button>
    );
  });
  return <>{pins}</>;
}
