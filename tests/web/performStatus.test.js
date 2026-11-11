// Tests for the Perform status strip wording: output, MIDI and music, each with a tone that is never the only signal.
import { describe, expect, it } from 'vitest';

import { describePerformStatus } from '../../src/utils/performStatus.js';

const ready = { connected: true, output: { driver: 'open-dmx', connected: true } };
const midiOff = { status: 'idle', inputNames: [] };
const notListening = { status: 'off', isLocked: false, bpm: null, error: null };

const chip = (state, id) =>
  describePerformStatus({ ...ready, midi: midiOff, follower: notListening, ...state }).find((item) => item.id === id);

describe('describePerformStatus', () => {
  it('lists output, MIDI and music, in that order', () => {
    const chips = describePerformStatus({ ...ready, midi: midiOff, follower: notListening });
    expect(chips.map((item) => item.id)).toEqual(['output', 'midi', 'sound']);
  });

  it.each([
    [{ connected: false, output: null }, 'Server offline', 'bad'],
    [{ connected: true, output: { driver: 'mock', connected: true } }, 'Simulator', 'ok'],
    [{ connected: true, output: { driver: 'open-dmx', connected: true } }, 'DMX ready', 'ok'],
    [{ connected: true, output: { driver: 'open-dmx', connected: false } }, 'DMX not connected', 'bad'],
  ])('says the output is %o: %s', (state, value, tone) => {
    expect(chip(state, 'output')).toMatchObject({ name: 'Output', value, tone });
  });

  it.each([
    [{ status: 'unsupported', inputNames: [] }, 'Not in this browser', 'idle'],
    [{ status: 'idle', inputNames: [] }, 'Off', 'idle'],
    [{ status: 'requesting', inputNames: [] }, 'Asking the browser…', 'idle'],
    [{ status: 'denied', inputNames: [] }, 'Blocked by the browser', 'bad'],
    [{ status: 'ready', inputNames: [] }, 'No controller found', 'warn'],
    [{ status: 'ready', inputNames: ['Pad A', 'Keys'] }, 'Pad A, Keys', 'ok'],
  ])('names the MIDI state %o: %s', (midi, value, tone) => {
    expect(chip({ midi }, 'midi')).toMatchObject({ name: 'MIDI', value, tone });
  });

  it.each([
    [notListening, 'Not listening', 'idle'],
    [{ ...notListening, status: 'asking' }, 'Asking the browser…', 'idle'],
    [{ ...notListening, error: 'No microphone was found.' }, 'Could not listen', 'bad'],
    [{ ...notListening, status: 'listening' }, 'Finding the beat…', 'warn'],
    [{ status: 'listening', isLocked: true, bpm: 124, error: null }, 'Following, 124 BPM', 'ok'],
  ])('names the music state %o: %s', (follower, value, tone) => {
    expect(chip({ follower }, 'sound')).toMatchObject({ name: 'Music', value, tone });
  });
});
