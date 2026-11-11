// Top bar: show name, status, master brightness, theme switch and blackout.
import { Icon } from './Icon.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';

const SAVE_LABELS = { saved: 'Saved', saving: 'Saving…', pending: 'Unsaved', error: 'Save failed' };

export function TopBar({
  projectName,
  onRename,
  saveStatus,
  connected,
  output,
  engine,
  send,
  onOpenOutput,
  theme,
  onToggleTheme,
}) {
  const outputReady = connected && output?.connected;
  const outputLabel = !connected
    ? 'Server offline'
    : output?.driver === 'mock'
      ? 'Simulator'
      : output?.connected
        ? 'DMX ready'
        : 'DMX not connected';

  return (
    <header className="topbar">
      <input
        className="show-name"
        value={projectName}
        maxLength={80}
        aria-label="Show name"
        onChange={(event) => onRename(event.target.value)}
      />
      <span className="pill" role="status">
        <span className={`dot ${outputReady ? 'dot-ok' : 'dot-bad'}`} />
        <span className="pill-text">{outputLabel}</span>
        {!outputReady && onOpenOutput ? (
          <button type="button" className="pill-action" onClick={onOpenOutput}>
            Fix
          </button>
        ) : null}
      </span>
      <span className={`pill pill-save pill-save-${saveStatus}`}>
        {saveStatus === 'saved' ? <Icon name="check" size={14} /> : null}
        {SAVE_LABELS[saveStatus]}
      </span>
      <div className="topbar-spacer" />
      <label className="master">
        <span className="master-label">Master</span>
        <input
          type="range"
          aria-label="Master brightness"
          min="0"
          max="100"
          value={Math.round(engine.master * 100)}
          onChange={(event) => send({ type: 'master', level: Number(event.target.value) / 100 })}
        />
        <span className="master-value">{Math.round(engine.master * 100)}%</span>
      </label>
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      <button
        type="button"
        className="btn btn-blackout"
        aria-label="Blackout"
        aria-pressed={engine.blackout}
        onClick={() => send({ type: 'blackout', enabled: !engine.blackout })}
      >
        <Icon name="power" />
        <span className="btn-label">Blackout</span>
      </button>
    </header>
  );
}
