// One channel of a fixture mode: its position, name, what it does, and the value it rests at.
import { CHANNEL_TYPE_LABELS, channelTypes } from '../utils/fixtureTypes.js';
import { Icon } from './Icon.jsx';

const clampValue = (raw) => Math.max(0, Math.min(255, Math.round(Number(raw)) || 0));

export function ChannelRow({ channel, index, count, onChange, onMove, onRemove }) {
  const number = index + 1;
  return (
    <div className="channel-row">
      <span className="step-index">{number}</span>
      <input
        className="input"
        value={channel.name}
        maxLength={80}
        aria-label={`Name of channel ${number}`}
        onChange={(event) => onChange(index, { name: event.target.value || channel.name })}
      />
      <select
        className="select"
        value={channel.type}
        aria-label={`Type of channel ${number}`}
        onChange={(event) => onChange(index, { type: event.target.value })}
      >
        {channelTypes().map((type) => (
          <option key={type} value={type}>
            {CHANNEL_TYPE_LABELS[type]}
          </option>
        ))}
      </select>
      <input
        className="input input-narrow"
        type="number"
        min="0"
        max="255"
        value={channel.defaultValue}
        aria-label={`Resting value of channel ${number}`}
        onChange={(event) => onChange(index, { defaultValue: clampValue(event.target.value) })}
      />
      <span className="row-actions">
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={`Move channel ${number} up`}
          disabled={index === 0}
          onClick={() => onMove(index, -1)}
        >
          <Icon name="up" size={16} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={`Move channel ${number} down`}
          disabled={index === count - 1}
          onClick={() => onMove(index, 1)}
        >
          <Icon name="down" size={16} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-danger"
          aria-label={`Remove channel ${number}`}
          disabled={count === 1}
          onClick={() => onRemove(index)}
        >
          <Icon name="trash" size={16} />
        </button>
      </span>
    </div>
  );
}
