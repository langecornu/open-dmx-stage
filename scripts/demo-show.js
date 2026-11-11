// Plays a timed demo light show on the running app, through the same live link the screens use: looks with fades,
// hand-mixed colours, master dimming, effects (pulse, sweep, rainbow) on all lights or one group, tempo changes,
// sequences timed in seconds and in beats, strobe and blackout. It is meant for two 36 LED par lights in the 7 channel
// layout (docs/examples/pars-demo-show.json) and lasts about two minutes.
//
//   npm run demo:show -- --load                  load the demo show into the app, then play
//   npm run demo:show -- --url http://localhost:4000
//   npm run demo:show -- --no-strobe             leave out every flashing part
//   npm run demo:show -- --dry-run               print the plan without connecting
//
// The strobe parts add up to about 13 seconds of flashing light. Do not run it near anyone sensitive to flashing.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { WebSocket } from 'ws';

const DEMO_SHOW_FILE = new URL('../docs/examples/pars-demo-show.json', import.meta.url);

// Channels of the two pars: Par 1 is at address 1 (channels 1 to 7), Par 2 at address 8 (channels 8 to 14).
const PAR_1 = { dimmer: 1, red: 2, green: 3, blue: 4, strobe: 5 };
const PAR_2 = { dimmer: 8, red: 9, green: 10, blue: 11, strobe: 12 };

/** @typedef {Record<string, unknown>} LiveMessage */
/** @typedef {{ messages: LiveMessage[], waitMs: number }} Step */
/** @typedef {{ title: string, isStrobe: boolean, steps: Step[] }} Act */

const recall = (/** @type {string} */ sceneId, /** @type {number} */ fadeMs) => ({ type: 'recall', sceneId, fadeMs });
const tempo = (/** @type {number} */ bpm, sync = false) => ({ type: 'tempo', bpm, sync });
const effect = (
  /** @type {string} */ name,
  /** @type {number} */ beats,
  /** @type {string | null} */ groupId = null,
) => ({
  type: 'effectStart',
  effect: name,
  beats,
  groupId,
});

/** @param {Record<number, number>} values by channel @returns {LiveMessage} */
const manual = (values) => ({ type: 'set', values });

/**
 * @param {LiveMessage[]} messages
 * @param {number} waitMs how long to let the lights show it before the next step
 * @returns {Step}
 */
const step = (messages, waitMs) => ({ messages, waitMs });

/** A smooth hand-mixed sweep: Par 1 goes from red to blue while Par 2 goes the other way, using the manual layer. */
function handMixedSweep() {
  /** @type {Step[]} */
  const steps = [];
  const frames = 40;
  for (let index = 0; index <= frames; index += 1) {
    const t = index / frames;
    const toBlue = Math.round(255 * t);
    const toRed = 255 - toBlue;
    steps.push(
      step(
        [
          manual({
            [PAR_1.dimmer]: 255,
            [PAR_1.red]: toRed,
            [PAR_1.green]: 0,
            [PAR_1.blue]: toBlue,
            [PAR_2.dimmer]: 255,
            [PAR_2.red]: toBlue,
            [PAR_2.green]: 0,
            [PAR_2.blue]: toRed,
          }),
        ],
        100,
      ),
    );
  }
  return steps;
}

/** Steps the strobe channel of both pars through slow, medium and fast on white, using the manual layer. */
function manualStrobeRamp() {
  const white = {
    [PAR_1.dimmer]: 255,
    [PAR_1.red]: 255,
    [PAR_1.green]: 255,
    [PAR_1.blue]: 255,
    [PAR_2.dimmer]: 255,
    [PAR_2.red]: 255,
    [PAR_2.green]: 255,
    [PAR_2.blue]: 255,
  };
  return [60, 128, 220].map((rate) => step([manual({ ...white, [PAR_1.strobe]: rate, [PAR_2.strobe]: rate })], 1500));
}

/** @param {number[]} levels @returns {Step[]} master changes, each shown briefly */
const masterSteps = (levels) => levels.map((level) => step([{ type: 'master', level }], 350));

/**
 * The whole routine as data, so it can be checked without any lights and played at any pace.
 * @param {{ includeStrobe?: boolean }} [options] `includeStrobe: false` leaves out every flashing part
 * @returns {Act[]}
 */
export function buildRoutine({ includeStrobe = true } = {}) {
  /** @type {Act[]} */
  const acts = [
    {
      title: 'Reset: master full, no blackout, tempo 120 beats per minute',
      isStrobe: false,
      steps: [
        step(
          [
            { type: 'master', level: 1 },
            { type: 'blackout', enabled: false },
            { type: 'clearProgrammer' },
            { type: 'effectStop' },
            { type: 'chaseStop' },
            recall('look-dark', 0),
            tempo(120, true),
          ],
          1500,
        ),
      ],
    },
    {
      title: 'Looks with fades: Warm glow, Sunset, Ocean, Forest, Purple haze, Fire',
      isStrobe: false,
      steps: [
        step([recall('look-warm', 2000)], 3500),
        step([recall('look-sunset', 2000)], 3500),
        step([recall('look-ocean', 1500)], 3000),
        step([recall('look-forest', 1500)], 3000),
        step([recall('look-purple', 1500)], 3000),
        step([recall('look-fire', 1500)], 3000),
      ],
    },
    {
      title: 'Master dimming: down to 10% and back up',
      isStrobe: false,
      steps: masterSteps([0.8, 0.6, 0.4, 0.2, 0.1, 0.2, 0.4, 0.6, 0.8, 1]),
    },
    {
      title: 'Hand-mixed colours (the manual faders): Par 1 red to blue while Par 2 blue to red',
      isStrobe: false,
      steps: [...handMixedSweep(), step([{ type: 'clearProgrammer' }], 500)],
    },
    {
      title: 'Pulse effect on all lights (1 beat), over the Ice look',
      isStrobe: false,
      steps: [step([recall('look-ice', 1000), tempo(120, true)], 1200), step([effect('pulse', 1)], 6000)],
    },
    {
      title: 'Sweep effect (a spot running across both pars, 2 beats), over the Fire look',
      isStrobe: false,
      steps: [step([effect('sweep', 2), recall('look-fire', 500)], 8000)],
    },
    {
      title: 'Rainbow effect (4 beats), then a faster tempo (150)',
      isStrobe: false,
      steps: [step([effect('rainbow', 4)], 8000), step([tempo(150)], 5000)],
    },
    {
      title: 'Groups: pulse on Par 1 only while Par 2 holds steady, then rainbow on Par 2 only',
      isStrobe: false,
      steps: [
        step([{ type: 'effectStop' }, tempo(120, true), recall('look-ocean', 1000)], 1200),
        step([effect('pulse', 0.5, 'group-par-1')], 5000),
        step([effect('rainbow', 4, 'group-par-2')], 6000),
        step([{ type: 'effectStop' }], 500),
      ],
    },
    {
      title: 'Sequence in seconds: Slow sunrise (dark to Sunset, Warm, Ice, Ocean)',
      isStrobe: false,
      steps: [step([{ type: 'chaseStart', chaseId: 'seq-sunrise' }], 17500)],
    },
    {
      title: 'Sequence in beats: Colour cycle at 120, then at 170 beats per minute',
      isStrobe: false,
      steps: [step([tempo(120, true), { type: 'chaseStart', chaseId: 'seq-cycle' }], 12000), step([tempo(170)], 6000)],
    },
    {
      title: 'Sequence in beats: Police (red and blue swapping every beat)',
      isStrobe: false,
      steps: [step([tempo(120, true), { type: 'chaseStart', chaseId: 'seq-police' }], 6000)],
    },
  ];
  if (includeStrobe) {
    acts.push(
      {
        title: 'STROBE: the Strobe finale sequence (disco pink, white strobe, colour strobe), about 8 seconds',
        isStrobe: true,
        steps: [step([tempo(120, true), { type: 'chaseStart', chaseId: 'seq-strobe' }], 8000)],
      },
      {
        title: 'STROBE: the strobe channel by hand on white, slow, medium, then fast',
        isStrobe: true,
        steps: [
          step([{ type: 'chaseStop' }], 200),
          ...manualStrobeRamp(),
          step([{ type: 'clearProgrammer' }, recall('look-disco', 0)], 800),
        ],
      },
    );
  }
  acts.push({
    title: 'Blackout on, then off, and a slow fade back to Warm glow',
    isStrobe: false,
    steps: [
      step([{ type: 'chaseStop' }, { type: 'effectStop' }, { type: 'blackout', enabled: true }], 1500),
      step([{ type: 'blackout', enabled: false }, recall('look-warm', 3000)], 4000),
    ],
  });
  return acts;
}

/** @param {Act[]} acts @returns {number} how long the routine lasts, in seconds */
export function routineSeconds(acts) {
  return acts.reduce((total, act) => total + act.steps.reduce((sum, item) => sum + item.waitMs, 0), 0) / 1000;
}

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {string} baseUrl @returns {Promise<void>} */
async function loadShow(baseUrl) {
  const show = JSON.parse(await readFile(DEMO_SHOW_FILE, 'utf8'));
  const response = await fetch(`${baseUrl}/api/v1/project/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(show),
  });
  if (!response.ok) {
    throw new Error(`Could not load the demo show (${response.status}): ${await response.text()}`);
  }
  console.log('Loaded the demo show into the app.');
}

async function main() {
  const { values } = parseArgs({
    options: {
      url: { type: 'string', default: 'http://localhost:4000' },
      load: { type: 'boolean', default: false },
      'no-strobe': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const acts = buildRoutine({ includeStrobe: !values['no-strobe'] });
  console.log(`Demo light show: ${acts.length} parts, about ${Math.round(routineSeconds(acts))} seconds.`);
  if (acts.some((act) => act.isStrobe)) {
    console.log('WARNING: this includes flashing (strobe) light. Use --no-strobe to leave it out.');
  }
  if (values['dry-run']) {
    acts.forEach((act, index) => console.log(`${index + 1}. ${act.title}`));
    return;
  }
  if (values.load) {
    await loadShow(values.url);
  }

  const origin = new URL(values.url);
  const socket = new WebSocket(`ws://${origin.host}/live`, { headers: { Origin: values.url } });
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  /** @param {LiveMessage} message */
  const send = (message) => socket.send(JSON.stringify(message));
  const settle = () => {
    for (const message of [{ type: 'effectStop' }, { type: 'chaseStop' }, { type: 'clearProgrammer' }]) {
      send(message);
    }
    send({ type: 'master', level: 1 });
    send({ type: 'blackout', enabled: false });
  };
  process.once('SIGINT', () => {
    settle();
    socket.close();
    process.exit(0);
  });

  const started = Date.now();
  for (const [index, act] of acts.entries()) {
    console.log(`${String(Math.round((Date.now() - started) / 1000)).padStart(3)}s  ${index + 1}. ${act.title}`);
    for (const item of act.steps) {
      for (const message of item.messages) {
        send(message);
      }
      await sleep(item.waitMs);
    }
  }
  settle();
  console.log(`${String(Math.round((Date.now() - started) / 1000)).padStart(3)}s  Done. The lights are at rest.`);
  socket.close();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Demo show failed: ${error.message}`);
    process.exitCode = 1;
  });
}
