// MIDI controls for the Perform screen: turn MIDI on, see the connected controllers, and learn or clear mappings.
const STATUS_TEXT = {
  unsupported: 'This browser does not support MIDI. Use Chrome or Edge to connect a controller.',
  idle: 'Connect a MIDI controller to play looks and sequences from its pads, keys and knobs.',
  requesting: 'Waiting for the browser to allow MIDI…',
  denied: 'The browser did not allow MIDI. Allow it in the site settings, then try again.',
};

export function MidiPanel({ midi, isLearning, onToggleLearn, mappingCount, onClear }) {
  const isReady = midi.status === 'ready';
  return (
    <section className="card card-pad midi-panel" aria-label="MIDI">
      <div className="section-bar">
        <h2 className="section-title">MIDI controller</h2>
        {isReady ? (
          <span className="pill">
            {midi.inputNames.length === 0 ? 'No controller found' : midi.inputNames.join(', ')}
          </span>
        ) : null}
      </div>
      {isReady ? (
        <p className="view-sub">
          {isLearning
            ? 'Learn mode is on: tap a button on the screen, then press a pad, key or knob on your controller.'
            : `Turn on learn mode to link controls. ${mappingCount} linked.`}
        </p>
      ) : (
        <p className="view-sub">{STATUS_TEXT[midi.status]}</p>
      )}
      <div className="toolbar">
        {isReady ? (
          <>
            <button type="button" className="btn" aria-pressed={isLearning} onClick={onToggleLearn}>
              {isLearning ? 'Done learning' : 'Learn MIDI'}
            </button>
            <button type="button" className="btn btn-danger" disabled={mappingCount === 0} onClick={onClear}>
              Clear links
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={midi.status === 'unsupported' || midi.status === 'requesting'}
            onClick={midi.enable}
          >
            Turn on MIDI
          </button>
        )}
      </div>
    </section>
  );
}
