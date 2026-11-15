// Erzeugt aus einer Seite echtes HTML + CSS – für die Live-Vorschau und den Export.
import type { Breakpoint, Page, WDocument, WNode } from '../model/types';
import { CODE_SANDBOX, codeSrcdoc } from '../model/code';
import { nodeCss, rgba, slug } from '../model/css';
import { resolveNode } from '../model/resolve';
import { fontHrefFor, type FontUse } from '../model/fonts';
import { BREAKPOINTS } from '../model/factory';
import { EMBED_INFO, embedOpenUrl, embedSrc } from '../model/embedCore';
import { VECTOR_PAINT_CSS, vectorSvg } from '../model/vectorCore';

type Css = Record<string, string>;

export interface PageCtx {
  doc: WDocument;
  page: Page;
  /** CSS-Klasse einer Ebene */
  cls: (id: string) => string;
  /** Adresse eines Bildes */
  imageSrc: (n: WNode) => string;
  /** Link auf eine andere Seite der Website */
  pageLink: (pageId: string) => { href: string; attrs?: string };
  /** Externe Links immer in einem neuen Tab öffnen (Vorschau) */
  externalNewTab?: boolean;
  /** Lesbar formatiertes CSS */
  pretty?: boolean;
  /** Selektor, mit dem alle Regeln dieser Seite beginnen (z. B. ".seite-kontakt") */
  scope?: string;
  /** Adresse eines Bildes oder Videos aus der Bibliothek */
  asset?: (kind: 'image' | 'video', id: string) => string;
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const px = (v: number) => `${Math.round(v * 100) / 100}px`;

function block(sel: string, c: Css, pretty?: boolean, indent = ''): string {
  const entries = Object.entries(c);
  if (!entries.length) return '';
  if (!pretty) return `${sel}{${entries.map(([k, v]) => `${k}:${v}`).join(';')}}`;
  return `${indent}${sel} {\n${entries.map(([k, v]) => `${indent}  ${k}: ${v};`).join('\n')}\n${indent}}`;
}

/** Unterschiede zwischen zwei Regel-Sätzen (entfernte Eigenschaften werden zurückgesetzt) */
const PAINT_RESET = new Set(['background-image', 'background-color', '-webkit-background-clip', 'background-clip', '-webkit-text-fill-color', '--wpaint', 'fill', 'filter', 'text-shadow']);

/** Überträgt nur die geänderten Teile (from → to) auf base, z. B. nur den oberen Innenabstand */
function applyDelta(base: unknown, from: unknown, to: unknown): unknown {
  if (JSON.stringify(from) === JSON.stringify(to)) return base;
  if (Array.isArray(to) && Array.isArray(base) && Array.isArray(from) && to.every(v => typeof v === 'number') && base.length === to.length)
    return base.map((v, i) => (to[i] !== from[i] ? to[i] : v));
  if (to && typeof to === 'object' && !Array.isArray(to) && base && typeof base === 'object' && from && typeof from === 'object') {
    const r: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const k of Object.keys(to)) r[k] = applyDelta((base as Record<string, unknown>)[k], (from as Record<string, unknown>)[k], (to as Record<string, unknown>)[k]);
    return r;
  }
  return to;
}

function diff(a: Css, b: Css): Css {
  const out: Css = {};
  for (const k in b) if (a[k] !== b[k]) out[k] = b[k];
  for (const k in a) if (!(k in b)) out[k] = 'unset';
  return out;
}

/** Das Webseiten-Board einer Seite */
export function siteRoot(page: Page): WNode | undefined {
  const roots = page.rootIds.map(id => page.nodes[id]).filter(Boolean);
  return roots.find(n => n.site && n.type === 'board') ?? roots.find(n => n.type === 'board');
}

export const BASE_CSS = `*, *::before, *::after { box-sizing: border-box; }
${VECTOR_PAINT_CSS}
html { scroll-behavior: smooth; }
body { margin: 0; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
a { color: inherit; text-decoration: none; cursor: pointer; }
img { display: block; }
[data-reveal] { opacity: 0; }
[data-reveal="up"] { translate: 0 40px; }
[data-reveal="left"] { translate: -40px 0; }
[data-reveal="zoom"] { scale: .9; }
[data-reveal].in { opacity: var(--op, 1); translate: none; scale: none; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  [data-reveal] { opacity: var(--op, 1) !important; translate: none !important; scale: none !important; transition: none !important; }
}`;

export const REVEAL_JS = `(function(){var els=document.querySelectorAll('[data-reveal]');if(!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('in')});return}var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:0.12,rootMargin:'0px 0px -5% 0px'});els.forEach(function(e){io.observe(e)})})();`;

/** Setzt html.w-scrolled ab einer Scroll-Position; der Puffer verhindert Flackern, wenn die Kopfzeile dabei kleiner wird */
export const scrollJs = (sc: { at: number; hyst: number }) => `(function(){var r=document.documentElement,on=false,q=false,t=${Math.round(sc.at)},off=${Math.max(0, Math.round(sc.at - Math.max(sc.hyst, 20)))};function u(){q=false;var y=window.pageYOffset;if(!on&&y>t){on=true;r.classList.add('w-scrolled')}else if(on&&y<=off){on=false;r.classList.remove('w-scrolled')}}window.addEventListener('scroll',function(){if(!q){q=true;requestAnimationFrame(u)}},{passive:true});u()})();`;

export const NAV_CSS = `.nav-toggle { display: none; position: relative; z-index: 1001; flex-shrink: 0; width: 44px; height: 44px; margin: -8px; padding: 10px; border: 0; background: none; cursor: pointer; flex-direction: column; justify-content: center; align-items: center; gap: 5px; }
.nav-toggle span { display: block; width: 24px; height: 2px; border-radius: 2px; background: currentColor; transition: transform .25s ease, opacity .2s ease; }
.nav-open .nav-toggle span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
.nav-open .nav-toggle span:nth-child(2) { opacity: 0; }
.nav-open .nav-toggle span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
body.nav-open { overflow: hidden; }
@media (prefers-reduced-motion: reduce) { .nav-toggle span { transition: none; } }`;

export const NAV_JS = `(function(){document.querySelectorAll('.nav-toggle').forEach(function(b){var m=document.getElementById(b.getAttribute('aria-controls'));function set(o){document.body.classList.toggle('nav-open',o);b.setAttribute('aria-expanded',o?'true':'false');b.setAttribute('aria-label',o?'Menü schließen':'Menü öffnen')}b.addEventListener('click',function(){set(!document.body.classList.contains('nav-open'))});if(m)m.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('a'))set(false)});document.addEventListener('keydown',function(e){if(e.key==='Escape')set(false)});window.addEventListener('resize',function(){if(getComputedStyle(b).display==='none')set(false)})})})();`;

export const FORM_CSS = `:where(form[data-to] input, form[data-to] textarea, form[data-to] button) { border: 0; margin: 0; font: inherit; color: inherit; background: none; -webkit-appearance: none; appearance: none; }
:where(form[data-to] textarea) { resize: vertical; }
:where(form[data-to] button) { cursor: pointer; text-align: center; }
:where(form[data-to] button span) { display: block; }
:where(form[data-to]) :is(input, textarea):focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
form[data-to] .wform-status { margin: 0; font-size: 14px; line-height: 1.4; }`;

export const FORM_JS = `(function(){document.querySelectorAll('form[data-to]').forEach(function(f){f.addEventListener('submit',function(e){e.preventDefault();var to=decodeURIComponent(escape(atob(f.getAttribute('data-to')))).split('').reverse().join('');var g=function(n){var el=f.querySelector('[name="'+n+'"]');return el?el.value.trim():''};var lab=function(n){var el=f.querySelector('[name="'+n+'"]');return el?el.getAttribute('data-label'):n};var subj=g('betreff')||f.getAttribute('data-subject')||'Kontaktanfrage';var lines=[];['name','email','telefon'].forEach(function(k){var v=g(k);if(v)lines.push(lab(k)+': '+v)});var body=lines.join('\\n')+(lines.length?'\\n\\n':'')+g('nachricht');window.location.href='mailto:'+to+'?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body);var st=f.querySelector('.wform-status');if(!st){st=document.createElement('p');st.className='wform-status';st.setAttribute('role','status');f.appendChild(st)}st.textContent='Ihr E-Mail-Programm wurde geöffnet – bitte senden Sie die Nachricht dort ab.'})})})();`;

const FIELD_META: Record<string, { type: string; auto: string; label: string; required: boolean }> = {
  name: { type: 'text', auto: 'name', label: 'Name', required: true },
  email: { type: 'email', auto: 'email', label: 'E-Mail', required: true },
  telefon: { type: 'tel', auto: 'tel', label: 'Telefon', required: false },
  betreff: { type: 'text', auto: 'off', label: 'Betreff', required: false },
  nachricht: { type: 'textarea', auto: 'off', label: 'Nachricht', required: true },
};

export const EMBED_CSS = `.wembed { overflow: hidden; }
.wembed-consent { position: absolute; inset: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 16px 16px 56px; border: 0; margin: 0; cursor: pointer; color: #fff; font: 600 15px/1.3 system-ui, -apple-system, sans-serif; text-shadow: 0 1px 3px rgba(0,0,0,.5); background-color: transparent; background-size: cover; background-position: center; }
.wembed-consent::before { content: ""; position: absolute; inset: 0; background: linear-gradient(rgba(0,0,0,.15), rgba(0,0,0,.45)); }
.wembed-consent > * { position: relative; }
.wembed-icon { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; background: rgba(0,0,0,.55); transition: transform .2s ease, background .2s ease; }
.wembed-consent:hover .wembed-icon, .wembed-consent:focus-visible .wembed-icon { transform: scale(1.06); background: rgba(0,0,0,.75); }
.wembed-consent:focus-visible { outline: 3px solid #fff; outline-offset: -6px; }
.wembed-note { position: absolute; left: 0; right: 0; bottom: 0; margin: 0; padding: 8px 12px; font: 12px/1.4 system-ui, -apple-system, sans-serif; color: #fff; background: rgba(0,0,0,.6); }
.wembed-note a { text-decoration: underline; }
@media (prefers-reduced-motion: reduce) { .wembed-icon { transition: none; } }`;

export const EMBED_JS = `(function(){function load(w,auto){var s=w.getAttribute('data-src');if(!auto)s=s.replace(/&autoplay=1/,'');var f=document.createElement('iframe');f.src=s;f.title=w.getAttribute('data-title')||'';f.setAttribute('allow','autoplay; fullscreen; picture-in-picture; encrypted-media');f.setAttribute('allowfullscreen','');f.style.cssText='position:absolute;inset:0;width:100%;height:100%;border:0';w.innerHTML='';w.appendChild(f)}var ok={};try{ok=JSON.parse(sessionStorage.getItem('wembed')||'{}')}catch(e){}document.querySelectorAll('[data-embed]').forEach(function(w){var k=w.getAttribute('data-embed');if(ok[k]){load(w,false);return}var b=w.querySelector('.wembed-consent');if(b)b.addEventListener('click',function(){ok[k]=1;try{sessionStorage.setItem('wembed',JSON.stringify(ok))}catch(e){}document.querySelectorAll('[data-embed="'+k+'"]').forEach(function(x){load(x,x===w)})})})})();`;

const PLAY_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l11-6.5z"/></svg>';
const PIN_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';

/** Empfänger-Adresse so verpacken, dass Adress-Sammler sie nicht im Quelltext finden */
export const encodeMail = (to: string) => btoa(unescape(encodeURIComponent(to.trim().split('').reverse().join(''))));

export interface PageParts { body: string; css: string; fonts: FontUse[]; background: string; empty: boolean; nav?: boolean; form?: boolean; embed?: boolean;
  /** Umschalten nach dem Scrollen: ab welcher Position, mit wie viel Puffer beim Zurückscrollen */
  scroll?: { at: number; hyst: number } }

/** HTML-Körper und CSS einer Seite */
export function renderPageParts(ctx: PageCtx): PageParts {
  const { page, doc, pretty } = ctx;
  const root = siteRoot(page);
  if (!root) return { body: '<p style="font-family:system-ui;padding:40px;color:#666">Diese Seite hat noch kein Board.</p>', css: '', fonts: [], background: '#fff', empty: true };

  const anchors = new Set<string>();
  for (const id in page.nodes) { const l = page.nodes[id].link; if (l?.type === 'anchor') anchors.add(l.nodeId); }

  const base: string[] = [];
  const media: Record<Exclude<Breakpoint, 'desktop'>, string[]> = { tablet: [], mobile: [] };
  const hoverRules: string[] = [];
  const scrollRules: string[] = [];
  const scrollMedia: Record<Exclude<Breakpoint, 'desktop'>, string[]> = { tablet: [], mobile: [] };
  let scrollAt = Infinity, shrink = 0;
  /** Einstellung der Ebene selbst oder des nächsten Eltern-Elements */
  const upward = <T,>(n: WNode, get: (x: WNode) => T | undefined, def: T): T => {
    for (let c: WNode | undefined = n; c; c = page.nodes[c.parentId ?? '']) { const v = get(c); if (v !== undefined) return v; }
    return def;
  };
  const scrollDur = (n: WNode) => upward(n, x => x.scrollDuration, 250);
  const scrollAtOf = (n: WNode) => upward(n, x => x.scrollAt, 80);
  const navRules: string[] = [];
  let hasForm = false;
  let hasEmbed = false;
  const navOwnerOf = (id: string): WNode | undefined => {
    let n = page.nodes[page.nodes[id]?.parentId ?? ''];
    while (n) { if (n.nav) return n; n = page.nodes[n.parentId ?? '']; }
    return undefined;
  };
  const fonts: FontUse[] = [];
  const addFont = (ts: WNode['textStyle']) => { if (ts) fonts.push({ family: ts.fontFamily, weight: ts.fontWeight, italic: ts.italic }); };

  const cssFor = (n: WNode, bp: Breakpoint, parent: WNode | undefined): Css => {
    const rn = resolveNode(n, bp);
    const pl = parent ? resolveNode(parent, bp).layout : null;
    const c = nodeCss(rn, pl);
    if (rn.type === 'text') addFont(rn.textStyle);
    if (n.id === root.id) {
      // Das Webseiten-Board füllt das Browserfenster
      delete c.left; delete c.top; delete c.width; delete c.height; delete c.transform;
      c.position = 'relative';
      c.width = '100%';
      if (c.overflow === 'hidden') c.overflow = 'clip';
      if (!(rn.layout && rn.sizingV === 'auto')) c['min-height'] = px(rn.h);
    }
    if (n.reveal && c.opacity) { c['--op'] = c.opacity; delete c.opacity; }
    const pin = n.pin;
    if (pin && n.id !== root.id) {
      if (pin.mode === 'sticky' && pl && !n.absolute) { c.position = 'sticky'; c.top = '0'; }
      else {
        // Bleibt im Fenster stehen: Position aus der Lage im Webseiten-Board (je Breakpoint)
        // Ohne eigene Position für Tablet/Mobil gilt der Abstand vom Desktop (z. B. Störer bleibt 40 px vom rechten Rand)
        const own = bp !== 'desktop' && (n.overrides?.tablet?.x !== undefined || (bp === 'mobile' && n.overrides?.mobile?.x !== undefined));
        const geo = own ? bp : 'desktop';
        let ax = 0, ay = 0;
        for (let cur: WNode | undefined = n; cur && cur.parentId; cur = page.nodes[cur.parentId]) { const r = resolveNode(cur, geo); ax += r.x; ay += r.y; }
        const bwD = resolveNode(root, geo).w, bw = resolveNode(root, bp).w;
        if (!own && pin.h === 'left' && ax + rn.w > bw) ax = Math.max(0, bw - rn.w - Math.max(0, bwD - ax - resolveNode(n, geo).w));
        c.position = 'fixed';
        delete c.left; delete c.top; delete c['margin-top'];
        if (rn.w >= bw - 1) { c.left = '0'; c.width = '100%'; }
        else if (pin.h === 'right') c.right = px(Math.max(0, (own ? bw : bwD) - ax - resolveNode(n, geo).w));
        else c.left = px(ax);
        if (pin.v === 'bottom') c.bottom = px(pin.bottom); else c.top = px(ay);
      }
      c['z-index'] = n.nav ? '50' : '60';
    }
    return c;
  };

  const el = (id: string, parent: WNode | undefined, linkAncestor: string | null, depth: number): string => {
    const n = page.nodes[id];
    if (!n) return '';
    const cls = ctx.cls(n.id);
    const pre = ctx.scope ? ctx.scope + ' ' : '';
    const sel = pre + '.' + cls;
    const d = cssFor(n, 'desktop', parent);
    const t = cssFor(n, 'tablet', parent);
    const m = cssFor(n, 'mobile', parent);

    // Übergänge: Hover + Einblenden
    const trans: string[] = [];
    const hasHover = !!n.hover && Object.keys(n.hover).length > 0;
    const hasScroll = !!n.scrolled && Object.keys(n.scrolled).length > 0;
    if (hasScroll) trans.push(`all ${scrollDur(n)}ms ease`);
    else if (hasHover) trans.push(`all ${n.hoverDuration ?? 200}ms ease`);
    if (n.reveal) {
      d['--rd'] = `${n.reveal.duration}ms`;
      d['--rdl'] = `${n.reveal.delay}ms`;
      trans.push('opacity var(--rd) ease var(--rdl)', 'translate var(--rd) cubic-bezier(.2,.7,.2,1) var(--rdl)', 'scale var(--rd) cubic-bezier(.2,.7,.2,1) var(--rdl)');
    }
    if (trans.length) d.transition = trans.join(', ');

    base.push(block(sel, d, pretty));
    const strip = (c: Css) => { delete c['--rd']; delete c['--rdl']; delete c.transition; return c; };
    const dt = strip(diff(d, t)), tm = strip(diff(t, m));
    if (Object.keys(dt).length) media.tablet.push(block(sel, dt, pretty, '  '));
    if (Object.keys(tm).length) media.mobile.push(block(sel, tm, pretty, '  '));

    if (hasHover) {
      const rn = resolveNode(n, 'desktop');
      const pl = parent ? parent.layout : null;
      const h = diff(nodeCss(rn, pl), nodeCss({ ...rn, ...n.hover }, pl));
      // Farb-/Verlaufsangaben müssen beim Wechsel (z. B. Verlauf → Farbe) zurückgesetzt werden, alles andere nicht
      for (const k of Object.keys(h)) if (h[k] === 'unset' && !PAINT_RESET.has(k)) delete h[k];
      if (n.type === 'text') addFont(n.hover!.textStyle);
      const trigger = linkAncestor && linkAncestor !== n.id ? `${pre}.${ctx.cls(linkAncestor)}:hover .${cls}` : `${sel}:hover`;
      hoverRules.push(block(trigger, h, pretty));
    }
    if (hasScroll) {
      // Pro Breakpoint: nur die geänderten Werte umschalten (z. B. Innenabstand oben/unten), der Rest bleibt wie auf dem jeweiligen Gerät
      const dn = resolveNode(n, 'desktop');
      const scrollCss = (bp: Breakpoint) => {
        const rn = resolveNode(n, bp);
        const plb = parent ? resolveNode(parent, bp).layout : null;
        const sc: Record<string, unknown> = {};
        const R = rn as unknown as Record<string, unknown>, D = dn as unknown as Record<string, unknown>;
        for (const [k, v] of Object.entries(n.scrolled!)) sc[k] = applyDelta(R[k], D[k], v);
        return { norm: nodeCss(rn, plb), scr: nodeCss({ ...rn, ...sc } as WNode, plb) };
      };
      const keys = new Set<string>();
      let prev: Css | null = null;
      for (const bp of ['desktop', 'tablet', 'mobile'] as Breakpoint[]) {
        const { norm, scr } = scrollCss(bp);
        for (const k of Object.keys(diff(norm, scr))) keys.add(k);
        const rule: Css = {};
        for (const k of keys) rule[k] = k in scr ? scr[k] : k === 'display' ? 'block' : 'unset';
        if (prev && Object.keys(rule).every(k => prev![k] === rule[k])) continue;
        const target = bp === 'desktop' ? scrollRules : scrollMedia[bp];
        if (Object.keys(rule).length) target.push(block(`html.w-scrolled ${sel}`, rule, pretty, bp === 'desktop' ? '' : '  '));
        prev = rule;
      }
      if (n.type === 'text') addFont(n.scrolled!.textStyle);
      const rn = dn;
      scrollAt = Math.min(scrollAt, scrollAtOf(n));
      if (n.scrolled!.h !== undefined && n.scrolled!.h < rn.h) shrink = Math.max(shrink, rn.h - n.scrolled!.h);
    }

    // Element
    const attrs: string[] = [`class="${cls}"`];
    if (anchors.has(n.id)) attrs.push(`id="${cls}"`);
    if (n.reveal) attrs.push(`data-reveal="${n.reveal.type}"`);
    let tag = n.type === 'image' ? 'img' : 'div';
    let myLink = linkAncestor;
    const L = n.link;
    const pad0 = pretty ? '\n' + '  '.repeat(depth) : '';
    // Eigener Code: abgeschotteter Rahmen
    if (n.codeBlock) {
      base.push(block(sel, { border: '0', display: 'block', background: 'transparent' }, pretty));
      return `${pad0}<iframe class="${cls}" title="${esc(n.name)}" loading="lazy" sandbox="${CODE_SANDBOX}" srcdoc="${esc(codeSrcdoc(n.codeBlock))}"></iframe>`;
    }
    // Videos & Karten
    if (n.embed) {
      const e = n.embed;
      const asset = ctx.asset ?? ((k: 'image' | 'video', id: string) => (k === 'image' ? doc.library.images : doc.library.videos).find(x => x.id === id)?.src ?? '');
      const poster = e.poster ? asset('image', e.poster) : '';
      if (e.kind === 'video') {
        const src = e.videoRef ? asset('video', e.videoRef) : '';
        if (!src) return '';
        const va = [`class="${cls}"`, `src="${esc(src)}"`, 'playsinline', 'preload="metadata"', `title="${esc(n.name)}"`];
        if (poster) va.push(`poster="${esc(poster)}"`);
        if (e.controls) va.push('controls');
        if (e.autoplay) va.push('autoplay', 'muted');
        if (e.loop) va.push('loop');
        base.push(block(sel, { 'object-fit': 'cover', display: 'block' }, pretty));
        return `${pad0}<video ${va.join(' ')}></video>`;
      }
      const src = embedSrc(e, true);
      if (!src) return '';
      hasEmbed = true;
      const info = EMBED_INFO[e.kind];
      const isMap = e.kind === 'gmaps' || e.kind === 'osm';
      const dsPage = doc.pages.find(p => /datenschutz|privacy/i.test(p.name));
      const ds = dsPage ? ctx.pageLink(dsPage.id) : null;
      const open = embedOpenUrl(e);
      const note = [`Beim Laden werden Daten an ${info.service} übertragen.`,
        ds ? `<a href="${esc(ds.href)}"${ds.attrs ? ' ' + ds.attrs : ''}>Datenschutz</a>` : '',
        open ? `<a href="${esc(open)}" target="_blank" rel="noopener">Auf ${info.service} öffnen</a>` : ''].filter(Boolean).join(' · ');
      const ind = pretty ? pad0 + '  ' : '';
      return `${pad0}<div class="${cls} wembed" data-embed="${e.kind}" data-src="${esc(src)}" data-title="${esc(n.name)}">`
        + `${ind}<button type="button" class="wembed-consent"${poster ? ` style="background-image:url('${esc(poster)}')"` : ''}><span class="wembed-icon">${isMap ? PIN_SVG : PLAY_SVG}</span><span>${isMap ? 'Karte' : 'Video'} von ${info.service} laden</span></button>`
        + `${ind}<p class="wembed-note">${note}</p>${pad0}</div>`;
    }
    // Kontaktformular
    if (n.form && n.type === 'board') {
      hasForm = true;
      tag = 'form';
      attrs.push(`data-to="${encodeMail(n.form.to || '')}"`, `data-subject="${esc(n.form.subject || '')}"`);
    }
    if (n.formField && n.type === 'board') {
      hasForm = true;
      const meta = FIELD_META[n.formField];
      const ph = n.children.map(c => page.nodes[c]).find(c => c?.type === 'text');
      if (ph?.textStyle) {
        const ts = ph.textStyle;
        addFont(ts);
        const f = ph.fills.find(x => x.visible);
        base.push(block(`${sel}`, {
          'font-family': `"${ts.fontFamily}", sans-serif`, 'font-size': px(ts.fontSize), 'font-weight': String(ts.fontWeight),
          'line-height': String(ts.lineHeight), ...(f ? { color: rgba(f.color, f.opacity) } : {}),
        }, pretty));
        base.push(block(`${sel}::placeholder`, { color: 'inherit', opacity: String(ph.opacity ?? 0.5) }, pretty));
      }
      const fa = [`class="${cls}"`, `id="${cls}"`, `name="${n.formField}"`, `data-label="${meta.label}"`, `autocomplete="${meta.auto}"`];
      if (meta.required) fa.push('required');
      if (ph?.text) fa.push(`placeholder="${esc(ph.text)}"`);
      if (meta.type === 'textarea') return `${pad0}<textarea ${fa.join(' ')}></textarea>`;
      return `${pad0}<input type="${meta.type}" ${fa.join(' ')}>`;
    }
    if (n.formLabel && n.type === 'text' && parent) {
      const input = parent.children.map(c => page.nodes[c]).find(c => c?.formField);
      if (input) { tag = 'label'; attrs.push(`for="${ctx.cls(input.id)}"`); }
    }
    if (n.formSubmit && n.type === 'board') {
      const kids = n.children.map(c => el(c, n, null, depth + 1)).join('').replace(/<div /g, '<span ').replace(/<\/div>/g, '</span>');
      return `${pad0}<button type="submit" ${attrs.join(' ')}>${kids}${kids && pretty ? pad0 : ''}</button>`;
    }
    if (L && !linkAncestor && tag === 'div') {
      let href = '';
      let extra = '';
      if (L.type === 'page') { const p = ctx.pageLink(L.pageId); href = p.href; extra = p.attrs ?? ''; }
      else if (L.type === 'anchor') href = '#' + ctx.cls(L.nodeId);
      else if (L.type === 'url' && L.url) {
        href = /^[a-z]+:/i.test(L.url) ? L.url : `https://${L.url}`;
        if (L.newTab || ctx.externalNewTab) extra = 'target="_blank" rel="noopener"';
      } else if (L.type === 'email' && L.email) href = `mailto:${L.email}`;
      if (href) {
        tag = 'a';
        attrs.push(`href="${esc(href)}"`);
        if (extra) attrs.push(extra);
        myLink = n.id;
      }
    }

    const pad = pretty ? '\n' + '  '.repeat(depth) : '';
    if (n.type === 'image') {
      const src = esc(ctx.imageSrc(n));
      const fit = n.objectFit ?? 'cover';
      if (tag === 'img') return `${pad}<img ${attrs.join(' ')} src="${src}" alt="${esc(n.name)}" style="object-fit:${fit}" loading="lazy">`;
      return `${pad}<a ${attrs.join(' ')}><img src="${src}" alt="${esc(n.name)}" style="width:100%;height:100%;object-fit:${fit}" loading="lazy"></a>`;
    }
    if (n.type === 'text') return `${pad}<${tag} ${attrs.join(' ')}>${esc(n.text ?? '')}</${tag}>`;
    if (n.type === 'vector') {
      // Icon ohne Text als Link: Ebenenname als Beschriftung für Screenreader
      if (tag === 'a') attrs.push(`aria-label="${esc(n.name)}"`);
      return `${pad}<${tag} ${attrs.join(' ')}>${vectorSvg(n)}</${tag}>`;
    }
    const owner = n.navLinks ? navOwnerOf(n.id) : undefined;
    const nav = owner?.nav;
    if (nav && nav.collapse !== 'never') {
      if (!anchors.has(n.id)) attrs.push(`id="${cls}"`);
      attrs.push('data-nav-links');
    }
    const kids = n.children.map(c => el(c, n, myLink, depth + 1)).join('');
    let out = `${pad}<${tag} ${attrs.join(' ')}>${kids}${kids && pretty ? pad : ''}</${tag}>`;
    if (nav && nav.collapse !== 'never') {
      const tcls = `nav-toggle-${cls}`;
      out += `${pad}<button class="nav-toggle ${tcls}" type="button" aria-label="Menü öffnen" aria-expanded="false" aria-controls="${cls}"><span></span><span></span><span></span></button>`;
      const max = BREAKPOINTS.find(b => b.id === nav.collapse)!.max;
      const pre = ctx.scope ? ctx.scope + ' ' : '';
      const open = ctx.scope ? `body.nav-open${ctx.scope} .${cls}` : `body.nav-open .${cls}`;
      const ind = pretty ? '  ' : '';
      const nl = pretty ? '\n' : '';
      navRules.push(`@media (max-width: ${max}px) {${nl}${[
        block(`${pre}.${cls}`, { display: 'none' }, pretty, ind),
        block(`${pre}.${tcls}`, { display: 'flex', color: nav.iconColor }, pretty, ind),
        block(open, {
          display: 'flex', position: 'fixed', inset: '0', 'z-index': '1000', 'flex-direction': 'column', 'flex-wrap': 'nowrap',
          'align-items': 'center', 'justify-content': 'center', gap: '28px', padding: '96px 24px', width: 'auto', height: 'auto',
          'max-width': 'none', margin: '0', background: nav.overlayBg, 'overflow-y': 'auto', transform: 'none',
        }, pretty, ind),
        block(`${open} > *`, { position: 'relative', left: 'auto', top: 'auto', transform: 'none', 'font-size': '28px', color: nav.overlayText }, pretty, ind),
      ].join(nl)}${nl}}`);
    }
    return out;
  };

  const body = el(root.id, undefined, null, 0).replace(/^\n/, '');
  const bg = root.fills.find(f => f.visible);
  const tab = BREAKPOINTS.find(b => b.id === 'tablet')!.max;
  const mob = BREAKPOINTS.find(b => b.id === 'mobile')!.max;
  const nl = pretty ? '\n' : '';
  const css = [
    ...base,
    ...hoverRules,
    media.tablet.length ? `@media (max-width: ${tab}px) {${nl}${media.tablet.join(nl)}${nl}}` : '',
    media.mobile.length ? `@media (max-width: ${mob}px) {${nl}${media.mobile.join(nl)}${nl}}` : '',
    ...navRules,
    ...scrollRules,
    scrollMedia.tablet.length ? `@media (max-width: ${tab}px) {${nl}${scrollMedia.tablet.join(nl)}${nl}}` : '',
    scrollMedia.mobile.length ? `@media (max-width: ${mob}px) {${nl}${scrollMedia.mobile.join(nl)}${nl}}` : '',
    scrollRules.length ? `@media (prefers-reduced-motion: reduce) {${nl}  html.w-scrolled * { transition: none !important; }${nl}}` : '',
  ].filter(Boolean).join(pretty ? '\n\n' : '\n');
  const scroll = scrollRules.length ? { at: scrollAt, hyst: shrink + 20 } : undefined;
  return { body, css, fonts, background: bg ? rgba(bg.color, bg.opacity) : '#fff', empty: false, nav: navRules.length > 0, form: hasForm, embed: hasEmbed, scroll };
}

/** Schriften gruppiert nach Familie */
export function groupFonts(uses: FontUse[]): Map<string, FontUse[]> {
  const m = new Map<string, FontUse[]>();
  for (const u of uses) { if (!m.has(u.family)) m.set(u.family, []); m.get(u.family)!.push(u); }
  return m;
}

/** Vollständige HTML-Datei für die Live-Vorschau (alles eingebettet) */
export function renderPreviewPage(doc: WDocument, pageId: string, pageLink: PageCtx['pageLink']): string {
  const page = doc.pages.find(p => p.id === pageId) ?? doc.pages[0];
  const parts = renderPageParts({
    doc, page, pageLink, externalNewTab: true,
    cls: id => 'n' + id,
    imageSrc: n => (n.imageRef ? doc.library.images.find(i => i.id === n.imageRef)?.src : n.src) ?? '',
  });
  const links = [...groupFonts(parts.fonts)].map(([f, u]) => fontHrefFor(f, u)).filter(Boolean)
    .map(h => `<link rel="stylesheet" href="${h}">`).join('\n');
  return `<!doctype html>
<html lang="${esc(doc.site?.lang || 'de')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.seo?.title || page.name)}</title>
${links}
<style>
${BASE_CSS}
${parts.nav ? NAV_CSS : ''}
${parts.form ? FORM_CSS : ''}
${parts.embed ? EMBED_CSS : ''}
body{background:${parts.background}}
${parts.css}
${doc.site?.css ?? ''}
</style>
${doc.site?.headCode ?? ''}
</head>
<body>
${parts.body}
<script>${REVEAL_JS}${parts.scroll ? scrollJs(parts.scroll) : ''}${parts.nav ? NAV_JS : ''}${parts.form ? FORM_JS : ''}${parts.embed ? EMBED_JS : ''}</script>
${doc.site?.bodyCode ?? ''}
</body>
</html>`;
}

/** Lesbare Klassennamen aus den Ebenennamen (eindeutig je Seite) */
export function classNames(doc: WDocument): Map<string, string> {
  const map = new Map<string, string>();
  for (const page of doc.pages) {
    const used = new Set<string>();
    const root = siteRoot(page);
    if (!root) continue;
    const walk = (id: string) => {
      const n = page.nodes[id];
      if (!n) return;
      let base = slug(n.name);
      if (/^[0-9-]/.test(base) || base === 'element') base = `${n.type === 'text' ? 'text' : n.type === 'image' ? 'bild' : n.type === 'vector' ? 'icon' : n.type === 'board' ? 'bereich' : 'form'}-${base}`.replace(/-element$/, '');
      let name = base, i = 2;
      while (used.has(name)) name = `${base}-${i++}`;
      used.add(name);
      map.set(n.id, name);
      n.children.forEach(walk);
    };
    walk(root.id);
  }
  return map;
}

/** Dateinamen aller Seiten (erste Seite = index.html, keine doppelten Namen) */
export function pageFiles(doc: WDocument): Map<string, string> {
  const used = new Set<string>(['index']);
  const map = new Map<string, string>();
  doc.pages.forEach((p, i) => {
    if (i === 0) { map.set(p.id, 'index.html'); return; }
    let base = slug(p.name);
    if (base === 'index') base = 'seite';
    let name = base, n = 2;
    while (used.has(name)) name = `${base}-${n++}`;
    used.add(name);
    map.set(p.id, `${name}.html`);
  });
  return map;
}
