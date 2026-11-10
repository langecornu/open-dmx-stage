// Guide page: how to tell a passive USB-DMX cable from an active adapter.
// Keep in sync with docs/CONNECTION.md, which carries the same guide for readers outside the app.

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
            <th>
              <span className="sr-only">Feature</span>
            </th>
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
