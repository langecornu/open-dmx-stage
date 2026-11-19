// The visualizer's Arrange panel: the rig at the venue (truss shape, uprights, size) and the lights' places on it, for
// keyboard and screen reader users as well as by dragging on the stage.
import { useEffect, useState } from 'react';

import { RIG_LIMITS, RIG_SHAPE_LABELS, RIG_SHAPES } from '../../shared/stageRig.js';

/**
 * A size in metres: what is typed is kept while typing, and saved as soon as it is a valid size, so "12" can be typed
 * through "1" (too small on its own). Leaving the field puts back the saved size if what was typed is not valid.
 * @param {{ label: string, value: number, limits: [number, number], onChange: (value: number) => void, step?: number }} props
 */
function SizeInput({ label, value, limits, onChange, step = 0.5 }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label>
      {label}
      <input
        type="number"
        min={limits[0]}
        max={limits[1]}
        step={step}
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
 *   standOf?: { support?: 'stand' | 'truss', height?: number } | null,
 *   onStandChange?: (stand: { support: 'stand' | 'truss', height: number } | null) => void,
 * }} props standOf: what the chosen light stands on, when it is on the floor unplacedCount: lights still at their first, guessed places; onKeepPlaces saves the places shown
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
  standOf = null,
  onStandChange,
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
      {selectedId && selectedRail === 'floor' && onStandChange ? (
        <div className="visualizer-stand">
          <label>
            Stands on
            <select
              value={standOf?.height ? (standOf.support ?? 'stand') : 'none'}
              onChange={(event) =>
                onStandChange(
                  event.target.value === 'none'
                    ? null
                    : {
                        support: /** @type {'stand' | 'truss'} */ (event.target.value),
                        height: standOf?.height || 1.2,
                      },
                )
              }
            >
              <option value="none">The floor</option>
              <option value="stand">A tripod stand</option>
              <option value="truss">A truss tower</option>
            </select>
          </label>
          {standOf?.height ? (
            <SizeInput
              label="Stand height (m)"
              value={standOf.height}
              limits={[0.5, 6]}
              step={0.1}
              onChange={(height) => onStandChange({ support: standOf.support ?? 'stand', height })}
            />
          ) : null}
          {standOf?.height ? (
            <span className="fixture-meta">{Math.round((standOf.height / 0.3048) * 10) / 10} ft</span>
          ) : null}
        </div>
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
