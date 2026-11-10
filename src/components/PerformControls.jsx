// The always-visible controls on the Perform screen: master, blackout and stop, plus the master's MIDI link in learn mode.
import { Icon } from './Icon.jsx';

export function PerformControls({ master, isBlackout, isLearning, labelFor, isArmed, onPress, onMaster }) {
  const percent = Math.round(master * 100);
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
        {labelFor('Blackout', { type: 'blackout' })}
      </button>
      <button
        type="button"
        className="btn"
        data-armed={isArmed({ type: 'stop' })}
        onClick={() => onPress({ type: 'stop' })}
      >
        <Icon name="stop" size={16} />
        {labelFor('Stop sequence', { type: 'stop' })}
      </button>
      {isLearning ? (
        <button
          type="button"
          className="btn"
          data-armed={isArmed({ type: 'master' })}
          onClick={() => onPress({ type: 'master' })}
        >
          {labelFor('Link master to a knob', { type: 'master' })}
        </button>
      ) : null}
    </div>
  );
}
