// The commands in the search palette (Ctrl or Command + K): go to a screen, play a look, start or stop a sequence, and
// the quick actions. Built from the show and the live state, so the list always matches what can be done right now.
import { VIEWS } from './views.js';

const LOOK_FADE_MS = 500;

/**
 * @typedef {{ send: (message: object) => void, flush: () => Promise<void>, navigate: (view: string) => void, toggleTheme: () => void }} CommandContext
 * @typedef {{ id: string, group: string, label: string, hint: string, keywords: string, run: (context: CommandContext) => void | Promise<void> }} Command
 */

/**
 * @param {{ project: { scenes: { id: string, name: string }[], chases: { id: string, name: string, steps: unknown[] }[] },
 *   engine: import('../hooks/useLive.js').EngineState, theme: string }} input
 * @returns {Command[]}
 */
export function buildCommands({ project, engine, theme }) {
  /** @type {Command[]} */
  const commands = [];

  commands.push({
    id: 'action-blackout',
    group: 'Actions',
    label: engine.blackout ? 'Lights on (end blackout)' : 'Blackout',
    hint: engine.blackout ? 'Bring the lights back' : 'Switch every light off',
    keywords: 'dark off kill',
    run: ({ send }) => send({ type: 'blackout', enabled: !engine.blackout }),
  });
  if (engine.activeChaseId) {
    commands.push({
      id: 'action-stop',
      group: 'Actions',
      label: 'Stop the sequence',
      hint: 'Leave the lights as they are',
      keywords: 'halt end',
      run: ({ send }) => send({ type: 'chaseStop' }),
    });
  }
  if (engine.effect) {
    commands.push({
      id: 'action-stop-effect',
      group: 'Actions',
      label: 'Stop the effect',
      hint: 'End pulse, sweep or rainbow',
      keywords: 'halt end',
      run: ({ send }) => send({ type: 'effectStop' }),
    });
  }
  if (engine.programmerChannels.length > 0) {
    commands.push({
      id: 'action-reset',
      group: 'Actions',
      label: 'Reset manual changes',
      hint: 'Drop colours set by hand',
      keywords: 'clear programmer',
      run: ({ send }) => send({ type: 'clearProgrammer' }),
    });
  }
  commands.push({
    id: 'action-theme',
    group: 'Actions',
    label: theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme',
    hint: 'Change how the app looks',
    keywords: 'appearance mode',
    run: ({ toggleTheme }) => toggleTheme(),
  });

  for (const scene of project.scenes) {
    commands.push({
      id: `look-${scene.id}`,
      group: 'Looks',
      label: `Play ${scene.name}`,
      hint: 'Look',
      keywords: 'recall scene',
      run: async ({ send, flush }) => {
        await flush();
        send({ type: 'recall', sceneId: scene.id, fadeMs: LOOK_FADE_MS });
      },
    });
  }
  for (const chase of project.chases) {
    const isPlaying = engine.activeChaseId === chase.id;
    commands.push({
      id: `sequence-${chase.id}`,
      group: 'Sequences',
      label: `${isPlaying ? 'Stop' : 'Start'} ${chase.name}`,
      hint: `Sequence · ${chase.steps.length} steps`,
      keywords: 'chase play',
      run: async ({ send, flush }) => {
        if (isPlaying) {
          send({ type: 'chaseStop' });
        } else {
          await flush();
          send({ type: 'chaseStart', chaseId: chase.id });
        }
      },
    });
  }
  for (const view of VIEWS) {
    commands.push({
      id: `go-${view.id}`,
      group: 'Go to',
      label: view.label,
      hint: view.summary,
      keywords: 'open screen page',
      run: ({ navigate }) => navigate(view.id),
    });
  }
  return commands;
}

/**
 * Keeps the commands that contain every word typed, best matches first: label starts with the text, then label
 * contains it, then only the group or keywords do.
 * @param {Command[]} commands
 * @param {string} query
 * @returns {Command[]}
 */
export function filterCommands(commands, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return commands;
  }
  const scored = [];
  for (const command of commands) {
    const label = command.label.toLowerCase();
    const haystack = `${label} ${command.group.toLowerCase()} ${command.keywords}`;
    if (!words.every((word) => haystack.includes(word))) {
      continue;
    }
    let score = 2;
    if (label.startsWith(words[0])) {
      score = 0;
    } else if (words.every((word) => label.includes(word))) {
      score = 1;
    }
    scored.push({ command, score });
  }
  return scored.sort((a, b) => a.score - b.score).map((entry) => entry.command);
}
