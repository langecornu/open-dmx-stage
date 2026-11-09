// First-run welcome: three short steps (hello, pick your lights, ready) shown until the rig has fixtures.
import { useState } from 'react';

import { planFixtures } from '../utils/patchTools.js';
import { Icon } from './Icon.jsx';

const STEPS = ['Welcome', 'Your lights', 'Ready'];

export function Welcome({ project, library, patch, update, output, onDone }) {
  const [step, setStep] = useState(0);
  const [quantities, setQuantities] = useState({});

  const handleQuantity = (id, delta) =>
    setQuantities((current) => ({ ...current, [id]: Math.max(0, Math.min(32, (current[id] ?? 0) + delta)) }));

  const handleContinue = () => {
    let plannedProject = project;
    let plannedPatch = patch;
    const additions = [];
    for (const type of library) {
      const quantity = quantities[type.id] ?? 0;
      if (quantity > 0) {
        const plan = planFixtures({ project: plannedProject, patch: plannedPatch, type, modeIndex: 0, quantity });
        additions.push(...plan.additions);
        // Re-plan against the fixtures added so far so addresses do not collide.
        plannedProject = { ...plannedProject, fixtures: [...plannedProject.fixtures, ...plan.additions] };
        plannedPatch = {
          ...plannedPatch,
          channels: new Map(plannedPatch.channels),
        };
        for (const fixture of plan.additions) {
          const count = type.modes[0].channels.length;
          for (let offset = 0; offset < count; offset += 1) {
            plannedPatch.channels.set(fixture.address + offset, {});
          }
        }
      }
    }
    if (additions.length > 0) {
      update((current) => ({ ...current, fixtures: [...current.fixtures, ...additions] }));
    }
    setStep(2);
  };

  const total = Object.values(quantities).reduce((sum, value) => sum + value, 0);
  const hardware = output && output.driver !== 'mock';

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome-card card">
        <div className="welcome-brand">
          <div className="brand-mark" aria-hidden="true" />
          <ol className="welcome-steps" aria-label="Progress">
            {STEPS.map((label, index) => (
              <li key={label} aria-current={index === step ? 'step' : undefined} data-done={index < step}>
                <span className="welcome-dot">{index < step ? <Icon name="check" size={12} /> : index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        </div>

        {step === 0 ? (
          <div className="welcome-body">
            <h1 id="welcome-title" className="welcome-title">
              Welcome to Open DMX Stage
            </h1>
            <p className="view-sub">
              Colour your lights, save looks, and chain them into a show, all from your browser. Setting up takes under
              a minute.
            </p>
            <ul className="welcome-points">
              <li>
                <Icon name="control" /> Pick colours and brightness with one tap
              </li>
              <li>
                <Icon name="scenes" /> Save looks and bring them back instantly
              </li>
              <li>
                <Icon name="chases" /> Chain looks into sequences with smooth fades
              </li>
            </ul>
            <div className="welcome-actions">
              <button type="button" className="btn btn-primary" onClick={() => setStep(1)}>
                Get started
              </button>
              <button type="button" className="btn btn-ghost" onClick={onDone}>
                Skip for now
              </button>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="welcome-body">
            <h1 id="welcome-title" className="welcome-title">
              What lights do you have?
            </h1>
            <p className="view-sub">
              Choose how many of each. They get DMX addresses automatically. You can import real fixture files later in
              Setup.
            </p>
            <div className="welcome-types">
              {library.map((type) => (
                <div key={type.id} className="welcome-type">
                  <span>
                    <strong>{type.name}</strong>
                    <br />
                    <span className="rig-meta">
                      {type.modes[0].channels.length} {type.modes[0].channels.length === 1 ? 'channel' : 'channels'}
                    </span>
                  </span>
                  <span className="stepper">
                    <button
                      type="button"
                      className="btn btn-icon"
                      aria-label={`Fewer ${type.name}`}
                      disabled={(quantities[type.id] ?? 0) === 0}
                      onClick={() => handleQuantity(type.id, -1)}
                    >
                      −
                    </button>
                    <output aria-label={`${type.name} quantity`}>{quantities[type.id] ?? 0}</output>
                    <button
                      type="button"
                      className="btn btn-icon"
                      aria-label={`More ${type.name}`}
                      onClick={() => handleQuantity(type.id, 1)}
                    >
                      +
                    </button>
                  </span>
                </div>
              ))}
            </div>
            <div className="welcome-actions">
              <button type="button" className="btn btn-primary" onClick={handleContinue} disabled={total === 0}>
                Add {total > 0 ? `${total} light${total === 1 ? '' : 's'}` : 'lights'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>
                Back
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="welcome-body">
            <h1 id="welcome-title" className="welcome-title">
              You are ready to light up
            </h1>
            <p className="view-sub">
              {hardware
                ? 'Your DMX interface is connected. Anything you do now goes to the real lights.'
                : 'You are running in simulator mode, so nothing is sent to real lights yet. To use a DMX interface, set DMX_DRIVER and DMX_SERIAL_PATH (see the README).'}
            </p>
            <div className="welcome-actions">
              <button type="button" className="btn btn-primary" onClick={onDone}>
                Start lighting
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
