// One step of a sequence: which look, how long it fades in and holds, and controls to reorder or remove it.
import { Icon } from './Icon.jsx';

const clampMs = (raw) => Math.max(0, Math.min(600000, Math.round(Number(raw) * 1000) || 0));

const clampBeats = (raw) => Math.max(0, Math.min(64, Math.round(Number(raw) * 4) / 4 || 0));

export function SequenceStepRow({
  step,
  index,
  isPlaying,
  timing,
  scenes,
  thumbnail,
  onChange,
  onMove,
  onRemove,
  onDuplicate,
}) {
  const number = index + 1;
  const isBeats = timing === 'beats';
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
        <span className="sr-only">{isBeats ? 'Fade beats' : 'Fade seconds'}</span>
        <input
          className="input"
          type="number"
          min="0"
          step={isBeats ? '0.25' : '0.1'}
          aria-label={`${isBeats ? 'Fade beats' : 'Fade seconds'} for step ${number}`}
          value={isBeats ? step.fadeBeats : step.fadeMs / 1000}
          onChange={(event) =>
            onChange(
              index,
              isBeats ? { fadeBeats: clampBeats(event.target.value) } : { fadeMs: clampMs(event.target.value) },
            )
          }
        />
      </label>
      <label className="field">
        <span className="sr-only">{isBeats ? 'Hold beats' : 'Hold seconds'}</span>
        <input
          className="input"
          type="number"
          min="0"
          step={isBeats ? '0.25' : '0.1'}
          aria-label={`${isBeats ? 'Hold beats' : 'Hold seconds'} for step ${number}`}
          value={isBeats ? step.holdBeats : step.holdMs / 1000}
          onChange={(event) =>
            onChange(
              index,
              isBeats ? { holdBeats: clampBeats(event.target.value) } : { holdMs: clampMs(event.target.value) },
            )
          }
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
          className="btn btn-ghost btn-icon"
          aria-label={`Duplicate step ${number}`}
          onClick={() => onDuplicate(index)}
        >
          <Icon name="copy" size={16} />
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
