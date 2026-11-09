// Turns "this colour at this brightness" into raw DMX channel values for one patched fixture.
export function applyColor(range, patch, [red, green, blue], brightness) {
  if (!range || range.missingType) {
    return {};
  }
  const slots = {};
  for (let channel = range.start; channel <= Math.min(range.end, 512); channel += 1) {
    const type = patch.channels.get(channel).type;
    if (!(type in slots)) {
      slots[type] = channel;
    }
  }
  const values = {};
  const hasRgb = slots.red && slots.green && slots.blue;
  if (hasRgb) {
    // With a dimmer channel the colour stays pure and the dimmer carries brightness; otherwise scale the colour.
    const scale = slots.intensity ? 1 : brightness;
    values[slots.red] = Math.round(red * scale);
    values[slots.green] = Math.round(green * scale);
    values[slots.blue] = Math.round(blue * scale);
    if (slots.white) {
      values[slots.white] = 0;
    }
    if (slots.amber) {
      values[slots.amber] = 0;
    }
    if (slots.uv) {
      values[slots.uv] = 0;
    }
  }
  if (slots.intensity) {
    const isOff = red === 0 && green === 0 && blue === 0 && hasRgb;
    values[slots.intensity] = isOff ? 0 : Math.round(255 * brightness);
  } else if (!hasRgb) {
    return {};
  }
  return values;
}
