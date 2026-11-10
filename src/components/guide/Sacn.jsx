// Guide page: setting up sACN (E1.31) over a network.
// Keep in sync with docs/CONNECTION.md, which carries the same guide for readers outside the app.
import { NetworkDiagram } from './NetworkDiagram.jsx';

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
