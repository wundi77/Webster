import { memo, useEffect, useRef, type CSSProperties } from 'react';
import { CODE_SANDBOX, codeSrcdoc } from '../model/code';
import { takeEditCaret } from './textCaret';
import { useEditor, pageOf } from '../store';
import { nodeCss, toReactStyle, videoFillOf } from '../model/css';
import { slideOf, useSlides } from '../model/blocks';
import { LottieStill } from './LottieStill';
import { ensureFont } from '../model/fonts';
import { deleteNodes, setText } from '../model/commands';
import { resolveNode } from '../model/resolve';
import { withHover, withScrolled } from '../model/hover';
import { withDark } from '../model/theme';
import { animDesignSize, isAnimInstance, isAnimPage, withAnim } from '../model/animCore';
import { navCollapsed, navOwner } from '../model/nav';
import { EMBED_INFO, embedSrc } from '../model/embedCore';
import { vectorSvg } from '../model/vectorCore';
import { Icons } from '../ui/icons';
import type { Layout, WNode } from '../model/types';

export const NodeView = memo(function NodeView({ id, parentLayout }: { id: string; parentLayout: Layout | null }) {
  const node = useEditor(s => {
    const page = pageOf(s);
    const n = page.nodes[id];
    if (!n) return undefined;
    let r = resolveNode(n, s.breakpoint);
    // Eigene Animation: im Animations-Editor der Stand beim Abspielkopf, sonst der Endzustand
    if (n.anim) r = withAnim(r, isAnimPage(s.doc, s.pageId) ? s.animT : Infinity);
    if (s.darkView) r = withDark(r, s.doc.library.colors);
    // Nach dem Scrollen: gilt für die ganze Seite
    if (s.interaction === 'scrolled') return withScrolled(r);
    if (s.interaction !== 'hover' || !n.hover) return r;
    // Hover-Aussehen zeigen, wenn die Ebene oder ein Eltern-Element ausgewählt ist
    for (let c: typeof n | undefined = n; c; c = c.parentId ? page.nodes[c.parentId] : undefined) {
      if (s.selection.includes(c.id)) return withHover(r);
    }
    return r;
  });
  const editing = useEditor(s => s.editingTextId === id);
  // Menü auf kleinen Bildschirmen: ☰-Symbol statt der Menüpunkte
  const burger = useEditor(s => {
    const page = pageOf(s);
    if (!page.nodes[id]?.navLinks) return null;
    const owner = navOwner(page, id);
    return owner && navCollapsed(owner.nav, s.breakpoint) ? owner.nav!.iconColor : null;
  });
  const ref = node?.imageRef;
  const libSrc = useEditor(s => (ref ? s.doc.library.images.find(i => i.id === ref)?.src : undefined));
  const posterId = node?.embed?.poster;
  const videoId = node?.embed?.videoRef;
  const posterSrc = useEditor(s => (posterId ? s.doc.library.images.find(i => i.id === posterId)?.src : undefined));
  const videoSrc = useEditor(s => (videoId ? s.doc.library.videos.find(v => v.id === videoId)?.src : undefined));
  // Video als Hintergrund (Füllung): auf der Arbeitsfläche als stehendes Bild
  const bgVideoId = node ? videoFillOf(node)?.videoRef : undefined;
  const bgVideoSrc = useEditor(s => (bgVideoId ? s.doc.library.videos.find(v => v.id === bgVideoId)?.src : undefined));
  // Karussell: nur eine Folie zeigen – die mit der Auswahl darin, sonst die zuletzt gewählte
  const isCar = !!node?.carousel;
  const selSlide = useEditor(s => (isCar ? slideOf(pageOf(s), id, s.selection[0]) : -1));
  const uiSlide = useSlides(s => (isCar ? s[id] ?? 0 : 0));
  // Eingebaute Animation: Inhalt in Originalgröße zeichnen und als Ganzes verkleinern/vergrößern
  const design = useEditor(s => { if (!node || !isAnimInstance(node)) return null; const d = animDesignSize(s.doc, node); return d ? `${d.w}x${d.h}` : null; });
  if (!node) return null;
  const style = toReactStyle(nodeCss(node, parentLayout)) as CSSProperties;
  const cls = node.locked ? 'node locked' : 'node';

  if (node.type === 'text') {
    return <TextNode key={editing ? 'edit' : 'view'} node={node} style={style} editing={editing} cls={cls} />;
  }
  if (node.type === 'image') {
    return (
      <div className={cls} data-node-id={id} style={style}>
        {(libSrc ?? node.src) && (
          <img src={libSrc ?? node.src} alt="" draggable={false}
            style={{ display: 'block', width: '100%', height: '100%', objectFit: node.objectFit ?? 'cover', objectPosition: node.focus ? `${Math.round(node.focus.x * 100)}% ${Math.round(node.focus.y * 100)}%` : undefined, pointerEvents: 'none' }} />
        )}
      </div>
    );
  }
  if (node.codeBlock) {
    return (
      <div className={`${cls} code-node`} data-node-id={id} style={{ ...style, overflow: 'hidden' }}>
        <iframe title={node.name} srcDoc={codeSrcdoc(node.codeBlock)} sandbox={CODE_SANDBOX} tabIndex={-1}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, pointerEvents: 'none', background: 'transparent' }} />
      </div>
    );
  }
  if (node.embed) {
    const e = node.embed;
    const info = EMBED_INFO[e.kind];
    const isMap = e.kind === 'gmaps' || e.kind === 'osm';
    const ready = e.kind === 'video' ? !!videoSrc : !!embedSrc(e, false);
    return (
      <div className={`${cls} embed-node`} data-node-id={id} style={{ ...style, overflow: 'hidden' }}>
        {e.kind === 'video' && videoSrc ? (
          <video src={videoSrc} poster={posterSrc} muted preload="metadata" playsInline
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
        ) : (
          <>
            {posterSrc && <img src={posterSrc} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />}
            <div className="embed-ph">
              <span className="embed-ph-icon">{isMap ? <Icons.pin /> : <Icons.play />}</span>
              <span className="embed-ph-label">{ready ? info.label : e.kind === 'video' ? 'Video auswählen' : isMap ? 'Adresse eintragen' : 'Video-Link eintragen'}</span>
              {info.service && <span className="embed-ph-note">Lädt auf der Website erst nach Klick der Besucher</span>}
            </div>
          </>
        )}
      </div>
    );
  }
  if (node.type === 'vector') {
    return <div className={cls} data-node-id={id} style={style} dangerouslySetInnerHTML={{ __html: vectorSvg(node) }} />;
  }
  if (burger) {
    // Nur die Platzierung übernehmen, nicht Größe/Layout/Hintergrund des Menü-Boards
    const keep = ['position', 'left', 'top', 'transform', 'flexShrink', 'alignSelf', 'gridColumn', 'gridRow', 'margin', 'opacity', 'zIndex'];
    const pos = Object.fromEntries(Object.entries(style).filter(([k]) => keep.includes(k))) as CSSProperties;
    return (
      <div className={`${cls} nav-burger`} data-node-id={id} title="Menü (auf diesem Bildschirm als ☰-Symbol)"
        style={{ ...pos, width: 24, height: 24, color: burger, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5 }}>
        <span /><span /><span />
      </div>
    );
  }
  const childLayout = node.type === 'board' ? node.layout : null;
  const shown = isCar ? Math.min(node.children.length - 1, Math.max(0, selSlide >= 0 ? selSlide : uiSlide)) : -1;
  return (
    <div className={cls} data-node-id={id} style={style}>
      {bgVideoSrc && <video className="bg-video" src={bgVideoSrc} muted playsInline preload="metadata" aria-hidden="true" />}
      {node.lottie && <LottieStill assetId={node.lottie.ref} />}
      {design ? <AnimScale design={design} w={node.w}>{node.children.map(c => <NodeView key={c} id={c} parentLayout={childLayout} />)}</AnimScale>
        : node.children.map((c, i) => (shown < 0 || i === shown) && <NodeView key={c} id={c} parentLayout={childLayout} />)}
      {node.compare && <div className="cmp-line" style={{ left: `${node.compare.pos}%` }} />}
      {isCar && node.carousel!.dots && node.children.length > 1 && (
        <div className="car-dots-canvas">{node.children.map((c, i) => <i key={c} className={i === shown ? 'on' : ''} />)}</div>
      )}
    </div>
  );
});

function AnimScale({ design, w, children }: { design: string; w: number; children: React.ReactNode }) {
  const [dw, dh] = design.split('x').map(Number);
  const k = dw > 0 ? w / dw : 1;
  return <div className="anim-scale" style={{ position: 'absolute', left: 0, top: 0, width: dw, height: dh, transform: `scale(${k})`, transformOrigin: '0 0', pointerEvents: 'none' }}>{children}</div>;
}

function TextNode({ node, style, editing, cls }: { node: WNode; style: CSSProperties; editing: boolean; cls: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const family = node.textStyle?.fontFamily;

  useEffect(() => { if (family) ensureFont(family); }, [family]);

  useEffect(() => {
    if (!editing || !ref.current) return;
    const el = ref.current;
    el.innerText = node.text ?? '';
    el.focus();
    const sel = window.getSelection();
    const at = takeEditCaret();
    // Doppelklick / Textwerkzeug: Schreibmarke an die Klickstelle, sonst (Eingabetaste) alles markieren
    const all = document.createRange();
    all.selectNodeContents(el);
    sel?.removeAllRanges();
    sel?.addRange(all);
    if (at && document.caretRangeFromPoint) {
      // erst im nächsten Bild: dann ist der Text als bearbeitbar dargestellt und die Klickstelle auffindbar
      requestAnimationFrame(() => {
        if (document.activeElement !== el) return;
        const r = document.caretRangeFromPoint(at.x, at.y);
        if (r && el.contains(r.startContainer)) { sel?.removeAllRanges(); sel?.addRange(r); }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (editing) {
    const finish = () => {
      const el = ref.current;
      const text = el ? el.innerText.replace(/\n$/, '') : node.text ?? '';
      useEditor.getState().setEditing(null);
      if (!text.trim()) deleteNodes([node.id]);
      else setText(node.id, text);
    };
    return (
      <div ref={ref} className={`${cls} text-editing`} data-node-id={node.id}
        style={{ ...style, minWidth: 2, minHeight: '1em' }}
        contentEditable="plaintext-only" suppressContentEditableWarning spellCheck={false}
        onInput={e => setText(node.id, e.currentTarget.innerText)}
        onBlur={finish}
        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') e.currentTarget.blur(); }} />
    );
  }
  return <div ref={ref} className={cls} data-node-id={node.id} style={style}>{node.text || ' '}</div>;
}
