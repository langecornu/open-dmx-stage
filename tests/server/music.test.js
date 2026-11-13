// Integration tests for the decks' music library: a folder scanned for audio, chosen from the app, streamed with ranges
// so a deck can jump anywhere, and each track's beat analysis kept.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../../server/app.js';
import { MockDriver } from '../../server/clients/mockDriver.js';
import { DmxEngine } from '../../server/services/dmxEngine.js';
import { MusicLibrary } from '../../server/services/musicLibrary.js';
import { OutputManager } from '../../server/services/outputManager.js';
import { ProjectService } from '../../server/services/projectService.js';

/** A short silent WAV file (mono, 8 kHz, 16 bit). */
function wav(seconds) {
  const rate = 8000;
  const samples = Math.round(rate * seconds);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}

let server;
let baseUrl;
let dataDir;
let musicDir;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'odmx-music-'));
  musicDir = path.join(dataDir, 'Music');
  await mkdir(path.join(musicDir, 'House'), { recursive: true });
  await mkdir(path.join(musicDir, '.hidden'), { recursive: true });
  await writeFile(path.join(musicDir, 'House', 'Groove.wav'), wav(2));
  await writeFile(path.join(musicDir, 'Intro.wav'), wav(1));
  await writeFile(path.join(musicDir, 'notes.txt'), 'not audio');
  await writeFile(path.join(musicDir, '.hidden', 'Secret.wav'), wav(1));
  const config = { allowedOrigins: ['http://localhost:5173'], distDir: path.join(dataDir, 'none') };
  const projectService = new ProjectService({ dataDir });
  await projectService.load();
  const engine = new DmxEngine({ driver: new MockDriver() });
  const outputManager = new OutputManager({
    engine,
    dataDir,
    defaults: { driver: 'mock' },
    listPorts: async () => [],
    probe: async () => ({ kind: 'no-response', suggestedInterface: 'open-dmx', message: 'stub' }),
  });
  const music = new MusicLibrary({ dataDir, defaultFolder: path.join(dataDir, 'nowhere') });
  server = createServer(createApp({ config, engine, projectService, outputManager, music }));
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}/api/v1`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
});

const call = async (method, route, body, headers = {}) => {
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res;
};

describe('Music library', () => {
  it('says when its folder does not exist yet', async () => {
    const list = await (await call('GET', '/music')).json();
    assert.deepEqual([list.exists, list.tracks], [false, []]);
  });

  it('refuses a folder that is not one, and scans a real one for audio files only', async () => {
    assert.equal((await call('PUT', '/settings/music', { folder: path.join(dataDir, 'missing') })).status, 400);
    assert.equal((await call('PUT', '/settings/music', { folder: path.join(musicDir, 'Intro.wav') })).status, 400);
    const res = await call('PUT', '/settings/music', { folder: musicDir });
    assert.equal(res.status, 200);
    const list = await res.json();
    assert.equal(list.folder, musicDir);
    assert.deepEqual(
      list.tracks.map((track) => [track.file, track.title, track.duration]),
      [
        [path.join('House', 'Groove.wav'), 'Groove', 2],
        ['Intro.wav', 'Intro', 1],
      ],
      'audio files in sub-folders, by title; no text files and nothing hidden',
    );
  });

  it('streams a track whole or by range, and nothing that is not in the list', async () => {
    const { tracks } = await (await call('GET', '/music')).json();
    const groove = tracks.find((track) => track.title === 'Groove');
    const whole = await call('GET', `/music/tracks/${groove.id}/audio`);
    assert.equal(whole.status, 200);
    assert.match(whole.headers.get('content-type'), /audio\/wav/);
    assert.equal((await whole.arrayBuffer()).byteLength, 44 + 8000 * 2 * 2);
    const part = await call('GET', `/music/tracks/${groove.id}/audio`, undefined, { range: 'bytes=0-99' });
    assert.equal(part.status, 206);
    assert.equal((await part.arrayBuffer()).byteLength, 100);
    assert.equal((await call('GET', '/music/tracks/..%2F..%2Fetc%2Fpasswd/audio')).status, 404);
  });

  it('keeps a track analysis until the file changes, and checks it', async () => {
    const { tracks } = await (await call('GET', '/music')).json();
    const intro = tracks.find((track) => track.title === 'Intro');
    assert.deepEqual(await (await call('GET', `/music/tracks/${intro.id}/analysis`)).json(), { analysis: null });
    const analysis = { bpm: 124, firstBeatSeconds: 0.2, durationSeconds: 1, peaks: [0, 0.5, 1] };
    assert.equal((await call('PUT', `/music/tracks/${intro.id}/analysis`, analysis)).status, 200);
    assert.deepEqual(await (await call('GET', `/music/tracks/${intro.id}/analysis`)).json(), { analysis });
    assert.equal((await call('PUT', `/music/tracks/${intro.id}/analysis`, { ...analysis, bpm: 9999 })).status, 400);
    assert.equal((await call('PUT', '/music/tracks/unknown/analysis', analysis)).status, 404);

    await writeFile(path.join(musicDir, 'Intro.wav'), wav(1.5));
    await call('GET', '/music?rescan=1');
    assert.deepEqual(await (await call('GET', `/music/tracks/${intro.id}/analysis`)).json(), { analysis: null });
  });
});
