// A live view of the rig: every light drawn as a lamp with a cone of light in the colour it is really sending, updated
// with the DMX frame. It is on every screen, so what the lights are doing is never a guess.
import { useFrame } from '../hooks/frameStore.js';
import { fixtureColor } from '../utils/sceneColors.js';

const MAX_LAMPS = 16;

export function StageView({ project, patch }) {
  const frame = useFrame();
  const valueOf = (channel) => frame[channel - 1] ?? 0;
  const lamps = project.fixtures
    .map((fixture) => ({ fixture, range: patch.fixtures.find((entry) => entry.id === fixture.id) }))
    .filter(({ range }) => range && !range.missingType);
  if (lamps.length === 0) {
    return null;
  }
  const shown = lamps.slice(0, MAX_LAMPS);
  const hidden = lamps.length - shown.length;

  return (
    <ul className="stage-view" aria-label="Live view of your lights">
      {shown.map(({ fixture, range }) => {
        const color = fixtureColor(range, patch, valueOf);
        const isLit = color.level > 0.02;
        return (
          <li
            key={fixture.id}
            className="lamp"
            data-lit={isLit}
            style={{ '--lamp': color.css, '--level': color.level.toFixed(3) }}
            title={`${fixture.name} · DMX ${range.start}–${range.end}`}
          >
            <span className="lamp-beam" aria-hidden="true" />
            <span className="lamp-bulb" aria-hidden="true" />
            <span className="lamp-name">{fixture.name}</span>
          </li>
        );
      })}
      {hidden > 0 ? <li className="lamp-more">+{hidden} more</li> : null}
    </ul>
  );
}
