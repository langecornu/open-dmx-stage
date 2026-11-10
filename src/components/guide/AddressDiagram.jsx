// Shows that the address set on each light must match the DMX address on the Setup screen.
// Keep in sync with docs/CONNECTION.md, which carries the same guide for readers outside the app.

export function AddressDiagram() {
  const lights = [
    { name: 'Par 1', range: '1 to 3', address: 'A001' },
    { name: 'Par 2', range: '4 to 6', address: 'A004' },
    { name: 'Par 3', range: '7 to 9', address: 'A007' },
  ];
  const caption =
    'Each light listens to its own block of channels. The address on the light must match the Setup screen.';
  return (
    <figure className="diagram">
      <svg viewBox="0 0 700 214" role="img" aria-label={caption}>
        <title>{caption}</title>
        <text className="dg-sub" x="10" y="16">
          What the Setup screen shows
        </text>
        <text className="dg-sub" x="10" y="150">
          What you set on the light itself (a display or switches)
        </text>
        {lights.map((light, index) => {
          const x = 10 + index * 228;
          return (
            <g key={light.name}>
              <rect className="dg-box dg-accent" x={x} y={26} width={208} height={82} rx="14" />
              <text className="dg-text" x={x + 104} y={58} textAnchor="middle">
                {light.name}
              </text>
              <text className="dg-sub" x={x + 104} y={78} textAnchor="middle">
                Channels {light.range}
              </text>
              <text className="dg-sub" x={x + 104} y={95} textAnchor="middle">
                red, green, blue
              </text>
              <line className="dg-line" x1={x + 104} y1={110} x2={x + 104} y2={132} />
              <rect className="dg-box" x={x + 44} y={160} width={120} height={44} rx="10" />
              <text className="dg-text" x={x + 104} y={188} textAnchor="middle">
                {light.address}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
