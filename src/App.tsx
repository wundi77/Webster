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
import { AnimBar } from './panels/AnimBar';
import { SidebarResizer, useSidebarWidth } from './ui/SidebarResizer';

export function App() {
  const theme = useEditor(s => s.theme);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useShortcuts();
  const [lw, setLw] = useSidebarWidth('left');
  const [rw, setRw] = useSidebarWidth('right');
  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <aside className="sidebar left" aria-label="Seiten und Ebenen" style={{ width: lw }}><LeftPanel /></aside>
        <SidebarResizer side="left" width={lw} onChange={setLw} />
        <div className="canvas-wrap">
          <Canvas />
          <Toolbar />
          <ClaudeNote />
          <ComponentBar />
          <AnimBar />
        </div>
        <SidebarResizer side="right" width={rw} onChange={setRw} />
        <aside className="sidebar right" aria-label="Eigenschaften" style={{ width: rw }}><RightPanel /></aside>
      </div>
      <ExportDialog />
      <PublishDialog />
      <IconPicker />
      <ProjectDialog />
      <ConfirmDialog />
    </div>
  );
}
