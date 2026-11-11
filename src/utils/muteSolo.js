// Mute and solo in plain words, shared by the Perform card and the On stage bar. Mirrors the engine: a muted light is
// dark, and while a light in the rig is soloed every other light is dark too.

/**
 * @param {{ id: string, name: string }[]} fixtures the rig, in order
 * @param {{ muted?: string[], soloed?: string[] }} engine
 * @returns {{ id: string, name: string, isMuted: boolean, isSoloed: boolean, isDark: boolean }[]}
 */
export function describeFixtures(fixtures, engine) {
  const muted = new Set(engine.muted ?? []);
  const soloed = new Set(engine.soloed ?? []);
  const isSoloActive = fixtures.some((fixture) => soloed.has(fixture.id));
  return fixtures.map((fixture) => {
    const isMuted = muted.has(fixture.id);
    const isSoloed = soloed.has(fixture.id);
    return { ...fixture, isMuted, isSoloed, isDark: isMuted || (isSoloActive && !isSoloed) };
  });
}

/**
 * One line for the On stage bar, or null when every light is free.
 * @param {{ id: string, name: string }[]} fixtures
 * @param {{ muted?: string[], soloed?: string[] }} engine
 * @returns {string | null}
 */
export function summariseMuteSolo(fixtures, engine) {
  const states = describeFixtures(fixtures, engine);
  const soloed = states.filter((state) => state.isSoloed).map((state) => state.name);
  const muted = states.filter((state) => state.isMuted).map((state) => state.name);
  const parts = [];
  if (soloed.length > 0) {
    parts.push(`Solo: ${soloed.join(', ')}`);
  }
  if (muted.length > 0) {
    parts.push(`Muted: ${muted.join(', ')}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
