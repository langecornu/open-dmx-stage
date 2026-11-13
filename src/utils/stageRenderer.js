// Draws the visualizer: a dance floor in a dark room, the venue's truss around or behind it, and the rig lit as the DMX
// frame says, seen from the front, a raised corner or above. Light is added, not painted over (overlapping beams brighten
// each other); beams are drawn on their own half-resolution layer and textured with drifting haze; smoke machines puff
// smoke that thickens the haze, fans blow it, a mirror ball scatters dots. Every light glides to its new state, so the
// 15 frames a second from the server become smooth motion, as real motors and lamps move. Canvas 2D only.
import { railsOf, rigOrDefault } from '../../shared/stageRig.js';
import { beamDirection } from './visualState.js';
import { MAX_BEAM, beamEnd, makeCamera, normalise, tiltAboutX, turnAboutY } from './stageCamera.js';

/** Detail by quality: full, or lighter when frames run slow (see setQuality). */
const QUALITY = {
  high: { beamScale: 0.5, layers: 2, particles: 420, dots: 90 },
  low: { beamScale: 0.33, layers: 1, particles: 150, dots: 40 },
};
const MAX_DPR = 2;

/** @param {number} value @param {number} low @param {number} high */
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
/** @param {{ r: number, g: number, b: number }} c @param {number} a */
const rgba = (c, a) => `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${clamp(a, 0, 1).toFixed(3)})`;
/** Approaches a target at a rate per second, the same at any frame rate. */
const approach = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
/** Turning toward a target angle the short way round, in degrees. */
const approachAngle = (current, target, rate, dt) => {
  const diff = ((target - current + 540) % 360) - 180;
  return current + diff * (1 - Math.exp(-rate * dt));
};

/** A soft, tileable noise texture: the haze the beams are seen through. */
function makeHazeTile() {
  const small = document.createElement('canvas');
  small.width = 48;
  small.height = 48;
  const sctx = /** @type {CanvasRenderingContext2D} */ (small.getContext('2d'));
  const data = sctx.createImageData(48, 48);
  for (let index = 0; index < data.data.length; index += 4) {
    const value = 150 + Math.random() * 105;
    data.data[index] = value;
    data.data[index + 1] = value;
    data.data[index + 2] = value;
    data.data[index + 3] = 120 + Math.random() * 135;
  }
  sctx.putImageData(data, 0, 0);
  const tile = document.createElement('canvas');
  tile.width = 384;
  tile.height = 384;
  const tctx = /** @type {CanvasRenderingContext2D} */ (tile.getContext('2d'));
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  // Blurred, so the haze reads as soft drifting cloud, not as a grain; drawn four times so the tile repeats seamlessly.
  tctx.filter = 'blur(10px)';
  for (const [dx, dy] of [
    [0, 0],
    [-384, 0],
    [0, -384],
    [-384, -384],
  ]) {
    tctx.drawImage(small, dx, dy, 768, 768);
  }
  return tile;
}

/**
 * @typedef {object} Light what the renderer needs about one light
 * @property {string} id
 * @property {string} name
 * @property {string} category
 * @property {{ x: number, y: number, z: number, hung: boolean, facing: number, rail: string }} position
 * @property {import('./visualState.js').VisualState} state
 */

/**
 * @param {HTMLCanvasElement} canvas
 */
export function createStageRenderer(canvas) {
  const ctx = canvas.getContext?.('2d');
  if (!ctx) {
    return null;
  }
  const beams = document.createElement('canvas');
  const bctx = /** @type {CanvasRenderingContext2D} */ (beams.getContext('2d'));
  const hazeTile = makeHazeTile();
  /** @type {CanvasPattern | null} */
  let hazePattern = null;
  let cssWidth = 1;
  let cssHeight = 1;
  let dpr = 1;
  /** @type {'front' | 'corner' | 'above'} */
  let view = 'front';
  let rig = rigOrDefault({});
  let camera = makeCamera(1, 1, view, rig);
  /** @type {'high' | 'low'} */
  let quality = 'high';
  // Beams are soft, so their layer is drawn at reduced resolution: far fewer pixels to fill.
  let beamScale = QUALITY.high.beamScale;

  /** Smoothed state per light. @type {Map<string, any>} */
  const shown = new Map();
  /** @type {{ x: number, y: number, z: number, vx: number, vy: number, vz: number, age: number, life: number, size: number, strength: number }[]} */
  const particles = [];
  /** @type {{ x: number, y: number, z: number, vx: number, vy: number, age: number, life: number, size: number }[]} */
  const bubbles = [];
  let smokeHaze = 0;
  /** Screen positions of the lights, for picking one with a finger. @type {Map<string, { x: number, y: number, r: number }>} */
  const hits = new Map();

  function resize(width, height) {
    cssWidth = Math.max(1, width);
    cssHeight = Math.max(1, height);
    dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    beamScale = QUALITY[quality].beamScale;
    beams.width = Math.round(cssWidth * dpr * beamScale);
    beams.height = Math.round(cssHeight * dpr * beamScale);
    camera = makeCamera(cssWidth, cssHeight, view, rig);
    hazePattern = bctx.createPattern(hazeTile, 'repeat');
  }

  /** @param {{ view: 'front' | 'corner' | 'above', rig: any }} scene */
  function setScene(scene) {
    const nextRig = rigOrDefault(scene.rig);
    if (scene.view !== view || JSON.stringify(nextRig) !== JSON.stringify(rig)) {
      view = scene.view;
      rig = nextRig;
      camera = makeCamera(cssWidth, cssHeight, view, rig);
    }
  }

  /** Smooths one light toward its new state: lamps react fast, motors move at their pace. */
  function smooth(light, dt) {
    const target = light.state;
    const previous = shown.get(light.id);
    if (!previous) {
      const first = {
        ...target,
        cells: target.cells.map((cell) => ({ ...cell })),
        tilts: [...target.tilts],
        phase: Math.random(),
        strobePhase: 0,
        fanPhase: 0,
      };
      shown.set(light.id, first);
      return first;
    }
    const next = previous;
    next.cells = target.cells.map((cell, index) => {
      const before = previous.cells[index] ?? { ...cell, level: 0 };
      return {
        r: approach(before.r, cell.r, 14, dt),
        g: approach(before.g, cell.g, 14, dt),
        b: approach(before.b, cell.b, 14, dt),
        level: approach(before.level, cell.level, 30, dt),
      };
    });
    next.color = target.color;
    next.intensity = approach(previous.intensity, target.intensity, 30, dt);
    next.pan = target.pan === null ? null : approachAngle(previous.pan ?? target.pan, target.pan, 5, dt);
    next.tilt = target.tilt === null ? null : approach(previous.tilt ?? target.tilt, target.tilt, 5, dt);
    next.tilts = target.tilts.map((tilt, index) => approach(previous.tilts[index] ?? tilt, tilt, 4, dt));
    next.spread = approach(previous.spread, target.spread, 6, dt);
    next.strobeHz = target.strobeHz;
    next.gobo = target.gobo;
    next.prism = target.prism;
    next.fog = target.fog;
    next.rotation = target.rotation;
    next.fan = approach(previous.fan ?? 0, target.fan, 2, dt);
    next.effect = target.effect;
    next.phase = (previous.phase + target.rotation * dt * 0.9) % 1;
    next.strobePhase = (previous.strobePhase + target.strobeHz * dt) % 1;
    next.fanPhase = ((previous.fanPhase ?? 0) + next.fan * dt * 6) % 1;
    return next;
  }

  /**
   * The sources of light of one light, in the room: where each beam starts, its direction, colour, level and width.
   * Directions are worked out facing the front, then turned to face the dance floor from where the light is.
   */
  function emittersOf(light, state, origin, flash) {
    const { hung, facing } = origin;
    const category = light.category;
    const cells = state.cells.length > 0 ? state.cells : [{ ...state.color, level: state.intensity }];
    /** @type {{ from: any, dir: any, color: any, level: number, spread: number, kind: 'beam' | 'thin' | 'laser', gobo?: boolean, share?: number }[]} */
    const out = [];
    const face = (dir) => normalise(turnAboutY(dir, facing));
    // A fixed light aims at the floor between itself and the middle; an uplight on the floor shines up and a little in.
    const aim = (() => {
      if (!hung && origin.y < 1) {
        return face({ x: 0, y: 0.95, z: 0.3 });
      }
      return normalise({ x: origin.x * 0.45 - origin.x, y: -origin.y, z: origin.z * 0.45 - origin.z });
    })();

    if (['moving-head', 'spot', 'scanner', 'barrel-scanner'].includes(category)) {
      const local = category === 'spot' ? null : beamDirection(state, hung);
      const dir = local ? face(local) : aim;
      const cell = cells[0];
      const level = cell.level * flash;
      const spreads = state.prism ? [-7, 0, 7] : [0];
      for (const offset of spreads) {
        out.push({
          from: origin,
          dir: offset ? normalise(turnAboutY(dir, offset)) : dir,
          color: cell,
          level: state.prism ? level * 0.7 : level,
          spread: state.spread,
          kind: 'beam',
          gobo: state.gobo,
        });
      }
      return out;
    }
    if (category === 'spider') {
      // Two bars side by side, each tilting on its own motor, four LEDs each fanning a little apart.
      const perBar = Math.max(1, Math.round(Math.max(cells.length, 8) / 2));
      for (let bar = 0; bar < 2; bar += 1) {
        const tilt = state.tilts[bar] ?? state.tilts[0] ?? 0;
        const barDir = tiltAboutX({ x: 0, y: hung ? -1 : 1, z: 0 }, hung ? -tilt : tilt);
        for (let led = 0; led < perBar; led += 1) {
          const cellIndex = cells.length >= 2 * perBar ? bar * perBar + led : Math.min(cells.length - 1, bar);
          const cell = cells[Math.max(0, cellIndex)];
          const across = (led - (perBar - 1) / 2) * 0.09 + (bar === 0 ? -0.24 : 0.24);
          const offset = face({ x: across, y: 0, z: 0 });
          out.push({
            from: { x: origin.x + offset.x, y: origin.y + (hung ? -0.12 : 0.12), z: origin.z + offset.z },
            dir: face({ x: barDir.x + (led - (perBar - 1) / 2) * 0.12, y: barDir.y, z: barDir.z }),
            color: cell,
            level: cell.level * flash,
            spread: 3.5,
            kind: 'thin',
          });
        }
      }
      return out;
    }
    if (category === 'effect' || category === 'flower') {
      // A derby or flower: many thin beams on a cone, turning.
      const count = 12;
      const axis = { x: 0, y: hung ? -1 : 1, z: 0 };
      for (let index = 0; index < count; index += 1) {
        const cell = cells[index % cells.length];
        const around = (index / count) * 360 + state.phase * 360;
        out.push({
          from: origin,
          dir: normalise(turnAboutY(tiltAboutX(axis, index % 2 === 0 ? 32 : 18), around)),
          color: cell,
          level: cell.level * flash * 0.8,
          spread: 2.2,
          kind: 'thin',
        });
      }
      return out;
    }
    if (category === 'laser') {
      // A fan of thin lines across the room, sweeping side to side.
      const count = 9;
      const sweep = Math.sin(state.phase * Math.PI * 2) * 18;
      const cell = cells[0];
      for (let index = 0; index < count; index += 1) {
        const across = (index - (count - 1) / 2) * 7 + sweep;
        out.push({
          from: origin,
          dir: face(turnAboutY(normalise({ x: 0, y: hung ? -0.18 : 0.12, z: 1 }), across)),
          color: cell,
          level: cell.level * flash,
          spread: 0.15,
          kind: 'laser',
        });
      }
      return out;
    }
    if (['smoke', 'hazer', 'fan', 'mirror-ball', 'special-effect'].includes(category)) {
      return out;
    }
    // Pars, bars, matrices, blinders, strobes, dimmers and the rest: a beam per cell, along the body (a matrix in a grid).
    const width = category === 'led-bar' ? 1.0 : category === 'blinder' ? 0.42 : category === 'matrix' ? 0.5 : 0;
    const columns = category === 'matrix' ? Math.ceil(Math.sqrt(cells.length)) : cells.length;
    const rows = Math.ceil(cells.length / columns);
    cells.forEach((cell, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const across = columns > 1 ? (column / (columns - 1) - 0.5) * width : 0;
      const raise = rows > 1 ? (row / (rows - 1)) * 0.45 : 0;
      const offset = face({ x: across, y: 0, z: 0 });
      out.push({
        from: {
          x: origin.x + offset.x,
          y: origin.y + (hung ? -0.1 - raise : 0.1 + raise),
          z: origin.z + offset.z,
        },
        dir: aim,
        color: cell,
        level: cell.level * flash,
        spread: state.spread,
        kind: 'beam',
        // The cells of a bar light the same patch of floor: together they are as bright as one light, not many.
        share: 1 / Math.sqrt(cells.length),
      });
    });
    return out;
  }

  /** One beam on the beam layer, with its pool of light where it lands. */
  function drawBeam(emitter, visibility, pools) {
    if (emitter.level < 0.01) {
      return;
    }
    const end = beamEnd(emitter.from, emitter.dir);
    const segment = camera.clip(emitter.from, end.point);
    if (!segment) {
      return;
    }
    const start = camera.project(segment[0]);
    const stop = camera.project(segment[1]);
    // How far along the beam each clipped end is, for its width there.
    const lengthAt = (point) =>
      Math.hypot(point.x - emitter.from.x, point.y - emitter.from.y, point.z - emitter.from.z);
    const spread = Math.tan((emitter.spread * Math.PI) / 180);
    const dx = stop.x - start.x;
    const dy = stop.y - start.y;
    const length = Math.hypot(dx, dy);
    const strength = emitter.level * visibility;

    if (length > 2) {
      const nx = -dy / length;
      const ny = dx / length;
      const lens = emitter.kind === 'laser' ? 0.004 : emitter.kind === 'thin' ? 0.02 : 0.07;
      const r0 = (lens + spread * lengthAt(segment[0])) * start.scale;
      const r1 = emitter.kind === 'laser' ? 1.2 : Math.max(1.5, (lens + spread * lengthAt(segment[1])) * stop.scale);
      // A soft wide pass and a brighter core; thin beams and lasers need only one.
      const layers =
        emitter.kind === 'laser'
          ? [[1, 0.95]]
          : emitter.kind === 'thin'
            ? [[1, 0.3]]
            : QUALITY[quality].layers === 2
              ? [
                  [1.5, 0.1],
                  [0.6, 0.27],
                ]
              : [[0.9, 0.33]];
      const fadeStart = lengthAt(segment[0]) / Math.max(0.01, end.length);
      for (const [widen, alpha] of layers) {
        const gradient = bctx.createLinearGradient(start.x, start.y, stop.x, stop.y);
        const a = strength * alpha;
        const tail = end.surface === 'air' ? 0 : 0.12;
        gradient.addColorStop(0, rgba(emitter.color, a * (1 - fadeStart * 0.6)));
        gradient.addColorStop(0.35, rgba(emitter.color, a * 0.55));
        gradient.addColorStop(1, rgba(emitter.color, a * tail));
        bctx.fillStyle = gradient;
        bctx.beginPath();
        bctx.moveTo(start.x + nx * r0 * widen, start.y + ny * r0 * widen);
        bctx.lineTo(stop.x + nx * r1 * widen, stop.y + ny * r1 * widen);
        bctx.lineTo(stop.x - nx * r1 * widen, stop.y - ny * r1 * widen);
        bctx.lineTo(start.x - nx * r0 * widen, start.y - ny * r0 * widen);
        bctx.closePath();
        bctx.fill();
      }
    }
    if (end.surface === 'floor' && emitter.kind !== 'laser') {
      pools.push({
        end,
        radius: Math.max(0.05, spread * end.length),
        color: emitter.color,
        level: emitter.level * (emitter.share ?? 1),
        gobo: emitter.gobo,
      });
    }
  }

  /** A pool of light on the floor, seen in perspective, with gobo dots when a gobo is in. */
  function drawPool(pool) {
    const { point } = pool.end;
    const centre = camera.project(point);
    if (!centre.visible) {
      return;
    }
    const r = pool.radius * 1.15;
    const side = camera.project({ x: point.x + r, y: 0, z: point.z });
    const front = camera.project({ x: point.x, y: 0, z: point.z + r });
    const ax = { x: side.x - centre.x, y: side.y - centre.y };
    const bx = { x: front.x - centre.x, y: front.y - centre.y };
    const rx = Math.hypot(ax.x, ax.y);
    if (rx < 1 || rx > cssWidth * 2) {
      return;
    }
    ctx.save();
    // The floor's own directions on screen, so the pool lies flat on it from any view.
    ctx.setTransform(ax.x * dpr, ax.y * dpr, bx.x * dpr, bx.y * dpr, centre.x * dpr, centre.y * dpr);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    const a = clamp(pool.level * 0.42, 0, 1);
    gradient.addColorStop(0, rgba({ r: 255, g: 255, b: 255 }, a * 0.12));
    gradient.addColorStop(0.15, rgba(pool.color, a));
    gradient.addColorStop(0.7, rgba(pool.color, a * 0.45));
    gradient.addColorStop(1, rgba(pool.color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    if (pool.gobo) {
      ctx.fillStyle = rgba(pool.color, a * 0.9);
      for (let index = 0; index < 7; index += 1) {
        const angle = (index / 7) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** @param {{ x: number, y: number }[]} points */
  function fillPolygon(points) {
    if (points.length < 3) {
      return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    ctx.fill();
  }

  /** The room: a dark space, a floor fading into it, and the polished dance floor, lit softly by the rig. */
  function drawRoom(ambient, editing) {
    const sky = ctx.createLinearGradient(0, 0, 0, cssHeight);
    sky.addColorStop(0, '#03040a');
    sky.addColorStop(1, '#07080f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const far = 30;
    ctx.fillStyle = '#0a0b12';
    fillPolygon(
      camera.clipPolygon([
        { x: -far, y: 0, z: -far },
        { x: far, y: 0, z: -far },
        { x: far, y: 0, z: far },
        { x: -far, y: 0, z: far },
      ]),
    );
    const w = rig.width / 2;
    const d = rig.depth / 2;
    const floorCorners = [
      { x: -w, y: 0, z: -d },
      { x: w, y: 0, z: -d },
      { x: w, y: 0, z: d },
      { x: -w, y: 0, z: d },
    ];
    const centre = camera.project({ x: 0, y: 0, z: 0 });
    const reach = Math.max(rig.width, rig.depth) * centre.scale;
    const polish = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, reach);
    polish.addColorStop(0, '#15172a');
    polish.addColorStop(1, '#0c0d17');
    ctx.fillStyle = polish;
    fillPolygon(camera.clipPolygon(floorCorners));

    // Tiles of a metre, faint, and the floor's edge.
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -w; x <= w + 1e-6; x += 1) {
      const segment = camera.clip({ x, y: 0, z: -d }, { x, y: 0, z: d });
      if (segment) {
        const a = camera.project(segment[0]);
        const b = camera.project(segment[1]);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
    }
    for (let z = -d; z <= d + 1e-6; z += 1) {
      const segment = camera.clip({ x: -w, y: 0, z }, { x: w, y: 0, z });
      if (segment) {
        const a = camera.project(segment[0]);
        const b = camera.project(segment[1]);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = editing ? 'rgba(255,159,67,0.55)' : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = editing ? 1.5 : 1;
    ctx.setLineDash(editing ? [6, 6] : []);
    const edge = camera.clipPolygon(floorCorners);
    if (edge.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(edge[0].x, edge[0].y);
      edge.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // The rig's overall light, washing the room softly.
    if (ambient.level > 0.01) {
      const glow = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, reach * 1.4);
      glow.addColorStop(0, rgba(ambient, 0.1 * ambient.level));
      glow.addColorStop(1, rgba(ambient, 0));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, cssWidth, cssHeight);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** A line of the room, cut at the camera. */
  function line(a, b) {
    const segment = camera.clip(a, b);
    if (!segment) {
      return;
    }
    const p = camera.project(segment[0]);
    const q = camera.project(segment[1]);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
  }

  /** Box truss on every rail: four chords and the zigzag between them; uprights stand on base plates. */
  function drawTruss(editing) {
    const half = 0.15;
    for (const rail of railsOf(rig)) {
      const along = normalise({ x: rail.to.x - rail.from.x, y: rail.to.y - rail.from.y, z: rail.to.z - rail.from.z });
      // Two directions across the rail, for the box's four chords.
      const across = rail.vertical ? { x: 1, y: 0, z: 0 } : normalise({ x: -along.z, y: 0, z: along.x });
      const other = rail.vertical ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
      const offset = (point, a, b) => ({
        x: point.x + (across.x * a + other.x * b) * half,
        y: point.y + (across.y * a + other.y * b) * half,
        z: point.z + (across.z * a + other.z * b) * half,
      });
      const middle = camera.project({
        x: (rail.from.x + rail.to.x) / 2,
        y: (rail.from.y + rail.to.y) / 2,
        z: (rail.from.z + rail.to.z) / 2,
      });
      ctx.strokeStyle = editing ? 'rgba(255,190,120,0.75)' : 'rgba(150,158,176,0.55)';
      ctx.lineWidth = clamp(0.025 * middle.scale, 1, 3);
      ctx.beginPath();
      for (const [a, b] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        line(offset(rail.from, a, b), offset(rail.to, a, b));
      }
      const length = Math.hypot(rail.to.x - rail.from.x, rail.to.y - rail.from.y, rail.to.z - rail.from.z);
      const steps = Math.max(1, Math.round(length / 0.5));
      for (let step = 0; step < steps; step += 1) {
        const t0 = step / steps;
        const t1 = (step + 1) / steps;
        const p0 = {
          x: rail.from.x + (rail.to.x - rail.from.x) * t0,
          y: rail.from.y + (rail.to.y - rail.from.y) * t0,
          z: rail.from.z + (rail.to.z - rail.from.z) * t0,
        };
        const p1 = {
          x: rail.from.x + (rail.to.x - rail.from.x) * t1,
          y: rail.from.y + (rail.to.y - rail.from.y) * t1,
          z: rail.from.z + (rail.to.z - rail.from.z) * t1,
        };
        const flip = step % 2 === 0 ? 1 : -1;
        line(offset(p0, -1, flip), offset(p1, -1, -flip));
        line(offset(p0, 1, flip), offset(p1, 1, -flip));
      }
      ctx.stroke();
      if (rail.vertical) {
        ctx.fillStyle = '#1b1e27';
        fillPolygon(
          camera.clipPolygon([
            offset({ ...rail.from, y: 0.01 }, -2.4, -2.4),
            offset({ ...rail.from, y: 0.01 }, 2.4, -2.4),
            offset({ ...rail.from, y: 0.01 }, 2.4, 2.4),
            offset({ ...rail.from, y: 0.01 }, -2.4, 2.4),
          ]),
        );
      }
    }
  }

  /** A light's body, drawn small and dark as the real thing, then its lenses glowing. */
  function drawBody(light, state, origin, emitters) {
    const at = camera.project(origin);
    if (!at.visible) {
      return;
    }
    const s = at.scale;
    const hung = origin.hung;
    ctx.save();
    ctx.translate(at.x, at.y);
    const metal = ctx.createLinearGradient(-0.2 * s, 0, 0.2 * s, 0);
    metal.addColorStop(0, '#16181f');
    metal.addColorStop(0.5, '#3b404d');
    metal.addColorStop(1, '#14161c');
    ctx.fillStyle = metal;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    const sign = hung ? 1 : -1;
    const category = light.category;
    if (['moving-head', 'scanner', 'barrel-scanner'].includes(category)) {
      // A base, a yoke that turns with pan, a head that tilts.
      const pan = (((state.pan ?? 0) + origin.facing) * Math.PI) / 180;
      const yokeWidth = Math.max(0.08, Math.abs(Math.cos(pan))) * 0.34 * s;
      ctx.fillRect(-0.2 * s, -0.04 * s * sign - (hung ? 0 : 0.08 * s), 0.4 * s, 0.1 * s);
      ctx.fillRect(-yokeWidth / 2, 0.06 * s * sign, yokeWidth, 0.04 * s * sign);
      ctx.fillRect(-yokeWidth / 2, 0.06 * s * sign, 0.04 * s, 0.24 * s * sign);
      ctx.fillRect(yokeWidth / 2 - 0.04 * s, 0.06 * s * sign, 0.04 * s, 0.24 * s * sign);
      ctx.beginPath();
      ctx.ellipse(0, 0.26 * s * sign, 0.15 * s, 0.13 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (['led-bar', 'matrix', 'blinder', 'strobe'].includes(category)) {
      const width = category === 'led-bar' ? 1.1 : category === 'matrix' ? 0.6 : category === 'blinder' ? 0.55 : 0.4;
      const height = category === 'matrix' ? 0.6 : 0.16;
      ctx.beginPath();
      ctx.roundRect(-width * s * 0.5, -0.02 * s, width * s, height * s * sign, 0.03 * s);
      ctx.fill();
      ctx.stroke();
    } else if (category === 'spider') {
      ctx.fillRect(-0.3 * s, -0.03 * s, 0.6 * s, 0.1 * s * sign);
      for (const [bar, tilt] of [
        [-1, state.tilts[0] ?? 0],
        [1, state.tilts[1] ?? state.tilts[0] ?? 0],
      ]) {
        ctx.save();
        ctx.translate(bar * 0.24 * s, 0.12 * s * sign);
        ctx.scale(1, Math.max(0.25, Math.abs(Math.cos((tilt * Math.PI) / 180))));
        ctx.fillRect(-0.22 * s, -0.035 * s, 0.44 * s, 0.07 * s);
        ctx.restore();
      }
    } else if (category === 'effect' || category === 'flower') {
      ctx.beginPath();
      ctx.arc(0, 0.06 * s * sign, 0.17 * s, hung ? 0 : Math.PI, hung ? Math.PI : Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-0.2 * s, -0.05 * s * sign, 0.4 * s, 0.07 * s * sign);
    } else if (category === 'mirror-ball') {
      const r = 0.22 * s;
      ctx.fillStyle = '#9aa3b5';
      ctx.beginPath();
      ctx.arc(0, 0.3 * s, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1b1f28';
      ctx.fillRect(-0.005 * s, -0.02 * s, 0.01 * s, 0.1 * s);
      for (let index = 0; index < 8; index += 1) {
        const x = (((index / 8 + state.phase) % 1) - 0.5) * 2 * r;
        ctx.beginPath();
        ctx.moveTo(x, 0.3 * s - Math.sqrt(Math.max(0, r * r - x * x)));
        ctx.lineTo(x, 0.3 * s + Math.sqrt(Math.max(0, r * r - x * x)));
        ctx.stroke();
      }
    } else if (category === 'smoke' || category === 'hazer') {
      ctx.beginPath();
      ctx.roundRect(-0.32 * s, -0.24 * s, 0.64 * s, 0.24 * s, 0.03 * s);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0a0b0f';
      ctx.fillRect(-0.06 * s, -0.16 * s, 0.12 * s, 0.08 * s);
    } else if (category === 'laser') {
      ctx.fillRect(-0.15 * s, -0.08 * s * sign, 0.3 * s, 0.16 * s);
    } else if (category === 'fan') {
      const r = 0.3 * s;
      const cy = -0.34 * s;
      ctx.fillRect(-0.03 * s, cy, 0.06 * s, Math.abs(cy));
      ctx.beginPath();
      ctx.arc(0, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,170,190,0.45)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(150,160,180,0.55)';
      for (let blade = 0; blade < 5; blade += 1) {
        ctx.save();
        ctx.translate(0, cy);
        ctx.rotate((blade / 5 + (state.fanPhase ?? 0)) * Math.PI * 2);
        ctx.beginPath();
        ctx.ellipse(r * 0.45, 0, r * 0.42, r * 0.14, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (category === 'special-effect') {
      ctx.beginPath();
      ctx.roundRect(-0.25 * s, -0.22 * s, 0.5 * s, 0.22 * s, 0.04 * s);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0a0b0f';
      ctx.beginPath();
      ctx.arc(0, -0.26 * s, 0.07 * s, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // A par can (or a spot, a dimmer lamp).
      ctx.beginPath();
      ctx.roundRect(-0.15 * s, -0.02 * s * sign - (hung ? 0 : 0.3 * s), 0.3 * s, 0.32 * s, 0.05 * s);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Lenses: a white-hot core and a halo in the light's colour; bigger when the beam points at the camera.
    ctx.globalCompositeOperation = 'lighter';
    const toCamera = normalise({
      x: camera.eye.x - origin.x,
      y: camera.eye.y - origin.y,
      z: camera.eye.z - origin.z,
    });
    for (const emitter of emitters) {
      if (emitter.level < 0.01) {
        continue;
      }
      const lens = camera.project(emitter.from);
      if (!lens.visible) {
        continue;
      }
      const toward = clamp(emitter.dir.x * toCamera.x + emitter.dir.y * toCamera.y + emitter.dir.z * toCamera.z, 0, 1);
      const r = (emitter.kind === 'laser' ? 0.04 : 0.07 + toward * 0.3) * lens.scale * (0.5 + emitter.level * 0.6);
      const halo = ctx.createRadialGradient(lens.x, lens.y, 0, lens.x, lens.y, r * 2.4);
      halo.addColorStop(0, `rgba(255,255,255,${clamp(emitter.level * 0.9, 0, 1)})`);
      halo.addColorStop(0.1, rgba(emitter.color, emitter.level * 0.85));
      halo.addColorStop(0.4, rgba(emitter.color, emitter.level * 0.16));
      halo.addColorStop(1, rgba(emitter.color, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(lens.x, lens.y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** The dots a mirror ball throws on the floor, in the colour of the light around it. */
  function drawMirrorDots(origin, state, light) {
    if (light.level < 0.03) {
      return;
    }
    const ball = { x: origin.x, y: origin.y - 0.3, z: origin.z };
    ctx.globalCompositeOperation = 'lighter';
    const dots = QUALITY[quality].dots;
    for (let index = 0; index < dots; index += 1) {
      const y = -(index / (dots - 1));
      const radius = Math.sqrt(1 - y * y);
      const angle = index * 2.399963 + state.phase * Math.PI * 2;
      const end = beamEnd(ball, { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius });
      if (end.surface !== 'floor' || end.length > MAX_BEAM * 0.8) {
        continue;
      }
      const at = camera.project(end.point);
      if (!at.visible) {
        continue;
      }
      const r = 0.05 * at.scale;
      const dot = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, r * 2);
      dot.addColorStop(0, rgba(light, light.level * 0.9));
      dot.addColorStop(1, rgba(light, 0));
      ctx.fillStyle = dot;
      ctx.fillRect(at.x - r * 2, at.y - r * 2, r * 4, r * 4);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Smoke, haze and bubbles: puffs that grow, rise, drift and fade; fans push them toward the middle. */
  function stepAir(lights, dt) {
    let windX = 0;
    let windZ = 0;
    for (const light of lights) {
      const state = shown.get(light.id);
      if (light.category === 'fan' && state && state.fan > 0.02) {
        const to = normalise({ x: -light.position.x, y: 0, z: -light.position.z });
        windX += to.x * state.fan * 1.6;
        windZ += to.z * state.fan * 1.6;
      }
    }
    for (const light of lights) {
      const state = shown.get(light.id);
      if (!state) {
        continue;
      }
      const origin = light.position;
      const inward = normalise({ x: -origin.x, y: 0, z: -origin.z });
      if (state.fog > 0.02 && (light.category === 'smoke' || light.category === 'hazer')) {
        const isHazer = light.category === 'hazer';
        smokeHaze = clamp(smokeHaze + state.fog * dt * (isHazer ? 0.12 : 0.06), 0, 0.85);
        const count = Math.floor(state.fog * (isHazer ? 10 : 34) * dt + Math.random());
        for (let index = 0; index < count && particles.length < QUALITY[quality].particles; index += 1) {
          const speed = (isHazer ? 0.3 : 1.4) * (0.6 + Math.random() * 0.8);
          particles.push({
            x: origin.x + inward.x * 0.3,
            y: Math.max(0.2, origin.y + 0.1),
            z: origin.z + inward.z * 0.3,
            vx: inward.x * speed + (Math.random() - 0.5) * 0.4,
            vy: 0.12 + Math.random() * 0.25,
            vz: inward.z * speed + (Math.random() - 0.5) * 0.4,
            age: 0,
            life: isHazer ? 9 : 5 + Math.random() * 2,
            size: isHazer ? 1.2 : 0.35,
            strength: state.fog * (isHazer ? 0.5 : 1),
          });
        }
      }
      if (light.category === 'special-effect' && state.effect > 0.02) {
        const count = Math.floor(state.effect * 14 * dt + Math.random());
        for (let index = 0; index < count && bubbles.length < 160; index += 1) {
          bubbles.push({
            x: origin.x,
            y: origin.y + 0.3,
            z: origin.z,
            vx: (Math.random() - 0.5) * 0.8 + inward.x * 0.3,
            vy: 0.35 + Math.random() * 0.4,
            age: 0,
            life: 5 + Math.random() * 3,
            size: 0.04 + Math.random() * 0.06,
          });
        }
      }
    }
    smokeHaze = Math.max(0, smokeHaze - dt * 0.012);
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.age += dt;
      if (particle.age > particle.life) {
        particles.splice(index, 1);
        continue;
      }
      const slow = Math.exp(-0.5 * dt);
      particle.vx = particle.vx * slow + windX * dt * 0.8;
      particle.vz = particle.vz * slow + windZ * dt * 0.8;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      particle.size += dt * 0.55;
    }
    for (let index = bubbles.length - 1; index >= 0; index -= 1) {
      const bubble = bubbles[index];
      bubble.age += dt;
      if (bubble.age > bubble.life) {
        bubbles.splice(index, 1);
        continue;
      }
      bubble.vx += (windX * 0.5 + Math.sin(bubble.age * 2 + index) * 0.2) * dt;
      bubble.x += bubble.vx * dt;
      bubble.z += windZ * 0.5 * dt;
      bubble.y += bubble.vy * dt * Math.max(0.2, 1 - bubble.age / bubble.life);
    }
  }

  function drawSmoke(ambient) {
    const tint = {
      r: 90 + ambient.r * 0.55 * ambient.level,
      g: 95 + ambient.g * 0.55 * ambient.level,
      b: 110 + ambient.b * 0.55 * ambient.level,
    };
    for (const particle of particles) {
      const at = camera.project(particle);
      if (!at.visible) {
        continue;
      }
      const r = particle.size * at.scale;
      const alpha = Math.sin((Math.PI * particle.age) / particle.life) * 0.09 * particle.strength;
      const puff = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, r);
      puff.addColorStop(0, rgba(tint, alpha));
      puff.addColorStop(1, rgba(tint, 0));
      ctx.fillStyle = puff;
      ctx.fillRect(at.x - r, at.y - r, r * 2, r * 2);
    }
  }

  function drawBubbles(ambient) {
    const rim = { r: 170 + ambient.r * 0.3, g: 190 + ambient.g * 0.25, b: 220 + ambient.b * 0.15 };
    ctx.lineWidth = 1;
    for (const bubble of bubbles) {
      const at = camera.project(bubble);
      if (!at.visible) {
        continue;
      }
      const r = Math.max(1.5, bubble.size * at.scale);
      const fade = Math.min(1, (bubble.life - bubble.age) / 1.2);
      ctx.strokeStyle = rgba(rim, 0.55 * fade);
      ctx.beginPath();
      ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${(0.7 * fade).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(at.x - r * 0.35, at.y - r * 0.35, Math.max(0.6, r * 0.18), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * @param {{ lights: Light[], dt: number, time: number, haze: number, flashing: boolean, editing: boolean,
   *   selectedId: string | null, showNames: boolean }} input
   */
  function frame({ lights, dt, time, haze, flashing, editing, selectedId, showNames }) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.setTransform(dpr * beamScale, 0, 0, dpr * beamScale, 0, 0);

    const prepared = lights.map((light) => {
      const state = smooth(light, dt);
      // A strobe flashes for a quarter of each cycle; with flashing off, it shows steady at half brightness.
      const flash = state.strobeHz > 0 ? (flashing ? (state.strobePhase < 0.25 ? 1 : 0.04) : 0.5) : 1;
      return { light, state, origin: light.position, flash, emitters: emittersOf(light, state, light.position, flash) };
    });

    // The rig's overall colour, for the room's glow, the smoke and a mirror ball.
    const ambient = { r: 0, g: 0, b: 0, level: 0 };
    for (const { emitters } of prepared) {
      for (const emitter of emitters) {
        ambient.r += emitter.color.r * emitter.level;
        ambient.g += emitter.color.g * emitter.level;
        ambient.b += emitter.color.b * emitter.level;
        ambient.level += emitter.level;
      }
    }
    if (ambient.level > 0) {
      ambient.r /= ambient.level;
      ambient.g /= ambient.level;
      ambient.b /= ambient.level;
      ambient.level = clamp(ambient.level / 4, 0, 1);
    }

    stepAir(lights, dt);
    // While arranging, beams are dimmed so the rig and the names stay readable.
    const visibility = (0.12 + 0.88 * clamp(haze + smokeHaze, 0, 1)) * (editing ? 0.35 : 1);

    drawRoom(ambient, editing);

    // Beams on their own layer, then seen through the haze texture, then added to the picture.
    bctx.clearRect(0, 0, cssWidth, cssHeight);
    bctx.globalCompositeOperation = 'lighter';
    const pools = [];
    for (const { emitters } of prepared) {
      for (const emitter of emitters) {
        drawBeam(emitter, visibility, pools);
      }
    }
    if (hazePattern) {
      bctx.globalCompositeOperation = 'destination-in';
      bctx.save();
      bctx.translate(-((time * 9) % 384), -((time * 4) % 384));
      bctx.fillStyle = hazePattern;
      bctx.fillRect(0, 0, cssWidth + 384, cssHeight + 384);
      bctx.restore();
    }
    bctx.globalCompositeOperation = 'source-over';

    ctx.globalCompositeOperation = 'lighter';
    for (const pool of pools) {
      drawPool(pool);
    }
    ctx.globalCompositeOperation = 'source-over';
    drawSmoke(ambient);
    drawTruss(editing);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(beams, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    hits.clear();
    // Far lights first, so nearer ones are drawn over them.
    const byDepth = [...prepared].sort((a, b) => camera.project(b.origin).depth - camera.project(a.origin).depth);
    for (const { light, state, origin, emitters } of byDepth) {
      drawBody(light, state, origin, emitters);
      if (light.category === 'mirror-ball') {
        drawMirrorDots(origin, state, ambient);
      }
      const at = camera.project(origin);
      if (at.visible) {
        hits.set(light.id, {
          x: at.x,
          y: at.y + (origin.hung ? 0.15 : -0.15) * at.scale,
          r: Math.max(24, 0.45 * at.scale),
        });
      }
    }
    drawBubbles(ambient);

    // A strobe flashing lights up the whole room for an instant, as a real one does.
    if (flashing && prepared.some(({ state, flash }) => state.strobeHz > 0 && flash === 1 && state.intensity > 0.05)) {
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(0, 0, cssWidth, cssHeight);
    }

    // A vignette, as a camera sees a dark room.
    const vignette = ctx.createRadialGradient(
      cssWidth / 2,
      cssHeight / 2,
      Math.min(cssWidth, cssHeight) * 0.3,
      cssWidth / 2,
      cssHeight / 2,
      Math.max(cssWidth, cssHeight) * 0.75,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // Names and handles, when arranging the lights or asked for.
    if (editing || showNames) {
      ctx.font = '600 12px Manrope, system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (const { light, origin } of prepared) {
        const hit = hits.get(light.id);
        if (!hit) {
          continue;
        }
        if (editing) {
          ctx.strokeStyle = light.id === selectedId ? '#ff9f43' : 'rgba(255,255,255,0.35)';
          ctx.lineWidth = light.id === selectedId ? 2.5 : 1.2;
          ctx.setLineDash(light.id === selectedId ? [] : [4, 4]);
          ctx.beginPath();
          ctx.arc(hit.x, hit.y, hit.r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const labelY = hit.y + (origin.hung ? hit.r + 16 : -hit.r - 8);
        const width = ctx.measureText(light.name).width + 14;
        ctx.fillStyle = 'rgba(8,9,14,0.75)';
        ctx.beginPath();
        ctx.roundRect(hit.x - width / 2, labelY - 13, width, 19, 6);
        ctx.fill();
        ctx.fillStyle = '#f2f3f7';
        ctx.fillText(light.name, hit.x, labelY + 1);
      }
    }
  }

  /** @param {number} x @param {number} y @returns {string | null} the light under a point */
  function hitTest(x, y) {
    let best = null;
    let bestDistance = Infinity;
    for (const [id, hit] of hits) {
      const distance = Math.hypot(hit.x - x, hit.y - y);
      if (distance <= hit.r && distance < bestDistance) {
        best = id;
        bestDistance = distance;
      }
    }
    return best;
  }

  /**
   * Lighter or full detail: the visualizer lowers it when frames run slow on a device, and raises it again when there is
   * room.
   * @param {'high' | 'low'} next
   */
  function setQuality(next) {
    if (next !== quality) {
      quality = next;
      resize(cssWidth, cssHeight);
    }
  }

  return { resize, setScene, setQuality, frame, hitTest, camera: () => camera };
}
