// Asking before the show moves to another venue: says which lights match, what is set aside, and whether the output
// changes (a USB cable here, Art-Net there), then switches and sets that venue's output on the server.
import { planVenueSwitch, switchVenue } from '../../shared/venues.js';
import { api } from '../api.js';
import { DRIVER_LABELS } from './drivers.js';

const list = (names) =>
  names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;

/**
 * How an output reads in a sentence: "USB-DMX cable on /dev/cu.usbserial-1", "Art-Net to 192.168.1.50, universe 0".
 * @param {{ driver: string, serialPath?: string, host?: string, universe?: number } | null | undefined} output
 */
export function describeOutput(output) {
  if (!output) {
    return 'the output as it is';
  }
  const name = DRIVER_LABELS[output.driver] ?? output.driver;
  if ((output.driver === 'open-dmx' || output.driver === 'enttec-pro') && output.serialPath) {
    return `${name} on ${output.serialPath}`;
  }
  if (output.driver === 'artnet' || output.driver === 'sacn') {
    const where = output.host ? ` to ${output.host}` : '';
    return `${name}${where}${output.universe === undefined ? '' : `, universe ${output.universe}`}`;
  }
  return name;
}

const sameOutput = (a, b) =>
  Boolean(a && b) &&
  a.driver === b.driver &&
  (a.serialPath ?? '') === (b.serialPath ?? '') &&
  (a.host ?? '') === (b.host ?? '') &&
  a.universe === b.universe;

/**
 * @param {import('../../shared/types.js').Project} project
 * @param {string} venueId
 * @param {import('../../shared/types.js').OutputSettings | null} [currentOutput] how DMX leaves the computer now
 * @returns {string} the question to ask before switching
 */
export function describeVenueSwitch(project, venueId, currentOutput = null) {
  const { venue, matched, unmatched, unused } = planVenueSwitch(project, venueId);
  const lines = [`Move the show to ${venue.name}?`];
  if (project.fixtures.length > 0) {
    lines.push(
      `${matched} of ${project.fixtures.length} ${project.fixtures.length === 1 ? 'light' : 'lights'} match a light there; ` +
        'looks and sequences move onto their addresses.',
    );
  }
  if (unmatched.length > 0) {
    lines.push(`No match for ${list(unmatched)}: what they do is kept for when you come back.`);
  }
  if (unused.length > 0) {
    lines.push(`${list(unused)} ${unused.length === 1 ? 'has' : 'have'} nothing to do yet.`);
  }
  if (venue.output && !sameOutput(venue.output, currentOutput)) {
    lines.push(`The output changes to ${describeOutput(venue.output)}.`);
  }
  return lines.join('\n\n');
}

/**
 * Asks, then switches, remembering this venue's output and setting the other venue's. Resolves to a message about the
 * output when setting it failed (the show has still moved), or null.
 * @param {{ project: any, venueId: string, library: any[], update: (mutate: (project: any) => any) => void,
 *   currentOutput?: import('../../shared/types.js').OutputSettings | null }} options
 * @returns {Promise<{ switched: boolean, problem: string | null }>}
 */
export async function confirmVenueSwitch({ project, venueId, library, update, currentOutput = null }) {
  if (!window.confirm(describeVenueSwitch(project, venueId, currentOutput))) {
    return { switched: false, problem: null };
  }
  const { venue } = planVenueSwitch(project, venueId);
  update((current) => switchVenue(current, venueId, library, { currentOutput }));
  if (!venue.output || sameOutput(venue.output, currentOutput)) {
    return { switched: true, problem: null };
  }
  try {
    await api.saveOutputSettings(venue.output);
    return { switched: true, problem: null };
  } catch (error) {
    return {
      switched: true,
      problem: `The show moved to ${venue.name}, but its output (${describeOutput(venue.output)}) could not be set: ${error.message} Check it on Output.`,
    };
  }
}
