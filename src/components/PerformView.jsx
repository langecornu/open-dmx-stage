// Perform: big buttons for every look and sequence, with keyboard shortcuts and MIDI controller mapping, plus master,
// blackout and stop. Built for running a show without the mouse.
import { useEffect, useMemo, useReducer, useState } from 'react';

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
import { useTapTempo } from '../hooks/useTapTempo.js';
import { EffectsPanel } from './EffectsPanel.jsx';
import { EmptyState } from './EmptyState.jsx';
import { MidiPanel } from './MidiPanel.jsx';
import { PerformControls } from './PerformControls.jsx';
import { PerformTile } from './PerformTile.jsx';
import { TempoPanel } from './TempoPanel.jsx';

const FADES = [0, 250, 500, 1000, 2000];
const MASTER_STEP = 0.1;

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

export function PerformView({ project, patch, live, flush }) {
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
    if (action.type === 'look') {
      await flush();
      live.send({ type: 'recall', sceneId: action.id, fadeMs });
    } else if (action.type === 'sequence') {
      if (live.engine.activeChaseId === action.id) {
        live.send({ type: 'chaseStop' });
      } else {
        await flush();
        live.send({ type: 'chaseStart', chaseId: action.id });
      }
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

  const tap = useTapTempo({ send: live.send, bpm: live.engine.bpm });

  const stepMaster = (delta) =>
    live.send({ type: 'master', level: Math.max(0, Math.min(1, live.engine.master + delta)) });
  usePerformKeys({
    ...Object.fromEntries(items.map((item, index) => [keys[index], () => run(item.action)])),
    ' ': () => run({ type: 'blackout' }),
    Escape: () => run({ type: 'stop' }),
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
  const isPlaying = (item) =>
    item.action.type === 'look'
      ? live.engine.activeSceneId === item.action.id && live.engine.activeChaseId === null
      : live.engine.activeChaseId === item.action.id;

  return (
    <section className="view" aria-labelledby="perform-title">
      <div className="view-header">
        <div>
          <h1 className="view-title" id="perform-title">
            Perform
          </h1>
          <p className="view-sub">
            Big buttons for your show. Keys: Space is blackout, Escape stops a sequence, [ and ] change the master, and
            . taps the tempo.
          </p>
        </div>
        <label className="field">
          Fade when playing a look
          <select className="select" value={fadeMs} onChange={(event) => setFadeMs(Number(event.target.value))}>
            {FADES.map((ms) => (
              <option key={ms} value={ms}>
                {ms === 0 ? 'Instant' : `${ms / 1000} s`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}

      <PerformControls
        master={live.engine.master}
        isBlackout={live.engine.blackout}
        isLearning={isLearning}
        labelFor={withMidiLabel}
        isArmed={isArmed}
        onPress={handlePress}
        onMaster={(level) => live.send({ type: 'master', level })}
      />

      {items.length === 0 ? (
        <EmptyState title="Nothing to perform yet" hint="Save some looks first. They appear here as big buttons." />
      ) : (
        <div className="perform-grid">
          {items.map((item, index) => (
            <PerformTile
              key={actionId(item.action)}
              name={item.name}
              kind={item.kind}
              gradient={item.gradient}
              keyLabel={keys[index]}
              midiLabel={midiLabelOf(item.action)}
              isPlaying={isPlaying(item)}
              isArmed={isArmed(item.action)}
              onPress={() => handlePress(item.action)}
            />
          ))}
        </div>
      )}

      <TempoPanel bpm={live.engine.bpm} onTempo={(bpm) => live.send({ type: 'tempo', bpm, sync: false })} onTap={tap} />
      <EffectsPanel groups={project.groups} live={live} />

      <MidiPanel
        midi={midi}
        isLearning={isLearning}
        onToggleLearn={() => dispatchLearn({ type: 'toggle' })}
        mappingCount={Object.keys(midiMap).length}
        onClear={() => {
          setMidiMap({});
          saveMidiMap({});
        }}
      />
    </section>
  );
}
