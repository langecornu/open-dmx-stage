// Sequences drawn on a timeline: a list of timelines, and an editor with one lane per light. Blocks are drawn with the
// mouse, edited in the inspector, and played in a loop that follows the tempo.
import { useEffect, useRef, useState } from 'react';

import { BEATS_PER_BAR, TIMELINE_BARS } from '../../shared/timeline.js';
import {
  DEFAULT_STYLE,
  SNAPS,
  drawBlocks,
  repeatBlocks,
  shorteningLoss,
  timelineGradient,
} from '../utils/timelineEdit.js';
import { BlockInspector } from './BlockInspector.jsx';
import { EmptyState } from './EmptyState.jsx';
import { Icon } from './Icon.jsx';
import { TimelineGrid } from './TimelineGrid.jsx';

const STYLE_KEYS = Object.keys(DEFAULT_STYLE);

const barsLabel = (bars) => `${bars} ${bars === 1 ? 'bar' : 'bars'}`;

/**
 * Where the engine is in a playing timeline, worked out in the page from the moment it started and the tempo, so the
 * playhead moves smoothly without a message for every frame.
 * @param {boolean} isPlaying
 * @param {number} bpm
 * @param {number} beats
 * @returns {number | null}
 */
function usePlayhead(isPlaying, bpm, beats) {
  const [beat, setBeat] = useState(/** @type {number | null} */ (null));
  const anchor = useRef({ at: 0, beat: 0, bpm });

  useEffect(() => {
    if (!isPlaying) {
      setBeat(null);
      return undefined;
    }
    anchor.current = { at: performance.now(), beat: 0, bpm: anchor.current.bpm };
    let frame = requestAnimationFrame(function step(now) {
      const { at, beat: from, bpm: tempo } = anchor.current;
      setBeat((from + ((now - at) / 60000) * tempo) % beats);
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, beats]);

  // A tempo change carries on from where the playhead is, as the engine does.
  useEffect(() => {
    const now = performance.now();
    const { at, beat: from, bpm: tempo } = anchor.current;
    anchor.current = { at: now, beat: (from + ((now - at) / 60000) * tempo) % beats, bpm };
  }, [bpm, beats]);

  return beat;
}

export function TimelineSequences({ project, update, flush, live, selectedId, onSelectTimeline }) {
  const timelines = project.timelines ?? [];
  const timeline = timelines.find((candidate) => candidate.id === selectedId) ?? null;
  const [snap, setSnap] = useState(1);
  const [selectedBlockIds, setSelectedBlockIds] = useState(/** @type {string[]} */ ([]));
  const [style, setStyle] = useState(/** @type {Record<string, unknown>} */ ({}));
  const isPlaying = Boolean(timeline) && live.engine.activeTimelineId === timeline?.id;
  const playhead = usePlayhead(isPlaying, live.engine.bpm, timeline?.beats ?? 16);

  useEffect(() => setSelectedBlockIds([]), [selectedId]);

  const patchTimeline = (changes) =>
    update((current) => ({
      ...current,
      timelines: current.timelines.map((item) =>
        item.id === timeline.id ? { ...item, ...(typeof changes === 'function' ? changes(item) : changes) } : item,
      ),
    }));

  const patchBlocks = (changesById) =>
    patchTimeline((item) => ({
      blocks: item.blocks.map((block) =>
        changesById.has(block.id) ? { ...block, ...changesById.get(block.id) } : block,
      ),
    }));

  const handleDraw = (fixtureIds, span) => {
    const drawn = drawBlocks(fixtureIds, span, style, () => crypto.randomUUID());
    patchTimeline((item) => ({ blocks: [...item.blocks, ...drawn] }));
    setSelectedBlockIds(drawn.map((block) => block.id));
  };

  // For the keyboard: a block of one bar at the first beat where the lane is free, or at the start.
  const handleAddToLane = (fixtureId) => {
    const taken = timeline.blocks.filter((block) => block.fixtureId === fixtureId);
    const free = [...Array(timeline.beats).keys()].find(
      (beat) => !taken.some((block) => beat >= block.start && beat < block.start + block.length),
    );
    const start = free ?? 0;
    handleDraw([fixtureId], { start, length: Math.min(4, timeline.beats - start) });
  };

  const handleEdit = (changes) => {
    patchBlocks(new Map(selectedBlockIds.map((id) => [id, changes])));
    // New blocks are drawn in the look last chosen, so a run of blocks needs no repeated edits.
    const styleChanges = Object.fromEntries(Object.entries(changes).filter(([key]) => STYLE_KEYS.includes(key)));
    setStyle((current) => ({ ...current, ...styleChanges }));
  };

  const handleDelete = (ids = selectedBlockIds) => {
    patchTimeline((item) => ({ blocks: item.blocks.filter((block) => !ids.includes(block.id)) }));
    setSelectedBlockIds((current) => current.filter((id) => !ids.includes(id)));
  };

  const handlePlay = async () => {
    await flush();
    live.send({ type: 'timelineStart', timelineId: timeline.id });
  };

  const handleDuplicate = () => {
    const copy = {
      ...timeline,
      id: crypto.randomUUID(),
      name: `${timeline.name} copy`,
      blocks: timeline.blocks.map((block) => ({ ...block, id: crypto.randomUUID() })),
    };
    update((current) => ({ ...current, timelines: [...current.timelines, copy] }));
    onSelectTimeline(copy.id);
  };

  const handleDeleteTimeline = () => {
    update((current) => ({ ...current, timelines: current.timelines.filter((item) => item.id !== timeline.id) }));
    onSelectTimeline(null);
  };

  // Repeat: copies of the selection carry on straight after it, and become the selection, so pressing again extends
  // the pattern further.
  const handleRepeat = () => {
    const copies = repeatBlocks(
      timeline.blocks.filter((block) => selectedBlockIds.includes(block.id)),
      timeline.beats,
      () => crypto.randomUUID(),
    );
    if (copies.length > 0) {
      patchTimeline((item) => ({ blocks: [...item.blocks, ...copies] }));
      setSelectedBlockIds(copies.map((block) => block.id));
    }
  };

  const handleLength = (beats) => {
    // Blocks past the new end are cut to fit, or removed when they start after it, so ask first.
    const { removed, cut } = shorteningLoss(timeline.blocks, beats);
    if (removed + cut > 0) {
      const parts = [
        removed > 0 ? `remove ${removed} ${removed === 1 ? 'block' : 'blocks'}` : null,
        cut > 0 ? `shorten ${cut} ${cut === 1 ? 'block' : 'blocks'}` : null,
      ].filter(Boolean);
      if (!window.confirm(`Making it ${barsLabel(beats / BEATS_PER_BAR)} will ${parts.join(' and ')}. Continue?`)) {
        return;
      }
    }
    patchTimeline((item) => ({
      beats,
      blocks: item.blocks
        .filter((block) => block.start < beats)
        .map((block) => ({ ...block, length: Math.min(block.length, beats - block.start) })),
    }));
  };

  if (timelines.length === 0) {
    return (
      <EmptyState
        icon="chases"
        title="No timelines yet"
        hint="Press New sequence to start one, then drag across the lanes to draw coloured blocks."
      />
    );
  }

  const selectedBlocks = timeline ? timeline.blocks.filter((block) => selectedBlockIds.includes(block.id)) : [];

  return (
    <div className="split">
      <ul className="card list">
        {timelines.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="list-item"
              aria-current={item.id === selectedId}
              onClick={() => onSelectTimeline(item.id)}
            >
              <span className="list-thumb" aria-hidden="true" style={{ background: timelineGradient(item) }} />
              <span className="list-text">
                <span className="list-name">{item.name}</span>
                <span className="list-meta">
                  {barsLabel(item.beats / BEATS_PER_BAR)} · {item.blocks.length}{' '}
                  {item.blocks.length === 1 ? 'block' : 'blocks'}
                </span>
              </span>
              {live.engine.activeTimelineId === item.id ? <span className="badge badge-live">Playing</span> : null}
            </button>
          </li>
        ))}
      </ul>

      {timeline ? (
        <div className="card card-pad chase-editor timeline-editor">
          <div className="toolbar">
            <label className="field">
              Name
              <input
                className="input"
                value={timeline.name}
                maxLength={80}
                onChange={(event) => patchTimeline({ name: event.target.value || timeline.name })}
              />
            </label>
            <label className="field">
              Length
              <select
                className="select"
                value={timeline.beats}
                onChange={(event) => handleLength(Number(event.target.value))}
              >
                {(TIMELINE_BARS.includes(timeline.beats / BEATS_PER_BAR)
                  ? TIMELINE_BARS
                  : [...TIMELINE_BARS, timeline.beats / BEATS_PER_BAR].sort((a, b) => a - b)
                ).map((bars) => (
                  <option key={bars} value={bars * BEATS_PER_BAR}>
                    {barsLabel(bars)} ({bars * BEATS_PER_BAR} beats)
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Grid
              <select className="select" value={snap} onChange={(event) => setSnap(Number(event.target.value))}>
                {SNAPS.map((value) => (
                  <option key={value} value={value}>
                    {value === 1 ? '1 beat' : `1/${1 / value} beat`}
                  </option>
                ))}
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
                disabled={timeline.blocks.length === 0}
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
            <button type="button" className="btn btn-danger" onClick={handleDeleteTimeline}>
              <Icon name="trash" size={16} />
              Delete
            </button>
          </div>

          {project.fixtures.length === 0 ? (
            <p className="view-sub">Add lights to your rig in Setup first: each light gets its own lane.</p>
          ) : (
            <div className="timeline-workspace">
              <TimelineGrid
                timeline={timeline}
                fixtures={project.fixtures}
                snap={snap}
                selectedIds={selectedBlockIds}
                playheadBeat={playhead}
                onSelect={setSelectedBlockIds}
                onDraw={handleDraw}
                onChangeBlocks={patchBlocks}
                onDelete={handleDelete}
                onAddToLane={handleAddToLane}
              />
              <BlockInspector
                blocks={selectedBlocks}
                beats={timeline.beats}
                snap={snap}
                onChange={handleEdit}
                onDelete={() => handleDelete()}
                onRepeat={handleRepeat}
                canRepeat={repeatBlocks(selectedBlocks, timeline.beats, () => '').length > 0}
              />
            </div>
          )}
          <p className="view-sub">
            Plays in a loop and follows the tempo: a faster tempo plays it faster. Press Play, or play it from Perform.
          </p>
        </div>
      ) : (
        <EmptyState icon="chases" title="Pick a timeline" hint="Choose one on the left or create a new one." />
      )}
    </div>
  );
}
