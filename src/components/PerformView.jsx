// Perform: big buttons for every look and sequence, with keyboard shortcuts and MIDI controller mapping, plus master,
// blackout and stop. Built for running a show without the mouse.
import { useEffect, useMemo, useState } from 'react';

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
import { averageColor, fixtureColors, sceneGradient } from '../utils/sceneColors.js';
import { EmptyState } from './EmptyState.jsx';
import { Icon } from './Icon.jsx';
import { MidiPanel } from './MidiPanel.jsx';
import { PerformTile } from './PerformTile.jsx';

const FADES = [0, 250, 500, 1000, 2000];
const MASTER_STEP = 0.1;

export function PerformView({ project, patch, live, flush }) {
  const [fadeMs, setFadeMs] = useState(500);
  const [isLearning, setIsLearning] = useState(false);
  const [armed, setArmed] = useState(null);
  const [midiMap, setMidiMap] = useState(loadMidiMap);

  const items = useMemo(() => {
    const colours = (values) => fixtureColors(project, patch, values);
    const looks = project.scenes.map((scene) => ({
      action: { type: 'look', id: scene.id },
      name: scene.name,
      kind: 'Look',
      gradient: sceneGradient(colours(scene.values)),
    }));
    const sequences = project.chases.map((chase) => {
      const stepColours = chase.steps.map((step) =>
        averageColor(colours(project.scenes.find((scene) => scene.id === step.sceneId)?.values ?? {})),
      );
      return {
        action: { type: 'sequence', id: chase.id },
        name: chase.name,
        kind: 'Sequence',
        gradient: sceneGradient(stepColours),
      };
    });
    return [...looks, ...sequences];
  }, [project, patch]);
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

  const run = async (action, value) => {
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

  const handlePress = (action) => {
    if (isLearning) {
      setArmed(action);
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
      setArmed(null);
      return;
    }
    const action = midiMap[key];
    if (action && shouldTrigger(message, action)) {
      run(action, masterFromCc(message.value));
    }
  };
  const midi = useMidi({ onMessage: handleMidi });

  const stepMaster = (delta) =>
    live.send({ type: 'master', level: Math.max(0, Math.min(1, live.engine.master + delta)) });
  usePerformKeys({
    ...Object.fromEntries(items.map((item, index) => [keys[index], () => run(item.action)])),
    ' ': () => run({ type: 'blackout' }),
    Escape: () => run({ type: 'stop' }),
    '[': () => stepMaster(-MASTER_STEP),
    ']': () => stepMaster(MASTER_STEP),
  });

  const midiLabelOf = (action) => {
    const id = actionId(action);
    const entry = Object.entries(midiMap).find(([, bound]) => actionId(bound) === id);
    return entry ? describeMidiKey(entry[0]) : null;
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
            Big buttons for your show. Keys: Space is blackout, Escape stops a sequence, [ and ] change the master.
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

      <div className="card card-pad perform-controls">
        <label className="slider-row perform-master">
          Master
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(live.engine.master * 100)}
            onChange={(event) => live.send({ type: 'master', level: Number(event.target.value) / 100 })}
          />
          <span className="slider-value">{Math.round(live.engine.master * 100)}%</span>
        </label>
        <button
          type="button"
          className="btn btn-blackout"
          aria-pressed={live.engine.blackout}
          data-armed={isArmed({ type: 'blackout' })}
          onClick={() => handlePress({ type: 'blackout' })}
        >
          <Icon name="power" />
          Blackout {midiLabelOf({ type: 'blackout' }) ? `· ${midiLabelOf({ type: 'blackout' })}` : ''}
        </button>
        <button
          type="button"
          className="btn"
          data-armed={isArmed({ type: 'stop' })}
          onClick={() => handlePress({ type: 'stop' })}
        >
          <Icon name="stop" size={16} />
          Stop sequence {midiLabelOf({ type: 'stop' }) ? `· ${midiLabelOf({ type: 'stop' })}` : ''}
        </button>
        {isLearning ? (
          <button
            type="button"
            className="btn"
            data-armed={isArmed({ type: 'master' })}
            onClick={() => handlePress({ type: 'master' })}
          >
            Link master to a knob {midiLabelOf({ type: 'master' }) ? `· ${midiLabelOf({ type: 'master' })}` : ''}
          </button>
        ) : null}
      </div>

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

      <MidiPanel
        midi={midi}
        isLearning={isLearning}
        onToggleLearn={() => {
          setIsLearning((on) => !on);
          setArmed(null);
        }}
        mappingCount={Object.keys(midiMap).length}
        onClear={() => {
          setMidiMap({});
          saveMidiMap({});
        }}
      />
    </section>
  );
}
