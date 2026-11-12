// Lights: choose a colour and brightness for all or selected fixtures; fine-tune single channels per fixture.
import { useEffect, useMemo, useState } from 'react';

import {
  controlDmx,
  controlValueOf,
  controlsByFixture,
  matchOption,
  mergeControls,
} from '../../shared/capabilities.js';
import { indexFixtureTypes } from '../../shared/patch.js';

import { useFrame } from '../hooks/frameStore.js';
import { applyColor } from '../utils/colorControl.js';
import { averageColor, fixtureColor } from '../utils/sceneColors.js';
import { ColorStudio } from './ColorStudio.jsx';
import { EmptyState } from './EmptyState.jsx';
import { FixtureControls } from './FixtureControls.jsx';
import { FixtureTile } from './FixtureTile.jsx';
import { categoriesByFixture } from '../utils/deviceCategories.js';

export function ControlView({ project, patch, live, library = [] }) {
  const categories = categoriesByFixture(project, library);
  const [edits, setEdits] = useState({});
  const [selected, setSelected] = useState(() => new Set());
  const [color, setColor] = useState([255, 190, 120]);
  const [brightness, setBrightness] = useState(1);
  const overridden = new Set(live.engine.programmerChannels);
  const overrideCount = live.engine.programmerChannels.length;

  // When the server drops manual changes (a look or sequence took over), forget the local fader values too.
  useEffect(() => {
    if (overrideCount === 0) {
      setEdits({});
    }
  }, [overrideCount]);

  const frame = useFrame();
  const valueOf = (channel) => edits[channel] ?? frame[channel - 1] ?? 0;

  const patched = project.fixtures.filter((fixture) =>
    patch.fixtures.some((entry) => entry.id === fixture.id && !entry.missingType),
  );
  const rangeOf = (fixture) => patch.fixtures.find((entry) => entry.id === fixture.id);
  const targets = selected.size > 0 ? patched.filter((fixture) => selected.has(fixture.id)) : patched;
  const targetLabel = selected.size > 0 ? `${selected.size} selected` : 'all fixtures';

  const liveColor = averageColor(targets.map((fixture) => fixtureColor(rangeOf(fixture), patch, valueOf)));
  // Swatch highlight and slider only mean something while the output still matches the chosen colour.
  const expected = color.map((part) => part * brightness);
  const isInSync =
    Math.abs(liveColor.r - expected[0]) <= 12 &&
    Math.abs(liveColor.g - expected[1]) <= 12 &&
    Math.abs(liveColor.b - expected[2]) <= 12;

  // Pan, gobo, zoom, fog and the rest, for the lights the colour applies to. A value shown is what the first of them is
  // sending; a change goes to each of them, as manual changes, so it can be saved in a look.
  const controlsById = useMemo(
    () => controlsByFixture(project, indexFixtureTypes(project, library)),
    [project, library],
  );
  const targetControls = targets.map((fixture) => controlsById.get(fixture.id) ?? []);
  const moreControls = mergeControls(targetControls);
  const controlValues = Object.fromEntries(
    moreControls.map((control) => [
      control.key,
      controlValueOf(control, valueOf(control.channel), control.fineChannel ? valueOf(control.fineChannel) : 0),
    ]),
  );
  const handleControl = (key, value) => {
    const source = moreControls.find((control) => control.key === key);
    if (!source || value === undefined) {
      return;
    }
    const values = {};
    for (const controls of targetControls) {
      const control = controls.find((candidate) => candidate.key === key);
      if (!control) {
        continue;
      }
      let own = value;
      if (typeof value === 'object') {
        const option = matchOption(source, control, value.option);
        if (option < 0) {
          continue;
        }
        own = { option, level: value.level };
      }
      for (const [channel, dmx] of controlDmx(control, own)) {
        values[channel] = dmx;
      }
    }
    handleSet(values);
  };

  const handleSet = (values) => {
    setEdits((current) => ({ ...current, ...values }));
    live.setChannels(values);
  };
  const applyTo = (rgb, level) => {
    const values = {};
    for (const fixture of targets) {
      Object.assign(values, applyColor(rangeOf(fixture), patch, rgb, level));
    }
    handleSet(values);
  };
  const handleColor = (rgb) => {
    setColor(rgb);
    const level = brightness === 0 ? 1 : brightness;
    setBrightness(level);
    applyTo(rgb, level);
  };
  const handleBrightness = (level) => {
    setBrightness(level);
    applyTo(color, level);
  };
  const handleToggleSelect = (id) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  const handleClear = () => {
    setEdits({});
    live.send({ type: 'clearProgrammer' });
  };

  return (
    <section className="view" aria-labelledby="control-title">
      <div className="view-header">
        <div>
          <h1 className="view-title" id="control-title">
            Lights
          </h1>
          <p className="view-sub">Pick a colour, set the brightness, and watch your lights respond.</p>
        </div>
        <button type="button" className="btn" onClick={handleClear} disabled={overridden.size === 0}>
          Reset manual changes{overridden.size > 0 ? ` (${overridden.size})` : ''}
        </button>
      </div>

      {patched.length === 0 ? (
        <EmptyState
          icon="control"
          title="No lights yet"
          hint="Add your fixtures in Setup, then come back here to colour them."
        />
      ) : (
        <div className="lights-layout">
          <div className="lights-fixtures">
            <div className="section-bar">
              <h2 className="section-title">Fixtures</h2>
              <span className="section-actions">
                {selected.size > 0 ? (
                  <button type="button" className="btn btn-ghost" onClick={() => setSelected(new Set())}>
                    Clear selection
                  </button>
                ) : (
                  <span className="view-sub">Tap fixtures to pick which ones to colour</span>
                )}
                {selected.size < patched.length ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setSelected(new Set(patched.map((fixture) => fixture.id)))}
                  >
                    Select all
                  </button>
                ) : null}
              </span>
            </div>
            <div className="fixture-grid">
              {patched.map((fixture) => (
                <FixtureTile
                  key={fixture.id}
                  fixture={fixture}
                  category={categories.get(fixture.id)}
                  range={rangeOf(fixture)}
                  patch={patch}
                  valueOf={valueOf}
                  overridden={overridden}
                  isSelected={selected.has(fixture.id)}
                  onToggleSelect={handleToggleSelect}
                  onSet={handleSet}
                />
              ))}
            </div>
          </div>
          <aside className="lights-inspector" aria-label="Colour and brightness">
            <ColorStudio
              color={color}
              brightness={brightness}
              liveColor={liveColor}
              isInSync={isInSync}
              targetLabel={targetLabel}
              onColor={handleColor}
              onBrightness={handleBrightness}
            />
            {moreControls.length > 0 ? (
              <section className="card card-pad lights-more" aria-label="More controls">
                <h2 className="section-title">More controls</h2>
                <p className="fixture-meta">
                  Movement, gobos, fog and more, for {targetLabel}. Changes are manual changes, saved with a look.
                </p>
                <FixtureControls controls={moreControls} values={controlValues} onChange={handleControl} />
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </section>
  );
}
