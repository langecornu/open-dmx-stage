// Guide page: what DMX is, which interface to choose, and a five-minute setup.
// Keep in sync with docs/CONNECTION.md, which carries the same guide for readers outside the app.
import { ChainDiagram } from './ChainDiagram.jsx';

export function StartHere() {
  return (
    <>
      <h3>What is DMX?</h3>
      <p>
        DMX is the common language stage lights understand. Your computer cannot speak it directly, so you need a small
        adapter between the two. This app works out what every light should do (a list of 512 numbers, each from 0 to
        255, called <strong>channels</strong>) and sends that list to the adapter about 30 times every second.
      </p>
      <ChainDiagram
        caption="Computer to adapter to lights. The adapter turns the computer's data into DMX, and each light passes it on through DMX cables."
        items={[
          { title: 'Computer', sub: 'Open DMX Stage', accent: true },
          { title: 'Adapter', sub: 'USB cable or box' },
          { title: 'Light 1', sub: 'DMX in, DMX out' },
          { title: 'Light 2', sub: 'DMX in, DMX out' },
          { title: 'Light 3', sub: 'last in the chain' },
        ]}
        links={['USB', 'DMX', 'DMX', 'DMX']}
        note="Terminator here"
      />
      <h3>Which one do I choose?</h3>
      <table className="help-table">
        <thead>
          <tr>
            <th>What you have</th>
            <th>Pick in the Connection card</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>A cheap USB cable with an XLR plug on one end (for example DSD TECH SH-RS09B, ENTTEC Open DMX USB)</td>
            <td>
              <strong>USB-DMX cable</strong>
            </td>
          </tr>
          <tr>
            <td>A USB box described as &ldquo;Pro&rdquo;, such as ENTTEC DMX USB Pro or DMXKing ultraDMX</td>
            <td>
              <strong>ENTTEC DMX USB Pro</strong>
            </td>
          </tr>
          <tr>
            <td>A network box that connects to your router or switch (Art-Net or sACN)</td>
            <td>
              <strong>Art-Net</strong> or <strong>sACN</strong>
            </td>
          </tr>
          <tr>
            <td>Nothing yet, or you just want to try the app</td>
            <td>
              <strong>Simulator</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="help-note">
        Not sure whether your USB adapter is the cheap kind or the &ldquo;Pro&rdquo; kind? Open the{' '}
        <strong>Passive or active?</strong> tab.
      </p>
      <h3>Five-minute setup</h3>
      <ol className="help-steps">
        <li>
          In <strong>Setup</strong>, add your lights. Note the <strong>DMX address</strong> shown for each one.
        </li>
        <li>On each real light, set the same address (and the same mode) using its display or switches.</li>
        <li>
          Plug the adapter into the computer, then run DMX cables from the adapter to the first light, and from light to
          light.
        </li>
        <li>
          Back here, choose your adapter type, pick the port (USB) or enter the address (network), and press{' '}
          <strong>Connect</strong>.
        </li>
        <li>
          Open <strong>Lights</strong> and tap a colour. The lights should change. If not, see{' '}
          <strong>Fix problems</strong>.
        </li>
      </ol>
    </>
  );
}
