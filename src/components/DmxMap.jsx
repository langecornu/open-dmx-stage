// The universe at a glance: a bar of the 512 channels with a coloured block for each light's addresses, a red outline
// where lights overlap, and a line saying how much is used and what the next free address is.
import { DMX_CHANNELS } from '../../shared/patch.js';
import { dmxMapSegments } from '../utils/dmxMap.js';

const TICKS = [1, 128, 256, 384, 512];

export function DmxMap({ project, patch }) {
  const { segments, used, nextFree } = dmxMapSegments(project, patch);
  const percent = (channel) => ((channel - 1) / DMX_CHANNELS) * 100;
  const hasOverlap = segments.some((segment) => segment.isOverlap);

  return (
    <section className="card card-pad dmx-map" aria-label="DMX address map">
      <div className="section-bar">
        <h2 className="section-title">Universe 1</h2>
        <span className="dmx-summary">
          {used} of {DMX_CHANNELS} channels used
          {nextFree === null ? ' · full' : ` · next free address ${nextFree}`}
        </span>
      </div>
      <div
        className="dmx-bar"
        role="img"
        aria-label={`${segments.length} lights across ${used} of ${DMX_CHANNELS} channels`}
      >
        {segments.map((segment) => (
          <span
            key={segment.id}
            className="dmx-block"
            data-overlap={segment.isOverlap}
            title={`${segment.name}: ${segment.start}–${segment.end}`}
            style={{
              left: `${percent(segment.start)}%`,
              width: `${((segment.end - segment.start + 1) / DMX_CHANNELS) * 100}%`,
              background: `hsl(${segment.hue} 70% 55%)`,
            }}
          />
        ))}
      </div>
      <div className="dmx-ticks" aria-hidden="true">
        {TICKS.map((tick) => (
          <span key={tick} style={{ left: `${percent(tick)}%` }}>
            {tick}
          </span>
        ))}
      </div>
      {segments.length > 0 ? (
        <ul className="dmx-legend">
          {segments.map((segment) => (
            <li key={segment.id}>
              <span className="dmx-swatch" style={{ background: `hsl(${segment.hue} 70% 55%)` }} aria-hidden="true" />
              {segment.name}
              <span className="dmx-range">
                {segment.start}–{segment.end}
              </span>
              {segment.isOverlap ? <span className="badge badge-warn">Overlaps</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {hasOverlap ? (
        <p className="view-sub" role="status">
          Two lights share addresses, so they will react together. Change one address to separate them.
        </p>
      ) : null}
    </section>
  );
}
