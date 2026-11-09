// One step of a sequence: which look, how long it fades in and holds, and controls to reorder or remove it.
import { Icon } from './Icon.jsx';

const clampMs = (raw) => Math.max(0, Math.min(600000, Math.round(Number(raw) * 1000) || 0));

export function SequenceStepRow({ step, index, isPlaying, scenes, thumbnail, onChange, onMove, onRemove }) {
  const number = index + 1;
  return (
    <div className="step-row" data-playing={isPlaying}>
      <span className="step-index">{number}</span>
      <span className="step-thumb" aria-hidden="true" style={{ background: thumbnail }} />
      <select
        className="select"
        aria-label={`Look for step ${number}`}
        value={step.sceneId}
        onChange={(event) => onChange(index, { sceneId: event.target.value })}
      >
        {scenes.map((scene) => (
          <option key={scene.id} value={scene.id}>
            {scene.name}
          </option>
        ))}
      </select>
      <label className="field">
        <span className="sr-only">Fade seconds</span>
        <input
          className="input"
          type="number"
          min="0"
          step="0.1"
          aria-label={`Fade seconds for step ${number}`}
          value={step.fadeMs / 1000}
          onChange={(event) => onChange(index, { fadeMs: clampMs(event.target.value) })}
        />
      </label>
      <label className="field">
        <span className="sr-only">Hold seconds</span>
        <input
          className="input"
          type="number"
          min="0"
          step="0.1"
          aria-label={`Hold seconds for step ${number}`}
          value={step.holdMs / 1000}
          onChange={(event) => onChange(index, { holdMs: clampMs(event.target.value) })}
        />
      </label>
      <span className="row-actions">
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={`Move step ${number} up`}
          onClick={() => onMove(index, -1)}
        >
          <Icon name="up" size={16} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={`Move step ${number} down`}
          onClick={() => onMove(index, 1)}
        >
          <Icon name="down" size={16} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-danger"
          aria-label={`Remove step ${number}`}
          onClick={() => onRemove(index)}
        >
          <Icon name="trash" size={16} />
        </button>
      </span>
    </div>
  );
}
