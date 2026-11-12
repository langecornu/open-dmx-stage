// Playing a pad: a look or a sequence. Shared by Perform and Home so a pad behaves the same
// everywhere: a look plays with a fade, and a playing sequence stops when its pad is pressed again.

/**
 * @param {{ type: string, id?: string }} action
 * @param {{ activeSceneId: string | null, activeChaseId: string | null }} engine
 * @returns {boolean} whether this pad's look or sequence is what is on stage
 */
export function isActionPlaying(action, engine) {
  if (action.type === 'look') {
    return engine.activeSceneId === action.id && engine.activeChaseId === null;
  }
  if (action.type === 'sequence') {
    return engine.activeChaseId === action.id;
  }
  return false;
}

/**
 * Sends what a pad press means. Anything that starts playing saves pending edits first, so the show played is the one
 * on screen.
 * @param {{
 *   action: { type: string, id?: string },
 *   engine: Parameters<typeof isActionPlaying>[1],
 *   send: (message: object) => void,
 *   flush: () => Promise<void>,
 *   fadeMs: number,
 * }} input
 * @returns {Promise<void>}
 */
export async function playAction({ action, engine, send, flush, fadeMs }) {
  if (action.type !== 'look' && isActionPlaying(action, engine)) {
    send({ type: 'chaseStop' });
    return;
  }
  await flush();
  if (action.type === 'look') {
    send({ type: 'recall', sceneId: action.id, fadeMs });
  } else if (action.type === 'sequence') {
    send({ type: 'chaseStart', chaseId: action.id });
  }
}
