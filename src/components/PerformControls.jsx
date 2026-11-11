// The always-visible controls on the Perform screen: master, blackout, play and stop for sequences, and a line saying what
// is happening, plus the master's MIDI link in learn mode.
import { Icon } from './Icon.jsx';

export function PerformControls({
  master,
  isBlackout,
  isLearning,
  playingName,
  playTarget,
  labelFor,
  isArmed,
  onPress,
  onMaster,
}) {
  const percent = Math.round(master * 100);
  const isPlaying = playingName !== null;
  // One button that plays when nothing is playing and stops when something is, so it is never a dead button.
  const toggleAction = isPlaying ? { type: 'stop' } : playTarget ? { type: 'sequence', id: playTarget.id } : null;
  const toggleTitle = isPlaying
    ? `Stop ${playingName}`
    : playTarget
      ? `Play ${playTarget.name}`
      : 'Make a sequence first';
  const statusText = [
    isPlaying ? `Playing: ${playingName}.` : 'No sequence is playing.',
    isBlackout ? 'Blackout is on, so the lights are dark.' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="card card-pad perform-controls">
      <label className="slider-row perform-master">
        Master
        <input
          type="range"
          min="0"
          max="100"
          value={percent}
          onChange={(event) => onMaster(Number(event.target.value) / 100)}
        />
        <span className="slider-value">{percent}%</span>
      </label>
      <button
        type="button"
        className="btn btn-blackout"
        aria-pressed={isBlackout}
        data-armed={isArmed({ type: 'blackout' })}
        onClick={() => onPress({ type: 'blackout' })}
      >
        <Icon name="power" />
        {labelFor(isBlackout ? 'Blackout is on' : 'Blackout', { type: 'blackout' })}
      </button>
      <button
        type="button"
        className="btn"
        disabled={toggleAction === null}
        data-armed={toggleAction ? isArmed(toggleAction) : false}
        title={toggleTitle}
        onClick={() => toggleAction && onPress(toggleAction)}
      >
        <Icon name={isPlaying ? 'stop' : 'chases'} size={16} />
        {toggleAction ? labelFor(isPlaying ? 'Stop sequence' : 'Play sequence', toggleAction) : 'Play sequence'}
      </button>
      <p className="view-sub perform-status" role="status">
        {statusText}
      </p>
      {isLearning ? (
        <>
          <button
            type="button"
            className="btn"
            data-armed={isArmed({ type: 'stop' })}
            onClick={() => onPress({ type: 'stop' })}
          >
            {labelFor('Link stop to a pad', { type: 'stop' })}
          </button>
          <button
            type="button"
            className="btn"
            data-armed={isArmed({ type: 'master' })}
            onClick={() => onPress({ type: 'master' })}
          >
            {labelFor('Link master to a knob', { type: 'master' })}
          </button>
        </>
      ) : null}
    </div>
  );
}
