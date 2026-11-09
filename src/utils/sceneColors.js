// Derives display colours from DMX values: per fixture (orbs, swatches) and for whole scenes.
const CLEAR = { r: 0, g: 0, b: 0, level: 0, css: 'transparent' };

// valueOf(channel) -> 0-255. Returns the colour a fixture is emitting and how bright it is (0-1).
export function fixtureColor(range, patch, valueOf) {
  if (!range || range.missingType) {
    return CLEAR;
  }
  let red = 0;
  let green = 0;
  let blue = 0;
  let dimmer = null;
  let hasColor = false;
  for (let channel = range.start; channel <= Math.min(range.end, 512); channel += 1) {
    const info = patch.channels.get(channel);
    const value = valueOf(channel);
    if (info.type === 'red') {
      red = value;
      hasColor = true;
    } else if (info.type === 'green') {
      green = value;
      hasColor = true;
    } else if (info.type === 'blue') {
      blue = value;
      hasColor = true;
    } else if (info.type === 'white') {
      red = Math.min(255, red + value);
      green = Math.min(255, green + value);
      blue = Math.min(255, blue + value);
      hasColor = true;
    } else if (info.type === 'intensity' && dimmer === null) {
      dimmer = value / 255;
    }
  }
  if (!hasColor && dimmer !== null) {
    red = green = blue = 255;
  }
  const scale = dimmer ?? 1;
  const r = Math.round(red * scale);
  const g = Math.round(green * scale);
  const b = Math.round(blue * scale);
  return { r, g, b, level: Math.max(r, g, b) / 255, css: `rgb(${r}, ${g}, ${b})` };
}

export function fixtureColors(project, patch, values) {
  return project.fixtures
    .map((fixture) =>
      fixtureColor(
        patch.fixtures.find((entry) => entry.id === fixture.id),
        patch,
        (ch) => values[ch] ?? 0,
      ),
    )
    .filter((color) => color !== CLEAR);
}

// A soft horizontal gradient across the lit fixtures of a scene; neutral when everything is dark.
export function sceneGradient(colors) {
  const lit = colors.filter((color) => color.level > 0.02);
  if (lit.length === 0) {
    return 'linear-gradient(135deg, var(--surface-3), var(--surface-2))';
  }
  if (lit.length === 1) {
    return `linear-gradient(135deg, ${lit[0].css}, ${lit[0].css})`;
  }
  return `linear-gradient(120deg, ${lit.map((color) => color.css).join(', ')})`;
}

export function hexFromRgb(red, green, blue) {
  return `#${[red, green, blue].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

export function rgbFromHex(hex) {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}
