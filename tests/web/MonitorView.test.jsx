// Component tests for the Output screen: the live view of all 512 channels, and its connection card.
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import { MonitorView } from '../../src/components/MonitorView.jsx';
import { frameStore } from '../../src/hooks/frameStore.js';
import { accessibilityViolations } from './axe.js';
import { BUILTIN_TYPES, makeLive, makeShow } from './fixtures.js';

// The connection card has its own tests; here it is only checked that this screen shows it.
vi.mock('../../src/components/ConnectionPanel.jsx', () => ({
  ConnectionPanel: ({ output }) => <section aria-label="Connection card">{output?.driver}</section>,
}));

function renderView() {
  const project = makeShow();
  const live = makeLive();
  return render(<MonitorView project={project} patch={buildPatch(project, BUILTIN_TYPES)} live={live} />);
}

afterEach(() => {
  act(() => frameStore.set(new Array(512).fill(0)));
});

describe('MonitorView', () => {
  it('shows 512 cells, with the patched ones outlined and named', () => {
    const { container } = renderView();
    const cells = container.querySelectorAll('.cell');
    expect(cells).toHaveLength(512);
    expect(cells[0]).toHaveAttribute('data-patched', 'true');
    expect(cells[0]).toHaveAttribute('title', 'Ch 1 · Par 1 · Red = 0');
    expect(cells[9]).toHaveAttribute('title', 'Ch 10 · Lamp · Intensity = 0');
    expect(cells[99]).toHaveAttribute('data-patched', 'false');
    expect(cells[99]).toHaveAttribute('title', 'Ch 100 = 0');
  });

  it('follows the live frame, with the bar height showing the level', () => {
    const { container } = renderView();
    const frame = new Array(512).fill(0);
    frame[0] = 255;
    frame[1] = 51;
    act(() => frameStore.set(frame));
    const cells = container.querySelectorAll('.cell');
    expect(cells[0].querySelector('.cell-fill')).toHaveStyle({ height: '100%' });
    expect(cells[1].querySelector('.cell-fill')).toHaveStyle({ height: '20%' });
    expect(cells[1]).toHaveAttribute('title', 'Ch 2 · Par 1 · Green = 51');
    expect(cells[2].querySelector('.cell-fill')).toHaveStyle({ height: '0%' });
  });

  it('is labelled for assistive technology, and explains what the cells mean', () => {
    renderView();
    expect(screen.getByRole('img', { name: 'Live view of all 512 DMX channel values' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Output' })).toBeInTheDocument();
    expect(screen.getByText('Universe 1 · 512 channels')).toBeInTheDocument();
    expect(screen.getByText('Bar height = level')).toBeInTheDocument();
    expect(screen.getByText('Outlined cell = patched channel')).toBeInTheDocument();
  });

  it('shows the connection card with the current output', () => {
    renderView();
    expect(screen.getByRole('region', { name: 'Connection card' })).toHaveTextContent('mock');
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderView();
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
