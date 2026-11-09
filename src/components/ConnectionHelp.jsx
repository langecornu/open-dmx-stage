// A modal with the full connection guide. Uses the native <dialog> element, which traps focus and closes on Escape.
import { useEffect, useRef, useState } from 'react';

import { EnttecPro, PassiveOrActive, StartHere, UsbCable } from './helpContentBasics.jsx';
import { ArtNet, FixProblems, Sacn, Wiring } from './helpContentNetwork.jsx';
import { Icon } from './Icon.jsx';

const TABS = [
  { id: 'start', label: 'Start here', Content: StartHere },
  { id: 'passive', label: 'Passive or active?', Content: PassiveOrActive },
  { id: 'usb', label: 'USB cable', Content: UsbCable },
  { id: 'pro', label: 'ENTTEC Pro', Content: EnttecPro },
  { id: 'artnet', label: 'Art-Net', Content: ArtNet },
  { id: 'sacn', label: 'sACN', Content: Sacn },
  { id: 'wiring', label: 'Wiring & addresses', Content: Wiring },
  { id: 'fix', label: 'Fix problems', Content: FixProblems },
];

export const TAB_FOR_DRIVER = { mock: 'start', 'open-dmx': 'usb', 'enttec-pro': 'pro', artnet: 'artnet', sacn: 'sacn' };

export function ConnectionHelp({ initialTab = 'start', onClose }) {
  const dialogRef = useRef(null);
  const [tabId, setTabId] = useState(initialTab);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  const handleTabKey = (event, index) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length];
    setTabId(next.id);
    document.getElementById(`help-tab-${next.id}`)?.focus();
  };

  const active = TABS.find((tab) => tab.id === tabId) ?? TABS[0];
  const ActiveContent = active.Content;

  return (
    <dialog
      ref={dialogRef}
      className="help-dialog"
      aria-labelledby="help-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="help-head">
        <h2 id="help-title" className="section-title">
          How to connect your lights
        </h2>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Close guide" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="help-tabs" role="tablist" aria-label="Guide sections">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`help-tab-${tab.id}`}
            type="button"
            role="tab"
            className="help-tab"
            aria-selected={tab.id === active.id}
            aria-controls="help-panel"
            tabIndex={tab.id === active.id ? 0 : -1}
            onClick={() => setTabId(tab.id)}
            onKeyDown={(event) => handleTabKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div id="help-panel" className="help-body" role="tabpanel" aria-labelledby={`help-tab-${active.id}`}>
        <ActiveContent />
      </div>
    </dialog>
  );
}
