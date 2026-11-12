// Asking before the show moves to another venue: says which lights match and what is set aside, then switches.
import { planVenueSwitch, switchVenue } from '../../shared/venues.js';

const list = (names) =>
  names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;

/**
 * @param {import('../../shared/types.js').Project} project
 * @param {string} venueId
 * @returns {string} the question to ask before switching
 */
export function describeVenueSwitch(project, venueId) {
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
  return lines.join('\n\n');
}

/**
 * Asks, then switches. Returns whether it switched.
 * @param {{ project: any, venueId: string, library: any[], update: (mutate: (project: any) => any) => void }} options
 */
export function confirmVenueSwitch({ project, venueId, library, update }) {
  if (!window.confirm(describeVenueSwitch(project, venueId))) {
    return false;
  }
  update((current) => switchVenue(current, venueId, library));
  return true;
}
