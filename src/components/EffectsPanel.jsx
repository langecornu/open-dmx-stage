// Live effects: pulse, sweep and rainbow, locked to the tempo, over the whole rig or one group. They lie over the look
// that is playing and stop when switched off.
import { useState } from 'react';

import { EFFECT_BEATS } from '../../shared/effects.js';

const EFFECTS = [
  { type: 'pulse', label: 'Pulse', hint: 'All lights swell on the beat' },
  { type: 'sweep', label: 'Sweep', hint: 'A bright spot runs along the lights' },
  { type: 'rainbow', label: 'Rainbow', hint: 'Colours cycle through the spectrum' },
];

export function EffectsPanel({ groups, live }) {
  const [beats, setBeats] = useState(1);
  const [groupId, setGroupId] = useState('');
  const effect = live.engine.effect;

  const start = (type, nextBeats = beats, nextGroupId = groupId) =>
    live.send({
      type: 'effectStart',
      effect: type,
      beats: nextBeats,
      groupId: nextGroupId === '' ? null : nextGroupId,
    });
  const stop = () => live.send({ type: 'effectStop' });
  // Changing the length or the lights while an effect runs restarts it with the new choice.
  const handleBeats = (nextBeats) => {
    setBeats(nextBeats);
    if (effect) {
      start(effect.type, nextBeats);
    }
  };
  const handleGroup = (nextGroupId) => {
    setGroupId(nextGroupId);
    if (effect) {
      start(effect.type, beats, nextGroupId);
    }
  };

  return (
    <section className="card card-pad effects-panel" aria-label="Effects">
      <div className="section-bar">
        <h2 className="section-title">Effects</h2>
        {effect ? <span className="pill">{`${effect.type} running`}</span> : null}
      </div>
      <div className="toolbar">
        <label className="field">
          Lights
          <select className="select" value={groupId} onChange={(event) => handleGroup(event.target.value)}>
            <option value="">All lights</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          One cycle lasts
          <select className="select" value={beats} onChange={(event) => handleBeats(Number(event.target.value))}>
            {EFFECT_BEATS.map((count) => (
              <option key={count} value={count}>
                {count === 1 ? '1 beat' : `${count} beats`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="toolbar">
        {EFFECTS.map((item) => {
          const isOn = effect?.type === item.type;
          return (
            <button
              key={item.type}
              type="button"
              className="btn"
              aria-pressed={isOn}
              title={item.hint}
              onClick={() => (isOn ? stop() : start(item.type))}
            >
              {item.label}
            </button>
          );
        })}
        <button type="button" className="btn" disabled={!effect} onClick={stop}>
          Stop effect
        </button>
      </div>
    </section>
  );
}
