// Tests for the MIDI hook, with a fake Web MIDI object: support detection, permission, messages and cleanup.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMidi } from '../../src/hooks/useMidi.js';

function createFakeAccess(names = ['Pad Controller']) {
  const inputs = new Map(names.map((name, index) => [`in-${index}`, { name, onmidimessage: null }]));
  return { inputs, onstatechange: null };
}

function setRequestMidiAccess(implementation) {
  Object.defineProperty(navigator, 'requestMIDIAccess', { value: implementation, configurable: true, writable: true });
}

afterEach(() => {
  delete navigator.requestMIDIAccess;
});

describe('useMidi', () => {
  it('reports that MIDI is unsupported when the browser has no Web MIDI', () => {
    const { result } = renderHook(() => useMidi({ onMessage: vi.fn() }));
    expect(result.current.status).toBe('unsupported');
  });

  it('asks for permission only when enabled, then lists the controllers and forwards parsed messages', async () => {
    const access = createFakeAccess(['Launchpad', 'Keys']);
    const request = vi.fn().mockResolvedValue(access);
    setRequestMidiAccess(request);
    const onMessage = vi.fn();
    const { result } = renderHook(() => useMidi({ onMessage }));
    expect(result.current.status).toBe('idle');
    expect(request, 'nothing is requested until the person turns MIDI on').not.toHaveBeenCalled();

    await act(() => result.current.enable());
    expect(result.current.status).toBe('ready');
    expect(result.current.inputNames).toEqual(['Launchpad', 'Keys']);

    const [first] = access.inputs.values();
    first.onmidimessage({ data: Uint8Array.from([0x90, 36, 100]) });
    first.onmidimessage({ data: Uint8Array.from([0xf8]) }); // clock: ignored
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ kind: 'note', channel: 1, number: 36, value: 100 });
  });

  it('follows controllers being plugged in or out', async () => {
    const access = createFakeAccess(['One']);
    setRequestMidiAccess(vi.fn().mockResolvedValue(access));
    const { result } = renderHook(() => useMidi({ onMessage: vi.fn() }));
    await act(() => result.current.enable());
    access.inputs.set('in-new', { name: 'Two', onmidimessage: null });
    act(() => access.onstatechange());
    expect(result.current.inputNames).toEqual(['One', 'Two']);
  });

  it('reports denied when the browser refuses, and stops listening on unmount', async () => {
    setRequestMidiAccess(vi.fn().mockRejectedValue(new Error('denied')));
    const denied = renderHook(() => useMidi({ onMessage: vi.fn() }));
    await act(() => denied.result.current.enable());
    expect(denied.result.current.status).toBe('denied');

    const access = createFakeAccess();
    setRequestMidiAccess(vi.fn().mockResolvedValue(access));
    const ready = renderHook(() => useMidi({ onMessage: vi.fn() }));
    await act(() => ready.result.current.enable());
    ready.unmount();
    expect([...access.inputs.values()][0].onmidimessage, 'handlers are removed').toBeNull();
    expect(access.onstatechange).toBeNull();
  });
});
