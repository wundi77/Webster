// Browser-Speicher (IndexedDB). Das eigentliche Projekt liegt in einem Ordner auf dem Mac (siehe model/project.ts).
// Hier liegen nur: die stille Notfallkopie, die Liste der zuletzt geöffneten Projekte
// und das „bisherige Dokument“ aus der Zeit vor den Projektordnern.
import type { WDocument } from './model/types';

const DB_NAME = 'webster';
const STORE = 'kv';
/** Notfallkopie des gerade bearbeiteten Dokuments (auch Quelle für den Vorschau-Tab) */
const DOC_KEY = 'document';
const META_KEY = 'backup-meta';
const LEGACY_DOC_KEY = 'legacy-document';
const RECENT_KEY = 'recent';
const LEGACY_LS_KEY = 'webster.document.v1';
/** einmaliger Merker: bisheriges Dokument wurde gerettet */
const MIGRATED_KEY = 'projects-migrated';

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(d => new Promise<T>((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const get = <T>(k: string) => tx<T>('readonly', s => s.get(k) as IDBRequest<T>).catch(() => undefined);
const put = (k: string, v: unknown) => tx('readwrite', s => s.put(v, k));
const del = (k: string) => tx('readwrite', s => s.delete(k));

export const validDoc = (d: unknown): d is WDocument =>
  !!d && (d as WDocument).version === 1 && Array.isArray((d as WDocument).pages) && (d as WDocument).pages.length > 0;

// ---------- Notfallkopie ----------

export interface BackupMeta {
  /** Projekt, zu dem die Kopie gehört (null = noch nie in einem Ordner gespeichert) */
  projectId: string | null;
  name: string;
  /** gibt es Änderungen, die nicht im Projektordner gespeichert sind? */
  dirty: boolean;
  changedAt: number;
}

export async function loadSavedDocument(): Promise<WDocument | null> {
  const d = await get<WDocument>(DOC_KEY);
  return validDoc(d) ? d : null;
}
export const loadBackupMeta = () => get<BackupMeta>(META_KEY);

export async function saveBackup(doc: WDocument, meta: BackupMeta): Promise<void> {
  await put(DOC_KEY, doc);
  await put(META_KEY, meta);
}
export const saveBackupMeta = (meta: BackupMeta) => put(META_KEY, meta);

// ---------- Bisheriges Dokument (vor den Projektordnern) ----------

/**
 * Einmalig beim Start: Das bisher automatisch gespeicherte Dokument in einen eigenen Schlüssel retten,
 * bevor die Notfallkopie es überschreiben kann. Muss vor allem anderen laufen.
 */
export async function preserveLegacyDocument(): Promise<void> {
  if (await get(MIGRATED_KEY)) return; // schon einmal erledigt
  if (validDoc(await get(LEGACY_DOC_KEY))) { await put(MIGRATED_KEY, Date.now()); return; }
  let d: unknown = await get(DOC_KEY);
  if (!validDoc(d)) {
    try { const raw = localStorage.getItem(LEGACY_LS_KEY); d = raw ? JSON.parse(raw) : null; } catch { d = null; }
  }
  if (validDoc(d)) await put(LEGACY_DOC_KEY, d);
  await put(MIGRATED_KEY, Date.now());
}
export async function loadLegacyDocument(): Promise<WDocument | null> {
  const d = await get<WDocument>(LEGACY_DOC_KEY);
  return validDoc(d) ? d : null;
}
/** erst aufrufen, wenn das bisherige Dokument in einem Ordner gespeichert oder bewusst verworfen wurde */
export async function clearLegacyDocument() {
  await del(LEGACY_DOC_KEY);
  try { localStorage.removeItem(LEGACY_LS_KEY); } catch { /* egal */ }
}

// ---------- Zuletzt geöffnete Projekte ----------

export interface RecentProject { id: string; name: string; handle: FileSystemDirectoryHandle; openedAt: number }

export async function loadRecent(): Promise<RecentProject[]> {
  const r = await get<RecentProject[]>(RECENT_KEY);
  return Array.isArray(r) ? r : [];
}
export async function addRecent(entry: RecentProject) {
  const list = await loadRecent();
  const out: RecentProject[] = [entry];
  for (const e of list) {
    if (out.length >= 8) break;
    if (e.id === entry.id) continue;
    let same = false;
    try { same = await e.handle.isSameEntry(entry.handle); } catch { /* ignorieren */ }
    if (!same) out.push(e);
  }
  await put(RECENT_KEY, out);
}
export async function removeRecent(id: string) {
  await put(RECENT_KEY, (await loadRecent()).filter(e => e.id !== id));
}
