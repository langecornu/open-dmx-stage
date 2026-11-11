// Left navigation rail with friendly labels.
import { Icon } from './Icon.jsx';

export const VIEWS = [
  { id: 'control', label: 'Lights', icon: 'control', group: 'Show' },
  { id: 'scenes', label: 'Looks', icon: 'scenes', group: 'Show' },
  { id: 'chases', label: 'Sequences', icon: 'chases', group: 'Show' },
  { id: 'perform', label: 'Perform', icon: 'bolt', group: 'Show' },
  { id: 'patch', label: 'Setup', icon: 'patch', group: 'Rig' },
  { id: 'fixtures', label: 'Fixtures', icon: 'sliders', group: 'Rig' },
  { id: 'monitor', label: 'Output', icon: 'monitor', group: 'Rig' },
];

const GROUPS = ['Show', 'Rig'];

/** `liveViews` lists the screens that have something running, so the rail can show a pulsing dot beside them. */
export function Sidebar({ current, onSelect, liveViews = [] }) {
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
                onClick={() => onSelect(view.id)}
              >
                <span className="nav-icon">
                  <Icon name={view.icon} size={17} />
                </span>
                {view.label}
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
      <div className="rail-footer">v0.1 · Open source · MIT</div>
    </aside>
  );
}
