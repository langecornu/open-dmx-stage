// A vertical DMX fader (0-255) with a numeric readout and a colour key for the channel type.
const TYPE_COLORS = {
  red: 'var(--ch-red)',
  green: 'var(--ch-green)',
  blue: 'var(--ch-blue)',
  white: 'var(--ch-white)',
  amber: 'var(--ch-amber)',
  uv: 'var(--ch-uv)',
  intensity: 'var(--accent)',
  pan: 'var(--ch-position)',
  tilt: 'var(--ch-position)',
};

export function Fader({ label, type, value, isOverridden, onChange }) {
  const color = TYPE_COLORS[type] ?? 'var(--ch-other)';
  return (
    <div className="fader">
      <span className="fader-value" style={{ color: isOverridden ? 'var(--accent)' : undefined }}>
        {value}
      </span>
      <input
        type="range"
        min="0"
        max="255"
        value={value}
        aria-label={label}
        style={{ accentColor: color }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="fader-bar" style={{ background: color }} />
      <span className="fader-label" title={label}>
        {label}
      </span>
    </div>
  );
}
