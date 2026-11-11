// One big button on the Perform screen: a look or a sequence, with its keyboard key and MIDI control shown on it.
import { Icon } from './Icon.jsx';

export function PerformTile({ name, kind, gradient, keyLabel, midiLabel, isPlaying, isArmed, onPress }) {
  const description = [name, kind, keyLabel ? `key ${keyLabel}` : null, midiLabel].filter(Boolean).join(', ');
  return (
    <button
      type="button"
      className="perform-tile"
      aria-pressed={isPlaying}
      aria-label={description}
      data-armed={isArmed}
      style={{ background: gradient }}
      onClick={onPress}
    >
      <span className="perform-tile-badges">
        {keyLabel ? <span className="perform-key">{keyLabel.toUpperCase()}</span> : null}
        {midiLabel ? <span className="perform-key">{midiLabel}</span> : null}
      </span>
      <span className="perform-tile-label">
        <strong>{name}</strong>
        <small>{isArmed ? 'Press a pad or turn a knob…' : isPlaying ? 'On stage' : kind}</small>
      </span>
      {isPlaying ? (
        <span className="perform-live" aria-hidden="true">
          <Icon name={kind === 'Sequence' ? 'stop' : 'chases'} size={14} />
        </span>
      ) : null}
    </button>
  );
}
