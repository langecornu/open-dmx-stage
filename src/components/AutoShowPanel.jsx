// Auto show: plays the looks or the sequences by itself, in time with the tempo, until it is stopped. No music and no
// one at the controls needed. The server runs it, so it keeps going if this page is closed.
import { useState } from 'react';

import { AUTO_BEATS } from '../../shared/autoShow.js';
import { describeAuto, describeEvery } from '../utils/autoShow.js';

/** @param {{ values: Record<string, number> }} scene */
const isLit = (scene) => Object.values(scene.values).some((value) => value > 0);

export function AutoShowPanel({ project, live, flush }) {
  const [settings, setSettings] = useState({ source: 'looks', beats: 8, order: 'order' });
  const [error, setError] = useState(null);
  const auto = live.engine.auto ?? null; // a server from before the auto show does not send it
  const isOn = auto !== null;
  // While it runs, show what is actually playing, even if it was started from the search palette.
  const shown = isOn ? { source: auto.source, beats: auto.beats, order: auto.order } : settings;

  const lookCount = project.scenes.filter(isLit).length;
  const lookIds = new Set(project.scenes.map((scene) => scene.id));
  // As the engine does: a sequence whose looks were all deleted has nothing to play.
  const sequenceCount = project.chases.filter((chase) => chase.steps.some((step) => lookIds.has(step.sceneId))).length;
  const available = shown.source === 'looks' ? lookCount : sequenceCount;

  const change = (key, value) => setSettings((current) => ({ ...current, [key]: value }));

  const handleToggle = async () => {
    setError(null);
    if (isOn) {
      live.send({ type: 'autoStop' });
      return;
    }
    try {
      await flush(); // play the show as it is on screen, with any edit saved first
      live.send({ type: 'autoStart', ...settings });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work. Try again.');
    }
  };

  let status = 'Not running.';
  if (isOn) {
    const list = auto.source === 'looks' ? project.scenes : project.chases;
    const name = list.find((entry) => entry.id === auto.itemId)?.name;
    status = name ? `Playing ${name}. ${describeAuto(auto)}.` : `Running. ${describeAuto(auto)}.`;
  } else if (available === 0) {
    status =
      shown.source === 'looks'
        ? 'Save a look with some light in it first; looks that leave every light off are skipped.'
        : 'Make a sequence first.';
  }

  return (
    <section className="card card-pad auto-panel" aria-label="Auto show">
      <div className="section-bar">
        <h2 className="section-title">Auto show</h2>
        {isOn ? <span className="pill">On</span> : null}
      </div>
      <p className="view-sub">
        Plays your looks or sequences by itself, in time with the tempo, until you stop it. Looks fade into each other
        over one beat; looks that leave every light off are skipped. Pressing a pad takes over.
      </p>
      <div className="toolbar">
        <label className="field">
          Play
          <select
            className="select"
            value={shown.source}
            disabled={isOn}
            onChange={(event) => change('source', event.target.value)}
          >
            <option value="looks">Looks ({lookCount})</option>
            <option value="sequences">Sequences ({sequenceCount})</option>
          </select>
        </label>
        <label className="field">
          Change
          <select
            className="select"
            value={shown.beats}
            disabled={isOn}
            onChange={(event) => change('beats', Number(event.target.value))}
          >
            {AUTO_BEATS.map((beats) => (
              <option key={beats} value={beats}>
                {describeEvery(beats)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Order
          <select
            className="select"
            value={shown.order}
            disabled={isOn}
            onChange={(event) => change('order', event.target.value)}
          >
            <option value="order">In order</option>
            <option value="shuffle">Shuffled</option>
          </select>
        </label>
        <button
          type="button"
          className="btn btn-primary"
          aria-pressed={isOn}
          disabled={!isOn && available === 0}
          onClick={handleToggle}
        >
          {isOn ? 'Stop auto show' : 'Start auto show'}
        </button>
      </div>
      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}
      <p className="view-sub" role="status">
        {status}
      </p>
    </section>
  );
}
