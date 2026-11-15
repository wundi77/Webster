import { useEffect } from 'react';
import { useEditor } from './store';
import { useShortcuts } from './shortcuts';
import { TopBar } from './panels/TopBar';
import { LeftPanel } from './panels/LeftPanel';
import { RightPanel } from './panels/RightPanel';
import { Toolbar } from './panels/Toolbar';
import { Canvas } from './canvas/Canvas';
import { ExportDialog } from './panels/ExportDialog';
import { PublishDialog } from './panels/PublishDialog';
import { IconPicker } from './panels/IconPicker';
import { ProjectDialog } from './panels/ProjectDialog';
import { ClaudeNote } from './claude/ClaudeUI';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { ComponentBar } from './panels/ComponentBar';

export function App() {
  const theme = useEditor(s => s.theme);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useShortcuts();
  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <aside className="sidebar left" aria-label="Seiten und Ebenen"><LeftPanel /></aside>
        <div className="canvas-wrap">
          <Canvas />
          <Toolbar />
          <ClaudeNote />
          <ComponentBar />
        </div>
        <aside className="sidebar right" aria-label="Eigenschaften"><RightPanel /></aside>
      </div>
      <ExportDialog />
      <PublishDialog />
      <IconPicker />
      <ProjectDialog />
      <ConfirmDialog />
    </div>
  );
}
