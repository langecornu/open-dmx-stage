// AI shows: Claude designs looks and sequences for the venue you are at, using everything its lights can do. Leave every
// choice to the AI, or steer it: a mood, the energy, colours to use more, less or never, and how much of each thing the
// lights can do (movement, gobos, smoke…; only what this venue has is offered). Optionally pick a song: its tempo,
// first downbeat and energy map are worked out in this browser, and only those numbers are sent, so one sequence
// follows the song section by section. The new looks and sequences are added to the show, marked as made by AI.
import { useEffect, useMemo, useState } from 'react';

import { venueFeatures } from '../../shared/aiShow.js';
import { api } from '../api.js';
import { averageColor, fixtureColors } from '../utils/sceneColors.js';
import { analyseSongFile } from '../utils/songAnalysis.js';
import { Icon } from './Icon.jsx';

const ENERGIES = [
  { value: '', label: 'Let the AI choose' },
  { value: '15', label: 'Calm' },
  { value: '40', label: 'Relaxed' },
  { value: '65', label: 'Lively' },
  { value: '90', label: 'Intense' },
];
const AMOUNT_LABELS = { auto: 'Auto', more: 'More', less: 'Less', off: 'Off' };
const COLOUR_LABELS = { more: 'Use more', less: 'Use less', avoid: 'Avoid' };
const BAR_CHOICES = [4, 8, 16, 32, 64];
// Each added colour starts as a different one, to change from there.
const STARTING_COLOURS = ['#ff0040', '#00c8ff', '#ffb000', '#8b5cf6', '#22c55e', '#ff6a00'];

// Claude Opus 5.5 list prices, US dollars per million tokens, for an estimate shown after each generation.
const PRICE_IN = 4;
const PRICE_OUT = 20;

const energyWord = (energy) => (energy < 0.33 ? 'quiet' : energy < 0.66 ? 'medium' : 'high');
const plural = (count, word) => `${count} ${count === 1 ? word : `${word}s`}`;
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

function SongCard({ song, setSong }) {
  const [state, setState] = useState(
    /** @type {{ busy: boolean, error: string | null, name: string }} */ ({
      busy: false,
      error: null,
      name: '',
    }),
  );

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setState({ busy: true, error: null, name: file.name });
    try {
      setSong(await analyseSongFile(file));
      setState({ busy: false, error: null, name: file.name });
    } catch (error) {
      setSong(null);
      setState({ busy: false, error: error.message, name: '' });
    }
  };

  const setBpm = (bpm) => setSong({ ...song, bpm: Math.max(40, Math.min(240, Math.round(bpm * 10) / 10)) });

  return (
    <section className="card card-pad ai-card" aria-labelledby="ai-song-title">
      <h2 className="section-title" id="ai-song-title">
        Song (optional)
      </h2>
      <p className="view-sub">
        Pick the song to design for. It is analysed here, in your browser: only its tempo, length and how its energy
        rises and falls are sent to the AI, never the audio. Play it from your deck as usual.
      </p>
      <div className="toolbar">
        <label className="btn">
          <Icon name="upload" size={16} />
          {song ? 'Choose another song' : 'Choose a song'}
          <input className="sr-only" type="file" accept="audio/*" onChange={handleFile} />
        </label>
        {song ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setSong(null);
              setState({ busy: false, error: null, name: '' });
            }}
          >
            No song
          </button>
        ) : null}
        {state.busy ? (
          <span className="fixture-meta" role="status">
            Listening to {state.name}…
          </span>
        ) : null}
      </div>
      {state.error ? (
        <p className="error-banner" role="alert">
          {state.error}
        </p>
      ) : null}
      {song ? (
        <div className="ai-song">
          <p className="fixture-meta">
            {state.name ? `${state.name} · ` : ''}
            {clock(song.durationSeconds)} · first downbeat at {song.firstBeatSeconds.toFixed(2)} s
          </p>
          <div className="toolbar">
            <label className="field">
              Tempo (beats a minute)
              <input
                className="input input-narrow"
                type="number"
                min="40"
                max="240"
                step="0.1"
                value={song.bpm}
                onChange={(event) => setBpm(Number(event.target.value) || song.bpm)}
              />
            </label>
            <button type="button" className="btn btn-compact" onClick={() => setBpm(song.bpm / 2)}>
              Half
            </button>
            <button type="button" className="btn btn-compact" onClick={() => setBpm(song.bpm * 2)}>
              Double
            </button>
            <span className="fixture-meta">If the tempo sounds twice too fast or slow, halve or double it.</span>
          </div>
          <div className="ai-energy" role="img" aria-label="Energy of the song by section">
            {song.sections.map((section) => (
              <span
                key={section.startBar}
                className="ai-energy-section"
                data-level={energyWord(section.energy)}
                style={{ flexGrow: section.bars, height: `${20 + section.energy * 80}%` }}
                title={`Bars ${section.startBar + 1} to ${section.startBar + section.bars}: ${energyWord(section.energy)}`}
              />
            ))}
          </div>
          <p className="fixture-meta">
            {plural(song.sections.length, 'section')} over {song.sections.reduce((sum, s) => sum + s.bars, 0)} bars. The
            AI makes one sequence that follows the whole song: start it on the first downbeat, and turn on Follow the
            music on Perform so the lights stay on the beat.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function ChoicesCard({ choices, setChoices, features, hasSong }) {
  const set = (changes) => setChoices({ ...choices, ...changes });
  return (
    <section className="card card-pad ai-card" aria-labelledby="ai-choices-title">
      <h2 className="section-title" id="ai-choices-title">
        Your choices
      </h2>
      <label className="pill ai-auto">
        <input type="checkbox" checked={choices.auto} onChange={(event) => set({ auto: event.target.checked })} />
        Let the AI decide everything
      </label>
      {choices.auto ? (
        <p className="view-sub">
          The AI picks the colours, the energy and how much of everything the lights can do. Untick to steer it.
        </p>
      ) : (
        <div className="ai-choices">
          <label className="field">
            Mood or style
            <textarea
              className="input"
              rows={2}
              maxLength={500}
              placeholder="Warm and elegant for a wedding dinner, then a party after 10 pm…"
              value={choices.mood}
              onChange={(event) => set({ mood: event.target.value })}
            />
          </label>
          <label className="field">
            Energy
            <select
              className="select"
              value={choices.energy === null ? '' : String(choices.energy)}
              onChange={(event) => set({ energy: event.target.value === '' ? null : Number(event.target.value) })}
            >
              {ENERGIES.map((energy) => (
                <option key={energy.value} value={energy.value}>
                  {energy.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="ai-fieldset">
            <legend>Colours</legend>
            {choices.colours.length === 0 ? (
              <p className="fixture-meta">No colour preferences: the AI chooses.</p>
            ) : null}
            {choices.colours.map((colour, index) => (
              <div key={index} className="ai-colour">
                <input
                  type="color"
                  aria-label={`Colour ${index + 1}`}
                  value={colour.hex}
                  onChange={(event) =>
                    set({
                      colours: choices.colours.map((entry, at) =>
                        at === index ? { ...entry, hex: event.target.value } : entry,
                      ),
                    })
                  }
                />
                <select
                  className="select select-compact"
                  aria-label={`How to use colour ${index + 1}`}
                  value={colour.amount}
                  onChange={(event) =>
                    set({
                      colours: choices.colours.map((entry, at) =>
                        at === index ? { ...entry, amount: event.target.value } : entry,
                      ),
                    })
                  }
                >
                  {Object.entries(COLOUR_LABELS).map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-compact"
                  aria-label={`Remove colour ${index + 1}`}
                  onClick={() => set({ colours: choices.colours.filter((_, at) => at !== index) })}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
            {choices.colours.length < 12 ? (
              <button
                type="button"
                className="btn btn-compact"
                onClick={() =>
                  set({
                    colours: [
                      ...choices.colours,
                      { hex: STARTING_COLOURS[choices.colours.length % STARTING_COLOURS.length], amount: 'more' },
                    ],
                  })
                }
              >
                <Icon name="plus" size={16} />
                Add a colour
              </button>
            ) : null}
          </fieldset>

          <fieldset className="ai-fieldset">
            <legend>What the lights do</legend>
            {features.map((feature) => (
              <div key={feature.id} className="ai-feature">
                <span>
                  <span className="ai-feature-name">{feature.label}</span>
                  <span className="fixture-meta">
                    {feature.hint} · {feature.lights.join(', ')}
                  </span>
                </span>
                <div className="segmented" role="group" aria-label={feature.label}>
                  {Object.entries(AMOUNT_LABELS).map(([value, text]) => (
                    <button
                      key={value}
                      type="button"
                      className="segmented-option"
                      aria-pressed={(choices.features[feature.id] ?? 'auto') === value}
                      onClick={() => set({ features: { ...choices.features, [feature.id]: value } })}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
        </div>
      )}
      <div className="toolbar">
        <label className="field">
          Looks
          <input
            className="input input-narrow"
            type="number"
            min="2"
            max="16"
            value={choices.looks}
            onChange={(event) => set({ looks: Math.max(2, Math.min(16, Number(event.target.value) || 2)) })}
          />
        </label>
        <label className="field">
          Sequences
          <input
            className="input input-narrow"
            type="number"
            min="1"
            max="4"
            value={choices.sequences}
            onChange={(event) => set({ sequences: Math.max(1, Math.min(4, Number(event.target.value) || 1)) })}
          />
        </label>
        {hasSong ? null : (
          <label className="field">
            Sequence length
            <select
              className="select"
              value={choices.bars}
              onChange={(event) => set({ bars: Number(event.target.value) })}
            >
              {BAR_CHOICES.map((bars) => (
                <option key={bars} value={bars}>
                  {plural(bars, 'bar')}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </section>
  );
}

export function AiShowView({ project, library, patch, update, flush, navigate }) {
  const [hasKey, setHasKey] = useState(/** @type {boolean | null} */ (null));
  const [song, setSong] = useState(null);
  const [choices, setChoices] = useState({
    auto: true,
    mood: '',
    energy: null,
    colours: [],
    features: {},
    looks: 8,
    sequences: 2,
    bars: 16,
  });
  const [run, setRun] = useState(/** @type {{ startedAt: number } | null} */ (null));
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [result, setResult] = useState(null);
  const features = useMemo(() => venueFeatures(project, library), [project, library]);

  useEffect(() => {
    api
      .getAiSettings()
      .then((status) => setHasKey(status.hasKey))
      .catch(() => setHasKey(false));
  }, []);

  useEffect(() => {
    if (!run) {
      return undefined;
    }
    const timer = setInterval(() => setElapsed((Date.now() - run.startedAt) / 1000), 500);
    return () => clearInterval(timer);
  }, [run]);

  const handleGenerate = async () => {
    setError(null);
    setResult(null);
    setElapsed(0);
    setRun({ startedAt: Date.now() });
    try {
      await flush(); // the AI designs for the rig as saved
      const request = {
        ...choices,
        features: Object.fromEntries(
          Object.entries(choices.features).filter(([id]) => features.some((feature) => feature.id === id)),
        ),
        mood: choices.mood.trim(),
        song: song
          ? {
              bpm: song.bpm,
              durationSeconds: song.durationSeconds,
              firstBeatSeconds: song.firstBeatSeconds,
              sections: song.sections,
            }
          : null,
      };
      const generated = await api.generateShow(request);
      update((current) => ({
        ...current,
        scenes: [...current.scenes, ...generated.looks],
        chases: [...current.chases, ...generated.sequences],
      }));
      setResult(generated);
    } catch (generateError) {
      setError(generateError.message);
    } finally {
      setRun(null);
    }
  };

  const handleRemove = () => {
    const lookIds = new Set(result.looks.map((look) => look.id));
    const sequenceIds = new Set(result.sequences.map((sequence) => sequence.id));
    update((current) => ({
      ...current,
      scenes: current.scenes.filter((scene) => !lookIds.has(scene.id)),
      chases: current.chases.filter((chase) => !sequenceIds.has(chase.id)),
    }));
    setResult(null);
  };

  const cost = result ? (result.usage.inputTokens * PRICE_IN + result.usage.outputTokens * PRICE_OUT) / 1_000_000 : 0;

  return (
    <section className="view" aria-labelledby="ai-title">
      <div className="view-header">
        <div>
          <h1 className="view-title" id="ai-title">
            AI shows
          </h1>
          <p className="view-sub">
            Claude designs looks and sequences for <strong>{project.venue?.name ?? 'your venue'}</strong>, using
            everything its lights can do, with or without a song.
          </p>
        </div>
      </div>

      {hasKey === false ? (
        <div className="card card-pad ai-card" role="note">
          <p>To use AI shows, add your Anthropic API key in Settings first.</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('settings')}>
            <Icon name="gear" size={16} />
            Open Settings
          </button>
        </div>
      ) : null}

      <section className="card card-pad ai-card" aria-labelledby="ai-venue-title">
        <h2 className="section-title" id="ai-venue-title">
          The venue: {project.venue?.name ?? 'My venue'}
        </h2>
        {project.fixtures.length === 0 ? (
          <p className="view-sub">
            This venue has no lights yet. Add them in Setup: the AI designs for the lights you have.
          </p>
        ) : (
          <p className="view-sub">
            {plural(project.fixtures.length, 'light')}: {project.fixtures.map((fixture) => fixture.name).join(', ')}.
            Beyond colour and brightness they can do:{' '}
            {features.map((feature) => feature.label.toLowerCase()).join(', ')}. Switch venue at the top to design for
            another rig.
          </p>
        )}
      </section>

      <SongCard song={song} setSong={setSong} />
      <ChoicesCard choices={choices} setChoices={setChoices} features={features} hasSong={Boolean(song)} />

      <div className="card card-pad ai-card ai-go">
        <button
          type="button"
          className="btn btn-primary"
          disabled={Boolean(run) || hasKey !== true || project.fixtures.length === 0}
          onClick={handleGenerate}
        >
          <Icon name="sparkle" size={16} />
          {run ? 'Designing…' : 'Generate the show'}
        </button>
        {run ? (
          <span className="fixture-meta" role="status">
            Designing for {clock(elapsed)}. This usually takes one to three minutes.
          </span>
        ) : (
          <span className="fixture-meta">
            Uses your API key; each generation costs a little on your Anthropic account.
          </span>
        )}
      </div>

      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <section className="card card-pad ai-card ai-result" aria-labelledby="ai-result-title">
          <h2 className="section-title" id="ai-result-title">
            Added to your show
          </h2>
          {result.summary ? <p>{result.summary}</p> : null}
          <p className="eyebrow">{plural(result.looks.length, 'look')}</p>
          <ul className="ai-looks">
            {result.looks.map((look) => (
              <li key={look.id} className="ai-look">
                <span
                  className="ai-look-swatch"
                  aria-hidden="true"
                  style={{ background: averageColor(fixtureColors(project, patch, look.values)).css }}
                />
                {look.name}
              </li>
            ))}
          </ul>
          <p className="eyebrow">{plural(result.sequences.length, 'sequence')}</p>
          <ul className="ai-looks">
            {result.sequences.map((sequence) => (
              <li key={sequence.id} className="ai-look">
                <Icon name="chases" size={16} />
                {sequence.name}
                <span className="fixture-meta">
                  {sequence.steps.length > 0 ? `${plural(sequence.steps.length, 'step')} · ` : ''}
                  {plural(sequence.blocks.length, 'block')}
                  {sequence.tempo ? ` · ${sequence.tempo} BPM, follows the song` : ' · loops'}
                </span>
              </li>
            ))}
          </ul>
          <div className="toolbar">
            <button type="button" className="btn btn-primary" onClick={() => navigate('perform')}>
              <Icon name="bolt" size={16} />
              Play them on Perform
            </button>
            <button type="button" className="btn" onClick={() => navigate('chases')}>
              Open in Sequences
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleRemove}>
              <Icon name="trash" size={16} />
              Remove these
            </button>
          </div>
          <p className="fixture-meta">
            Used {result.usage.inputTokens.toLocaleString()} input and {result.usage.outputTokens.toLocaleString()}{' '}
            output tokens, about ${cost.toFixed(2)} at list prices.
          </p>
        </section>
      ) : null}
    </section>
  );
}
