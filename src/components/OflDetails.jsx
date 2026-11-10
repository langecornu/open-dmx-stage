// "View details" window for a fixture in the Open Fixture Library: who made it, its specifications, links, and every
// mode with each channel's values, with a button to add it. Uses the native <dialog>, which traps focus and closes on
// Escape. Everything shown is plain text from our own server, which has already limited links to http and https.
import { useEffect, useRef, useState } from 'react';

import { api } from '../api.js';
import { Icon } from './Icon.jsx';
import { OflModeTable } from './OflModeTable.jsx';

const LINK_LABELS = [
  ['manual', 'Manual'],
  ['productPage', 'Product page'],
  ['video', 'Video'],
  ['other', 'More'],
];

export function OflDetails({ fixture, isOwned, isAdding, onAdd, onClose }) {
  const dialogRef = useRef(null);
  // Captured before the dialog takes focus, so focus goes back to the button that opened it.
  const triggerRef = useRef(document.activeElement);
  const [state, setState] = useState({ status: 'loading', details: null, message: '' });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    // A click on the backdrop lands on the <dialog> element itself (its content fills the rest), so it closes the window.
    const handleBackdropClick = (event) => {
      if (event.target === dialog) {
        dialog.close();
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
    let isCurrent = true;
    api
      .getOpenFixtureDetails(fixture.key)
      .then((details) => isCurrent && setState({ status: 'ready', details, message: '' }))
      .catch((caught) => isCurrent && setState({ status: 'error', details: null, message: caught.message }));
    return () => {
      isCurrent = false;
    };
  }, [fixture.key]);

  const requestClose = () => {
    if (dialogRef.current?.open) {
      dialogRef.current.close();
    } else {
      onClose();
    }
  };
  const details = state.details;

  return (
    <dialog ref={dialogRef} className="help-dialog" aria-labelledby="ofl-details-title" onClose={onClose}>
      <div className="help-head">
        <h2 id="ofl-details-title" className="section-title">
          {fixture.name}
        </h2>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Close details" onClick={requestClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="help-body">
        {state.status === 'loading' ? <p role="status">Loading details…</p> : null}
        {state.status === 'error' ? (
          <p className="error-banner" role="alert">
            {state.message}
          </p>
        ) : null}
        {details ? <Details details={details} /> : null}
      </div>
      <div className="ofl-details-foot">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!details || isOwned || isAdding}
          onClick={() => onAdd(fixture)}
        >
          {isOwned ? 'Already added' : isAdding ? 'Adding…' : 'Add to my fixtures'}
        </button>
        {details ? (
          <a className="btn" href={details.url} target="_blank" rel="noreferrer">
            View on open-fixture-library.org
          </a>
        ) : null}
      </div>
    </dialog>
  );
}

function Details({ details }) {
  const linkRows = LINK_LABELS.flatMap(([group, label]) => details.links[group].map((href) => ({ href, label })));
  return (
    <>
      <p className="view-sub">
        {details.manufacturer}
        {details.categories.length > 0 ? ` · ${details.categories.join(', ')}` : ''}
      </p>
      {details.authors.length > 0 ? (
        <p className="view-sub">
          Written by {details.authors.join(', ')}
          {details.createDate ? `, added ${details.createDate}` : ''}
          {details.lastModifyDate && details.lastModifyDate !== details.createDate
            ? `, updated ${details.lastModifyDate}`
            : ''}
          .
        </p>
      ) : null}
      {details.note ? <p className="view-sub">Note from the contributors: {details.note}</p> : null}

      {details.specifications.length > 0 ? (
        <>
          <h3>Specifications</h3>
          <dl className="ofl-specs">
            {details.specifications.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}

      {linkRows.length > 0 ? (
        <>
          <h3>Links</h3>
          <ul className="ofl-links">
            {linkRows.map((row) => (
              <li key={row.href}>
                <a href={row.href} target="_blank" rel="noreferrer">
                  {row.label}: {row.href.replace(/^https?:\/\//, '').slice(0, 70)}
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h3>Modes and channels</h3>
      {details.modes.length === 0 ? <p className="view-sub">This entry lists no modes.</p> : null}
      {details.modes.map((mode, index) => (
        <OflModeTable key={index} mode={mode} />
      ))}
    </>
  );
}
