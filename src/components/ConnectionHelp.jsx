// A modal with the full connection guide. Uses the native <dialog> element, which traps focus and closes on Escape.
import { useEffect, useRef, useState } from 'react';

import { ArtNet } from './guide/ArtNet.jsx';
import { EnttecPro } from './guide/EnttecPro.jsx';
import { FixProblems } from './guide/FixProblems.jsx';
import { PassiveOrActive } from './guide/PassiveOrActive.jsx';
import { Sacn } from './guide/Sacn.jsx';
import { StartHere } from './guide/StartHere.jsx';
import { UsbCable } from './guide/UsbCable.jsx';
import { Wiring } from './guide/Wiring.jsx';
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

export function ConnectionHelp({ initialTab = 'start', onClose }) {
  const dialogRef = useRef(null);
  const bodyRef = useRef(null);
  // Captured during the first render, before the dialog moves focus, so we can hand focus back afterwards.
  const triggerRef = useRef(document.activeElement);
  const [tabId, setTabId] = useState(initialTab);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    // A click on the backdrop lands on the <dialog> element itself (its content fills the rest), so it closes the guide.
    const handleBackdropClick = (event) => {
      if (event.target === dialog) {
        requestCloseRef.current();
      }
    };
    dialog?.addEventListener('click', handleBackdropClick);
    const trigger = triggerRef.current;
    return () => {
      dialog?.removeEventListener('click', handleBackdropClick);
      trigger?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [tabId]);

  // Closing goes through dialog.close() so the browser's own close handling (and the close event) runs.
  const requestClose = () => {
    if (dialogRef.current?.open) {
      dialogRef.current.close();
    } else {
      onClose();
    }
  };
  const requestCloseRef = useRef(requestClose);
  // Updated after each render (not during it), so the backdrop listener always calls the latest version.
  useEffect(() => {
    requestCloseRef.current = requestClose;
  });

  const handleTabKey = (event, index) => {
    let nextIndex = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % TABS.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + TABS.length) % TABS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = TABS.length - 1;
    }
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    const next = TABS[nextIndex];
    setTabId(next.id);
    document.getElementById(`help-tab-${next.id}`)?.focus();
  };

  const active = TABS.find((tab) => tab.id === tabId) ?? TABS[0];
  const ActiveContent = active.Content;

  return (
    <dialog ref={dialogRef} className="help-dialog" aria-labelledby="help-title" onClose={onClose}>
      <div className="help-head">
        <h2 id="help-title" className="section-title">
          How to connect your lights
        </h2>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Close guide" onClick={requestClose}>
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
      <div
        id="help-panel"
        ref={bodyRef}
        className="help-body"
        role="tabpanel"
        aria-labelledby={`help-tab-${active.id}`}
      >
        <ActiveContent />
      </div>
    </dialog>
  );
}
