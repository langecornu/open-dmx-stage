// App shell: loads the project, opens the live link, and routes between views.
import { useMemo, useRef, useState } from 'react';

import { buildPatch } from '../shared/patch.js';
import { ChasesView } from './components/ChasesView.jsx';
import { ControlView } from './components/ControlView.jsx';
import { MonitorView } from './components/MonitorView.jsx';
import { PatchView } from './components/PatchView.jsx';
import { ScenesView } from './components/ScenesView.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { TopBar } from './components/TopBar.jsx';
import { Welcome } from './components/Welcome.jsx';
import { useLive } from './hooks/useLive.js';
import { useProject } from './hooks/useProject.js';
import { useTheme } from './hooks/useTheme.js';

const WELCOME_KEY = 'odmx-welcomed';

function hasSeenWelcome() {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return false;
  }
}

export function App() {
  const [view, setView] = useState('control');
  const [welcomed, setWelcomed] = useState(hasSeenWelcome);
  const { project, library, update, flush, saveStatus, error } = useProject();
  const live = useLive();
  const { theme, toggle: toggleTheme } = useTheme();

  // The welcome only appears for a brand-new rig; remember that from the first load so it can finish its steps.
  const startedEmpty = useRef(null);
  if (project && startedEmpty.current === null) {
    startedEmpty.current = project.fixtures.length === 0;
  }

  const patch = useMemo(() => (project ? buildPatch(project, library) : null), [project, library]);

  if (error && !project) {
    return (
      <div className="main">
        <div className="error-banner">Could not load the project: {error}</div>
      </div>
    );
  }
  if (!project || !patch) {
    return (
      <div className="main" role="status">
        Loading…
      </div>
    );
  }

  const handleWelcomeDone = () => {
    try {
      localStorage.setItem(WELCOME_KEY, '1');
    } catch {
      // Storage may be blocked; the welcome simply shows again next time.
    }
    setWelcomed(true);
    setView('control');
  };

  const shared = { project, library, patch, update, flush, live };
  return (
    <div className="shell">
      {!welcomed && startedEmpty.current ? (
        <Welcome
          project={project}
          library={library}
          patch={patch}
          update={update}
          output={live.output}
          onDone={handleWelcomeDone}
        />
      ) : null}
      <Sidebar current={view} onSelect={setView} />
      <TopBar
        projectName={project.name}
        onRename={(name) => update((current) => ({ ...current, name: name.trim() === '' ? 'Untitled show' : name }))}
        saveStatus={saveStatus}
        connected={live.connected}
        output={live.output}
        engine={live.engine}
        send={live.send}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main className="main">
        {error ? (
          <div className="error-banner" role="alert">
            {error}
          </div>
        ) : null}
        {view === 'control' ? <ControlView {...shared} /> : null}
        {view === 'scenes' ? <ScenesView {...shared} /> : null}
        {view === 'chases' ? <ChasesView {...shared} /> : null}
        {view === 'patch' ? <PatchView {...shared} /> : null}
        {view === 'monitor' ? <MonitorView {...shared} /> : null}
      </main>
    </div>
  );
}
