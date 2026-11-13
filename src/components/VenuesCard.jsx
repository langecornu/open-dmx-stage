// Venues on Setup: the places this show plays, each with its own lights on its own addresses. The rig above is the
// active venue's. Add a venue empty or as a copy of this one (then move its lights to their addresses there), switch
// to it, rename or remove one. Looks and sequences are shared and move with the show.
import { useState } from 'react';

import { MAX_VENUES, addVenue, removeVenue, renameVenue, venuesOf } from '../../shared/venues.js';
import { downloadFile } from '../utils/download.js';
import { makeId } from '../utils/ids.js';
import { checkVenueFile, exportVenue, importVenue, venueFileName } from '../utils/venueFile.js';
import { confirmVenueSwitch, describeOutput } from '../utils/venueSwitch.js';
import { Icon } from './Icon.jsx';

const plural = (count, word) => `${count} ${count === 1 ? word : `${word}s`}`;

/**
 * @param {{ project: any, library: any[], update: (mutate: (project: any) => any) => void,
 *   output?: import('../../shared/types.js').OutputSettings | null }} props `output`: how DMX leaves the computer now
 */
export function VenuesCard({ project, library, update, output = null }) {
  const [name, setName] = useState('');
  const [problem, setProblem] = useState(/** @type {string | null} */ (null));
  const [notice, setNotice] = useState(/** @type {string | null} */ (null));

  const handleExport = (venueId, venueName) => {
    const file = exportVenue(project, venueId, { output });
    downloadFile(venueFileName(venueName), `${JSON.stringify(file, null, 2)}\n`);
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setProblem(null);
    setNotice(null);
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setProblem('That file is not a venue file (it is not JSON).');
      return;
    }
    const why = checkVenueFile(parsed);
    if (why) {
      setProblem(why);
      return;
    }
    // What it brings, for the message; the import itself runs on the show as it is when it is applied.
    const { report } = importVenue(project, parsed, makeId);
    update((current) => importVenue(current, parsed, makeId).project);
    setNotice(
      `Added the venue ${report.name}, with ${plural(report.lights, 'light')}` +
        (report.addedTypes > 0 ? ` and ${plural(report.addedTypes, 'fixture definition')}` : '') +
        '. Switch to it to use it.',
    );
  };
  const [start, setStart] = useState('copy');
  const venues = venuesOf(project);
  const isFull = venues.length >= MAX_VENUES;

  const handleAdd = (event) => {
    event.preventDefault();
    if (!name.trim() || isFull) {
      return;
    }
    update((current) => addVenue(current, name, { copyActive: start === 'copy', makeId }).project);
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
          when you come back. Each venue also remembers its output (a USB cable here, Art-Net there) and sets it again
          when you switch to it.
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
              {' · '}
              {venue.isActive
                ? `output: ${describeOutput(output)}`
                : venue.output
                  ? `output: ${describeOutput(venue.output)}`
                  : 'keeps the output as it is'}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              aria-label={`Export ${venue.name} to a file`}
              onClick={() => handleExport(venue.id, venue.name)}
            >
              <Icon name="down" size={16} />
              Export
            </button>
            {venue.isActive ? (
              <span className="badge badge-live">Here now</span>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-compact"
                  onClick={async () => {
                    const result = await confirmVenueSwitch({
                      project,
                      venueId: venue.id,
                      library,
                      update,
                      currentOutput: output,
                    });
                    setProblem(result.problem);
                  }}
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
      <div className="toolbar">
        <label className="btn">
          <Icon name="upload" size={16} />
          Import venue
          <input className="sr-only" type="file" accept=".json,application/json" onChange={handleImport} />
        </label>
        <span className="fixture-meta">A venue file brings its lights, groups, output and rig into this show.</span>
      </div>
      {notice ? (
        <p className="view-sub" role="status">
          {notice}
        </p>
      ) : null}
      {problem ? (
        <p className="error-banner" role="alert">
          {problem}
        </p>
      ) : null}
      {isFull ? <p className="fixture-meta">A show can have up to {MAX_VENUES} venues.</p> : null}
    </section>
  );
}
