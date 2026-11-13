// Left navigation rail with friendly labels.
import { GROUPS, VIEWS } from '../utils/views.js';
import { DRIVER_LABELS } from '../utils/drivers.js';
import { Icon } from './Icon.jsx';

export { VIEWS };

/** `liveViews` lists the screens that have something running, so the rail can show a pulsing dot beside them. */
export function Sidebar({ current, onSelect, liveViews = [], output, isServerUp = true, onOpenOutput }) {
  const outputReady = isServerUp && Boolean(output?.connected);
  const outputTitle = !isServerUp ? 'Server offline' : (DRIVER_LABELS[output?.driver] ?? 'No output');
  const outputSub = outputReady ? 'Connected' : isServerUp ? 'Not connected' : 'Reload when it is back';
  return (
    <aside className="rail">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true" />
        <div>
          <div className="brand-name">Open DMX Stage</div>
          <div className="brand-sub">Light your show</div>
        </div>
      </div>
      <nav className="nav" aria-label="Main">
        {GROUPS.map((group) => (
          <div key={group} className="nav-group" role="group" aria-labelledby={`nav-group-${group}`}>
            <div className="nav-heading" id={`nav-group-${group}`}>
              {group}
            </div>
            {VIEWS.filter((view) => view.group === group).map((view) => (
              <button
                key={view.id}
                type="button"
                className="nav-item"
                aria-current={current === view.id ? 'page' : undefined}
                title={view.label}
                onClick={() => onSelect(view.id)}
              >
                <span className="nav-icon">
                  <Icon name={view.icon} size={17} />
                </span>
                <span className="nav-label">{view.label}</span>
                {liveViews.includes(view.id) ? (
                  <>
                    <span className="nav-live" aria-hidden="true" />
                    <span className="sr-only">{' (on stage)'}</span>
                  </>
                ) : null}
              </button>
            ))}
          </div>
        ))}
      </nav>
      {onOpenOutput ? (
        <div className="rail-status">
          <button type="button" className="rail-status-card" onClick={onOpenOutput}>
            <span className={`dot ${outputReady ? 'dot-ok' : 'dot-bad'}`} aria-hidden="true" />
            <span className="rail-status-text">
              <strong>{outputTitle}</strong>
              <span>{outputSub}</span>
            </span>
          </button>
        </div>
      ) : null}
      <div className="rail-footer">v0.1 · Open source · MIT</div>
    </aside>
  );
}
