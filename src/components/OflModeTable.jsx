// One mode of a fixture from the Open Fixture Library, as a table of its channels with what each value range does.
import { CHANNEL_TYPE_LABELS } from '../utils/fixtureTypes.js';

export function OflModeTable({ mode }) {
  return (
    <details className="ofl-mode">
      <summary>
        {mode.name} <span className="fixture-meta">({mode.channels.length} channels)</span>
        {mode.isSupported ? null : <span className="badge badge-warn">Pixel channels, not copied</span>}
      </summary>
      {mode.isSupported ? null : (
        <p className="view-sub">
          This mode repeats channels for every pixel, which this app cannot copy yet. Only its other channels are
          listed.
        </p>
      )}
      <div className="ofl-table-wrap">
        <table className="ofl-table">
          <caption className="sr-only">Channels of {mode.name}</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Channel</th>
              <th scope="col">What it does</th>
              <th scope="col">Rests at</th>
              <th scope="col">Values</th>
            </tr>
          </thead>
          <tbody>
            {mode.channels.map((channel, index) => (
              // Channels are read-only here and never reordered, so the position is a safe key.
              <tr key={index}>
                <td>{index + 1}</td>
                <th scope="row">{channel.name}</th>
                <td>{CHANNEL_TYPE_LABELS[channel.type] ?? channel.type}</td>
                <td>{channel.defaultValue}</td>
                <td>
                  {channel.ranges.length === 0 ? (
                    '—'
                  ) : (
                    <ul className="ofl-ranges">
                      {channel.ranges.map((entry, at) => (
                        <li key={at}>
                          <strong>{entry.range}</strong> {entry.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
