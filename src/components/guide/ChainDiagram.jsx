// A left-to-right chain of boxes joined by labelled arrows, used by the guide diagrams.
// Keep in sync with docs/CONNECTION.md, which carries the same guide for readers outside the app.
import { Arrow } from './Arrow.jsx';

const BOX_WIDTH = 132;
const BOX_HEIGHT = 74;

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
