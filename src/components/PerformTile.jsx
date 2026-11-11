// One pad on the Perform screen: a look or a sequence, its colours, and the keyboard key and MIDI control that play it.
// A sequence pad has a strip with one segment per step; while it plays, the step on stage is lit.
import { Icon } from './Icon.jsx';

export function PerformTile({
  name,
  kind,
  detail,
  gradient,
  steps = [],
  playingStep = null,
  keyLabel,
  midiLabel,
  isPlaying,
  isArmed,
  onPress,
}) {
  const description = [name, kind, keyLabel ? `key ${keyLabel}` : null, midiLabel].filter(Boolean).join(', ');
  let status = detail;
  if (isArmed) {
    status = 'Press a pad or turn a knob…';
  } else if (isPlaying) {
    status = playingStep === null ? 'On stage' : `On stage · step ${playingStep + 1} of ${steps.length}`;
  }

  return (
    <button
      type="button"
      className="perform-tile"
      aria-pressed={isPlaying}
      aria-label={description}
      data-armed={isArmed}
      onClick={onPress}
    >
      <span className="perform-tile-colour" style={{ background: gradient }}>
        <span className="perform-tile-badges">
          {keyLabel ? <span className="perform-key">{keyLabel.toUpperCase()}</span> : null}
          {midiLabel ? <span className="perform-key">{midiLabel}</span> : null}
        </span>
        {isPlaying ? (
          <span className="perform-live" aria-hidden="true">
            <Icon name={kind === 'Sequence' ? 'stop' : 'chases'} size={14} />
          </span>
        ) : null}
      </span>
      {steps.length > 0 ? (
        <span className="perform-steps" aria-hidden="true">
          {steps.map((step, index) => (
            <span
              key={step.id}
              className="perform-step"
              data-current={isPlaying && playingStep === index}
              style={{ background: step.colour }}
            />
          ))}
        </span>
      ) : null}
      <span className="perform-tile-label">
        <strong>{name}</strong>
        <small>{status}</small>
      </span>
    </button>
  );
}
