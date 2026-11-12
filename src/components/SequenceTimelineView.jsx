// The Timeline view of a sequence: its chain of looks on a Looks lane, and free blocks drawn per light underneath, on a
// grid of beats (when it follows the tempo) or seconds. The Steps view edits the same sequence as a list; both change the
// same steps and blocks.
import { useEffect, useMemo, useRef, useState } from 'react';

import { controlsByFixture, mergeControls } from '../../shared/capabilities.js';
import { indexFixtureTypes } from '../../shared/patch.js';
import { BEATS_PER_BAR, MAX_SEQUENCE_UNITS, TIMELINE_BARS, sequenceLength, stepUnits } from '../../shared/timeline.js';
import { categoriesByFixture } from '../utils/deviceCategories.js';
import { fixtureColors, sceneGradient } from '../utils/sceneColors.js';
import { DEFAULT_STYLE, SNAPS, drawBlocks, repeatBlocks, shorteningLoss } from '../utils/timelineEdit.js';
import { BlockInspector } from './BlockInspector.jsx';
import { Icon } from './Icon.jsx';
import { TimelineGrid } from './TimelineGrid.jsx';
import { makeId } from '../utils/ids.js';

const STYLE_KEYS = Object.keys(DEFAULT_STYLE);

const barsLabel = (bars) => `${bars} ${bars === 1 ? 'bar' : 'bars'}`;
const round = (value) => Math.round(value * 1000) / 1000;

/**
 * Where a playing sequence is, worked out in the page from the moment it started and its pace (the tempo, or one unit a
 * second), so the playhead moves smoothly without a message for every frame.
 * @param {boolean} isPlaying
 * @param {number} perMinute units a minute: the tempo for beats, 60 for seconds
 * @param {number} length the sequence's length, where it loops
 * @returns {number | null}
 */
function usePlayhead(isPlaying, perMinute, length) {
  const [position, setPosition] = useState(/** @type {number | null} */ (null));
  const anchor = useRef({ at: 0, from: 0, perMinute });

  useEffect(() => {
    if (!isPlaying) {
      setPosition(null);
      return undefined;
    }
    anchor.current = { at: performance.now(), from: 0, perMinute: anchor.current.perMinute };
    let frame = requestAnimationFrame(function step(now) {
      const { at, from, perMinute: pace } = anchor.current;
      setPosition((from + ((now - at) / 60000) * pace) % length);
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, length]);

  // A tempo change carries on from where the playhead is, as the engine does.
  useEffect(() => {
    const now = performance.now();
    const { at, from, perMinute: pace } = anchor.current;
    anchor.current = { at: now, from: (from + ((now - at) / 60000) * pace) % length, perMinute };
  }, [perMinute, length]);

  return position;
}

/**
 * The steps laid out in time, for the Looks lane.
 * @returns {{ id: string, number: number, start: number, length: number, fade: number, label: string, background: string }[]}
 */
export function stepSegments(chase, project, patch) {
  let start = 0;
  return chase.steps.map((step, index) => {
    const { fade, hold } = stepUnits(step, chase.timing);
    const scene = project.scenes.find((candidate) => candidate.id === step.sceneId);
    const segment = {
      id: step.id,
      number: index + 1,
      start,
      length: Math.max(fade + hold, 0.0001),
      fade,
      label: scene?.name ?? 'Missing look',
      background: scene ? sceneGradient(fixtureColors(project, patch, scene.values)) : 'var(--surface-3)',
    };
    start += fade + hold;
    return segment;
  });
}

/**
 * @param {{ project: object, library: object[], patch: object, chase: import('../../shared/types.js').Chase,
 *   patchChase: (changes: object | ((chase: object) => object)) => void, live: object, isPlaying: boolean }} props
 */
export function SequenceTimelineView({ project, library = [], patch, chase, patchChase, live, isPlaying }) {
  const unit = chase.timing === 'beats' ? 'beats' : 'seconds';
  const [snap, setSnap] = useState(1);
  const [selectedBlockIds, setSelectedBlockIds] = useState(/** @type {string[]} */ ([]));
  const [selectedStepId, setSelectedStepId] = useState(/** @type {string | null} */ (null));
  const [style, setStyle] = useState(/** @type {Record<string, unknown>} */ ({}));
  const controlsById = useMemo(
    () => controlsByFixture(project, indexFixtureTypes(project, library)),
    [project, library],
  );
  const blocks = chase.blocks ?? [];
  const total = sequenceLength(chase);
  // The grid shows whole bars (or whole seconds), at least the whole sequence.
  const gridLength = unit === 'beats' ? Math.ceil(total / BEATS_PER_BAR) * BEATS_PER_BAR : Math.ceil(total);
  const playhead = usePlayhead(isPlaying, unit === 'beats' ? live.engine.bpm : 60, total);
  const segments = stepSegments(chase, project, patch);

  useEffect(() => {
    setSelectedBlockIds([]);
    setSelectedStepId(null);
  }, [chase.id]);

  const patchBlocks = (changesById) =>
    patchChase((item) => ({
      blocks: (item.blocks ?? []).map((block) =>
        changesById.has(block.id) ? { ...block, ...changesById.get(block.id) } : block,
      ),
    }));

  const handleDraw = (fixtureIds, span) => {
    const drawn = drawBlocks(fixtureIds, span, style, makeId);
    patchChase((item) => ({ blocks: [...(item.blocks ?? []), ...drawn] }));
    setSelectedBlockIds(drawn.map((block) => block.id));
    setSelectedStepId(null);
  };

  // For the keyboard: a block of one bar (or four seconds) at the first free place on the lane, or at the start.
  const handleAddToLane = (fixtureId) => {
    const taken = blocks.filter((block) => block.fixtureId === fixtureId);
    const free = [...Array(gridLength).keys()].find(
      (at) => !taken.some((block) => at >= block.start && at < block.start + block.length),
    );
    const start = free ?? 0;
    handleDraw([fixtureId], { start, length: Math.max(1, Math.min(4, gridLength - start)) });
  };

  const handleEdit = (changes) => {
    patchBlocks(new Map(selectedBlockIds.map((id) => [id, changes])));
    // New blocks are drawn in the look last chosen, so a run of blocks needs no repeated edits.
    const styleChanges = Object.fromEntries(Object.entries(changes).filter(([key]) => STYLE_KEYS.includes(key)));
    setStyle((current) => ({ ...current, ...styleChanges }));
  };

  // A setting (pan, gobo, fog…) changes on every selected block, leaving their other settings as they are.
  const handleSetting = (key, value, field) =>
    patchChase((item) => ({
      blocks: (item.blocks ?? []).map((block) => {
        if (!selectedBlockIds.includes(block.id)) {
          return block;
        }
        const next = { ...(block[field] ?? {}) };
        if (value === undefined) {
          delete next[key];
        } else {
          next[key] = value;
        }
        return { ...block, [field]: next };
      }),
    }));

  const handleDelete = (ids = selectedBlockIds) => {
    patchChase((item) => ({ blocks: (item.blocks ?? []).filter((block) => !ids.includes(block.id)) }));
    setSelectedBlockIds((current) => current.filter((id) => !ids.includes(id)));
  };

  // Repeat: copies of the selection carry on straight after it, and become the selection, so pressing again extends
  // the pattern further. The sequence grows to fit them, up to its longest.
  const handleRepeat = () => {
    const copies = repeatBlocks(
      blocks.filter((block) => selectedBlockIds.includes(block.id)),
      MAX_SEQUENCE_UNITS,
      makeId,
    );
    if (copies.length > 0) {
      patchChase((item) => ({ blocks: [...(item.blocks ?? []), ...copies] }));
      setSelectedBlockIds(copies.map((block) => block.id));
    }
  };

  const handleLength = (length) => {
    // Blocks past the new end are cut to fit, or removed when they start after it, so ask first. Steps are never cut:
    // the sequence is always at least as long as its looks.
    const { removed, cut } = shorteningLoss(blocks, length);
    if (removed + cut > 0) {
      const parts = [
        removed > 0 ? `remove ${removed} ${removed === 1 ? 'block' : 'blocks'}` : null,
        cut > 0 ? `shorten ${cut} ${cut === 1 ? 'block' : 'blocks'}` : null,
      ].filter(Boolean);
      const what = unit === 'beats' ? barsLabel(length / BEATS_PER_BAR) : `${length} seconds`;
      if (!window.confirm(`Making it ${what} will ${parts.join(' and ')}. Continue?`)) {
        return;
      }
    }
    patchChase((item) => ({
      length,
      blocks: (item.blocks ?? [])
        .filter((block) => block.start < length)
        .map((block) => ({ ...block, length: Math.min(block.length, length - block.start) })),
    }));
  };

  // Steps, edited from the Looks lane.
  const selectedStep = chase.steps.find((step) => step.id === selectedStepId) ?? null;
  const patchStep = (id, changes) =>
    patchChase((item) => ({ steps: item.steps.map((step) => (step.id === id ? { ...step, ...changes } : step)) }));
  /** @param {number} fade @param {number} hold in the sequence's units */
  const timingChanges = (fade, hold) =>
    unit === 'beats'
      ? { fadeBeats: round(Math.max(0, Math.min(64, fade))), holdBeats: round(Math.max(0, Math.min(64, hold))) }
      : {
          fadeMs: Math.round(Math.max(0, Math.min(600, fade)) * 1000),
          holdMs: Math.round(Math.max(0, Math.min(600, hold)) * 1000),
        };
  const handleResizeStep = (id, length) => {
    const step = chase.steps.find((candidate) => candidate.id === id);
    if (step) {
      const { fade } = stepUnits(step, chase.timing);
      patchStep(id, timingChanges(fade, Math.max(0, length - fade)));
    }
  };
  const handleAddStep = () => {
    if (project.scenes.length === 0) {
      return;
    }
    const last = chase.steps.at(-1);
    const lastIndex = last ? project.scenes.findIndex((scene) => scene.id === last.sceneId) : -1;
    const scene = project.scenes[(lastIndex + 1) % project.scenes.length];
    const timing = last ?? { fadeMs: 1000, holdMs: 2000, fadeBeats: 2, holdBeats: 4 };
    const step = {
      id: makeId(),
      sceneId: scene.id,
      fadeMs: timing.fadeMs,
      holdMs: timing.holdMs,
      fadeBeats: timing.fadeBeats,
      holdBeats: timing.holdBeats,
    };
    patchChase((item) => ({ steps: [...item.steps, step] }));
    setSelectedStepId(step.id);
    setSelectedBlockIds([]);
  };

  const selectedBlocks = blocks.filter((block) => selectedBlockIds.includes(block.id));
  const lengthBars = Math.ceil((chase.length ?? 0) / BEATS_PER_BAR);
  const step = selectedStep ? stepUnits(selectedStep, chase.timing) : null;
  const unitShort = unit === 'beats' ? 'beats' : 's';

  return (
    <div className="timeline-editor">
      <div className="toolbar">
        {unit === 'beats' ? (
          <label className="field">
            Length
            <select
              className="select"
              value={lengthBars}
              onChange={(event) => handleLength(Number(event.target.value) * BEATS_PER_BAR)}
            >
              <option value={0}>As long as its looks and blocks</option>
              {TIMELINE_BARS.map((bars) => (
                <option key={bars} value={bars}>
                  At least {barsLabel(bars)} ({bars * BEATS_PER_BAR} beats)
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field">
            Length (seconds, at least)
            <input
              className="input input-narrow"
              type="number"
              min="0"
              max={MAX_SEQUENCE_UNITS}
              value={chase.length ?? 0}
              onChange={(event) =>
                handleLength(Math.max(0, Math.min(MAX_SEQUENCE_UNITS, Number(event.target.value) || 0)))
              }
            />
          </label>
        )}
        <label className="field">
          Grid
          <select className="select" value={snap} onChange={(event) => setSnap(Number(event.target.value))}>
            {SNAPS.map((value) => (
              <option key={value} value={value}>
                {unit === 'beats' ? (value === 1 ? '1 beat' : `1/${1 / value} beat`) : `${value} s`}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={handleAddStep} disabled={project.scenes.length === 0}>
          <Icon name="plus" size={16} />
          Add step
        </button>
        <span className="fixture-meta">
          Runs {round(total)} {unit === 'beats' ? 'beats' : 'seconds'}
          {unit === 'beats' ? ', following the tempo' : ''}.
        </span>
      </div>

      {project.fixtures.length === 0 ? (
        <p className="view-sub">Add lights to your rig in Setup first: each light gets its own lane.</p>
      ) : (
        <div className="timeline-workspace">
          <TimelineGrid
            timeline={{ beats: gridLength, blocks }}
            fixtures={project.fixtures}
            categories={categoriesByFixture(project, library)}
            unit={unit}
            steps={segments}
            selectedStepId={selectedStepId}
            onSelectStep={(id) => {
              setSelectedStepId(id);
              setSelectedBlockIds([]);
            }}
            onResizeStep={handleResizeStep}
            snap={snap}
            selectedIds={selectedBlockIds}
            playheadBeat={playhead}
            onSelect={(ids) => {
              setSelectedBlockIds(ids);
              if (ids.length > 0) {
                setSelectedStepId(null);
              }
            }}
            onDraw={handleDraw}
            onChangeBlocks={patchBlocks}
            onDelete={handleDelete}
            onAddToLane={handleAddToLane}
          />
          {selectedStep ? (
            <div className="card card-pad inspector" role="region" aria-label="Step settings">
              <h2 className="section-title">Step {chase.steps.indexOf(selectedStep) + 1}</h2>
              <label className="field">
                Look
                <select
                  className="select"
                  value={selectedStep.sceneId}
                  onChange={(event) => patchStep(selectedStep.id, { sceneId: event.target.value })}
                >
                  {project.scenes.map((scene) => (
                    <option key={scene.id} value={scene.id}>
                      {scene.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="toolbar">
                <label className="field">
                  Fade ({unitShort})
                  <input
                    className="input input-narrow"
                    type="number"
                    min="0"
                    step={unit === 'beats' ? 0.25 : 0.1}
                    value={round(step.fade)}
                    onChange={(event) =>
                      patchStep(selectedStep.id, timingChanges(Number(event.target.value) || 0, step.hold))
                    }
                  />
                </label>
                <label className="field">
                  Hold ({unitShort})
                  <input
                    className="input input-narrow"
                    type="number"
                    min="0"
                    step={unit === 'beats' ? 0.25 : 0.1}
                    value={round(step.hold)}
                    onChange={(event) =>
                      patchStep(selectedStep.id, timingChanges(step.fade, Number(event.target.value) || 0))
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  patchChase((item) => ({ steps: item.steps.filter((entry) => entry.id !== selectedStep.id) }));
                  setSelectedStepId(null);
                }}
              >
                <Icon name="trash" size={16} />
                Remove step
              </button>
              <p className="fixture-meta">
                Drag the right edge of a look on the Looks lane to change how long it holds. Reorder steps in the Steps
                view.
              </p>
            </div>
          ) : (
            <BlockInspector
              blocks={selectedBlocks}
              beats={gridLength}
              snap={snap}
              controls={mergeControls(
                [...new Set(selectedBlocks.map((block) => block.fixtureId))].map(
                  (fixtureId) => controlsById.get(fixtureId) ?? [],
                ),
              )}
              onChange={handleEdit}
              onSetting={handleSetting}
              onDelete={() => handleDelete()}
              onRepeat={handleRepeat}
              canRepeat={repeatBlocks(selectedBlocks, MAX_SEQUENCE_UNITS, () => '').length > 0}
            />
          )}
        </div>
      )}
      <p className="view-sub">
        Blocks on a light replace its look while they run; where a light has no block, its look shows. Press Play, or
        play it from Perform.
      </p>
    </div>
  );
}
