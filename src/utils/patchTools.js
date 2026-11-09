// Patch helpers shared by Setup and the welcome flow: find free DMX addresses and plan new fixtures.
import { DMX_CHANNELS } from '../../shared/patch.js';

export function nextFreeAddress(patch, footprint) {
  const taken = new Set(patch.channels.keys());
  for (let start = 1; start + footprint - 1 <= DMX_CHANNELS; start += 1) {
    let isFree = true;
    for (let offset = 0; offset < footprint; offset += 1) {
      if (taken.has(start + offset)) {
        isFree = false;
        break;
      }
    }
    if (isFree) {
      return start;
    }
  }
  return null;
}

// Returns { additions, notice } for adding `quantity` fixtures of a type/mode after the existing patch.
export function planFixtures({ project, patch, type, modeIndex, quantity }) {
  const footprint = type?.modes[modeIndex]?.channels.length ?? 1;
  const start = nextFreeAddress(patch, footprint);
  if (start === null || !type) {
    return { additions: [], notice: 'No free DMX address range is available for that fixture.' };
  }
  const additions = [];
  let address = start;
  let notice = null;
  for (let i = 0; i < quantity; i += 1) {
    if (address + footprint - 1 > DMX_CHANNELS) {
      notice = `Only ${i} of ${quantity} fixtures fit in the universe.`;
      break;
    }
    additions.push({
      id: crypto.randomUUID(),
      name: `${type.name} ${project.fixtures.length + i + 1}`,
      typeId: type.id,
      mode: modeIndex,
      address,
    });
    address += footprint;
  }
  return { additions, notice };
}
