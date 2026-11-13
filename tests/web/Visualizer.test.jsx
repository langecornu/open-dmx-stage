// Component tests for the visualizer window: opening and closing, the views, the rig set up per venue, placing lights on
// rails by list and keyboard, and the pads that play while it is open. The drawing itself needs a real browser canvas.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import { api } from '../../src/api.js';
import { Visualizer } from '../../src/components/Visualizer.jsx';
import { DecksProvider } from '../../src/hooks/useDecks.js';
import { accessibilityViolations } from './axe.js';
import { BUILTIN_TYPES } from './fixtures.js';

const start = {
  schemaVersion: 7,
  id: 'show',
  name: 'Show',
  venue: { id: 'main', name: 'Club' },
  venues: [],
  fixtureTypes: [],
  fixtures: [
    { id: 'p1', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1 },
    { id: 'p2', name: 'Par 2', typeId: 'generic-rgb-par', mode: 0, address: 4 },
  ],
  groups: [],
  scenes: [{ id: 's1', name: 'Red', values: { 1: 255 } }],
  chases: [],
};

let latest;
let live;
let onClose;
function Harness() {
  const [project, setProject] = useState(start);
  latest = project;
  return (
    <Visualizer
      isOpen
      onClose={onClose}
      project={project}
      library={BUILTIN_TYPES}
      patch={buildPatch(project, BUILTIN_TYPES)}
      update={(mutate) => setProject((current) => mutate(current))}
      live={live}
      flush={vi.fn().mockResolvedValue(undefined)}
    />
  );
}

beforeEach(() => {
  localStorage.clear();
  onClose = vi.fn();
  live = { send: vi.fn(), engine: { blackout: false, activeChaseId: null, activeSceneId: null } };
  // jsdom has no canvas; the window works without drawing.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => vi.restoreAllMocks());

describe('Visualizer', () => {
  it('opens full screen over the page, and closes with Close or Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'Stage view' });
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByRole('img', { name: /2 lights on stage/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /Close/ }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('switches between the front, corner and above views, and remembers the choice', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const views = screen.getByRole('group', { name: 'View' });
    expect(within(views).getByRole('button', { name: 'Corner' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(views).getByRole('button', { name: 'Above' }));
    expect(within(views).getByRole('button', { name: 'Above' })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(localStorage.getItem('odmx-visualizer')).view).toBe('above');
  });

  it('sets up the rig of this venue: its shape, uprights and size', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: /Arrange lights/ }));
    const arrange = screen.getByRole('group', { name: 'Arrange lights' });
    await user.selectOptions(within(arrange).getByLabelText('Truss'), 'Square around the floor');
    await user.click(within(arrange).getByLabelText('Uprights at the corners'));
    await user.clear(within(arrange).getByLabelText('Width (m)'));
    await user.type(within(arrange).getByLabelText('Width (m)'), '12');
    expect(latest.rig).toEqual({ shape: 'square', uprights: false, width: 12, depth: 6, height: 4 });
  });

  it('moves a chosen light to another rail, then along it with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: /Arrange lights/ }));
    const arrange = screen.getByRole('group', { name: 'Arrange lights' });
    await user.selectOptions(within(arrange).getByLabelText('Truss'), 'U: back and both sides');
    await user.click(within(arrange).getByRole('button', { name: 'Par 2' }));
    await user.selectOptions(within(arrange).getByLabelText('Par 2 is on'), 'Left truss');
    expect(latest.fixtures[1].stage).toEqual({ rail: 'left', at: 0.5 });
    within(arrange).getByRole('button', { name: 'Par 2' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(latest.fixtures[1].stage).toEqual({ rail: 'left', at: 0.52 });
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    expect(latest.fixtures[1].stage).toEqual({ rail: 'left', at: 0.42 });
    await user.selectOptions(within(arrange).getByLabelText('Par 2 is on'), 'The floor');
    within(arrange).getByRole('button', { name: 'Par 2' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(latest.fixtures[1].stage).toEqual({ rail: 'floor', x: 0.5, z: 0.52 });
  });

  it('puts every light back in its first place, after asking', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: /Arrange lights/ }));
    await user.click(screen.getByRole('button', { name: 'Par 1' }));
    await user.selectOptions(screen.getByLabelText('Par 1 is on'), 'The floor');
    expect(latest.fixtures[0].stage).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Reset layout' }));
    expect(latest.fixtures[0].stage).toBeUndefined();
  });

  it('plays looks from its pads, and blacks out', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(within(screen.getByRole('group', { name: 'Play' })).getByRole('button', { name: /Red/ }));
    await waitFor(() => expect(live.send).toHaveBeenCalledWith({ type: 'recall', sceneId: 's1', fadeMs: 500 }));
    await user.click(screen.getByRole('button', { name: /Blackout/ }));
    expect(live.send).toHaveBeenCalledWith({ type: 'blackout', enabled: true });
  });

  it('has no automated accessibility violations, arranging or not', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(await accessibilityViolations(document.body)).toEqual([]);
    await user.click(screen.getByRole('button', { name: /Arrange lights/ }));
    expect(await accessibilityViolations(document.body)).toEqual([]);
  });

  it('opens the compact decks from the pad bar, so music plays while watching', async () => {
    vi.spyOn(api, 'getMusic').mockResolvedValue({ folder: '/music', exists: true, tracks: [] });
    const user = userEvent.setup();
    render(
      <DecksProvider send={live.send}>
        <Harness />
      </DecksProvider>,
    );
    const toggle = screen.getByRole('button', { name: 'Decks' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Deck A' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /Crossfader/ })).toBeInTheDocument();
  });
});

describe('Visualizer drawing and dragging, with a stand-in canvas', () => {
  /** A 2D context that counts what is drawn. */
  const counted = (counts) => {
    const gradient = { addColorStop: () => {} };
    const known = {
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      createPattern: () => ({}),
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      measureText: () => ({ width: 40 }),
    };
    return new Proxy(known, {
      get: (target, key) =>
        key in target
          ? target[key]
          : () => {
              counts[key] = (counts[key] ?? 0) + 1;
            },
      set: () => true,
    });
  };

  it('draws frames while open, and saves a light dragged from the truss onto the floor', async () => {
    const { makeCamera } = await import('../../src/utils/stageCamera.js');
    const { positionOf, mountsOf, rigOrDefault } = await import('../../shared/stageRig.js');
    const counts = {};
    vi.restoreAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => counted(counts));
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<Harness />);
      await act(async () => vi.advanceTimersByTime(500));
      expect(counts.fill).toBeGreaterThan(0);

      await user.click(screen.getByRole('button', { name: /Arrange lights/ }));
      await act(async () => vi.advanceTimersByTime(100));
      // Where Par 1 is on screen: its first place on the default rig, from the corner view.
      const rig = rigOrDefault(undefined);
      const camera = makeCamera(1000, 700, 'corner', rig);
      const mount = mountsOf(start.fixtures, () => 'par', rig).get('p1');
      const at = camera.project(positionOf(rig, mount));
      const centre = camera.project({ x: 0, y: 0, z: 0 });
      const canvas = screen.getByRole('img', { name: /lights on stage/ });
      fireEvent.pointerDown(canvas, { clientX: at.x, clientY: at.y + 0.15 * at.scale, pointerId: 1, button: 0 });
      fireEvent.pointerMove(canvas, { clientX: centre.x, clientY: centre.y, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: centre.x, clientY: centre.y, pointerId: 1 });
      expect(latest.fixtures[0].stage).toMatchObject({ rail: 'floor' });
      expect(latest.fixtures[0].stage.x).toBeCloseTo(0.5, 1);
    } finally {
      vi.useRealTimers();
    }
  });
});
