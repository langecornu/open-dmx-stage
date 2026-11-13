// The visualizer's camera: a real perspective camera that can stand in front of the stage, at a raised corner, or above
// it, framed so the whole rig fills the screen whatever its shape. Lines and beams are clipped where they pass the
// camera, so a beam aimed at the audience never turns into a giant shape. Also the way back: which rail (and where on
// it), or which spot of the floor, a finger is on. Pure maths, so it can be tested.
import { railsOf, rigOrDefault } from '../../shared/stageRig.js';

export const VIEWS = /** @type {const} */ (['front', 'corner', 'above']);
export const VIEW_LABELS = { front: 'Front', corner: 'Corner', above: 'Above' };

/** The longest a beam is drawn, in metres. */
export const MAX_BEAM = 18;
const NEAR = 0.4;

/** @typedef {{ x: number, y: number, z: number }} Vec */

/** @param {Vec} a @param {Vec} b */
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
/** @param {Vec} a @param {Vec} b */
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
/** @param {Vec} a @param {Vec} b */
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
/** @param {Vec} v */
export const normalise = (v) => {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};

/**
 * Where the camera stands and looks for a view of a rig.
 * @param {typeof VIEWS[number]} view
 * @param {ReturnType<typeof rigOrDefault>} rig
 */
function pose(view, rig) {
  const size = Math.max(rig.width, rig.depth);
  if (view === 'above') {
    return {
      eye: { x: 0, y: rig.height + size * 1.6, z: 0.001 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 0, z: -1 },
    };
  }
  if (view === 'corner') {
    return {
      eye: { x: rig.width / 2 + size * 0.9, y: rig.height + size * 0.55, z: rig.depth / 2 + size * 1.1 },
      target: { x: 0, y: rig.height * 0.3, z: 0 },
      up: { x: 0, y: 1, z: 0 },
    };
  }
  return {
    eye: { x: 0, y: 1.9, z: rig.depth / 2 + size * 1.35 + 3 },
    target: { x: 0, y: rig.height * 0.45, z: 0 },
    up: { x: 0, y: 1, z: 0 },
  };
}

/**
 * @param {number} width canvas width in pixels
 * @param {number} height canvas height in pixels
 * @param {typeof VIEWS[number]} view
 * @param {Partial<import('../../shared/stageRig.js').Rig>} rigInput
 */
export function makeCamera(width, height, view = 'front', rigInput = {}) {
  const rig = rigOrDefault(rigInput);
  const { eye, target, up } = pose(view, rig);
  const forward = normalise(sub(target, eye));
  const right = normalise(cross(forward, up));
  const upward = cross(right, forward);

  /** @param {Vec} point */
  const toCamera = (point) => {
    const rel = sub(point, eye);
    return { x: dot(rel, right), y: dot(rel, upward), z: dot(rel, forward) };
  };

  // Frame the rig: the dance floor, the truss and the uprights, plus a margin around the floor.
  const margin = 1.2;
  const corners = [];
  for (const x of [-rig.width / 2 - margin, rig.width / 2 + margin]) {
    for (const z of [-rig.depth / 2 - margin, rig.depth / 2 + margin]) {
      for (const y of [0, rig.height + 0.4]) {
        corners.push(toCamera({ x, y, z }));
      }
    }
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of corners) {
    const depth = Math.max(NEAR, point.z);
    minX = Math.min(minX, point.x / depth);
    maxX = Math.max(maxX, point.x / depth);
    minY = Math.min(minY, point.y / depth);
    maxY = Math.max(maxY, point.y / depth);
  }
  const focal = Math.min((width * 0.94) / (maxX - minX), (height * 0.9) / (maxY - minY));
  const centreX = width / 2 - ((minX + maxX) / 2) * focal;
  const centreY = height / 2 + ((minY + maxY) / 2) * focal;

  return {
    width,
    height,
    view,
    focal,
    eye,
    /**
     * @param {Vec} point
     * @returns {{ x: number, y: number, scale: number, depth: number, visible: boolean }} scale: pixels per metre there
     */
    project(point) {
      const c = toCamera(point);
      const depth = Math.max(NEAR, c.z);
      const scale = focal / depth;
      // A point cut exactly to the near plane counts as visible, whatever the rounding.
      return { x: centreX + c.x * scale, y: centreY - c.y * scale, scale, depth: c.z, visible: c.z >= NEAR - 1e-6 };
    },
    /**
     * A segment cut where it passes the camera, or null when it is all behind.
     * @param {Vec} a
     * @param {Vec} b
     * @returns {[Vec, Vec] | null}
     */
    clip(a, b) {
      const da = toCamera(a).z;
      const db = toCamera(b).z;
      if (da < NEAR && db < NEAR) {
        return null;
      }
      if (da >= NEAR && db >= NEAR) {
        return [a, b];
      }
      const t = (NEAR - da) / (db - da);
      const cut = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      return da < NEAR ? [cut, b] : [a, cut];
    },
    /**
     * A flat shape (the floor) cut where it passes the camera, as screen points.
     * @param {Vec[]} points corners in order
     * @returns {{ x: number, y: number }[]}
     */
    clipPolygon(points) {
      const out = [];
      for (let index = 0; index < points.length; index += 1) {
        const a = points[index];
        const b = points[(index + 1) % points.length];
        const da = toCamera(a).z;
        const db = toCamera(b).z;
        if (da >= NEAR) {
          out.push(a);
        }
        if (da >= NEAR !== db >= NEAR) {
          const t = (NEAR - da) / (db - da);
          out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
        }
      }
      return out.map((point) => {
        const projected = this.project(point);
        return { x: projected.x, y: projected.y };
      });
    },
    /**
     * The ray from the camera through a screen point.
     * @param {number} sx
     * @param {number} sy
     * @returns {Vec} unit direction
     */
    ray(sx, sy) {
      const x = (sx - centreX) / focal;
      const y = -(sy - centreY) / focal;
      return normalise({
        x: forward.x + right.x * x + upward.x * y,
        y: forward.y + right.y * x + upward.y * y,
        z: forward.z + right.z * x + upward.z * y,
      });
    },
  };
}

/**
 * Where a beam stops: on the floor, or at its longest.
 * @param {Vec} from
 * @param {Vec} direction unit vector
 * @returns {{ point: Vec, length: number, surface: 'floor' | 'air' }}
 */
export function beamEnd(from, direction) {
  if (direction.y < -1e-3) {
    const toFloor = from.y / -direction.y;
    if (toFloor < MAX_BEAM) {
      return {
        point: { x: from.x + direction.x * toFloor, y: 0, z: from.z + direction.z * toFloor },
        length: toFloor,
        surface: 'floor',
      };
    }
  }
  return {
    point: {
      x: from.x + direction.x * MAX_BEAM,
      y: from.y + direction.y * MAX_BEAM,
      z: from.z + direction.z * MAX_BEAM,
    },
    length: MAX_BEAM,
    surface: 'air',
  };
}

/**
 * A direction turned about the vertical (positive turns from the front toward the right).
 * @param {Vec} direction
 * @param {number} degrees
 */
export function turnAboutY(direction, degrees) {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: direction.x * cos + direction.z * sin, y: direction.y, z: -direction.x * sin + direction.z * cos };
}

/**
 * A direction tilted about the horizontal axis across it (for a spider's bars).
 * @param {Vec} direction
 * @param {number} degrees
 */
export function tiltAboutX(direction, degrees) {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: direction.x, y: direction.y * cos - direction.z * sin, z: direction.y * sin + direction.z * cos };
}

/**
 * Which rail a finger is on (and where along it), or which spot of the floor: for dragging a light.
 * @param {ReturnType<typeof makeCamera>} camera
 * @param {Partial<import('../../shared/stageRig.js').Rig>} rigInput
 * @param {number} sx
 * @param {number} sy
 * @param {number} [reach] how far from a rail on screen still counts as on it, in pixels
 * @returns {import('../../shared/stageRig.js').Mount}
 */
export function screenToMount(camera, rigInput, sx, sy, reach = 36) {
  const rig = rigOrDefault(rigInput);
  let best = null;
  let bestDistance = reach;
  for (const rail of railsOf(rig)) {
    const segment = camera.clip(rail.from, rail.to);
    if (!segment) {
      continue;
    }
    const a = camera.project(segment[0]);
    const b = camera.project(segment[1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((sx - a.x) * dx + (sy - a.y) * dy) / lengthSquared));
    const distance = Math.hypot(a.x + dx * t - sx, a.y + dy * t - sy);
    if (distance < bestDistance) {
      // Back from the clipped segment to the position along the whole rail.
      const point = {
        x: segment[0].x + (segment[1].x - segment[0].x) * t,
        y: segment[0].y + (segment[1].y - segment[0].y) * t,
        z: segment[0].z + (segment[1].z - segment[0].z) * t,
      };
      const along = sub(rail.to, rail.from);
      const at = dot(sub(point, rail.from), along) / dot(along, along);
      best = { rail: rail.id, at: Math.round(Math.max(0, Math.min(1, at)) * 1000) / 1000 };
      bestDistance = distance;
    }
  }
  if (best) {
    return best;
  }
  // The floor: where the ray from the camera meets it, kept on the dance floor.
  const ray = camera.ray(sx, sy);
  const t = ray.y < -1e-3 ? -camera.eye.y / ray.y : 0;
  const x = camera.eye.x + ray.x * t;
  const z = camera.eye.z + ray.z * t;
  const round = (value) => Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
  return { rail: 'floor', x: round(x / rig.width + 0.5), z: round(z / rig.depth + 0.5) };
}
