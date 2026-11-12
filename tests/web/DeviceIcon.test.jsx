// Tests for the device pictograms: one per category, each with its own cut-out mask, lit in a given colour.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DEVICE_CATEGORIES } from '../../shared/categories.js';
import { DeviceIcon } from '../../src/components/DeviceIcon.jsx';

describe('DeviceIcon', () => {
  it('draws every category, hidden from screen readers, with a tooltip naming it', () => {
    const { container } = render(
      <div>
        {DEVICE_CATEGORIES.map((category) => (
          <DeviceIcon key={category} category={category} />
        ))}
      </div>,
    );
    const icons = [...container.querySelectorAll('svg.device-icon')];
    expect(icons.map((icon) => icon.dataset.category)).toEqual([...DEVICE_CATEGORIES]);
    expect(icons.every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(icons[2].querySelector('title').textContent).toBe('Moving head');
  });

  it('gives each icon its own mask, so many on a page do not borrow each other’s shape', () => {
    const { container } = render(
      <div>
        <DeviceIcon category="par" />
        <DeviceIcon category="laser" />
      </div>,
    );
    const ids = [...container.querySelectorAll('mask')].map((mask) => mask.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('lights up in the colour it is given, and falls back to a known category', () => {
    const { container } = render(<DeviceIcon category="par" glow="#ff0000" />);
    expect(container.innerHTML).toContain('#ff0000');
    const { container: unknown } = render(<DeviceIcon category="toaster" />);
    expect(unknown.querySelector('svg').dataset.category).toBe('other');
  });
});
