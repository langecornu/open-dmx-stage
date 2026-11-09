// Monitor: a live view of all 512 DMX slots, with patched slots outlined.
import { Icon } from './Icon.jsx';

export function MonitorView({ patch, live }) {
  const cells = [];
  for (let channel = 1; channel <= 512; channel += 1) {
    const value = live.frame[channel - 1] ?? 0;
    const info = patch.channels.get(channel);
    const title = info
      ? `Ch ${channel} · ${info.fixtureName} · ${info.channelName} = ${value}`
      : `Ch ${channel} = ${value}`;
    cells.push(
      <div key={channel} className="cell" data-patched={Boolean(info)} title={title}>
        <div className="cell-fill" style={{ height: `${(value / 255) * 100}%` }} />
      </div>,
    );
  }
  return (
    <section className="view" aria-labelledby="monitor-title">
      <div className="view-header">
        <div>
          <h1 className="view-title" id="monitor-title">
            Output
          </h1>
          <p className="view-sub">Exactly what is being sent to your lights right now.</p>
        </div>
        <span className="pill">
          <Icon name="monitor" size={14} />
          Universe 1 · 512 channels
        </span>
      </div>
      <div className="card card-pad">
        <div className="universe" role="img" aria-label="Live view of all 512 DMX channel values">
          {cells}
        </div>
      </div>
      <div className="legend">
        <span>Bar height = level</span>
        <span>Outlined cell = patched channel</span>
        <span>Hover for details</span>
      </div>
    </section>
  );
}
