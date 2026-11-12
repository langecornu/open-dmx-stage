// Component tests for timeline sequences: the Steps / Timeline toggle, drawing blocks by dragging across lanes, editing
// them in the inspector, the keyboard path, and playing.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import { ChasesView } from '../../src/components/ChasesView.jsx';
import { accessibilityViolations } from './axe.js';
import { BUILTIN_TYPES } from './fixtures.js';

// jsdom has no PointerEvent; a MouseEvent with a pointer id is enough for the editor.
beforeAll(() => {
  if (!window.PointerEvent) {
    window.PointerEvent = class PointerEvent extends MouseEvent {
      constructor(type, init = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    };
  }
});

const start = {
  schemaVersion: 4,
  name: 'Test',
  fixtureTypes: [],
  fixtures: [
    { id: 'p1', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1 },
    { id: 'p2', name: 'Par 2', typeId: 'generic-rgb-par', mode: 0, address: 4 },
  ],
  scenes: [],
  chases: [],
  groups: [],
  timelines: [],
};

let latest;
let live;

function Harness({ initial }) {
  const [project, setProject] = useState(initial);
  latest = project;
  const update = (change) => setProject((current) => (typeof change === 'function' ? change(current) : change));
  return (
    <ChasesView
      project={project}
      patch={buildPatch(project, BUILTIN_TYPES)}
      update={update}
      flush={vi.fn().mockResolvedValue(undefined)}
      live={live}
    />
  );
}

function renderView(initial = start, engine = {}) {
  live = {
    send: vi.fn(),
    engine: { bpm: 120, activeChaseId: null, chaseStep: null, activeTimelineId: null, ...engine },
  };
  return render(<Harness initial={initial} />);
}

// Each lane is 160 px wide (10 px a beat for 16 beats) and 40 px high, Par 1 above Par 2.
function layOutLanes() {
  ['p1', 'p2'].forEach((id, index) => {
    const lane = screen.getByTestId(`lane-${id}`);
    lane.getBoundingClientRect = () => ({ left: 0, width: 160, top: index * 40, bottom: index * 40 + 40, height: 40 });
  });
}

const drag = (from, to, { x1, y1, x2, y2 }) => {
  fireEvent.pointerDown(from, { button: 0, clientX: x1, clientY: y1, pointerId: 1 });
  fireEvent.pointerMove(to, { clientX: x2, clientY: y2, pointerId: 1 });
  fireEvent.pointerUp(to, { clientX: x2, clientY: y2, pointerId: 1 });
};

beforeEach(() => localStorage.clear());

describe('Sequences: Steps or Timeline', () => {
  it('starts on Steps, and the toggle switches to timelines and is remembered', async () => {
    const user = userEvent.setup();
    const { unmount } = renderView();
    expect(screen.getByRole('button', { name: 'Steps' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Timeline' }));
    expect(screen.getByText('No timelines yet')).toBeInTheDocument();
    unmount();
    renderView();
    expect(screen.getByRole('button', { name: 'Timeline' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('creates a timeline with a lane for each light', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: 'Timeline' }));
    await user.click(screen.getByRole('button', { name: 'New sequence' }));
    expect(latest.timelines).toHaveLength(1);
    expect(latest.timelines[0]).toMatchObject({ name: 'Timeline 1', beats: 16, blocks: [] });
    expect(screen.getByTestId('lane-p1')).toBeInTheDocument();
    expect(screen.getByTestId('lane-p2')).toBeInTheDocument();
  });
});

describe('Timeline editor', () => {
  const withTimeline = (blocks = []) => ({
    ...start,
    timelines: [{ id: 't1', name: 'Groove', beats: 16, blocks }],
  });
  const redBlock = {
    id: 'b1',
    fixtureId: 'p1',
    start: 0,
    length: 4,
    color: '#ff0000',
    intensity: 100,
    transition: 'none',
    endColor: '#0040ff',
    endIntensity: 100,
    effect: 'none',
    strobeSpeed: 50,
  };

  beforeEach(() => localStorage.setItem('odmx-sequence-mode', 'timeline'));

  it('draws a block on every light covered by a drag, snapped to whole beats', () => {
    renderView(withTimeline());
    layOutLanes();
    drag(screen.getByTestId('lane-p1'), screen.getByTestId('lane-p2'), { x1: 21, y1: 10, x2: 58, y2: 50 });
    const blocks = latest.timelines[0].blocks;
    expect(blocks.map((b) => [b.fixtureId, b.start, b.length])).toEqual([
      ['p1', 2, 4],
      ['p2', 2, 4],
    ]);
    expect(screen.getByRole('region', { name: 'Block settings' })).toHaveTextContent('2 blocks');
  });

  it('edits colour, intensity, a fade and a strobe on the selected block', async () => {
    const user = userEvent.setup();
    renderView(withTimeline([redBlock]));
    await user.click(screen.getByRole('button', { name: /Par 1, beats 1 to 5/ }));
    const inspector = screen.getByRole('region', { name: 'Block settings' });
    await user.click(within(inspector).getByRole('button', { name: 'Colour: Green' }));
    fireEvent.change(within(inspector).getByLabelText(/^Intensity/), { target: { value: '60' } });
    await user.selectOptions(within(inspector).getByLabelText('Transition'), 'fade');
    await user.click(within(inspector).getByRole('button', { name: 'Fade to: Blue' }));
    await user.selectOptions(within(inspector).getByLabelText('Effect'), 'strobe');
    expect(latest.timelines[0].blocks[0]).toMatchObject({
      color: '#00ff3c',
      intensity: 60,
      transition: 'fade',
      endColor: '#0040ff',
      effect: 'strobe',
    });
    expect(screen.getByRole('button', { name: /Green at 60%, fading to Blue at 100%, strobe/ })).toBeInTheDocument();
  });

  it('moves a block by dragging it, and lengthens it by dragging its edge', () => {
    renderView(withTimeline([redBlock]));
    layOutLanes();
    const block = screen.getByRole('button', { name: /Par 1, beats 1 to 5/ });
    drag(block, block, { x1: 10, y1: 10, x2: 40, y2: 10 });
    expect(latest.timelines[0].blocks[0]).toMatchObject({ start: 3, length: 4 });
    const edge = screen.getByRole('button', { name: /Par 1, beats 4 to 8/ }).querySelector('.tl-block-resize');
    drag(edge, edge, { x1: 70, y1: 10, x2: 90, y2: 10 });
    expect(latest.timelines[0].blocks[0]).toMatchObject({ start: 3, length: 6 });
  });

  it('works from the keyboard: add a block on a lane, move and lengthen it with the arrows, delete it', async () => {
    const user = userEvent.setup();
    renderView(withTimeline());
    await user.click(screen.getByRole('button', { name: 'Add a block on Par 2' }));
    expect(latest.timelines[0].blocks[0]).toMatchObject({ fixtureId: 'p2', start: 0, length: 4 });
    const block = screen.getByRole('button', { name: /Par 2, beats 1 to 5/ });
    block.focus();
    await user.keyboard('{ArrowRight}');
    expect(latest.timelines[0].blocks[0].start).toBe(1);
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(latest.timelines[0].blocks[0].length).toBe(5);
    await user.keyboard('{Delete}');
    expect(latest.timelines[0].blocks).toHaveLength(0);
  });

  it('plays the timeline after saving, and stops it while it plays', async () => {
    const user = userEvent.setup();
    renderView(withTimeline([redBlock]));
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(live.send).toHaveBeenCalledWith({ type: 'timelineStart', timelineId: 't1' });
  });

  it('shows a playhead and a Stop button while the timeline plays', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    try {
      renderView(withTimeline([redBlock]), { activeTimelineId: 't1' });
      act(() => vi.advanceTimersByTime(100));
      expect(document.querySelectorAll('.tl-playhead').length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
      expect(live.send).toHaveBeenCalledWith({ type: 'chaseStop' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks before a shorter length removes or cuts blocks, and cuts them only when confirmed', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    try {
      renderView(
        withTimeline([
          { ...redBlock, start: 2, length: 6 },
          { ...redBlock, id: 'b2', start: 10 },
        ]),
      );
      await user.selectOptions(screen.getByLabelText('Length'), '8');
      expect(confirm).toHaveBeenLastCalledWith('Making it 2 bars will remove 1 block. Continue?');
      expect(latest.timelines[0].beats).toBe(16);
      await user.selectOptions(screen.getByLabelText('Length'), '8');
      expect(latest.timelines[0]).toMatchObject({ beats: 8, blocks: [{ id: 'b1', start: 2, length: 6 }] });
    } finally {
      confirm.mockRestore();
    }
  });

  it('can be made up to 64 bars long without asking when nothing is lost', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm');
    try {
      renderView(withTimeline([redBlock]));
      expect(screen.getByRole('option', { name: '64 bars (256 beats)' })).toBeInTheDocument();
      await user.selectOptions(screen.getByLabelText('Length'), '256');
      expect(latest.timelines[0].beats).toBe(256);
      expect(confirm).not.toHaveBeenCalled();
      expect(screen.getByRole('group', { name: 'Timeline, 64 bars' })).toBeInTheDocument();
    } finally {
      confirm.mockRestore();
    }
  });

  it('repeats the selection after itself, and repeating again carries the pattern on', async () => {
    const user = userEvent.setup();
    renderView(withTimeline([redBlock, { ...redBlock, id: 'b2', fixtureId: 'p2', start: 2, length: 2 }]));
    await user.click(screen.getByRole('button', { name: /Par 1, beats 1 to 5/ }));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('button', { name: /Par 2, beats 3 to 5/ }));
    await user.keyboard('{/Shift}');
    const inspector = screen.getByRole('region', { name: 'Block settings' });
    await user.click(within(inspector).getByRole('button', { name: 'Repeat' }));
    await user.click(within(inspector).getByRole('button', { name: 'Repeat' }));
    expect(latest.timelines[0].blocks.map((b) => [b.fixtureId, b.start])).toEqual([
      ['p1', 0],
      ['p2', 2],
      ['p1', 4],
      ['p2', 6],
      ['p1', 8],
      ['p2', 10],
    ]);
  });

  it('starts fitted to the width, zooms in and out with buttons and Ctrl and the wheel, and fits again', async () => {
    const user = userEvent.setup();
    renderView(withTimeline([redBlock]));
    const grid = screen.getByRole('group', { name: 'Timeline, 4 bars' });
    const width = () => grid.style.getPropertyValue('--tl-beat-px');
    expect(width()).toBe('0px');
    expect(screen.getByRole('button', { name: 'Fit' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(width()).toBe('4px');
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(width()).toBe('6px');
    fireEvent.wheel(grid, { deltaY: -100, ctrlKey: true });
    expect(width()).toBe('10px');
    fireEvent.wheel(grid, { deltaY: 100, metaKey: true });
    expect(width()).toBe('6px');
    fireEvent.wheel(grid, { deltaY: -100 });
    expect(width()).toBe('6px'); // a plain wheel scrolls, it does not zoom
    await user.click(screen.getByRole('button', { name: 'Fit' }));
    expect(width()).toBe('0px');
  });

  // A grid 2000 px wide shown in 500 px, as when zoomed in on a long timeline.
  function makeScrollable(grid) {
    Object.defineProperty(grid, 'scrollWidth', { configurable: true, value: 2000 });
    Object.defineProperty(grid, 'clientWidth', { configurable: true, value: 500 });
    grid.scrollLeft = 0;
  }

  it('scrolls a zoomed-in timeline sideways with an ordinary mouse wheel, and lets the page have it at the start', async () => {
    const user = userEvent.setup();
    renderView(withTimeline([redBlock]));
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    const grid = screen.getByRole('group', { name: 'Timeline, 4 bars' });
    makeScrollable(grid);
    const atStart = fireEvent.wheel(grid, { deltaY: -100 });
    expect(atStart).toBe(true); // not cancelled: the page scrolls up as usual
    const down = fireEvent.wheel(grid, { deltaY: 120 });
    expect(down).toBe(false);
    expect(grid.scrollLeft).toBe(120);
  });

  it('pans a zoomed-in timeline by dragging the bar numbers', async () => {
    const user = userEvent.setup();
    renderView(withTimeline([redBlock]));
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    const grid = screen.getByRole('group', { name: 'Timeline, 4 bars' });
    makeScrollable(grid);
    grid.scrollLeft = 300;
    const ruler = grid.querySelector('.tl-ruler-track');
    fireEvent.pointerDown(ruler, { button: 0, clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(ruler, { clientX: 250, pointerId: 1 });
    fireEvent.pointerUp(ruler, { clientX: 250, pointerId: 1 });
    expect(grid.scrollLeft).toBe(450);
    expect(latest.timelines[0].blocks).toHaveLength(1); // panning draws nothing
  });

  it('stops zooming in at the closest level', async () => {
    const user = userEvent.setup();
    renderView(withTimeline([redBlock]));
    for (let step = 0; step < 8; step += 1) {
      if (!screen.getByRole('button', { name: 'Zoom in' }).disabled) {
        await user.click(screen.getByRole('button', { name: 'Zoom in' }));
      }
    }
    expect(screen.getByRole('group', { name: 'Timeline, 4 bars' }).style.getPropertyValue('--tl-beat-px')).toBe('40px');
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
  });

  it('has no automated accessibility violations', async () => {
    const user = userEvent.setup();
    const { container } = renderView(withTimeline([redBlock]));
    await user.click(screen.getByRole('button', { name: /Par 1, beats 1 to 5/ }));
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});

describe('Timeline editor: what else a light does', () => {
  const head = {
    id: 'head-type',
    manufacturer: '',
    name: 'Test head',
    description: '',
    modes: [
      {
        name: '4 channel',
        channels: [
          { name: 'Pan', type: 'pan', defaultValue: 128 },
          {
            name: 'Gobo',
            type: 'gobo',
            defaultValue: 0,
            capabilities: [
              { from: 0, to: 9, type: 'gobo-slot', label: 'Open' },
              { from: 10, to: 19, type: 'gobo-slot', label: 'Star' },
            ],
          },
          { name: 'Dimmer', type: 'intensity', defaultValue: 0 },
          { name: 'Red', type: 'red', defaultValue: 0 },
        ],
      },
    ],
  };
  const rig = {
    ...start,
    fixtureTypes: [head],
    fixtures: [{ id: 'h1', name: 'Head 1', typeId: 'head-type', mode: 0, address: 1 }],
    timelines: [
      {
        id: 't1',
        name: 'Moves',
        beats: 16,
        blocks: [
          {
            id: 'b1',
            fixtureId: 'h1',
            start: 0,
            length: 4,
            color: '#ff0000',
            intensity: 100,
            transition: 'fade',
            endColor: '#ff0000',
            endIntensity: 100,
            effect: 'none',
            strobeSpeed: 50,
          },
        ],
      },
    ],
  };

  beforeEach(() => localStorage.setItem('odmx-sequence-mode', 'timeline'));

  it('offers the light’s controls, and saves a start and end pan and a gobo on the block', async () => {
    const user = userEvent.setup();
    renderView(rig);
    await user.click(screen.getByRole('button', { name: /Head 1, beats 1 to 5/ }));
    const more = screen.getByRole('region', { name: 'What else the lights do' });
    fireEvent.change(within(more).getByLabelText('Pan'), { target: { value: '20' } });
    fireEvent.change(within(more).getByLabelText('Pan at the end'), { target: { value: '80' } });
    await user.selectOptions(within(more).getByLabelText('Gobo'), 'Star');
    expect(latest.timelines[0].blocks[0]).toMatchObject({
      settings: { pan: 20, gobo: { option: 1, level: 50 } },
      endSettings: { pan: 80 },
    });
    await user.click(within(more).getByRole('button', { name: 'Clear Gobo' }));
    expect(latest.timelines[0].blocks[0].settings).toEqual({ pan: 20 });
  });

  it('shows the device icon beside each lane’s name', () => {
    renderView(rig);
    const lane = screen.getByText('Head 1').closest('.tl-label');
    expect(lane.querySelector('svg.device-icon').dataset.category).toBe('moving-head'); // guessed from "Test head"
  });
});
