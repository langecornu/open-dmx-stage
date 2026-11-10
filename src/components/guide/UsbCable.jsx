// Guide page: setting up a passive USB-DMX cable.
// Keep in sync with docs/CONNECTION.md, which carries the same guide for readers outside the app.

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
          is your cable. FTDI cables are labelled. Not sure the interface type is right? Press{' '}
          <strong>Detect adapter</strong> and the app will check and choose for you.
        </li>
        <li>
          Press <strong>Connect</strong>. The top bar should change to <strong>DMX ready</strong>.
        </li>
        <li>
          Press <strong>Test lights</strong> on the same card. Every light you have added in Setup cycles through red,
          green, blue and white. If a light does not follow, check its address and mode. Press{' '}
          <strong>Stop test</strong> when you are done.
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
