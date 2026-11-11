// Plain words for the auto show, shared by its panel, the On stage bar and the search palette.

/** @param {number} beats @returns {string} for example "every bar" or "every 4 bars" */
export function describeEvery(beats) {
  const bars = beats / 4;
  return bars === 1 ? 'every bar' : `every ${bars} bars`;
}

/**
 * @param {{ source: 'looks' | 'sequences', beats: number, order: 'order' | 'shuffle' }} auto
 * @returns {string} for example "Looks · in order · changes every 2 bars"
 */
export function describeAuto(auto) {
  return [
    auto.source === 'looks' ? 'Looks' : 'Sequences',
    auto.order === 'shuffle' ? 'shuffled' : 'in order',
    `changes ${describeEvery(auto.beats)}`,
  ].join(' · ');
}
