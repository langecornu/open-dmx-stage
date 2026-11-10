// Fixtures: your own fixture definitions (manufacturer, model, description and channel layout) beside the built-in
// ones. Definitions you make are saved in the show. The built-in U'King moving head is the worked example.
import { useState } from 'react';

import {
  duplicateFixtureType,
  fixtureTitle,
  MAX_FIXTURE_TYPES,
  newFixtureType,
  usageCount,
} from '../utils/fixtureTypes.js';
import { FixtureTypeEditor } from './FixtureTypeEditor.jsx';
import { Icon } from './Icon.jsx';

const EXAMPLE_ID = 'uking-40w-beam-moving-head';

export function FixturesView({ project, library, update }) {
  const [selectedId, setSelectedId] = useState(project.fixtureTypes[0]?.id ?? EXAMPLE_ID);
  const own = project.fixtureTypes;
  const builtIn = library.filter((type) => !own.some((mine) => mine.id === type.id));
  const type = [...own, ...builtIn].find((candidate) => candidate.id === selectedId) ?? null;
  const isBuiltIn = type !== null && !own.some((mine) => mine.id === type.id);
  const isFull = own.length >= MAX_FIXTURE_TYPES;

  const handleChange = (changes) =>
    update((current) => ({
      ...current,
      fixtureTypes: current.fixtureTypes.map((candidate) =>
        candidate.id === selectedId ? { ...candidate, ...changes } : candidate,
      ),
    }));
  const addType = (created) => {
    update((current) => ({ ...current, fixtureTypes: [...current.fixtureTypes, created] }));
    setSelectedId(created.id);
  };
  const handleDelete = () => {
    update((current) => ({
      ...current,
      fixtureTypes: current.fixtureTypes.filter((candidate) => candidate.id !== selectedId),
    }));
    setSelectedId(EXAMPLE_ID);
  };

  const renderItem = (item) => (
    <li key={item.id}>
      <button
        type="button"
        className="list-item"
        aria-current={item.id === selectedId}
        onClick={() => setSelectedId(item.id)}
      >
        <span>
          <strong>{item.name}</strong>
          {item.manufacturer ? <small className="fixture-meta"> {item.manufacturer}</small> : null}
        </span>
      </button>
    </li>
  );

  return (
    <section className="view" aria-labelledby="fixtures-title">
      <div className="view-header">
        <div>
          <h1 className="view-title" id="fixtures-title">
            Fixtures
          </h1>
          <p className="view-sub">
            Describe a light by hand: who makes it, what it is, and what each DMX channel does. Then add it to your rig
            in Setup. Find the channel table in the light&apos;s manual.
          </p>
        </div>
        <button type="button" className="btn btn-primary" disabled={isFull} onClick={() => addType(newFixtureType())}>
          <Icon name="plus" />
          New fixture
        </button>
      </div>

      <div className="split">
        <div className="fixture-lists">
          <h2 className="section-title">Your fixtures</h2>
          {own.length === 0 ? (
            <p className="view-sub">None yet. Make a copy of the example, or choose New fixture.</p>
          ) : (
            <ul className="card list" aria-label="Your fixtures">
              {own.map(renderItem)}
            </ul>
          )}
          <h2 className="section-title">Built in</h2>
          <ul className="card list" aria-label="Built-in fixtures">
            {builtIn.map(renderItem)}
          </ul>
        </div>

        {type ? (
          <FixtureTypeEditor
            key={type.id}
            type={type}
            isBuiltIn={isBuiltIn}
            usedBy={usageCount(project, type.id)}
            onChange={handleChange}
            onDuplicate={() => addType(duplicateFixtureType(type))}
            onDelete={handleDelete}
          />
        ) : (
          <p className="view-sub">Choose a fixture on the left.</p>
        )}
      </div>
      <p className="view-sub">
        {type ? `Selected: ${fixtureTitle(type)}. ` : ''}Your fixtures are saved in the show file, so exporting the show
        takes them along.
      </p>
    </section>
  );
}
