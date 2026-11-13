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
    { id: 'p1', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1 },
    { id: 'h1', name: 'Head', typeId: 'head-type', mode: 0, address: 10 },
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
function Harness({ initial = start }) {
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
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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
      expect.objectContaining({ auto: true, looks: 8, sequences: 2, bars: 16, song: null }),
    );
    const result = await screen.findByRole('region', { name: 'Added to your show' });
    expect(result).toHaveTextContent('Cool, then hot.');
    expect(result).toHaveTextContent('124 BPM, follows the song');
    expect(result).toHaveTextContent('about $0.44');
    expect(latest.scenes.map((scene) => scene.name)).toEqual(['Old look', 'Ice']);
    expect(latest.chases.map((chase) => chase.name)).toEqual(['Song']);
    await user.click(within(result).getByRole('button', { name: /Remove these/ }));
    expect(latest.scenes.map((scene) => scene.name)).toEqual(['Old look']);
    expect(latest.chases).toEqual([]);
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
