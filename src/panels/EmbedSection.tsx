// Einstellungen für Videos & Karten
import { useRef, useState } from 'react';
import { useEditor } from '../store';
import type { EmbedKind, WNode } from '../model/types';
import { addVideoFile, currentPageHasRoot, EMBED_INFO, embedSrc, geocode, insertEmbed, MAX_VIDEO_MB, parseOsmLink, setEmbed, vimeoId, youtubeId } from '../model/embed';
import { NumberField, Section } from '../ui/controls';
import { Icons } from '../ui/icons';
import { ImagePick } from './SiteSettings';

const RATIOS: [string, number][] = [['16:9', 16 / 9], ['4:3', 4 / 3], ['1:1', 1], ['9:16', 9 / 16]];

function VideoFileButton({ label, onDone, className = 'btn grow' }: { label: string; onDone: (id: string) => void; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={() => ref.current?.click()}>
        <Icons.video /> {busy ? 'Wird geladen …' : label}
      </button>
      <input ref={ref} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={async e => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setBusy(true); setErr(null);
        const r = await addVideoFile(f);
        setBusy(false);
        if (r.error) setErr(r.error); else if (r.id) onDone(r.id);
      }} />
      {err && <p className="notice warn">{err}</p>}
    </>
  );
}

export function EmbedSection({ node }: { node: WNode }) {
  const e = node.embed!;
  const video = useEditor(s => (e.videoRef ? s.doc.library.videos.find(v => v.id === e.videoRef) : undefined));
  const [search, setSearch] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null });
  const set = (patch: Parameters<typeof setEmbed>[1], key?: string) => setEmbed(node.id, patch, key);
  const isMap = e.kind === 'gmaps' || e.kind === 'osm';
  const ready = e.kind === 'video' ? !!video : !!embedSrc(e, false);
  const setRatio = (r: number) => useEditor.getState().mutate(pg => { const n = pg.nodes[node.id]; if (n) n.h = Math.round(n.w / r); }, { key: 'embed-ratio' });

  const findAddress = async () => {
    const link = parseOsmLink(e.address);
    if (link) { set({ lat: link.lat, lon: link.lon, ...(link.zoom ? { zoom: link.zoom } : {}) }); setSearch({ busy: false, msg: 'Koordinaten übernommen.' }); return; }
    setSearch({ busy: true, msg: null });
    try {
      const r = await geocode(e.address);
      if (r) { set({ lat: r.lat, lon: r.lon }); setSearch({ busy: false, msg: `Gefunden: ${r.label}` }); }
      else setSearch({ busy: false, msg: 'Adresse nicht gefunden – versuche es z. B. mit „Straße Hausnummer, PLZ Ort“.' });
    } catch {
      setSearch({ busy: false, msg: 'Die Suche ist gerade nicht erreichbar. Du kannst auch einen Link von openstreetmap.org einfügen.' });
    }
  };

  return (
    <Section title={isMap ? 'Karte' : 'Video'}>
      <div className="field">
        <div className="field-label">Art</div>
        <select className="select" value={e.kind} onChange={ev => set({ kind: ev.target.value as EmbedKind }, 'embed-kind')}>
          {isMap ? (
            <>
              <option value="osm">OpenStreetMap (ohne Google)</option>
              <option value="gmaps">Google Maps</option>
            </>
          ) : (
            <>
              <option value="youtube">YouTube</option>
              <option value="vimeo">Vimeo</option>
              <option value="video">Eigene Videodatei</option>
            </>
          )}
        </select>
      </div>

      {(e.kind === 'youtube' || e.kind === 'vimeo') && (
        <div className="field">
          <div className="field-label">Link zum Video</div>
          <input className="textinput" value={e.url} placeholder={e.kind === 'youtube' ? 'https://www.youtube.com/watch?v=…' : 'https://vimeo.com/…'} spellCheck={false}
            onChange={ev => {
              const url = ev.target.value.trim();
              const kind: EmbedKind = vimeoId(url) && !youtubeId(url) ? 'vimeo' : youtubeId(url) ? 'youtube' : e.kind;
              set({ url, kind }, 'embed-url');
            }} />
          {e.url && !ready && <p className="notice warn">Diesen Link erkenne ich nicht. Kopiere die Adresse direkt aus dem Browser oder über „Teilen“.</p>}
          {ready && <div className="field-hint">✓ Video erkannt. {e.kind === 'youtube' ? 'Wird über „youtube-nocookie.com“ eingebunden (weniger Cookies).' : 'Wird mit „Do Not Track“ eingebunden (Vimeo speichert dann keine Statistik-Cookies).'}</div>}
        </div>
      )}

      {isMap && (
        <>
          <div className="field">
            <div className="field-label">Adresse</div>
            <input className="textinput" value={e.address} placeholder="Musterstraße 1, 10115 Berlin" spellCheck={false}
              onChange={ev => set({ address: ev.target.value, ...(e.kind === 'osm' ? { lat: null, lon: null } : {}) }, 'embed-addr')}
              onKeyDown={ev => { if (ev.key === 'Enter' && e.kind === 'osm') findAddress(); }} />
            {e.kind === 'osm' && (
              <div className="row"><button type="button" className="btn grow" disabled={!e.address.trim() || search.busy} onClick={findAddress}>
                <Icons.pin /> {search.busy ? 'Suche …' : 'Auf der Karte finden'}</button></div>
            )}
            {search.msg && <div className="field-hint" aria-live="polite">{search.msg}</div>}
            {e.kind === 'osm' && !ready && !search.msg && <div className="field-hint">Die Adresse wird einmalig bei OpenStreetMap gesucht. Alternativ: Link von openstreetmap.org oder „Breite, Länge“ einfügen.</div>}
          </div>
          <div className="row">
            <NumberField label="Zoom" title="Zoomstufe: 3 = Kontinent, 12 = Stadt, 17 = Straße" min={3} max={19} step={1} precision={0} value={e.zoom}
              onChange={v => set({ zoom: v }, 'embed-zoom')} />
          </div>
        </>
      )}

      {e.kind === 'video' && (
        <div className="field">
          <div className="field-label">Videodatei</div>
          {video ? <div className="field-hint">{video.name} · {(video.size / 1024 / 1024).toFixed(1)} MB · {video.w}×{video.h}</div> : <div className="field-hint">Noch kein Video gewählt (MP4 oder WebM, bis {MAX_VIDEO_MB} MB).</div>}
          <div className="row"><VideoFileButton label={video ? 'Anderes Video …' : 'Video wählen …'} onDone={id => {
            const v = useEditor.getState().doc.library.videos.find(x => x.id === id);
            set({ videoRef: id }, 'embed-video');
            if (v?.w && v.h) setRatio(v.w / v.h);
          }} /></div>
          <label className="check"><input type="checkbox" checked={e.controls} onChange={ev => set({ controls: ev.target.checked }, 'embed-c')} /><span>Steuerung anzeigen (Play, Lautstärke …)</span></label>
          <label className="check"><input type="checkbox" checked={e.autoplay} onChange={ev => set({ autoplay: ev.target.checked }, 'embed-a')} /><span>Automatisch abspielen <span className="muted">(ohne Ton)</span></span></label>
          <label className="check"><input type="checkbox" checked={e.loop} onChange={ev => set({ loop: ev.target.checked }, 'embed-l')} /><span>Endlos wiederholen</span></label>
        </div>
      )}

      <ImagePick label={e.kind === 'video' ? 'Standbild vor dem Abspielen' : 'Vorschaubild'} value={e.poster} onChange={id => set({ poster: id }, 'embed-poster')}
        hint={e.kind === 'video' ? 'Optional. Ohne Bild zeigt der Browser das erste Bild des Videos.' : 'Wird gezeigt, bis Besucher auf „Laden“ klicken. Ohne Bild: Farbfläche (Füllung im Tab Design).'} />

      <div className="field">
        <div className="field-label">Seitenverhältnis</div>
        <div className="seg" role="group" aria-label="Seitenverhältnis">
          {RATIOS.map(([l, r]) => <button key={l} type="button" className="seg-text" onClick={() => setRatio(r)}>{l}</button>)}
        </div>
      </div>
      {EMBED_INFO[e.kind].service && (
        <p className="proto-hint">Datenschutz: Auf der Website sehen Besucher zuerst nur das Vorschaubild. Erst nach Klick auf „Laden“ wird {EMBED_INFO[e.kind].service} geladen. Die Zustimmung gilt bis zum Schließen des Browsers.</p>
      )}
    </Section>
  );
}

/** Für den Prototyp-Tab ohne Auswahl */
export function EmbedInsertSection() {
  const hasRoot = useEditor(s => { void s.pageId; return currentPageHasRoot(); });
  return (
    <Section title="Video & Karte">
      <p className="proto-hint">Wird unten auf dieser Seite eingefügt; danach kannst du es verschieben. Fremde Inhalte (YouTube, Vimeo, Karten) laden erst, wenn Besucher zustimmen.</p>
      <div className="embed-insert">
        <button type="button" className="btn" disabled={!hasRoot} onClick={() => insertEmbed('youtube')}><Icons.play /> Video-Link</button>
        <button type="button" className="btn" disabled={!hasRoot} onClick={() => insertEmbed('osm')}><Icons.pin /> Karte</button>
      </div>
      <div className="row">
        {hasRoot && <VideoFileButton label="Eigenes Video …" onDone={id => insertEmbed('video', id)} />}
      </div>
    </Section>
  );
}
