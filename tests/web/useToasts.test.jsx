// Tests for the brief confirmations: they appear, they go away by themselves, and only a few show at once.
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastRegion } from '../../src/components/ToastRegion.jsx';
import { useToasts } from '../../src/hooks/useToasts.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useToasts', () => {
  it('shows a toast and removes it after a moment', () => {
    const { result } = renderHook(() => useToasts());
    act(() => result.current.notify('Play Ocean'));
    expect(result.current.toasts.map((toast) => toast.text)).toEqual(['Play Ocean']);
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.toasts).toEqual([]);
  });

  it('keeps only the three most recent', () => {
    const { result } = renderHook(() => useToasts());
    act(() => {
      for (const text of ['a', 'b', 'c', 'd']) {
        result.current.notify(text);
      }
    });
    expect(result.current.toasts.map((toast) => toast.text)).toEqual(['b', 'c', 'd']);
  });

  it('gives each toast its own timer, so an early one going does not remove a later one', () => {
    const { result } = renderHook(() => useToasts());
    act(() => result.current.notify('first'));
    act(() => vi.advanceTimersByTime(1500));
    act(() => result.current.notify('second'));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.toasts.map((toast) => toast.text)).toEqual(['second']);
  });

  it('stops its timers when the screen closes', () => {
    const { result, unmount } = renderHook(() => useToasts());
    act(() => result.current.notify('x'));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('ToastRegion', () => {
  it('shows toasts in a polite live region', () => {
    render(<ToastRegion toasts={[{ id: 1, text: 'Blackout' }]} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Blackout')).toBeInTheDocument();
  });
});
