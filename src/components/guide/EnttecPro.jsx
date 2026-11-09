// Guide page: setting up an ENTTEC DMX USB Pro or DMXKing adapter.
// Keep in sync with docs/CONNECTION.md, which carries the same guide for readers outside the app.

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
