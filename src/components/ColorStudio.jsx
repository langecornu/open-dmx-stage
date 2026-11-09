// Colour studio: pick a colour and brightness and apply it to the selected fixtures (or all of them).
import { hexFromRgb, rgbFromHex } from '../utils/sceneColors.js';

export const SWATCHES = [
  { name: 'Off', rgb: [0, 0, 0] },
  { name: 'Warm white', rgb: [255, 190, 120] },
  { name: 'Daylight', rgb: [255, 255, 255] },
  { name: 'Red', rgb: [255, 32, 48] },
  { name: 'Orange', rgb: [255, 110, 20] },
  { name: 'Amber', rgb: [255, 176, 32] },
  { name: 'Yellow', rgb: [255, 230, 40] },
  { name: 'Lime', rgb: [140, 240, 40] },
  { name: 'Green', rgb: [20, 220, 90] },
  { name: 'Cyan', rgb: [20, 220, 230] },
  { name: 'Blue', rgb: [40, 90, 255] },
  { name: 'Purple', rgb: [150, 70, 255] },
  { name: 'Magenta', rgb: [255, 50, 200] },
];

const isSameColor = (a, b) => a.every((part, index) => part === b[index]);

export function ColorStudio({ color, brightness, liveColor, isInSync, targetLabel, onColor, onBrightness }) {
  const [r, g, b] = color;
  // The preview shows what the targeted fixtures are really emitting, not the last colour that was clicked.
  const previewColor = liveColor.css;
  const glow = Math.max(liveColor.r, liveColor.g, liveColor.b);

  return (
    <section className="card card-pad studio" aria-label="Colour studio">
      <div className="studio-preview" aria-hidden="true">
        <div
          className="studio-orb"
          style={{
            background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.6), transparent 42%), ${previewColor}`,
            boxShadow: `0 0 ${20 + glow / 4}px ${glow / 14}px ${previewColor}`,
          }}
        />
      </div>
      <div className="studio-body">
        <div className="studio-target">
          <span>Colour</span>
          <small>Applies to: {targetLabel}</small>
        </div>
        <div className="swatches" role="group" aria-label="Quick colours">
          {SWATCHES.map((swatch) => (
            <button
              key={swatch.name}
              type="button"
              className="swatch"
              title={swatch.name}
              aria-label={swatch.name}
              aria-pressed={isInSync && isSameColor(color, swatch.rgb)}
              style={{ background: swatch.name === 'Off' ? 'var(--surface-3)' : `rgb(${swatch.rgb.join(',')})` }}
              onClick={() => onColor(swatch.rgb)}
            />
          ))}
          <label className="swatch swatch-custom" title="Pick any colour">
            <span className="sr-only">Pick any colour</span>
            <input
              type="color"
              value={hexFromRgb(r, g, b)}
              onChange={(event) => onColor(rgbFromHex(event.target.value))}
            />
          </label>
        </div>
        <label className="slider-row">
          Brightness
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(brightness * 100)}
            onChange={(event) => onBrightness(Number(event.target.value) / 100)}
          />
          <span className="slider-value">{Math.round(brightness * 100)}%</span>
        </label>
      </div>
    </section>
  );
}
