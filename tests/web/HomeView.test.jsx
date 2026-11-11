// Component tests for the Home screen: status cards, the getting-started checklist and quick launch.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import { HomeView, setupSteps } from '../../src/components/HomeView.jsx';
import { accessibilityViolations } from './axe.js';
import { BUILTIN_TYPES } from './fixtures.js';

const fullProject = {
  schemaVersion: 3,
  name: 'Friday gig',
  fixtureTypes: [],
  fixtures: [{ id: 'a', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1 }],
  scenes: [
    { id: 'warm', name: 'Warm wash', values: { 1: 255 } },
    { id: 'cool', name: 'Cool wash', values: { 3: 255 } },
  ],
  chases: [{ id: 'show', name: 'Opening', loop: true, timing: 'seconds', steps: [] }],
  groups: [],
};
const idleEngine = {
  master: 1,
  blackout: false,
  bpm: 128,
  effect: null,
  activeSceneId: null,
  activeChaseId: null,
  chaseStep: null,
  programmerChannels: [],
};

function renderHome({ project = fullProject, output = { driver: 'open-dmx', connected: true }, engine = {} } = {}) {
  const live = { send: vi.fn(), connected: true, output, engine: { ...idleEngine, ...engine } };
  const flush = vi.fn().mockResolvedValue(undefined);
  const navigate = vi.fn();
  const view = render(
    <HomeView
      project={project}
      patch={buildPatch(project, BUILTIN_TYPES)}
      live={live}
      flush={flush}
      navigate={navigate}
    />,
  );
  return { ...view, live, flush, navigate };
}

describe('setupSteps', () => {
  it('marks each step done from the show and the output', () => {
    const empty = setupSteps({ fixtures: [], scenes: [], chases: [] }, { driver: 'mock', connected: true });
    expect(empty.map((step) => step.isDone)).toEqual([false, false, false, false]);
    expect(empty[1].hint).toMatch(/simulator/);
    const done = setupSteps(fullProject, { driver: 'open-dmx', connected: true });
    expect(done.map((step) => step.isDone)).toEqual([true, true, true, true]);
  });

  it('does not count a real output that is not connected', () => {
    expect(setupSteps(fullProject, { driver: 'open-dmx', connected: false })[1].isDone).toBe(false);
  });
});

describe('HomeView', () => {
  it('shows the show name, the output, the rig and the tempo', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1, name: 'Friday gig' })).toBeInTheDocument();
    expect(screen.getByText('USB-DMX cable')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('1 light')).toBeInTheDocument();
    expect(screen.getByText('2 looks · 1 sequence')).toBeInTheDocument();
    expect(screen.getByText(/128/)).toBeInTheDocument();
  });

  it('hides the checklist and says everything is set up once every step is done', () => {
    renderHome();
    expect(screen.queryByRole('region', { name: 'Getting started' })).not.toBeInTheDocument();
    expect(screen.getByText(/Everything is set up/)).toBeInTheDocument();
  });

  it('shows what is next while something is missing, and goes there', async () => {
    const user = userEvent.setup();
    const { navigate } = renderHome({ output: { driver: 'mock', connected: true } });
    const list = screen.getByRole('region', { name: 'Getting started' });
    expect(within(list).getByText('3 of 4 done')).toBeInTheDocument();
    expect(screen.getByText(/Next: connect the output/)).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Connect the output' }));
    expect(navigate).toHaveBeenCalledWith('monitor');
  });

  it('warns when the output is not connected', () => {
    renderHome({ output: { driver: 'open-dmx', connected: false } });
    expect(screen.getByText(/Not connected. Open Output to fix it./)).toBeInTheDocument();
  });

  it('plays a look from quick launch after saving any pending edit', async () => {
    const user = userEvent.setup();
    const { live, flush } = renderHome();
    await user.click(screen.getByRole('button', { name: /Cool wash/ }));
    expect(flush).toHaveBeenCalled();
    expect(live.send).toHaveBeenCalledWith({ type: 'recall', sceneId: 'cool', fadeMs: 500 });
  });

  it('starts a sequence from quick launch, and stops it when it is pressed while playing', async () => {
    const user = userEvent.setup();
    const first = renderHome();
    await user.click(screen.getByRole('button', { name: /Opening/ }));
    expect(first.live.send).toHaveBeenCalledWith({ type: 'chaseStart', chaseId: 'show' });
    first.unmount();
    const second = renderHome({ engine: { activeChaseId: 'show' } });
    expect(within(screen.getByRole('button', { name: /Opening/ })).getByText('On stage')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Opening/ }));
    expect(second.live.send).toHaveBeenCalledWith({ type: 'chaseStop' });
  });

  it('explains an empty quick launch, and the cards and button navigate', async () => {
    const user = userEvent.setup();
    const { navigate } = renderHome({ project: { ...fullProject, scenes: [], chases: [] } });
    expect(screen.getByText('Nothing to launch yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open Perform' }));
    expect(navigate).toHaveBeenLastCalledWith('perform');
    await user.click(screen.getByRole('button', { name: /Output/ }));
    expect(navigate).toHaveBeenLastCalledWith('monitor');
    await user.click(screen.getByRole('button', { name: /Rig/ }));
    expect(navigate).toHaveBeenLastCalledWith('patch');
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderHome({ output: { driver: 'mock', connected: true } });
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
