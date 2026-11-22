// Benannte Zwischenstände („Version für Kunden, Mai“): ein Stand des ganzen Projekts, zu dem man jederzeit zurückkann.
// Mit Projektordner: Dateien in <Projekt>/zwischenstaende/ (Bilder liegen wie sonst in bilder/ und werden nur verwiesen).
// Ohne Ordner (z. B. Safari oder noch nie gespeichert): im Browser-Speicher.
import { create } from 'zustand';
import type { WDocument } from './types';
import { uid } from './factory';
import { labelChange } from './history';
import { useEditor } from '../store';
import { readMedia, useProject, writeFile, writeMedia } from './project';
import { loadBrowserSnapshots, saveBrowserSnapshots } from '../persist';

export interface SnapshotInfo { id: string; name: string; savedAt: number; where: 'folder' | 'browser' }
const DIR = 'zwischenstaende';
const EXT = '.zwischenstand';

interface State { list: SnapshotInfo[]; loading: boolean; error: string | null; key: string }
export const useSnapshots = create<State>(() => ({ list: [], loading: false, error: null, key: '' }));

const projectKey = () => { const p = useProject.getState(); return p.handle ? `ordner:${p.id ?? p.folder}` : `browser:${p.id ?? 'ohne-ordner'}`; };

async function folder(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  const h = useProject.getState().handle;
  if (!h) return null;
  try { return await h.getDirectoryHandle(DIR, { create }); } catch { return null; }
}

/** Liste neu einlesen (beim Öffnen des Verlaufs und nach jeder Änderung) */
export async function refreshSnapshots() {
  const key = projectKey();
  useSnapshots.setState({ loading: true, error: null, key });
  try {
    let list: SnapshotInfo[] = [];
    const dir = await folder(false);
    if (useProject.getState().handle) {
      if (dir) {
        for await (const [name, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
          if (h.kind !== 'file' || !name.endsWith(EXT)) continue;
          try {
            const raw = JSON.parse(await (await (h as FileSystemFileHandle).getFile()).text());
            list.push({ id: name.slice(0, -EXT.length), name: String(raw.name ?? 'Zwischenstand'), savedAt: Date.parse(raw.savedAt) || 0, where: 'folder' });
          } catch { /* beschädigte Datei überspringen */ }
        }
      }
    } else {
      list = (await loadBrowserSnapshots(key)).map(s => ({ id: s.id, name: s.name, savedAt: s.savedAt, where: 'browser' as const }));
    }
    list.sort((a, b) => b.savedAt - a.savedAt);
    if (projectKey() === key) useSnapshots.setState({ list, loading: false });
  } catch (e) {
    useSnapshots.setState({ loading: false, error: `Zwischenstände konnten nicht gelesen werden: ${(e as Error)?.message ?? e}` });
  }
}

/** Aktuellen Stand unter einem Namen sichern */
export async function saveSnapshot(name: string): Promise<boolean> {
  const label = name.trim() || `Stand vom ${new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`;
  const doc = useEditor.getState().doc;
  const id = `${new Date().toISOString().slice(0, 10)}-${uid()}`;
  const savedAt = new Date().toISOString();
  try {
    const p = useProject.getState();
    if (p.handle) {
      const dir = await folder(true);
      if (!dir) throw new Error('Kein Zugriff auf den Projektordner');
      const { out } = await writeMedia(p.handle, doc);
      await writeFile(dir, id + EXT, JSON.stringify({ webster: 1, name: label, savedAt, doc: out }));
    } else {
      const key = projectKey();
      const list = await loadBrowserSnapshots(key);
      list.push({ id, name: label, savedAt: Date.now(), doc });
      // Im Browser höchstens 10 Stände (Platz ist dort knapp)
      await saveBrowserSnapshots(key, list.slice(-10));
    }
    await refreshSnapshots();
    return true;
  } catch (e) {
    useSnapshots.setState({ error: `Speichern hat nicht geklappt: ${(e as Error)?.message ?? e}` });
    return false;
  }
}

async function readSnapshot(s: SnapshotInfo): Promise<WDocument> {
  if (s.where === 'browser') {
    const hit = (await loadBrowserSnapshots(projectKey())).find(x => x.id === s.id);
    if (!hit) throw new Error('Zwischenstand nicht gefunden');
    return hit.doc;
  }
  const dir = await folder(false);
  const h = useProject.getState().handle;
  if (!dir || !h) throw new Error('Kein Zugriff auf den Projektordner');
  const raw = JSON.parse(await (await (await dir.getFileHandle(s.id + EXT)).getFile()).text());
  const doc = raw?.doc as WDocument;
  if (!doc || doc.version !== 1 || !Array.isArray(doc.pages)) throw new Error('Die Datei ist beschädigt');
  const missing = await readMedia(h, doc);
  if (missing.length) useSnapshots.setState({ error: `${missing.length} Bild(er) aus diesem Zwischenstand fehlen im Projektordner.` });
  return doc;
}

/** Zu einem Zwischenstand zurückkehren (lässt sich mit ⌘Z rückgängig machen) */
export async function restoreSnapshot(s: SnapshotInfo): Promise<boolean> {
  try {
    const doc = await readSnapshot(s);
    // Kommentare gehören nicht zum Entwurfsstand – sie bleiben beim Zurückgehen erhalten
    const comments = useEditor.getState().doc.comments;
    if (comments?.length) doc.comments = comments; else delete doc.comments;
    useEditor.getState().replaceDocument(doc);
    labelChange(useEditor.getState().doc, `Zwischenstand „${s.name}“ wiederhergestellt`);
    return true;
  } catch (e) {
    useSnapshots.setState({ error: `Wiederherstellen hat nicht geklappt: ${(e as Error)?.message ?? e}` });
    return false;
  }
}

export async function deleteSnapshot(s: SnapshotInfo) {
  try {
    if (s.where === 'browser') {
      const key = projectKey();
      await saveBrowserSnapshots(key, (await loadBrowserSnapshots(key)).filter(x => x.id !== s.id));
    } else {
      const dir = await folder(false);
      await dir?.removeEntry(s.id + EXT);
    }
  } catch (e) {
    useSnapshots.setState({ error: `Löschen hat nicht geklappt: ${(e as Error)?.message ?? e}` });
  }
  await refreshSnapshots();
}

// Anderes Projekt geöffnet → Liste neu laden
useProject.subscribe((p, prev) => { if (p.handle !== prev.handle || p.id !== prev.id) void refreshSnapshots(); });
