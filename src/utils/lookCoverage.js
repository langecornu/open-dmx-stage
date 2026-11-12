// Which lights a look sets, and filling lights added after the looks were saved. A look stores DMX channel values, so a
// light added later is in none of them and stays dark when they play. Filling copies, in every look, the values of a
// light of the same type and mode onto each new light, in rig order: with Par 1 and Par 2 in the looks and Par 3 and
// Par 4 added, Par 1 is copied to Par 3 and Par 2 to Par 4, so a look keeps its pattern across the rig.

/**
 * @param {import('../../shared/types.js').Patch} patch
 * @param {string} fixtureId
 * @returns {{ start: number, end: number } | null} the light's channels, or null when it cannot be placed
 */
function rangeOf(patch, fixtureId) {
  const range = patch.fixtures.find((entry) => entry.id === fixtureId);
  return range && !range.missingType ? range : null;
}

/**
 * @param {Record<string, number>} values a look's channel values
 * @param {{ start: number, end: number } | null} range
 * @returns {boolean} whether the look sets any channel of that light
 */
function setsAny(values, range) {
  if (!range) {
    return false;
  }
  for (let channel = range.start; channel <= range.end; channel += 1) {
    if (values[channel] !== undefined) {
      return true;
    }
  }
  return false;
}

/**
 * @param {{ fixtures: { id: string, name: string }[] }} project
 * @param {import('../../shared/types.js').Patch} patch
 * @param {Record<string, number>} values
 * @returns {{ id: string, name: string }[]} the lights the look sets, in rig order
 */
export function lightsInLook(project, patch, values) {
  return project.fixtures.filter((fixture) => setsAny(values, rangeOf(patch, fixture.id)));
}

/**
 * Lights that no look sets, each paired with a light of the same type and mode that the looks do set, to copy from.
 * Lights with no such partner are left out: there is nothing sensible to copy.
 * @param {{ fixtures: { id: string, name: string, typeId: string, mode: number }[], scenes: { values: Record<string, number> }[] }} project
 * @param {import('../../shared/types.js').Patch} patch
 * @returns {{ from: { id: string, name: string }, to: { id: string, name: string } }[]}
 */
export function planFill(project, patch) {
  if (project.scenes.length === 0) {
    return [];
  }
  const inSomeLook = (fixture) => project.scenes.some((scene) => setsAny(scene.values, rangeOf(patch, fixture.id)));
  const covered = project.fixtures.filter(inSomeLook);
  const uncovered = project.fixtures.filter((fixture) => !inSomeLook(fixture) && rangeOf(patch, fixture.id));
  /** @type {Map<string, number>} how many new lights of a kind have been paired so far */
  const used = new Map();
  const plan = [];
  for (const fixture of uncovered) {
    const kind = `${fixture.typeId}:${fixture.mode}`;
    const sources = covered.filter((candidate) => `${candidate.typeId}:${candidate.mode}` === kind);
    if (sources.length > 0) {
      const index = used.get(kind) ?? 0;
      used.set(kind, index + 1);
      plan.push({ from: sources[index % sources.length], to: fixture });
    }
  }
  return plan;
}

/**
 * @template {{ values: Record<string, number> }} Scene
 * @param {Scene[]} scenes
 * @param {import('../../shared/types.js').Patch} patch
 * @param {ReturnType<typeof planFill>} plan
 * @returns {Scene[]} the looks with each new light set like its partner (a value already set is kept)
 */
export function fillLooks(scenes, patch, plan) {
  return scenes.map((scene) => {
    const values = { ...scene.values };
    for (const { from, to } of plan) {
      const source = rangeOf(patch, from.id);
      const target = rangeOf(patch, to.id);
      if (!source || !target) {
        continue;
      }
      for (let offset = 0; offset <= source.end - source.start; offset += 1) {
        const value = scene.values[source.start + offset];
        const channel = target.start + offset;
        if (value !== undefined && values[channel] === undefined && channel <= target.end) {
          values[channel] = value;
        }
      }
    }
    return { ...scene, values };
  });
}

/** @param {string[]} names @returns {string} "Par 3", "Par 3 and Par 4", "Par 3, Par 4 and Par 5" */
export function listNames(names) {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
