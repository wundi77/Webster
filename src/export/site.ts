// Exportiert das Dokument als fertige Website (ZIP-Ordner):
// index.html + eine Datei pro Seite, css/style.css, bilder/, fonts/
import { strToU8, zipSync, type Zippable } from 'fflate';
import type { WDocument, WNode } from '../model/types';
import { slug } from '../model/css';
import { fontHrefFor, type FontUse } from '../model/fonts';
import { defaultSeo, defaultSite } from '../model/factory';
import { LOTTIE_PLAYER } from './lottiePlayer';
import { BASE_CSS, EMBED_CSS, EMBED_JS, MOTION_CSS, MOTION_JS, LOTTIE_JS, siteFxCss, darkModeCss, FORM_CSS, FORM_JS, NAV_CSS, NAV_JS, REVEAL_JS, scrollJs, classNames, esc, groupFonts, pageFiles, renderPageParts, siteRoot } from './html';

export interface ExportWarning { pageId: string | null; text: string }

export interface ExportResult {
  files: Record<string, Uint8Array>;
  warnings: ExportWarning[];
  zip: Uint8Array;
  fileName: string;
}

const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/svg+xml': 'svg', 'image/avif': 'avif', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico',
};

function dataUrlBytes(url: string): { bytes: Uint8Array; mime: string } | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!m) return null;
  const mime = m[1] || 'application/octet-stream';
  if (m[2]) {
    const bin = atob(m[3]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime };
  }
  return { bytes: strToU8(decodeURIComponent(m[3])), mime };
}

async function fetchBytes(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return { bytes: new Uint8Array(await r.arrayBuffer()), mime: r.headers.get('content-type')?.split(';')[0] ?? '' };
  } catch { return null; }
}

/** Lädt die verwendeten Google-Schriften herunter und schreibt eine eigene fonts.css */
async function selfHostFonts(groups: Map<string, FontUse[]>, files: Record<string, Uint8Array>): Promise<{ ok: boolean; failed: string[] }> {
  const parts: string[] = [];
  const failed: string[] = [];
  for (const [family, uses] of groups) {
    const href = fontHrefFor(family, uses);
    if (!href) continue;
    try {
      const r = await fetch(href);
      if (!r.ok) throw new Error(String(r.status));
      const css = await r.text();
      // Nur lateinische Zeichensätze (deckt Deutsch & Westeuropa ab)
      const blocks = css.split(/(?=\/\*\s*[\w-]+\s*\*\/)/).filter(b => /\/\*\s*latin(-ext)?\s*\*\//.test(b));
      const use = blocks.length ? blocks : [css];
      let out = '';
      for (const b of use) {
        let block = b;
        for (const m of b.matchAll(/url\((https:[^)]+)\)/g)) {
          const url = m[1];
          const file = url.split('/').pop()!.replace(/[^\w.-]/g, '');
          const name = `${slug(family)}-${file}`;
          if (!files[`fonts/${name}`]) {
            const got = await fetchBytes(url);
            if (!got) throw new Error('download');
            files[`fonts/${name}`] = got.bytes;
          }
          block = block.replace(url, `../fonts/${name}`);
        }
        out += block.trim() + '\n';
      }
      parts.push(out);
    } catch {
      failed.push(family);
    }
  }
  if (parts.length) files['css/fonts.css'] = strToU8(parts.join('\n'));
  return { ok: !failed.length, failed };
}

/** "www.meine-seite.de" → "https://www.meine-seite.de" */
export const normalizeUrl = (u: string) => {
  const t = u.trim();
  return !t || /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, '')}`;
};

export interface ExportOptions { selfHostFonts: boolean }

export async function exportSite(doc: WDocument, opts: ExportOptions): Promise<ExportResult> {
  const site = { ...defaultSite(), ...doc.site };
  site.url = normalizeUrl(site.url);
  const files: Record<string, Uint8Array> = {};
  const warnings: ExportWarning[] = [];
  const names = classNames(doc);
  const pages = pageFiles(doc);
  const cls = (id: string) => names.get(id) ?? 'n' + id;

  // Bilder: eine Datei pro Bild der Bibliothek (nur die verwendeten)
  const imgPath = new Map<string, string>();   // imageId oder src → Pfad relativ zur Website
  const usedNames = new Set<string>();
  const addImage = async (key: string, src: string, name: string): Promise<string> => {
    if (imgPath.has(key)) return imgPath.get(key)!;
    const got = dataUrlBytes(src) ?? (/^https?:/.test(src) ? await fetchBytes(src) : null);
    if (!got) { imgPath.set(key, src); return src; }
    const ext = EXT[got.mime] ?? (src.match(/\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/i)?.[1].toLowerCase() ?? 'png');
    let base = slug(name.replace(/\.[a-z0-9]+$/i, '')) || 'bild', file = `${base}.${ext}`, i = 2;
    while (usedNames.has(file)) file = `${base}-${i++}.${ext}`;
    usedNames.add(file);
    files[`bilder/${file}`] = got.bytes;
    imgPath.set(key, `bilder/${file}`);
    return `bilder/${file}`;
  };
  const vidPath = new Map<string, string>();
  const libImage = (id: string | null | undefined) => (id ? doc.library.images.find(i => i.id === id) : undefined);

  for (const page of doc.pages) {
    const root = siteRoot(page);
    if (!root) continue;
    const walk = async (id: string) => {
      const n = page.nodes[id];
      if (!n) return;
      if (n.type === 'image') {
        const a = libImage(n.imageRef);
        if (a) await addImage(a.id, a.src, a.name);
        else if (n.src) await addImage(n.src, n.src, n.name);
      }
      if (n.embed) {
        const p = libImage(n.embed.poster);
        if (p) await addImage(p.id, p.src, p.name);
        const v = n.embed.videoRef ? doc.library.videos.find(x => x.id === n.embed!.videoRef) : undefined;
        if (v && !vidPath.has(v.id)) {
          const got = dataUrlBytes(v.src);
          if (got) {
            const ext = /webm/.test(got.mime) ? 'webm' : 'mp4';
            let base = slug(v.name) || 'video', file = `${base}.${ext}`, i = 2;
            while (files[`videos/${file}`]) file = `${base}-${i++}.${ext}`;
            files[`videos/${file}`] = got.bytes;
            vidPath.set(v.id, `videos/${file}`);
          }
        }
      }
      for (const c of n.children) await walk(c);
    };
    await walk(root.id);
  }
  const imageSrc = (n: WNode) => {
    const a = libImage(n.imageRef);
    return (a ? imgPath.get(a.id) : n.src ? imgPath.get(n.src) ?? n.src : '') ?? '';
  };

  // Seiten
  const cssSections: string[] = [];
  let anyNav = false;
  let anyForm = false;
  let anyEmbed = false;
  let anyMotion = false;
  const allFonts: FontUse[] = [];
  const bodies: { pageId: string; file: string; html: string }[] = [];
  const favicon = libImage(site.favicon);
  const faviconPath = favicon ? await addImage(favicon.id, favicon.src, 'favicon-' + favicon.name) : null;
  const absUrl = (p: string) => (site.url ? site.url.replace(/\/+$/, '') + '/' + p : p);

  for (const page of doc.pages) {
    const file = pages.get(page.id)!;
    const seo = { ...defaultSeo(), ...page.seo };
    const pageCls = `seite-${file.replace(/\.html$/, '')}`;
    const parts = renderPageParts({
      doc, page, cls, imageSrc, pretty: true,
      asset: (k, id) => (k === 'image' ? imgPath.get(id) : vidPath.get(id)) ?? '', scope: doc.pages.length > 1 ? `.${pageCls}` : undefined,
      pageLink: id => ({ href: pages.get(id) ?? 'index.html' }),
    });
    if (parts.empty) parts.body = '';
    if (parts.empty) warnings.push({ pageId: page.id, text: 'Hat kein Board – die Seite bleibt leer.' });
    if (!seo.title) warnings.push({ pageId: page.id, text: 'Kein Seitentitel – es wird der Seitenname verwendet.' });
    if (!seo.description) warnings.push({ pageId: page.id, text: 'Keine Beschreibung für Suchmaschinen.' });
    allFonts.push(...parts.fonts);
    cssSections.push(`/* ===== Seite: ${page.name.replace(/\*\//g, '')} (${file}) ===== */\n\nbody.${pageCls} {\n  background: ${parts.background};\n}\n\n${parts.css}`);

    const title = seo.title || `${page.name} – ${site.name || doc.name}`;
    const head = [
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${esc(title)}</title>`,
      seo.description ? `<meta name="description" content="${esc(seo.description)}">` : '',
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="${esc(title)}">`,
      seo.description ? `<meta property="og:description" content="${esc(seo.description)}">` : '',
      site.name ? `<meta property="og:site_name" content="${esc(site.name)}">` : '',
      site.url ? `<meta property="og:url" content="${esc(absUrl(file === 'index.html' ? '' : file))}">` : '',
      faviconPath ? `<link rel="icon" href="${esc(faviconPath)}">` : '',
      '%%FONTS%%',
      '<link rel="stylesheet" href="css/style.css">',
      site.analytics?.domain ? `<script defer data-domain="${esc(site.analytics.domain)}" src="${esc((site.analytics.host?.replace(/\/+$/, '') || 'https://plausible.io') + '/js/script.js')}"></script>` : '',
      site.headCode?.trim() ? site.headCode.trim() : '',
    ].filter(Boolean).map(l => '  ' + l).join('\n');
    const scripts = [/data-reveal=/.test(parts.body) ? REVEAL_JS : '', parts.scroll ? scrollJs(parts.scroll) : '', parts.nav ? NAV_JS : '', parts.form ? FORM_JS : '', parts.embed ? EMBED_JS : '', parts.motion ? MOTION_JS : ''].filter(Boolean);
    if (parts.embed) anyEmbed = true;
    if (parts.motion) anyMotion = true;
    if (parts.nav) anyNav = true;
    if (parts.form) anyForm = true;
    let reveal = scripts.length ? `\n<script>\n${scripts.join('\n')}\n</script>` : '';
    if (parts.lottie) {
      // Abspieler für fertige Animationen: einmal als Datei, auf jeder Seite nur eingebunden
      if (!files['js/lottie.min.js']) files['js/lottie.min.js'] = strToU8(LOTTIE_PLAYER);
      reveal += `\n<script src="js/lottie.min.js"></script>\n<script>\n${LOTTIE_JS}\n</script>`;
    }
    bodies.push({
      pageId: page.id, file,
      html: `<!doctype html>\n<html lang="${esc(site.lang || 'de')}">\n<head>\n${head}\n</head>\n<body class="${pageCls}">\n${parts.body}${reveal}${site.bodyCode?.trim() ? '\n' + site.bodyCode.trim() : ''}\n</body>\n</html>\n`,
    });
  }

  // Schriften
  const groups = groupFonts(allFonts);
  let fontLinks = '';
  if ([...groups.keys()].some(f => fontHrefFor(f, []))) {
    if (opts.selfHostFonts) {
      const r = await selfHostFonts(groups, files);
      if (files['css/fonts.css']) fontLinks = '<link rel="stylesheet" href="css/fonts.css">';
      if (r.failed.length) {
        warnings.push({ pageId: null, text: `Schriften konnten nicht heruntergeladen werden (${r.failed.join(', ')}) – sie werden stattdessen von Google geladen.` });
        fontLinks += [...groups].filter(([f]) => r.failed.includes(f)).map(([f, u]) => `<link rel="stylesheet" href="${esc(fontHrefFor(f, u)!)}">`).join('\n  ');
      }
    } else {
      fontLinks = [...groups].map(([f, u]) => fontHrefFor(f, u)).filter(Boolean).map(h => `<link rel="stylesheet" href="${esc(h!)}">`).join('\n  ');
    }
  }
  for (const b of bodies) {
    files[b.file] = strToU8(b.html.replace(fontLinks ? '%%FONTS%%' : '  %%FONTS%%\n', fontLinks));
  }

  // Für Suchmaschinen (nur mit bekannter Adresse sinnvoll)
  if (site.url) {
    const base = site.url.replace(/\/+$/, '');
    const today = new Date().toISOString().slice(0, 10);
    const urls = bodies.filter(b => !doc.pages.find(p => p.id === b.pageId && !siteRoot(p)))
      .map(b => `  <url><loc>${esc(`${base}/${b.file === 'index.html' ? '' : b.file}`)}</loc><lastmod>${today}</lastmod></url>`);
    files['sitemap.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
    files['robots.txt'] = strToU8(`User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);
  } else {
    files['robots.txt'] = strToU8('User-agent: *\nAllow: /\n');
  }

  files['css/style.css'] = strToU8(`/* Erstellt mit Webster */\n\n${BASE_CSS}\n\n${anyNav ? NAV_CSS + '\n\n' : ''}${anyForm ? FORM_CSS + '\n\n' : ''}${anyEmbed ? EMBED_CSS + '\n\n' : ''}${anyMotion ? MOTION_CSS + '\n\n' : ''}${siteFxCss(site) ? siteFxCss(site) + '\n\n' : ''}${darkModeCss(doc) ? darkModeCss(doc) + '\n\n' : ''}${cssSections.join('\n\n')}\n${site.css?.trim() ? `\n/* ===== Eigenes CSS der Website ===== */\n\n${site.css.trim()}\n` : ''}`);

  const zipInput: Zippable = {};
  const folder = slug(site.name || doc.name) || 'website';
  for (const [p, bytes] of Object.entries(files)) zipInput[`${folder}/${p}`] = [bytes, { level: /\.(png|jpe?g|webp|gif|avif|woff2?|mp4|webm)$/.test(p) ? 0 : 6 }];
  const zip = zipSync(zipInput);
  return { files, warnings, zip, fileName: `${folder}-website.zip` };
}

/** Bietet die ZIP-Datei zum Herunterladen an */
export function downloadZip(res: ExportResult) {
  const blob = new Blob([res.zip as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = res.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
