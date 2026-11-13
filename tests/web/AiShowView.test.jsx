// Component tests for AI shows: the key prompt, the venue's toggles, the song's numbers, steering choices, and adding
// what the AI made to the show (and taking it away again).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import { AiShowView } from '../../src/components/AiShowView.jsx';
import { accessibilityViolations } from './axe.js';
import { BUILTIN_TYPES } from './fixtures.js';

vi.mock('../../src/api.js', () => ({ api: { getAiSettings: vi.fn(), generateShow: vi.fn() } }));
vi.mock('../../src/utils/songAnalysis.js', () => ({ analyseSongFile: vi.fn() }));
const { api } = await import('../../src/api.js');
const { analyseSongFile } = await import('../../src/utils/songAnalysis.js');

const head = {
  id: 'head-type',
  manufacturer: 'Acme',
  name: 'Spot head',
  description: '',
  category: 'moving-head',
  modes: [
    {
      name: '2 channel',
      channels: [
        { name: 'Pan', type: 'pan', defaultValue: 128 },
        { name: 'Tilt', type: 'tilt', defaultValue: 128 },
      ],
    },
  ],
};
const start = {
  schemaVersion: 7,
  id: 'show',
  name: 'Show',
  venue: { id: 'main', name: 'Club' },
  venues: [],
  fixtureTypes: [head],
  fixtures: [
    { id: 'p1', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1, stage: { rail: 'back', at: 0.3 } },
    { id: 'h1', name: 'Head', typeId: 'head-type', mode: 0, address: 10, stage: { rail: 'back', at: 0.7 } },
  ],
  groups: [],
  scenes: [{ id: 'old', name: 'Old look', values: {} }],
  chases: [],
};
const generated = {
  summary: 'Cool, then hot.',
  looks: [{ id: 'l1', name: 'Ice', values: { 3: 255 }, origin: 'ai' }],
  sequences: [
    {
      id: 'q1',
      name: 'Song',
      loop: false,
      timing: 'beats',
      steps: [],
      blocks: [{ id: 'b' }],
      tempo: 124,
      origin: 'ai',
    },
  ],
  usage: { inputTokens: 10000, outputTokens: 20000 },
};

let latest;
let navigate;
let flush;
function Harness({ initial = start, live }) {
  const [project, setProject] = useState(initial);
  latest = project;
  return (
    <AiShowView
      project={project}
      library={BUILTIN_TYPES}
      patch={buildPatch(project, BUILTIN_TYPES)}
      update={(mutate) => setProject((current) => mutate(current))}
      flush={flush}
      navigate={navigate}
      live={live}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  navigate = vi.fn();
  flush = vi.fn().mockResolvedValue(undefined);
  api.getAiSettings.mockResolvedValue({ hasKey: true, source: 'saved' });
});

describe('AiShowView', () => {
  it('sends to Settings when there is no key, and cannot generate', async () => {
    const user = userEvent.setup();
    api.getAiSettings.mockResolvedValue({ hasKey: false, source: null });
    render(<Harness />);
    await user.click(await screen.findByRole('button', { name: 'Open Settings' }));
    expect(navigate).toHaveBeenCalledWith('settings');
    expect(screen.getByRole('button', { name: 'Generate the show' })).toBeDisabled();
  });

  it('leaves everything to the AI by default, and adds what it made to the show, marked as AI', async () => {
    const user = userEvent.setup();
    api.generateShow.mockResolvedValue(generated);
    render(<Harness />);
    expect(screen.getByRole('region', { name: /The venue: Club/ })).toHaveTextContent('strobe, movement');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate the show' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Generate the show' }));
    expect(flush).toHaveBeenCalled();
    expect(api.generateShow).toHaveBeenCalledWith(
      expect.objectContaining({ auto: true, looks: 8, sequences: 2, bars: 16, song: null, model: 'claude-opus-5-5' }),
    );
    const result = await screen.findByRole('region', { name: 'Added to your show' });
    expect(result).toHaveTextContent('Cool, then hot.');
    expect(result).toHaveTextContent('124 BPM, follows the song');
    expect(result).toHaveTextContent('on Opus 5.5, 44¢ at list prices');
    expect(latest.scenes.map((scene) => scene.name)).toEqual(['Old look', 'Ice']);
    expect(latest.chases.map((chase) => chase.name)).toEqual(['Song']);
    await user.click(within(result).getByRole('button', { name: /Remove these/ }));
    expect(latest.scenes.map((scene) => scene.name)).toEqual(['Old look']);
    expect(latest.chases).toEqual([]);
  });

  it('offers three models with an estimate for this rig, sends the chosen one, and remembers it', async () => {
    const user = userEvent.setup();
    api.generateShow.mockResolvedValue({ ...generated, model: 'claude-haiku-5-5' });
    const { container } = render(<Harness />);
    const models = screen.getByRole('group', { name: 'Model' });
    const opus = within(models).getByRole('radio', { name: /Opus 5\.5/ });
    expect(opus).toBeChecked();
    expect(within(models).getAllByRole('radio')).toHaveLength(3);
    expect(models).toHaveTextContent('for 2 lights, 8 looks and 2 sequences');
    expect(opus.closest('label')).toHaveTextContent(/about \d+¢ to \d+¢/);
    expect(screen.getByText(/^Opus 5\.5, about/)).toBeInTheDocument();

    await user.click(within(models).getByRole('radio', { name: /Haiku 5\.5/ }));
    expect(screen.getByText(/^Haiku 5\.5, under 1¢/)).toBeInTheDocument();
    expect(localStorage.getItem('odmx-ai-model')).toBe('claude-haiku-5-5');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate the show' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Generate the show' }));
    expect(api.generateShow).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-haiku-5-5' }));
    expect(await screen.findByRole('region', { name: 'Added to your show' })).toHaveTextContent(
      'on Haiku 5.5, 1¢ at list prices',
    );
    expect(await accessibilityViolations(container)).toEqual([]);
  });

  it('starts from the model chosen last time in this browser, or Opus when that is not a model', () => {
    localStorage.setItem('odmx-ai-model', 'claude-sonnet-5-5');
    const { unmount } = render(<Harness />);
    expect(screen.getByRole('radio', { name: /Sonnet 5\.5/ })).toBeChecked();
    unmount();
    localStorage.setItem('odmx-ai-model', 'not-a-model');
    render(<Harness />);
    expect(screen.getByRole('radio', { name: /Opus 5\.5/ })).toBeChecked();
  });

  it('sends the steering choices, offering only what this venue can do', async () => {
    const user = userEvent.setup();
    api.generateShow.mockResolvedValue(generated);
    render(<Harness />);
    await user.click(screen.getByRole('checkbox', { name: 'Let the AI decide everything' }));
    await user.type(screen.getByLabelText('Mood or style'), 'Elegant dinner');
    await user.selectOptions(screen.getByLabelText('Energy'), 'Relaxed');
    await user.click(screen.getByRole('button', { name: 'Add a colour' }));
    await user.selectOptions(screen.getByLabelText('How to use colour 1'), 'Avoid');
    expect(screen.queryByRole('group', { name: 'Gobos' })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('group', { name: 'Movement' })).getByRole('button', { name: 'More' }));
    await user.click(within(screen.getByRole('group', { name: 'Strobe' })).getByRole('button', { name: 'Off' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate the show' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Generate the show' }));
    expect(api.generateShow).toHaveBeenCalledWith(
      expect.objectContaining({
        auto: false,
        mood: 'Elegant dinner',
        energy: 40,
        colours: [{ hex: '#ff0040', amount: 'avoid' }],
        features: { movement: 'more', strobe: 'off' },
      }),
    );
  });

  it('analyses a song in the browser, lets the tempo be halved, and sends only its numbers', async () => {
    const user = userEvent.setup();
    analyseSongFile.mockResolvedValue({
      bpm: 248,
      firstBeatSeconds: 0.42,
      durationSeconds: 200,
      bars: 103,
      sections: [
        { startBar: 0, bars: 16, energy: 0.2 },
        { startBar: 16, bars: 87, energy: 0.8 },
      ],
    });
    api.generateShow.mockResolvedValue(generated);
    render(<Harness />);
    await user.upload(screen.getByLabelText('Choose a song'), new File(['x'], 'track.mp3', { type: 'audio/mpeg' }));
    expect(await screen.findByText(/track\.mp3 · 3:20 · first downbeat at 0\.42 s/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Half' }));
    expect(screen.getByLabelText('Tempo (beats a minute)')).toHaveValue(124);
    expect(screen.queryByLabelText('Sequence length')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate the show' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Generate the show' }));
    expect(api.generateShow.mock.calls[0][0].song).toEqual({
      bpm: 124,
      durationSeconds: 200,
      firstBeatSeconds: 0.42,
      sections: [
        { startBar: 0, bars: 16, energy: 0.2 },
        { startBar: 16, bars: 87, energy: 0.8 },
      ],
    });
  });

  it('asks for the lights to be placed on the stage first, and opens the stage view to arrange them', async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); // jsdom has no canvas
    const unplaced = { ...start, fixtures: start.fixtures.map(({ stage: _stage, ...fixture }) => fixture) };
    const live = { send: vi.fn(), engine: { blackout: false, activeChaseId: null, activeSceneId: null } };
    render(<Harness initial={unplaced} live={live} />);
    expect(await screen.findByText(/None of them has a place on the stage yet/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Place the lights on the stage first/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Generate the show/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Arrange the lights/ }));
    const stage = screen.getByRole('dialog', { name: 'Stage view' });
    expect(within(stage).getByRole('button', { name: /Arrange lights/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(stage).getByRole('button', { name: 'Keep these places' }));
    await user.click(within(stage).getByRole('button', { name: /Close/ }));

    expect(latest.fixtures.every((fixture) => fixture.stage)).toBe(true);
    expect(screen.getByText(/Every light has its place: one truss, at the back, 8 × 6 m/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate the show/ })).toBeEnabled();
    vi.restoreAllMocks();
  });

  it('names the lights still waiting for a place', async () => {
    const partly = {
      ...start,
      fixtures: [start.fixtures[0], { ...start.fixtures[1], stage: undefined }],
    };
    render(<Harness initial={partly} />);
    expect(await screen.findByText(/1 light \(Head\) has no place on the stage yet/)).toBeInTheDocument();
  });

  it('shows why a generation failed', async () => {
    const user = userEvent.setup();
    api.generateShow.mockRejectedValue(new Error('The key has reached its usage limit for now.'));
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate the show' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Generate the show' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('usage limit');
    expect(latest.scenes).toHaveLength(1);
  });

  it('has no automated accessibility violations', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.click(screen.getByRole('checkbox', { name: 'Let the AI decide everything' }));
    await user.click(screen.getByRole('button', { name: 'Add a colour' }));
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
