// Chases: ordered scene steps with fade and hold times; play, loop and edit.
import { useState } from 'react';

import { fixtureColors, sceneGradient } from '../utils/sceneColors.js';
import { SequenceTimeline } from './SequenceTimeline.jsx';
import { EmptyState } from './EmptyState.jsx';
import { Icon } from './Icon.jsx';

const clampMs = (raw) => Math.max(0, Math.min(600000, Math.round(Number(raw) * 1000) || 0));

export function ChasesView({ project, patch, update, flush, live }) {
  const [selectedId, setSelectedId] = useState(project.chases[0]?.id ?? null);
  const chase = project.chases.find((candidate) => candidate.id === selectedId) ?? null;
  const isPlaying = chase && live.engine.activeChaseId === chase.id;

  const patchChase = (id, changes) =>
    update((current) => ({ ...current, chases: current.chases.map((c) => (c.id === id ? { ...c, ...changes } : c)) }));

  const handlePlay = async () => {
    await flush();
    live.send({ type: 'chaseStart', chaseId: chase.id });
  };

  const handleCreate = () => {
    const created = { id: crypto.randomUUID(), name: `Sequence ${project.chases.length + 1}`, loop: true, steps: [] };
    update((current) => ({ ...current, chases: [...current.chases, created] }));
    setSelectedId(created.id);
  };
  const handleDelete = () => {
    update((current) => ({ ...current, chases: current.chases.filter((c) => c.id !== chase.id) }));
    setSelectedId(null);
  };
  const handleAddStep = () => {
    const firstScene = project.scenes[0];
    if (firstScene) {
      patchChase(chase.id, { steps: [...chase.steps, { sceneId: firstScene.id, fadeMs: 1000, holdMs: 2000 }] });
    }
  };
  const handleStep = (index, changes) =>
    patchChase(chase.id, { steps: chase.steps.map((step, i) => (i === index ? { ...step, ...changes } : step)) });
  const handleRemoveStep = (index) => patchChase(chase.id, { steps: chase.steps.filter((_, i) => i !== index) });
  const handleMove = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= chase.steps.length) {
      return;
    }
    const steps = [...chase.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    patchChase(chase.id, { steps });
  };

  return (
    <section className="view" aria-labelledby="chases-title">
      <div className="view-header">
        <div>
          <h1 className="view-title" id="chases-title">
            Sequences
          </h1>
          <p className="view-sub">Chain your looks into a show with timed fades.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={handleCreate}>
          <Icon name="plus" />
          New sequence
        </button>
      </div>

      {project.chases.length === 0 ? (
        <EmptyState title="No sequences yet" hint="Save a few looks first, then chain them into a sequence." />
      ) : (
        <div className="split">
          <div className="card list" role="list">
            {project.chases.map((item) => (
              <button
                key={item.id}
                type="button"
                role="listitem"
                className="list-item"
                aria-current={item.id === selectedId}
                onClick={() => setSelectedId(item.id)}
              >
                {item.name}
                {live.engine.activeChaseId === item.id ? <span className="badge badge-live">Playing</span> : null}
              </button>
            ))}
          </div>

          {chase ? (
            <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="toolbar">
                <label className="field">
                  Name
                  <input
                    className="input"
                    value={chase.name}
                    maxLength={80}
                    onChange={(e) => patchChase(chase.id, { name: e.target.value || chase.name })}
                  />
                </label>
                <label className="pill">
                  <input
                    type="checkbox"
                    checked={chase.loop}
                    onChange={(e) => patchChase(chase.id, { loop: e.target.checked })}
                  />
                  Loop
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
                    disabled={chase.steps.length === 0}
                    onClick={handlePlay}
                  >
                    <Icon name="chases" size={16} />
                    Play
                  </button>
                )}
                <button type="button" className="btn btn-danger" onClick={handleDelete}>
                  <Icon name="trash" size={16} />
                  Delete
                </button>
              </div>

              {chase.steps.length > 0 ? (
                <SequenceTimeline
                  chase={chase}
                  project={project}
                  patch={patch}
                  playingIndex={isPlaying ? live.engine.chaseStep : null}
                />
              ) : null}
              {chase.steps.length > 0 ? (
                <div className="step-row step-head" aria-hidden="true">
                  <span />
                  <span />
                  <span>Look</span>
                  <span>Fade (s)</span>
                  <span>Hold (s)</span>
                  <span />
                </div>
              ) : null}
              {chase.steps.map((step, index) => (
                <div key={index} className="step-row" data-playing={isPlaying && live.engine.chaseStep === index}>
                  <span className="step-index">{index + 1}</span>
                  <span
                    className="step-thumb"
                    aria-hidden="true"
                    style={{
                      background: sceneGradient(
                        fixtureColors(
                          project,
                          patch,
                          project.scenes.find((scene) => scene.id === step.sceneId)?.values ?? {},
                        ),
                      ),
                    }}
                  />
                  <select
                    className="select"
                    aria-label={`Look for step ${index + 1}`}
                    value={step.sceneId}
                    onChange={(e) => handleStep(index, { sceneId: e.target.value })}
                  >
                    {project.scenes.map((scene) => (
                      <option key={scene.id} value={scene.id}>
                        {scene.name}
                      </option>
                    ))}
                  </select>
                  <label className="field">
                    <span className="sr-only">Fade seconds</span>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.1"
                      aria-label={`Fade seconds for step ${index + 1}`}
                      value={step.fadeMs / 1000}
                      onChange={(e) => handleStep(index, { fadeMs: clampMs(e.target.value) })}
                    />
                  </label>
                  <label className="field">
                    <span className="sr-only">Hold seconds</span>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.1"
                      aria-label={`Hold seconds for step ${index + 1}`}
                      value={step.holdMs / 1000}
                      onChange={(e) => handleStep(index, { holdMs: clampMs(e.target.value) })}
                    />
                  </label>
                  <span style={{ display: 'flex', gap: 2 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label={`Move step ${index + 1} up`}
                      onClick={() => handleMove(index, -1)}
                    >
                      <Icon name="up" size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label={`Move step ${index + 1} down`}
                      onClick={() => handleMove(index, 1)}
                    >
                      <Icon name="down" size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-danger"
                      aria-label={`Remove step ${index + 1}`}
                      onClick={() => handleRemoveStep(index)}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </span>
                </div>
              ))}
              <div>
                <button type="button" className="btn" onClick={handleAddStep} disabled={project.scenes.length === 0}>
                  <Icon name="plus" size={16} />
                  Add step
                </button>
                {project.scenes.length === 0 ? <span className="fixture-meta"> Save a look first.</span> : null}
              </div>
            </div>
          ) : (
            <EmptyState title="Pick a sequence" hint="Choose one on the left or create a new one." />
          )}
        </div>
      )}
    </section>
  );
}
