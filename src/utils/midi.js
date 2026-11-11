// Pure MIDI helpers for the Perform screen: parsing messages, naming controls, and keeping a one-to-one map between
// MIDI controls (pads, keys, knobs) and actions (play a look, play a sequence, blackout, stop, master).

/**
 * @typedef {{ type: 'look' | 'sequence' | 'timeline', id: string } | { type: 'blackout' } | { type: 'stop' } | { type: 'master' }} Action
 * @typedef {{ kind: 'note' | 'cc', channel: number, number: number, value: number }} MidiMessage
 */

/**
 * Reads a raw MIDI message. Only note-on (with a velocity above zero) and control change are used; everything else
 * (note-off, clock, pitch bend and so on) is ignored.
 * @param {ArrayLike<number>} data
 * @returns {MidiMessage | null}
 */
export function parseMidiMessage(data) {
  const status = data[0] ?? 0;
  const number = data[1] ?? 0;
  const value = data[2] ?? 0;
  const type = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  if (type === 0x90 && value > 0) {
    return { kind: 'note', channel, number, value };
  }
  if (type === 0xb0) {
    return { kind: 'cc', channel, number, value };
  }
  return null;
}

/** @param {MidiMessage} message @returns {string} identifies the physical control, ignoring how hard it was pressed */
export function midiKey(message) {
  return `${message.kind}:${message.channel}:${message.number}`;
}

/** @param {string} key @returns {string} for example "Note 36 (ch 1)" */
export function describeMidiKey(key) {
  const [kind, channel, number] = key.split(':');
  return `${kind === 'note' ? 'Note' : 'CC'} ${number} (ch ${channel})`;
}

/** @param {Action} action @returns {string} a stable id, for example "look:abc" or "blackout" */
export function actionId(action) {
  return 'id' in action ? `${action.type}:${action.id}` : action.type;
}

/**
 * Should this message fire the action? Buttons fire on a press (a note, or a control change of 64 or more); the master
 * needs a control change because it follows the knob or fader position.
 * @param {MidiMessage} message
 * @param {Action} action
 * @returns {boolean}
 */
export function shouldTrigger(message, action) {
  if (action.type === 'master') {
    return message.kind === 'cc';
  }
  return message.kind === 'note' || message.value >= 64;
}

/** @param {number} value 0 to 127 @returns {number} a master level from 0 to 1 */
export function masterFromCc(value) {
  return Math.max(0, Math.min(1, value / 127));
}

/**
 * Binds a control to an action. A control has one action and an action has one control, so earlier bindings of either are
 * replaced.
 * @param {Record<string, Action>} map
 * @param {string} key
 * @param {Action} action
 * @returns {Record<string, Action>} a new map
 */
export function bindAction(map, key, action) {
  const id = actionId(action);
  /** @type {Record<string, Action>} */
  const next = {};
  for (const [existingKey, existing] of Object.entries(map)) {
    if (existingKey !== key && actionId(existing) !== id) {
      next[existingKey] = existing;
    }
  }
  next[key] = action;
  return next;
}

/**
 * Drops bindings for looks and sequences that no longer exist.
 * @param {Record<string, Action>} map
 * @param {Set<string>} validIds action ids that still exist (buttons like blackout always do)
 * @returns {Record<string, Action>}
 */
export function pruneMap(map, validIds) {
  return Object.fromEntries(
    Object.entries(map).filter(
      ([, action]) =>
        action.type === 'master' ||
        action.type === 'blackout' ||
        action.type === 'stop' ||
        validIds.has(actionId(action)),
    ),
  );
}

const STORAGE_KEY = 'odmx-midi-map';
const KEY_PATTERN = /^(note|cc):\d{1,2}:\d{1,3}$/;

/** @param {unknown} value @returns {value is Action} saved data is untrusted, so check the shape before using it */
function isAction(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const { type, id } = /** @type {Record<string, unknown>} */ (value);
  if (type === 'look' || type === 'sequence' || type === 'timeline') {
    return typeof id === 'string' && id.length > 0 && id.length <= 200;
  }
  return type === 'blackout' || type === 'stop' || type === 'master';
}

/** @returns {Record<string, Action>} the saved map, or an empty one when storage is blocked or empty */
export function loadMidiMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    // Keep only well-formed entries; anything else (edited by hand, or from an older version) is dropped.
    return Object.fromEntries(
      Object.entries(parsed).filter(([key, action]) => KEY_PATTERN.test(key) && isAction(action)),
    );
  } catch {
    return {};
  }
}

/** @param {Record<string, Action>} map */
export function saveMidiMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage can be blocked (private mode); the mapping then lasts for this session only.
  }
}
