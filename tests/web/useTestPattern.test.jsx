// Tests for the test-lights pattern: it cycles the patched fixtures through colours and puts everything back after.
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import { TestLights } from '../../src/components/TestLights.jsx';
import { TEST_STEP_MS, useTestPattern } from '../../src/hooks/useTestPattern.js';
import { BUILTIN_TYPES } from './fixtures.js';

const project = {
  schemaVersion: 2,
  name: 'Test',
  fixtureTypes: [],
  fixtures: [
    { id: 'a', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1 },
    { id: 'b', name: 'Par 2', typeId: 'generic-rgb-par', mode: 0, address: 4 },
  ],
  scenes: [],
  chases: [],
};
const patch = buildPatch(project, BUILTIN_TYPES);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useTestPattern', () => {
  it('cycles every fixture through red, green, blue and white, then restores the lights when stopped', () => {
    const setChannels = vi.fn();
    const send = vi.fn();
    const { result } = renderHook(() => useTestPattern({ project, patch, setChannels, send }));
    expect(result.current.canRun).toBe(true);
    expect(result.current.isRunning).toBe(false);

    act(() => result.current.toggle());
    expect(setChannels).toHaveBeenLastCalledWith({ 1: 255, 2: 0, 3: 0, 4: 255, 5: 0, 6: 0 });
    expect(result.current.colourName).toBe('red');

    act(() => vi.advanceTimersByTime(TEST_STEP_MS));
    expect(setChannels).toHaveBeenLastCalledWith({ 1: 0, 2: 255, 3: 0, 4: 0, 5: 255, 6: 0 });
    act(() => vi.advanceTimersByTime(TEST_STEP_MS));
    expect(result.current.colourName).toBe('blue');
    act(() => vi.advanceTimersByTime(TEST_STEP_MS));
    expect(setChannels).toHaveBeenLastCalledWith({ 1: 255, 2: 255, 3: 255, 4: 255, 5: 255, 6: 255 });
    act(() => vi.advanceTimersByTime(TEST_STEP_MS));
    expect(result.current.colourName, 'it wraps back to red').toBe('red');

    act(() => result.current.toggle());
    expect(send).toHaveBeenLastCalledWith({ type: 'clearProgrammer' });
    expect(result.current.isRunning).toBe(false);
    const calls = setChannels.mock.calls.length;
    act(() => vi.advanceTimersByTime(TEST_STEP_MS * 3));
    expect(setChannels.mock.calls.length, 'nothing more is sent after stopping').toBe(calls);
  });

  it('cannot run without any patched fixtures, and clears the lights if it unmounts while running', () => {
    const empty = { ...project, fixtures: [] };
    const none = renderHook(() => useTestPattern({ project: empty, patch, setChannels: vi.fn(), send: vi.fn() }));
    expect(none.result.current.canRun).toBe(false);

    const send = vi.fn();
    const running = renderHook(() => useTestPattern({ project, patch, setChannels: vi.fn(), send }));
    act(() => running.result.current.toggle());
    running.unmount();
    expect(send).toHaveBeenCalledWith({ type: 'clearProgrammer' });
  });
});

describe('TestLights', () => {
  it('toggles between Test lights and Stop test, and is disabled with no fixtures', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const live = { setChannels: vi.fn(), send: vi.fn() };
    const { unmount } = render(<TestLights project={project} patch={patch} live={live} />);
    await user.click(screen.getByRole('button', { name: 'Test lights' }));
    expect(screen.getByRole('button', { name: 'Stop test', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Testing: red');
    unmount();

    render(<TestLights project={{ ...project, fixtures: [] }} patch={patch} live={live} />);
    expect(screen.getByRole('button', { name: 'Test lights' })).toBeDisabled();
  });
});
