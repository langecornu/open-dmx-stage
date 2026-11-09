// Guide content, part 2: network interfaces, wiring and addressing, and troubleshooting.
import { AddressDiagram, ChainDiagram } from './HelpDiagrams.jsx';

function NetworkDiagram() {
  return (
    <ChainDiagram
      caption="Network DMX. The computer talks over your network (Ethernet is best) to a node, and the node outputs normal DMX to the lights."
      items={[
        { title: 'Computer', sub: 'Open DMX Stage', accent: true },
        { title: 'Router or switch', sub: 'your network' },
        { title: 'DMX node', sub: 'Art-Net or sACN' },
        { title: 'Lights', sub: 'DMX chain' },
      ]}
      links={['Network', 'Network', 'DMX']}
    />
  );
}

export function ArtNet() {
  return (
    <>
      <p>
        Art-Net sends DMX over your network to an <strong>Art-Net node</strong> (a box that turns network data into DMX)
        or to another lighting program. It needs no special driver, and it is the most predictable choice.
      </p>
      <NetworkDiagram />
      <ol className="help-steps">
        <li>
          Connect the computer and the node to the <strong>same network</strong>. A cable is much more reliable than
          Wi-Fi.
        </li>
        <li>
          Find the node&apos;s <strong>IP address</strong> (its display or manual shows it, for example 192.168.1.50).
          Make sure the computer is on the same family of addresses (for example 192.168.1.x).
        </li>
        <li>
          Choose <strong>Art-Net</strong> in the Connection card.
        </li>
        <li>
          In <strong>Send to</strong>, type the node&apos;s IP address. Leave it empty to broadcast to everything on the
          network.
        </li>
        <li>
          Set <strong>Universe</strong> to the universe your node outputs. The default is 0. Many nodes label universes
          from 1, so if nothing happens try one number up or down.
        </li>
        <li>
          Press <strong>Connect</strong> and test in <strong>Lights</strong>.
        </li>
      </ol>
      <p className="help-note">
        No node yet? You can check your show using any program that receives Art-Net on the same computer, by sending to{' '}
        <code>127.0.0.1</code>.
      </p>
    </>
  );
}

export function Sacn() {
  return (
    <>
      <p>
        sACN (also called E1.31) is another way to send DMX over a network. It is common in theatre and installations.
        Setup is the same as Art-Net, with two differences.
      </p>
      <NetworkDiagram />
      <ol className="help-steps">
        <li>Connect the computer and node to the same network, ideally with cables.</li>
        <li>
          Choose <strong>sACN (E1.31)</strong> in the Connection card.
        </li>
        <li>
          <strong>Send to</strong>: leave empty to use <em>multicast</em> (the standard way, works when your network
          switch supports it), or type the node&apos;s IP address to send straight to it. If nothing arrives with
          multicast, use the IP address.
        </li>
        <li>
          <strong>Universe</strong> starts at 1 for sACN (the default). It must match the universe your node listens to.
        </li>
        <li>
          Press <strong>Connect</strong> and test in <strong>Lights</strong>.
        </li>
      </ol>
    </>
  );
}

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

export function FixProblems() {
  return (
    <>
      <h3>What the status pill means</h3>
      <table className="help-table">
        <tbody>
          <tr>
            <th scope="row">Simulator</th>
            <td>Nothing is sent to real lights. This is normal when you have not connected an adapter.</td>
          </tr>
          <tr>
            <th scope="row">DMX ready</th>
            <td>The adapter or network output is open and the app is sending data.</td>
          </tr>
          <tr>
            <th scope="row">DMX not connected</th>
            <td>The adapter could not be opened or was unplugged. Read the message in the Connection card.</td>
          </tr>
          <tr>
            <th scope="row">Server offline</th>
            <td>The app&apos;s server is not running. Start it again, then reload the page.</td>
          </tr>
        </tbody>
      </table>
      <h3>Fixes</h3>
      <table className="help-table">
        <thead>
          <tr>
            <th>What you see</th>
            <th>Try this</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>The port list is empty or missing your cable</td>
            <td>
              Press <strong>Refresh</strong>, re-plug the cable, try another USB port. On Windows or Mac you may need
              the FTDI driver. On Linux, join the <code>dialout</code> group.
            </td>
          </tr>
          <tr>
            <td>&ldquo;That serial port was not found&rdquo;</td>
            <td>The cable moved or was unplugged. Press Refresh and choose the port again.</td>
          </tr>
          <tr>
            <td>&ldquo;Could not open&hellip;&rdquo; or &ldquo;Resource busy&rdquo;</td>
            <td>Another program is using the cable. Close it, then press Connect again.</td>
          </tr>
          <tr>
            <td>Says DMX ready, but the lights do nothing</td>
            <td>
              Check each light&apos;s address and mode match Setup, the cable is in the first light&apos;s <em>IN</em>,
              Master is up, and Blackout is off. For USB, try the other adapter type (see Passive or active?).
            </td>
          </tr>
          <tr>
            <td>Lights flicker (USB cable)</td>
            <td>
              Close other programs, avoid USB hubs, try another port, or use an active adapter or a network interface.
            </td>
          </tr>
          <tr>
            <td>Art-Net or sACN does nothing</td>
            <td>
              Same network? Type the node&apos;s IP in <strong>Send to</strong> instead of broadcasting. Check the
              universe number (try one up or down). Use a cable instead of Wi-Fi, and check the computer&apos;s
              firewall.
            </td>
          </tr>
          <tr>
            <td>Some lights react, some do not</td>
            <td>
              Check addresses do not overlap (Setup shows a warning), add a terminator, and swap the cable before the
              first silent light.
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
