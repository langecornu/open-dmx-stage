// Tests for the live link hook, with a stand-in WebSocket: state from the server, sending, coalescing, and reconnecting.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { frameStore } from '../../src/hooks/frameStore.js';
import { useLive } from '../../src/hooks/useLive.js';

class MockSocket {
  static OPEN = 1;
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.closed = false;
    MockSocket.instances.push(this);
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
  }
  open() {
    this.readyState = MockSocket.OPEN;
    this.onopen?.();
  }
  receive(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

let frames;

beforeEach(() => {
  MockSocket.instances = [];
  frames = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', MockSocket);
  vi.stubGlobal('requestAnimationFrame', (callback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(Math, 'random').mockReturnValue(1); // no jitter: the full delay
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  act(() => frameStore.set(new Array(512).fill(0)));
});

const socket = () => MockSocket.instances.at(-1);

describe('useLive', () => {
  it('connects to the live endpoint on this host, and reports when it is open', () => {
    const { result } = renderHook(() => useLive());
    expect(socket().url).toBe(`ws://${window.location.host}/live`);
    expect(result.current.connected).toBe(false);
    act(() => socket().open());
    expect(result.current.connected).toBe(true);
  });

  it('starts with a quiet engine, and replaces it with the state the server sends', () => {
    const { result } = renderHook(() => useLive());
    expect(result.current.engine).toMatchObject({ master: 1, blackout: false, bpm: 120, effect: null });
    const state = { master: 0.5, blackout: true, bpm: 140, effect: null, activeSceneId: 's', activeChaseId: null };
    act(() => socket().receive({ type: 'state', state }));
    expect(result.current.engine).toEqual(state);
  });

  it('keeps the output status, and hands each frame to the shared frame store', () => {
    const { result } = renderHook(() => useLive());
    act(() => socket().receive({ type: 'output', status: { driver: 'mock', connected: true } }));
    expect(result.current.output).toEqual({ driver: 'mock', connected: true });
    const frame = new Array(512).fill(9);
    act(() => socket().receive({ type: 'frame', frame }));
    expect(frameStore.get()).toEqual(frame);
  });

  it('notices a server speaking a different protocol version, and ignores unknown messages', () => {
    const { result } = renderHook(() => useLive());
    act(() => socket().receive({ type: 'hello', version: 1 }));
    expect(result.current.isVersionMismatch).toBe(false);
    act(() => socket().receive({ type: 'hello', version: 2 }));
    expect(result.current.isVersionMismatch).toBe(true);
    expect(() => act(() => socket().receive({ type: 'from-the-future', anything: true }))).not.toThrow();
  });

  it('sends messages only while the connection is open', () => {
    const { result } = renderHook(() => useLive());
    act(() => result.current.send({ type: 'blackout', enabled: true }));
    expect(socket().sent).toEqual([]);
    act(() => socket().open());
    act(() => result.current.send({ type: 'blackout', enabled: true }));
    expect(socket().sent).toEqual([{ type: 'blackout', enabled: true }]);
  });

  it('combines fader moves into one message per animation frame, keeping the latest value of each channel', () => {
    const { result } = renderHook(() => useLive());
    act(() => socket().open());
    act(() => {
      result.current.setChannels({ 1: 10 });
      result.current.setChannels({ 1: 20, 2: 5 });
      result.current.setChannels({ 3: 7 });
    });
    expect(frames).toHaveLength(1);
    expect(socket().sent).toEqual([]);
    act(() => frames.shift()());
    expect(socket().sent).toEqual([{ type: 'set', values: { 1: 20, 2: 5, 3: 7 } }]);
    act(() => result.current.setChannels({ 4: 1 }));
    act(() => frames.shift()());
    expect(socket().sent.at(-1)).toEqual({ type: 'set', values: { 4: 1 } });
  });

  it('reconnects after the connection drops, waiting longer each time it fails and starting over once it works', () => {
    const { result } = renderHook(() => useLive());
    act(() => socket().open());
    act(() => socket().drop());
    expect(result.current.connected).toBe(false);
    expect(MockSocket.instances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(999));
    expect(MockSocket.instances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(MockSocket.instances).toHaveLength(2);
    act(() => socket().drop()); // the second attempt fails: wait twice as long
    act(() => vi.advanceTimersByTime(1999));
    expect(MockSocket.instances).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1));
    expect(MockSocket.instances).toHaveLength(3);
    act(() => socket().open());
    expect(result.current.connected).toBe(true);
    act(() => socket().drop());
    act(() => vi.advanceTimersByTime(1000));
    expect(MockSocket.instances, 'after a success the wait starts again from the beginning').toHaveLength(4);
  });

  it('closes the connection and stops reconnecting when it is unmounted', () => {
    const { unmount } = renderHook(() => useLive());
    const first = socket();
    act(() => first.open());
    unmount();
    expect(first.closed).toBe(true);
    act(() => first.drop());
    act(() => vi.advanceTimersByTime(60000));
    expect(MockSocket.instances).toHaveLength(1);
  });
});
