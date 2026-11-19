// Neue Version erkennen: Die Seite fragt version.json ab (immer frisch, am Zwischenspeicher vorbei).
// Beim Start wird eine neuere Fassung sofort geladen. Während der Arbeit wird nur dann sofort neu geladen,
// wenn nichts verloren gehen kann; sonst erscheint ein Hinweis mit Knopf.
import { create } from 'zustand';

declare const __BUILD_ID__: string;
export const BUILD_ID = __BUILD_ID__;
const ACTIVE = BUILD_ID !== 'dev';
const RELOAD_KEY = 'webster.reloadedFor';

export const useUpdate = create<{ available: string | null }>(() => ({ available: null }));

async function latestBuild(timeout = 4000): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store', signal: ctl.signal });
    if (!r.ok) return null;
    const j = await r.json() as { build?: unknown };
    return typeof j.build === 'string' ? j.build : null;
  } catch { return null; } finally { clearTimeout(t); }
}

/** Neue Fassung laden: eigene Adresse mit ?v=…, damit der Browser nichts Altes aus dem Speicher nimmt */
export function reloadToLatest(build: string) {
  try { sessionStorage.setItem(RELOAD_KEY, build); } catch { /* egal */ }
  const u = new URL(location.href);
  u.searchParams.set('v', build);
  location.replace(u.toString());
}

/** Beim Start: Gibt es schon eine neuere Fassung, sofort diese laden (bevor jemand etwas bearbeitet). */
export async function updateOnStart(): Promise<boolean> {
  // ?v=… nach dem Neuladen wieder aus der Adresse nehmen
  const u = new URL(location.href);
  if (u.searchParams.has('v')) { u.searchParams.delete('v'); history.replaceState(history.state, '', u.toString()); }
  if (!ACTIVE) return false;
  const latest = await latestBuild(2500);
  if (!latest || latest <= BUILD_ID) return false;
  // Nicht in einer Schleife landen, falls der Server noch kurz die alte Seite liefert
  let tried: string | null = null;
  try { tried = sessionStorage.getItem(RELOAD_KEY); } catch { /* egal */ }
  if (tried === latest) { useUpdate.setState({ available: latest }); return false; }
  reloadToLatest(latest);
  return true;
}

/** Während der Arbeit regelmäßig nachsehen. canReloadNow: true, wenn keine Arbeit verloren gehen kann. */
export function watchForUpdates(canReloadNow: () => boolean) {
  if (!ACTIVE) return;
  let last = 0;
  const check = async () => {
    if (Date.now() - last < 60_000 || useUpdate.getState().available) return;
    last = Date.now();
    const latest = await latestBuild();
    if (!latest || latest <= BUILD_ID) return;
    if (canReloadNow()) reloadToLatest(latest);
    else useUpdate.setState({ available: latest });
  };
  setInterval(check, 10 * 60_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  addEventListener('focus', check);
}
