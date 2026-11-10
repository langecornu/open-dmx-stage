// Turns a show into the list of big buttons on the Perform screen: every look, then every sequence, each with a
// gradient preview of what it looks like.
import { averageColor, fixtureColors, sceneGradient } from './sceneColors.js';

/**
 * @param {import('../../shared/types.js').Project} project
 * @param {import('../../shared/types.js').Patch} patch
 * @returns {{ action: import('./midi.js').Action, name: string, kind: 'Look' | 'Sequence', gradient: string }[]}
 */
export function buildPerformItems(project, patch) {
  const colours = (/** @type {Record<string, number>} */ values) => fixtureColors(project, patch, values);
  const looks = project.scenes.map((scene) => ({
    action: /** @type {const} */ ({ type: 'look', id: scene.id }),
    name: scene.name,
    kind: /** @type {const} */ ('Look'),
    gradient: sceneGradient(colours(scene.values)),
  }));
  const sequences = project.chases.map((chase) => {
    const stepColours = chase.steps.map((step) =>
      averageColor(colours(project.scenes.find((scene) => scene.id === step.sceneId)?.values ?? {})),
    );
    return {
      action: /** @type {const} */ ({ type: 'sequence', id: chase.id }),
      name: chase.name,
      kind: /** @type {const} */ ('Sequence'),
      gradient: sceneGradient(stepColours),
    };
  });
  return [...looks, ...sequences];
}
