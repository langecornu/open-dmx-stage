// While learning MIDI, the controls that are not pads on screen (blackout, stop, master) need a button to arm, so they
// can be linked to a controller too. Outside learn mode they are the top bar and the On stage bar's job, so this hides.
export function PerformLearnLinks({ labelFor, isArmed, onPress }) {
  const targets = [
    { action: { type: 'blackout' }, label: 'Link blackout to a pad' },
    { action: { type: 'stop' }, label: 'Link stop to a pad' },
    { action: { type: 'master' }, label: 'Link master to a knob' },
  ];
  return (
    <div className="card card-pad learn-links" role="group" aria-label="Link more controls">
      <p className="view-sub">Learn mode is on. Pick what to link, then press a pad, key or knob on your controller.</p>
      <div className="toolbar">
        {targets.map(({ action, label }) => (
          <button
            key={action.type}
            type="button"
            className="btn"
            data-armed={isArmed(action)}
            onClick={() => onPress(action)}
          >
            {labelFor(label, action)}
          </button>
        ))}
      </div>
    </div>
  );
}
