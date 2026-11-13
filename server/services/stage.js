// The show on stage: keeps the engine in step with the show being worked on (its channels, controls and resting
// values), and changes which show that is. A show that takes the stage clears everything the old one had playing, and
// the old one is kept in the show list first, so nothing is lost.
import { controlsByFixture } from '../../shared/capabilities.js';
import {
  buildPatch,
  channelsByFixture,
  indexFixtureTypes,
  levelChannelsOf,
  restingValuesOf,
} from '../../shared/patch.js';
import { httpError } from '../utils/httpError.js';
import { BUILTIN_FIXTURE_TYPES } from './fixtureLibrary.js';
import { isEmptyShow } from './showLibrary.js';

/**
 * @param {{
 *   engine: import('./dmxEngine.js').DmxEngine,
 *   projectService: import('./projectService.js').ProjectService,
 *   shows: import('./showLibrary.js').ShowLibrary,
 * }} options
 */
export function createStage({ engine, projectService, shows }) {
  /**
   * Tells the engine about a show's lights.
   * @param {import('../../shared/types.js').Project} project
   */
  const sync = (project) => {
    const patch = buildPatch(project, BUILTIN_FIXTURE_TYPES);
    engine.setLevelChannels(levelChannelsOf(patch));
    engine.setFixtureChannels(channelsByFixture(patch));
    engine.setFixtureControls(controlsByFixture(project, indexFixtureTypes(project, BUILTIN_FIXTURE_TYPES)));
    engine.setRestingValues(restingValuesOf(patch));
  };

  // Another show takes the stage: nothing of the old one keeps playing.
  const clear = () => {
    engine.stopAuto();
    engine.stopChase();
    engine.releaseScene(0);
    engine.clearProgrammer();
    engine.stopEffect();
    engine.clearMuteSolo();
  };

  /**
   * Makes `next` the show being worked on. The current one goes to the show list first (unless it is empty), so
   * nothing is lost; while the saved show is from a newer version of the app, it is left alone and this refuses.
   * @param {import('../../shared/types.js').Project} next
   * @param {{ replaceNewerShow?: boolean }} [options]
   * @returns {Promise<import('../../shared/types.js').Project>} the show as saved
   * @throws {Error} 409 while the saved show is from a newer version, unless `replaceNewerShow`
   */
  const takeTheStage = async (next, { replaceNewerShow = false } = {}) => {
    if (projectService.lockedReason && !replaceNewerShow) {
      throw httpError(409, projectService.lockedReason);
    }
    const current = projectService.get();
    if (!projectService.lockedReason && !isEmptyShow(current)) {
      await shows.write(current);
    }
    const saved = await projectService.save(next, { replaceNewerShow });
    clear();
    sync(saved);
    return saved;
  };

  sync(projectService.get());
  return { sync, takeTheStage };
}
