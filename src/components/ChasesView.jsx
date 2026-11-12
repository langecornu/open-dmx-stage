// Sequences: each is a chain of looks with fades (its steps) and free blocks drawn per light over them. Two views of the
// same sequence, chosen with a toggle: Steps (the chain as a list, with the blocks that cover each step) and Timeline
// (the looks and the blocks laid out in time). A sequence can be exported to a file of its own and imported into
// another show, where its lights are matched to that rig.
import { useState } from 'react';

import { sequenceLength, stepUnits } from '../../shared/timeline.js';
import { checkSequenceFile, importSequence, sequenceDownload } from '../utils/sequenceFile.js';
import { SWATCHES, spanLabel, timelineGradient } from '../utils/timelineEdit.js';

import { averageColor, fixtureColors, sceneGradient } from '../utils/sceneColors.js';
import { stepDurations } from '../utils/tempo.js';
import { SequenceStepRow } from './SequenceStepRow.jsx';
import { SequenceTimeline } from './SequenceTimeline.jsx';
import { SequenceTimelineView } from './SequenceTimelineView.jsx';
import { EmptyState } from './EmptyState.jsx';
import { Icon } from './Icon.jsx';
import { makeId } from '../utils/ids.js';

const formatLength = (ms) => {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
};

const MODE_KEY = 'odmx-sequence-mode';
const MODES = [
  {
    id: 'steps',
    label: 'Steps',
    hint: 'Chain your looks with timed fades. Blocks drawn in the Timeline view show under the steps they cover.',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    hint: 'The same sequence in time: its looks on top, and blocks drawn for each light over them.',
  },
];

const round = (value) => Math.round(value * 100) / 100;

/** The blocks that cover part of a step, in words, for the Steps view. */
function stepOverlays(chase, project, start, end) {
  const unit = chase.timing === 'beats' ? 'beats' : 'seconds';
  return (chase.blocks ?? [])
    .filter((block) => block.start < end && block.start + block.length > start)
    .map((block) => {
      const light = project.fixtures.find((fixture) => fixture.id === block.fixtureId)?.name ?? 'A removed light';
      const colour = SWATCHES.find((swatch) => swatch.hex === block.color.toLowerCase())?.name ?? block.color;
      const extras = [block.transition === 'fade' ? 'fade' : null, block.effect === 'strobe' ? 'strobe' : null]
        .filter(Boolean)
        .join(', ');
      return `${light} ${colour.toLowerCase()}${extras ? ` (${extras})` : ''}, ${spanLabel(block.start, block.start + block.length, unit)}`;
    });
}

/** Offers a file to save, without leaving the page. */
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function loadMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'timeline' ? 'timeline' : 'steps';
  } catch {
    return 'steps';
  }
}

export function ChasesView({ project, patch, update, flush, live, library = [] }) {
  const [mode, setMode] = useState(loadMode);
  const [selectedId, setSelectedId] = useState(project.chases[0]?.id ?? null);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
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

  // Changes to the selected sequence, from either view: an object, or a function of the sequence as it is.
  const patchSelected = (changes) =>
    update((current) => ({
      ...current,
      chases: current.chases.map((item) =>
        item.id === chase.id ? { ...item, ...(typeof changes === 'function' ? changes(item) : changes) } : item,
      ),
    }));

  const handleExport = () => {
    const { name, text } = sequenceDownload(project, chase, patch);
    download(name, text);
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setMessage('That file is not a sequence file (it is not JSON).');
      return;
    }
    const problem = checkSequenceFile(parsed);
    if (problem) {
      setMessage(problem);
      return;
    }
    const { project: next, sequenceId, report } = importSequence(project, parsed, makeId);
    update(() => next);
    setSelectedId(sequenceId);
    const parts = [`Imported “${parsed.sequence.name}”.`];
    if (report.newLooks + report.reusedLooks > 0) {
      parts.push(
        `${report.newLooks} new ${report.newLooks === 1 ? 'look' : 'looks'}, ${report.reusedLooks} already in your show.`,
      );
    }
    if (report.unmatched.length > 0) {
      parts.push(
        `No matching light for ${report.unmatched.join(', ')}` +
          (report.droppedBlocks > 0
            ? `, so ${report.droppedBlocks} ${report.droppedBlocks === 1 ? 'block was' : 'blocks were'} left out.`
            : '.'),
      );
    }
    setMessage(parts.join(' '));
  };

  const handleCreate = () => {
    // From the Timeline view a new sequence follows the tempo, as drawing in beats is the point of it.
    const created = {
      id: makeId(),
      name: `Sequence ${project.chases.length + 1}`,
      loop: true,
      timing: mode === 'timeline' ? 'beats' : 'seconds',
      steps: [],
      blocks: [],
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
          id: makeId(),
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
    steps.splice(index + 1, 0, { ...chase.steps[index], id: makeId() });
    patchChase(chase.id, { steps });
  };
  const handleDuplicate = () => {
    const copy = {
      ...chase,
      id: makeId(),
      name: `${chase.name} copy`,
      steps: chase.steps.map((step) => ({ ...step, id: makeId() })),
      blocks: (chase.blocks ?? []).map((block) => ({ ...block, id: makeId() })),
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
    <section className={mode === 'timeline' ? 'view view-wide' : 'view'} aria-labelledby="chases-title">
      <div className="view-header">
        <div>
          <h1 className="view-title" id="chases-title">
            Sequences
          </h1>
          <p className="view-sub">{MODES.find((item) => item.id === mode).hint}</p>
        </div>
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="View">
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
          <label className="btn">
            <Icon name="upload" />
            Import sequence
            <input className="sr-only" type="file" accept=".json,application/json" onChange={handleImport} />
          </label>
          <button type="button" className="btn btn-primary" onClick={handleCreate}>
            <Icon name="plus" />
            New sequence
          </button>
        </div>
      </div>
      {message ? (
        <p className="view-sub" role="status">
          {message}
        </p>
      ) : null}

      {project.chases.length === 0 ? (
        <EmptyState
          icon="chases"
          title="No sequences yet"
          hint="Press New sequence: chain your looks in Steps, or draw blocks for each light in Timeline."
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
                      background:
                        item.steps.length === 0
                          ? timelineGradient({ blocks: item.blocks ?? [] })
                          : sceneGradient(
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
                      {item.steps.length > 0 || (item.blocks ?? []).length === 0
                        ? `${item.steps.length} ${item.steps.length === 1 ? 'step' : 'steps'} · `
                        : ''}
                      {(item.blocks ?? []).length > 0
                        ? `${item.blocks.length} ${item.blocks.length === 1 ? 'block' : 'blocks'} · `
                        : ''}
                      {item.timing === 'beats'
                        ? `${round(sequenceLength(item))} beats`
                        : formatLength(
                            item.steps.reduce((sum, step) => {
                              const timed = stepDurations(step, item.timing, live.engine.bpm);
                              return sum + timed.fadeMs + timed.holdMs;
                            }, 0) || sequenceLength(item) * 1000,
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
                    disabled={chase.steps.length === 0 && (chase.blocks ?? []).length === 0}
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
                <button type="button" className="btn" onClick={handleExport}>
                  <Icon name="upload" size={16} />
                  Export
                </button>
                <button type="button" className="btn btn-danger" onClick={handleDelete}>
                  <Icon name="trash" size={16} />
                  Delete
                </button>
              </div>

              {mode === 'timeline' ? (
                <SequenceTimelineView
                  project={project}
                  library={library}
                  patch={patch}
                  chase={chase}
                  patchChase={patchSelected}
                  live={live}
                  isPlaying={Boolean(isPlaying)}
                />
              ) : (
                <>
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
                  {chase.steps.map((step, index) => {
                    const start = chase.steps.slice(0, index).reduce((sum, before) => {
                      const units = stepUnits(before, chase.timing);
                      return sum + units.fade + units.hold;
                    }, 0);
                    const units = stepUnits(step, chase.timing);
                    const overlays = stepOverlays(chase, project, start, start + units.fade + units.hold);
                    return (
                      <div key={step.id} className="step-with-overlays">
                        <SequenceStepRow
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
                        {overlays.length > 0 ? <p className="step-overlays">+ {overlays.join('; ')}</p> : null}
                      </div>
                    );
                  })}
                  <div>
                    <button
                      type="button"
                      className="btn"
                      onClick={handleAddStep}
                      disabled={project.scenes.length === 0}
                    >
                      <Icon name="plus" size={16} />
                      Add step
                    </button>
                    {project.scenes.length === 0 ? <span className="fixture-meta"> Save a look first.</span> : null}
                  </div>
                </>
              )}
            </div>
          ) : (
            <EmptyState icon="chases" title="Pick a sequence" hint="Choose one on the left or create a new one." />
          )}
        </div>
      )}
    </section>
  );
}
