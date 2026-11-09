// Guide content, part 1: the big picture, passive vs active adapters, and the two USB interface types.
// Keep in sync with docs/CONNECTION.md, which carries the same guide for readers outside the app.
import { ChainDiagram } from './HelpDiagrams.jsx';

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

export function PassiveOrActive() {
  return (
    <>
      <p>
        USB-to-DMX adapters come in two families. They look similar but work differently, and the app needs to know
        which you have, because it speaks to them differently.
      </p>
      <table className="help-table">
        <thead>
          <tr>
            <th />
            <th>Passive (cheap cable)</th>
            <th>Active (with a processor)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Also called</th>
            <td>&ldquo;Open DMX&rdquo; style, no microcontroller</td>
            <td>&ldquo;Pro&rdquo;, microcontroller-based, buffered</td>
          </tr>
          <tr>
            <th scope="row">Examples</th>
            <td>DSD TECH SH-RS09B, ENTTEC Open DMX USB</td>
            <td>ENTTEC DMX USB Pro, DMXKing ultraDMX Micro or Pro</td>
          </tr>
          <tr>
            <th scope="row">Inside</th>
            <td>A USB-serial chip and a line driver. Nothing else.</td>
            <td>A small computer of its own that builds the DMX signal.</td>
          </tr>
          <tr>
            <th scope="row">Who makes the timing</th>
            <td>Your computer, bit by bit, all the time</td>
            <td>The adapter. The computer only sends the 512 values.</td>
          </tr>
          <tr>
            <th scope="row">If the computer is busy</th>
            <td>Lights may flicker or glitch</td>
            <td>Output stays steady</td>
          </tr>
          <tr>
            <th scope="row">Price</th>
            <td>Usually the cheapest option</td>
            <td>Usually several times more</td>
          </tr>
          <tr>
            <th scope="row">Choose in this app</th>
            <td>
              <strong>USB-DMX cable</strong>
            </td>
            <td>
              <strong>ENTTEC DMX USB Pro</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <h3>How to tell which one you have</h3>
      <ol className="help-steps">
        <li>
          <strong>Read the product page or the box.</strong> Words like &ldquo;Open DMX&rdquo;, &ldquo;passive&rdquo;,
          or &ldquo;no microcontroller&rdquo; mean passive. Words like &ldquo;Pro&rdquo;, &ldquo;microcontroller&rdquo;,
          &ldquo;Widget API&rdquo;, &ldquo;RDM&rdquo; or &ldquo;isolated&rdquo; mean active.
        </li>
        <li>
          <strong>Look at it.</strong> A plain cable with a slightly thicker end and an XLR plug is usually passive. A
          small metal or plastic box with LEDs and XLR sockets is usually active.
        </li>
        <li>
          <strong>Think about what you paid.</strong> A very cheap adapter is almost always passive.
        </li>
        <li>
          <strong>Check another program.</strong> In QLC+ or similar software, the driver menu lists &ldquo;Open DMX
          USB&rdquo; and &ldquo;DMX USB Pro&rdquo; separately. Whichever one makes your lights respond tells you the
          type.
        </li>
        <li>
          <strong>Try it here.</strong> Choose one type and press Connect. If the lights stay dark, switch to the other
          type and try again. Only the right one works. A wrong choice is unlikely to cause harm, but it has not been
          tested, so unplug your lights from the cable while you experiment if you want to be careful.
        </li>
      </ol>
      <p className="help-note">
        Heads up: in the port list, both kinds can show an <strong>FTDI cable</strong> label, because both use the same
        USB chip. The label does not tell you which type it is. SoundSwitch&apos;s own dongles are a separate,
        proprietary kind and are not supported.
      </p>
      <h3>Which should I use?</h3>
      <p>
        If you have both, prefer the <strong>active</strong> adapter or a <strong>network</strong> interface for shows.
        Passive cables work, but they depend on your computer being quiet, so treat them as great for learning and small
        rigs, and test them well before an event.
      </p>
    </>
  );
}

export function UsbCable() {
  return (
    <>
      <p>
        Use this for passive USB-to-DMX cables such as the <strong>DSD TECH SH-RS09B</strong> and the ENTTEC Open DMX
        USB. This is the experimental option: it has not been tested on real hardware yet, so tell us how it goes.
      </p>
      <ol className="help-steps">
        <li>
          <strong>Close other lighting programs</strong> (QLC+, Lightkey, Freestyler and so on). Only one program can
          use the cable at a time.
        </li>
        <li>
          <strong>Plug the USB end into the computer</strong> directly, not through a hub, and the XLR end into the
          first light&apos;s DMX <em>IN</em> socket.
        </li>
        <li>
          <strong>Choose &ldquo;USB-DMX cable&rdquo;</strong> in the Connection card.
        </li>
        <li>
          <strong>Pick the Serial port.</strong> Not sure which one is yours? Press <strong>Refresh</strong>, unplug the
          cable, press Refresh again, plug it back in and press Refresh once more. The entry that disappears and returns
          is your cable. FTDI cables are labelled.
        </li>
        <li>
          Press <strong>Connect</strong>. The top bar should change to <strong>DMX ready</strong>.
        </li>
        <li>
          Open <strong>Lights</strong>, pick a colour, and check the real light changes.
        </li>
      </ol>
      <h3>What the port looks like</h3>
      <table className="help-table">
        <tbody>
          <tr>
            <th scope="row">macOS</th>
            <td>
              <code>/dev/tty.usbserial-XXXX</code>
            </td>
          </tr>
          <tr>
            <th scope="row">Windows</th>
            <td>
              <code>COM3</code> (any COM number)
            </td>
          </tr>
          <tr>
            <th scope="row">Linux</th>
            <td>
              <code>/dev/ttyUSB0</code> (you may need to join the <code>dialout</code> group)
            </td>
          </tr>
        </tbody>
      </table>
      <p className="help-note">
        Because this cable has no processor, the computer makes the DMX timing. If lights flicker, close other programs,
        try another USB port, or move to an active adapter or a network interface.
      </p>
    </>
  );
}

export function EnttecPro() {
  return (
    <>
      <p>
        Use this for <strong>active</strong> USB adapters that speak the ENTTEC DMX USB Pro protocol: the ENTTEC DMX USB
        Pro and DMXKing ultraDMX interfaces. They have their own processor, so output stays steady even when the
        computer is busy. This has not been tested on real hardware yet.
      </p>
      <ol className="help-steps">
        <li>
          Close other lighting programs, plug the adapter into the computer, and connect its DMX OUT to the first
          light&apos;s DMX IN.
        </li>
        <li>
          Choose <strong>ENTTEC DMX USB Pro</strong> in the Connection card.
        </li>
        <li>
          Pick the <strong>Serial port</strong> (use Refresh, or the unplug-and-replug trick from the USB cable tab).
        </li>
        <li>
          Press <strong>Connect</strong>, then test in <strong>Lights</strong>.
        </li>
      </ol>
      <p className="help-note">
        If you chose this but the lights do nothing, your adapter may be a passive one. Try{' '}
        <strong>USB-DMX cable</strong> instead.
      </p>
    </>
  );
}
