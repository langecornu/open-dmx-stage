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

/**
 * Low-band strengths of a kick drum every `intervalMs` over a noise floor, one value per 20 ms window.
 * @returns {{ energy: number, time: number }[]}
 */
export function musicWindows({ seconds, intervalMs, floor = 0.02, hit = 0.3, startTime = 0, seed = 7 }) {
  const random = seededRandom(seed);
  const windows = [];
  for (let time = 0; time < seconds * 1000; time += WINDOW_MS) {
    windows.push({
      energy: floor + hit * Math.exp(-(time % intervalMs) / 60) + random() * floor * 0.4,
      time: startTime + time,
    });
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
