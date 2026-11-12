// The timeline grid: a ruler of beats and bars, then one lane per light. Drag across beats (and across lanes) to draw a
// block on each light covered; drag a block to move it, or its right edge to change its length. A block is also a
// button: click to select it (Shift to add to the selection), arrows to move it, Shift and arrows to change its
// length, Delete to remove it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  beatLabel,
  blockBackground,
  clampLength,
  describeBlock,
  dragSpan,
  moveBlocks,
  snapNearest,
} from '../utils/timelineEdit.js';
import { DeviceIcon } from './DeviceIcon.jsx';

/** Beat widths for zooming in, in pixels. "Fit" (no width) shows the whole timeline in the space available. */
export const ZOOM_STEPS = [4, 6, 10, 16, 24, 40];
const LABEL_COLUMN = 128;

export function TimelineGrid({
  timeline,
  fixtures,
  categories = new Map(),
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
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [drag, setDrag] = useState(/** @type {any} */ (null));
  const { beats } = timeline;
  const selected = new Set(selectedIds);
  const bars = beats / 4;
  // null: the whole timeline fits the width. A number: that many pixels a beat, and the grid scrolls sideways.
  const [zoomPx, setZoomPx] = useState(/** @type {number | null} */ (null));
  const anchorBeat = useRef(/** @type {number | null} */ (null));
  const beatPx = zoomPx ?? 0;
  // Bar numbers at least about 32 px apart, so they stay readable however far out the zoom is.
  const labelEvery = zoomPx === null ? Math.max(1, Math.ceil(bars / 16)) : Math.max(1, Math.ceil(32 / (zoomPx * 4)));

  const shownBeatPx = () => {
    const width = trackRefs.current.find(Boolean)?.getBoundingClientRect().width ?? 0;
    return zoomPx ?? width / beats;
  };
  const changeZoom = (next) => {
    const root = rootRef.current;
    const current = shownBeatPx();
    // Keep the beat at the left edge where it is, so zooming does not lose your place.
    anchorBeat.current = root && current > 0 ? root.scrollLeft / current : 0;
    setZoomPx(next);
  };
  const zoomIn = () => {
    const current = shownBeatPx();
    changeZoom(ZOOM_STEPS.find((step) => step > current + 0.5) ?? ZOOM_STEPS.at(-1));
  };
  const zoomOut = () => {
    const current = shownBeatPx();
    const narrower = [...ZOOM_STEPS].reverse().find((step) => step < current - 0.5);
    const available = (rootRef.current?.clientWidth ?? 0) - LABEL_COLUMN;
    // Narrower than the space available would only leave a gap: that is what Fit is for.
    changeZoom(narrower === undefined || narrower * beats <= available ? null : narrower);
  };
  const isMaxZoom = zoomPx === ZOOM_STEPS.at(-1);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root && anchorBeat.current !== null) {
      root.scrollLeft = zoomPx === null ? 0 : anchorBeat.current * zoomPx;
      anchorBeat.current = null;
    }
  }, [zoomPx]);

  // Ctrl or Command with the mouse wheel zooms, as in most timeline editors. A plain wheel still scrolls.
  const zoomByWheel = useRef(() => {});
  zoomByWheel.current = (event) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      if (event.deltaY < 0) {
        zoomIn();
      } else if (event.deltaY > 0) {
        zoomOut();
      }
      return;
    }
    // An up-and-down wheel moves along the timeline when it is wider than the screen, so a plain mouse can scroll it.
    // A sideways swipe is left to the browser, and at either end the wheel scrolls the page as usual.
    const root = rootRef.current;
    const isVertical = Math.abs(event.deltaY) > Math.abs(event.deltaX);
    if (!root || !isVertical || root.scrollWidth <= root.clientWidth) {
      return;
    }
    const atStart = root.scrollLeft <= 0;
    const atEnd = root.scrollLeft >= root.scrollWidth - root.clientWidth - 1;
    if ((event.deltaY < 0 && atStart) || (event.deltaY > 0 && atEnd)) {
      return;
    }
    event.preventDefault();
    root.scrollLeft += event.deltaY;
  };
  useEffect(() => {
    const root = rootRef.current;
    const handle = (event) => zoomByWheel.current(event);
    root?.addEventListener('wheel', handle, { passive: false });
    return () => root?.removeEventListener('wheel', handle);
  }, []);

  // While playing zoomed in, keep the playhead in view by scrolling the grid when it runs off either edge.
  useEffect(() => {
    const root = rootRef.current;
    const track = trackRefs.current.find(Boolean);
    if (playheadBeat === null || beatPx === 0 || !root || !track) {
      return;
    }
    const x = track.offsetLeft + (playheadBeat / beats) * track.offsetWidth;
    if (x < root.scrollLeft + track.offsetLeft || x > root.scrollLeft + root.clientWidth - 24) {
      root.scrollLeft = Math.max(0, x - track.offsetLeft - 24);
    }
  }, [playheadBeat, beatPx, beats]);

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

  // Dragging the ruler pans the timeline, like grabbing it.
  const startPan = (event) => {
    if (event.button !== 0 || !rootRef.current) {
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ kind: 'pan', fromX: event.clientX, fromScroll: rootRef.current.scrollLeft });
  };

  const handleMove = (event) => {
    if (!drag) {
      return;
    }
    if (drag.kind === 'pan') {
      if (rootRef.current) {
        rootRef.current.scrollLeft = drag.fromScroll - (event.clientX - drag.fromX);
      }
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
    if (drag.kind === 'pan') {
      setDrag(null);
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
    if (!drag || drag.kind === 'draw' || drag.kind === 'pan' || drag.delta === 0) {
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
    <div className="tl-editor">
      <div className="tl-zoom" role="group" aria-label="Zoom">
        <button
          type="button"
          className="btn btn-compact"
          aria-label="Zoom out"
          onClick={zoomOut}
          disabled={zoomPx === null}
        >
          −
        </button>
        <button
          type="button"
          className="btn btn-compact"
          onClick={() => changeZoom(null)}
          aria-pressed={zoomPx === null}
        >
          Fit
        </button>
        <button type="button" className="btn btn-compact" aria-label="Zoom in" onClick={zoomIn} disabled={isMaxZoom}>
          +
        </button>
        <span className="tl-zoom-note">
          {zoomPx === null
            ? 'Whole timeline'
            : 'Scroll with the wheel or by dragging the bar numbers. Ctrl or ⌘ and the wheel zoom.'}
        </span>
      </div>
      <div
        ref={rootRef}
        className="tl"
        role="group"
        aria-label={`Timeline, ${bars} ${bars === 1 ? 'bar' : 'bars'}`}
        data-dense={zoomPx === null ? beats > 64 : zoomPx < 7}
        style={{ '--tl-beats': beats, '--tl-beat-px': `${beatPx}px` }}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={() => setDrag(null)}
      >
        <div className="tl-row tl-ruler" aria-hidden="true">
          <span className="tl-label" />
          <div className="tl-track tl-ruler-track" data-pannable={zoomPx !== null} onPointerDown={startPan}>
            {Array.from({ length: beats }, (_, beat) => (
              <span
                key={beat}
                className="tl-tick"
                data-bar={beat % 4 === 0 && (beat / 4) % labelEvery === 0}
                style={{ left: pct(beat) }}
              >
                {beat % 4 === 0 && (beat / 4) % labelEvery === 0 ? beat / 4 + 1 : ''}
              </span>
            ))}
          </div>
        </div>

        {fixtures.map((fixture, laneIndex) => (
          <div key={fixture.id} className="tl-row">
            <div className="tl-label">
              <DeviceIcon category={categories.get(fixture.id) ?? 'other'} size={22} />
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
      </div>
      <p className="tl-beat-help" aria-live="polite">
        {ghost
          ? `Beats ${beatLabel(ghost.start)} to ${beatLabel(ghost.start + ghost.length)}`
          : 'Drag across beats, and across lights, to draw a block.'}
      </p>
    </div>
  );
}
