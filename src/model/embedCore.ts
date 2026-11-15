// Videos & Karten – reine Hilfsfunktionen (ohne Editor-Zustand, auch für Vorschau/Export)
import type { Embed, EmbedKind } from './types';

export const EMBED_INFO: Record<EmbedKind, { label: string; service: string | null; provider: string; w: number; h: number }> = {
  youtube: { label: 'YouTube-Video', service: 'YouTube', provider: 'Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland', w: 640, h: 360 },
  vimeo: { label: 'Vimeo-Video', service: 'Vimeo', provider: 'Vimeo.com Inc., 330 West 34th Street, 5th Floor, New York, NY 10001, USA', w: 640, h: 360 },
  gmaps: { label: 'Google-Karte', service: 'Google Maps', provider: 'Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland', w: 640, h: 400 },
  osm: { label: 'OpenStreetMap-Karte', service: 'OpenStreetMap', provider: 'OpenStreetMap Foundation, St John’s Innovation Centre, Cowley Road, Cambridge, CB4 0WS, Vereinigtes Königreich', w: 640, h: 400 },
  video: { label: 'Video', service: null, provider: '', w: 640, h: 360 },
};

export const MAX_VIDEO_MB = 25;

export const defaultEmbed = (kind: EmbedKind): Embed => ({
  kind, url: '', address: '', lat: null, lon: null, zoom: 15, poster: null, videoRef: null,
  controls: true, autoplay: false, loop: false,
});

/** Video-ID aus einem YouTube-Link */
export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/);
  return m ? m[1] : /^[\w-]{11}$/.test(url.trim()) ? url.trim() : null;
}

/** Video-ID aus einem Vimeo-Link */
export function vimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:.*\/)?(\d{6,})/);
  return m ? m[1] : /^\d{6,}$/.test(url.trim()) ? url.trim() : null;
}

/** Adresse des Players/der Karte (nur mit Zustimmung geladen) */
export function embedSrc(e: Embed, autoplay: boolean): string | null {
  switch (e.kind) {
    case 'youtube': { const id = youtubeId(e.url); return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0${autoplay ? '&autoplay=1' : ''}` : null; }
    case 'vimeo': { const id = vimeoId(e.url); return id ? `https://player.vimeo.com/video/${id}?dnt=1${autoplay ? '&autoplay=1' : ''}` : null; }
    case 'gmaps': return e.address.trim() ? `https://maps.google.com/maps?q=${encodeURIComponent(e.address.trim())}&z=${e.zoom}&output=embed` : null;
    case 'osm': {
      if (e.lat == null || e.lon == null) return null;
      // Ausschnitt passend zur Zoomstufe (ungefähr)
      const d = 360 / Math.pow(2, e.zoom) * 1.2;
      const bbox = [e.lon - d, e.lat - d * 0.6, e.lon + d, e.lat + d * 0.6].map(v => v.toFixed(5)).join(',');
      return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${e.lat.toFixed(6)},${e.lon.toFixed(6)}`;
    }
    default: return null;
  }
}

/** Link zum Öffnen beim Anbieter (für Besucher ohne Zustimmung) */
export function embedOpenUrl(e: Embed): string | null {
  switch (e.kind) {
    case 'youtube': { const id = youtubeId(e.url); return id ? `https://www.youtube.com/watch?v=${id}` : null; }
    case 'vimeo': { const id = vimeoId(e.url); return id ? `https://vimeo.com/${id}` : null; }
    case 'gmaps': return e.address.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.address.trim())}` : null;
    case 'osm': return e.lat != null && e.lon != null ? `https://www.openstreetmap.org/?mlat=${e.lat}&mlon=${e.lon}#map=${e.zoom}/${e.lat}/${e.lon}` : null;
    default: return null;
  }
}

