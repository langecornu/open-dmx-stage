// Inline SVG diagrams for the connection guide. They use theme tokens so they work in light and dark themes.
const BOX_WIDTH = 132;
const BOX_HEIGHT = 74;

function Arrow({ x1, x2, y, label }) {
  return (
    <g>
      <line className="dg-line" x1={x1} y1={y} x2={x2 - 7} y2={y} />
      <path className="dg-head" d={`M${x2} ${y} l-9 -5 v10 z`} />
      {label ? (
        <text className="dg-sub" x={(x1 + x2) / 2} y={y - 10} textAnchor="middle">
          {label}
        </text>
      ) : null}
    </g>
  );
}

// A left-to-right chain of boxes joined by labelled arrows. items: [{ title, sub, accent }], links: [label].
export function ChainDiagram({ items, links, caption, note }) {
  const gap = 60;
  const width = items.length * BOX_WIDTH + (items.length - 1) * gap + 20;
  const height = note ? 150 : 124;
  return (
    <figure className="diagram">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={caption}>
        <title>{caption}</title>
        {items.map((item, index) => {
          const x = 10 + index * (BOX_WIDTH + gap);
          return (
            <g key={item.title}>
              <rect
                className={item.accent ? 'dg-box dg-accent' : 'dg-box'}
                x={x}
                y={24}
                width={BOX_WIDTH}
                height={BOX_HEIGHT}
                rx="14"
              />
              <text className="dg-text" x={x + BOX_WIDTH / 2} y={58} textAnchor="middle">
                {item.title}
              </text>
              <text className="dg-sub" x={x + BOX_WIDTH / 2} y={77} textAnchor="middle">
                {item.sub}
              </text>
              {index < items.length - 1 ? (
                <Arrow x1={x + BOX_WIDTH + 4} x2={x + BOX_WIDTH + gap - 4} y={61} label={links[index]} />
              ) : null}
            </g>
          );
        })}
        {note ? (
          <text className="dg-note" x={width - 10 - BOX_WIDTH / 2} y={128} textAnchor="middle">
            {note}
          </text>
        ) : null}
      </svg>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

// Shows that the address typed on each light must equal the DMX address on the Setup screen.
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
