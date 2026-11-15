// Projektverwaltung: Jedes Projekt ist ein eigener Ordner auf dem Mac.
//   <Projektname>/projekt.webster   Seiten, Ebenen, Einstellungen (Text/JSON)
//   <Projektname>/bilder/…          Bilder als normale Dateien
//   <Projektname>/videos/…          eigene Videos
// Gespeichert wird nur auf Befehl (⌘S). Im Browser liegt zusätzlich still eine Notfallkopie.
// Ordner-Zugriff gibt es nur in Chrome/Edge; sonst wird als Datei heruntergeladen.
import { create } from 'zustand';
import type { WDocument } from './types';
import { createDocument, uid } from './factory';
import { useEditor, setBackupMetaProvider } from '../store';
import { addRecent, clearLegacyDocument, loadRecent, removeRecent, saveBackupMeta, type RecentProject } from '../persist';
import { fitAll } from './viewport';
import { slug } from './css';
import { askConfirm } from '../ui/ConfirmDialog';

export const PROJECT_FILE = 'projekt.webster';
export const supportsFolders = typeof window !== 'undefined' && 'showDirectoryPicker' in window
  // nur zum Testen: Safari-Verhalten in Chrome nachstellen (?ohneOrdner)
  && !(import.meta.env.DEV && location.search.includes('ohneOrdner'));

interface ProjectState {
  /** Kennung des Projekts (bleibt beim Umbenennen gleich) */
  id: string | null;
  handle: FileSystemDirectoryHandle | null;
  /** Ordnername auf dem Mac */
  folder: string;
  /** Dokument zum Zeitpunkt des letzten Speicherns */
  savedDoc: WDocument | null;
  savedAt: number | null;
  /** seit wann es ungesicherte Änderungen gibt */
  dirtySince: number | null;
  /** das aktuelle Dokument ist das „bisherige Dokument“ von vor den Projektordnern */
  legacy: boolean;
  /** im Startfenster wurde etwas gewählt (vorher wird keine Notfallkopie geschrieben) */
  started: boolean;
  busy: boolean;
  message: { kind: 'ok' | 'error'; text: string } | null;
  /** Startfenster / Dialog „Neues Projekt“ / „Speichern unter“ */
  dialog: 'start' | 'new' | 'saveas' | null;
  show: (d: ProjectState['dialog']) => void;
}

export const useProject = create<ProjectState>(set => ({
  id: null, handle: null, folder: '', savedDoc: null, savedAt: null, dirtySince: Date.now(), legacy: false, started: false,
  busy: false, message: null, dialog: 'start',
  show: dialog => set({ dialog, message: null }),
}));
const P = () => useProject.getState();
const E = () => useEditor.getState();

export const isDirty = () => E().doc !== P().savedDoc;

// Ungesichert seit … (zurück auf „gespeichert“, wenn man per Rückgängig wieder beim gespeicherten Stand ist)
useEditor.subscribe((s, prev) => {
  if (s.doc === prev.doc) return;
  const dirty = s.doc !== P().savedDoc;
  const since = P().dirtySince;
  if (dirty && since === null) useProject.setState({ dirtySince: Date.now() });
  else if (!dirty && since !== null) useProject.setState({ dirtySince: null });
});

setBackupMetaProvider(() => (P().started ? { projectId: P().id, name: E().doc.name, dirty: isDirty(), changedAt: Date.now() } : null));

// Warnen, wenn der Tab mit ungesicherten Änderungen geschlossen wird
window.addEventListener('beforeunload', e => { if (P().started && isDirty() && E().doc.pages.some(p => p.rootIds.length)) e.preventDefault(); });

/** Fragt nach, bevor ungesicherte Änderungen verworfen werden */
export async function confirmDiscard(): Promise<boolean> {
  if (!P().started || !isDirty() || !E().doc.pages.some(p => p.rootIds.length)) return true;
  return askConfirm({ title: `„${E().doc.name}“ hat ungesicherte Änderungen.`, message: 'Diese gehen verloren. Trotzdem fortfahren?', confirmLabel: 'Fortfahren', danger: true });
}

/** Dokument laden und als „gespeicherten Stand“ merken */
function adopt(doc: WDocument, p: Partial<ProjectState>, saved: boolean) {
  E().loadDocument(doc);
  const d = E().doc; // nach der Aktualisierung (migrate) – erst danach vergleichen
  useProject.setState({
    savedDoc: saved ? d : null, savedAt: saved ? Date.now() : null, dirtySince: saved ? null : Date.now(),
    legacy: false, message: null, started: true, ...p,
  });
  saveBackupMeta({ projectId: P().id, name: d.name, dirty: !saved, changedAt: Date.now() }).catch(() => {});
  requestAnimationFrame(fitAll);
}

// ---------- Dateien ----------

const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
};
const MIME = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));

function dataUrlToBlob(src: string): Blob {
  const m = src.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!m) throw new Error('Kein eingebettetes Bild');
  const type = m[1] ?? 'application/octet-stream';
  if (!m[2]) return new Blob([decodeURIComponent(m[3])], { type });
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(r.error);
  r.readAsDataURL(b);
});

async function exists(dir: FileSystemDirectoryHandle, name: string) {
  try { await dir.getFileHandle(name); return true; } catch { return false; }
}
async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: Blob | string) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

/** Projekt in einen Ordner schreiben: erst Bilder/Videos, zuletzt die Projektdatei */
export async function writeProject(dir: FileSystemDirectoryHandle, doc: WDocument, id: string): Promise<void> {
  const out = structuredClone(doc) as WDocument;
  const media = [['bilder', out.library.images], ['videos', out.library.videos]] as const;
  const files: string[] = [];
  for (const [folder, list] of media) {
    if (!list.length) continue;
    const sub = await dir.getDirectoryHandle(folder, { create: true });
    for (const a of list) {
      if (!a.src.startsWith('data:')) continue;
      const mime = a.src.slice(5, a.src.search(/[;,]/));
      const name = `${a.id}.${EXT[mime] ?? 'bin'}`;
      if (!(await exists(sub, name))) await writeFile(sub, name, dataUrlToBlob(a.src));
      a.src = `${folder}/${name}`;
      files.push(a.src);
    }
  }
  const file = { webster: 1, id, savedAt: new Date().toISOString(), files, doc: out };
  await writeFile(dir, PROJECT_FILE, JSON.stringify(file));
}

/** Projekt aus einem Ordner lesen; fehlende Bilder werden gemeldet */
export async function readProject(dir: FileSystemDirectoryHandle): Promise<{ doc: WDocument; id: string; missing: string[] }> {
  let fh: FileSystemFileHandle;
  try { fh = await dir.getFileHandle(PROJECT_FILE); } catch { throw new Error(`In diesem Ordner liegt kein Webster-Projekt (es fehlt die Datei „${PROJECT_FILE}“).`); }
  const raw = JSON.parse(await (await fh.getFile()).text());
  const doc = raw?.doc as WDocument;
  if (!doc || doc.version !== 1 || !Array.isArray(doc.pages) || !doc.pages.length) throw new Error('Die Projektdatei ist beschädigt oder stammt aus einer neueren Webster-Version.');
  const missing: string[] = [];
  for (const list of [doc.library?.images ?? [], doc.library?.videos ?? []]) {
    for (const a of list) {
      const m = a.src.match(/^(bilder|videos)\/([^/]+)$/);
      if (!m) continue;
      try {
        const f = await (await (await dir.getDirectoryHandle(m[1])).getFileHandle(m[2])).getFile();
        const type = f.type || MIME[m[2].split('.').pop() ?? ''] || '';
        a.src = await blobToDataUrl(type && f.type !== type ? new Blob([f], { type }) : f);
      } catch { missing.push(a.src); a.src = ''; }
    }
  }
  return { doc, id: typeof raw.id === 'string' ? raw.id : uid(), missing };
}

async function ensurePermission(dir: FileSystemDirectoryHandle): Promise<boolean> {
  const h = dir as FileSystemDirectoryHandle & {
    queryPermission?: (o: { mode: string }) => Promise<PermissionState>; requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
  };
  if (!h.queryPermission) return true;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted';
}

type Picker = (o: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }) => Promise<FileSystemDirectoryHandle>;
const pickDir = (mode: 'read' | 'readwrite') => (window as unknown as { showDirectoryPicker: Picker }).showDirectoryPicker({ id: 'webster-projekte', mode, startIn: 'documents' });

const isAbort = (e: unknown) => (e as { name?: string })?.name === 'AbortError';
function fail(e: unknown, what: string) {
  if (isAbort(e)) { useProject.setState({ busy: false }); return; }
  const msg = (e as { name?: string })?.name === 'SecurityError' || /system|blocked|not allowed/i.test(String((e as Error)?.message))
    ? 'Diesen Ordner darf der Browser nicht verwenden (z. B. „Dokumente“ selbst oder der Schreibtisch). Bitte wähle einen Unterordner, etwa „Dokumente/Webster“.'
    : `${what} hat nicht geklappt: ${(e as Error)?.message ?? e}`;
  useProject.setState({ busy: false, message: { kind: 'error', text: msg } });
}

export const folderName = (name: string) => (name.trim() || 'Neues Projekt').replace(/[/\\:*?"<>|]+/g, '-').slice(0, 80);

// ---------- Befehle ----------

/** In den aktuellen Projektordner speichern (⌘S) */
export async function saveProject(): Promise<boolean> {
  const p = P();
  if (p.busy) return false;
  if (!supportsFolders) { downloadProject(); return true; }
  if (!p.handle) { p.show('saveas'); return false; }
  useProject.setState({ busy: true, message: null });
  try {
    if (!(await ensurePermission(p.handle))) throw new Error('Webster hat keine Erlaubnis, in den Projektordner zu schreiben.');
    const doc = E().doc;
    const id = p.id ?? uid();
    await writeProject(p.handle, doc, id);
    await afterSave(doc, id, p.handle);
    return true;
  } catch (e) { fail(e, 'Speichern'); return false; }
}

async function afterSave(doc: WDocument, id: string, handle: FileSystemDirectoryHandle) {
  const wasLegacy = P().legacy;
  useProject.setState({ busy: false, id, handle, folder: handle.name, savedDoc: doc, savedAt: Date.now(), dirtySince: E().doc === doc ? null : Date.now(), legacy: false, dialog: null });
  await saveBackupMeta({ projectId: id, name: doc.name, dirty: E().doc !== doc, changedAt: Date.now() }).catch(() => {});
  await addRecent({ id, name: doc.name, handle, openedAt: Date.now() }).catch(() => {});
  if (wasLegacy) await clearLegacyDocument().catch(() => {});
}

/** Aktuelles Dokument als neues Projekt speichern: Ordner wählen, darin wird ein Projektordner angelegt */
export async function saveProjectAs(name: string, parent?: FileSystemDirectoryHandle): Promise<boolean> {
  if (!supportsFolders) { downloadProject(); return true; }
  useProject.setState({ busy: true, message: null });
  try {
    const where = parent ?? await pickDir('readwrite');
    const dir = await where.getDirectoryHandle(folderName(name), { create: true });
    if (await exists(dir, PROJECT_FILE)) {
      useProject.setState({ busy: false, message: { kind: 'error', text: `In „${where.name}“ gibt es schon ein Projekt „${dir.name}“. Bitte wähle einen anderen Namen oder öffne das Projekt.` } });
      return false;
    }
    if (E().doc.name !== name.trim() && name.trim()) E().mutate((_, d) => { d.name = name.trim(); }, { history: false });
    const doc = E().doc;
    const id = uid();
    await writeProject(dir, doc, id);
    await afterSave(doc, id, dir);
    return true;
  } catch (e) { fail(e, 'Speichern'); return false; }
}

/** Neues, leeres Projekt anlegen (gleich im Ordner gespeichert) */
export async function newProject(name: string, parent?: FileSystemDirectoryHandle): Promise<boolean> {
  if (!(await confirmDiscard())) return false;
  const before = { doc: E().doc, p: { ...P() } };
  const doc = createDocument();
  doc.name = name.trim() || 'Neues Projekt';
  adopt(doc, { id: null, handle: null, folder: '' }, false);
  if (!supportsFolders) { useProject.setState({ dialog: null }); return true; }
  const ok = await saveProjectAs(doc.name, parent);
  if (!ok) {
    // Abgebrochen: altes Dokument zurück
    E().loadDocument(before.doc);
    useProject.setState({ id: before.p.id, handle: before.p.handle, folder: before.p.folder, savedDoc: before.p.savedDoc ? E().doc : null, dirtySince: before.p.dirtySince, legacy: before.p.legacy, started: before.p.started });
  }
  return ok;
}

/** Projektordner öffnen (ohne Ordner: Auswahl anzeigen) */
export async function openProject(dir?: FileSystemDirectoryHandle): Promise<boolean> {
  if (!supportsFolders) { await importProjectFile(); return true; }
  if (!(await confirmDiscard())) return false;
  useProject.setState({ busy: true, message: null });
  try {
    const handle = dir ?? await pickDir('readwrite');
    if (!(await ensurePermission(handle))) throw new Error('Webster hat keine Erlaubnis, diesen Ordner zu lesen.');
    const { doc, id, missing } = await readProject(handle);
    adopt(doc, { id, handle, folder: handle.name, busy: false, dialog: null }, true);
    await addRecent({ id, name: E().doc.name, handle, openedAt: Date.now() }).catch(() => {});
    if (missing.length) useProject.setState({ message: { kind: 'error', text: `${missing.length} Bild(er)/Video(s) fehlen im Projektordner: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ' …' : ''}` } });
    return true;
  } catch (e) { fail(e, 'Öffnen'); return false; }
}

export async function openRecent(r: RecentProject) {
  const ok = await openProject(r.handle);
  if (!ok && P().message?.text.includes('kein Webster-Projekt')) await removeRecent(r.id);
  return ok;
}

/** Notfallkopie wiederherstellen (nach Absturz oder versehentlichem Schließen) */
export async function restoreBackup(doc: WDocument, projectId: string | null) {
  const recent = projectId ? (await loadRecent()).find(r => r.id === projectId) : undefined;
  adopt(doc, { id: recent ? projectId : null, handle: recent?.handle ?? null, folder: recent?.handle.name ?? '', dialog: null }, false);
}

/** Bisheriges Dokument (vor den Projektordnern) übernehmen – wird erst beim Speichern in einen Ordner aus dem Browser entfernt */
export function adoptLegacy(doc: WDocument) {
  adopt(doc, { id: null, handle: null, folder: '', dialog: null }, false);
  useProject.setState({ legacy: true });
}

/** Leeres Dokument ohne Ordner (z. B. in Safari) */
export function startBlank() {
  adopt(createDocument(), { id: null, handle: null, folder: '', dialog: null }, false);
}

/** Alte Projektdatei (.webster.json) einlesen – wird danach als neues Projekt gespeichert */
export async function importProjectFile() {
  if (!(await confirmDiscard())) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.webster,application/json';
  const file = await new Promise<File | undefined>(res => { input.onchange = () => res(input.files?.[0]); input.click(); });
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    const doc = (raw?.doc ?? raw) as WDocument;
    if (!doc || doc.version !== 1 || !Array.isArray(doc.pages) || !doc.pages.length) throw new Error();
    if (doc.library?.images.some(i => /^(bilder|videos)\//.test(i.src))) {
      useProject.setState({ message: { kind: 'error', text: 'Das ist die Projektdatei aus einem Projektordner. Bitte stattdessen „Projekt öffnen …“ verwenden und den ganzen Ordner wählen.' } });
      return;
    }
    adopt(doc, { id: null, handle: null, folder: '', dialog: null }, !supportsFolders);
  } catch {
    useProject.setState({ message: { kind: 'error', text: 'Die Datei konnte nicht geöffnet werden. Ist es eine Webster-Datei (.webster.json)?' } });
  }
}

/** Ohne Ordner-Zugriff (Safari/Firefox): ganzes Projekt als eine Datei herunterladen */
export function downloadProject() {
  const doc = E().doc;
  const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(doc.name) || 'projekt'}.webster.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  if (!supportsFolders) {
    useProject.setState({ savedDoc: doc, savedAt: Date.now(), dirtySince: null });
    saveBackupMeta({ projectId: null, name: doc.name, dirty: false, changedAt: Date.now() }).catch(() => {});
  }
}

// Nur in der Entwicklung: Zugriff für automatische Tests (Ordnerauswahl lässt sich dort nicht anklicken)
if (import.meta.env.DEV) {
  (window as unknown as { __project: unknown }).__project = {
    useProject, newProject, saveProject, saveProjectAs, openProject, writeProject, readProject, restoreBackup, adoptLegacy, isDirty,
  };
}
