// Left navigation rail with friendly labels.
import { Icon } from './Icon.jsx';

export const VIEWS = [
  { id: 'control', label: 'Lights', icon: 'control' },
  { id: 'scenes', label: 'Looks', icon: 'scenes' },
  { id: 'chases', label: 'Sequences', icon: 'chases' },
  { id: 'patch', label: 'Setup', icon: 'patch' },
  { id: 'monitor', label: 'Output', icon: 'monitor' },
];

export function Sidebar({ current, onSelect }) {
  return (
    <aside className="rail">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true" />
        <div>
          <div className="brand-name">Open DMX Studio</div>
          <div className="brand-sub">Light your show</div>
        </div>
      </div>
      <nav className="nav" aria-label="Main">
        {VIEWS.map((view) => (
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
          </button>
        ))}
      </nav>
      <div className="rail-footer">v0.1 · Open source · MIT</div>
    </aside>
  );
}
