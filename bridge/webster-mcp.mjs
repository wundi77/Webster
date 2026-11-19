#!/usr/bin/env node
// Webster ⇄ Claude Code: kleine Brücke (MCP-Server über stdio, ohne Zusatzpakete).
// Claude Code startet dieses Programm. Der geöffnete Webster-Editor verbindet sich – nur wenn dort der
// Schalter „Claude-Verbindung“ an ist – über http://127.0.0.1:5199 und führt die Aufträge aus.
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.WEBSTER_BRIDGE_PORT || 5199);
const CALL_TIMEOUT = 30_000;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
// Die Online-Version von Webster darf sich auch verbinden. Weitere Adressen: WEBSTER_ORIGINS="https://a.de,https://b.de"
const ONLINE_ORIGINS = new Set(['https://wundi77.github.io', ...(process.env.WEBSTER_ORIGINS || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean)]);
const originAllowed = o => !!o && (LOCAL_ORIGIN.test(o) || ONLINE_ORIGINS.has(o));

// ---------- Werkzeuge (Beschreibungen für Claude) ----------

const pos = {
  x: { type: 'number', description: 'Abstand links zum Eltern-Board in px' },
  y: { type: 'number', description: 'Abstand oben zum Eltern-Board in px' },
  w: { type: 'number', description: 'Breite in px' },
  h: { type: 'number', description: 'Höhe in px' },
};
const TOOLS = [
  {
    name: 'get_overview',
    description: 'Überblick über das geöffnete Webster-Dokument: Seiten, aktuelle Seite, Bildschirmgröße (Breakpoint), Auswahl, Webseiten-Board. Immer zuerst aufrufen.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_page',
    description: 'Ebenenbaum einer Seite (Standard: aktuelle Seite) mit id, Name, Typ, Position/Größe (relativ zum Eltern-Board), Text, Füllfarbe, Layout. Werte gelten für den aktuellen Breakpoint.',
    inputSchema: { type: 'object', properties: { pageId: { type: 'string' } } },
  },
  {
    name: 'get_node',
    description: 'Alle Eigenschaften einer Ebene als JSON (für genaue Änderungen mit update_node).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'create_node',
    description: 'Neue Ebene anlegen. type: rect, ellipse, text oder board. Ohne parentId landet sie im ausgewählten Board bzw. im Webseiten-Board. Hat das Eltern-Board ein Layout (Flex/Grid), ordnet das Layout die Ebene ein (x/y werden dann ignoriert). Gibt die neue id zurück.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['rect', 'ellipse', 'text', 'board'] },
        parentId: { type: 'string' },
        name: { type: 'string' },
        ...pos,
        text: { type: 'string', description: 'Nur für type=text' },
        fill: { type: 'string', description: 'Füllfarbe (bei Text: Schriftfarbe) als Hex, z. B. #6A55F5' },
        fontSize: { type: 'number' },
        fontWeight: { type: 'number' },
        fontFamily: { type: 'string', description: 'Google-Font-Name, z. B. Inter' },
        radius: { type: 'number', description: 'Eckenradius in px' },
        customCss: { type: 'string', description: 'Zusätzliche CSS-Angaben, eine pro Zeile' },
      },
      required: ['type'],
    },
  },
  {
    name: 'update_node',
    description: 'Ebene ändern. props darf enthalten: name, x, y, w, h, text, fill (Hex), opacity (0–1), radius, visible, rotation, fontSize, fontWeight, fontFamily, textAlign, lineHeight, customCss, sowie beliebige weitere Eigenschaften aus get_node (werden direkt übernommen). Größen/Positionen gelten für den aktuellen Breakpoint.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, props: { type: 'object' } }, required: ['id', 'props'] },
  },
  {
    name: 'add_code_block',
    description: 'Code-Block-Ebene einsetzen: eigenes HTML/CSS/JavaScript (z. B. eine Animation). Läuft abgeschottet in einem eigenen Rahmen in Größe der Ebene, im Editor, in der Vorschau und auf der Website. Der Hintergrund ist transparent. Ohne parentId: ausgewähltes Board bzw. unten ins Webseiten-Board.',
    inputSchema: {
      type: 'object',
      properties: { parentId: { type: 'string' }, name: { type: 'string' }, ...pos, html: { type: 'string' }, css: { type: 'string' }, js: { type: 'string' } },
      required: ['html'],
    },
  },
  {
    name: 'update_code_block',
    description: 'HTML, CSS und/oder JavaScript eines vorhandenen Code-Blocks ersetzen.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, html: { type: 'string' }, css: { type: 'string' }, js: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'set_site_code',
    description: 'Code für alle Seiten setzen: css (z. B. @keyframes für Animationen, die per customCss genutzt werden), headCode (in <head>), bodyCode (vor </body>). Nicht angegebene Felder bleiben unverändert.',
    inputSchema: { type: 'object', properties: { css: { type: 'string' }, headCode: { type: 'string' }, bodyCode: { type: 'string' } } },
  },
  {
    name: 'delete_nodes',
    description: 'Ebenen löschen (rückgängig machbar).',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
  },
  {
    name: 'select_nodes',
    description: 'Ebenen im Editor auswählen, um sie dem Benutzer zu zeigen.',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
  },
  {
    name: 'get_preview_html',
    description: 'Fertiges HTML der Seite, wie es in der Vorschau läuft (zum Prüfen des Ergebnisses).',
    inputSchema: { type: 'object', properties: { pageId: { type: 'string' } } },
  },
];

const INSTRUCTIONS = `Webster ist ein Webbaukasten im Browser. Diese Werkzeuge steuern den geöffneten Editor.
Zuerst get_overview, dann get_page aufrufen. Jeder Auftrag ist im Editor ein Rückgängig-Schritt (⌘Z).
Für Animationen: add_code_block (abgeschottet, beliebiges HTML/CSS/JS) oder customCss an einer Ebene plus @keyframes über set_site_code.
Antworte dem Benutzer auf Deutsch und ohne Fachjargon.`;

// ---------- Verbindung zum Editor ----------

const queue = [];          // wartende Aufträge
const pending = new Map(); // id → { resolve, timer }
let waiter = null;         // offene Abfrage des Editors
let lastSeen = 0;          // letzter Kontakt des Editors
let listenError = null;

const editorConnected = () => Date.now() - lastSeen < 35_000;

function deliver() {
  if (!waiter || !queue.length) return;
  const { res, timer } = waiter;
  waiter = null;
  clearTimeout(timer);
  send(res, 200, queue.shift());
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', ...res.cors });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function callEditor(tool, args) {
  if (listenError) return Promise.resolve({ ok: false, error: listenError });
  if (!editorConnected()) {
    return Promise.resolve({ ok: false, error: 'Webster ist nicht verbunden. Bitte im Webster-Editor oben den Schalter „Claude“ einschalten (Webster muss geöffnet sein).' });
  }
  return new Promise(resolve => {
    const id = randomUUID();
    const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: 'Webster hat nicht rechtzeitig geantwortet.' }); }, CALL_TIMEOUT);
    pending.set(id, { resolve, timer });
    queue.push({ id, tool, args: args ?? {} });
    deliver();
  });
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  // Nur der Editor auf diesem Rechner oder die Online-Version von Webster darf sich verbinden (andere Webseiten werden abgewiesen)
  if (!originAllowed(origin)) { res.writeHead(403); res.end(); return; }
  res.cors = { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-allow-private-network': 'true', vary: 'origin' };
  if (req.method === 'OPTIONS') { res.writeHead(204, res.cors); res.end(); return; }
  lastSeen = Date.now();
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/poll') {
    if (waiter) { clearTimeout(waiter.timer); send(waiter.res, 204); }
    if (queue.length) { send(res, 200, queue.shift()); return; }
    const timer = setTimeout(() => { if (waiter?.res === res) waiter = null; send(res, 204); }, 25_000);
    waiter = { res, timer };
    req.on('close', () => { if (waiter?.res === res) { clearTimeout(timer); waiter = null; } });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/result') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 5e6) req.destroy(); });
    req.on('end', () => {
      try {
        const msg = JSON.parse(body);
        const p = pending.get(msg.id);
        if (p) { clearTimeout(p.timer); pending.delete(msg.id); p.resolve(msg); }
        send(res, 200, { ok: true });
      } catch { send(res, 400, { ok: false }); }
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/status') { send(res, 200, { ok: true, name: 'webster-bridge' }); return; }
  send(res, 404, { ok: false });
});
server.on('error', e => {
  listenError = e.code === 'EADDRINUSE'
    ? `Port ${PORT} ist schon belegt – läuft Webster-Claude bereits in einem anderen Claude-Code-Fenster? Dort beenden und hier neu starten.`
    : `Brücke konnte nicht starten: ${e.message}`;
  log(listenError);
});
server.listen(PORT, '127.0.0.1');

// ---------- MCP über stdio (JSON-RPC, eine Nachricht pro Zeile) ----------

const log = m => process.stderr.write(`[webster-bridge] ${m}\n`);
const out = msg => process.stdout.write(JSON.stringify(msg) + '\n');

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // Benachrichtigungen (z. B. notifications/initialized)
  try {
    if (method === 'initialize') {
      out({ jsonrpc: '2.0', id, result: {
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'webster', version: '0.1.0' },
        instructions: INSTRUCTIONS,
      } });
    } else if (method === 'ping') {
      out({ jsonrpc: '2.0', id, result: {} });
    } else if (method === 'tools/list') {
      out({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    } else if (method === 'tools/call') {
      const name = params?.name;
      if (!TOOLS.some(t => t.name === name)) throw Object.assign(new Error(`Unbekanntes Werkzeug: ${name}`), { code: -32602 });
      const r = await callEditor(name, params?.arguments);
      const text = r.ok ? (typeof r.result === 'string' ? r.result : JSON.stringify(r.result, null, 1)) : r.error;
      out({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: text ?? '' }], isError: !r.ok } });
    } else {
      out({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unbekannte Methode: ${method}` } });
    }
  } catch (e) {
    out({ jsonrpc: '2.0', id, error: { code: e.code ?? -32603, message: e.message } });
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try { handle(JSON.parse(line)); } catch { out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  }
});
process.stdin.on('end', () => process.exit(0));
