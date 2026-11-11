// The timeline grid: a ruler of beats and bars, then one lane per light. Drag across beats (and across lanes) to draw a
// block on each light covered; drag a block to move it, or its right edge to change its length. A block is also a
// button: click to select it (Shift to add to the selection), arrows to move it, Shift and arrows to change its
// length, Delete to remove it.
import { useRef, useState } from 'react';

import {
  beatLabel,
  blockBackground,
  clampLength,
  describeBlock,
  dragSpan,
  moveBlocks,
  snapNearest,
} from '../utils/timelineEdit.js';

export function TimelineGrid({
  timeline,
  fixtures,
  snap,
  selectedIds,
  playheadBeat,
  onSelect,
  onDraw,
  onChangeBlocks,
  onDelete,
  onAddToLane,
}) {
  const trackRefs = useRef(/** @type {(HTMLDivElement | null)[]} */ ([]));
  const [drag, setDrag] = useState(/** @type {any} */ (null));
  const { beats } = timeline;
  const selected = new Set(selectedIds);

  // Where the pointer is, in beats and lanes, measured against the lane tracks (all the same width).
  const beatAt = (clientX) => {
    const rect = trackRefs.current.find(Boolean)?.getBoundingClientRect();
    if (!rect || rect.width === 0) {
      return 0;
    }
    return Math.max(0, Math.min(beats, ((clientX - rect.left) / rect.width) * beats));
  };
  const laneAt = (clientY) => {
    let nearest = 0;
    trackRefs.current.forEach((track, index) => {
      const rect = track?.getBoundingClientRect();
      if (rect && clientY >= rect.top) {
        nearest = index;
      }
    });
    return nearest;
  };

  const startDraw = (event, laneIndex) => {
    if (event.button !== 0 || event.target !== event.currentTarget) {
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const beat = beatAt(event.clientX);
    setDrag({ kind: 'draw', fromLane: laneIndex, toLane: laneIndex, fromBeat: beat, toBeat: beat, moved: false });
  };

  const startBlockDrag = (event, block, kind) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const isSelected = selected.has(block.id);
    if (event.shiftKey) {
      onSelect(isSelected ? selectedIds.filter((id) => id !== block.id) : [...selectedIds, block.id]);
      return;
    }
    const ids = isSelected ? selectedIds : [block.id];
    if (!isSelected) {
      onSelect(ids);
    }
    setDrag({ kind, ids, blockId: block.id, fromBeat: beatAt(event.clientX), delta: 0 });
  };

  const handleMove = (event) => {
    if (!drag) {
      return;
    }
    const beat = beatAt(event.clientX);
    if (drag.kind === 'draw') {
      setDrag({ ...drag, toBeat: beat, toLane: laneAt(event.clientY), moved: true });
    } else {
      setDrag({ ...drag, delta: snapNearest(beat - drag.fromBeat, snap) });
    }
  };

  const handleUp = () => {
    if (!drag) {
      return;
    }
    if (drag.kind === 'draw') {
      if (drag.moved) {
        const lanes = fixtures
          .slice(Math.min(drag.fromLane, drag.toLane), Math.max(drag.fromLane, drag.toLane) + 1)
          .map((fixture) => fixture.id);
        onDraw(lanes, dragSpan(drag.fromBeat, drag.toBeat, snap, beats));
      } else {
        onSelect([]); // a click on an empty lane clears the selection
      }
    } else if (drag.delta !== 0) {
      commitDrag(drag);
    }
    setDrag(null);
  };

  const commitDrag = (finished) => {
    const blocks = timeline.blocks.filter((block) => finished.ids.includes(block.id));
    if (finished.kind === 'move') {
      const starts = moveBlocks(blocks, finished.delta, beats);
      onChangeBlocks(new Map([...starts].map(([id, start]) => [id, { start }])));
    } else {
      const block = timeline.blocks.find((candidate) => candidate.id === finished.blockId);
      onChangeBlocks(new Map([[block.id, { length: clampLength(block, block.length + finished.delta, beats) }]]));
    }
  };

  // What a block looks like while it is being dragged, before the change is saved.
  const preview = (block) => {
    if (!drag || drag.kind === 'draw' || drag.delta === 0) {
      return block;
    }
    if (drag.kind === 'move' && drag.ids.includes(block.id)) {
      const moved = moveBlocks(
        timeline.blocks.filter((candidate) => drag.ids.includes(candidate.id)),
        drag.delta,
        beats,
      );
      return { ...block, start: moved.get(block.id) };
    }
    if (drag.kind === 'resize' && drag.blockId === block.id) {
      return { ...block, length: clampLength(block, block.length + drag.delta, beats) };
    }
    return block;
  };

  const handleBlockKey = (event, block) => {
    const step = event.key === 'ArrowRight' ? snap : event.key === 'ArrowLeft' ? -snap : 0;
    const ids = selected.has(block.id) ? selectedIds : [block.id];
    if (step !== 0) {
      event.preventDefault();
      if (event.shiftKey) {
        onChangeBlocks(
          new Map(
            timeline.blocks
              .filter((candidate) => ids.includes(candidate.id))
              .map((candidate) => [candidate.id, { length: clampLength(candidate, candidate.length + step, beats) }]),
          ),
        );
      } else {
        const starts = moveBlocks(
          timeline.blocks.filter((candidate) => ids.includes(candidate.id)),
          step,
          beats,
        );
        onChangeBlocks(new Map([...starts].map(([id, start]) => [id, { start }])));
      }
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onDelete(ids);
    }
  };

  const ghost = drag?.kind === 'draw' && drag.moved ? dragSpan(drag.fromBeat, drag.toBeat, snap, beats) : null;
  const ghostLanes = ghost ? [Math.min(drag.fromLane, drag.toLane), Math.max(drag.fromLane, drag.toLane)] : null;
  const pct = (beat) => `${(beat / beats) * 100}%`;

  return (
    <div
      className="tl"
      role="group"
      aria-label={`Timeline, ${beats} beats`}
      style={{ '--tl-beats': beats }}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={() => setDrag(null)}
    >
      <div className="tl-row tl-ruler" aria-hidden="true">
        <span className="tl-label" />
        <div className="tl-track tl-ruler-track">
          {Array.from({ length: beats }, (_, beat) => (
            <span key={beat} className="tl-tick" data-bar={beat % 4 === 0} style={{ left: pct(beat) }}>
              {beat % 4 === 0 ? beat / 4 + 1 : ''}
            </span>
          ))}
        </div>
      </div>

      {fixtures.map((fixture, laneIndex) => (
        <div key={fixture.id} className="tl-row">
          <div className="tl-label">
            <span className="tl-lane-name">{fixture.name}</span>
            <button
              type="button"
              className="tl-lane-add"
              aria-label={`Add a block on ${fixture.name}`}
              onClick={() => onAddToLane(fixture.id)}
            >
              +
            </button>
          </div>
          <div
            className="tl-track"
            data-testid={`lane-${fixture.id}`}
            ref={(element) => {
              trackRefs.current[laneIndex] = element;
            }}
            onPointerDown={(event) => startDraw(event, laneIndex)}
          >
            {timeline.blocks
              .filter((block) => block.fixtureId === fixture.id)
              .map((stored) => {
                const block = preview(stored);
                return (
                  <button
                    key={block.id}
                    type="button"
                    className="tl-block"
                    aria-pressed={selected.has(block.id)}
                    aria-label={describeBlock(block, fixture.name)}
                    title={describeBlock(block, fixture.name)}
                    data-strobe={block.effect === 'strobe'}
                    style={{
                      left: pct(block.start),
                      width: pct(block.length),
                      background: blockBackground(block),
                      opacity: 0.35 + (Math.max(block.intensity, block.endIntensity) / 100) * 0.65,
                    }}
                    onPointerDown={(event) => startBlockDrag(event, block, 'move')}
                    onKeyDown={(event) => handleBlockKey(event, block)}
                    onClick={(event) => {
                      if (event.detail === 0) {
                        onSelect([block.id]); // keyboard activation (Enter or Space)
                      }
                    }}
                  >
                    <span
                      className="tl-block-resize"
                      aria-hidden="true"
                      onPointerDown={(event) => startBlockDrag(event, stored, 'resize')}
                    />
                  </button>
                );
              })}
            {ghost && laneIndex >= ghostLanes[0] && laneIndex <= ghostLanes[1] ? (
              <span className="tl-ghost" style={{ left: pct(ghost.start), width: pct(ghost.length) }} />
            ) : null}
            {playheadBeat !== null ? <span className="tl-playhead" style={{ left: pct(playheadBeat) }} /> : null}
          </div>
        </div>
      ))}

      <p className="tl-beat-help" aria-live="polite">
        {ghost
          ? `Beats ${beatLabel(ghost.start)} to ${beatLabel(ghost.start + ghost.length)}`
          : 'Drag across beats, and across lights, to draw a block.'}
      </p>
    </div>
  );
}
