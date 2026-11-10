// Tests for the pure MIDI helpers: parsing, naming, trigger rules, one-to-one binding, pruning and saved mappings.
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  actionId,
  bindAction,
  describeMidiKey,
  loadMidiMap,
  masterFromCc,
  midiKey,
  parseMidiMessage,
  pruneMap,
  saveMidiMap,
  shouldTrigger,
} from '../../src/utils/midi.js';
import { assignKeys, isTypingTarget, PERFORM_KEYS } from '../../src/utils/performKeys.js';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('parseMidiMessage', () => {
  it('reads note-on and control change, with a 1-based channel', () => {
    expect(parseMidiMessage([0x90, 36, 100])).toEqual({ kind: 'note', channel: 1, number: 36, value: 100 });
    expect(parseMidiMessage([0x95, 40, 1])).toEqual({ kind: 'note', channel: 6, number: 40, value: 1 });
    expect(parseMidiMessage([0xb0, 7, 64])).toEqual({ kind: 'cc', channel: 1, number: 7, value: 64 });
  });

  it('ignores note-off (including note-on with velocity 0), clock and other messages', () => {
    expect(parseMidiMessage([0x90, 36, 0])).toBeNull();
    expect(parseMidiMessage([0x80, 36, 64])).toBeNull();
    expect(parseMidiMessage([0xf8])).toBeNull();
    expect(parseMidiMessage([0xe0, 0, 64])).toBeNull();
    expect(parseMidiMessage([])).toBeNull();
  });
});

describe('naming and triggering', () => {
  it('identifies a control by kind, channel and number, ignoring how hard it was pressed', () => {
    const soft = parseMidiMessage([0x90, 36, 20]);
    const hard = parseMidiMessage([0x90, 36, 120]);
    expect(midiKey(soft)).toBe(midiKey(hard));
    expect(describeMidiKey('note:1:36')).toBe('Note 36 (ch 1)');
    expect(describeMidiKey('cc:2:7')).toBe('CC 7 (ch 2)');
  });

  it('gives actions stable ids', () => {
    expect(actionId({ type: 'look', id: 'a' })).toBe('look:a');
    expect(actionId({ type: 'sequence', id: 'a' })).toBe('sequence:a');
    expect(actionId({ type: 'blackout' })).toBe('blackout');
  });

  it('fires buttons on a note or a control change of 64 or more, and the master only on control changes', () => {
    const note = parseMidiMessage([0x90, 36, 100]);
    const ccOn = parseMidiMessage([0xb0, 20, 127]);
    const ccOff = parseMidiMessage([0xb0, 20, 0]);
    expect(shouldTrigger(note, { type: 'look', id: 'a' })).toBe(true);
    expect(shouldTrigger(ccOn, { type: 'blackout' })).toBe(true);
    expect(shouldTrigger(ccOff, { type: 'blackout' })).toBe(false);
    expect(shouldTrigger(note, { type: 'master' })).toBe(false);
    expect(shouldTrigger(ccOff, { type: 'master' })).toBe(true);
  });

  it('scales a control change to a master level from 0 to 1', () => {
    expect(masterFromCc(0)).toBe(0);
    expect(masterFromCc(127)).toBe(1);
    expect(masterFromCc(64)).toBeCloseTo(0.504, 2);
  });
});

describe('bindAction and pruneMap', () => {
  it('keeps one action per control and one control per action', () => {
    const look = { type: 'look', id: 'a' };
    let map = bindAction({}, 'note:1:36', look);
    map = bindAction(map, 'note:1:37', { type: 'look', id: 'b' });
    expect(Object.keys(map)).toEqual(['note:1:36', 'note:1:37']);

    map = bindAction(map, 'note:1:40', look);
    expect(map['note:1:36'], 'moving a look to a new pad frees the old pad').toBeUndefined();
    expect(map['note:1:40']).toEqual(look);

    map = bindAction(map, 'note:1:40', { type: 'look', id: 'b' });
    expect(Object.values(map).map(actionId), 'the pad now plays the new look, and the old pad for it is freed').toEqual(
      ['look:b'],
    );
  });

  it('drops links to deleted looks and sequences but keeps the fixed buttons', () => {
    const map = {
      'note:1:1': { type: 'look', id: 'gone' },
      'note:1:2': { type: 'look', id: 'kept' },
      'note:1:3': { type: 'blackout' },
      'cc:1:7': { type: 'master' },
    };
    const pruned = pruneMap(map, new Set(['look:kept']));
    expect(Object.keys(pruned).sort()).toEqual(['cc:1:7', 'note:1:2', 'note:1:3']);
  });
});

describe('saved mappings', () => {
  it('saves and loads the map', () => {
    saveMidiMap({ 'note:1:36': { type: 'blackout' } });
    expect(loadMidiMap()).toEqual({ 'note:1:36': { type: 'blackout' } });
  });

  it('drops saved entries that are not well-formed, because stored data is untrusted', () => {
    localStorage.setItem(
      'odmx-midi-map',
      JSON.stringify({
        'note:1:36': { type: 'look', id: 'warm' },
        'cc:1:7': { type: 'master' },
        'bad key': { type: 'blackout' },
        'note:1:37': { type: 'look' },
        'note:1:38': { type: 'launch-missiles' },
        'note:1:39': 'blackout',
        'note:1:40': null,
      }),
    );
    expect(loadMidiMap()).toEqual({
      'note:1:36': { type: 'look', id: 'warm' },
      'cc:1:7': { type: 'master' },
    });
  });

  it('starts empty when nothing is saved, the data is corrupt, or storage is blocked', () => {
    expect(loadMidiMap()).toEqual({});
    localStorage.setItem('odmx-midi-map', 'not json');
    expect(loadMidiMap()).toEqual({});
    localStorage.setItem('odmx-midi-map', '[1,2]');
    expect(loadMidiMap()).toEqual({});
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadMidiMap()).toEqual({});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveMidiMap({})).not.toThrow();
  });
});

describe('performKeys', () => {
  it('assigns shortcut keys in order and stops at the available keys', () => {
    expect(assignKeys(3)).toEqual(['1', '2', '3']);
    expect(assignKeys(12).slice(9)).toEqual(['0', 'q', 'w']);
    expect(assignKeys(100)).toHaveLength(PERFORM_KEYS.length); // digits, then three letter rows: 29 keys
    expect(new Set(PERFORM_KEYS).size, 'no key is used twice').toBe(PERFORM_KEYS.length);
  });

  it('recognises fields where typing must not trigger shortcuts', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
