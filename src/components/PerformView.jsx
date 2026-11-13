// Perform: a stage console. A status strip (output, MIDI, music, tempo), a pad for every look and sequence with keyboard
// shortcuts and MIDI mapping, then tempo, effects, music and MIDI. Built for running a show without the mouse.
import { useEffect, useMemo, useReducer, useState } from 'react';

import { useBeatFollower } from '../hooks/useBeatFollower.js';
import { useMidi } from '../hooks/useMidi.js';
import { usePerformKeys } from '../hooks/usePerformKeys.js';
import {
  actionId,
  bindAction,
  describeMidiKey,
  loadMidiMap,
  masterFromCc,
  midiKey,
  pruneMap,
  saveMidiMap,
  shouldTrigger,
} from '../utils/midi.js';
import { assignKeys } from '../utils/performKeys.js';
import { buildPerformItems } from '../utils/performItems.js';
import { isActionPlaying, playAction } from '../utils/playActions.js';
import { useTapTempo } from '../hooks/useTapTempo.js';
import { AutoShowPanel } from './AutoShowPanel.jsx';
import { EffectsPanel } from './EffectsPanel.jsx';
import { EmptyState } from './EmptyState.jsx';
import { Icon } from './Icon.jsx';
import { MidiPanel } from './MidiPanel.jsx';
import { MuteSoloPanel } from './MuteSoloPanel.jsx';
import { PerformLearnLinks } from './PerformLearnLinks.jsx';
import { PerformStatus } from './PerformStatus.jsx';
import { PerformTile } from './PerformTile.jsx';
import { SoundPanel } from './SoundPanel.jsx';
import { TempoPanel } from './TempoPanel.jsx';
import { Visualizer } from './Visualizer.jsx';

const FADES = [0, 250, 500, 1000, 2000];
const MASTER_STEP = 0.1;
const PANEL_IDS = { midi: 'perform-midi', sound: 'perform-sound' };

// Brings a settings panel into view and moves the focus to it, so a keyboard or screen reader user lands there too.
function showPanel(id) {
  const panel = document.getElementById(id);
  if (!panel) {
    return;
  }
  const isReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  panel.scrollIntoView?.({ behavior: isReduced ? 'auto' : 'smooth', block: 'center' });
  panel.focus({ preventScroll: true });
}

// Learn mode is a small flow: switch it on, tap a button to arm it, then touch a control. Turning it off, or finishing
// a link, always disarms. One reducer keeps those transitions together.
function learnReducer(state, event) {
  switch (event.type) {
    case 'toggle':
      return { isLearning: !state.isLearning, armed: null };
    case 'arm':
      return { ...state, armed: event.action };
    case 'disarm':
      return { ...state, armed: null };
    default:
      return state;
  }
}

export function PerformView({ project, patch, live, flush, update, library = [] }) {
  const [isVisualizing, setIsVisualizing] = useState(false);
  const [fadeMs, setFadeMs] = useState(500);
  const [{ isLearning, armed }, dispatchLearn] = useReducer(learnReducer, { isLearning: false, armed: null });
  const [error, setError] = useState(null);
  const [midiMap, setMidiMap] = useState(loadMidiMap);

  const items = useMemo(() => buildPerformItems(project, patch), [project, patch]);

  const keys = assignKeys(items.length);

  // Forget links to looks and sequences that were deleted.
  useEffect(() => {
    const valid = new Set(items.map((item) => actionId(item.action)));
    setMidiMap((current) => {
      const pruned = pruneMap(current, valid);
      if (Object.keys(pruned).length !== Object.keys(current).length) {
        saveMidiMap(pruned);
        return pruned;
      }
      return current;
    });
  }, [items]);

  const perform = async (action, value) => {
    if (action.type === 'look' || action.type === 'sequence') {
      await playAction({ action, engine: live.engine, send: live.send, flush, fadeMs });
    } else if (action.type === 'blackout') {
      live.send({ type: 'blackout', enabled: !live.engine.blackout });
    } else if (action.type === 'stop') {
      live.send({ type: 'chaseStop' });
    } else if (action.type === 'master') {
      live.send({ type: 'master', level: value });
    }
  };

  // Keys, pads and buttons all start actions without waiting; a failure (for example a show that cannot be saved before
  // playing) is shown on screen instead of being lost.
  const run = async (action, value) => {
    try {
      setError(null);
      await perform(action, value);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work. Try again.');
    }
  };

  const handlePress = (action) => {
    if (isLearning) {
      dispatchLearn({ type: 'arm', action });
    } else {
      run(action);
    }
  };

  const handleMidi = (message) => {
    const key = midiKey(message);
    if (armed) {
      if (armed.type === 'master' && message.kind !== 'cc') {
        return; // the master follows a knob or fader, which sends control changes
      }
      const next = bindAction(midiMap, key, armed);
      setMidiMap(next);
      saveMidiMap(next);
      dispatchLearn({ type: 'disarm' });
      return;
    }
    const action = midiMap[key];
    if (action && shouldTrigger(message, action)) {
      run(action, masterFromCc(message.value));
    }
  };
  const midi = useMidi({ onMessage: handleMidi });

  const follower = useBeatFollower({ send: live.send });

  const tap = useTapTempo({ send: live.send, bpm: live.engine.bpm });

  const stepMaster = (delta) =>
    live.send({ type: 'master', level: Math.max(0, Math.min(1, live.engine.master + delta)) });
  usePerformKeys({
    ...Object.fromEntries(items.map((item, index) => [keys[index], () => run(item.action)])),
    ' ': () => run({ type: 'blackout' }),
    // While the visualizer is open, Escape closes it instead of stopping the show.
    Escape: () => (isVisualizing ? undefined : run({ type: 'stop' })),
    '[': () => stepMaster(-MASTER_STEP),
    ']': () => stepMaster(MASTER_STEP),
    '.': tap,
  });

  const midiLabelOf = (action) => {
    const id = actionId(action);
    const entry = Object.entries(midiMap).find(([, bound]) => actionId(bound) === id);
    return entry ? describeMidiKey(entry[0]) : null;
  };
  const withMidiLabel = (text, action) => {
    const label = midiLabelOf(action);
    return label ? `${text} · ${label}` : text;
  };
  const isArmed = (action) => armed !== null && actionId(armed) === actionId(action);
  const isPlaying = (item) => isActionPlaying(item.action, live.engine);

  const renderTile = (item, index) => (
    <PerformTile
      key={actionId(item.action)}
      name={item.name}
      kind={item.kind}
      detail={item.detail}
      gradient={item.gradient}
      steps={item.steps}
      playingStep={item.kind === 'Sequence' && isPlaying(item) ? live.engine.chaseStep : null}
      keyLabel={keys[index]}
      midiLabel={midiLabelOf(item.action)}
      isPlaying={isPlaying(item)}
      isArmed={isArmed(item.action)}
      onPress={() => handlePress(item.action)}
    />
  );
  const entries = items.map((item, index) => ({ item, index }));
  const looks = entries.filter(({ item }) => item.kind === 'Look');
  const sequences = entries.filter(({ item }) => item.kind === 'Sequence');

  return (
    <section className="view" aria-labelledby="perform-title">
      <div className="view-header">
        <div>
          <h1 className="view-title" id="perform-title">
            Perform
          </h1>
          <p className="view-sub">Tap a pad or press its key to start it. Tap a playing sequence again to stop it.</p>
        </div>
        <button type="button" className="btn btn-primary perform-visualize" onClick={() => setIsVisualizing(true)}>
          <Icon name="sparkle" size={16} />
          Visualize
        </button>
        <ul className="key-hints" aria-label="Keyboard shortcuts">
          <li>
            <kbd>Space</kbd> Blackout
          </li>
          <li>
            <kbd>Esc</kbd> Stop
          </li>
          <li>
            <kbd>[</kbd> <kbd>]</kbd> Master
          </li>
          <li>
            <kbd>.</kbd> Tap tempo
          </li>
        </ul>
      </div>

      <PerformStatus
        connected={live.connected}
        output={live.output}
        midi={midi}
        follower={follower}
        bpm={live.engine.bpm}
        onShow={(chipId) => showPanel(PANEL_IDS[chipId])}
      />

      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}

      {isLearning ? <PerformLearnLinks labelFor={withMidiLabel} isArmed={isArmed} onPress={handlePress} /> : null}

      {items.length === 0 ? (
        <EmptyState
          icon="bolt"
          title="Nothing to perform yet"
          hint="Save some looks first. They appear here as big buttons."
        />
      ) : (
        <>
          {looks.length > 0 ? (
            <section className="pad-section" aria-labelledby="pads-looks">
              <div className="pad-section-head">
                <h2 className="section-title" id="pads-looks">
                  Looks
                  <span className="section-count">{looks.length}</span>
                </h2>
                <label className="field field-inline">
                  Fade when playing a look
                  <select
                    className="select select-compact"
                    value={fadeMs}
                    onChange={(event) => setFadeMs(Number(event.target.value))}
                  >
                    {FADES.map((ms) => (
                      <option key={ms} value={ms}>
                        {ms === 0 ? 'Instant' : `${ms / 1000} s`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="perform-grid">{looks.map(({ item, index }) => renderTile(item, index))}</div>
            </section>
          ) : null}
          {sequences.length > 0 ? (
            <section className="pad-section" aria-labelledby="pads-sequences">
              <div className="pad-section-head">
                <h2 className="section-title" id="pads-sequences">
                  Sequences
                  <span className="section-count">{sequences.length}</span>
                </h2>
              </div>
              <div className="perform-grid">{sequences.map(({ item, index }) => renderTile(item, index))}</div>
            </section>
          ) : null}
        </>
      )}

      <div className="console">
        <TempoPanel
          bpm={live.engine.bpm}
          onTempo={(bpm) => live.send({ type: 'tempo', bpm, sync: false })}
          onTap={tap}
        />
        <AutoShowPanel project={project} live={live} flush={flush} />
        <EffectsPanel groups={project.groups} live={live} />
        <MuteSoloPanel project={project} live={live} library={library} />
        <SoundPanel id={PANEL_IDS.sound} follower={follower} />
        <MidiPanel
          id={PANEL_IDS.midi}
          midi={midi}
          isLearning={isLearning}
          onToggleLearn={() => dispatchLearn({ type: 'toggle' })}
          mappingCount={Object.keys(midiMap).length}
          onClear={() => {
            setMidiMap({});
            saveMidiMap({});
          }}
        />
      </div>
      <Visualizer
        isOpen={isVisualizing}
        onClose={() => setIsVisualizing(false)}
        project={project}
        library={library}
        patch={patch}
        update={update}
        live={live}
        flush={flush}
      />
    </section>
  );
}
