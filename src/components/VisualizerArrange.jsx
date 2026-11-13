// The visualizer's Arrange panel: the rig at the venue (truss shape, uprights, size) and the lights' places on it, for
// keyboard and screen reader users as well as by dragging on the stage.
import { useEffect, useState } from 'react';

import { RIG_LIMITS, RIG_SHAPE_LABELS, RIG_SHAPES } from '../../shared/stageRig.js';

/**
 * A size in metres: what is typed is kept while typing, and saved as soon as it is a valid size, so "12" can be typed
 * through "1" (too small on its own). Leaving the field puts back the saved size if what was typed is not valid.
 * @param {{ label: string, value: number, limits: [number, number], onChange: (value: number) => void }} props
 */
function SizeInput({ label, value, limits, onChange }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label>
      {label}
      <input
        type="number"
        min={limits[0]}
        max={limits[1]}
        step="0.5"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = Number(event.target.value);
          if (event.target.value !== '' && Number.isFinite(next) && next >= limits[0] && next <= limits[1]) {
            onChange(next);
          }
        }}
        onBlur={() => setDraft(String(value))}
      />
    </label>
  );
}

/**
 * @param {{
 *   venueName: string,
 *   rig: import('../../shared/stageRig.js').Rig,
 *   onRigChange: (changes: Partial<import('../../shared/stageRig.js').Rig>) => void,
 *   fixtures: { id: string, name: string }[],
 *   selectedId: string | null,
 *   onSelect: (id: string) => void,
 *   onNudge: (event: import('react').KeyboardEvent) => void,
 *   selectedRail: string | null,
 *   rails: { id: string, label: string }[],
 *   onMoveToRail: (rail: string) => void,
 *   onReset: () => void,
 *   unplacedCount?: number,
 *   onKeepPlaces?: () => void,
 * }} props unplacedCount: lights still at their first, guessed places; onKeepPlaces saves the places shown
 */
export function VisualizerArrange({
  venueName,
  rig,
  onRigChange,
  fixtures,
  selectedId,
  onSelect,
  onNudge,
  selectedRail,
  rails,
  onMoveToRail,
  onReset,
  unplacedCount = 0,
  onKeepPlaces,
}) {
  return (
    <div className="visualizer-arrange" role="group" aria-label="Arrange lights">
      <fieldset className="visualizer-rig">
        <legend>The rig at {venueName}</legend>
        <label>
          Truss
          <select value={rig.shape} onChange={(event) => onRigChange({ shape: event.target.value })}>
            {RIG_SHAPES.map((shape) => (
              <option key={shape} value={shape}>
                {RIG_SHAPE_LABELS[shape]}
              </option>
            ))}
          </select>
        </label>
        <label className="visualizer-check">
          <input
            type="checkbox"
            checked={rig.uprights}
            disabled={rig.shape === 'none'}
            onChange={(event) => onRigChange({ uprights: event.target.checked })}
          />
          Uprights at the corners
        </label>
        <div className="visualizer-size">
          {
            /** @type {const} */ (['width', 'depth', 'height']).map((key) => (
              <SizeInput
                key={key}
                label={`${{ width: 'Width', depth: 'Depth', height: 'Height' }[key]} (m)`}
                value={rig[key]}
                limits={RIG_LIMITS[key]}
                onChange={(value) => onRigChange({ [key]: value })}
              />
            ))
          }
        </div>
      </fieldset>
      <p>
        Drag a light onto any rail, an upright or the floor, and along it. Or pick one here: choose its rail, then move
        it with the arrow keys.
      </p>
      <div className="visualizer-lights">
        {fixtures.map((fixture) => (
          <button
            key={fixture.id}
            type="button"
            className="visualizer-chip"
            aria-pressed={selectedId === fixture.id}
            onClick={() => onSelect(fixture.id)}
            onKeyDown={onNudge}
          >
            {fixture.name}
          </button>
        ))}
      </div>
      {selectedId ? (
        <label>
          {fixtures.find((fixture) => fixture.id === selectedId)?.name} is on
          <select value={selectedRail ?? 'floor'} onChange={(event) => onMoveToRail(event.target.value)}>
            {rails.map((rail) => (
              <option key={rail.id} value={rail.id}>
                {rail.label}
              </option>
            ))}
            <option value="floor">The floor</option>
          </select>
        </label>
      ) : null}
      {unplacedCount > 0 && onKeepPlaces ? (
        <p>
          {unplacedCount === fixtures.length
            ? 'The lights are at first, guessed places.'
            : `${unplacedCount} ${unplacedCount === 1 ? 'light is' : 'lights are'} at a first, guessed place.`}{' '}
          Move them, or keep the places shown if they are right.
        </p>
      ) : null}
      <div className="visualizer-arrange-actions">
        {unplacedCount > 0 && onKeepPlaces ? (
          <button type="button" className="visualizer-btn" onClick={onKeepPlaces}>
            Keep these places
          </button>
        ) : null}
        <button type="button" className="visualizer-btn" onClick={onReset}>
          Reset layout
        </button>
      </div>
    </div>
  );
}
