// Stand-ins for the browser's audio system, and a generator of made-up music, so the listening code can be tested
// without a microphone, a sound card or real audio.
import { vi } from 'vitest';

export const WINDOW_MS = 20;

/** A small, repeatable pseudo-random number generator, so the "noise" is the same on every run. */
function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

/** A hit that starts at 1 and dies away with the given time constant (ms). */
const decay = (sinceMs, timeConstantMs) => (sinceMs < 0 ? 0 : Math.exp(-sinceMs / timeConstantMs));

/**
 * Made-up music, one low-band and one full-band strength per 20 ms window, like the audio worklet reports.
 * Real music is messy, so the defaults are the hard case: a steady bass line under the kick, snares on beats two and
 * four in the mid band only, and hi-hats between the beats.
 * @param {object} options
 * @param {number} options.seconds
 * @param {number} options.intervalMs time between beats (500 is 120 beats per minute)
 * @param {number} [options.floor] background noise
 * @param {number} [options.kick] strength of the kick in the low band (0 for a track with no bass at all)
 * @param {number} [options.click] strength of the kick's click, heard in the full band only (a weak laptop microphone)
 * @param {number} [options.bass] a steady bass line, which should not look like a beat
 * @param {number} [options.snare] snares on beats two and four, full band only
 * @param {number} [options.hat] hi-hats on the half beats, full band only
 * @param {number} [options.startTime]
 * @param {number} [options.seed]
 * @returns {{ low: number, full: number, time: number }[]}
 */
export function musicWindows({
  seconds,
  intervalMs,
  floor = 0.02,
  kick = 0.3,
  click = 0.1,
  bass = 0.12,
  snare = 0.25,
  hat = 0.06,
  startTime = 0,
  seed = 7,
}) {
  const random = seededRandom(seed);
  const windows = [];
  for (let time = 0; time < seconds * 1000; time += WINDOW_MS) {
    const sinceBeat = time % intervalMs;
    const beatNumber = Math.floor(time / intervalMs);
    const noise = random() * floor * 0.4;
    const low = floor + bass + kick * decay(sinceBeat, 60) + noise;
    const isBackBeat = beatNumber % 2 === 1;
    const sinceHalf = (time + intervalMs / 2) % intervalMs;
    const full =
      low +
      click * decay(sinceBeat, 25) +
      (isBackBeat ? snare * decay(sinceBeat, 50) : 0) +
      hat * decay(sinceHalf, 20) +
      random() * floor * 0.3;
    windows.push({ low, full, time: startTime + time });
  }
  return windows;
}

/** Noise and a steady hum with nothing repeating in it. */
export function steadyNoise({ seconds, startTime = 0, level = 0.05, seed = 5 }) {
  return musicWindows({ seconds, intervalMs: 500, kick: 0, click: 0, snare: 0, hat: 0, bass: level, startTime, seed });
}

/** Complete silence. */
export function silence({ seconds, startTime = 0 }) {
  const windows = [];
  for (let time = 0; time < seconds * 1000; time += WINDOW_MS) {
    windows.push({ low: 0, full: 0, time: startTime + time });
  }
  return windows;
}

function createTrack(kind) {
  const listeners = {};
  return {
    kind,
    stop: vi.fn(),
    addEventListener: (name, listener) => {
      listeners[name] = listener;
    },
    fire: (name) => listeners[name]?.(),
  };
}

export function createStream({ audio = 1, video = 0 } = {}) {
  const audioTracks = Array.from({ length: audio }, () => createTrack('audio'));
  const videoTracks = Array.from({ length: video }, () => createTrack('video'));
  return {
    audioTracks,
    videoTracks,
    getTracks: () => [...audioTracks, ...videoTracks],
    getAudioTracks: () => audioTracks,
    getVideoTracks: () => videoTracks,
  };
}

/**
 * Installs fake `AudioContext`, `AudioWorkletNode` and `navigator.mediaDevices`.
 * @param {{ devices?: { kind: string, deviceId: string, label: string }[] }} [options]
 */
export function installFakeAudio({
  devices = [{ kind: 'audioinput', deviceId: 'mic-1', label: 'Built-in microphone' }],
} = {}) {
  const contexts = [];
  const nodes = [];
  const gains = [];

  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.destination = { name: 'destination' };
      this.closed = false;
      this.audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
      contexts.push(this);
    }
    createGain() {
      const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
      gains.push(gain);
      return gain;
    }
    createMediaStreamSource(stream) {
      return { stream, connect: vi.fn() };
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    close() {
      this.closed = true;
      return Promise.resolve();
    }
  }

  class FakeAudioWorkletNode {
    constructor(context, name) {
      this.context = context;
      this.name = name;
      this.port = { onmessage: null };
      this.connect = vi.fn();
      this.disconnect = vi.fn();
      nodes.push(this);
    }
  }

  const mediaDevices = {
    getUserMedia: vi.fn().mockImplementation(async () => createStream({ audio: 1 })),
    getDisplayMedia: vi.fn().mockImplementation(async () => createStream({ audio: 1, video: 1 })),
    enumerateDevices: vi.fn().mockResolvedValue(devices),
  };
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode);
  Object.defineProperty(navigator, 'mediaDevices', { value: mediaDevices, configurable: true });

  return {
    contexts,
    nodes,
    gains,
    mediaDevices,
    /** Sends windows to the page the way the audio worklet would. */
    feed(windows) {
      const node = nodes.at(-1);
      for (const window of windows) {
        node.port.onmessage?.({ data: window });
      }
    },
    uninstall() {
      vi.unstubAllGlobals();
      delete navigator.mediaDevices;
    },
  };
}
