// Setup (patch): add fixtures from the library or an imported file, and review DMX addresses.
import { useMemo, useState } from 'react';

import { DMX_CHANNELS, indexFixtureTypes } from '../../shared/patch.js';
import { api } from '../api.js';
import { planFixtures } from '../utils/patchTools.js';
import { EmptyState } from './EmptyState.jsx';
import { DmxMap } from './DmxMap.jsx';
import { GroupsCard } from './GroupsCard.jsx';
import { ShowFileCard } from './ShowFileCard.jsx';
import { Icon } from './Icon.jsx';

export function PatchView({ project, library, patch, update, replaceProject }) {
  const typesById = useMemo(() => indexFixtureTypes(project, library), [project, library]);
  const allTypes = [...library, ...project.fixtureTypes];
  const [typeId, setTypeId] = useState(allTypes[0]?.id ?? '');
  const [modeIndex, setModeIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState(null);

  const selectedType = typesById.get(typeId);

  const handleAdd = () => {
    const { additions, notice } = planFixtures({ project, patch, type: selectedType, modeIndex, quantity });
    setMessage(notice);
    if (additions.length > 0) {
      update((current) => ({ ...current, fixtures: [...current.fixtures, ...additions] }));
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const converted = file.name.toLowerCase().endsWith('.qxf')
        ? await api.importQlcFixture(text)
        : await api.importOpenFixture(JSON.parse(text), '');
      update((current) => ({
        ...current,
        fixtureTypes: [...current.fixtureTypes.filter((type) => type.id !== converted.id), converted],
      }));
      setTypeId(converted.id);
      setModeIndex(0);
      setMessage(`Imported ${converted.name}. Choose it above to add it to your rig.`);
    } catch (importError) {
      setMessage(`Import failed: ${importError.message}`);
    }
  };

  const handleRemove = (id) =>
    update((current) => ({
      ...current,
      fixtures: current.fixtures.filter((fixture) => fixture.id !== id),
      // A removed light leaves its groups too, so no group points at a light that is gone.
      groups: current.groups.map((group) => ({
        ...group,
        fixtureIds: group.fixtureIds.filter((fixtureId) => fixtureId !== id),
      })),
    }));
  const handleField = (id, changes) =>
    update((current) => ({
      ...current,
      fixtures: current.fixtures.map((fixture) => (fixture.id === id ? { ...fixture, ...changes } : fixture)),
    }));

  return (
    <section className="view" aria-labelledby="patch-title">
      <div className="view-header">
        <div>
          <h1 className="view-title" id="patch-title">
            Setup
          </h1>
          <p className="view-sub">Tell the studio which lights you have and where they sit on the DMX line.</p>
        </div>
      </div>

      <div className="card card-pad toolbar">
        <label className="field">
          Fixture
          <select
            className="select"
            value={typeId}
            onChange={(event) => {
              setTypeId(event.target.value);
              setModeIndex(0);
            }}
          >
            {allTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.manufacturer ? `${type.manufacturer} – ` : ''}
                {type.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Mode
          <select className="select" value={modeIndex} onChange={(event) => setModeIndex(Number(event.target.value))}>
            {selectedType?.modes.map((mode, index) => (
              <option key={mode.name} value={index}>
                {mode.name} ({mode.channels.length} ch)
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          How many
          <input
            className="input input-narrow"
            type="number"
            min="1"
            max="64"
            value={quantity}
            onChange={(event) => setQuantity(Math.max(1, Math.min(64, Number(event.target.value) || 1)))}
          />
        </label>
        <button type="button" className="btn btn-primary" onClick={handleAdd}>
          <Icon name="plus" />
          Add to rig
        </button>
        <label className="btn">
          <Icon name="upload" />
          Import fixture file
          <input className="sr-only" type="file" accept=".json,.qxf" onChange={handleImport} />
        </label>
      </div>
      {message ? (
        <p className="view-sub" role="status">
          {message}
        </p>
      ) : null}

      {project.fixtures.length > 0 ? <DmxMap project={project} patch={patch} /> : null}

      {project.fixtures.length === 0 ? (
        <EmptyState
          icon="patch"
          title="Your rig is empty"
          hint="Add your first fixture above. Addresses are assigned for you."
        />
      ) : (
        <div className="rig-list">
          {project.fixtures.map((fixture) => {
            const range = patch.fixtures.find((entry) => entry.id === fixture.id);
            const type = typesById.get(fixture.typeId);
            return (
              <div key={fixture.id} className="card rig-row">
                <span className="rig-icon" aria-hidden="true">
                  <Icon name="control" />
                </span>
                <input
                  className="input"
                  value={fixture.name}
                  maxLength={80}
                  aria-label={`Name for ${fixture.name}`}
                  onChange={(event) => handleField(fixture.id, { name: event.target.value || fixture.name })}
                />
                <span className="rig-meta rig-hide">
                  {type ? (
                    `${type.name} · ${type.modes[fixture.mode]?.name ?? ''}`
                  ) : (
                    <span className="badge badge-bad">Missing type</span>
                  )}
                </span>
                <label className="addr-chip">
                  <span className="rig-meta">DMX</span>
                  <input
                    className="input input-narrow"
                    type="number"
                    min="1"
                    max={DMX_CHANNELS}
                    value={fixture.address}
                    aria-label={`DMX address for ${fixture.name}`}
                    onChange={(event) =>
                      handleField(fixture.id, {
                        address: Math.max(1, Math.min(DMX_CHANNELS, Number(event.target.value) || 1)),
                      })
                    }
                  />
                </label>
                <span className="rig-meta rig-hide">
                  {range && !range.missingType ? `Uses ${range.start}–${range.end}` : '—'}{' '}
                  {range?.outOfRange ? <span className="badge badge-bad">Exceeds 512</span> : null}
                  {range?.overlaps?.length ? <span className="badge badge-warn">Overlap</span> : null}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-danger"
                  aria-label={`Remove ${fixture.name}`}
                  onClick={() => handleRemove(fixture.id)}
                >
                  <Icon name="trash" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {project.fixtures.length > 0 ? <GroupsCard project={project} update={update} /> : null}
      <ShowFileCard onImported={replaceProject} />
    </section>
  );
}
