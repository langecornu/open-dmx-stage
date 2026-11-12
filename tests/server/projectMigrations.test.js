// Tests for show file migrations and the project service: upgrading old files, the rolling backup, and never
// overwriting a file that cannot be read.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { CURRENT_SCHEMA_VERSION, projectSchema } from '../../server/schemas/projectSchema.js';
import { migrateProject } from '../../server/services/projectMigrations.js';
import { ProjectService } from '../../server/services/projectService.js';

const VERSION_1 = {
  name: 'Saved long ago',
  fixtureTypes: [],
  fixtures: [],
  scenes: [{ id: 's1', name: 'Red', values: { 1: 255 } }],
  chases: [
    {
      id: 'c1',
      name: 'Loop',
      loop: true,
      steps: [
        { sceneId: 's1', fadeMs: 100, holdMs: 200 },
        { sceneId: 's1', fadeMs: 0, holdMs: 50 },
      ],
    },
  ],
};

describe('migrateProject', () => {
  it('upgrades a version 1 show: adds the schema version and a unique id to every chase step', () => {
    const migrated = migrateProject(VERSION_1);
    assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION, 'the file is now at the current version');
    const ids = migrated.chases[0].steps.map((step) => step.id);
    assert.ok(
      ids.every((id) => typeof id === 'string' && id.length > 0),
      'every step has an id',
    );
    assert.equal(new Set(ids).size, 2, 'ids are unique');
  });

  it('keeps existing step ids and does not modify its input', () => {
    const show = structuredClone(VERSION_1);
    show.chases[0].steps[0].id = 'keep-me';
    const copy = structuredClone(show);
    const migrated = migrateProject(show);
    assert.equal(migrated.chases[0].steps[0].id, 'keep-me', 'an existing id survives');
    assert.deepEqual(show, copy, 'the original object is untouched');
  });

  it('upgrades a version 2 show: adds groups, and beat timing worked out at 120 beats per minute', () => {
    const version2 = {
      schemaVersion: 2,
      name: 'Two',
      fixtureTypes: [],
      fixtures: [],
      scenes: [],
      chases: [{ id: 'c', name: 'C', loop: true, steps: [{ id: 's', sceneId: 'x', fadeMs: 1000, holdMs: 2000 }] }],
    };
    const migrated = migrateProject(version2);
    assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION, 'it is now current');
    assert.deepEqual(migrated.groups, [], 'there are no groups yet');
    assert.equal(migrated.chases[0].timing, 'seconds', 'the sequence still runs in seconds');
    assert.equal(migrated.chases[0].steps[0].fadeBeats, 2, '1 s is 2 beats at 120 bpm');
    assert.equal(migrated.chases[0].steps[0].holdBeats, 4, '2 s is 4 beats at 120 bpm');
    assert.equal(migrated.chases[0].steps[0].fadeMs, 1000, 'the seconds are kept');
  });

  it('upgrades a version 3 show: adds an empty list of timelines, and keeps everything else', () => {
    const version3 = { ...migrateProject(VERSION_1), schemaVersion: 3 };
    delete version3.timelines;
    const migrated = migrateProject(version3);
    assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.deepEqual(migrated.timelines, [], 'no timelines yet');
    assert.deepEqual(migrated.chases, version3.chases, 'sequences are untouched');
    assert.doesNotThrow(() => projectSchema.parse(migrated), 'the result is a valid show');
  });

  it('upgrades a version 4 show without changing it, and then allows timelines of up to 64 bars', () => {
    const timeline = { id: 't', name: 'T', beats: 16, blocks: [] };
    const version4 = { ...migrateProject(VERSION_1), schemaVersion: 4, timelines: [timeline] };
    const migrated = migrateProject(version4);
    assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.deepEqual(migrated.timelines, [timeline], 'timelines are untouched');
    const withLength = (beats) => projectSchema.safeParse({ ...migrated, timelines: [{ ...timeline, beats }] }).success;
    assert.equal(withLength(256), true, '64 bars is allowed');
    assert.equal(withLength(20), true, 'any whole number of bars is allowed (5 bars)');
    assert.equal(withLength(260), false, 'more than 64 bars is refused');
    assert.equal(withLength(6), false, 'part of a bar is refused');
  });

  it('is a no-op for a current show, and refuses newer or non-show input', () => {
    const current = { ...VERSION_1, schemaVersion: CURRENT_SCHEMA_VERSION };
    assert.equal(migrateProject(current).schemaVersion, CURRENT_SCHEMA_VERSION, 'current files pass through');
    assert.throws(() => migrateProject({ ...VERSION_1, schemaVersion: CURRENT_SCHEMA_VERSION + 1 }), /newer version/);
    assert.throws(() => migrateProject(null), /not an Open DMX Stage show/);
    assert.throws(() => migrateProject([]), /not an Open DMX Stage show/);
  });
});

describe('ProjectService', () => {
  let dataDir;
  before(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'odmx-project-'));
  });
  after(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('loads and upgrades an old file from disk', async () => {
    await writeFile(path.join(dataDir, 'project.json'), JSON.stringify(VERSION_1));
    const service = new ProjectService({ dataDir });
    const project = await service.load();
    assert.equal(project.schemaVersion, CURRENT_SCHEMA_VERSION, 'the loaded show is upgraded');
    assert.equal(project.name, 'Saved long ago', 'the content is kept');
  });

  it('keeps the previous save as a rolling backup', async () => {
    const service = new ProjectService({ dataDir });
    const first = await service.load();
    await service.save({ ...first, name: 'First save' });
    await service.save({ ...first, name: 'Second save' });
    const current = JSON.parse(await readFile(path.join(dataDir, 'project.json'), 'utf8'));
    const backup = JSON.parse(await readFile(path.join(dataDir, 'project.json.bak'), 'utf8'));
    assert.equal(current.name, 'Second save', 'the file holds the newest save');
    assert.equal(backup.name, 'First save', 'the backup holds the one before it');
  });

  it('moves an unreadable file aside instead of overwriting it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'odmx-bad-'));
    await writeFile(path.join(dir, 'project.json'), '{ this is not json');
    const service = new ProjectService({ dataDir: dir });
    const project = await service.load();
    assert.equal(project.name, 'Untitled show', 'the app starts with an empty show');
    const names = await readdir(dir);
    assert.ok(
      names.some((name) => name.startsWith('project.json.unreadable-')),
      'the bad file was kept next to it',
    );
    assert.ok(!names.includes('project.json'), 'the bad file is no longer where the next save would overwrite it');
    await rm(dir, { recursive: true, force: true });
  });

  it('leaves a show from a newer app version untouched, refuses to save over it, and lets an explicit import replace it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'odmx-newer-'));
    const newer = JSON.stringify({ ...VERSION_1, schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
    await writeFile(path.join(dir, 'project.json'), newer);
    const service = new ProjectService({ dataDir: dir });
    const project = await service.load();
    assert.equal(project.name, 'Untitled show', 'the app starts with an empty show');
    assert.equal(await readFile(path.join(dir, 'project.json'), 'utf8'), newer, 'the newer file is not modified');
    assert.deepEqual(await readdir(dir), ['project.json'], 'and it is not moved aside either');
    await assert.rejects(service.save(project), (error) => error.status === 409 && /newer version/.test(error.message));
    assert.equal(await readFile(path.join(dir, 'project.json'), 'utf8'), newer, 'a refused save leaves the file alone');

    await service.save({ ...project, name: 'Imported on purpose' }, { replaceNewerShow: true });
    assert.equal(JSON.parse(await readFile(path.join(dir, 'project.json'), 'utf8')).name, 'Imported on purpose');
    await service.save({ ...project, name: 'Saved normally afterwards' });
    await rm(dir, { recursive: true, force: true });
  });
});
