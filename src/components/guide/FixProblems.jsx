// Guide page: what the status messages mean and how to fix common problems.
// Keep in sync with docs/CONNECTION.md, which carries the same guide for readers outside the app.

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
