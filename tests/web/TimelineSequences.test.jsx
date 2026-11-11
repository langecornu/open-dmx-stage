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

  it('cuts blocks to fit when the timeline is made shorter', async () => {
    const user = userEvent.setup();
    renderView(
      withTimeline([
        { ...redBlock, start: 2, length: 6 },
        { ...redBlock, id: 'b2', start: 10 },
      ]),
    );
    await user.selectOptions(screen.getByLabelText('Length'), '8');
    expect(latest.timelines[0]).toMatchObject({ beats: 8, blocks: [{ id: 'b1', start: 2, length: 6 }] });
  });

  it('has no automated accessibility violations', async () => {
    const user = userEvent.setup();
    const { container } = renderView(withTimeline([redBlock]));
    await user.click(screen.getByRole('button', { name: /Par 1, beats 1 to 5/ }));
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
