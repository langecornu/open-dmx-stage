// An arrow with an optional label, drawn between the boxes of a guide diagram.
// Keep in sync with docs/CONNECTION.md, which carries the same guide for readers outside the app.

export function Arrow({ x1, x2, y, label }) {
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
