// Tempo controls: type the beats per minute, tap it, or halve and double it. Effects and beat-timed sequences follow it.
import { useState } from 'react';

import { MAX_BPM, MIN_BPM } from '../../shared/effects.js';
import { clampBpm } from '../utils/tempo.js';

export function TempoPanel({ bpm, onTempo, onTap }) {
  const [draft, setDraft] = useState(null);

  const commit = () => {
    const parsed = Number(draft);
    setDraft(null);
    if (Number.isFinite(parsed) && parsed > 0) {
      onTempo(clampBpm(parsed));
    }
  };

  return (
    <div className="card card-pad tempo-panel" role="group" aria-label="Tempo">
      <label className="field">
        Tempo (beats per minute)
        <input
          className="input input-narrow"
          type="number"
          min={MIN_BPM}
          max={MAX_BPM}
          step="0.1"
          value={draft ?? String(bpm)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
        />
      </label>
      <button type="button" className="btn btn-primary" onClick={onTap}>
        Tap tempo
      </button>
      <button type="button" className="btn" aria-label="Half speed" onClick={() => onTempo(clampBpm(bpm / 2))}>
        ½×
      </button>
      <button type="button" className="btn" aria-label="Double speed" onClick={() => onTempo(clampBpm(bpm * 2))}>
        2×
      </button>
    </div>
  );
}
