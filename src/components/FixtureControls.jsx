// What the selected lights can be set to do besides colour and brightness, grouped (Colour, Shutter, Movement, Beam,
// Atmosphere, Program, Other): a slider for a continuous control (pan, zoom, fog output), a choice for one with ranges
// (a gobo, a colour slot, shutter open or strobe), with a level when the chosen range is continuous. Used by the
// timeline's block panel (where a control can be left unset, and fades to an end value) and by the Lights screen.
import { CONTROL_GROUPS } from '../../shared/capabilities.js';

/** @param {import('../../shared/capabilities.js').ControlValue | undefined} value */
const levelOf = (value) => (value === undefined ? 0 : typeof value === 'number' ? value : value.level);

function Level({ label, value, onChange }) {
  return (
    <label className="control-level">
      <span className="sr-only">{label}</span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={Math.round(value)}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="control-value" aria-hidden="true">
        {Math.round(value)}%
      </span>
    </label>
  );
}

/**
 * @param {{
 *   control: import('../../shared/capabilities.js').Control,
 *   value: import('../../shared/capabilities.js').ControlValue | undefined,
 *   endValue?: import('../../shared/capabilities.js').ControlValue,
 *   showEnd: boolean,
 *   canClear: boolean,
 *   onChange: (value: import('../../shared/capabilities.js').ControlValue | undefined) => void,
 *   onEndChange?: (value: import('../../shared/capabilities.js').ControlValue | undefined) => void,
 * }} props
 */
function ControlRow({ control, value, endValue, showEnd, canClear, onChange, onEndChange }) {
  const isSet = value !== undefined;
  const clear =
    canClear && isSet ? (
      <button
        type="button"
        className="btn btn-ghost btn-compact"
        aria-label={`Clear ${control.label}`}
        onClick={() => {
          onChange(undefined);
          onEndChange?.(undefined);
        }}
      >
        ×
      </button>
    ) : null;

  if (control.kind === 'range') {
    return (
      <div className="control-row" data-set={isSet}>
        <span className="control-label">
          {control.label}
          {canClear && !isSet ? <small> · not set</small> : null}
        </span>
        <Level label={control.label} value={levelOf(value)} onChange={onChange} />
        {showEnd && isSet ? (
          <Level label={`${control.label} at the end`} value={levelOf(endValue ?? value)} onChange={onEndChange} />
        ) : null}
        {clear}
      </div>
    );
  }

  const choice = typeof value === 'object' ? value : undefined;
  const option = choice ? control.options[choice.option] : undefined;
  return (
    <div className="control-row" data-set={isSet}>
      <span className="control-label">{control.label}</span>
      <select
        className="select select-compact"
        value={choice ? String(choice.option) : ''}
        aria-label={control.label}
        onChange={(event) =>
          onChange(event.target.value === '' ? undefined : { option: Number(event.target.value), level: 50 })
        }
      >
        {canClear || !choice ? <option value="">{canClear ? 'Not set' : 'Choose…'}</option> : null}
        {control.options.map((entry, index) => (
          <option key={`${entry.from}-${entry.to}`} value={index}>
            {entry.label}
            {entry.color ? ' ●' : ''}
          </option>
        ))}
      </select>
      {option?.color ? (
        <span className="control-swatch" style={{ background: option.color }} aria-hidden="true" />
      ) : null}
      {option?.continuous ? (
        <>
          <Level
            label={`${control.label}: ${option.label}`}
            value={choice.level}
            onChange={(level) => onChange({ option: choice.option, level })}
          />
          {showEnd ? (
            <Level
              label={`${control.label}: ${option.label} at the end`}
              value={typeof endValue === 'object' && endValue.option === choice.option ? endValue.level : choice.level}
              onChange={(level) => onEndChange?.({ option: choice.option, level })}
            />
          ) : null}
        </>
      ) : null}
      {clear}
    </div>
  );
}

/**
 * @param {{
 *   controls: import('../../shared/capabilities.js').Control[],
 *   values: Record<string, import('../../shared/capabilities.js').ControlValue>,
 *   endValues?: Record<string, import('../../shared/capabilities.js').ControlValue>,
 *   showEnd?: boolean,
 *   canClear?: boolean,
 *   onChange: (key: string, value: import('../../shared/capabilities.js').ControlValue | undefined) => void,
 *   onEndChange?: (key: string, value: import('../../shared/capabilities.js').ControlValue | undefined) => void,
 * }} props
 */
export function FixtureControls({
  controls,
  values,
  endValues = {},
  showEnd = false,
  canClear = false,
  onChange,
  onEndChange,
}) {
  if (controls.length === 0) {
    return null;
  }
  const groups = CONTROL_GROUPS.map((group) => ({
    group,
    controls: controls.filter((control) => control.group === group),
  })).filter((entry) => entry.controls.length > 0);
  return (
    <div className="fixture-controls">
      {groups.map(({ group, controls: inGroup }) => {
        const setCount = inGroup.filter((control) => values[control.key] !== undefined).length;
        return (
          <details key={group} className="control-group" open={setCount > 0 || groups.length <= 2}>
            <summary>
              {group}
              <span className="control-count">
                {setCount > 0
                  ? `${setCount} set`
                  : `${inGroup.length} ${inGroup.length === 1 ? 'control' : 'controls'}`}
              </span>
            </summary>
            {inGroup.map((control) => (
              <ControlRow
                key={control.key}
                control={control}
                value={values[control.key]}
                endValue={endValues[control.key]}
                showEnd={showEnd}
                canClear={canClear}
                onChange={(value) => onChange(control.key, value)}
                onEndChange={(value) => onEndChange?.(control.key, value)}
              />
            ))}
          </details>
        );
      })}
    </div>
  );
}
