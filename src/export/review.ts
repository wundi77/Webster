// „Zum Ansehen weitergeben“: eine einzige HTML-Datei mit allen Seiten, die man per E-Mail verschicken kann.
// Wer sie öffnet, kann Stellen anklicken und Kommentare schreiben und schickt am Ende eine kleine Kommentar-Datei zurück.
// Läuft ohne Server direkt aus der Datei (file://); nichts wird irgendwohin übertragen.
import type { WDocument } from '../model/types';
import { renderPreviewPage, esc } from './html';
import { mainLang, secondLang, translatePage } from '../model/i18n';
import { slug } from '../model/css';

export const REVIEW_KIND = 'webster-kommentare';

/** Kurzname für Dateien („mein-cafe“) */
export const reviewSlug = (doc: WDocument) => slug(doc.name || 'website') || 'website';

export function buildReviewHtml(doc: WDocument, lang: string | null): string {
  const l2 = secondLang(doc);
  const inL2 = !!lang && lang === l2;
  const pages = doc.pages.map(p0 => {
    const p = inL2 ? translatePage(p0, l2!, mainLang(doc)) : p0;
    // Videos aus der Bibliothek liegen nur im Editor (blob:) – in der Datei bleibt das Vorschaubild
    const html = renderPreviewPage(doc, p0.id, id => ({ href: '#', attrs: `data-page="${id}"` }), inL2 ? l2 : null)
      .replace(/\s(src|href)="blob:[^"]*"/g, '');
    const nodes: Record<string, string> = {};
    for (const id in p.nodes) nodes[id] = p.nodes[id].name;
    return { id: p0.id, name: p.name, html, nodes };
  });
  const data = { kind: REVIEW_KIND, name: doc.name || 'Website', slug: reviewSlug(doc), lang: inL2 ? l2 : mainLang(doc), pages, created: new Date().toISOString() };
  // </script> in Texten darf das Skript nicht beenden
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.name || 'Website')} – zum Ansehen</title>
<style>${SHELL_CSS}</style>
</head>
<body>
<iframe id="wr-frame" title="Website"></iframe>
<div id="wr-intro" class="wr-card wr-intro" hidden>
  <h1>${esc(doc.name || 'Website')} – zum Ansehen</h1>
  <p>Du kannst dich ganz normal durch die Seiten klicken.</p>
  <ol>
    <li>Unten auf <b>Kommentieren</b> schalten.</li>
    <li>Auf die Stelle klicken, zu der du etwas sagen möchtest, und den Kommentar schreiben.</li>
    <li>Zum Schluss <b>Kommentare speichern</b> und die gespeicherte Datei zurückschicken.</li>
  </ol>
  <button type="button" class="wr-btn wr-primary" id="wr-intro-ok">Los geht's</button>
</div>
<div id="wr-bar" class="wr-bar" role="toolbar" aria-label="Ansehen und kommentieren">
  <div class="wr-seg" role="radiogroup" aria-label="Modus">
    <button type="button" role="radio" data-mode="view" aria-checked="true" class="on">Ansehen</button>
    <button type="button" role="radio" data-mode="comment" aria-checked="false">Kommentieren</button>
  </div>
  <select id="wr-page" aria-label="Seite"></select>
  <button type="button" class="wr-btn" id="wr-list-btn" aria-expanded="false">Kommentare <span id="wr-count">0</span></button>
  <button type="button" class="wr-btn wr-primary" id="wr-save">Kommentare speichern</button>
</div>
<div id="wr-hint" class="wr-hint" hidden>Klicke auf die Stelle, die du kommentieren möchtest.</div>
<aside id="wr-list" class="wr-card wr-list" hidden aria-label="Alle Kommentare"></aside>
<form id="wr-compose" class="wr-card wr-compose" hidden>
  <label class="wr-lbl" for="wr-name">Dein Name</label>
  <input id="wr-name" autocomplete="name" maxlength="80" placeholder="z. B. Anna">
  <label class="wr-lbl" for="wr-text">Kommentar</label>
  <textarea id="wr-text" rows="4" maxlength="4000" required placeholder="Was soll hier anders sein?"></textarea>
  <div class="wr-row"><button type="button" class="wr-btn" id="wr-cancel">Abbrechen</button><button type="submit" class="wr-btn wr-primary">Kommentar setzen</button></div>
</form>
<div id="wr-view" class="wr-card wr-compose" hidden>
  <div class="wr-who" id="wr-view-who"></div>
  <p id="wr-view-text" class="wr-text"></p>
  <div class="wr-row"><button type="button" class="wr-btn" id="wr-del">Löschen</button><button type="button" class="wr-btn wr-primary" id="wr-view-ok">Schließen</button></div>
</div>
<div id="wr-toast" class="wr-toast" role="status" hidden></div>
<script type="application/json" id="wr-data">${json}</script>
<script>${SHELL_JS}</script>
</body>
</html>`;
}

const SHELL_CSS = `
html,body{margin:0;height:100%;overflow:hidden;background:#fff;font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1d1d1f}
#wr-frame{position:fixed;inset:0;width:100%;height:100%;border:0;display:block}
body.wr-commenting #wr-frame{cursor:crosshair}
.wr-card{position:fixed;z-index:10;background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.22),0 0 0 1px rgba(0,0,0,.06);padding:16px}
.wr-card[hidden],.wr-hint[hidden],.wr-toast[hidden]{display:none}
.wr-intro{left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,calc(100vw - 32px));box-sizing:border-box}
.wr-intro h1{font-size:18px;margin:0 0 8px}.wr-intro p{margin:0 0 8px}.wr-intro ol{margin:0 0 16px;padding-left:20px}.wr-intro li{margin:4px 0}
.wr-bar{position:fixed;z-index:9;left:16px;right:16px;bottom:16px;margin:0 auto;width:fit-content;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;
  background:rgba(28,28,30,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#fff;border-radius:16px;padding:8px;box-shadow:0 8px 30px rgba(0,0,0,.3);box-sizing:border-box}
.wr-seg{display:flex;background:rgba(255,255,255,.12);border-radius:10px;padding:2px}
.wr-seg button{border:0;background:none;color:#fff;font:inherit;font-weight:600;padding:7px 12px;border-radius:8px;cursor:pointer}
.wr-seg button.on{background:#fff;color:#1d1d1f}
.wr-bar select{font:inherit;padding:7px 8px;border-radius:10px;border:0;background:rgba(255,255,255,.12);color:#fff;max-width:160px}
.wr-bar select option{color:#1d1d1f}
.wr-btn{white-space:nowrap;font:inherit;font-weight:600;padding:8px 12px;border-radius:10px;border:1px solid rgba(0,0,0,.12);background:#f2f2f4;color:#1d1d1f;cursor:pointer}
.wr-bar .wr-btn{background:rgba(255,255,255,.12);color:#fff;border-color:transparent}
.wr-btn.wr-primary,.wr-bar .wr-btn.wr-primary{background:#6e56cf;color:#fff;border-color:transparent}
.wr-btn:focus-visible,.wr-seg button:focus-visible,.wr-bar select:focus-visible{outline:2px solid #a594f9;outline-offset:2px}
#wr-count{display:inline-block;min-width:18px;padding:0 5px;border-radius:9px;background:#6e56cf;color:#fff;font-size:12px;line-height:18px;text-align:center;margin-left:2px}
.wr-hint{position:fixed;z-index:9;left:16px;right:16px;top:16px;margin:0 auto;width:fit-content;text-align:center;background:#6e56cf;color:#fff;font-weight:600;padding:8px 14px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.2);pointer-events:none}
.wr-list{right:16px;top:64px;bottom:96px;width:min(340px,calc(100vw - 32px));box-sizing:border-box;overflow:auto;padding:12px}
.wr-list h2{font-size:15px;margin:0 0 8px}
.wr-item{display:block;width:100%;text-align:left;font:inherit;background:none;border:0;border-top:1px solid #eee;padding:10px 4px;cursor:pointer;color:inherit}
.wr-item:hover{background:#f6f5fb}.wr-item b{display:block;font-size:13px}.wr-item small{color:#6b6b73}
.wr-compose{width:300px;max-width:calc(100vw - 32px);box-sizing:border-box}
.wr-lbl{display:block;font-size:12px;font-weight:600;color:#6b6b73;margin:0 0 4px}
.wr-compose input,.wr-compose textarea{width:100%;box-sizing:border-box;font:inherit;border:1px solid #d6d6dc;border-radius:8px;padding:7px 9px;margin:0 0 10px;resize:vertical}
.wr-compose input:focus,.wr-compose textarea:focus{outline:2px solid #a594f9;border-color:transparent}
.wr-row{display:flex;gap:8px;justify-content:flex-end}
.wr-who{font-size:12px;color:#6b6b73;margin-bottom:6px}.wr-text{margin:0 0 12px;white-space:pre-wrap;word-break:break-word}
.wr-toast{position:fixed;z-index:11;left:16px;right:16px;bottom:84px;margin:0 auto;width:fit-content;background:#1d1d1f;color:#fff;padding:9px 14px;border-radius:10px;font-weight:500;box-shadow:0 6px 20px rgba(0,0,0,.25)}
`;

/** Läuft in der Datei beim Empfänger (ohne Webster) */
const SHELL_JS = String.raw`(function(){
var D=JSON.parse(document.getElementById('wr-data').textContent);
var $=function(id){return document.getElementById(id)};
var frame=$('wr-frame'),bar=$('wr-bar'),sel=$('wr-page'),list=$('wr-list'),compose=$('wr-compose'),view=$('wr-view'),toast=$('wr-toast');
var KEY='webster-ansehen:'+D.slug+':'+D.created;
var mode='view',cur=D.pages[0].id,comments=[],author='',dirty=false,pending=null,open=null;
try{var s=JSON.parse(localStorage.getItem(KEY)||'null');if(s){comments=s.comments||[];author=s.author||'';dirty=!!s.dirty}}catch(e){}
function store(){try{localStorage.setItem(KEY,JSON.stringify({comments:comments,author:author,dirty:dirty}))}catch(e){}}
function page(id){for(var i=0;i<D.pages.length;i++)if(D.pages[i].id===id)return D.pages[i];return D.pages[0]}
function say(t){toast.textContent=t;toast.style.bottom=(bar.offsetHeight+28)+'px';toast.hidden=false;clearTimeout(say.t);say.t=setTimeout(function(){toast.hidden=true},3200)}
D.pages.forEach(function(p){var o=document.createElement('option');o.value=p.id;o.textContent=p.name;sel.appendChild(o)});
sel.onchange=function(){show(sel.value)};
function show(id){cur=page(id).id;sel.value=cur;closeCards();frame.srcdoc=page(cur).html}
function closeCards(){compose.hidden=true;view.hidden=true;pending=null;open=null}
function setMode(m){mode=m;document.body.classList.toggle('wr-commenting',m==='comment');$('wr-hint').hidden=m!=='comment';
  [].forEach.call(bar.querySelectorAll('[data-mode]'),function(b){var on=b.getAttribute('data-mode')===m;b.classList.toggle('on',on);b.setAttribute('aria-checked',on)});
  if(m!=='comment')closeCards()}
[].forEach.call(bar.querySelectorAll('[data-mode]'),function(b){b.onclick=function(){setMode(b.getAttribute('data-mode'))}});
function nodeOf(el){var nodes=page(cur).nodes;for(;el&&el.classList;el=el.parentElement){for(var i=0;i<el.classList.length;i++){var c=el.classList[i];if(c.charAt(0)==='n'&&nodes.hasOwnProperty(c.slice(1)))return{el:el,id:c.slice(1)}}}return null}
function elOf(d,id){return id?d.querySelector('.n'+(window.CSS&&CSS.escape?CSS.escape(id):id)):null}
function place(card,x,y){var r=frame.getBoundingClientRect();card.hidden=false;var w=card.offsetWidth,h=card.offsetHeight;
  card.style.left=Math.max(16,Math.min(r.left+x+12,innerWidth-w-16))+'px';card.style.top=Math.max(16,Math.min(r.top+y+12,innerHeight-h-90))+'px'}
frame.onload=function(){
  var d=frame.contentDocument,w=frame.contentWindow;if(!d)return;
  var st=d.createElement('style');st.textContent='.wr-pin{position:absolute;z-index:2147483646;width:26px;height:26px;margin:-26px 0 0 0;border-radius:13px 13px 13px 2px;background:#6e56cf;color:#fff;font:700 12px/26px -apple-system,BlinkMacSystemFont,sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid #fff;cursor:pointer;padding:0;box-sizing:content-box;transform-origin:0 100%}.wr-pin:hover{transform:scale(1.12)}a[data-lang]{display:none!important}';
  d.head.appendChild(st);
  d.addEventListener('click',function(e){
    var t=e.target;
    var pin=t.closest&&t.closest('.wr-pin');
    if(pin){e.preventDefault();e.stopPropagation();openComment(pin.getAttribute('data-id'),e.clientX,e.clientY);return}
    if(mode==='view'){
      var a=t.closest&&t.closest('a[data-page],a[data-lang]');
      if(a){e.preventDefault();if(a.hasAttribute('data-page'))show(a.getAttribute('data-page'));else say('Diese Datei zeigt nur eine Sprache.')}
      return}
    e.preventDefault();e.stopPropagation();
    var hit=nodeOf(t);var r=hit?hit.el.getBoundingClientRect():{left:0,top:-w.scrollY,width:d.documentElement.scrollWidth||1,height:d.documentElement.scrollHeight||1};
    pending={id:'c'+Math.random().toString(36).slice(2,9)+Date.now().toString(36),pageId:cur,nodeId:hit?hit.id:null,
      px:r.width?Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)):0,py:r.height?Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)):0,vw:w.innerWidth,lang:D.lang};
    view.hidden=true;$('wr-name').value=author;$('wr-text').value='';place(compose,e.clientX,e.clientY);($('wr-name').value?$('wr-text'):$('wr-name')).focus();
  },true);
  // Formulare und eingebettete Inhalte sollen beim Kommentieren nicht reagieren
  d.addEventListener('submit',function(e){if(mode==='comment'){e.preventDefault();e.stopPropagation()}},true);
  d.addEventListener('keydown',function(e){if(e.key==='Escape')closeCards()});
  w.addEventListener('resize',pins);
  // Inhalte, die beim Scrollen erscheinen, verschieben sich noch – Nadeln nachziehen
  var raf=0;var again=function(){if(!raf)raf=w.requestAnimationFrame(function(){raf=0;pins()})};
  w.addEventListener('scroll',again,{passive:true});d.addEventListener('transitionend',again,true);
  if(w.ResizeObserver)new w.ResizeObserver(pins).observe(d.body);
  pins();
};
function pins(){
  var d=frame.contentDocument;if(!d||!d.body)return;
  var box=d.getElementById('wr-pins');if(box)box.remove();
  box=d.createElement('div');box.id='wr-pins';box.style.cssText='position:absolute;left:0;top:0;width:0;height:0;z-index:2147483646';
  var w=frame.contentWindow,n=0;
  comments.forEach(function(c){if(c.pageId!==cur)return;n++;
    var el=elOf(d,c.nodeId),r=el?el.getBoundingClientRect():null,x,y;
    if(r&&r.width+r.height>0){x=r.left+w.scrollX+c.px*r.width;y=r.top+w.scrollY+c.py*r.height}
    else{x=c.px*(d.documentElement.scrollWidth||w.innerWidth);y=c.py*(d.documentElement.scrollHeight||w.innerHeight)}
    var b=d.createElement('button');b.type='button';b.className='wr-pin';b.setAttribute('data-id',c.id);b.textContent=n;
    b.title=(c.author?c.author+': ':'')+c.text;b.style.left=x+'px';b.style.top=y+'px';box.appendChild(b)});
  // Pins relativ zum Dokument, auch wenn body verschoben ist
  var br=d.body.getBoundingClientRect(),bs=w.getComputedStyle(d.body).position;
  if(bs!=='static'){box.style.left=-(br.left+w.scrollX)+'px';box.style.top=-(br.top+w.scrollY)+'px'}
  d.body.appendChild(box);
}
function openComment(id,x,y){var c=comments.filter(function(k){return k.id===id})[0];if(!c)return;open=c;compose.hidden=true;
  $('wr-view-who').textContent=(c.author||'Ohne Name')+' · '+new Date(c.at).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'});
  $('wr-view-text').textContent=c.text;place(view,x,y)}
$('wr-view-ok').onclick=closeCards;
$('wr-del').onclick=function(){if(!open)return;comments=comments.filter(function(k){return k!==open});dirty=true;store();closeCards();pins();renderList();say('Kommentar gelöscht')};
$('wr-cancel').onclick=closeCards;
compose.onsubmit=function(e){e.preventDefault();var t=$('wr-text').value.trim();if(!t||!pending)return;
  author=$('wr-name').value.trim().slice(0,80);pending.author=author;pending.text=t.slice(0,4000);pending.at=new Date().toISOString();
  comments.push(pending);dirty=true;store();closeCards();pins();renderList();say('Kommentar gesetzt – zum Schluss „Kommentare speichern“.')};
compose.onkeydown=view.onkeydown=function(e){if(e.key==='Escape')closeCards()};
function renderList(){
  $('wr-count').textContent=comments.length;
  list.textContent='';var h=document.createElement('h2');h.textContent=comments.length?'Alle Kommentare':'Noch keine Kommentare';list.appendChild(h);
  D.pages.forEach(function(p){var mine=comments.filter(function(c){return c.pageId===p.id});mine.forEach(function(c,i){
    var b=document.createElement('button');b.type='button';b.className='wr-item';
    var t=document.createElement('b');t.textContent=p.name+' · '+(i+1);var x=document.createElement('span');x.textContent=c.text.length>140?c.text.slice(0,140)+'…':c.text;
    var m=document.createElement('small');m.textContent=' – '+(c.author||'Ohne Name');
    b.appendChild(t);b.appendChild(x);b.appendChild(m);
    b.onclick=function(){if(cur!==p.id){show(p.id);frame.addEventListener('load',function f(){frame.removeEventListener('load',f);go(c)})}else go(c)};
    list.appendChild(b)})});
}
function go(c){var d=frame.contentDocument;var pin=d&&d.querySelector('.wr-pin[data-id="'+c.id+'"]');if(pin){pin.scrollIntoView({block:'center',behavior:'smooth'});pin.animate&&pin.animate([{transform:'scale(1.6)'},{transform:'scale(1)'}],{duration:600})}}
$('wr-list-btn').onclick=function(){list.hidden=!list.hidden;this.setAttribute('aria-expanded',!list.hidden)};
$('wr-save').onclick=function(){
  if(!comments.length){say('Es gibt noch keine Kommentare.');return}
  var out={kind:D.kind,version:1,project:D.name,author:author,savedAt:new Date().toISOString(),comments:comments};
  var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,1)],{type:'application/json'}));
  a.download=D.slug+'-kommentare'+(author?'-'+author.toLowerCase().replace(/[^a-z0-9äöüß]+/g,'-').replace(/^-|-$/g,''):'')+'.json';
  document.body.appendChild(a);a.click();a.remove();dirty=false;store();
  say('Gespeichert. Schick die Datei „'+a.download+'“ zurück.')};
addEventListener('beforeunload',function(e){if(dirty){e.preventDefault();e.returnValue=''}});
$('wr-intro-ok').onclick=function(){$('wr-intro').hidden=true;try{localStorage.setItem(KEY+':intro','1')}catch(e){}};
var seen=false;try{seen=!!localStorage.getItem(KEY+':intro')}catch(e){}
$('wr-intro').hidden=seen;
renderList();show(cur);
})();`;
