// Turns a show into the list of pads on the Perform screen: every look, then every sequence, each with a gradient
// preview of what it looks like. A sequence also lists the colour of each step, for the strip on its pad; a sequence
// made of blocks only shows its blocks' colours.
import { averageColor, fixtureColors, sceneGradient } from './sceneColors.js';
import { timelineGradient } from './timelineEdit.js';

/**
 * @param {import('../../shared/types.js').Project} project
 * @param {import('../../shared/types.js').Patch} patch
 * @returns {{
 *   action: import('./midi.js').Action,
 *   name: string,
 *   kind: 'Look' | 'Sequence',
 *   gradient: string,
 *   detail: string,
 *   steps: { id: string, colour: string }[],
 * }[]}
 */
export function buildPerformItems(project, patch) {
  const colours = (/** @type {Record<string, number>} */ values) => fixtureColors(project, patch, values);
  const looks = project.scenes.map((scene) => ({
    action: /** @type {const} */ ({ type: 'look', id: scene.id }),
    name: scene.name,
    kind: /** @type {const} */ ('Look'),
    gradient: sceneGradient(colours(scene.values)),
    detail: 'Look',
    steps: /** @type {{ id: string, colour: string }[]} */ ([]),
  }));
  const scenesById = new Map(project.scenes.map((scene) => [scene.id, scene]));
  const sequences = project.chases.map((chase) => {
    // The engine skips steps whose look was deleted, so the strip does too and its segments match the step on stage.
    const playable = chase.steps.filter((step) => scenesById.has(step.sceneId));
    const stepColours = playable.map((step) => averageColor(colours(scenesById.get(step.sceneId)?.values ?? {})));
    return {
      action: /** @type {const} */ ({ type: 'sequence', id: chase.id }),
      name: chase.name,
      kind: /** @type {const} */ ('Sequence'),
      gradient: playable.length > 0 ? sceneGradient(stepColours) : timelineGradient(chase),
      detail: [
        playable.length > 0 || (chase.blocks ?? []).length === 0
          ? `${playable.length} ${playable.length === 1 ? 'step' : 'steps'}`
          : null,
        (chase.blocks ?? []).length > 0
          ? `${chase.blocks.length} ${chase.blocks.length === 1 ? 'block' : 'blocks'}`
          : null,
        chase.loop ? 'loops' : 'plays once',
      ]
        .filter(Boolean)
        .join(' · '),
      steps: playable.map((step, index) => ({
        id: step.id,
        colour: stepColours[index].level > 0.02 ? stepColours[index].css : 'var(--surface-3)',
      })),
    };
  });
  return [...looks, ...sequences];
}
