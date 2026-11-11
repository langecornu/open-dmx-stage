// Looks (scenes): save what is on stage, then recall it with a fade.
import { useState } from 'react';

import { frameStore } from '../hooks/frameStore.js';
import { fixtureColors, sceneGradient } from '../utils/sceneColors.js';
import { EmptyState } from './EmptyState.jsx';
import { Icon } from './Icon.jsx';

const FADE_OPTIONS = [0, 500, 1000, 2000, 5000];

function SceneCard({ scene, project, patch, isActive, fadeMs, onRecall, onRename, onDelete }) {
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
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-danger"
            aria-label={`Delete look ${scene.name}`}
            onClick={() => onDelete(scene.id)}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}

export function ScenesView({ project, patch, update, flush, live }) {
  const [name, setName] = useState('');
  const [fadeMs, setFadeMs] = useState(1000);

  const handleRecord = () => {
    const values = {};
    for (const [channel, info] of patch.channels) {
      const value = frameStore.get()[channel - 1] ?? 0;
      // Channels at 0 are left out, except those that rest above 0 (a centred pan, an open dimmer): for them a 0 is a
      // choice, and leaving it out would bring the channel back to its resting value when the look is played.
      if (value > 0 || info.defaultValue > 0) {
        values[channel] = value;
      }
    }
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
      <div className="card card-pad toolbar">
        <label className="field">
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
        <label className="field">
          Fade when playing
          <select className="select" value={fadeMs} onChange={(event) => setFadeMs(Number(event.target.value))}>
            {FADE_OPTIONS.map((ms) => (
              <option key={ms} value={ms}>
                {ms === 0 ? 'Instant' : `${ms / 1000} s`}
              </option>
            ))}
          </select>
        </label>
      </div>
      {project.scenes.length === 0 ? (
        <EmptyState
          icon="scenes"
          title="No looks saved yet"
          hint="Set the lights how you like them, then save the look here."
        />
      ) : (
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
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
}
