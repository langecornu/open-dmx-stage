// Looks (scenes): save what is on stage, then recall it with a fade.
import { useState } from 'react';

import { frameStore, useFrame } from '../hooks/frameStore.js';
import { fixtureColors, sceneGradient } from '../utils/sceneColors.js';
import { EmptyState } from './EmptyState.jsx';
import { Icon } from './Icon.jsx';

const FADE_OPTIONS = [0, 500, 1000, 2000, 5000];

function SceneCard({ scene, project, patch, isActive, fadeMs, onRecall, onRename, onDuplicate, onCapture, onDelete }) {
  const colors = fixtureColors(project, patch, scene.values);
  return (
    <article className="card scene-card" data-active={isActive}>
      <div className="scene-swatch" style={{ background: sceneGradient(colors) }}>
        <button
          type="button"
          className="scene-play"
          aria-label={`Play ${scene.name}`}
          onClick={() => onRecall(scene.id, fadeMs)}
        >
          <Icon name="chases" size={18} />
        </button>
      </div>
      <div className="scene-body">
        <input
          className="scene-name"
          value={scene.name}
          maxLength={80}
          aria-label={`Name for look ${scene.name}`}
          onChange={(event) => onRename(scene.id, event.target.value || scene.name)}
        />
        <div className="scene-foot">
          {isActive ? <span className="badge badge-live">On stage</span> : <span>{colors.length} fixtures</span>}
          <span className="scene-actions">
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label={`Update ${scene.name} to what is on stage now`}
              title="Replace this look with what is on stage now"
              onClick={() => onCapture(scene.id)}
            >
              <Icon name="record" size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label={`Duplicate look ${scene.name}`}
              title="Duplicate"
              onClick={() => onDuplicate(scene.id)}
            >
              <Icon name="copy" size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-danger"
              aria-label={`Delete look ${scene.name}`}
              title="Delete"
              onClick={() => onDelete(scene.id)}
            >
              <Icon name="trash" size={16} />
            </button>
          </span>
        </div>
      </div>
    </article>
  );
}

// What is on stage right now, as channel values. Channels at 0 are left out, except those that rest above 0 (a centred
// pan, an open dimmer): for them a 0 is a choice, and leaving it out would bring the channel back to its resting value
// when the look is played.
function captureValues(patch) {
  const values = {};
  for (const [channel, info] of patch.channels) {
    const value = frameStore.get()[channel - 1] ?? 0;
    if (value > 0 || info.defaultValue > 0) {
      values[channel] = value;
    }
  }
  return values;
}

// The "capture" strip: a live swatch of what the lights are doing now, so saving a look is saving what you see.
function LiveSwatch({ project, patch }) {
  const frame = useFrame();
  const values = {};
  frame.forEach((value, index) => {
    if (value > 0) {
      values[index + 1] = value;
    }
  });
  const colors = fixtureColors(project, patch, values);
  const lit = colors.filter((color) => color.level > 0.02).length;
  return (
    <div className="capture-live">
      <span className="capture-swatch" style={{ background: sceneGradient(colors) }} aria-hidden="true" />
      <span className="capture-caption">
        <strong>On stage now</strong>
        <span>{lit === 0 ? 'Everything is dark' : `${lit} of ${colors.length} lights lit`}</span>
      </span>
    </div>
  );
}

export function ScenesView({ project, patch, update, flush, live }) {
  const [name, setName] = useState('');
  const [fadeMs, setFadeMs] = useState(1000);

  const handleRecord = () => {
    const values = captureValues(patch);
    const sceneName = name.trim() || `Look ${project.scenes.length + 1}`;
    update((current) => ({
      ...current,
      scenes: [...current.scenes, { id: crypto.randomUUID(), name: sceneName, values }],
    }));
    setName('');
  };
  const handleRename = (id, newName) =>
    update((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => (scene.id === id ? { ...scene, name: newName } : scene)),
    }));
  const handleDuplicate = (id) =>
    update((current) => {
      const index = current.scenes.findIndex((scene) => scene.id === id);
      if (index === -1) {
        return current;
      }
      const copy = { ...current.scenes[index], id: crypto.randomUUID(), name: `${current.scenes[index].name} copy` };
      const scenes = [...current.scenes];
      scenes.splice(index + 1, 0, copy);
      return { ...current, scenes };
    });
  const handleCapture = (id) => {
    const values = captureValues(patch);
    update((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => (scene.id === id ? { ...scene, values } : scene)),
    }));
  };
  const handleDelete = (id) =>
    update((current) => ({
      ...current,
      scenes: current.scenes.filter((scene) => scene.id !== id),
      chases: current.chases.map((chase) => ({ ...chase, steps: chase.steps.filter((step) => step.sceneId !== id) })),
    }));
  const handleRecall = async (sceneId, fade) => {
    await flush();
    live.send({ type: 'recall', sceneId, fadeMs: fade });
  };

  return (
    <section className="view" aria-labelledby="scenes-title">
      <div className="view-header">
        <div>
          <h1 className="view-title" id="scenes-title">
            Looks
          </h1>
          <p className="view-sub">Save what is on stage right now, then bring it back with one tap.</p>
        </div>
      </div>
      <div className="card capture-bar">
        <LiveSwatch project={project} patch={patch} />
        <label className="field capture-name">
          Name this look
          <input
            className="input"
            value={name}
            maxLength={80}
            placeholder="Warm wash"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleRecord}
          disabled={project.fixtures.length === 0}
        >
          <Icon name="record" size={16} />
          Save current look
        </button>
      </div>
      {project.scenes.length === 0 ? (
        <EmptyState
          icon="scenes"
          title="No looks saved yet"
          hint="Set the lights how you like them, then save the look here."
        />
      ) : (
        <>
          <div className="pad-section-head">
            <h2 className="section-title">
              Saved looks
              <span className="section-count">{project.scenes.length}</span>
            </h2>
            <label className="field field-inline">
              Fade when playing
              <select
                className="select select-compact"
                value={fadeMs}
                onChange={(event) => setFadeMs(Number(event.target.value))}
              >
                {FADE_OPTIONS.map((ms) => (
                  <option key={ms} value={ms}>
                    {ms === 0 ? 'Instant' : `${ms / 1000} s`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="scene-grid">
            {project.scenes.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                project={project}
                patch={patch}
                fadeMs={fadeMs}
                isActive={live.engine.activeSceneId === scene.id}
                onRecall={handleRecall}
                onRename={handleRename}
                onDuplicate={handleDuplicate}
                onCapture={handleCapture}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
