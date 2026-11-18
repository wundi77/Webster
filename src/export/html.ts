// Erzeugt aus einer Seite echtes HTML + CSS – für die Live-Vorschau und den Export.
import type { Breakpoint, Page, WDocument, WNode } from '../model/types';
import { CODE_SANDBOX, codeSrcdoc } from '../model/code';
import { effectiveSizing, isFooter, isHeader, nodeCss, paintCss, rgba, setDarkPaints, slug, videoFillOf } from '../model/css';
import { resolveNode } from '../model/resolve';
import { textTagOf } from '../model/headings';
import { fontHrefFor, type FontUse } from '../model/fonts';
import { BREAKPOINTS } from '../model/factory';
import { EMBED_INFO, embedOpenUrl, embedSrc } from '../model/embedCore';
import { VECTOR_PAINT_CSS, vectorSvg } from '../model/vectorCore';
import { LOTTIE_PLAYER } from './lottiePlayer';
import { animDesignSize, isAnimated, isAnimInstance, morphPath, sampleTimes, subtreeDuration, valueAt, withAnim } from '../model/animCore';

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
h1, h2, h3, h4, p { margin: 0; font: inherit; }
.wh { margin: 0; font: inherit; color: inherit; letter-spacing: inherit; text-transform: inherit; text-decoration: inherit; white-space: inherit; text-align: inherit; }
[data-reveal] { opacity: 0; }
[data-reveal="up"] { translate: 0 calc(40px * var(--ma, 1)); }
[data-reveal="left"] { translate: calc(-40px * var(--ma, 1)) 0; }
[data-reveal="zoom"] { scale: .9; }
[data-reveal].in { opacity: var(--op, 1); translate: none; scale: none; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  [data-reveal] { opacity: var(--op, 1) !important; translate: none !important; scale: none !important; transition: none !important; }
}`;

export const REVEAL_JS = `(function(){var els=document.querySelectorAll('[data-reveal]');if(!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('in')});return}var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:0.12,rootMargin:'0px 0px -5% 0px'});els.forEach(function(e){io.observe(e)})})();`;

/** Bewegungen (Bereich „Bewegung“): Grundwerte als registrierte Variablen, damit sie sich animieren lassen */
const MOTION_CSS_BASE = `@property --fx-x{syntax:'<length>';inherits:false;initial-value:0px}
@property --fx-y{syntax:'<length>';inherits:false;initial-value:0px}
@property --fm-x{syntax:'<length>';inherits:false;initial-value:0px}
@property --fm-y{syntax:'<length>';inherits:false;initial-value:0px}
@property --fx-ly{syntax:'<length>';inherits:false;initial-value:0px}
@property --fx-b{syntax:'<length>';inherits:false;initial-value:0px}
@property --fx-r{syntax:'<angle>';inherits:false;initial-value:0deg}
@property --fx-rx{syntax:'<angle>';inherits:false;initial-value:0deg}
@property --fx-ry{syntax:'<angle>';inherits:false;initial-value:0deg}
@property --fx-s{syntax:'<number>';inherits:false;initial-value:1}
@property --fx-ls{syntax:'<number>';inherits:false;initial-value:1}
@property --fx-o{syntax:'<number>';inherits:false;initial-value:1}
@property --bgx{syntax:'<percentage>';inherits:false;initial-value:0%}
@keyframes w-bgmove { to { --bgx: 100%; } }
.w-bgv { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -1; border-radius: inherit; pointer-events: none; }
[data-reveal="words"], [data-reveal="count"] { opacity: var(--op, 1); translate: none; scale: none; }
.w-wd { display: inline-block; opacity: 0; translate: 0 .45em; transition: opacity var(--rd, 600ms) ease calc(var(--rdl, 0ms) + var(--i) * 80ms), translate var(--rd, 600ms) cubic-bezier(.2,.7,.2,1) calc(var(--rdl, 0ms) + var(--i) * 80ms); }
[data-reveal="words"].in .w-wd { opacity: 1; translate: none; }
.w-mq { display: flex; flex: none; width: max-content; gap: inherit; align-items: inherit; padding-inline-end: var(--mq-gap, 0px); animation: w-mq var(--mq, 20s) linear infinite; }
.w-mq.rev { animation-direction: reverse; }
[data-fx-loop="marquee"]:hover .w-mq { animation-play-state: paused; }
@keyframes w-mq { to { transform: translateX(-50%); } }
@keyframes w-float { 50% { --fx-ly: var(--amp); } }
@keyframes w-pulse { 50% { --fx-ls: var(--amp); } }
[data-fx-side] > * { flex-shrink: 0; }
.w-car-track { display: flex; width: 100%; height: 100%; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; border-radius: inherit; overscroll-behavior-x: contain; }
.w-car-track::-webkit-scrollbar { display: none; }
.w-car-track > * { flex: 0 0 100% !important; width: 100% !important; max-width: none !important; min-width: 0 !important; margin: 0 !important; scroll-snap-align: start; }
.w-car-btn { position: absolute; top: 50%; translate: 0 -50%; z-index: 3; width: 44px; height: 44px; border: 0; border-radius: 50%; background: rgba(255,255,255,.9); color: #222; font: 24px/1 system-ui, sans-serif; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
.w-car-btn:focus-visible, .w-car-dots button:focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }
.w-car-prev { left: 12px; } .w-car-next { right: 12px; }
.w-car-dots { position: absolute; left: 0; right: 0; bottom: 12px; z-index: 3; display: flex; justify-content: center; gap: 4px; }
.w-car-dots button { width: 24px; height: 24px; border: 0; padding: 0; background: none; cursor: pointer; display: grid; place-items: center; }
.w-car-dots button::before { content: ''; width: 9px; height: 9px; border-radius: 50%; background: rgba(0,0,0,.28); }
.w-car-dots button[aria-current="true"]::before { background: rgba(0,0,0,.75); }
.w-cmp-in { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: ew-resize; z-index: 3; touch-action: pan-y; }
.w-cmp-line { position: absolute; top: 0; bottom: 0; left: var(--cmp, 50%); width: 3px; margin-left: -1.5px; background: #fff; box-shadow: 0 0 6px rgba(0,0,0,.3); z-index: 2; pointer-events: none; }
.w-cmp-line::after { content: '⟷'; position: absolute; top: 50%; left: 50%; translate: -50% -50%; width: 40px; height: 40px; border-radius: 50%; background: #fff; display: grid; place-items: center; color: #333; font: 18px/1 system-ui, sans-serif; }
.w-cmp-in:focus-visible + .w-cmp-line::after { outline: 3px solid #2563eb; }
[data-lottie] svg { display: block; width: 100% !important; height: 100% !important; }
@media (prefers-reduced-motion: reduce) {
  .w-car-track { scroll-behavior: auto; }
  [data-fx-loop], [data-bg-move] { animation: none !important; }
  .w-mq { animation: none !important; }
  [data-fx-loop="marquee"] { overflow-x: auto !important; }
  .w-wd { opacity: 1 !important; translate: none !important; transition: none !important; }
  [data-fx-side] { overflow-x: auto !important; position: relative !important; top: auto !important; }
}`;

const MOTION_JS_BASE = `(function(){var R=matchMedia('(prefers-reduced-motion: reduce)').matches,D=document,Q=function(s){return [].slice.call(D.querySelectorAll(s))},cl=function(v,a,b){return Math.max(a,Math.min(b,v))},texts=function(el){var w=D.createTreeWalker(el,4),a=[];while(w.nextNode())a.push(w.currentNode);return a},ms=function(el,k,d){var v=parseFloat(getComputedStyle(el).getPropertyValue(k));return isNaN(v)?d:v},MA=ms(D.documentElement,'--ma',1),MF=ms(D.documentElement,'--mf',1);
Q('[data-reveal="words"]').forEach(function(el){var i=0;texts(el).forEach(function(t){var f=D.createDocumentFragment();t.nodeValue.split(/(\\s+)/).forEach(function(p){if(!p)return;if(/^\\s+$/.test(p)){f.appendChild(D.createTextNode(p));return}var s=D.createElement('span');s.className='w-wd';s.style.setProperty('--i',i++);s.textContent=p;f.appendChild(s)});t.parentNode.replaceChild(f,t)})});
var cnt=Q('[data-reveal="count"]').map(function(el){var items=texts(el).map(function(t){var s=t.nodeValue,m,re=/\\d[\\d.,]*\\d|\\d/g,l=[];while((m=re.exec(s)))l.push({i:m.index,str:m[0]});return {t:t,s:s,l:l}}).filter(function(x){return x.l.length});
function put(p){items.forEach(function(x){var out=x.s;for(var k=x.l.length-1;k>=0;k--){var it=x.l[k],str=it.str,v;var dm=/,(\\d{1,2})$/.exec(str);if(dm&&!/\\.\\d{3}$/.test(str)){var d=dm[1].length,n=parseFloat(str.replace(/\\./g,'').replace(',','.'));v=(n*p).toFixed(d).replace('.',',')}else{var g=/[.,]\\d{3}/.test(str),sep=g?str.match(/[.,]/)[0]:'',n2=parseInt(str.replace(/[.,]/g,''),10);v=String(Math.round(n2*p));if(g)v=v.replace(/\\B(?=(\\d{3})+(?!\\d))/g,sep)}out=out.slice(0,it.i)+v+out.slice(it.i+str.length)}x.t.nodeValue=out})}
return {el:el,put:put}});
if(!R&&cnt.length&&'IntersectionObserver' in window){cnt.forEach(function(c){c.put(0)});var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;io.unobserve(e.target);var c=cnt.filter(function(x){return x.el===e.target})[0],dur=ms(c.el,'--rd',1200)*MF,dl=ms(c.el,'--rdl',0),t0=0;setTimeout(function(){requestAnimationFrame(function st(t){if(!t0)t0=t;var p=cl((t-t0)/dur,0,1);c.put(1-Math.pow(1-p,3));if(p<1)requestAnimationFrame(st)})},dl)})},{threshold:.3});cnt.forEach(function(c){io.observe(c.el)})}
Q('.w-cmp-in').forEach(function(i){i.addEventListener('input',function(){i.parentElement.style.setProperty('--cmp',i.value+'%')})});
Q('[data-carousel]').forEach(function(c){var t=c.querySelector('.w-car-track');if(!t)return;var n=t.children.length,dots=c.querySelector('.w-car-dots'),auto=parseFloat(c.getAttribute('data-carousel'))||0,idx=function(){return Math.round(t.scrollLeft/Math.max(1,t.clientWidth))},go=function(i){i=(i+n)%n;t.scrollTo({left:i*t.clientWidth,behavior:R?'auto':'smooth'})};
if(dots){for(var k=0;k<n;k++)(function(k){var b=D.createElement('button');b.type='button';b.setAttribute('aria-label','Folie '+(k+1)+' von '+n);b.addEventListener('click',function(){go(k)});dots.appendChild(b)})(k)}
var mark=function(){var i=idx();if(dots)[].forEach.call(dots.children,function(b,k){b.setAttribute('aria-current',k===i?'true':'false')});[].forEach.call(t.children,function(s,k){s.setAttribute('aria-hidden',k===i?'false':'true')})};
t.addEventListener('scroll',function(){clearTimeout(t._m);t._m=setTimeout(mark,80)},{passive:true});mark();
var p=c.querySelector('.w-car-prev'),nx=c.querySelector('.w-car-next');if(p)p.addEventListener('click',function(){go(idx()-1)});if(nx)nx.addEventListener('click',function(){go(idx()+1)});
c.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'){go(idx()-1);e.preventDefault()}if(e.key==='ArrowRight'){go(idx()+1);e.preventDefault()}});
if(auto&&!R){var hold=false;c.addEventListener('mouseenter',function(){hold=true});c.addEventListener('mouseleave',function(){hold=false});c.addEventListener('focusin',function(){hold=true});c.addEventListener('focusout',function(){hold=false});setInterval(function(){if(!hold&&!D.hidden)go(idx()+1)},auto*1000)}});
if(R){Q('.w-bgv').forEach(function(v){v.removeAttribute('autoplay');v.pause()});return}
var sc=Q('[data-fx-scroll]'),sides=Q('.w-side'),vis=new Set(sc),q=false;
if('IntersectionObserver' in window){vis=new Set();var vo=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)vis.add(e.target);else vis.delete(e.target)})},{rootMargin:'25% 0px'});sc.forEach(function(e){vo.observe(e)})}
function size(){sides.forEach(function(w){var el=w.firstElementChild;if(!el)return;var ex=Math.max(0,el.scrollWidth-el.clientWidth);w._ex=ex;w.style.height=(el.offsetHeight+ex)+'px';el.style.top=Math.max(0,(innerHeight-el.offsetHeight)/2)+'px'})}
function frame(){q=false;var vh=innerHeight;vis.forEach(function(el){var k=el.getAttribute('data-fx-scroll'),a=(parseFloat(el.getAttribute('data-fx-amt'))||0)*(el.getAttribute('data-fx-scroll')==='grow'?1:MA),r=el.getBoundingClientRect(),c=r.top+r.height/2-(el._fy||0),t=(c-vh/2)/vh,st=el.style;
if(k==='depth'){var y=cl(t,-1.2,1.2)*vh*.4*a/100;el._fy=y;st.setProperty('--fx-y',y.toFixed(1)+'px')}
else if(k==='rotate')st.setProperty('--fx-r',(cl(t,-1,1)*a).toFixed(2)+'deg');
else{var g=cl(t/.45,0,1);if(k==='grow')st.setProperty('--fx-s',(1-(1-a/100)*g).toFixed(4));else{st.setProperty('--fx-o',(1-.85*g).toFixed(3));st.setProperty('--fx-b',(8*g).toFixed(2)+'px')}}});
sides.forEach(function(w){var el=w.firstElementChild,ex=w._ex||0;if(!el||!ex)return;var r=w.getBoundingClientRect(),off=parseFloat(el.style.top)||0;el.scrollLeft=cl((off-r.top)/ex,0,1)*ex})}
function req(){if(!q){q=true;requestAnimationFrame(frame)}}
if(sc.length||sides.length){size();frame();addEventListener('scroll',req,{passive:true});addEventListener('resize',function(){size();req()});addEventListener('load',function(){size();req()})}
if(!matchMedia('(hover: hover)').matches)return;
Q('[data-fx-mouse]').forEach(function(el){var k=el.getAttribute('data-fx-mouse'),a=(parseFloat(el.getAttribute('data-fx-mamt'))||0)*MA,st=el.style,set=function(x,y){st.setProperty('--fm-x',x.toFixed(1)+'px');st.setProperty('--fm-y',y.toFixed(1)+'px')};
if(k==='tilt'){el.addEventListener('pointermove',function(e){var r=el.getBoundingClientRect(),px=(e.clientX-r.left)/r.width-.5,py=(e.clientY-r.top)/r.height-.5;st.setProperty('--fx-ry',(px*a*2).toFixed(2)+'deg');st.setProperty('--fx-rx',(-py*a*2).toFixed(2)+'deg')});el.addEventListener('pointerleave',function(){st.setProperty('--fx-ry','0deg');st.setProperty('--fx-rx','0deg')})}
else if(k==='magnet'){var ox=0,oy=0;D.addEventListener('pointermove',function(e){var r=el.getBoundingClientRect(),cx=r.left+r.width/2-ox,cy=r.top+r.height/2-oy,dx=e.clientX-cx,dy=e.clientY-cy,near=Math.abs(dx)<r.width/2+60&&Math.abs(dy)<r.height/2+60;ox=near?dx*a/100:0;oy=near?dy*a/100:0;set(ox,oy)},{passive:true})}
else{var p=el.parentElement||D.body;p.addEventListener('pointermove',function(e){var r=p.getBoundingClientRect();set((e.clientX-r.left-r.width/2)*a/100,(e.clientY-r.top-r.height/2)*a/100)});p.addEventListener('pointerleave',function(){set(0,0)})}})})();`;

/** Startet die fertigen Animationen (braucht den Lottie-Abspieler) */
export const LOTTIE_JS = `(function(){if(!window.lottie)return;var R=matchMedia('(prefers-reduced-motion: reduce)').matches;document.querySelectorAll('[data-lottie]').forEach(function(el){var s=el.querySelector('script[type="application/json"]');if(!s)return;var o=el.getAttribute('data-lottie').split(' '),loop=o[0]==='loop',play=o[1],data=JSON.parse(s.textContent);s.remove();var a=lottie.loadAnimation({container:el,renderer:'svg',loop:loop&&!R,autoplay:false,animationData:data});
if(R){a.addEventListener('DOMLoaded',function(){a.goToAndStop(a.totalFrames-1,true)});return}
if(play==='auto')a.play();else if(play==='hover'){el.addEventListener('mouseenter',function(){a.setDirection(1);a.play()});el.addEventListener('mouseleave',function(){if(loop)a.pause();else{a.setDirection(-1);a.play()}})}else if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)a.play();else if(loop)a.pause()})},{threshold:.3});io.observe(el)}else a.play()})})();`;

/** Für die ganze Website: Seitenwechsel und Bewegungs-Stil */
export function siteFxCss(site: WDocument['site']): string {
  const out: string[] = [];
  const ms = site?.motionStyle;
  if (ms === 'calm') out.push(':root { --mf: 1.4; --ma: .55; }');
  if (ms === 'lively') out.push(':root { --mf: .8; --ma: 1.5; }');
  const t = site?.pageTransition;
  if (t && t !== 'none') {
    out.push('@view-transition { navigation: auto; }', 'header { view-transition-name: w-head; }',
      '::view-transition-old(root), ::view-transition-new(root) { animation-duration: .45s; }');
    if (t === 'slide') out.push(
      '::view-transition-old(root) { animation: .45s cubic-bezier(.4,0,.2,1) both w-vt-out; }',
      '::view-transition-new(root) { animation: .45s cubic-bezier(.4,0,.2,1) both w-vt-in; }',
      '@keyframes w-vt-out { to { opacity: 0; translate: -60px 0; } }',
      '@keyframes w-vt-in { from { opacity: 0; translate: 60px 0; } }');
    out.push('@media (prefers-reduced-motion: reduce) { @view-transition { navigation: none; } }');
  }
  return out.join('\n');
}

/** Transformation für Bewegungen – wird an eine vorhandene Drehung angehängt */
export const FX_TRANSFORM = 'perspective(900px) translate3d(calc(var(--fx-x) + var(--fm-x)), calc(var(--fx-y) + var(--fm-y) + var(--fx-ly)), 0) rotate(var(--fx-r)) scale(calc(var(--fx-s) * var(--fx-ls))) rotateX(var(--fx-rx)) rotateY(var(--fx-ry))';
const FX_SCROLL = new Set(['depth', 'rotate', 'grow', 'focus']);
/** Braucht das Element die Bewegungs-Transformation? */
export const hasFxTransform = (n: WNode) => !!((n.motion?.scroll && FX_SCROLL.has(n.motion.scroll.kind)) || n.motion?.mouse || (n.motion?.loop && n.motion.loop.kind !== 'marquee'));
/** Erscheinen tatsächlich: „Nacheinander“ am Eltern-Element überträgt sich auf die Kinder */
export function revealOf(n: WNode, parent: WNode | undefined) {
  const pr = parent?.reveal;
  if (pr?.stagger && !n.absolute && !n.pin) {
    const i = parent!.children.indexOf(n.id);
    return { type: pr.type, duration: pr.duration, delay: pr.delay + Math.max(0, i) * pr.stagger };
  }
  if (n.reveal?.stagger) return null;
  return n.reveal ?? null;
}

/** Setzt html.w-scrolled ab einer Scroll-Position; der Puffer verhindert Flackern, wenn die Kopfzeile dabei kleiner wird */
export const scrollJs = (sc: { at: number; hyst: number }) => `(function(){var r=document.documentElement,on=false,q=false,t=${Math.round(sc.at)},off=${Math.max(0, Math.round(sc.at - Math.max(sc.hyst, 20)))};function u(){q=false;var y=window.pageYOffset;if(!on&&y>t){on=true;r.classList.add('w-scrolled')}else if(on&&y<=off){on=false;r.classList.remove('w-scrolled')}}window.addEventListener('scroll',function(){if(!q){q=true;requestAnimationFrame(u)}},{passive:true});u()})();`;

export const NAV_CSS = `.nav-toggle { display: none; position: relative; z-index: 1001; flex-shrink: 0; width: 44px; height: 44px; margin: -8px; padding: 10px; border: 0; background: none; cursor: pointer; flex-direction: column; justify-content: center; align-items: center; gap: 5px; }
.nav-toggle span { display: block; width: 24px; height: 2px; border-radius: 2px; background: currentColor; transition: transform .25s ease, opacity .2s ease; }
.nav-open .nav-toggle span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
.nav-open .nav-toggle span:nth-child(2) { opacity: 0; }
.nav-open .nav-toggle span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
body.nav-open { overflow: hidden; }
@keyframes nav-drop { from { opacity: 0; transform: translateY(-8px); } }
@media (prefers-reduced-motion: reduce) { .nav-toggle span { transition: none; } [data-nav-links] { animation: none !important; } }`;

export const NAV_JS = `(function(){document.querySelectorAll('.nav-toggle').forEach(function(b){var m=document.getElementById(b.getAttribute('aria-controls'));function set(o){if(o&&m){var h=b.closest('header')||b.parentElement;m.style.setProperty('--nav-top',Math.max(0,h.getBoundingClientRect().bottom)+'px')}document.body.classList.toggle('nav-open',o);b.setAttribute('aria-expanded',o?'true':'false');b.setAttribute('aria-label',o?'Menü schließen':'Menü öffnen')}b.addEventListener('click',function(){set(!document.body.classList.contains('nav-open'))});if(m)m.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('a'))set(false)});document.addEventListener('click',function(e){if(document.body.classList.contains('nav-open')&&m&&!m.contains(e.target)&&!b.contains(e.target))set(false)});document.addEventListener('keydown',function(e){if(e.key==='Escape')set(false)});window.addEventListener('resize',function(){if(getComputedStyle(b).display==='none')set(false)})})})();`;

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

export interface PageParts { body: string; css: string; fonts: FontUse[]; background: string; empty: boolean; nav?: boolean; form?: boolean; embed?: boolean; motion?: boolean; lottie?: boolean;
  /** Umschalten nach dem Scrollen: ab welcher Position, mit wie viel Puffer beim Zurückscrollen */
  scroll?: { at: number; hyst: number } }

/** HTML-Körper und CSS einer Seite */
/** Farben mit Dunkel-Variante (nur wenn der Dunkel-Modus eingeschaltet ist) */
const darkPaintIds = (doc: WDocument) => (doc.site?.darkMode === 'auto' ? new Set(doc.library.colors.filter(c => c.dark).map(c => c.id)) : null);

/** Farb-Variablen für hell und dunkel */
export function darkModeCss(doc: WDocument): string {
  const ids = darkPaintIds(doc);
  if (!ids?.size) return '';
  const cs = doc.library.colors.filter(c => c.dark);
  return `:root{color-scheme:light dark;${cs.map(c => `--wc-${c.id}:${rgba(c.color, c.opacity)}`).join(';')}}\n@media (prefers-color-scheme: dark){:root{${cs.map(c => `--wc-${c.id}:${rgba(c.dark!.color, c.dark!.opacity)}`).join(';')}}}`;
}

export function renderPageParts(ctx: PageCtx): PageParts {
  setDarkPaints(darkPaintIds(ctx.doc));
  try { return renderPagePartsInner(ctx); } finally { setDarkPaints(null); }
}

function renderPagePartsInner(ctx: PageCtx): PageParts {
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
  /** Eltern einer Ebene bis unter das Webseiten-Board */
  const ancestorsOf = (id: string): string[] => {
    const out: string[] = [];
    for (let a = page.nodes[page.nodes[id]?.parentId ?? '']; a && a.id !== root.id; a = page.nodes[a.parentId ?? '']) out.push(a.id);
    return out;
  };
  const fonts: FontUse[] = [];
  const addFont = (ts: WNode['textStyle']) => { if (ts) fonts.push({ family: ts.fontFamily, weight: ts.fontWeight, italic: ts.italic }); };

  // Inhaltsbreite: In breiten Fenstern bleibt der Inhalt mittig, Flächen laufen bis zum Rand.
  // „Bänder“ sind das Webseiten-Board und alle Boards darin, die (im Layout) die volle Breite füllen.
  const cw = root.contentWidth && root.contentWidth > 0 ? Math.round(root.contentWidth) : 0;
  // Vorfahren von „Stapeln“/„Seitwärts“: dürfen nicht abschneiden (sonst klebt nichts)
  const stickyAnc = new Set<string>();
  for (const x of Object.values(page.nodes)) {
    const k = x.motion?.scroll?.kind;
    if (k !== 'stack' && k !== 'sideways') continue;
    for (let a = x.parentId ? page.nodes[x.parentId] : undefined; a; a = a.parentId ? page.nodes[a.parentId] : undefined) stickyAnc.add(a.id);
  }
  let hasMotion = false;
  let hasLottie = false;
  const bands = new Map<string, number>(); // Band → verfügbare Inhaltsbreite in seinem Eltern-Element
  const bandParents = new Set<string>();
  const padX = (b: WNode) => { const L = resolveNode(b, 'desktop').layout; return L ? L.padding[1] + L.padding[3] : 0; };
  if (cw) {
    const walk = (b: WNode, avail: number) => {
      bands.set(b.id, avail);
      const rb = resolveNode(b, 'desktop');
      const L = rb.layout;
      if (!L || L.type !== 'flex') return;
      const flow = b.children.map(id => page.nodes[id]).filter(c => c && !c.absolute && !(c.pin?.mode === 'fixed' && resolveNode(c, 'desktop').w < rb.w - 1));
      // Volle Breite: untereinander und füllend, oder einziges füllendes Element in einer Reihe
      if (L.direction === 'row' && flow.length !== 1) return;
      for (const ch of flow) {
        if (ch.type !== 'board' || effectiveSizing(resolveNode(ch, 'desktop'), true).h !== 'fill') continue;
        bandParents.add(b.id);
        walk(ch, avail - padX(b));
      }
    };
    walk(root, cw);
  }
  // Vollbild: Bereich so hoch wie das Fenster (svh = ohne die ein-/ausfahrende Browserleiste auf dem Handy)
  const fullscreenCss = (n: WNode, parent: WNode | undefined, c: Css): Css => {
    const fs = n.fullscreen;
    if (fs && n.id !== root.id) {
      const off = Math.max(0, Math.round(fs.offset || 0));
      delete c.height;
      c['min-height'] = off ? `calc(100svh - ${off}px)` : '100svh';
      if (fs.stay && c.position === 'relative' && parent?.layout?.type === 'flex' && parent.layout.direction === 'column') {
        c.position = 'sticky'; c.top = `${off}px`; c['z-index'] = '0';
      }
    }
    // Was nach einem stehenden Vollbild-Bereich kommt, schiebt sich darüber
    if (parent && !fs?.stay && c.position === 'relative' && c['z-index'] === undefined) {
      const sib = parent.children.map(id => page.nodes[id]);
      const i = sib.findIndex(x => x?.id === n.id);
      if (sib.slice(0, i).some(x => x?.fullscreen?.stay)) c['z-index'] = '1';
    }
    return c;
  };

  // Anteil des freien Platzes, der links liegt: links 0, mittig ½, rechts 1
  const share = root.contentAlign === 'left' ? 0 : root.contentAlign === 'right' ? 1 : 0.5;
  /** Freier Platz neben dem Inhalt (links bzw. rechts), wenn der Behälter breiter ist als w */
  const freeSide = (w: number, side: 'l' | 'r'): string | null => {
    const f = side === 'l' ? share : 1 - share;
    if (!f) return null;
    const free = `max(0px, 100% - ${Math.max(0, w)}px)`;
    return f === 1 ? free : `(${free} * ${f})`;
  };
  const plus = (base: string, extra: string | null) => (extra ? `calc(${base} + ${extra})` : base);

  const cssFor = (n: WNode, bp: Breakpoint, parent: WNode | undefined): Css => {
    const c = fullscreenCss(n, parent, cssForBase(n, bp, parent));
    if (!cw) return c;
    const pAvail = parent ? bands.get(parent.id) : undefined;
    // Frei platzierte Ebenen in einem Band rücken um den freien Rand
    if (pAvail !== undefined && c.position === 'absolute' && c.left !== undefined) c.left = plus(c.left, freeSide(pAvail, 'l'));
    // Feste oder füllende Bereiche untereinander zwischen Bändern: im Inhaltsbereich ausrichten
    if (parent && pAvail !== undefined && bandParents.has(parent.id) && !bands.has(n.id) && c.position !== 'absolute' && c.position !== 'fixed') {
      const PL = resolveNode(parent, bp).layout;
      if (PL?.type === 'flex' && PL.direction === 'column') {
        const w = pAvail - padX(parent);
        c['margin-left'] = plus('0px', freeSide(w, 'l'));
        c['margin-right'] = plus('0px', freeSide(w, 'r'));
      }
    }
    // Band mit Layout (ohne weitere Bänder darin): Innenabstand links/rechts wächst mit dem Fenster
    const avail = bands.get(n.id);
    if (avail !== undefined && !bandParents.has(n.id)) {
      const L = resolveNode(n, bp).layout;
      if (L) {
        const [, r, , l] = L.padding;
        c['padding-left'] = plus(`${l}px`, freeSide(avail, 'l'));
        c['padding-right'] = plus(`${r}px`, freeSide(avail, 'r'));
      }
    }
    return c;
  };

  const cssForBase = (n: WNode, bp: Breakpoint, parent: WNode | undefined): Css => {
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
    // Bewegung
    const mo = n.motion;
    const pm = parent?.motion;
    const inFlowChild = !!pl && !n.absolute && !n.pin;
    if (hasFxTransform(n)) c.transform = c.transform ? `${c.transform} ${FX_TRANSFORM}` : FX_TRANSFORM;
    if (mo?.scroll?.kind === 'focus') {
      c.opacity = c.opacity ? `calc(${c.opacity} * var(--fx-o))` : 'var(--fx-o)';
      c.filter = c.filter ? `${c.filter} blur(var(--fx-b))` : 'blur(var(--fx-b))';
    }
    if (mo?.loop && mo.loop.kind !== 'marquee') {
      const a = `w-${mo.loop.kind} ${mo.loop.speed}s ease-in-out infinite`;
      c.animation = c.animation ? `${c.animation}, ${a}` : a;
      c['--amp'] = mo.loop.kind === 'float' ? `${-Math.abs(mo.loop.amount)}px` : String(1 + mo.loop.amount / 100);
    }
    if (mo?.loop?.kind === 'marquee') {
      c.overflow = 'hidden'; c['flex-wrap'] = 'nowrap';
      c['--mq'] = `${mo.loop.speed}s`; c['--mq-gap'] = px(rn.layout?.gap ?? 0);
    }
    if (pm?.loop?.kind === 'marquee' && inFlowChild) {
      c.flex = 'none';
      if (rn.sizingH === 'fill') c.width = px(rn.w);
    }
    if (pm?.scroll?.kind === 'stack' && inFlowChild) { c.position = 'sticky'; c.top = '0'; }
    if (mo?.scroll?.kind === 'sideways') {
      c.position = 'sticky'; c.top = '0'; c.overflow = 'hidden'; c['flex-wrap'] = 'nowrap';
      if (c.width === undefined || c.width === 'auto') c.width = '100%';
    }
    if (stickyAnc.has(n.id) && c.overflow === 'hidden') c.overflow = 'clip';
    if (revealOf(n, parent) && c.opacity) { c['--op'] = c.opacity; delete c.opacity; }
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
      c['z-index'] = isHeader(n) ? '50' : '60';
    }
    return c;
  };

  /** Zu welcher Animation gehört die Ebene, und wie lange dauert sie? */
  const animOwner = (n: WNode, parent: WNode | undefined) => {
    let owner: WNode | undefined = parent;
    while (owner && !owner.animation) owner = page.nodes[owner.parentId ?? ''];
    return { owner, dur: Math.round((owner ? subtreeDuration(page, owner.id) : subtreeDuration(page, n.id)) * 1000) / 1000 };
  };
  /** Form-Umwandlung (Vieleck ↔ Stern …) als SVG-Animation, die zusammen mit der übrigen Animation startet */
  const morphSvg = (n: WNode, parent: WNode | undefined): string => {
    const svg = vectorSvg(n);
    const keys = n.anim?.shape;
    if (!keys || keys.length < 2) return svg;
    const { owner, dur } = animOwner(n, parent);
    const ts = sampleTimes(n, dur, ['shape']);
    let vals = ts.map(tt => morphPath(String(valueAt(keys, tt))));
    let kt = ts.map(tt => Math.round((tt / dur) * 10000) / 10000);
    const rep = owner?.animation?.repeat ?? 'once';
    let d = dur;
    if (rep === 'alternate') {
      vals = [...vals, ...vals.slice(0, -1).reverse()];
      kt = [...kt.map(k => k / 2), ...kt.slice(0, -1).reverse().map(k => 1 - k / 2)].map(k => Math.round(k * 10000) / 10000);
      d = dur * 2;
    }
    hasMotion = true;
    const anim = `<animate class="wa-smil" attributeName="d" values="${vals.join(';')}" keyTimes="${kt.join(';')}" dur="${d}s" begin="indefinite" fill="freeze" calcMode="linear" repeatCount="${rep === 'once' ? 1 : 'indefinite'}" data-end="${vals[rep === 'alternate' ? 0 : vals.length - 1]}"/>`;
    return svg.replace(/<path d="[^"]*"( vector-effect="non-scaling-stroke")\/>/, `<path d="${vals[0]}"$1>${anim}</path>`);
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
    const rv = revealOf(n, parent);
    const bgMove = n.fills.some(f => f.visible && f.move && f.gradient);
    const vf = videoFillOf(n);
    if (bgMove || vf || n.carousel || n.compare) hasMotion = true;
    if (n.lottie) hasLottie = true;
    if (n.motion || rv?.type === 'words' || rv?.type === 'count' || n.reveal?.stagger) hasMotion = true;
    // Bewegung beim Scrollen folgt sofort (kein Nachziehen durch andere Übergänge)
    if (n.motion?.scroll && trans.length) trans.push('transform 0s', 'filter 0s', '--fx-y 0s', '--fx-r 0s', '--fx-s 0s', '--fx-o 0s', '--fx-b 0s');
    if (n.motion?.mouse) trans.push(...['--fx-rx', '--fx-ry', '--fm-x', '--fm-y'].map(k => `${k} ${n.motion!.mouse!.kind === 'follow' ? 900 : 350}ms cubic-bezier(.2,.7,.2,1)`));
    if (rv) {
      d['--rd'] = `${rv.duration}ms`;
      d['--rdl'] = `${rv.delay}ms`;
      if (rv.type !== 'words' && rv.type !== 'count') trans.push('opacity calc(var(--rd) * var(--mf, 1)) ease var(--rdl)', 'translate calc(var(--rd) * var(--mf, 1)) cubic-bezier(.2,.7,.2,1) var(--rdl)', 'scale calc(var(--rd) * var(--mf, 1)) cubic-bezier(.2,.7,.2,1) var(--rdl)');
    }
    if (trans.length) d.transition = trans.join(', ');
    if (rv && (rv.type === 'words' || rv.type === 'count') && !trans.length) delete d.transition;

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
      if (h.transform && hasFxTransform(n)) h.transform = `${h.transform} ${FX_TRANSFORM}`;
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
    if (rv) attrs.push(`data-reveal="${rv.type}"`);
    const mo = n.motion;
    if (mo?.scroll && FX_SCROLL.has(mo.scroll.kind)) attrs.push(`data-fx-scroll="${mo.scroll.kind}"`, `data-fx-amt="${mo.scroll.amount}"`);
    if (mo?.scroll?.kind === 'sideways') attrs.push('data-fx-side');
    if (mo?.mouse) attrs.push(`data-fx-mouse="${mo.mouse.kind}"`, `data-fx-mamt="${mo.mouse.amount}"`);
    if (mo?.loop) attrs.push(`data-fx-loop="${mo.loop.kind}"`);
    if (bgMove) attrs.push('data-bg-move');
    if (n.carousel) attrs.push(`data-carousel="${n.carousel.auto ?? 0}"`, 'role="region"', 'aria-roledescription="Karussell"', `aria-label="${esc(n.name)}"`, 'tabindex="0"');
    // Eigene Animation: Schlüsselbilder als CSS-Animation
    if (n.animation) { attrs.push(`data-anim="${n.animation.play}"`); hasMotion = true; }
    if (isAnimated(n)) {
      const { owner, dur } = animOwner(n, parent);
      const rn = resolveNode(n, 'desktop');
      const pl = parent ? resolveNode(parent, 'desktop').layout : null;
      const baseCss = nodeCss(rn, pl);
      const frames = sampleTimes(n, dur).map(tt => ({ tt, c: nodeCss(withAnim(rn, tt), pl) }));
      const keys = new Set<string>();
      for (const f of frames) for (const k of Object.keys(diff(baseCss, f.c))) if (k !== 'transition') keys.add(k);
      if (keys.size) {
        const name = `wa-${cls}`;
        const kf = frames.map(f => {
          const c: Css = {};
          for (const k of keys) c[k] = f.c[k] ?? 'unset';
          return block(`${Math.round((f.tt / dur) * 100000) / 1000}%`, c, false);
        }).join('');
        base.push(`@keyframes ${name}{${kf}}`);
        const rep = owner?.animation?.repeat ?? 'once';
        const iter = rep === 'once' ? '1' : rep === 'loop' ? 'infinite' : 'infinite alternate';
        base.push(block(sel, { animation: `${name} ${dur}s linear ${iter} both` }, pretty));
        attrs.push('data-wa');
        hasMotion = true;
      }
    }
    if (n.lottie) attrs.push(`data-lottie="${n.lottie.loop ? 'loop' : 'once'} ${n.lottie.play}"`, 'role="img"', `aria-label="${esc(n.name)}"`);
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
          'line-height': String(ts.lineHeight), ...(f ? { color: paintCss(f) } : {}),
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
    // Bedeutung für Suchmaschinen und Screenreader: Kopfzeile, Menü, Fußzeile
    if (tag === 'div' && n.type === 'board' && n.id !== root.id) {
      if (n.navLinks && navOwnerOf(n.id)) tag = 'nav';
      else if (isHeader(n)) tag = 'header';
      else if (isFooter(n)) tag = 'footer';
    }

    const pad = pretty ? '\n' + '  '.repeat(depth) : '';
    if (n.type === 'image') {
      const src = esc(ctx.imageSrc(n));
      const fit = n.objectFit ?? 'cover';
      // Noch kein Bild gewählt: nur die Fläche (kein kaputtes Bild-Symbol)
      if (!src) return `${pad}<div ${attrs.join(' ')} role="img" aria-label="${esc(n.name)}"></div>`;
      if (tag === 'img') return `${pad}<img ${attrs.join(' ')} src="${src}" alt="${esc(n.name)}" style="object-fit:${fit}" loading="lazy">`;
      return `${pad}<a ${attrs.join(' ')}><img src="${src}" alt="${esc(n.name)}" style="width:100%;height:100%;object-fit:${fit}" loading="lazy"></a>`;
    }
    if (n.type === 'text') {
      // Überschrift/Absatz: eigene HTML-Art; als Link steckt die Überschrift im Link
      const tt = textTagOf(doc, n);
      if (tag === 'div' && tt && tt !== 'div') tag = tt;
      else if (tag === 'a' && tt && tt !== 'div' && tt !== 'p') return `${pad}<a ${attrs.join(' ')}><${tt} class="wh">${esc(n.text ?? '')}</${tt}></a>`;
      return `${pad}<${tag} ${attrs.join(' ')}>${esc(n.text ?? '')}</${tag}>`;
    }
    if (n.type === 'vector') {
      // Icon ohne Text als Link: Ebenenname als Beschriftung für Screenreader
      if (tag === 'a') attrs.push(`aria-label="${esc(n.name)}"`);
      return `${pad}<${tag} ${attrs.join(' ')}>${morphSvg(n, parent)}</${tag}>`;
    }
    const owner = n.navLinks ? navOwnerOf(n.id) : undefined;
    const nav = owner?.nav;
    if (nav && nav.collapse !== 'never') {
      if (!anchors.has(n.id)) attrs.push(`id="${cls}"`);
      attrs.push('data-nav-links');
    }
    let kids = n.children.map(c => el(c, n, myLink, depth + 1)).join('');
    // Eingebaute Animation: Inhalt in Originalgröße, als Ganzes passend skaliert (je Gerät)
    const design = isAnimInstance(n) ? animDesignSize(doc, n) : null;
    if (design && kids) {
      const scls = `${cls}-s`;
      const kOf = (bp: Breakpoint) => Math.round((resolveNode(n, bp).w / Math.max(1, design.w)) * 10000) / 10000;
      base.push(block(`${pre}.${scls}`, { position: 'absolute', left: '0', top: '0', width: px(design.w), height: px(design.h), 'transform-origin': '0 0', transform: `scale(${kOf('desktop')})` }, pretty));
      if (kOf('tablet') !== kOf('desktop')) media.tablet.push(block(`${pre}.${scls}`, { transform: `scale(${kOf('tablet')})` }, pretty, '  '));
      if (kOf('mobile') !== kOf('tablet')) media.mobile.push(block(`${pre}.${scls}`, { transform: `scale(${kOf('mobile')})` }, pretty, '  '));
      kids = `<div class="${scls}">${kids}</div>`;
    }
    // Video als Hintergrund: läuft stumm und endlos hinter dem Inhalt
    const vsrc = vf?.videoRef ? (ctx.asset ? ctx.asset('video', vf.videoRef) : doc.library.videos.find(x => x.id === vf.videoRef)?.src ?? '') : '';
    if (n.carousel && kids) {
      const C = n.carousel;
      kids = `<div class="w-car-track">${kids}</div>`
        + (C.arrows && n.children.length > 1 ? '<button type="button" class="w-car-btn w-car-prev" aria-label="Vorherige Folie">‹</button><button type="button" class="w-car-btn w-car-next" aria-label="Nächste Folie">›</button>' : '')
        + (C.dots && n.children.length > 1 ? '<div class="w-car-dots"></div>' : '');
    }
    if (n.compare) kids += `<input type="range" class="w-cmp-in" min="0" max="100" value="${n.compare.pos}" aria-label="Vorher und Nachher vergleichen"><div class="w-cmp-line" aria-hidden="true"></div>`;
    if (n.lottie) {
      const a = doc.library.animations?.find(x => x.id === n.lottie!.ref);
      if (a) kids += `<script type="application/json">${a.data.replace(/</g, '\\u003c')}</script>`;
    }
    if (vsrc) kids = `<video class="w-bgv" src="${esc(vsrc)}" autoplay muted loop playsinline preload="auto" aria-hidden="true"></video>${kids}`;
    if (mo?.loop?.kind === 'marquee' && kids) {
      // Endlos: Inhalt zweimal hintereinander, die Kopie ist für Vorlese-Programme unsichtbar
      const twin = kids.replace(/ id="[^"]*"/g, '');
      kids = `<div class="w-mq${mo.loop.reverse ? ' rev' : ''}">${kids}<div style="display:contents" aria-hidden="true" inert>${twin}</div></div>`;
    }
    let out = `${pad}<${tag} ${attrs.join(' ')}>${kids}${kids && pretty ? pad : ''}</${tag}>`;
    if (mo?.scroll?.kind === 'sideways') out = `${pad}<div class="w-side">${out}</div>`;
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
        // Geöffnet: die Kopfzeile (samt Eltern) nach ganz vorn – vor fixierte Störer & Co.
        ...ancestorsOf(n.id).map(a => block(ctx.scope ? `body.nav-open${ctx.scope} .${ctx.cls(a)}` : `body.nav-open .${ctx.cls(a)}`, { 'z-index': '1000' }, pretty, ind)),
        ...(nav.open === 'drop' ? [
          // Klappt unter der Kopfzeile herunter (Oberkante setzt das Skript beim Öffnen)
          block(open, {
            display: 'flex', position: 'fixed', top: 'var(--nav-top, 64px)', left: '0', right: '0', bottom: 'auto', 'z-index': '1000',
            'flex-direction': 'column', 'flex-wrap': 'nowrap', 'align-items': 'stretch', 'justify-content': 'flex-start', gap: '0',
            padding: '8px 24px 16px', width: 'auto', height: 'auto', 'max-width': 'none', 'max-height': 'calc(100vh - var(--nav-top, 64px))',
            margin: '0', background: nav.overlayBg, 'overflow-y': 'auto', transform: 'none', 'box-shadow': '0 12px 24px rgba(0,0,0,.12)',
            animation: 'nav-drop .2s ease',
          }, pretty, ind),
          block(`${open} > *`, { position: 'relative', left: 'auto', top: 'auto', transform: 'none', width: 'auto', 'font-size': '18px', padding: '12px 0', color: nav.overlayText }, pretty, ind),
        ] : [
          block(open, {
            display: 'flex', position: 'fixed', inset: '0', 'z-index': '1000', 'flex-direction': 'column', 'flex-wrap': 'nowrap',
            'align-items': 'center', 'justify-content': 'center', gap: '28px', padding: '96px 24px', width: 'auto', height: 'auto',
            'max-width': 'none', margin: '0', background: nav.overlayBg, 'overflow-y': 'auto', transform: 'none',
          }, pretty, ind),
          block(`${open} > *`, { position: 'relative', left: 'auto', top: 'auto', transform: 'none', 'font-size': '28px', color: nav.overlayText }, pretty, ind),
        ]),
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
  return { body, css, fonts, background: bg ? paintCss(bg) : '#fff', empty: false, nav: navRules.length > 0, form: hasForm, embed: hasEmbed, scroll, motion: hasMotion, lottie: hasLottie };
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
${parts.motion ? MOTION_CSS : ''}
${siteFxCss(doc.site)}
${darkModeCss(doc)}
body{background:${parts.background}${doc.site?.baseFont ? `;font-size:${doc.site.baseFont}px` : ''}}
${parts.css}
${doc.site?.css ?? ''}
</style>
${doc.site?.headCode ?? ''}
</head>
<body>
${parts.body}
<script>${REVEAL_JS}${parts.scroll ? scrollJs(parts.scroll) : ''}${parts.nav ? NAV_JS : ''}${parts.form ? FORM_JS : ''}${parts.embed ? EMBED_JS : ''}${parts.motion ? MOTION_JS : ''}</script>${parts.lottie ? `\n<script>${LOTTIE_PLAYER}</script>\n<script>${LOTTIE_JS}</script>` : ''}
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

// ---------- Eigene Animationen (Animations-Editor) ----------
const ANIM_CSS = `[data-anim]:not(.wa-on) [data-wa]{animation-play-state:paused}
[data-anim].wa-off [data-wa]{animation:none!important}
@media (prefers-reduced-motion: reduce){[data-wa]{animation-duration:1ms!important;animation-iteration-count:1!important;animation-direction:normal!important}}`;
const ANIM_JS = `(function(){var D=document,R=matchMedia('(prefers-reduced-motion: reduce)').matches,each=function(el,f){[].forEach.call(el.querySelectorAll('.wa-smil'),f)},smil=function(el){each(el,function(a){if(R){a.parentNode.setAttribute('d',a.getAttribute('data-end'));return}try{a.beginElement()}catch(e){}})};[].forEach.call(D.querySelectorAll('[data-anim]'),function(el){var m=el.getAttribute('data-anim'),on=function(){el.classList.add('wa-on');smil(el)},go=function(){el.classList.add('wa-off');void el.offsetWidth;el.classList.remove('wa-off');on()};if(R||m==='auto'||!('IntersectionObserver' in window)&&m==='view'){on();return}if(m==='view'){var io=new IntersectionObserver(function(e){e.forEach(function(x){if(x.isIntersecting){on();io.disconnect()}})},{threshold:.3});io.observe(el);return}if(m==='hover'){el.addEventListener('mouseenter',go);el.addEventListener('focusin',go);return}if(m==='click'){el.style.cursor='pointer';el.addEventListener('click',go)}})})();`;
export const MOTION_CSS = MOTION_CSS_BASE + '\n' + ANIM_CSS;
export const MOTION_JS = MOTION_JS_BASE + '\n' + ANIM_JS;
