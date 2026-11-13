// The visualizer: the rig on a stage, lit live by the same DMX frame as the real lights, full screen over Perform. Pars
// throw coloured beams through the haze, moving heads turn and tilt, bars light cell by cell, spiders sweep, derbies
// and flowers spin, lasers fan out, strobes flash, smoke machines puff smoke that thickens the haze, fans blow it, and a
// mirror ball scatters dots. Arrange lights moves them on the stage (by finger, mouse, or the keyboard); each light keeps
// its place in the show. A strip of pads at the bottom plays looks and sequences without leaving the view.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { controlsByFixture } from '../../shared/capabilities.js';
import { categoryOf } from '../../shared/categories.js';
import { indexFixtureTypes } from '../../shared/patch.js';
import { mountsOf, positionOf, railsOf, rigOrDefault } from '../../shared/stageRig.js';
import { frameStore } from '../hooks/frameStore.js';
import { buildPerformItems } from '../utils/performItems.js';
import { isActionPlaying, playAction } from '../utils/playActions.js';
import { createStageRenderer } from '../utils/stageRenderer.js';
import { VIEWS, VIEW_LABELS, screenToMount } from '../utils/stageCamera.js';
import { visualState } from '../utils/visualState.js';
import { DjConsole } from './DjConsole.jsx';
import { Icon } from './Icon.jsx';
import { VisualizerArrange } from './VisualizerArrange.jsx';

const SETTINGS_KEY = 'odmx-visualizer';

function loadSettings() {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const defaults = { haze: 0.35, showNames: false, flashing: !reduced, view: 'corner' };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

/**
 * @param {{ isOpen: boolean, onClose: () => void, project: any, library: any[], patch: any,
 *   update: (mutate: (project: any) => any) => void, live: any, flush: () => Promise<void> }} props
 */
export function Visualizer({ isOpen, onClose, project, library, patch, update, live, flush }) {
  const canvasRef = useRef(/** @type {HTMLCanvasElement | null} */ (null));
  const stageRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const closeRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const rendererRef = useRef(/** @type {ReturnType<typeof createStageRenderer>} */ (null));
  const [settings, setSettings] = useState(loadSettings);
  const [isArranging, setIsArranging] = useState(false);
  const [isDecksOpen, setIsDecksOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(/** @type {string | null} */ (null));
  /** Places being dragged, before they are saved. @type {[Map<string, {x:number,y:number}>, Function]} */
  const [moving, setMoving] = useState(() => new Map());
  const dragRef = useRef(/** @type {{ id: string, pointerId: number } | null} */ (null));

  const typesById = useMemo(() => indexFixtureTypes(project, library), [project, library]);
  const controls = useMemo(() => controlsByFixture(project, typesById), [project, typesById]);
  const categories = useMemo(
    () => new Map(project.fixtures.map((fixture) => [fixture.id, categoryOf(fixture, typesById.get(fixture.typeId))])),
    [project.fixtures, typesById],
  );
  const rig = useMemo(() => rigOrDefault(project.rig), [project.rig]);
  const rails = useMemo(() => railsOf(rig), [rig]);
  const mounts = useMemo(
    () => mountsOf(project.fixtures, (fixture) => categories.get(fixture.id) ?? 'other', rig),
    [project.fixtures, categories, rig],
  );
  const items = useMemo(() => buildPerformItems(project, patch), [project, patch]);

  // What the animation reads each frame, without restarting it when any of it changes.
  const latest = useRef({
    project,
    patch,
    controls,
    categories,
    mounts,
    rig,
    moving,
    settings,
    isArranging,
    selectedId,
  });
  latest.current = { project, patch, controls, categories, mounts, rig, moving, settings, isArranging, selectedId };

  const changeSettings = (changes) =>
    setSettings((current) => {
      const next = { ...current, ...changes };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // A remembered setting is a convenience.
      }
      return next;
    });

  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;

  // Open: start drawing, follow the window size, close with Escape, give focus back on close.
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const opener = document.activeElement;
    closeRef.current?.focus();
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const renderer = canvas ? createStageRenderer(canvas) : null;
    rendererRef.current = renderer;
    const fit = () => {
      if (renderer && stage) {
        renderer.resize(stage.clientWidth, stage.clientHeight);
      }
    };
    fit();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    if (observer && stage) {
      observer.observe(stage);
    }
    let frame = 0;
    let last = performance.now();
    // Automatic quality: a slow device (a smoothed frame time over 40 ms) gets lighter detail; it comes back when frames
    // are fast again. Checked every two seconds, so it does not flicker between the two.
    let smoothed = 1 / 60;
    let lastCheck = last;
    let quality = 'high';
    const draw = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      smoothed = smoothed * 0.95 + dt * 0.05;
      if (now - lastCheck > 2000) {
        lastCheck = now;
        const next = smoothed > 0.04 ? 'low' : smoothed < 0.022 ? 'high' : quality;
        if (next !== quality) {
          quality = next;
          renderer?.setQuality(next);
        }
      }
      const current = latest.current;
      const dmx = frameStore.get();
      const valueOf = (channel) => dmx[channel - 1] ?? 0;
      const lights = current.project.fixtures.map((fixture) => {
        const category = current.categories.get(fixture.id) ?? 'other';
        return {
          id: fixture.id,
          name: fixture.name,
          category,
          position: positionOf(current.rig, current.moving.get(fixture.id) ?? current.mounts.get(fixture.id)),
          state: visualState({
            range: current.patch.fixtures.find((entry) => entry.id === fixture.id),
            patch: current.patch,
            controls: current.controls.get(fixture.id) ?? [],
            category,
            valueOf,
          }),
        };
      });
      renderer?.setScene({ view: current.settings.view, rig: current.rig });
      renderer?.frame({
        lights,
        dt,
        time: now / 1000,
        haze: current.settings.haze,
        flashing: current.settings.flashing,
        editing: current.isArranging,
        selectedId: current.selectedId,
        showNames: current.settings.showNames,
      });
      frame = requestAnimationFrame(draw);
    };
    if (renderer) {
      frame = requestAnimationFrame(draw);
    }
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeHandler.current();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('keydown', handleKey);
      rendererRef.current = null;
      if (opener instanceof HTMLElement) {
        opener.focus();
      }
    };
  }, [isOpen]);

  /** Saves where lights are mounted, in the show (with the venue), and clears what was being dragged. */
  const saveMounts = useCallback(
    (mountsById) => {
      update((current) => ({
        ...current,
        fixtures: current.fixtures.map((fixture) =>
          mountsById.has(fixture.id) ? { ...fixture, stage: mountsById.get(fixture.id) } : fixture,
        ),
      }));
      setMoving(new Map());
    },
    [update],
  );

  /** Changes the venue's rig: its shape, uprights or size. */
  const changeRig = (changes) =>
    update((current) => ({ ...current, rig: { ...rigOrDefault(current.rig), ...changes } }));

  const pointAt = (event) => {
    const rect = /** @type {HTMLCanvasElement} */ (canvasRef.current).getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event) => {
    if (!isArranging || !rendererRef.current) {
      return;
    }
    const { x, y } = pointAt(event);
    const id = rendererRef.current.hitTest(x, y);
    setSelectedId(id);
    if (id) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragRef.current = { id, pointerId: event.pointerId };
    }
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || !rendererRef.current) {
      return;
    }
    const { x, y } = pointAt(event);
    const mount = screenToMount(rendererRef.current.camera(), rig, x, y);
    setMoving((current) => new Map(current).set(drag.id, mount));
  };

  const handlePointerUp = () => {
    if (dragRef.current) {
      dragRef.current = null;
      if (moving.size > 0) {
        saveMounts(moving);
      }
    }
  };

  // The keyboard way to arrange: left and right move the chosen light along its rail (or across the floor), up and down
  // toward the back or front on the floor; Shift moves further. The rail itself is chosen in the list.
  const nudge = (event) => {
    if (!selectedId) {
      return;
    }
    const step = event.shiftKey ? 0.1 : 0.02;
    const current = mounts.get(selectedId) ?? { rail: 'floor', x: 0.5, z: 0.5 };
    const keep = (value) => Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
    /** @type {import('../../shared/stageRig.js').Mount | null} */
    let next = null;
    if (current.rail === 'floor') {
      const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[
        event.key
      ];
      if (move) {
        next = { rail: 'floor', x: keep((current.x ?? 0.5) + move[0]), z: keep((current.z ?? 0.5) + move[1]) };
      }
    } else {
      const move = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[event.key];
      if (move) {
        next = { rail: current.rail, at: keep((current.at ?? 0.5) + move) };
      }
    }
    if (next) {
      event.preventDefault();
      saveMounts(new Map([[selectedId, next]]));
    }
  };

  /** Moves the chosen light to another rail (in the middle of it) or onto the floor. */
  const moveToRail = (railId) => {
    if (selectedId) {
      saveMounts(
        new Map([[selectedId, railId === 'floor' ? { rail: 'floor', x: 0.5, z: 0.5 } : { rail: railId, at: 0.5 }]]),
      );
    }
  };

  const resetLayout = () => {
    if (window.confirm('Put every light back in its first place on the stage?')) {
      update((current) => ({
        ...current,
        fixtures: current.fixtures.map((fixture) => {
          const rest = { ...fixture };
          delete rest.stage;
          return rest;
        }),
      }));
    }
  };

  const play = (action) => playAction({ action, engine: live.engine, send: live.send, flush, fadeMs: 500 });

  if (!isOpen) {
    return null;
  }
  // Rendered at the top of the page, so it covers the whole screen whatever the screen it opens from.
  return createPortal(
    <div className="visualizer" role="dialog" aria-modal="true" aria-labelledby="visualizer-title">
      <div className="visualizer-bar">
        <div className="visualizer-title">
          <h2 id="visualizer-title">Stage view</h2>
          <span>{project.venue?.name ?? 'My venue'} · live</span>
        </div>
        <div className="visualizer-tools">
          <div className="visualizer-views" role="group" aria-label="View">
            {VIEWS.map((view) => (
              <button
                key={view}
                type="button"
                className="visualizer-chip"
                aria-pressed={settings.view === view}
                onClick={() => changeSettings({ view })}
              >
                {VIEW_LABELS[view]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="visualizer-btn"
            aria-pressed={isArranging}
            onClick={() => {
              setIsArranging((value) => !value);
              setSelectedId(null);
            }}
          >
            <Icon name="sliders" size={16} />
            Arrange lights
          </button>
          <button
            type="button"
            className="visualizer-btn"
            aria-pressed={settings.showNames}
            onClick={() => changeSettings({ showNames: !settings.showNames })}
          >
            Names
          </button>
          <button
            type="button"
            className="visualizer-btn"
            aria-pressed={settings.flashing}
            title="Show strobes flashing. Off shows them steady, for people sensitive to flashing light."
            onClick={() => changeSettings({ flashing: !settings.flashing })}
          >
            Flashing
          </button>
          <label className="visualizer-haze">
            Haze
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(settings.haze * 100)}
              onChange={(event) => changeSettings({ haze: Number(event.target.value) / 100 })}
            />
          </label>
          <button
            type="button"
            className="visualizer-btn visualizer-blackout"
            aria-pressed={live.engine.blackout}
            onClick={() => live.send({ type: 'blackout', enabled: !live.engine.blackout })}
          >
            <Icon name="power" size={16} />
            Blackout
          </button>
          <button ref={closeRef} type="button" className="visualizer-btn" onClick={onClose}>
            <Icon name="close" size={16} />
            Close
          </button>
        </div>
      </div>

      <div className="visualizer-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          className="visualizer-canvas"
          data-arranging={isArranging}
          role="img"
          aria-label={`The ${project.fixtures.length} lights on stage, as they are lit now`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        {isArranging ? (
          <VisualizerArrange
            venueName={project.venue?.name ?? 'this venue'}
            rig={rig}
            onRigChange={changeRig}
            fixtures={project.fixtures}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onNudge={nudge}
            selectedRail={selectedId ? (mounts.get(selectedId)?.rail ?? 'floor') : null}
            rails={rails}
            onMoveToRail={moveToRail}
            onReset={resetLayout}
          />
        ) : null}
      </div>

      {isDecksOpen ? <DjConsole isCompact /> : null}

      <div className="visualizer-pads" role="group" aria-label="Play">
        <button
          type="button"
          className="visualizer-chip"
          aria-pressed={isDecksOpen}
          onClick={() => setIsDecksOpen((open) => !open)}
        >
          <Icon name="music" size={14} />
          Decks
        </button>
        {live.engine.activeChaseId ? (
          <button
            type="button"
            className="visualizer-chip visualizer-stop"
            onClick={() => live.send({ type: 'chaseStop' })}
          >
            <Icon name="stop" size={14} />
            Stop
          </button>
        ) : null}
        {items.map((item) => (
          <button
            key={`${item.action.type}-${item.action.id}`}
            type="button"
            className="visualizer-chip visualizer-pad"
            aria-pressed={isActionPlaying(item.action, live.engine)}
            style={{ '--pad': item.gradient }}
            onClick={() => play(item.action)}
          >
            <span className="visualizer-pad-swatch" aria-hidden="true" />
            {item.name}
            <span className="sr-only">{` (${item.kind})`}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
