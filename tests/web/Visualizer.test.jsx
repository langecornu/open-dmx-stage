// Component tests for the visualizer window: opening and closing, the views, the rig set up per venue, placing lights on
// rails by list and keyboard, and the pads that play while it is open. The drawing itself needs a real browser canvas.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import { Visualizer } from '../../src/components/Visualizer.jsx';
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
});
