// Which light of one rig stands in for each light of another: used when a sequence file is imported into a show, and
// when a show moves to another venue. A light only ever stands in for one of the same kind (fixture type and mode), so
// its channels mean the same things. Pure.

/** @typedef {{ id: string, name: string, typeId: string, mode: number }} LightLike */

/** @param {{ typeId: string, mode: number }} light @returns {string} */
export const kindOf = (light) => `${light.typeId}:${light.mode}`;

/**
 * Matches in three passes, each only among lights not yet taken: the same light (same id, when `byId`), then the same
 * name, then the next light of the same kind in rig order.
 * @template {LightLike} T
 * @param {LightLike[]} from
 * @param {T[]} to
 * @param {{ byId?: boolean }} [options]
 * @returns {Map<string, T>} from-light id to the light that stands in for it
 */
export function matchLights(from, to, { byId = false } = {}) {
  const taken = new Set();
  /** @type {Map<string, T>} */
  const matches = new Map();
  /** @param {(light: LightLike, candidate: LightLike) => boolean} isMatch */
  const pass = (isMatch) => {
    for (const light of from) {
      if (matches.has(light.id)) {
        continue;
      }
      const target = to.find(
        (candidate) => !taken.has(candidate.id) && kindOf(candidate) === kindOf(light) && isMatch(light, candidate),
      );
      if (target) {
        taken.add(target.id);
        matches.set(light.id, target);
      }
    }
  };
  if (byId) {
    pass((light, candidate) => candidate.id === light.id);
  }
  pass((light, candidate) => candidate.name === light.name);
  pass(() => true);
  return matches;
}
