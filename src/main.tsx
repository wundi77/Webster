import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

if (location.hash.startsWith('#preview')) {
  // Vorschau-Tab: nur die Vorschau laden (kein Editor, kein Speichern)
  import('./preview/PreviewApp').then(({ PreviewApp }) => root.render(<StrictMode><PreviewApp /></StrictMode>));
} else {
  (async () => {
    // Zuerst das bisherige Dokument retten, bevor irgendetwas die Notfallkopie überschreiben kann
    const persist = await import('./persist');
    await persist.preserveLegacyDocument().catch(() => {});
    const [backup, meta, legacy] = await Promise.all([
      persist.loadSavedDocument().catch(() => null), persist.loadBackupMeta(), persist.loadLegacyDocument().catch(() => null),
    ]);
    const [{ App }, { useEditor }, { useStartup }] = await Promise.all([import('./App'), import('./store'), import('./panels/ProjectDialog')]);
    useStartup.setState({ backup, meta: meta ?? null, legacy });
    document.documentElement.dataset.theme = useEditor.getState().theme;
    root.render(<StrictMode><App /></StrictMode>);
  })();
}
