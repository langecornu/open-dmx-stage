// The rig the lights hang on, for the visualizer: a truss shape around (or behind) the dance floor, with or without
// vertical uprights at its corners, and where each light is mounted: on a rail (a side of the truss or an upright) at a
// position along it, or on the floor. Kept with each venue, so every room has its own. Pure, so the rules are easy to
// test; shared by the show's checks and the drawing.
//
// Space: metres, the dance floor's centre at the origin; x across (right positive), y up, z toward the front (the
// audience side). The back of the floor is at z = -depth / 2.

export const RIG_SHAPES = /** @type {const} */ (['line', 'u', 'square', 'front-back', 'none']);

/** What each shape is called on screen. */
export const RIG_SHAPE_LABELS = {
  line: 'One truss, at the back',
  u: 'U: back and both sides',
  square: 'Square around the floor',
  'front-back': 'Front and back',
  none: 'No truss (floor only)',
};

/** @typedef {{ shape: typeof RIG_SHAPES[number], uprights: boolean, width: number, depth: number, height: number }} Rig */

/** @type {Rig} */
export const DEFAULT_RIG = Object.freeze({ shape: 'line', uprights: true, width: 8, depth: 6, height: 4 });

/** Limits of the rig's size, in metres. */
/** @type {Readonly<Record<'width' | 'depth' | 'height', [number, number]>>} */
export const RIG_LIMITS = Object.freeze({ width: [2, 40], depth: [2, 40], height: [1.5, 12] });

/**
 * Where a light is mounted: a rail and a position along it (0 to 1), or the floor at a place (0 to 1 across and from
 * the back to the front of the dance floor).
 * @typedef {{ rail: string, at?: number, x?: number, z?: number }} Mount
 */

/**
 * @typedef {{ id: string, label: string, from: { x: number, y: number, z: number }, to: { x: number, y: number, z: number },
 *   vertical: boolean }} Rail
 */

/** @param {Partial<Rig> | undefined} rig @returns {Rig} */
export function rigOrDefault(rig) {
  /** @param {unknown} value @param {[number, number]} limits @param {number} fallback @returns {number} */
  const clampTo = (value, [low, high], fallback) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
  return {
    shape:
      rig && RIG_SHAPES.includes(/** @type {any} */ (rig.shape)) ? /** @type {Rig['shape']} */ (rig.shape) : 'line',
    uprights: rig?.uprights ?? DEFAULT_RIG.uprights,
    width: clampTo(rig?.width, RIG_LIMITS.width, DEFAULT_RIG.width),
    depth: clampTo(rig?.depth, RIG_LIMITS.depth, DEFAULT_RIG.depth),
    height: clampTo(rig?.height, RIG_LIMITS.height, DEFAULT_RIG.height),
  };
}

/**
 * The rails of a rig: its truss sides at the top, and its uprights.
 * @param {Partial<Rig>} input
 * @returns {Rail[]}
 */
export function railsOf(input) {
  const rig = rigOrDefault(input);
  const w = rig.width / 2;
  const d = rig.depth / 2;
  const h = rig.height;
  /** @type {Record<string, { label: string, from: { x: number, y: number, z: number }, to: { x: number, y: number, z: number } }>} */
  const sides = {
    back: { label: 'Back truss', from: { x: -w, y: h, z: -d }, to: { x: w, y: h, z: -d } },
    front: { label: 'Front truss', from: { x: -w, y: h, z: d }, to: { x: w, y: h, z: d } },
    left: { label: 'Left truss', from: { x: -w, y: h, z: -d }, to: { x: -w, y: h, z: d } },
    right: { label: 'Right truss', from: { x: w, y: h, z: -d }, to: { x: w, y: h, z: d } },
  };
  const bySide = {
    line: ['back'],
    u: ['back', 'left', 'right'],
    square: ['back', 'front', 'left', 'right'],
    'front-back': ['back', 'front'],
    none: [],
  }[rig.shape];
  /** @type {Rail[]} */
  const rails = bySide.map((id) => ({ id, ...sides[id], vertical: false }));
  if (rig.uprights && rig.shape !== 'none') {
    /** @type {Record<string, { x: number, z: number, label: string }>} */
    const corners = {
      'post-back-left': { x: -w, z: -d, label: 'Upright, back left' },
      'post-back-right': { x: w, z: -d, label: 'Upright, back right' },
      'post-front-left': { x: -w, z: d, label: 'Upright, front left' },
      'post-front-right': { x: w, z: d, label: 'Upright, front right' },
    };
    const used = rig.shape === 'line' ? ['post-back-left', 'post-back-right'] : Object.keys(corners);
    for (const id of used) {
      const corner = corners[id];
      rails.push({
        id,
        label: corner.label,
        from: { x: corner.x, y: 0, z: corner.z },
        to: { x: corner.x, y: h, z: corner.z },
        vertical: true,
      });
    }
  }
  return rails;
}

/**
 * Where a mounted light is, which way it faces (toward the dance floor), and whether it hangs.
 * @param {Partial<Rig>} rig
 * @param {Mount | undefined} mount
 * @returns {{ x: number, y: number, z: number, hung: boolean, facing: number, rail: string }} facing: degrees about the
 *   vertical, 0 toward the front
 */
export function positionOf(rig, mount) {
  const full = rigOrDefault(rig);
  const rails = railsOf(full);
  const rail = mount ? rails.find((candidate) => candidate.id === mount.rail) : undefined;
  const at = Math.max(0, Math.min(1, mount?.at ?? 0.5));
  if (rail) {
    const x = rail.from.x + (rail.to.x - rail.from.x) * at;
    const y = rail.from.y + (rail.to.y - rail.from.y) * at;
    const z = rail.from.z + (rail.to.z - rail.from.z) * at;
    // Hung under a truss, or on the inner side of an upright (a little toward the floor); facing the floor's middle.
    // toCentre is the bearing from the light to the middle: its sine and cosine are the x and z of that direction.
    const toCentre = Math.atan2(-x, -z);
    const inward = rail.vertical ? 0.25 : 0;
    return {
      x: x + Math.sin(toCentre) * inward,
      y: rail.vertical ? y : y - 0.25,
      z: z + Math.cos(toCentre) * inward,
      hung: !rail.vertical,
      facing: (toCentre * 180) / Math.PI,
      rail: rail.id,
    };
  }
  // On the floor (or a rail that no longer exists): a place on the dance floor, facing its middle.
  const x = ((mount?.x ?? 0.5) - 0.5) * full.width;
  const z = ((mount?.z ?? 0.5) - 0.5) * full.depth;
  return { x, y: 0.2, z, hung: false, facing: (Math.atan2(-x, -z) * 180) / Math.PI, rail: 'floor' };
}

/**
 * First places for lights not mounted yet: lights hung along the truss rails in turn (the back first), smoke machines,
 * hazers, fans and special effects at the floor's corners.
 * @param {{ id: string, stage?: Mount }[]} fixtures
 * @param {(fixture: any) => string} categoryOf
 * @param {Partial<Rig>} rig
 * @returns {Map<string, Mount>}
 */
export function mountsOf(fixtures, categoryOf, rig) {
  const rails = railsOf(rig).filter((rail) => !rail.vertical);
  /** @param {{ id: string }} fixture */
  const onFloor = (fixture) => ['smoke', 'hazer', 'fan', 'special-effect'].includes(categoryOf(fixture));
  /** @type {Map<string, Mount>} */
  const mounts = new Map();
  const floorSpots = [
    { x: 0.04, z: 0.04 },
    { x: 0.96, z: 0.04 },
    { x: 0.04, z: 0.96 },
    { x: 0.96, z: 0.96 },
  ];
  const unplacedHung = fixtures.filter((fixture) => !fixture.stage && !onFloor(fixture));
  const unplacedFloor = fixtures.filter((fixture) => !fixture.stage && onFloor(fixture));
  if (rails.length === 0) {
    unplacedHung.forEach((fixture, index) => {
      mounts.set(fixture.id, { rail: 'floor', x: (index + 1) / (unplacedHung.length + 1), z: 0.1 });
    });
  } else {
    // Share the lights among the rails, in order, spaced evenly along each.
    const perRail = rails.map(() => /** @type {string[]} */ ([]));
    unplacedHung.forEach((fixture, index) => perRail[index % rails.length].push(fixture.id));
    perRail.forEach((ids, railIndex) => {
      ids.forEach((id, index) => mounts.set(id, { rail: rails[railIndex].id, at: (index + 1) / (ids.length + 1) }));
    });
  }
  unplacedFloor.forEach((fixture, index) => {
    mounts.set(fixture.id, { rail: 'floor', ...floorSpots[index % floorSpots.length] });
  });
  for (const fixture of fixtures) {
    if (fixture.stage) {
      mounts.set(fixture.id, fixture.stage);
    }
  }
  return mounts;
}

/**
 * Lights whose place nobody has set yet: they stand at a first, guessed place until someone arranges them.
 * @template {{ stage?: Mount }} T
 * @param {T[]} fixtures
 * @returns {T[]}
 */
export function unplacedLights(fixtures) {
  return fixtures.filter((fixture) => !fixture.stage);
}

/**
 * A place in words, as the audience sees the stage: which rail and where along it, or where on the floor.
 * @param {Partial<Rig>} rig
 * @param {Mount} mount
 * @returns {string}
 */
export function describePlace(rig, mount) {
  const rail = railsOf(rig).find((candidate) => candidate.id === mount.rail);
  /** @param {number} value @param {string[]} words five words, from 0 to 1, the middle one around 0.5 */
  const along = (value, words) => words[Math.round(Math.max(0, Math.min(1, value)) * 4)];
  if (!rail) {
    const across = along(mount.x ?? 0.5, ['far left', 'left', 'centre', 'right', 'far right']);
    const depth = along(mount.z ?? 0.5, [
      'at the back',
      'toward the back',
      'in the middle',
      'toward the front',
      'at the front',
    ]);
    return `On the floor, ${depth}, ${across}`;
  }
  const at = mount.at ?? 0.5;
  if (rail.vertical) {
    return `${rail.label}, ${along(at, ['near the floor', 'low', 'half way up', 'high', 'at the top'])}`;
  }
  if (rail.id === 'back' || rail.id === 'front') {
    return `${rail.label}, ${along(at, ['far left', 'left of centre', 'centre', 'right of centre', 'far right'])}`;
  }
  return `${rail.label}, ${along(at, ['back end', 'toward the back', 'middle', 'toward the front', 'front end'])}`;
}
