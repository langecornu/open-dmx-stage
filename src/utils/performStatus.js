// The Perform status strip in plain words: is the output ready, is a MIDI controller connected, is the page listening
// to the music. Pure, so every wording is easy to test.

import { describeOutput } from './outputStatus.js';

/**
 * @typedef {'ok' | 'warn' | 'bad' | 'idle'} Tone
 * @typedef {{ id: 'output' | 'midi' | 'sound', name: string, value: string, tone: Tone }} StatusChip
 */

const MIDI_TEXT = {
  unsupported: { value: 'Not in this browser', tone: 'idle' },
  idle: { value: 'Off', tone: 'idle' },
  requesting: { value: 'Asking the browser…', tone: 'idle' },
  denied: { value: 'Blocked by the browser', tone: 'bad' },
};

/**
 * @param {{ status: string, inputNames: string[] }} midi
 * @returns {StatusChip}
 */
function midiChip(midi) {
  if (midi.status === 'ready') {
    return midi.inputNames.length > 0
      ? { id: 'midi', name: 'MIDI', value: midi.inputNames.join(', '), tone: 'ok' }
      : { id: 'midi', name: 'MIDI', value: 'No controller found', tone: 'warn' };
  }
  return { id: 'midi', name: 'MIDI', ...(MIDI_TEXT[midi.status] ?? MIDI_TEXT.idle) };
}

/**
 * @param {{ status: string, isLocked: boolean, bpm: number | null, error: string | null }} follower
 * @returns {StatusChip}
 */
function soundChip(follower) {
  if (follower.status === 'listening') {
    return follower.isLocked
      ? { id: 'sound', name: 'Music', value: `Following, ${follower.bpm} BPM`, tone: 'ok' }
      : { id: 'sound', name: 'Music', value: 'Finding the beat…', tone: 'warn' };
  }
  if (follower.status === 'asking') {
    return { id: 'sound', name: 'Music', value: 'Asking the browser…', tone: 'idle' };
  }
  if (follower.error) {
    return { id: 'sound', name: 'Music', value: 'Could not listen', tone: 'bad' };
  }
  return { id: 'sound', name: 'Music', value: 'Not listening', tone: 'idle' };
}

/**
 * @param {{
 *   connected: boolean,
 *   output: { driver: string, connected: boolean } | null | undefined,
 *   midi: { status: string, inputNames: string[] },
 *   follower: { status: string, isLocked: boolean, bpm: number | null, error: string | null },
 * }} state
 * @returns {StatusChip[]}
 */
export function describePerformStatus({ connected, output, midi, follower }) {
  const { label, isReady } = describeOutput(connected, output);
  return [
    { id: 'output', name: 'Output', value: label, tone: isReady ? 'ok' : 'bad' },
    midiChip(midi),
    soundChip(follower),
  ];
}
