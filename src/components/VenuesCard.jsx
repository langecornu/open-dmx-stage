// Venues on Setup: the places this show plays, each with its own lights on its own addresses. The rig above is the
// active venue's. Add a venue empty or as a copy of this one (then move its lights to their addresses there), switch
// to it, rename or remove one. Looks and sequences are shared and move with the show.
import { useState } from 'react';

import { MAX_VENUES, addVenue, removeVenue, renameVenue, venuesOf } from '../../shared/venues.js';
import { confirmVenueSwitch } from '../utils/venueSwitch.js';
import { Icon } from './Icon.jsx';

const plural = (count, word) => `${count} ${count === 1 ? word : `${word}s`}`;

export function VenuesCard({ project, library, update }) {
  const [name, setName] = useState('');
  const [start, setStart] = useState('copy');
  const venues = venuesOf(project);
  const isFull = venues.length >= MAX_VENUES;

  const handleAdd = (event) => {
    event.preventDefault();
    if (!name.trim() || isFull) {
      return;
    }
    update(
      (current) => addVenue(current, name, { copyActive: start === 'copy', makeId: () => crypto.randomUUID() }).project,
    );
    setName('');
  };

  return (
    <section className="card card-pad venues" aria-labelledby="venues-title">
      <div>
        <h2 className="section-title" id="venues-title">
          Venues
        </h2>
        <p className="view-sub">
          Where this show plays, each with its own lights and addresses. Your looks and sequences go with the show: when
          you switch, they move onto that venue&apos;s lights. A light the venue does not have keeps its settings for
          when you come back.
        </p>
      </div>
      <ul className="venues-list">
        {venues.map((venue) => (
          <li key={venue.id} className="venues-row" data-active={venue.isActive}>
            <Icon name="pin" />
            <input
              className="input"
              defaultValue={venue.name}
              maxLength={80}
              aria-label={`Venue name: ${venue.name}`}
              onBlur={(event) => update((current) => renameVenue(current, venue.id, event.target.value))}
            />
            <span className="fixture-meta">
              {plural(venue.fixtures.length, 'light')}
              {venue.groups.length > 0 ? ` · ${plural(venue.groups.length, 'group')}` : ''}
            </span>
            {venue.isActive ? (
              <span className="badge badge-live">Here now</span>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-compact"
                  onClick={() => confirmVenueSwitch({ project, venueId: venue.id, library, update })}
                >
                  Switch here
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-compact"
                  aria-label={`Remove ${venue.name}`}
                  onClick={() => {
                    if (window.confirm(`Remove the venue "${venue.name}" and its lights? Looks and sequences stay.`)) {
                      update((current) => removeVenue(current, venue.id));
                    }
                  }}
                >
                  <Icon name="trash" size={16} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form className="toolbar" onSubmit={handleAdd}>
        <label className="field">
          New venue
          <input
            className="input"
            value={name}
            maxLength={80}
            placeholder="Club, Hall, Garden…"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field">
          Start with
          <select className="select" value={start} onChange={(event) => setStart(event.target.value)}>
            <option value="copy">The lights here (then change addresses)</option>
            <option value="empty">No lights</option>
          </select>
        </label>
        <button type="submit" className="btn" disabled={!name.trim() || isFull}>
          <Icon name="plus" size={16} />
          Add venue
        </button>
      </form>
      {isFull ? <p className="fixture-meta">A show can have up to {MAX_VENUES} venues.</p> : null}
    </section>
  );
}
