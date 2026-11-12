// Top bar: show name with File (save and open), the venue, status, master brightness, theme switch and blackout.
import { describeOutput } from '../utils/outputStatus.js';
import { Icon } from './Icon.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

const SAVE_LABELS = { saved: 'Saved', saving: 'Saving…', pending: 'Unsaved', error: 'Save failed' };

export function TopBar({
  projectName,
  onRename,
  onOpenShows,
  venues = [],
  onSwitchVenue,
  onManageVenues,
  saveStatus,
  connected,
  output,
  engine,
  send,
  onOpenOutput,
  onOpenSearch,
  theme,
  onToggleTheme,
}) {
  const { label: outputLabel, isReady: outputReady } = describeOutput(connected, output);

  return (
    <header className="topbar">
      <input
        className="show-name"
        value={projectName}
        maxLength={80}
        aria-label="Show name"
        onChange={(event) => onRename(event.target.value)}
      />
      {onOpenShows ? (
        <button type="button" className="btn btn-ghost btn-compact topbar-shows" onClick={onOpenShows}>
          <Icon name="folder" size={16} />
          <span className="btn-label">File</span>
        </button>
      ) : null}
      {venues.length > 0 ? (
        <label className="venue-picker">
          <Icon name="pin" size={16} />
          <span className="sr-only">Venue</span>
          <select
            className="select select-compact"
            aria-label="Venue"
            value={venues.find((venue) => venue.isActive)?.id}
            onChange={(event) => {
              if (event.target.value === '__manage') {
                onManageVenues?.();
              } else {
                onSwitchVenue?.(event.target.value);
              }
            }}
          >
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
            <option value="__manage">Add or change venues…</option>
          </select>
        </label>
      ) : null}
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
      {onOpenSearch ? (
        <button type="button" className="search-button" onClick={onOpenSearch} aria-label="Search">
          <Icon name="search" size={16} />
          <span>Search or jump to…</span>
          <span className="search-hint">
            <kbd>{isMac() ? '⌘' : 'Ctrl'}</kbd> <kbd>K</kbd>
          </span>
        </button>
      ) : null}
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
