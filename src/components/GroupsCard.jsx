// Groups: name sets of lights (front wash, left side) so an effect can run on just those lights.
import { categoriesByFixture } from '../utils/deviceCategories.js';
import { listNames } from '../utils/lookCoverage.js';
import { DeviceIcon } from './DeviceIcon.jsx';

export function GroupsCard({ project, library = [], update }) {
  const categories = categoriesByFixture(project, library);
  const patchGroup = (id, changes) =>
    update((current) => ({
      ...current,
      groups: current.groups.map((group) => (group.id === id ? { ...group, ...changes } : group)),
    }));

  const handleCreate = () =>
    update((current) => ({
      ...current,
      groups: [
        ...current.groups,
        { id: crypto.randomUUID(), name: `Group ${current.groups.length + 1}`, fixtureIds: [] },
      ],
    }));
  const handleDelete = (id) => update((current) => ({ ...current, groups: current.groups.filter((g) => g.id !== id) }));
  const handleToggle = (group, fixtureId) =>
    patchGroup(group.id, {
      fixtureIds: group.fixtureIds.includes(fixtureId)
        ? group.fixtureIds.filter((candidate) => candidate !== fixtureId)
        : [...group.fixtureIds, fixtureId],
    });

  const grouped = new Set(project.groups.flatMap((group) => group.fixtureIds));
  const ungrouped = project.fixtures.filter((fixture) => !grouped.has(fixture.id));

  return (
    <section className="card card-pad groups-card" aria-label="Groups">
      <div className="section-bar">
        <h2 className="section-title">Groups</h2>
        <button type="button" className="btn" onClick={handleCreate}>
          New group
        </button>
      </div>
      {project.groups.length === 0 ? (
        <p className="view-sub">Group lights (for example the front row) to run an effect on just those lights.</p>
      ) : null}
      {ungrouped.length > 0 && project.groups.length > 0 ? (
        <p className="view-sub" role="note">
          Not in any group: {listNames(ungrouped.map((fixture) => fixture.name))}. Tick{' '}
          {ungrouped.length === 1 ? 'it' : 'them'} below to run effects on {ungrouped.length === 1 ? 'it' : 'them'} with
          a group.
        </p>
      ) : null}
      {project.groups.map((group) => (
        <div key={group.id} className="group-row">
          <div className="toolbar">
            <input
              className="input"
              value={group.name}
              maxLength={80}
              aria-label={`Name for group ${group.name}`}
              onChange={(event) => patchGroup(group.id, { name: event.target.value || group.name })}
            />
            <button type="button" className="btn btn-danger" onClick={() => handleDelete(group.id)}>
              Delete {group.name}
            </button>
          </div>
          <fieldset className="group-members">
            <legend>Lights in {group.name}</legend>
            {project.fixtures.map((fixture) => (
              <label key={fixture.id} className="pill">
                <input
                  type="checkbox"
                  checked={group.fixtureIds.includes(fixture.id)}
                  onChange={() => handleToggle(group, fixture.id)}
                />
                <DeviceIcon category={categories.get(fixture.id) ?? 'other'} size={18} />
                {fixture.name}
              </label>
            ))}
          </fieldset>
        </div>
      ))}
    </section>
  );
}
