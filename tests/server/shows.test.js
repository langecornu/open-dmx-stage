// Integration tests for File: saving the show being worked on into folders, opening, starting, deleting and importing
// shows, with the open show in project.json and the saved ones in the shows folder.
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../../server/app.js';
import { MockDriver } from '../../server/clients/mockDriver.js';
import { CURRENT_SCHEMA_VERSION } from '../../server/schemas/projectSchema.js';
import { DmxEngine } from '../../server/services/dmxEngine.js';
import { OutputManager } from '../../server/services/outputManager.js';
import { ProjectService } from '../../server/services/projectService.js';

let server;
let baseUrl;
let dataDir;
let engine;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'odmx-shows-'));
  const config = { allowedOrigins: ['http://localhost:5173'], distDir: path.join(dataDir, 'none') };
  const projectService = new ProjectService({ dataDir });
  await projectService.load();
  engine = new DmxEngine({ driver: new MockDriver() });
  const outputManager = new OutputManager({
    engine,
    dataDir,
    defaults: { driver: 'mock' },
    listPorts: async () => [],
    probe: async () => ({ kind: 'no-response', suggestedInterface: 'open-dmx', message: 'stub' }),
  });
  server = createServer(createApp({ config, engine, projectService, outputManager }));
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}/api/v1`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
});

const call = async (method, route, body) => {
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

const clubShow = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: 'club-show',
  name: 'Club night',
  fixtureTypes: [],
  fixtures: [{ id: 'f1', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1 }],
  scenes: [{ id: 's1', name: 'Red', values: { 1: 255 } }],
  chases: [],
  groups: [],
};

describe('File: save and open shows, in folders', () => {
  it('saves the show being worked on under a name, in a folder it makes, and lists it with its details', async () => {
    assert.equal((await call('PUT', '/project', clubShow)).status, 200);
    const saved = await call('POST', '/shows/save', { name: 'Club night', folder: 'Clubs/Montréal' });
    assert.equal(saved.status, 200);
    assert.deepEqual([saved.body.project.name, saved.body.folder], ['Club night', 'Clubs/Montréal']);
    const list = await call('GET', '/shows');
    assert.deepEqual(list.body.folders, ['Clubs', 'Clubs/Montréal']);
    assert.deepEqual(
      list.body.shows.map((show) => [
        show.id,
        show.name,
        show.folder,
        show.venue,
        show.lights,
        show.looks,
        show.sequences,
      ]),
      [['club-show', 'Club night', 'Clubs/Montréal', 'My venue', 1, 1, 0]],
    );
    assert.equal(list.body.current.folder, 'Clubs/Montréal', 'the open show knows where it is saved');
    assert.ok(list.body.current.savedAt);
  });

  it('moves a show to another folder when saved there, keeping one copy', async () => {
    await call('POST', '/shows/save', { name: 'Club night', folder: 'Clubs' });
    const shows = (await call('GET', '/shows')).body.shows;
    assert.deepEqual(
      shows.map((show) => [show.id, show.folder]),
      [['club-show', 'Clubs']],
    );
  });

  it('starts a new show, saving the one being worked on to its place first', async () => {
    await call('PUT', '/project', {
      ...clubShow,
      scenes: [...clubShow.scenes, { id: 's2', name: 'Blue', values: { 3: 255 } }],
    });
    const created = await call('POST', '/shows/new', { name: 'Wedding' });
    assert.equal(created.status, 200);
    assert.equal(created.body.fixtures.length, 0);
    const list = await call('GET', '/shows');
    assert.equal(list.body.current.name, 'Wedding');
    assert.equal(list.body.current.folder, null, 'not saved yet');
    const club = list.body.shows.find((show) => show.id === 'club-show');
    assert.deepEqual([club.folder, club.looks], ['Clubs', 2], 'saved where it was, with the latest changes');
  });

  it('opens a saved show, which stays in the list, and stops what was playing', async () => {
    engine.recallScene({ id: 'x', name: 'X', values: { 1: 255 } });
    const opened = await call('POST', '/shows/club-show/open');
    assert.equal(opened.status, 200);
    assert.equal(opened.body.name, 'Club night');
    assert.equal(engine.getState().activeSceneId, null);
    const list = await call('GET', '/shows');
    assert.equal(list.body.current.id, 'club-show');
    assert.deepEqual(
      list.body.shows.map((show) => show.name).sort(),
      ['Club night', 'Wedding'],
      'Wedding was kept because it was named; Club night is still listed',
    );
  });

  it('imports a show file as a new show in the list, even when the same file is imported twice', async () => {
    const first = await call('POST', '/project/import', { ...clubShow, name: 'From a friend' });
    const second = await call('POST', '/project/import', { ...clubShow, name: 'From a friend' });
    assert.equal(first.status, 200);
    assert.notEqual(first.body.id, second.body.id);
    assert.notEqual(first.body.id, 'club-show', 'an imported file does not overwrite a saved show');
    const friends = (await call('GET', '/shows')).body.shows.filter((show) => show.name === 'From a friend');
    assert.equal(friends.length, 2);
    assert.ok(friends.every((show) => show.folder === ''));
  });

  it('deletes a saved show, but not the one being worked on', async () => {
    const current = (await call('GET', '/shows')).body.current.id;
    assert.equal((await call('DELETE', `/shows/${current}`)).status, 409);
    assert.equal((await call('DELETE', '/shows/club-show')).status, 200);
    const ids = (await call('GET', '/shows')).body.shows.map((show) => show.id);
    assert.equal(ids.includes('club-show'), false);
    assert.equal((await call('POST', '/shows/club-show/open')).status, 404);
  });

  it('makes and removes folders, refusing one that is not empty, and names that could leave the list', async () => {
    assert.deepEqual(
      (await call('POST', '/shows/folders', { folder: 'Weddings/2027' })).body.folders.includes('Weddings/2027'),
      true,
    );
    assert.equal((await call('DELETE', '/shows/folders', { folder: 'Weddings' })).status, 409);
    assert.equal((await call('DELETE', '/shows/folders', { folder: 'Weddings/2027' })).status, 200);
    assert.equal((await call('DELETE', '/shows/folders', { folder: 'Weddings' })).status, 200);
    for (const folder of ['../outside', '.hidden', 'a/'.repeat(6) + 'b', 'bad\\name']) {
      assert.equal((await call('POST', '/shows/folders', { folder })).status, 400, folder);
      assert.equal((await call('POST', '/shows/save', { name: 'X', folder })).status, 400, folder);
    }
    assert.equal((await call('POST', '/shows/folders', { folder: '' })).status, 400);
  });

  it('refuses ids that are not show ids, and lists a damaged file without breaking the list', async () => {
    assert.equal((await call('POST', '/shows/..%2Fproject/open')).status, 400);
    await mkdir(path.join(dataDir, 'shows'), { recursive: true });
    await writeFile(path.join(dataDir, 'shows', 'broken.json'), '{ not json');
    const list = await call('GET', '/shows');
    assert.equal(list.status, 200);
    assert.equal(list.body.shows.find((show) => show.id === 'broken')?.unreadable, true);
    assert.equal((await call('POST', '/shows/broken/open')).status, 400);
    assert.ok((await readdir(path.join(dataDir, 'shows'))).includes('broken.json'), 'the damaged file is left alone');
  });
});

describe('Venue outputs in a saved show', () => {
  const withVenue = (output) => ({
    ...clubShow,
    venue: { id: 'main', name: 'Home' },
    venues: [{ id: 'hall', name: 'Hall', fixtures: clubShow.fixtures, groups: [], output }],
  });

  it('keeps the output a venue remembers, checked like the Output screen', async () => {
    const saved = await call('PUT', '/project', withVenue({ driver: 'artnet', host: '192.168.1.50', universe: 0 }));
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.venues[0].output, {
      driver: 'artnet',
      serialPath: '',
      host: '192.168.1.50',
      universe: 0,
    });
    assert.equal((await call('PUT', '/project', withVenue({ driver: 'artnet', host: 'example.com' }))).status, 400);
    assert.equal((await call('PUT', '/project', withVenue({ driver: 'laser-beam' }))).status, 400);
  });
});
