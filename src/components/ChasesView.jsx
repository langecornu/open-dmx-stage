// Sequences, made one of two ways, chosen with a toggle: Steps (a chain of looks with fade and hold times) or Timeline
// (coloured blocks drawn per light on a grid of beats). Both play from here and from Perform.
import { useState } from 'react';

import { newTimeline } from '../utils/timelineEdit.js';

import { averageColor, fixtureColors, sceneGradient } from '../utils/sceneColors.js';
import { stepDurations } from '../utils/tempo.js';
import { SequenceStepRow } from './SequenceStepRow.jsx';
import { SequenceTimeline } from './SequenceTimeline.jsx';
import { TimelineSequences } from './TimelineSequences.jsx';
import { EmptyState } from './EmptyState.jsx';
import { Icon } from './Icon.jsx';

const formatLength = (ms) => {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
};

const MODE_KEY = 'odmx-sequence-mode';
const MODES = [
  { id: 'steps', label: 'Steps', hint: 'Chain your looks into a show with timed fades.' },
  { id: 'timeline', label: 'Timeline', hint: 'Draw coloured blocks for each light on a grid of beats.' },
];

function loadMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'timeline' ? 'timeline' : 'steps';
  } catch {
    return 'steps';
  }
}

export function ChasesView({ project, patch, update, flush, live }) {
  const [mode, setMode] = useState(loadMode);
  const [timelineId, setTimelineId] = useState(project.timelines?.[0]?.id ?? null);
  const [selectedId, setSelectedId] = useState(project.chases[0]?.id ?? null);
  const chase = project.chases.find((candidate) => candidate.id === selectedId) ?? null;
  const isPlaying = chase && live.engine.activeChaseId === chase.id;

  const patchChase = (id, changes) =>
    update((current) => ({ ...current, chases: current.chases.map((c) => (c.id === id ? { ...c, ...changes } : c)) }));

  const handlePlay = async () => {
    await flush();
    live.send({ type: 'chaseStart', chaseId: chase.id });
  };

  const changeMode = (next) => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // A remembered choice is a convenience; private windows may refuse it.
    }
  };

  const handleCreate = () => {
    if (mode === 'timeline') {
      const created = newTimeline(project.timelines?.length ?? 0, () => crypto.randomUUID());
      update((current) => ({ ...current, timelines: [...(current.timelines ?? []), created] }));
      setTimelineId(created.id);
      return;
    }
    const created = {
      id: crypto.randomUUID(),
      name: `Sequence ${project.chases.length + 1}`,
      loop: true,
      timing: 'seconds',
      steps: [],
    };
    update((current) => ({ ...current, chases: [...current.chases, created] }));
    setSelectedId(created.id);
  };
  const handleDelete = () => {
    update((current) => ({ ...current, chases: current.chases.filter((c) => c.id !== chase.id) }));
    setSelectedId(null);
  };
  // A new step carries on from the last one: the next look in the list, with the same fade and hold, so building a
  // sequence is a run of clicks instead of a run of edits.
  const handleAddStep = () => {
    if (project.scenes.length === 0) {
      return;
    }
    const last = chase.steps.at(-1);
    const lastIndex = last ? project.scenes.findIndex((scene) => scene.id === last.sceneId) : -1;
    const scene = project.scenes[(lastIndex + 1) % project.scenes.length];
    const timing = last ?? { fadeMs: 1000, holdMs: 2000, fadeBeats: 2, holdBeats: 4 };
    patchChase(chase.id, {
      steps: [
        ...chase.steps,
        {
          id: crypto.randomUUID(),
          sceneId: scene.id,
          fadeMs: timing.fadeMs,
          holdMs: timing.holdMs,
          fadeBeats: timing.fadeBeats,
          holdBeats: timing.holdBeats,
        },
      ],
    });
  };
  const handleDuplicateStep = (index) => {
    const steps = [...chase.steps];
    steps.splice(index + 1, 0, { ...chase.steps[index], id: crypto.randomUUID() });
    patchChase(chase.id, { steps });
  };
  const handleDuplicate = () => {
    const copy = {
      ...chase,
      id: crypto.randomUUID(),
      name: `${chase.name} copy`,
      steps: chase.steps.map((step) => ({ ...step, id: crypto.randomUUID() })),
    };
    update((current) => ({ ...current, chases: [...current.chases, copy] }));
    setSelectedId(copy.id);
  };
  const handleStep = (index, changes) =>
    patchChase(chase.id, { steps: chase.steps.map((step, i) => (i === index ? { ...step, ...changes } : step)) });
  const handleRemoveStep = (index) => patchChase(chase.id, { steps: chase.steps.filter((_, i) => i !== index) });
  const handleMove = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= chase.steps.length) {
      return;
    }
    const steps = [...chase.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    patchChase(chase.id, { steps });
  };

  return (
    <section className="view" aria-labelledby="chases-title">
      <div className="view-header">
        <div>
          <h1 className="view-title" id="chases-title">
            Sequences
          </h1>
          <p className="view-sub">{MODES.find((item) => item.id === mode).hint}</p>
        </div>
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="How to make sequences">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                className="segmented-option"
                aria-pressed={mode === item.id}
                onClick={() => changeMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={handleCreate}>
            <Icon name="plus" />
            New sequence
          </button>
        </div>
      </div>

      {mode === 'timeline' ? (
        <TimelineSequences
          project={project}
          update={update}
          flush={flush}
          live={live}
          selectedId={timelineId}
          onSelectTimeline={setTimelineId}
        />
      ) : project.chases.length === 0 ? (
        <EmptyState
          icon="chases"
          title="No sequences yet"
          hint="Save a few looks first, then chain them into a sequence."
        />
      ) : (
        <div className="split">
          <ul className="card list">
            {project.chases.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="list-item"
                  aria-current={item.id === selectedId}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span
                    className="list-thumb"
                    aria-hidden="true"
                    style={{
                      background: sceneGradient(
                        item.steps.map((step) =>
                          averageColor(
                            fixtureColors(
                              project,
                              patch,
                              project.scenes.find((scene) => scene.id === step.sceneId)?.values ?? {},
                            ),
                          ),
                        ),
                      ),
                    }}
                  />
                  <span className="list-text">
                    <span className="list-name">{item.name}</span>
                    <span className="list-meta">
                      {item.steps.length} {item.steps.length === 1 ? 'step' : 'steps'} ·{' '}
                      {formatLength(
                        item.steps.reduce((sum, step) => {
                          const timed = stepDurations(step, item.timing, live.engine.bpm);
                          return sum + timed.fadeMs + timed.holdMs;
                        }, 0),
                      )}
                    </span>
                  </span>
                  {live.engine.activeChaseId === item.id ? <span className="badge badge-live">Playing</span> : null}
                </button>
              </li>
            ))}
          </ul>

          {chase ? (
            <div className="card card-pad chase-editor">
              <div className="toolbar">
                <label className="field">
                  Name
                  <input
                    className="input"
                    value={chase.name}
                    maxLength={80}
                    onChange={(e) => patchChase(chase.id, { name: e.target.value || chase.name })}
                  />
                </label>
                <label className="pill">
                  <input
                    type="checkbox"
                    checked={chase.loop}
                    onChange={(e) => patchChase(chase.id, { loop: e.target.checked })}
                  />
                  Loop
                </label>
                <label className="field">
                  Timing
                  <select
                    className="select"
                    value={chase.timing}
                    onChange={(event) => patchChase(chase.id, { timing: event.target.value })}
                  >
                    <option value="seconds">Seconds</option>
                    <option value="beats">Beats (follows the tempo)</option>
                  </select>
                </label>
                {isPlaying ? (
                  <button type="button" className="btn" onClick={() => live.send({ type: 'chaseStop' })}>
                    <Icon name="stop" size={16} />
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={chase.steps.length === 0}
                    onClick={handlePlay}
                  >
                    <Icon name="chases" size={16} />
                    Play
                  </button>
                )}
                <button type="button" className="btn" onClick={handleDuplicate}>
                  <Icon name="copy" size={16} />
                  Duplicate
                </button>
                <button type="button" className="btn btn-danger" onClick={handleDelete}>
                  <Icon name="trash" size={16} />
                  Delete
                </button>
              </div>

              {chase.steps.length > 0 ? (
                <SequenceTimeline
                  chase={chase}
                  project={project}
                  patch={patch}
                  playingIndex={isPlaying ? live.engine.chaseStep : null}
                  bpm={live.engine.bpm}
                />
              ) : null}
              {chase.steps.length > 0 ? (
                <div className="step-row step-head" aria-hidden="true">
                  <span />
                  <span />
                  <span>Look</span>
                  <span>{chase.timing === 'beats' ? 'Fade (beats)' : 'Fade (s)'}</span>
                  <span>{chase.timing === 'beats' ? 'Hold (beats)' : 'Hold (s)'}</span>
                  <span />
                </div>
              ) : null}
              {chase.steps.map((step, index) => (
                <SequenceStepRow
                  key={step.id}
                  step={step}
                  index={index}
                  isPlaying={Boolean(isPlaying) && live.engine.chaseStep === index}
                  timing={chase.timing}
                  scenes={project.scenes}
                  thumbnail={sceneGradient(
                    fixtureColors(
                      project,
                      patch,
                      project.scenes.find((scene) => scene.id === step.sceneId)?.values ?? {},
                    ),
                  )}
                  onChange={handleStep}
                  onMove={handleMove}
                  onRemove={handleRemoveStep}
                  onDuplicate={handleDuplicateStep}
                />
              ))}
              <div>
                <button type="button" className="btn" onClick={handleAddStep} disabled={project.scenes.length === 0}>
                  <Icon name="plus" size={16} />
                  Add step
                </button>
                {project.scenes.length === 0 ? <span className="fixture-meta"> Save a look first.</span> : null}
              </div>
            </div>
          ) : (
            <EmptyState icon="chases" title="Pick a sequence" hint="Choose one on the left or create a new one." />
          )}
        </div>
      )}
    </section>
  );
}
