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
    <section className="card card-pad tempo-panel" aria-label="Tempo">
      <div className="section-bar">
        <h2 className="section-title">Tempo</h2>
      </div>
      <div className="tempo-readout">
        <input
          className="tempo-input"
          aria-label="Tempo (beats per minute)"
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
        <span className="tempo-unit" aria-hidden="true">
          BPM
        </span>
      </div>
      <div className="toolbar">
        <button type="button" className="btn btn-primary btn-tap" onClick={onTap}>
          Tap tempo
        </button>
        <button type="button" className="btn" aria-label="Half speed" onClick={() => onTempo(clampBpm(bpm / 2))}>
          ½×
        </button>
        <button type="button" className="btn" aria-label="Double speed" onClick={() => onTempo(clampBpm(bpm * 2))}>
          2×
        </button>
      </div>
      <p className="view-sub">
        Effects and sequences timed in beats follow this. Tap along to the music, or press <kbd>.</kbd>
      </p>
    </section>
  );
}
