import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useEditor, pageOf } from '../store';
import { allPages } from '../model/pageRules';
import type { Layout, Page, TextStyleAsset, WDocument } from '../model/types';
import { nodeCss, toReactStyle } from '../model/css';
import { FONTS, WEIGHT_NAMES, ensureFont, fontInfo } from '../model/fonts';
import { pickFiles } from '../model/commands';
import {
  addColorFromSelection, addImageFiles, addTextStyle, applyColor, applyTextStyle, colorUsage, createComponent,
  deleteColor, deleteImage, deleteTextStyle, imageUsage, insertInstance, instanceCount, listComponents, placeImageAsset,
  renameComponent, renameImage, newComponent, openComponent, unmakeComponent, updateColor, updateTextStyle,
  addGradient, applyGradient, deleteGradient, gradientUsage, updateGradient,
} from '../model/library';
import { vectorSvg } from '../model/vectorCore';
import { defaultGradient, gradientCss, gradientLabel } from '../model/gradient';
import { rgba } from '../model/css';
import { Icons } from '../ui/icons';
import { ColorField, IconButton, MOD, NumberField, SHIFT } from '../ui/controls';
import { askConfirm } from '../ui/ConfirmDialog';
import { newAnimation, openAnimation } from '../model/anim';
import { PALETTES, applyPalette, setColorDark } from '../model/theme';

export const ASSET_MIME = 'application/x-webster-asset';

const dragAsset = (kind: 'component' | 'image', id: string) => (e: React.DragEvent) => {
  e.dataTransfer.setData(ASSET_MIME, JSON.stringify({ kind, id }));
  e.dataTransfer.effectAllowed = 'copy';
};

export function AssetsPanel() {
  const doc = useEditor(s => s.doc);
  return (
    <>
      <ComponentsGroup doc={doc} />
      <AnimationsGroup doc={doc} />
      <ColorsGroup doc={doc} />
      <GradientsGroup doc={doc} />
      <TextStylesGroup doc={doc} />
      <ImagesGroup doc={doc} />
    </>
  );
}

function Group({ title, count, actions, children }: { title: string; count: number; actions?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="section asset-group">
      <div className="section-head">
        <button type="button" className="group-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          {open ? <Icons.chevronDown width={12} height={12} /> : <Icons.chevronRight width={12} height={12} />}
          <span>{title}</span><span className="count">{count}</span>
        </button>
        <div className="section-actions">{actions}</div>
      </div>
      {open && children}
    </section>
  );
}

/** Eingabefeld zum Umbenennen (Doppelklick) */
function Rename({ value, onDone }: { value: string; onDone: (v: string | null) => void }) {
  return (
    <input className="rename" autoFocus defaultValue={value} onClick={e => e.stopPropagation()}
      onBlur={e => onDone(e.target.value.trim() || null)}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') onDone(null); }} />
  );
}

// ---------- Komponenten ----------

function ComponentsGroup({ doc }: { doc: WDocument }) {
  const comps = useMemo(() => listComponents(doc).filter(c => !isAnimComp(doc, c.id)), [doc]);
  const hasSel = useEditor(s => s.selection.length > 0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  return (
    <Group title="Komponenten" count={comps.length}
      actions={<IconButton icon={<Icons.plus />}
        title={hasSel ? `Auswahl zur Komponente machen (${MOD}K)` : 'Neue, leere Komponente mit eigenem Board anlegen'}
        onClick={() => (hasSel ? createComponent() : newComponent())} />}>
      {!comps.length ? (
        <p className="hint">Wiederverwendbare Bausteine wie Buttons oder Karten. Mit „+“ legst du eine neue Komponente mit eigenem Board an – oder wähle Ebenen aus und drücke <kbd>{MOD}K</kbd>. Ziehe sie dann von hier auf die Fläche – jede Kopie ändert sich mit, wenn du das Original bearbeitest. Soll eine Kopie eigenständig werden, wähle sie aus und drücke <kbd>{SHIFT}{MOD}K</kbd> (Von Komponente lösen).</p>
      ) : (
        <div className="comp-grid">
          {comps.map(c => {
            const page = allPages(doc).find(p => p.id === c.pageId)!;
            const count = instanceCount(doc, c.id);
            // Varianten: gewählte Variante wird eingefügt (Standard: die erste)
            const chosen = c.variants ? (c.variants.find(v => v.id === pick[c.id]) ?? c.variants[0]).id : c.id;
            return (
              <div key={c.id} className="comp-card" draggable onDragStart={dragAsset('component', chosen)}
                title={`${c.name} – klicken oder auf die Fläche ziehen, um eine Kopie einzufügen (${count} ${count === 1 ? 'Kopie' : 'Kopien'})`}
                onClick={() => insertInstance(chosen)}>
                <div className="comp-thumb"><Thumb page={page} doc={doc} id={chosen} box={104} /></div>
                {c.variants && (
                  <select className="select comp-variant" value={chosen} aria-label={`Variante von ${c.name}`} title="Variante zum Einfügen"
                    onClick={e => e.stopPropagation()} onChange={e => setPick(p => ({ ...p, [c.id]: e.target.value }))}>
                    {c.variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                )}
                <div className="comp-foot">
                  {renaming === c.id
                    ? <Rename value={c.name} onDone={v => { if (v) renameComponent(c.id, v); setRenaming(null); }} />
                    : <span className="comp-name" onDoubleClick={e => { e.stopPropagation(); setRenaming(c.id); }}>{c.name}</span>}
                </div>
                <div className="card-actions" onClick={e => e.stopPropagation()}>
                  <IconButton icon={<Icons.edit />} title="Komponente bearbeiten (öffnet ihr Board)" onClick={() => openComponent(c.id)} />
                  <IconButton icon={<Icons.text />} title="Umbenennen (oder Doppelklick auf den Namen)" onClick={() => setRenaming(c.id)} />
                  <IconButton icon={<Icons.trash />} title="Komponente löschen (Kopien bleiben als normale Ebenen)"
                    onClick={async () => { if (await askConfirm({ title: `Komponente „${c.name}“ löschen?`, message: count ? `Ihr Board wird gelöscht. Die ${count} ${count === 1 ? 'Kopie bleibt' : 'Kopien bleiben'} als normale Ebenen auf den Seiten erhalten. Rückgängig mit ⌘Z.` : 'Ihr Board wird gelöscht. Rückgängig mit ⌘Z.', confirmLabel: 'Löschen', danger: true })) unmakeComponent(c.id); }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Group>
  );
}

// ---------- Komponenten (Animationen) ----------

const isAnimComp = (doc: WDocument, id: string) => !!(doc.componentPages ?? []).some(p => p.nodes[id]?.isMain && p.nodes[id]?.animation);

function AnimationsGroup({ doc }: { doc: WDocument }) {
  const anims = useMemo(() => listComponents(doc).filter(c => isAnimComp(doc, c.id)), [doc]);
  const [renaming, setRenaming] = useState<string | null>(null);
  return (
    <Group title="Komponenten (Animationen)" count={anims.length}
      actions={<IconButton icon={<Icons.plus />} title="Neue Animation zeichnen (öffnet den Animations-Editor)" onClick={newAnimation} />}>
      {!anims.length ? (
        <p className="hint">Eigene Animationen, z. B. animierte Icons oder Diagramme. Mit „+“ legst du eine neue an und zeichnest sie im Animations-Editor. Danach ziehst du sie von hier auf die Fläche – so oft du willst. Änderungen an der Animation gelten überall.</p>
      ) : (
        <>
          <div className="comp-grid">
            {anims.map(c => {
              const page = allPages(doc).find(p => p.id === c.pageId)!;
              const count = instanceCount(doc, c.id);
              return (
                <div key={c.id} className="comp-card anim-card-asset" draggable onDragStart={dragAsset('component', c.id)}
                  title={`${c.name} – auf die Fläche ziehen, um sie einzubauen (${count === 1 ? '1 Stelle' : `${count} Stellen`}). Doppelklick: bearbeiten`}
                  onDoubleClick={() => openAnimation(c.id)}>
                  <div className="comp-thumb"><Thumb page={page} doc={doc} id={c.id} box={104} /><span className="anim-badge" aria-hidden>▶</span></div>
                  <div className="comp-foot">
                    {renaming === c.id
                      ? <Rename value={c.name} onDone={v => { if (v) renameComponent(c.id, v); setRenaming(null); }} />
                      : <span className="comp-name">{c.name}</span>}
                  </div>
                  <div className="card-actions" onClick={e => e.stopPropagation()}>
                    <IconButton icon={<Icons.edit />} title="Animation bearbeiten (öffnet den Animations-Editor)" onClick={() => openAnimation(c.id)} />
                    <IconButton icon={<Icons.text />} title="Umbenennen" onClick={() => setRenaming(c.id)} />
                    <IconButton icon={<Icons.trash />} title="Animation löschen"
                      onClick={async () => { if (await askConfirm({ title: `Animation „${c.name}“ löschen?`, message: count ? `Die ${count === 1 ? 'eingebaute Stelle bleibt' : `${count} eingebauten Stellen bleiben`} als normale Ebenen (ohne Bewegung) erhalten. Rückgängig mit ⌘Z.` : 'Rückgängig mit ⌘Z.', confirmLabel: 'Löschen', danger: true })) unmakeComponent(c.id); }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="hint">Zum Einbauen auf die Fläche ziehen. Doppelklick öffnet den Animations-Editor.</p>
        </>
      )}
    </Group>
  );
}

/** Verkleinerte, statische Darstellung einer Ebene (für Vorschaubilder) */
function Thumb({ page, doc, id, box }: { page: Page; doc: WDocument; id: string; box: number }) {
  const measured = useEditor(s => (s.pageId === page.id ? s.geom[id] : undefined));
  const n = page.nodes[id];
  if (!n) return null;
  const w = measured?.w ?? n.w, h = measured?.h ?? n.h;
  const k = Math.min((box - 12) / Math.max(w, 1), (box * 0.62) / Math.max(h, 1), 1);
  return (
    <div style={{ width: w * k, height: h * k, position: 'relative', overflow: 'hidden' }}>
      <div style={{ width: w, height: h, transform: `scale(${k})`, transformOrigin: '0 0', position: 'absolute', left: 0, top: 0 }}>
        <StaticNode page={page} doc={doc} id={id} parentLayout={null} root size={{ w, h }} />
      </div>
    </div>
  );
}

function StaticNode({ page, doc, id, parentLayout, root, size }: {
  page: Page; doc: WDocument; id: string; parentLayout: Layout | null; root?: boolean; size?: { w: number; h: number };
}) {
  const n = page.nodes[id];
  const family = n?.textStyle?.fontFamily;
  useEffect(() => { if (family) ensureFont(family); }, [family]);
  if (!n || !n.visible) return null;
  const style = toReactStyle(nodeCss(n, parentLayout)) as CSSProperties;
  if (root && size) Object.assign(style, { left: 0, top: 0, width: size.w, height: size.h, transform: undefined, position: 'absolute' });
  if (n.type === 'text') return <div style={style}>{n.text}</div>;
  if (n.type === 'vector') return <div style={style} dangerouslySetInnerHTML={{ __html: vectorSvg(n) }} />;
  if (n.type === 'image') {
    const src = n.imageRef ? doc.library.images.find(i => i.id === n.imageRef)?.src : n.src;
    return <div style={style}>{src && <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: n.objectFit ?? 'cover', display: 'block' }} />}</div>;
  }
  const L = n.type === 'board' ? n.layout : null;
  return <div style={style}>{n.children.map(c => <StaticNode key={c} page={page} doc={doc} id={c} parentLayout={L} />)}</div>;
}

// ---------- Farben ----------

function ColorsGroup({ doc }: { doc: WDocument }) {
  const colors = doc.library.colors;
  const hasSel = useEditor(s => s.selection.length > 0);
  const [editing, setEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  return (
    <Group title="Farben" count={colors.length}
      actions={<IconButton icon={<Icons.plus />} title="Farbe hinzufügen (übernimmt die Farbe der Auswahl)"
        onClick={() => setEditing(addColorFromSelection())} />}>
      <PaletteMenu />
      {!colors.length && <p className="hint">Lege deine Markenfarben hier an. Änderst du eine Farbe, ändert sie sich überall, wo sie verwendet wird.</p>}
      {colors.map(c => (
        <div key={c.id} className={`asset-row${editing === c.id ? ' open' : ''}`}>
          <div className="asset-line" onClick={() => hasSel && applyColor(c.id)}
            title={hasSel ? 'Klicken: als Füllung auf die Auswahl anwenden' : 'Wähle Ebenen aus, um die Farbe anzuwenden'}>
            <span className="swatch-dot" style={{ background: rgba(c.color, c.opacity) }} />
            {c.dark && <span className="swatch-dot" title="Dunkel-Farbe" style={{ background: rgba(c.dark.color, c.dark.opacity), marginLeft: -10 }} />}
            {renaming === c.id
              ? <Rename value={c.name} onDone={v => { if (v) updateColor(c.id, { name: v }); setRenaming(null); }} />
              : <span className="asset-name" onDoubleClick={e => { e.stopPropagation(); setRenaming(c.id); }}>{c.name}</span>}
            <span className="asset-meta">{c.color.replace('#', '')}{c.opacity < 1 ? ` · ${Math.round(c.opacity * 100)} %` : ''}</span>
            <span className="row-actions" onClick={e => e.stopPropagation()}>
              <IconButton icon={<Icons.edit />} title="Farbe bearbeiten" active={editing === c.id} onClick={() => setEditing(editing === c.id ? null : c.id)} />
              <IconButton icon={<Icons.trash />} title={`Löschen (${colorUsage(doc, c.id)}× verwendet – die Farbe bleibt dort erhalten)`} onClick={() => deleteColor(c.id)} />
            </span>
          </div>
          {editing === c.id && (
            <div className="asset-edit">
              <div className="row"><ColorField color={c.color} opacity={c.opacity} onChange={v => updateColor(c.id, { ...(v.color !== undefined ? { color: v.color } : {}), ...(v.opacity !== undefined ? { opacity: v.opacity } : {}) })} /></div>
              <div className="row">
                <span className="lbl" title="Diese Farbe zeigt die Seite, wenn der Besucher sein Gerät auf dunkel gestellt hat (Dunkel-Modus rechts unter „Webseite“ einschalten)">Im Dunkel-Modus</span>
                {c.dark
                  ? <><ColorField color={c.dark.color} opacity={c.dark.opacity} onChange={v => setColorDark(c.id, { color: v.color ?? c.dark!.color, opacity: v.opacity ?? c.dark!.opacity })} />
                    <IconButton icon={<Icons.trash />} title="Keine eigene Dunkel-Farbe" onClick={() => setColorDark(c.id, null)} /></>
                  : <button type="button" className="btn small" onClick={() => setColorDark(c.id, { color: c.color, opacity: c.opacity })}>Dunkel-Farbe festlegen</button>}
              </div>
              <p className="hint">Wird {colorUsage(doc, c.id)}× verwendet. Doppelklick auf den Namen zum Umbenennen.</p>
            </div>
          )}
        </div>
      ))}
    </Group>
  );
}

function PaletteMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="palette-box">
      <button type="button" className="btn small grow" onClick={() => setOpen(!open)} title="Fertige Farbrollen anlegen: Hauptfarbe, Akzent, Hintergrund, Fläche, Text, Text leise – jeweils mit Dunkel-Farbe">
        {open ? 'Farbschema schließen' : 'Farbschema anlegen …'}
      </button>
      {open && (
        <div className="palette-list">
          {PALETTES.map(p => (
            <button key={p.id} type="button" className="palette-item" title={`„${p.name}“ anlegen. Gibt es die Farbrollen schon, werden sie ersetzt – überall, wo sie verwendet werden.`}
              onClick={() => { applyPalette(p); setOpen(false); }}>
              <span className="palette-dots">{p.roles.map(r => <span key={r[0]} style={{ background: r[1] }} />)}</span>
              <span className="palette-dots dark">{p.roles.map(r => <span key={r[0]} style={{ background: r[2] }} />)}</span>
              <span className="palette-name">{p.name}</span>
            </button>
          ))}
          <p className="hint">Obere Reihe hell, untere Reihe dunkel. Danach kannst du jede Farbe einzeln anpassen.</p>
        </div>
      )}
    </div>
  );
}

// ---------- Verläufe ----------

function GradientsGroup({ doc }: { doc: WDocument }) {
  const gradients = doc.library.gradients;
  const sel = useEditor(s => s.selection);
  const page = pageOf(useEditor.getState());
  const [editing, setEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const add = () => {
    // Verlauf der Auswahl übernehmen, sonst ein Standardverlauf
    const f = sel.map(id => page?.nodes[id]?.fills[0]).find(Boolean);
    setEditing(addGradient(f?.gradient ?? defaultGradient(f?.color)));
  };
  return (
    <Group title="Verläufe" count={gradients.length}
      actions={<IconButton icon={<Icons.plus />} title="Verlauf hinzufügen (übernimmt den Verlauf der Auswahl)" onClick={add} />}>
      {!gradients.length && <p className="hint">Speichere Farbverläufe hier, um sie mehrfach zu verwenden. Änderst du einen Verlauf, ändert er sich überall.</p>}
      {gradients.map(a => (
        <div key={a.id} className={`asset-row${editing === a.id ? ' open' : ''}`}>
          <div className="asset-line" onClick={() => sel.length && applyGradient(a.id)}
            title={sel.length ? 'Klicken: als Füllung auf die Auswahl anwenden' : 'Wähle Ebenen aus, um den Verlauf anzuwenden'}>
            <span className="swatch-dot" style={{ background: gradientCss(a.gradient) }} />
            {renaming === a.id
              ? <Rename value={a.name} onDone={v => { if (v) updateGradient(a.id, { name: v }); setRenaming(null); }} />
              : <span className="asset-name" onDoubleClick={e => { e.stopPropagation(); setRenaming(a.id); }}>{a.name}</span>}
            <span className="asset-meta">{gradientLabel(a.gradient)}</span>
            <span className="row-actions" onClick={e => e.stopPropagation()}>
              <IconButton icon={<Icons.edit />} title="Verlauf bearbeiten" active={editing === a.id} onClick={() => setEditing(editing === a.id ? null : a.id)} />
              <IconButton icon={<Icons.trash />} title={`Löschen (${gradientUsage(doc, a.id)}× verwendet – der Verlauf bleibt dort erhalten)`} onClick={() => deleteGradient(a.id)} />
            </span>
          </div>
          {editing === a.id && (
            <div className="asset-edit">
              <div className="row">
                <ColorField color={a.gradient.stops[0]?.color ?? '#000000'} gradient={a.gradient} gradientOnly
                  onChange={v => { if (v.gradient) updateGradient(a.id, { gradient: v.gradient }); }} />
              </div>
              <p className="hint">Wird {gradientUsage(doc, a.id)}× verwendet. Doppelklick auf den Namen zum Umbenennen.</p>
            </div>
          )}
        </div>
      ))}
    </Group>
  );
}

// ---------- Textstile ----------

function TextStylesGroup({ doc }: { doc: WDocument }) {
  const styles = doc.library.textStyles;
  const textSel = useEditor(s => s.selection.some(id => pageOf(s).nodes[id]?.type === 'text'));
  const [editing, setEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  useEffect(() => { styles.forEach(t => ensureFont(t.style.fontFamily)); }, [styles]);
  return (
    <Group title="Textstile" count={styles.length}
      actions={<IconButton icon={<Icons.plus />} title="Textstil hinzufügen (übernimmt den ausgewählten Text)" onClick={() => setEditing(addTextStyle())} />}>
      {!styles.length && <p className="hint">Z. B. „Überschrift 1“ oder „Fließtext“. Änderst du einen Textstil, ändern sich alle Texte, die ihn verwenden.</p>}
      {styles.map(t => (
        <div key={t.id} className={`asset-row${editing === t.id ? ' open' : ''}`}>
          <div className="asset-line" onClick={() => textSel && applyTextStyle(t.id)}
            title={textSel ? 'Klicken: auf den ausgewählten Text anwenden' : 'Wähle einen Text aus, um den Stil anzuwenden'}>
            <span className="ts-preview" style={{ fontFamily: `"${t.style.fontFamily}"`, fontWeight: t.style.fontWeight, fontStyle: t.style.italic ? 'italic' : undefined }}>Aa</span>
            {renaming === t.id
              ? <Rename value={t.name} onDone={v => { if (v) updateTextStyle(t.id, { name: v }); setRenaming(null); }} />
              : <span className="asset-name" onDoubleClick={e => { e.stopPropagation(); setRenaming(t.id); }}>{t.name}</span>}
            <span className="asset-meta">{t.style.fontSize} px</span>
            <span className="row-actions" onClick={e => e.stopPropagation()}>
              <IconButton icon={<Icons.edit />} title="Textstil bearbeiten" active={editing === t.id} onClick={() => setEditing(editing === t.id ? null : t.id)} />
              <IconButton icon={<Icons.trash />} title="Löschen (Texte behalten ihr Aussehen)" onClick={() => deleteTextStyle(t.id)} />
            </span>
          </div>
          {editing === t.id && <TextStyleEditor asset={t} />}
        </div>
      ))}
    </Group>
  );
}

function TextStyleEditor({ asset }: { asset: TextStyleAsset }) {
  const st = asset.style;
  const set = (patch: Partial<TextStyleAsset['style']>) => updateTextStyle(asset.id, { style: patch });
  const info = fontInfo(st.fontFamily);
  const weights = info?.weights ?? [100, 200, 300, 400, 500, 600, 700, 800, 900];
  return (
    <div className="asset-edit">
      <div className="row">
        <select className="select grow" value={st.fontFamily} aria-label="Schriftart"
          onChange={e => {
            const f = fontInfo(e.target.value);
            const w = f && !f.weights.includes(st.fontWeight) ? f.weights.reduce((a, b) => (Math.abs(b - st.fontWeight) < Math.abs(a - st.fontWeight) ? b : a)) : st.fontWeight;
            set({ fontFamily: e.target.value, fontWeight: w });
          }}>
          {!info && <option value={st.fontFamily}>{st.fontFamily}</option>}
          <optgroup label="Google Fonts">{FONTS.filter(f => !f.system).map(f => <option key={f.family} value={f.family}>{f.family}</option>)}</optgroup>
          <optgroup label="Systemschriften">{FONTS.filter(f => f.system).map(f => <option key={f.family} value={f.family}>{f.family}</option>)}</optgroup>
        </select>
      </div>
      <div className="row">
        <select className="select grow" value={st.fontWeight} aria-label="Schriftschnitt" onChange={e => set({ fontWeight: Number(e.target.value) })}>
          {weights.map(w => <option key={w} value={w}>{w} {WEIGHT_NAMES[w]}</option>)}
        </select>
        <NumberField className="w72" title="Schriftgröße" suffix="px" min={1} value={st.fontSize} onChange={v => set({ fontSize: v })} />
      </div>
      <div className="row">
        <NumberField label="ZH" title="Zeilenhöhe" min={0} step={0.05} value={st.lineHeight} onChange={v => set({ lineHeight: v })} />
        <NumberField label="LW" title="Laufweite" suffix="px" step={0.1} value={st.letterSpacing} onChange={v => set({ letterSpacing: v })} />
      </div>
      <div className="row">
        <select className="select grow" value={st.transform} aria-label="Groß-/Kleinschreibung" onChange={e => set({ transform: e.target.value as TextStyleAsset['style']['transform'] })}>
          <option value="none">Normale Schreibung</option><option value="uppercase">GROSSBUCHSTABEN</option>
          <option value="lowercase">kleinbuchstaben</option><option value="capitalize">Wortanfänge Groß</option>
        </select>
        <IconButton icon={<Icons.italic />} title="Kursiv" active={st.italic} onClick={() => set({ italic: !st.italic })} />
      </div>
    </div>
  );
}

// ---------- Bilder ----------

function ImagesGroup({ doc }: { doc: WDocument }) {
  const images = doc.library.images;
  const [renaming, setRenaming] = useState<string | null>(null);
  return (
    <Group title="Bilder" count={images.length}
      actions={<IconButton icon={<Icons.plus />} title="Bilder hochladen" onClick={async () => addImageFiles(await pickFiles('image/*', true))} />}>
      {!images.length && <p className="hint">Alle Bilder, die du einfügst, landen automatisch hier und können beliebig oft verwendet werden.</p>}
      <div className="img-grid">
        {images.map(img => {
          const used = imageUsage(doc, img.id);
          return (
            <div key={img.id} className="img-card" draggable onDragStart={dragAsset('image', img.id)}
              title={`${img.name} (${img.w} × ${img.h}) – klicken oder auf die Fläche ziehen`} onClick={() => placeImageAsset(img.id)}>
              <img src={img.src} alt={img.name} draggable={false} />
              {renaming === img.id
                ? <Rename value={img.name} onDone={v => { if (v) renameImage(img.id, v); setRenaming(null); }} />
                : <span className="img-name" onDoubleClick={e => { e.stopPropagation(); setRenaming(img.id); }}>{img.name}</span>}
              <div className="card-actions" onClick={e => e.stopPropagation()}>
                <IconButton icon={<Icons.trash />} title="Aus der Bibliothek entfernen"
                  onClick={async () => { if (!used || await askConfirm({ title: `„${img.name}“ aus der Bibliothek entfernen?`, message: `Das Bild wird ${used}× verwendet. Die verwendeten Bilder bleiben auf der Fläche erhalten.`, confirmLabel: 'Entfernen', danger: true })) deleteImage(img.id); }} />
              </div>
            </div>
          );
        })}
      </div>
    </Group>
  );
}
