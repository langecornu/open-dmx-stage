// Guide page: addresses, daisy-chaining, terminators and XLR pins.
// Keep in sync with docs/CONNECTION.md, which carries the same guide for readers outside the app.
import { AddressDiagram } from './AddressDiagram.jsx';

export function Wiring() {
  return (
    <>
      <h3>Addresses: how each light knows its job</h3>
      <p>
        Every light listens to a block of channels. The <strong>Setup</strong> screen assigns each light a start
        address. You must set the <strong>same start address and the same mode</strong> on the real light, using its
        display or switches. If they differ, the light will react to the wrong channels or not at all.
      </p>
      <AddressDiagram />
      <h3>Connecting lights</h3>
      <ul className="help-list">
        <li>
          <strong>Daisy-chain:</strong> adapter OUT to light 1 <em>DMX IN</em>, then light 1 <em>DMX OUT</em> to light 2{' '}
          <em>DMX IN</em>, and so on. Never split with a Y cable.
        </li>
        <li>
          <strong>Terminator:</strong> on the last light, plug a DMX terminator (a 120 &Omega; resistor in an XLR plug)
          into its DMX OUT. It prevents signal echoes and is cheap insurance on longer chains.
        </li>
        <li>
          <strong>Cable:</strong> use proper DMX cable. Microphone cable often works for a few metres, but is less
          reliable.
        </li>
        <li>
          <strong>Limits:</strong> up to 32 devices on one chain, and this app sends one universe (512 channels).
        </li>
        <li>
          <strong>Mode:</strong> put each light in DMX mode (not sound-active, auto or master/slave) with a channel mode
          that matches what you picked in Setup.
        </li>
      </ul>
      <h3>XLR pins (3-pin and 5-pin)</h3>
      <table className="help-table">
        <thead>
          <tr>
            <th>Pin</th>
            <th>Use</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>Ground (shield)</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Data minus (&minus;)</td>
          </tr>
          <tr>
            <td>3</td>
            <td>Data plus (+)</td>
          </tr>
          <tr>
            <td>4 and 5 (5-pin only)</td>
            <td>Spare, not used by this app</td>
          </tr>
        </tbody>
      </table>
      <p className="help-note">
        Your adapter and lights may use different plug sizes (3-pin or 5-pin). Use a plain XLR adapter between them if
        so.
      </p>
    </>
  );
}
