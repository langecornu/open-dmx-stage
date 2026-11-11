// Tests for the hook that listens to music and sets the tempo, with a fake audio system and made-up music.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SOURCES, useBeatFollower } from '../../src/hooks/useBeatFollower.js';
import { createStream, installFakeAudio, musicWindows, silence, steadyNoise } from './audioFakes.js';

let audio;
let send;

beforeEach(() => {
  audio = installFakeAudio({
    devices: [
      { kind: 'audioinput', deviceId: 'mic-1', label: 'Built-in microphone' },
      { kind: 'audioinput', deviceId: 'loop-2', label: '' },
      { kind: 'videoinput', deviceId: 'cam', label: 'Camera' },
    ],
  });
  send = vi.fn();
});
afterEach(() => {
  audio.uninstall();
});

async function startedHook(options = { source: SOURCES.MICROPHONE }) {
  const hook = renderHook(() => useBeatFollower({ send }));
  await act(async () => {
    await hook.result.current.start(options);
  });
  return hook;
}

describe('useBeatFollower', () => {
  it('lists the microphones, naming any the browser has not labelled yet', async () => {
    const { result } = renderHook(() => useBeatFollower({ send }));
    await act(async () => {});
    expect(result.current.inputs).toEqual([
      { id: 'mic-1', label: 'Built-in microphone' },
      { id: 'loop-2', label: 'Microphone 2' },
    ]);
  });

  it('copes with a browser that has no media devices at all', async () => {
    delete navigator.mediaDevices;
    const { result } = renderHook(() => useBeatFollower({ send }));
    await act(async () => {});
    expect(result.current.inputs).toEqual([]);
  });

  it('asks for the microphone without the processing that would smooth the beat away, and starts listening', async () => {
    const { result } = await startedHook();
    expect(audio.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    expect(result.current.status).toBe('listening');
    expect(result.current.error).toBeNull();
  });

  it('uses the chosen microphone', async () => {
    await startedHook({ source: SOURCES.MICROPHONE, deviceId: 'loop-2' });
    expect(audio.mediaDevices.getUserMedia.mock.calls[0][0].audio.deviceId).toEqual({ exact: 'loop-2' });
  });

  it('loads the meter into the audio thread and sends the sound only through a muted output', async () => {
    await startedHook();
    expect(audio.contexts[0].audioWorklet.addModule.mock.calls[0][0]).toMatch(/beatMeterWorklet/);
    expect(audio.nodes[0].name).toBe('beat-meter');
    expect(audio.gains[0].gain.value).toBe(0);
    expect(audio.nodes[0].connect).toHaveBeenCalledWith(audio.gains[0]);
    expect(audio.gains[0].connect).toHaveBeenCalledWith(audio.contexts[0].destination);
  });

  it('sets the tempo from the beat of the music and lines the beat up each time', async () => {
    const { result } = await startedHook();
    act(() => audio.feed(musicWindows({ seconds: 14, intervalMs: 500 })));
    expect(result.current.isLocked).toBe(true);
    expect(result.current.bpm).toBeGreaterThan(118);
    expect(result.current.bpm).toBeLessThan(122);
    const tempoMessages = send.mock.calls.map(([message]) => message).filter((message) => message.type === 'tempo');
    expect(tempoMessages.length).toBeGreaterThan(5);
    expect(tempoMessages.filter((message) => message.sync).length).toBeGreaterThan(5);
    for (const message of tempoMessages) {
      expect(message.bpm).toBeGreaterThan(110);
      expect(message.bpm).toBeLessThan(130);
    }
  });

  it('follows a change to a faster song', async () => {
    const { result } = await startedHook();
    act(() => audio.feed(musicWindows({ seconds: 12, intervalMs: 500 })));
    act(() => audio.feed(musicWindows({ seconds: 14, intervalMs: 400, startTime: 12000, seed: 9 })));
    expect(result.current.bpm).toBeGreaterThan(145);
    expect(result.current.bpm).toBeLessThan(155);
  });

  it('does not touch the tempo for noise with no beat, and shows a level', async () => {
    const { result } = await startedHook();
    act(() => audio.feed(steadyNoise({ seconds: 8 })));
    expect(send).not.toHaveBeenCalled();
    expect(result.current.isLocked).toBe(false);
    expect(result.current.bpm).toBeNull();
    expect(result.current.level).toBeGreaterThanOrEqual(0);
    expect(result.current.level).toBeLessThanOrEqual(1);
  });

  it('shows what it is hearing before it locks, so a person can see it working', async () => {
    const { result } = await startedHook();
    act(() => audio.feed(musicWindows({ seconds: 4, intervalMs: 500 })));
    expect(result.current.isLocked).toBe(false);
    expect(result.current.level).toBeGreaterThan(0);
    expect(result.current.beatsHeard).toBeGreaterThan(0);
  });

  it('says the beat is lost after a few seconds without one', async () => {
    const { result } = await startedHook();
    act(() => audio.feed(musicWindows({ seconds: 14, intervalMs: 500 })));
    expect(result.current.isLocked).toBe(true);
    act(() => audio.feed(silence({ seconds: 8, startTime: 14000 })));
    expect(result.current.isLocked).toBe(false);
  });

  it('listens to a browser tab: asks for sound, keeps only the sound, and refuses a share with no sound', async () => {
    const { result } = await startedHook({ source: SOURCES.TAB });
    expect(audio.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: true });
    expect(result.current.status).toBe('listening');

    const noSound = createStream({ audio: 0, video: 1 });
    audio.mediaDevices.getDisplayMedia.mockResolvedValueOnce(noSound);
    await act(async () => {
      await result.current.start({ source: SOURCES.TAB });
    });
    expect(result.current.status).toBe('off');
    expect(result.current.error).toMatch(/shared no sound/);
    expect(noSound.videoTracks[0].stop).toHaveBeenCalled();
  });

  it('stops the picture of a shared tab, since only the sound is needed', async () => {
    const stream = createStream({ audio: 1, video: 1 });
    audio.mediaDevices.getDisplayMedia.mockResolvedValueOnce(stream);
    await startedHook({ source: SOURCES.TAB });
    expect(stream.videoTracks[0].stop).toHaveBeenCalled();
    expect(stream.audioTracks[0].stop).not.toHaveBeenCalled();
  });

  it.each([
    ['NotAllowedError', SOURCES.MICROPHONE, /did not allow the microphone/],
    ['NotFoundError', SOURCES.MICROPHONE, /No microphone was found/],
    ['NotAllowedError', SOURCES.TAB, /Nothing was shared/],
    ['SomethingElse', SOURCES.MICROPHONE, /Could not start listening/],
  ])('explains a %s for %s in plain words', async (name, source, message) => {
    const error = Object.assign(new Error('x'), { name });
    audio.mediaDevices.getUserMedia.mockRejectedValueOnce(error);
    audio.mediaDevices.getDisplayMedia.mockRejectedValueOnce(error);
    const { result } = await startedHook({ source });
    expect(result.current.status).toBe('off');
    expect(result.current.error).toMatch(message);
  });

  it('explains a browser that cannot analyse sound, and lets go of the microphone', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const stream = createStream();
    audio.mediaDevices.getUserMedia.mockResolvedValueOnce(stream);
    const { result } = await startedHook();
    expect(result.current.error).toMatch(/cannot analyse sound/);
    expect(stream.audioTracks[0].stop).toHaveBeenCalled();
  });

  it('explains when the sound analyser cannot be loaded, and cleans up', async () => {
    const stream = createStream();
    audio.mediaDevices.getUserMedia.mockResolvedValueOnce(stream);
    const originalContext = globalThis.AudioContext;
    vi.stubGlobal(
      'AudioContext',
      class extends originalContext {
        constructor() {
          super();
          this.audioWorklet.addModule.mockRejectedValue(new Error('blocked'));
        }
      },
    );
    const { result } = await startedHook();
    expect(result.current.error).toMatch(/Could not start the sound analyser/);
    expect(stream.audioTracks[0].stop).toHaveBeenCalled();
    expect(audio.contexts.at(-1).closed).toBe(true);
  });

  it('stops listening: releases the microphone, closes the audio and forgets the tempo', async () => {
    const stream = createStream();
    audio.mediaDevices.getUserMedia.mockResolvedValueOnce(stream);
    const { result } = await startedHook();
    act(() => audio.feed(musicWindows({ seconds: 14, intervalMs: 500 })));
    act(() => result.current.stop());
    expect(result.current.status).toBe('off');
    expect(result.current.bpm).toBeNull();
    expect(stream.audioTracks[0].stop).toHaveBeenCalled();
    expect(audio.contexts[0].closed).toBe(true);
    expect(audio.nodes[0].port.onmessage).toBeNull();
  });

  it('stops by itself when the person stops sharing or unplugs the microphone', async () => {
    const stream = createStream();
    audio.mediaDevices.getUserMedia.mockResolvedValueOnce(stream);
    const { result } = await startedHook();
    act(() => stream.audioTracks[0].fire('ended'));
    expect(result.current.status).toBe('off');
    expect(audio.contexts[0].closed).toBe(true);
  });

  it('starting again replaces the earlier session, and leaving the screen stops it', async () => {
    const { result, unmount } = await startedHook();
    await act(async () => {
      await result.current.start({ source: SOURCES.MICROPHONE });
    });
    expect(audio.contexts).toHaveLength(2);
    expect(audio.contexts[0].closed).toBe(true);
    unmount();
    expect(audio.contexts[1].closed).toBe(true);
  });

  it('uses the latest send function', async () => {
    const first = vi.fn();
    const second = vi.fn();
    let current = first;
    const { result, rerender } = renderHook(() => useBeatFollower({ send: current }));
    await act(async () => {
      await result.current.start({ source: SOURCES.MICROPHONE });
    });
    current = second;
    rerender();
    act(() => audio.feed(musicWindows({ seconds: 14, intervalMs: 500 })));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });
});
