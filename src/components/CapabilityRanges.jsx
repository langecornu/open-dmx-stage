// The value ranges of one channel, for a channel that does several things across 0 to 255: a shutter (closed, open,
// strobe slow to fast), a gobo wheel (one range per gobo), a colour wheel (one range per colour, with its colour), or a
// program channel. The editors show each range as a choice, with a level when the range is continuous.
import { CAPABILITY_LABELS, CAPABILITY_TYPES } from '../../shared/capabilities.js';
import { Icon } from './Icon.jsx';

const clamp = (raw) => Math.max(0, Math.min(255, Math.round(Number(raw)) || 0));

/** A sensible next range: straight after the last one, to the end. */
function nextRange(ranges) {
  const last = ranges.at(-1);
  const from = last ? Math.min(255, last.to + 1) : 0;
  return { from, to: 255, type: 'generic', label: '' };
}

/**
 * @param {{ channelName: string, ranges: import('../../shared/capabilities.js').Capability[],
 *   onChange: (ranges: import('../../shared/capabilities.js').Capability[]) => void }} props
 */
export function CapabilityRanges({ channelName, ranges, onChange }) {
  const set = (index, changes) =>
    onChange(
      ranges.map((range, at) => {
        if (at !== index) {
          return range;
        }
        const next = { ...range, ...changes };
        // Keep a range the right way round, so it always passes the show's checks.
        return next.from > next.to ? { ...next, to: next.from } : next;
      }),
    );
  const overlaps = ranges.some((range, index) =>
    ranges.some((other, at) => at !== index && range.from <= other.to && other.from <= range.to),
  );

  return (
    <div className="ranges" role="group" aria-label={`Value ranges of ${channelName}`}>
      {ranges.length === 0 ? (
        <p className="fixture-meta">
          One thing over the whole range (0 to 255). Add ranges when the channel does several things, such as a shutter
          (closed, open, strobe) or a gobo wheel (one range per gobo).
        </p>
      ) : (
        <div className="range-row range-head" aria-hidden="true">
          <span>From</span>
          <span>To</span>
          <span>What it does</span>
          <span>Name</span>
          <span>Colour</span>
          <span>Fast to slow</span>
          <span />
        </div>
      )}
      {ranges.map((range, index) => {
        const number = index + 1;
        return (
          // Ranges have no ids and every field is controlled, so the position is a safe key.
          <div key={index} className="range-row">
            <input
              className="input input-narrow"
              type="number"
              min="0"
              max="255"
              value={range.from}
              aria-label={`Range ${number} starts at`}
              onChange={(event) => set(index, { from: clamp(event.target.value) })}
            />
            <input
              className="input input-narrow"
              type="number"
              min="0"
              max="255"
              value={range.to}
              aria-label={`Range ${number} ends at`}
              onChange={(event) => set(index, { to: clamp(event.target.value) })}
            />
            <select
              className="select"
              value={range.type}
              aria-label={`What range ${number} does`}
              onChange={(event) => set(index, { type: event.target.value })}
            >
              {CAPABILITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CAPABILITY_LABELS[type]}
                </option>
              ))}
            </select>
            <input
              className="input"
              value={range.label ?? ''}
              maxLength={80}
              placeholder={CAPABILITY_LABELS[range.type]}
              aria-label={`Name of range ${number}`}
              onChange={(event) => set(index, { label: event.target.value })}
            />
            <span className="range-colour">
              <input
                type="checkbox"
                checked={Boolean(range.color)}
                aria-label={`Range ${number} has a colour`}
                onChange={(event) => set(index, { color: event.target.checked ? '#ffffff' : undefined })}
              />
              {range.color ? (
                <input
                  type="color"
                  value={range.color}
                  aria-label={`Colour of range ${number}`}
                  onChange={(event) => set(index, { color: event.target.value })}
                />
              ) : null}
            </span>
            <input
              type="checkbox"
              checked={Boolean(range.reverse)}
              aria-label={`Range ${number} runs from fast to slow (high to low)`}
              onChange={(event) => set(index, { reverse: event.target.checked || undefined })}
            />
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-danger"
              aria-label={`Remove range ${number}`}
              onClick={() => onChange(ranges.filter((_, at) => at !== index))}
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        );
      })}
      {overlaps ? (
        <p className="fixture-meta" role="note">
          Some ranges overlap; the first one that covers a value is used.
        </p>
      ) : null}
      <div>
        <button
          type="button"
          className="btn"
          disabled={ranges.length >= 64}
          onClick={() => onChange([...ranges, nextRange(ranges)])}
        >
          <Icon name="plus" size={16} />
          Add range
        </button>
      </div>
    </div>
  );
}
