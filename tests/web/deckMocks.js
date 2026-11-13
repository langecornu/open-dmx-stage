// Stand-ins for the browser's media and Web Audio for the decks: an <audio> element that plays when told to, and an
// audio context whose gains can be read back and whose decoder returns a steady click track, so the beat analysis runs.
import { vi } from 'vitest';

export class MockAudio extends EventTarget {
  constructor() {
    super();
    this.src = '';
    this.paused = true;
    this.currentTime = 0;
    this.duration = Number.NaN;
    this.playbackRate = 1;
    this.defaultPlaybackRate = 1;
    this.preload = '';
    this.preservesPitch = true;
    MockAudio.made.push(this);
  }

  play() {
    if (MockAudio.failPlay) {
      return Promise.reject(new Error('blocked'));
    }
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }

  pause() {
    if (!this.paused) {
      this.paused = true;
      this.dispatchEvent(new Event('pause'));
    }
  }
}
/** @type {MockAudio[]} */
MockAudio.made = [];
MockAudio.failPlay = false;

const node = () => {
  const made = { gain: { value: 1 }, connect: vi.fn((target) => target) };
  return made;
};

/** A click on every beat at 120 BPM, starting half a second in, at a low sample rate to keep the test quick. */
export function clickTrack({ seconds = 20, bpm = 120, sampleRate = 8000, offset = 0.5 } = {}) {
  const samples = new Float32Array(seconds * sampleRate);
  const beat = (60 / bpm) * sampleRate;
  for (let start = offset * sampleRate; start < samples.length; start += beat) {
    for (let index = 0; index < 200 && start + index < samples.length; index += 1) {
      samples[Math.floor(start) + index] = (index % 2 ? 1 : -1) * Math.exp(-index / 40);
    }
  }
  return { samples, sampleRate };
}

export class MockAudioContext {
  constructor() {
    this.state = 'suspended';
    this.destination = node();
    this.gains = [];
    MockAudioContext.made.push(this);
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  close() {
    this.state = 'closed';
    return Promise.resolve();
  }

  createGain() {
    const gain = node();
    this.gains.push(gain);
    return gain;
  }

  createMediaElementSource() {
    return node();
  }

  decodeAudioData() {
    if (MockAudioContext.failDecode) {
      return Promise.reject(new Error('bad audio'));
    }
    const { samples, sampleRate } = clickTrack();
    return Promise.resolve({
      length: samples.length,
      sampleRate,
      numberOfChannels: 1,
      getChannelData: () => samples,
    });
  }
}
/** @type {MockAudioContext[]} */
MockAudioContext.made = [];
MockAudioContext.failDecode = false;

/** Puts the stand-ins in place of the browser's; returns a function that takes them away. */
export function installMockDecks() {
  const original = { Audio: window.Audio, AudioContext: window.AudioContext };
  MockAudio.made = [];
  MockAudio.failPlay = false;
  MockAudioContext.made = [];
  MockAudioContext.failDecode = false;
  window.Audio = /** @type {any} */ (MockAudio);
  window.AudioContext = /** @type {any} */ (MockAudioContext);
  return () => {
    window.Audio = original.Audio;
    window.AudioContext = original.AudioContext;
  };
}
