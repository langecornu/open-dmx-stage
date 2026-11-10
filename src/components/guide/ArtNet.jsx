// Guide page: setting up Art-Net over a network.
// Keep in sync with docs/CONNECTION.md, which carries the same guide for readers outside the app.
import { NetworkDiagram } from './NetworkDiagram.jsx';

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
