// AI shows: Claude designs looks and sequences for the venue you are at, using everything its lights can do. Leave every
// choice to the AI, or steer it: a mood, the energy, colours to use more, less or never, and how much of each thing the
// lights can do (movement, gobos, smoke…; only what this venue has is offered). Optionally pick a song: its tempo,
// first downbeat and energy map are worked out in this browser, and only those numbers are sent, so one sequence
// follows the song section by section. The lights must have their places on the stage first (the AI uses them for chases
// in order, mirror pairs and crossing beams), arranged in the stage view, which opens here. The new looks and sequences
// are added to the show, marked as made by AI.
import { useEffect, useMemo, useState } from 'react';

import {
  AI_MODELS,
  DEFAULT_AI_MODEL,
  aiModel,
  costOf,
  estimateCost,
  formatPrice,
  formatPriceRange,
} from '../../shared/aiModels.js';
import { venueFeatures } from '../../shared/aiShow.js';
import { RIG_SHAPE_LABELS, rigOrDefault, unplacedLights } from '../../shared/stageRig.js';
import { api } from '../api.js';
import { averageColor, fixtureColors } from '../utils/sceneColors.js';
import { formatTime, plural } from '../utils/format.js';
import { AiChoicesCard } from './AiChoicesCard.jsx';
import { AiModelPicker } from './AiModelPicker.jsx';
import { AiSongCard } from './AiSongCard.jsx';
import { Icon } from './Icon.jsx';
import { Visualizer } from './Visualizer.jsx';

const MODEL_KEY = 'odmx-ai-model';

/** The model chosen last time in this browser, or the default. */
function savedModel() {
  try {
    const saved = localStorage.getItem(MODEL_KEY);
    return AI_MODELS.some((model) => model.id === saved) ? /** @type {string} */ (saved) : DEFAULT_AI_MODEL;
  } catch {
    return DEFAULT_AI_MODEL; // storage blocked: start from the default each time
  }
}

export function AiShowView({ project, library, patch, update, flush, navigate, live }) {
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
  const [modelId, setModelId] = useState(savedModel);
  const [run, setRun] = useState(/** @type {{ startedAt: number } | null} */ (null));
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [result, setResult] = useState(null);
  const [isArranging, setIsArranging] = useState(false);
  const features = useMemo(() => venueFeatures(project, library), [project, library]);
  const unplaced = unplacedLights(project.fixtures);
  const rig = rigOrDefault(project.rig);

  useEffect(() => {
    let isCurrent = true;
    api
      .getAiSettings()
      .then((status) => isCurrent && setHasKey(status.hasKey))
      .catch(() => isCurrent && setHasKey(false));
    return () => {
      isCurrent = false;
    };
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
        model: modelId,
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

  const cost = result ? costOf(result.usage, result.model ?? modelId) : 0;
  const chooseModel = (id) => {
    setModelId(id);
    try {
      localStorage.setItem(MODEL_KEY, id);
    } catch {
      // Storage blocked: the choice holds until the page is closed.
    }
  };
  const estimateRequest = {
    lights: project.fixtures.length,
    looks: choices.looks,
    sequences: choices.sequences,
    bars: choices.bars,
    song,
  };

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
        {project.fixtures.length === 0 ? null : unplaced.length > 0 ? (
          <div className="ai-place" role="note">
            <p>
              <strong>Where are the lights?</strong>{' '}
              {unplaced.length === project.fixtures.length
                ? 'None of them has a place on the stage yet.'
                : `${plural(unplaced.length, 'light')} (${unplaced.map((fixture) => fixture.name).join(', ')}) ${unplaced.length === 1 ? 'has' : 'have'} no place on the stage yet.`}{' '}
              Put them where they really are, so the AI can chase them in order, mirror pairs and cross beams.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setIsArranging(true)}>
              <Icon name="sliders" size={16} />
              Arrange the lights
            </button>
          </div>
        ) : (
          <div className="ai-place">
            <p className="view-sub">
              Every light has its place: {RIG_SHAPE_LABELS[rig.shape].toLowerCase()}, {rig.width} × {rig.depth} m.
            </p>
            <button type="button" className="btn btn-ghost" onClick={() => setIsArranging(true)}>
              <Icon name="sliders" size={16} />
              Arrange the lights
            </button>
          </div>
        )}
      </section>

      <AiSongCard song={song} setSong={setSong} />
      <AiChoicesCard choices={choices} setChoices={setChoices} features={features} hasSong={Boolean(song)} />

      <div className="card card-pad ai-card ai-go">
        <AiModelPicker value={modelId} onChange={chooseModel} request={estimateRequest} disabled={Boolean(run)} />
        <button
          type="button"
          className="btn btn-primary"
          disabled={Boolean(run) || hasKey !== true || project.fixtures.length === 0 || unplaced.length > 0}
          onClick={handleGenerate}
        >
          <Icon name="sparkle" size={16} />
          {run ? 'Designing…' : 'Generate the show'}
        </button>
        {run ? (
          <span className="fixture-meta" role="status">
            Designing for {formatTime(elapsed)}. This usually takes one to three minutes.
          </span>
        ) : unplaced.length > 0 && project.fixtures.length > 0 ? (
          <span className="fixture-meta">Place the lights on the stage first, above.</span>
        ) : (
          <span className="fixture-meta">
            {aiModel(modelId).name}, {formatPriceRange(estimateCost(estimateRequest, modelId))} on your Anthropic
            account.
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
            output tokens on {aiModel(result.model ?? modelId).name}, {formatPrice(cost)} at list prices.
          </p>
        </section>
      ) : null}

      {live ? (
        <Visualizer
          isOpen={isArranging}
          onClose={() => setIsArranging(false)}
          project={project}
          library={library}
          patch={patch}
          update={update}
          live={live}
          flush={flush}
          startArranging
        />
      ) : null}
    </section>
  );
}
