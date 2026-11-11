// App shell: loads the project, opens the live link, and routes between views.
import { useEffect, useMemo, useRef, useState } from 'react';

import { buildPatch } from '../shared/patch.js';
import { ChasesView } from './components/ChasesView.jsx';
import { CommandPalette } from './components/CommandPalette.jsx';
import { ControlView } from './components/ControlView.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { FixturesView } from './components/FixturesView.jsx';
import { HomeView } from './components/HomeView.jsx';
import { MonitorView } from './components/MonitorView.jsx';
import { PatchView } from './components/PatchView.jsx';
import { PerformView } from './components/PerformView.jsx';
import { ScenesView } from './components/ScenesView.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { StageBar } from './components/StageBar.jsx';
import { StageView } from './components/StageView.jsx';
import { ToastRegion } from './components/ToastRegion.jsx';
import { TopBar } from './components/TopBar.jsx';
import { Welcome } from './components/Welcome.jsx';
import { buildCommands } from './utils/commands.js';
import { useLive } from './hooks/useLive.js';
import { useProject } from './hooks/useProject.js';
import { useToasts } from './hooks/useToasts.js';
import { useTheme } from './hooks/useTheme.js';

const WELCOME_KEY = 'odmx-welcomed';

function hasSeenWelcome() {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return false;
  }
}

// Which screens have something running: shown as a dot in the navigation.
function liveViews(engine) {
  const views = [];
  if (engine.activeChaseId) {
    views.push('chases', 'perform');
  } else if (engine.activeSceneId) {
    views.push('scenes');
  }
  if (engine.programmerChannels.length > 0) {
    views.push('control');
  }
  return views;
}

export function App() {
  const [view, setView] = useState('home');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [welcomed, setWelcomed] = useState(hasSeenWelcome);
  const { project, library, update, flush, replace, saveStatus, error } = useProject();
  const live = useLive();
  const { toasts, notify } = useToasts();
  const { theme, toggle: toggleTheme } = useTheme();

  // The welcome only appears for a brand-new rig; remember that from the first load so it can finish its steps.
  const startedEmpty = useRef(null);
  if (project && startedEmpty.current === null) {
    startedEmpty.current = project.fixtures.length === 0;
  }

  // Ctrl or Command + K opens the search palette from anywhere.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
      <div className="splash" role="status">
        <div className="splash-mark" aria-hidden="true" />
        <p>Loading…</p>
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
    setView('home');
  };

  const shared = { project, library, patch, update, flush, live, replaceProject: replace };
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
      <Sidebar
        current={view}
        onSelect={setView}
        liveViews={liveViews(live.engine)}
        output={live.output}
        isServerUp={live.connected}
        onOpenOutput={() => setView('monitor')}
      />
      <TopBar
        projectName={project.name}
        onRename={(name) => update((current) => ({ ...current, name: name.trim() === '' ? 'Untitled show' : name }))}
        saveStatus={saveStatus}
        connected={live.connected}
        output={live.output}
        engine={live.engine}
        send={live.send}
        onOpenOutput={() => setView('monitor')}
        onOpenSearch={() => setIsSearchOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main className="main">
        {error ? (
          <div className="error-banner" role="alert">
            {error}
          </div>
        ) : null}
        {live.isVersionMismatch ? (
          <div className="error-banner" role="alert">
            This page and the server are different versions. Reload the page to update.
          </div>
        ) : null}
        <ErrorBoundary key={view} label="this screen">
          {view === 'home' ? <HomeView {...shared} navigate={setView} /> : null}
          {view === 'control' ? <ControlView {...shared} /> : null}
          {view === 'scenes' ? <ScenesView {...shared} /> : null}
          {view === 'chases' ? <ChasesView {...shared} /> : null}
          {view === 'perform' ? <PerformView {...shared} /> : null}
          {view === 'patch' ? <PatchView {...shared} /> : null}
          {view === 'fixtures' ? <FixturesView {...shared} /> : null}
          {view === 'monitor' ? <MonitorView {...shared} /> : null}
        </ErrorBoundary>
      </main>
      <CommandPalette
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onRun={(command) => notify(command.label)}
        commands={buildCommands({ project, engine: live.engine, theme })}
        context={{ send: live.send, flush, navigate: setView, toggleTheme }}
      />
      <div className="dock">
        <StageBar engine={live.engine} project={project} send={live.send} onNavigate={setView} currentView={view} />
        <StageView project={project} patch={patch} />
      </div>
      <ToastRegion toasts={toasts} />
    </div>
  );
}
