// Mute and solo for each light: mute keeps a light dark whatever plays; solo lights only the soloed lights. Live only,
// like manual changes: not saved with the show. The On stage bar reminds you while any is set.
import { describeFixtures } from '../utils/muteSolo.js';

/** @param {{ isMuted: boolean, isSoloed: boolean, isDark: boolean }} state */
function stateText(state) {
  if (state.isMuted) {
    return 'Muted';
  }
  if (state.isSoloed) {
    return 'Lit (solo)';
  }
  return state.isDark ? 'Dark: another light is solo' : 'Lit';
}

export function MuteSoloPanel({ project, live }) {
  const states = describeFixtures(project.fixtures, live.engine);
  const isAnySet = states.some((state) => state.isMuted || state.isSoloed);

  return (
    <section className="card card-pad mutesolo-panel" aria-label="Mute and solo">
      <div className="section-bar">
        <h2 className="section-title">Mute and solo</h2>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!isAnySet}
          onClick={() => live.send({ type: 'clearMuteSolo' })}
        >
          Clear all
        </button>
      </div>
      <p className="view-sub">
        <strong>Mute</strong> keeps a light dark whatever plays. <strong>Solo</strong> lights only the soloed lights.
        Live only: not saved with the show.
      </p>
      {states.length === 0 ? (
        <p className="view-sub">Add lights to your rig in Setup first.</p>
      ) : (
        <ul className="mutesolo-list">
          {states.map((state) => (
            <li key={state.id} className="mutesolo-row" data-dark={state.isDark}>
              <span className="mutesolo-name">
                <strong>{state.name}</strong>
                <small>{stateText(state)}</small>
              </span>
              <button
                type="button"
                className="btn mutesolo-toggle"
                data-kind="mute"
                aria-pressed={state.isMuted}
                aria-label={`Mute ${state.name}`}
                onClick={() => live.send({ type: 'mute', fixtureId: state.id, muted: !state.isMuted })}
              >
                Mute
              </button>
              <button
                type="button"
                className="btn mutesolo-toggle"
                data-kind="solo"
                aria-pressed={state.isSoloed}
                aria-label={`Solo ${state.name}`}
                onClick={() => live.send({ type: 'solo', fixtureId: state.id, soloed: !state.isSoloed })}
              >
                Solo
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
