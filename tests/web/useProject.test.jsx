// Tests for the project hook: loading, debounced autosave, flushing before play, failures, and replacing a show.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../src/api.js';
import { useProject } from '../../src/hooks/useProject.js';

vi.mock('../../src/api.js', () => ({
  api: { getProject: vi.fn(), getFixtureLibrary: vi.fn(), saveProject: vi.fn() },
}));

const PROJECT = { name: 'Loaded', scenes: [] };

async function loaded() {
  const hook = renderHook(() => useProject());
  await act(async () => {
    await Promise.resolve();
  });
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  api.getProject.mockResolvedValue(PROJECT);
  api.getFixtureLibrary.mockResolvedValue([{ id: 'lib' }]);
  api.saveProject.mockResolvedValue(PROJECT);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useProject', () => {
  it('loads the show and the fixture library once', async () => {
    const { result } = await loaded();
    expect(result.current.project).toEqual(PROJECT);
    expect(result.current.library).toEqual([{ id: 'lib' }]);
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.error).toBeNull();
  });

  it('reports a load failure and has no project', async () => {
    api.getProject.mockRejectedValue(new Error('Server offline'));
    const { result } = await loaded();
    expect(result.current.project).toBeNull();
    expect(result.current.error).toBe('Server offline');
  });

  it('applies an edit at once, then saves it after a short pause', async () => {
    const { result } = await loaded();
    act(() => result.current.update((current) => ({ ...current, name: 'Edited' })));
    expect(result.current.project.name).toBe('Edited');
    expect(result.current.saveStatus).toBe('pending');
    expect(api.saveProject).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(api.saveProject).toHaveBeenCalledWith({ name: 'Edited', scenes: [] });
    expect(result.current.saveStatus).toBe('saved');
  });

  it('saves a burst of edits once, with the latest', async () => {
    const { result } = await loaded();
    for (const name of ['A', 'AB', 'ABC']) {
      act(() => result.current.update((current) => ({ ...current, name })));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
    }
    expect(api.saveProject).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(api.saveProject).toHaveBeenCalledTimes(1);
    expect(api.saveProject).toHaveBeenCalledWith({ name: 'ABC', scenes: [] });
  });

  it('flushes a pending edit immediately, and does nothing when nothing is pending', async () => {
    const { result } = await loaded();
    await act(async () => {
      await result.current.flush();
    });
    expect(api.saveProject).not.toHaveBeenCalled();
    act(() => result.current.update((current) => ({ ...current, name: 'Soon' })));
    await act(async () => {
      await result.current.flush();
    });
    expect(api.saveProject).toHaveBeenCalledTimes(1);
    expect(result.current.saveStatus).toBe('saved');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(api.saveProject, 'the flushed edit is not saved a second time').toHaveBeenCalledTimes(1);
  });

  it('shows a failed save, keeps the edit, and clears the error with the next edit', async () => {
    api.saveProject.mockRejectedValueOnce(new Error('Disk full'));
    const { result } = await loaded();
    act(() => result.current.update((current) => ({ ...current, name: 'Edited' })));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(result.current.saveStatus).toBe('error');
    expect(result.current.error).toBe('Disk full');
    expect(result.current.project.name).toBe('Edited');
    act(() => result.current.update((current) => ({ ...current, name: 'Edited again' })));
    expect(result.current.error).toBeNull();
    expect(result.current.saveStatus).toBe('pending');
  });

  it('replaces the show with an imported one and drops any pending edit', async () => {
    const { result } = await loaded();
    act(() => result.current.update((current) => ({ ...current, name: 'Will be dropped' })));
    act(() => result.current.replace({ name: 'Imported', scenes: [] }));
    expect(result.current.project.name).toBe('Imported');
    expect(result.current.saveStatus).toBe('saved');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(api.saveProject, 'the dropped edit was never saved').not.toHaveBeenCalled();
  });

  it('does not save after it is unmounted', async () => {
    const { result, unmount } = await loaded();
    act(() => result.current.update((current) => ({ ...current, name: 'Late' })));
    unmount();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.saveProject).not.toHaveBeenCalled();
  });

  it('ignores a load that finishes after it is unmounted', async () => {
    let finish;
    api.getProject.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { unmount } = renderHook(() => useProject());
    unmount();
    await act(async () => {
      finish(PROJECT);
      await Promise.resolve();
    });
    expect(api.getFixtureLibrary).toHaveBeenCalled();
  });
});
