// Lights: choose a colour and brightness for all or selected fixtures; fine-tune single channels per fixture.
import { useEffect, useState } from 'react';

import { useFrame } from '../hooks/frameStore.js';
import { applyColor } from '../utils/colorControl.js';
import { averageColor, fixtureColor } from '../utils/sceneColors.js';
import { ColorStudio } from './ColorStudio.jsx';
import { EmptyState } from './EmptyState.jsx';
import { FixtureTile } from './FixtureTile.jsx';

export function ControlView({ project, patch, live }) {
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
        <EmptyState title="No lights yet" hint="Add your fixtures in Setup, then come back here to colour them." />
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
          </aside>
        </div>
      )}
    </section>
  );
}
