// Edits the selected timeline blocks: colour, intensity, a transition (fade to an end colour and intensity) and an effect
// (strobe, with its speed). A change applies to every selected block; start and length are offered for one block.
import { MIN_BLOCK_BEATS } from '../../shared/timeline.js';
import { SWATCHES, beatLabel } from '../utils/timelineEdit.js';
import { Icon } from './Icon.jsx';

function ColourField({ label, value, onChange }) {
  return (
    <fieldset className="field inspector-colour">
      <legend>{label}</legend>
      <div className="swatch-row">
        {SWATCHES.map((swatch) => (
          <button
            key={swatch.hex}
            type="button"
            className="swatch"
            aria-label={`${label}: ${swatch.name}`}
            aria-pressed={value.toLowerCase() === swatch.hex}
            style={{ background: swatch.hex }}
            onClick={() => onChange(swatch.hex)}
          />
        ))}
        <label className="swatch-custom">
          <span className="sr-only">{label}: any colour</span>
          <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        </label>
      </div>
    </fieldset>
  );
}

function PercentField({ label, value, onChange }) {
  return (
    <label className="field">
      <span>
        {label} <strong>{Math.round(value)}%</strong>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function BlockInspector({ blocks, beats, snap, onChange, onDelete }) {
  if (blocks.length === 0) {
    return (
      <div className="card card-pad inspector inspector-empty">
        <p className="view-sub">
          <strong>Drag across a lane</strong> to draw a block, or across several lanes to draw one on each light. Then
          pick its colour, intensity, a fade and a strobe here. Click a block to edit it; Shift-click to select more.
        </p>
      </div>
    );
  }
  const first = blocks[0];
  const single = blocks.length === 1 ? first : null;
  const set = (changes) => onChange(changes);

  return (
    <div className="card card-pad inspector" aria-label="Block settings" role="region">
      <div className="section-bar">
        <h2 className="section-title">{single ? 'Block' : `${blocks.length} blocks`}</h2>
        <button type="button" className="btn btn-danger" onClick={onDelete}>
          <Icon name="trash" size={16} />
          Delete
        </button>
      </div>

      {single ? (
        <div className="toolbar">
          <label className="field">
            Starts at beat
            <input
              className="input"
              type="number"
              min={1}
              max={beats}
              step={snap}
              value={beatLabel(single.start)}
              onChange={(event) => {
                const start = Number(event.target.value) - 1;
                if (Number.isFinite(start)) {
                  set({ start: Math.max(0, Math.min(beats - single.length, start)) });
                }
              }}
            />
          </label>
          <label className="field">
            Length (beats)
            <input
              className="input"
              type="number"
              min={MIN_BLOCK_BEATS}
              max={beats}
              step={snap}
              value={single.length}
              onChange={(event) => {
                const length = Number(event.target.value);
                if (Number.isFinite(length)) {
                  set({ length: Math.max(MIN_BLOCK_BEATS, Math.min(beats - single.start, length)) });
                }
              }}
            />
          </label>
        </div>
      ) : null}

      <ColourField label="Colour" value={first.color} onChange={(color) => set({ color })} />
      <PercentField label="Intensity" value={first.intensity} onChange={(intensity) => set({ intensity })} />

      <label className="field">
        Transition
        <select
          className="select"
          value={first.transition}
          onChange={(event) => set({ transition: event.target.value })}
        >
          <option value="none">None (hold)</option>
          <option value="fade">Fade</option>
        </select>
      </label>
      {first.transition === 'fade' ? (
        <>
          <ColourField label="Fade to" value={first.endColor} onChange={(endColor) => set({ endColor })} />
          <PercentField
            label="End intensity"
            value={first.endIntensity}
            onChange={(endIntensity) => set({ endIntensity })}
          />
        </>
      ) : null}

      <label className="field">
        Effect
        <select className="select" value={first.effect} onChange={(event) => set({ effect: event.target.value })}>
          <option value="none">None</option>
          <option value="strobe">Strobe</option>
        </select>
      </label>
      {first.effect === 'strobe' ? (
        <label className="field">
          <span>
            Strobe speed <strong>{Math.round(first.strobeSpeed)}</strong>
          </span>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={first.strobeSpeed}
            onChange={(event) => set({ strobeSpeed: Number(event.target.value) })}
          />
        </label>
      ) : null}
    </div>
  );
}
