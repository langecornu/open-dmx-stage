// Tests for the keyboard shortcut hook: it fires handlers, but never while typing or with modifier keys held.
import { renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { usePerformKeys } from '../../src/hooks/usePerformKeys.js';

describe('usePerformKeys', () => {
  it('calls the handler for a key, case-insensitively, and for special keys', () => {
    const handlers = { 1: vi.fn(), q: vi.fn(), ' ': vi.fn(), Escape: vi.fn() };
    renderHook(() => usePerformKeys(handlers));
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: 'Q' });
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handlers['1']).toHaveBeenCalledTimes(1);
    expect(handlers.q, 'capital Q still means q').toHaveBeenCalledTimes(1);
    expect(handlers[' ']).toHaveBeenCalledTimes(1);
    expect(handlers.Escape).toHaveBeenCalledTimes(1);
  });

  it('ignores keys held down, modifier combinations, unknown keys and typing in fields', () => {
    const handler = vi.fn();
    renderHook(() => usePerformKeys({ a: handler }));
    fireEvent.keyDown(window, { key: 'a', repeat: true });
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'a', metaKey: true });
    fireEvent.keyDown(window, { key: 'b' });
    const input = document.createElement('input');
    document.body.append(input);
    fireEvent.keyDown(input, { key: 'a' });
    input.remove();
    expect(handler).not.toHaveBeenCalled();
  });

  it('always uses the latest handlers and stops listening after unmount', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(({ handler }) => usePerformKeys({ a: handler }), {
      initialProps: { handler: first },
    });
    rerender({ handler: second });
    fireEvent.keyDown(window, { key: 'a' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    unmount();
    fireEvent.keyDown(window, { key: 'a' });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops the browser acting on a key that it handled', () => {
    renderHook(() => usePerformKeys({ ' ': vi.fn() }));
    const event = new KeyboardEvent('keydown', { key: ' ', cancelable: true, bubbles: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented, 'Space must not also scroll the page').toBe(true);
  });
});
