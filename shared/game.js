import { ARENA_SPAWNS, ARENA_PICKUPS, arenaSurface, constrainArena } from './arena.js';
import { volcanoLavaGrip } from './volcano-lava.js';
import { collideFactoryRotors, rotorBotTarget } from './factory-rotors.js';
import {
  VOLCANO_HOT,
  circuitDistance,
  FACTORY_PRESSES,
  EXTRA_CIRCUITS,
  extraCircuitPoints,
  extraHalfWidth,
  extraHasBarrier,
  circuitSurface,
  applyCircuitForces,
  advanceCircuitHeat,
  heatSpeedMultiplier,
  FACTORY_TIPS,
  factoryTipAt,
  factoryTipAngle,
} from './extra-circuits.js';
import { coastalHasBarrier } from './coastal-barriers.js';
import { coastalCrabs, collideCrabs } from './coastal-crabs.js';
import { applyDesertWind } from './desert-storm.js';
import { boostLayout, boostSpeed, softenPadBoostImpact } from './boost-pads.js';
import { stepRollover, shoveRollover } from './rollover.js';
import { SEA_LEVEL } from './beach-profile.js';
import {
  bodyOffset,
  WHEEL_POINTS,
  wheelSupports,
  balanceOnWheels,
  collideTerrain,
} from './edge-physics.js';
import { createLandscape } from './landscape.js';
import {
  DESERT_CACTI,
  DESERT_JUMPS,
  desertElevation,
  desertHalfWidth,
  desertHasBarrier,
  desertRampLift,
  desertRampGrade,
  desertMoles,
  moleState,
} from './desert-features.js';
export { MAX_PLAYERS } from './session-limits.js';
export const LAPS = 3;
export const STEP = 1 / 60;
export const ROAD_WIDTH = 12;
export const TOP_SPEED = 36;
export const SURFACE_HALF_WIDTH = ROAD_WIDTH / 2 + 0.6;
export const START_BOOST_SECONDS = 0.8;
export const START_SPIN_SECONDS = 1.1;
export const DAMAGE_HEALTH = 60;
// Keep full performance until 60 HP, retaining the existing penalties at 1 HP.
export const damageSeverity = (health) =>
  (DAMAGE_HEALTH - Math.max(1, Math.min(DAMAGE_HEALTH, health))) / (DAMAGE_HEALTH - 1);
export const healthSpeedFactor = (health) => 1 - 0.2 * damageSeverity(health);
export function launchResult(pressedAt, startAt) {
  if (!Number.isFinite(pressedAt)) return 'normal';
  const lead = startAt - pressedAt;
  return Math.abs(lead - 1000) <= 20 ? 'boost' : 'normal';
}
export function applyLaunch(car, pressedAt, startAt) {
  car.launchResult = launchResult(pressedAt, startAt);
  if (car.launchResult === 'boost') car.boost = START_BOOST_SECONDS;
  car.spinout = 0;
}
// Only the current uninterrupted hold counts. A late or implausible timestamp
// falls back to receipt time; the client never chooses its launch outcome.
export function recordLaunchInput(player, input, at, now, startAt) {
  if (input.throttle <= 0.1 || input.reverse) {
    player.accelPressedAt = null;
    return;
  }
  if (player.input.throttle > 0.1 && !player.input.reverse && now - player.lastInput <= 250) return;
  player.accelPressedAt =
    Number.isFinite(at) && at >= now - 250 && at <= now + 50 ? Math.min(at, now) : now;
  player.accelPressedAt = Math.max(startAt - 3300, player.accelPressedAt);
}
export const CAR_LENGTH = 4.9;
export const CAR_WIDTH = 2.1;
export const NUDGE_DURATION = 0.1;
export const TARGET_TRACK_LENGTH = 3466.9092022732743 * 0.7;
export const START_FRACTION = 0.012;
export const COLORS = [
  '#ff514f',
  '#388bff',
  '#ffd139',
  '#44db89',
  '#b681ff',
  '#ff893e',
  '#45dfef',
  '#f98bc4',
];
export const COLOR_NAMES = ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange', 'Cyan', 'Pink'];
export const NEUTRAL = Object.freeze({
  steer: 0,
  throttle: 0,
  reverse: false,
  brake: false,
  fire: false,
  nudge: 0,
});
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function angleDelta(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
const anchors = [
  [-260, 150],
  [-130, 150],
  [0, 150],
  [85, 150],
  [110, 110],
  [80, 65],
  [110, 40],
  [180, 55],
  [245, 150],
  [280, 105],
  [270, 35],
  [240, -30],
  [280, -90],
  [275, -140],
  [200, -165],
  [80, -165],
  [-40, -165],
  [-160, -165],
  [-230, -140],
  [-235, -100],
  [-195, -65],
  [-225, -25],
  [-280, -60],
  [-305, 0],
  [-260, 50],
  [-285, 100],
];
function spline(p0, p1, p2, p3, t) {
  return (
    p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
  );
}
export const TRACKS = Object.freeze({
  cafe: {
    id: 'cafe',
    name: 'Cat Café Clash',
    description: 'Balloon battle · coffee cups · climbing blocks',
    grip: 1,
    gameType: 'battle-arena',
  },
  coast: {
    id: 'coast',
    name: 'Saltwater Circuit',
    description: 'Coastal causeways · technical turns',
    grip: 1,
  },
  ice: {
    id: 'ice',
    name: 'Frost & Furious',
    description: '2.03 km of ice · split lanes · exposed straights',
    grip: 0.12,
  },
  desert: {
    id: 'desert',
    name: 'Redrock Overpass',
    description: 'Mountain bridge · four jumps · mole flats',
    grip: 0.85,
  },
  factory: {
    id: 'factory',
    name: 'Skid Mark Industries',
    description: 'Reversing conveyors · rotating decks · stamping presses',
    grip: 0.95,
  },
  volcano: {
    id: 'volcano',
    name: 'Krakatoa',
    description: 'Hot lanes · erupting vents · exposed crater rim',
    grip: 0.9,
    camera: {
      yawOffset: 0.52,
      spreadYawOffset: 0.9,
      pitch: (25 * Math.PI) / 180,
      spreadPitch: (20 * Math.PI) / 180,
    },
  },
});
export let BOOST_PADS;
export let activeTrack = TRACKS.coast,
  TRACK,
  SEGMENTS,
  TRACK_LENGTH,
  PLAZAS,
  OBSTACLES,
  MOLES,
  CRABS,
  PICKUP_ROW_COUNT,
  PICKUP_LOCATIONS;
const trackCache = new Map(),
  landscapeCache = new Map();
let segmentTree;
// Spatial bounds prune distant road segments without approximating contacts.
function buildSegmentTree(start = 0, end = SEGMENTS.length) {
  const node = { start, end, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  if (end - start > 12) {
    const mid = (start + end) >> 1;
    node.left = buildSegmentTree(start, mid);
    node.right = buildSegmentTree(mid, end);
    for (const child of [node.left, node.right]) {
      node.minX = Math.min(node.minX, child.minX);
      node.maxX = Math.max(node.maxX, child.maxX);
      node.minZ = Math.min(node.minZ, child.minZ);
      node.maxZ = Math.max(node.maxZ, child.maxZ);
    }
  } else
    for (let i = start; i < end; i++) {
      const s = SEGMENTS[i];
      node.minX = Math.min(node.minX, s.x, s.x + s.dx);
      node.maxX = Math.max(node.maxX, s.x, s.x + s.dx);
      node.minZ = Math.min(node.minZ, s.z, s.z + s.dz);
      node.maxZ = Math.max(node.maxZ, s.z, s.z + s.dz);
    }
  return node;
}
function segmentAtDistance(d) {
  let lo = 0,
    hi = SEGMENTS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (SEGMENTS[mid].start + SEGMENTS[mid].len >= d) hi = mid;
    else lo = mid + 1;
  }
  return SEGMENTS[lo];
}
export function getLandscape() {
  if (!landscapeCache.has(activeTrack.id))
    landscapeCache.set(
      activeTrack.id,
      createLandscape({
        id: activeTrack.id,
        segments: SEGMENTS,
        trackLength: TRACK_LENGTH,
        trackAt,
        nearestTrack,
        hasBarrier,
      }),
    );
  return landscapeCache.get(activeTrack.id);
}
export function terrainAt(x, z, ceiling = Infinity) {
  if (activeTrack.id === 'cafe') return arenaSurface(x, z, ceiling);
  const land = getLandscape().surface.sample(x, z, ceiling);
  return (
    land ||
    (activeTrack.id !== 'coast' && ceiling >= (activeTrack.id === 'factory' ? -8 : -4)
      ? { y: activeTrack.id === 'factory' ? -8 : -4, nx: 0, ny: 1, nz: 0 }
      : null)
  );
}
const arcDistance = (a, b) => Math.abs(((((a - b + 0.5) % 1) + 1) % 1) - 0.5) * TRACK_LENGTH;
function icePoints() {
  // Each straight is 914.4m: exactly 60% of the former 1,524m.
  const corners = [
      [-475.2, -40],
      [475.2, -40],
      [475.2, 40],
      [-475.2, 40],
    ],
    points = [];
  for (let i = 0; i < 4; i++) {
    const prev = corners[(i + 3) % 4],
      p = corners[i],
      next = corners[(i + 1) % 4];
    const before = Math.hypot(prev[0] - p[0], prev[1] - p[1]),
      after = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const a = [p[0] + ((prev[0] - p[0]) * 18) / before, p[1] + ((prev[1] - p[1]) * 18) / before],
      b = [p[0] + ((next[0] - p[0]) * 18) / after, p[1] + ((next[1] - p[1]) * 18) / after];
    for (let j = 0; j < 18; j++) {
      const t = j / 18;
      points.push({
        x: (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * p[0] + t * t * b[0],
        z: (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * p[1] + t * t * b[1],
      });
    }
    const q = next,
      len = Math.hypot(q[0] - p[0], q[1] - p[1]),
      end = [q[0] - ((q[0] - p[0]) * 18) / len, q[1] - ((q[1] - p[1]) * 18) / len],
      n = Math.ceil((len - 36) / 2);
    for (let j = 0; j < n; j++)
      points.push({ x: b[0] + ((end[0] - b[0]) * j) / n, z: b[1] + ((end[1] - b[1]) * j) / n });
  }
  return points;
}
function desertPoints() {
  // Crossing at t=0 is a 20m bridge; crossing at pi is the road beneath it.
  const points = Array.from({ length: 1500 }, (_, i) => {
    const t = (i / 1500) * Math.PI * 2;
    return {
      x: 270 * Math.sin(t),
      z: 170 * Math.sin(2 * t),
      y: 20 * Math.max(0, Math.cos(t)) ** 4,
    };
  });
  const lengths = points.map((p, i) =>
      Math.hypot(p.x - points[(i + 1) % points.length].x, p.z - points[(i + 1) % points.length].z),
    ),
    total = lengths.reduce((a, b) => a + b, 0);
  let distance = 0;
  for (let i = 0; i < points.length; i++) {
    points[i].y = desertElevation(distance / total, points[i].y, total);
    distance += lengths[i];
  }
  return points;
}
export function iceSplit(x) {
  if (activeTrack.id !== 'ice') return 0;
  const t = clamp((115 - Math.abs(x)) / 35, 0, 1);
  return 4 * t * t * (3 - 2 * t);
}
// Each side can independently be guarded; inner refers to the split's gap edge.
export function hasBarrier(fraction, side = 0, inner = false) {
  if (activeTrack.id === 'cafe') return false;
  if (activeTrack.id === 'ice') {
    const p = trackAt(fraction);
    // First straight's boost-fed right branch is exposed at both the crevasse
    // and the outside edge. The other branch and the return fork keep guards.
    if (p.z < 0 && Math.abs(p.x) < 155 && side > 0) return false;
    if (inner)
      return iceSplit(p.x) > 0.3 && (side < 0 ? p.x > -55 && p.x < 30 : p.x > -30 && p.x < 55);
    if (Math.abs(p.x) > 457.2 + 1e-6) return true; // only the curved/square U-turn itself
    if (!side) return hasBarrier(fraction, -1) || hasBarrier(fraction, 1);
    return side < 0 ? p.x > -100 && p.x < -40 : p.x > 40 && p.x < 100;
  }
  if (inner) return false;
  if (EXTRA_CIRCUITS.includes(activeTrack.id)) {
    const p = trackAt(fraction);
    return extraHasBarrier(activeTrack.id, fraction, side, TRACK_LENGTH, p.insideSide, p.turn);
  }
  if (activeTrack.id === 'desert') return desertHasBarrier(fraction);
  return coastalHasBarrier(fraction, side);
}
export function selectTrack(id = 'coast') {
  if (!Object.hasOwn(TRACKS, id)) throw new Error('Unknown track');
  activeTrack = TRACKS[id];
  if (trackCache.has(id)) {
    ({
      TRACK,
      SEGMENTS,
      TRACK_LENGTH,
      PLAZAS,
      OBSTACLES,
      MOLES,
      CRABS,
      PICKUP_ROW_COUNT,
      PICKUP_LOCATIONS,
      BOOST_PADS,
      segmentTree,
    } = trackCache.get(id));
    return activeTrack;
  }
  TRACK = Array.from({ length: 1500 }, (_, i) => {
    const f = (i / 1500) * anchors.length,
      j = Math.floor(f),
      t = f - j,
      n = anchors.length;
    return {
      x: spline(
        anchors[(j + n - 1) % n][0],
        anchors[j][0],
        anchors[(j + 1) % n][0],
        anchors[(j + 2) % n][0],
        t,
      ),
      z: spline(
        anchors[(j + n - 1) % n][1],
        anchors[j][1],
        anchors[(j + 1) % n][1],
        anchors[(j + 2) % n][1],
        t,
      ),
    };
  });
  // Preserve the requested 30% length reduction while authoring turns independently.
  if (activeTrack.id === 'ice') TRACK = icePoints().map((p) => ({ ...p, y: 1 }));
  if (activeTrack.id === 'desert') TRACK = desertPoints();
  if (EXTRA_CIRCUITS.includes(id)) TRACK = extraCircuitPoints(id);
  const rawLength = TRACK.reduce(
    (sum, p, i) =>
      sum +
      Math.hypot(p.x - TRACK[(i + 1) % TRACK.length].x, p.z - TRACK[(i + 1) % TRACK.length].z),
    0,
  );
  if (activeTrack.id === 'coast')
    for (const p of TRACK) {
      p.x *= TARGET_TRACK_LENGTH / rawLength;
      p.z *= TARGET_TRACK_LENGTH / rawLength;
    }
  let length = 0;
  SEGMENTS = TRACK.map((p, i) => {
    const q = TRACK[(i + 1) % TRACK.length],
      dx = q.x - p.x,
      dz = q.z - p.z,
      len = Math.hypot(dx, dz);
    const s = {
      y: 0,
      ...p,
      dy: (q.y || 0) - (p.y || 0),
      dx,
      dz,
      len,
      start: length,
      nx: -dz / len,
      nz: dx / len,
    };
    length += len;
    return s;
  });
  TRACK_LENGTH = length;
  segmentTree = buildSegmentTree();
  // Smooth widening around bends and three passing plazas, shared by rendering and physics.
  PLAZAS = activeTrack.id === 'coast' ? [0.1, 0.3, 0.7] : [];

  for (let i = 0; i < SEGMENTS.length; i++) {
    const s = SEGMENTS[i],
      before = SEGMENTS[(i + SEGMENTS.length - 10) % SEGMENTS.length],
      after = SEGMENTS[(i + 10) % SEGMENTS.length];
    const signedTurn = angleDelta(Math.atan2(after.dz, after.dx), Math.atan2(before.dz, before.dx)),
      bend = Math.abs(signedTurn);
    s.turn = signedTurn;
    s.insideSide = Math.sign(signedTurn) || 1;
    let halfWidth = 6 + Math.min(3, bend * 3.5);
    for (const f of PLAZAS) {
      const d = arcDistance(s.start / TRACK_LENGTH, f);
      if (d < 65) halfWidth = Math.max(halfWidth, 6 + (6 * (1 + Math.cos((Math.PI * d) / 65))) / 2);
    }
    let clearance = Infinity;
    for (let j = 0; j < SEGMENTS.length; j += 3) {
      const q = SEGMENTS[j];
      if (arcDistance(s.start / TRACK_LENGTH, q.start / TRACK_LENGTH) > 45)
        clearance = Math.min(clearance, Math.hypot(s.x - q.x, s.z - q.z));
    }
    s.halfWidth = EXTRA_CIRCUITS.includes(id)
      ? extraHalfWidth(id, s.start / TRACK_LENGTH, TRACK_LENGTH)
      : activeTrack.id === 'ice'
        ? 9 +
          Math.max(
            6 * clamp((Math.abs(s.x) - 420) / 40, 0, 1),
            5 * clamp((155 - Math.abs(s.x)) / 50, 0, 1),
          )
        : activeTrack.id === 'desert'
          ? desertHalfWidth(s.start / TRACK_LENGTH, TRACK_LENGTH)
          : Math.max(6, Math.min(halfWidth, (clearance - 3) / 2));
  }
  for (let i = 0; i < SEGMENTS.length; i++)
    SEGMENTS[i].nextHalfWidth = SEGMENTS[(i + 1) % SEGMENTS.length].halfWidth;
  OBSTACLES = PLAZAS.flatMap((fraction, index) =>
    [-8, 8].map((offset, i) => {
      const f = fraction + offset / TRACK_LENGTH,
        p = trackAt(f);
      return { id: `island-${index}-${i}`, fraction: f, x: p.x, z: p.z, radius: 1.65, height: 1.5 };
    }),
  );
  if (activeTrack.id === 'volcano')
    OBSTACLES = Array.from({ length: 14 }, (_, i) => {
      const fraction = 0.12 + i * 0.058 + Math.sin(i * 2.1) * 0.006,
        side = i % 2 ? 1 : -1;
      // Keep the entire inner rock cluster clear of fast lava lanes, including
      // its end boulders and a small approach/exit buffer. Rendering shares this list.
      if (
        side > 0 &&
        VOLCANO_HOT.some(
          (zone) => circuitDistance(fraction, zone.fraction, TRACK_LENGTH) < zone.length / 2 + 6,
        )
      )
        return [];
      return Array.from({ length: 4 }, (_, j) => {
        const f = fraction + ((j - 1.5) * 1.7) / TRACK_LENGTH,
          p = trackAt(f),
          radius = j === 1 ? 1.5 : 0.65 + (j % 3) * 0.23,
          lateral = side * (p.halfWidth + (j === 1 ? -0.8 : j === 2 ? 0.3 : -0.2)),
          x = p.x + p.nx * lateral,
          z = p.z + p.nz * lateral,
          y =
            Math.abs(lateral) <= p.halfWidth + 0.7
              ? p.y - 0.1
              : Math.min(p.y - 0.1, terrainAt(x, z)?.y ?? p.y);
        return {
          id: `basalt-${i}-${j}`,
          kind: 'basalt',
          fraction: f,
          x,
          z,
          y,
          radius,
          height: radius * 1.9,
          angle: i * 2.3 + j,
        };
      });
    }).flat();
  if (activeTrack.id === 'desert')
    OBSTACLES = DESERT_CACTI.map(({ fraction, side }, i) => {
      const p = trackAt(fraction),
        lateral = side * (p.halfWidth - 1.5);
      return {
        id: `cactus-${i}`,
        kind: 'cactus',
        fraction,
        x: p.x + p.nx * lateral,
        z: p.z + p.nz * lateral,
        y: p.y,
        radius: 0.65,
        height: 7,
        angle: p.angle,
      };
    });
  MOLES =
    activeTrack.id === 'desert'
      ? desertMoles(TRACK_LENGTH).map((m) => {
          const p = trackAt(m.fraction);
          return {
            ...m,
            x: p.x + p.nx * m.lateral,
            y: p.y,
            z: p.z + p.nz * m.lateral,
            angle: p.angle,
          };
        })
      : [];
  CRABS = activeTrack.id === 'coast' ? coastalCrabs(trackAt) : [];
  // Preserve the original rows, filling three gaps with extra weapon choices.
  const basePickupRows = Math.round(TRACK_LENGTH / (TOP_SPEED * 10));
  const extraPickupFractions = {
    coast: [0.12, 0.405, 0.55],
    ice: [0.14, 0.473, 0.806],
    desert: [0.16, 0.36, 0.56],
  };
  const pickupFractions = Array.from(
    { length: basePickupRows },
    (_, row) => START_FRACTION + (90 + (row * TRACK_LENGTH) / basePickupRows) / TRACK_LENGTH,
  )
    .concat(extraPickupFractions[id] || [0.16, 0.4, 0.7])
    .sort((a, b) => a - b);
  PICKUP_ROW_COUNT = pickupFractions.length;
  PICKUP_LOCATIONS = pickupFractions.flatMap((initialFraction, row) => {
    let fraction = initialFraction,
      p = trackAt(fraction);
    if (OBSTACLES.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 14)) {
      fraction += 20 / TRACK_LENGTH;
      p = trackAt(fraction);
    }
    const count = p.halfWidth >= 8 ? 4 : 3,
      edge = p.halfWidth - CAR_WIDTH / 2 - 0.8;
    return Array.from({ length: count }, (_, lane) => {
      let offset = -edge + (2 * edge * lane) / (count - 1);
      if (iceSplit(p.x) > 0 && Math.abs(offset) < iceSplit(p.x) + 1.8)
        offset = Math.sign(offset || 1) * (iceSplit(p.x) + 1.8);
      return { ...p, x: p.x + p.nx * offset, z: p.z + p.nz * offset, row, lane, fraction };
    });
  });
  BOOST_PADS = boostLayout({
    id,
    trackAt,
    nearestTrack,
    length: TRACK_LENGTH,
    carWidth: CAR_WIDTH,
    obstacles: [...OBSTACLES, ...MOLES],
    segments: SEGMENTS,
  });
  if (id === 'cafe') {
    PICKUP_LOCATIONS = ARENA_PICKUPS;
    PICKUP_ROW_COUNT = 15;
    BOOST_PADS = [];
    OBSTACLES = [];
    MOLES = [];
    CRABS = [];
  }
  trackCache.set(id, {
    TRACK,
    SEGMENTS,
    TRACK_LENGTH,
    PLAZAS,
    OBSTACLES,
    MOLES,
    CRABS,
    PICKUP_ROW_COUNT,
    PICKUP_LOCATIONS,
    BOOST_PADS,
    segmentTree,
  });
  return activeTrack;
}
export function trackAt(fraction) {
  const d = (((fraction % 1) + 1) % 1) * TRACK_LENGTH;
  const s = segmentAtDistance(d);
  const t = (d - s.start) / s.len;
  return {
    insideSide: s.insideSide,
    turn: s.turn,
    y: s.y + s.dy * t,
    grade: s.dy / s.len,
    x: s.x + s.dx * t,
    z: s.z + s.dz * t,
    angle: Math.atan2(s.dz, s.dx),
    nx: s.nx,
    nz: s.nz,
    halfWidth: s.halfWidth + (s.nextHalfWidth - s.halfWidth) * t,
  };
}
export function nearestTrack(x, z, hint = null) {
  let bestScore = Infinity,
    bestIndex = Infinity;
  let best = { distance: Infinity };
  const bound = (node) => {
    const dx = Math.max(node.minX - x, 0, x - node.maxX),
      dz = Math.max(node.minZ - z, 0, z - node.maxZ);
    return dx * dx + dz * dz;
  };
  const visit = (node) => {
    if (bound(node) > bestScore * bestScore + 1e-9) return;
    if (node.left) {
      const first = bound(node.left) <= bound(node.right) ? node.left : node.right;
      visit(first);
      visit(first === node.left ? node.right : node.left);
      return;
    }
    for (let index = node.start; index < node.end; index++) {
      const s = SEGMENTS[index];
      const t = clamp(((x - s.x) * s.dx + (z - s.z) * s.dz) / (s.len * s.len), 0, 1);
      const px = s.x + s.dx * t,
        pz = s.z + s.dz * t,
        d = Math.hypot(x - px, z - pz);
      const fraction = (s.start + s.len * t) / TRACK_LENGTH;
      const routePenalty =
        activeTrack.id === 'desert' && hint !== null
          ? Math.max(0, arcDistance(fraction, hint) - 50) * 2
          : 0;
      if (d + routePenalty < bestScore || (d + routePenalty === bestScore && index < bestIndex)) {
        bestIndex = index;
        const rampLift = activeTrack.id === 'desert' ? desertRampLift(fraction, TRACK_LENGTH) : 0,
          rampGrade = activeTrack.id === 'desert' ? desertRampGrade(fraction, TRACK_LENGTH) : 0;
        bestScore = d + routePenalty;
        best = {
          insideSide: s.insideSide,
          turn: s.turn,
          y: s.y + s.dy * t + rampLift,
          grade: s.dy / s.len + rampGrade,
          x: px,
          z: pz,
          distance: d,
          fraction: (s.start + s.len * t) / TRACK_LENGTH,
          nx: s.nx,
          nz: s.nz,
          halfWidth: s.halfWidth + (s.nextHalfWidth - s.halfWidth) * t,
        };
      }
    }
  };
  visit(segmentTree);
  return best;
}
export const roadHalfWidth = (fraction) => trackAt(fraction).halfWidth;
export const surfaceHalfWidth = (fraction) => roadHalfWidth(fraction) + 0.6;
export function constrainObstacles(car) {
  if (car.falling) return;
  const c = Math.cos(car.angle),
    s = Math.sin(car.angle);
  for (const o of OBSTACLES) {
    if (car.y > (o.y || 0) + o.height || car.y + 1.4 < (o.y || 0)) continue;
    if (Math.hypot(car.x - o.x, car.z - o.z) > o.radius + CAR_LENGTH) continue;
    const ox = (o.x - car.x) * c + (o.z - car.z) * s,
      oz = -(o.x - car.x) * s + (o.z - car.z) * c;
    const qx = clamp(ox, -CAR_LENGTH / 2, CAR_LENGTH / 2),
      qz = clamp(oz, -CAR_WIDTH / 2, CAR_WIDTH / 2);
    let dx = qx - ox,
      dz = qz - oz,
      d = Math.hypot(dx, dz),
      depth = o.radius - d;
    if (depth <= 0) continue;
    if (d < 1e-6) {
      const ex = CAR_LENGTH / 2 - Math.abs(ox),
        ez = CAR_WIDTH / 2 - Math.abs(oz);
      if (ex < ez) {
        dx = ox > 0 ? -1 : 1;
        dz = 0;
        depth = o.radius + ex;
      } else {
        dx = 0;
        dz = oz > 0 ? -1 : 1;
        depth = o.radius + ez;
      }
      d = 1;
    }
    const nx = (dx * c - dz * s) / d,
      nz = (dx * s + dz * c) / d;
    car.x += nx * (depth + 0.002);
    car.z += nz * (depth + 0.002);
    const impact = -(car.vx * nx + car.vz * nz);
    if (impact > 0) {
      const speedBefore = Math.hypot(car.vx, car.vz);
      car.vx += nx * impact * 1.15;
      car.vz += nz * impact * 1.15;
      softenPadBoostImpact(car, speedBefore, Math.hypot(car.vx, car.vz));
      car.impactTime = 0.4;
      if (car.wallCooldown <= 0 && impact > 4) {
        damageCar(car, wallDamage(speedBefore, Math.hypot(car.vx, car.vz)));
        car.wallCooldown = 0.2;
      }
    }
  }
}
// Timed hazards share the explicit simulation clock with instanced visuals.
// Retracted holes are completely driveable; airborne cars clear raised heads.
export function collideDesertMoles(car, raceSeconds = car.raceTime || 0, { damage = true } = {}) {
  const impacts = [];
  if (activeTrack.id !== 'desert' || car.falling || (car.eliminated && !car.wrecked))
    return impacts;
  const c = Math.cos(car.angle),
    s = Math.sin(car.angle);
  for (const mole of MOLES) {
    if (Math.hypot(car.x - mole.x, car.z - mole.z) > mole.radius + CAR_LENGTH) continue;
    const state = moleState(mole, raceSeconds);
    if (!state.active || car.y > mole.y + mole.height * state.rise + 0.1 || car.y + 1.4 < mole.y)
      continue;
    const ox = (mole.x - car.x) * c + (mole.z - car.z) * s,
      oz = -(mole.x - car.x) * s + (mole.z - car.z) * c;
    const qx = clamp(ox, -CAR_LENGTH / 2, CAR_LENGTH / 2),
      qz = clamp(oz, -CAR_WIDTH / 2, CAR_WIDTH / 2);
    let dx = qx - ox,
      dz = qz - oz,
      d = Math.hypot(dx, dz),
      depth = mole.radius - d;
    if (depth <= 0) continue;
    if (d < 1e-6) {
      const ex = CAR_LENGTH / 2 - Math.abs(ox),
        ez = CAR_WIDTH / 2 - Math.abs(oz);
      if (ex < ez) {
        dx = ox > 0 ? -1 : 1;
        dz = 0;
        depth = mole.radius + ex;
      } else {
        dx = 0;
        dz = oz > 0 ? -1 : 1;
        depth = mole.radius + ez;
      }
      d = 1;
    }
    const nx = (dx * c - dz * s) / d,
      nz = (dx * s + dz * c) / d;
    car.x += nx * (depth + 0.002);
    car.z += nz * (depth + 0.002);
    const impact = -(car.vx * nx + car.vz * nz);
    if (impact <= 0) continue;
    const speedBefore = Math.hypot(car.vx, car.vz);
    car.vx += nx * impact * 1.15;
    car.vz += nz * impact * 1.15;
    softenPadBoostImpact(car, speedBefore, Math.hypot(car.vx, car.vz));
    car.impactTime = Math.max(car.impactTime || 0, 0.5);
    const amount = Math.min(18, 3 + impact * 0.25),
      canDamage = (car.moleCooldown || 0) <= 0 && impact > 4;
    if (canDamage) {
      if (damage) damageCar(car, amount);
      car.moleCooldown = 0.65;
    }
    impacts.push({ id: mole.id, speed: impact, damage: canDamage && damage ? amount : 0 });
  }
  return impacts;
}
export function collideCoastalCrabs(car, seconds = car.raceTime || 0) {
  collideCrabs(car, CRABS, seconds, { length: CAR_LENGTH, width: CAR_WIDTH });
}
export const gridSlotDistance = (slot) => 6 + Math.floor(slot / 2) * 5.5;
export function spawnCar(slot = 0, startFraction = START_FRACTION) {
  const fraction = startFraction - gridSlotDistance(slot) / TRACK_LENGTH;
  const p = activeTrack.id === 'cafe' ? ARENA_SPAWNS[(slot * 7) % 15] : trackAt(fraction),
    side = activeTrack.id === 'cafe' ? 0 : (slot % 2 === 0 ? -1 : 1) * (2.3 + iceSplit(p.x) * 1.05);
  return {
    raceTime: 0,
    contact: null,
    contactTime: 0,
    moleCooldown: 0,
    steering: 0,
    padBoostRemaining: 0,
    padBoostFrom: 0,
    padBoostPower: 1,
    gridSlot: slot,
    tased: 0,
    tasePhase: 0,
    nudgeTime: 0,
    nudgeCooldown: 0,
    nudgeHeld: 0,
    nudgeHits: [],
    x: p.x + p.nx * side,
    z: p.z + p.nz * side,
    angle: p.angle,
    vx: 0,
    vz: 0,
    progress: fraction - START_FRACTION,
    trackFraction: fraction,
    lap: 1,
    item: null,
    boost: 0,
    spinout: 0,
    launchResult: null,
    stun: 0,
    finished: false,
    finishTime: null,
    eliminated: false,
    eliminatedAt: null,
    health: 100,
    shield: 0,
    ammo: 0,
    fireCooldown: 0,
    firing: null,
    groundY: p.y,
    y: p.y,
    vy: 0,
    roll: 0,
    pitch: Math.atan(p.grade || 0),
    rollVelocity: 0,
    pitchVelocity: 0,
    yawVelocity: 0,
    impactTime: 0,
    wallCooldown: 0,
    contactCooldown: 0,
    wrecked: false,
    overturned: false,
    falling: false,
  };
}
export function sanitizeInput(raw) {
  return {
    steer: Number.isFinite(raw?.steer) ? clamp(raw.steer, -1, 1) : 0,
    throttle: Number.isFinite(raw?.throttle) ? clamp(raw.throttle, 0, 1) : 0,
    reverse: raw?.reverse === true,
    brake: raw?.brake === true,
    fire: raw?.fire === true,
    nudge: raw?.nudge === -1 ? -1 : raw?.nudge === 1 ? 1 : 0,
  };
}
export function damageLevel(health) {
  return health > DAMAGE_HEALTH ? 0 : clamp(1 + Math.floor((DAMAGE_HEALTH - health) / 15), 1, 4);
}
export const healthHandlingFactor = (health) => 1 - 0.6 * damageSeverity(health);
export function advanceNudge(car, dt) {
  if (
    car.eliminated ||
    car.finished ||
    car.overturned ||
    car.falling ||
    car.y - (car.groundY || 0) > 0.05
  ) {
    car.nudgeTime = 0;
    return;
  }
  if (car.nudgeTime > 0) {
    const step = Math.min(dt, car.nudgeTime),
      distance = (CAR_WIDTH * step) / NUDGE_DURATION;
    car.x -= Math.sin(car.nudgeAngle) * car.nudgeDirection * distance;
    car.z += Math.cos(car.nudgeAngle) * car.nudgeDirection * distance;
    car.nudgeTime = Math.max(0, car.nudgeTime - step);
    car.nudgeMoved = true;
  }
}
// Only active nudges check contacts; each target can be hit once per press.
export function resolveNudges(cars, { damage = true, onElimination } = {}) {
  for (const a of cars) {
    if (!a.nudgeMoved || a.eliminated || a.y - (a.groundY || 0) > 0.05) continue;
    const nx = -Math.sin(a.nudgeAngle) * a.nudgeDirection,
      nz = Math.cos(a.nudgeAngle) * a.nudgeDirection;
    for (const b of cars) {
      if (
        a === b ||
        Math.abs(a.y - b.y) > 1.3 ||
        b.eliminated ||
        b.finished ||
        b.falling ||
        b.y - (b.groundY || 0) > 0.05 ||
        b.shield > 0 ||
        a.nudgeHits.includes(b.gridSlot)
      )
        continue;
      const contact = carContact(a, b);
      if ((b.x - a.x) * nx + (b.z - a.z) * nz <= 0 || !contact) continue;
      a.nudgeHits = [...a.nudgeHits, b.gridSlot];
      if (damage && damageCar(b, 5) && b.wrecked) onElimination?.(b, a);
      if (!b.eliminated) {
        // The powered sidestep contributes contact velocity. Apply a rigid-body
        // impulse at the contact patch: quarter hits turn a car, door hits slide it.
        const inertia = (CAR_LENGTH ** 2 + CAR_WIDTH ** 2) / 12;
        const ax = contact.x - a.x,
          az = contact.z - a.z,
          bx = contact.x - b.x,
          bz = contact.z - b.z;
        const ta = ax * nz - az * nx,
          tb = bx * nz - bz * nx;
        const va =
          (a.vx - a.yawVelocity * az) * nx +
          (a.vz + a.yawVelocity * ax) * nz +
          CAR_WIDTH / NUDGE_DURATION;
        const vb = (b.vx - b.yawVelocity * bz) * nx + (b.vz + b.yawVelocity * bx) * nz;
        const impulse = clamp(((va - vb) * 1.12) / (2 + (ta * ta + tb * tb) / inertia), 0, 13);
        // Powered shove stability absorbs half the initiating car's recoil.
        a.vx -= nx * impulse * 0.5;
        a.vz -= nz * impulse * 0.5;
        b.vx += nx * impulse;
        b.vz += nz * impulse;
        shoveRollover(a, -nx * impulse * 0.5, -nz * impulse * 0.5);
        shoveRollover(b, nx * impulse, nz * impulse);
        a.yawVelocity +=
          (clamp(a.yawVelocity - (ta * impulse) / inertia, -3, 3) - a.yawVelocity) * 0.5;
        b.yawVelocity = clamp(b.yawVelocity + (tb * impulse) / inertia, -3, 3);
        a.impactTime = Math.max(a.impactTime, 0.11);
        b.impactTime = Math.max(b.impactTime, 0.65);
        a.contactCooldown = b.contactCooldown = 0.2;
      }
    }
  }
}
// Contact coordinates stay in the body's local frame, so visual correction
// cannot detach sparks from the chassis. This state is shared with prediction.
export function recordContact(car, x, y, z, nx, nz, speed, kind = 'wall') {
  if (speed < 2) return;
  if (car.contactTime > 0.1 && (car.contact?.speed || 0) > speed) return;
  const dx = x - car.x,
    dz = z - car.z,
    c = Math.cos(car.angle),
    s = Math.sin(car.angle);
  car.contact = {
    x: clamp(dx * c + dz * s, -CAR_LENGTH / 2, CAR_LENGTH / 2),
    y: clamp(y - car.y, 0.1, 1.3),
    z: clamp(-dx * s + dz * c, -CAR_WIDTH / 2, CAR_WIDTH / 2),
    nx,
    nz,
    speed: Math.min(80, speed),
    kind,
  };
  car.contactTime = 0.14;
}
// Resistance depends on damage already sustained; torque comes from the hit lever arm.
export const weaponImpactScale = (health) => 0.06 + 2.8 * (1 - clamp(health, 0, 100) / 100) ** 1.7;
export function weaponImpact(car, kick, healthBefore = car.health) {
  if (car.shield > 0) return;
  const scale = kick.fixedImpulse ? 1 : weaponImpactScale(healthBefore),
    jx = (kick.x || 0) * scale,
    jz = (kick.z || 0) * scale,
    lift = (kick.mine ? 5.2 : kick.up || 0) * scale,
    up = lift < 0.5 ? 0 : lift;
  car.vx += jx;
  car.vz += jz;
  if (up > 0) {
    car.vy = Math.min(24, car.vy + up);
    if (up > 0.5) car.y = Math.max(car.y, (car.groundY || 0) + 0.02);
    car.mineFlight = true;
    car.edgeBalance = false;
  }
  const point = kick.point || { x: car.x, y: car.y + 0.5, z: car.z },
    dx = point.x - car.x,
    dz = point.z - car.z,
    c = Math.cos(car.angle),
    s = Math.sin(car.angle);
  const fore = clamp(dx * c + dz * s, -CAR_LENGTH / 2, CAR_LENGTH / 2),
    side = clamp(-dx * s + dz * c, -CAR_WIDTH / 2, CAR_WIDTH / 2),
    height = clamp((point.y ?? car.y + 0.5) - car.y - 0.6, -0.6, 0.9),
    forwardKick = jx * c + jz * s,
    sideKick = -jx * s + jz * c;
  car.rollVelocity = clamp(car.rollVelocity + (height * sideKick - side * up) * 0.45, -9, 9);
  car.pitchVelocity = clamp(car.pitchVelocity + (fore * up - height * forwardKick) * 0.16, -9, 9);
  car.yawVelocity = clamp(car.yawVelocity + (fore * sideKick - side * forwardKick) * 0.18, -7, 7);
  if (up > 1 || Math.hypot(jx, jz) > 1) car.impactTime = Math.max(car.impactTime, 0.8);
}
export function damageCar(car, amount) {
  if (car.wrecked || car.eliminated || car.finished || car.shield > 0) return false;
  car.health = Math.max(0, car.health - Math.max(0, amount));
  if (car.health <= 0) {
    car.wrecked = true;
    car.eliminated = true;
    car.item = null;
    car.ammo = 0;
    car.firing = null;
    car.shield = 0;
    if (!car.falling) {
      car.vy = Math.max(car.vy, 10);
      car.y = Math.max(car.y, (car.groundY || 0) + 0.1);
    }
    car.rollVelocity += 5;
    car.pitchVelocity += 6;
    car.vx += Math.cos(car.angle) * 12;
    car.vz += Math.sin(car.angle) * 12;
    car.impactTime = 2;
  }
  return true;
}
export function launchCar(car, up, side = 0, fore = 0) {
  if (car.shield > 0 || car.wrecked || car.eliminated) return;
  car.y = Math.max(car.y, (car.groundY || 0) + 0.08);
  car.vy = Math.max(car.vy, up);
  car.rollVelocity = clamp(car.rollVelocity + side * up * 0.65, -10, 10);
  car.pitchVelocity = clamp(car.pitchVelocity + fore * up * 0.45, -10, 10);
  car.yawVelocity += side * 0.8;
  car.impactTime = 1.5;
}
// Mines add momentum instead of resetting the launch speed. A single hit is a
// short hop; a cluster builds height and angular momentum before the car lands.
export function mineImpulse(car, side = 0, fore = 0) {
  if (car.shield > 0 || car.wrecked || car.eliminated) return;
  car.y = Math.max(car.y, (car.groundY || 0) + 0.08);
  car.vy = Math.min(car.vy + 5.2, 17);
  car.rollVelocity = clamp(car.rollVelocity + clamp(side, -2, 2) * 0.55, -5, 5);
  car.pitchVelocity = clamp(car.pitchVelocity + 0.65 + clamp(fore, -2, 2) * 0.25, -5, 5);
  car.yawVelocity += clamp(side, -2, 2) * 0.12;
  car.mineFlight = true;
  car.edgeBalance = false;
  car.impactTime = 0.8;
}
function verticalStep(car, dt) {
  if (car.edgeBalance && !car.falling && car.vy <= 0) return;
  const floor = car.groundY || 0;
  if (car.y > floor + 0.001 || car.vy > 0 || car.falling) {
    car.vy -= 22 * dt;
    car.y += car.vy * dt;
    car.roll += car.rollVelocity * dt;
    car.pitch += car.pitchVelocity * dt;
    car.rollVelocity *= Math.exp(-0.22 * dt);
    car.pitchVelocity *= Math.exp(-0.22 * dt);
    if (car.falling) return;
    if (car.y <= floor) {
      car.y = floor;
      car.vy = 0;
      const upsideDown = Math.cos(car.roll) * Math.cos(car.pitch) < -0.15;
      car.overturned = upsideDown;
      car.roll = upsideDown ? Math.PI : 0;
      car.pitch = 0;
      car.rollVelocity = 0;
      car.pitchVelocity = 0;
      const landingDrag =
        car.rampFlight && !upsideDown
          ? 0.98
          : car.mineFlight && !car.wrecked && !upsideDown
            ? 0.88
            : car.wrecked
              ? 0.5
              : 0.18;
      car.vx *= landingDrag;
      car.vz *= landingDrag;
      car.rampFlight = false;
      car.mineFlight = false;
      car.impactTime = 0.8;
    }
  }
}
export function wallDamage(speedBefore, speedAfter) {
  return Math.max(0, speedBefore - speedAfter - 1.5) * 0.3;
}
let tipState = {},
  tipTime = 0;
export function updateFactoryMechanics(cars, seconds) {
  if (activeTrack.id !== 'factory') return;
  for (const tip of FACTORY_TIPS) {
    let at = Math.max(
      -Infinity,
      ...cars.map((c) => (Number.isFinite(c[tip.stateKey]) ? c[tip.stateKey] : -Infinity)),
    );
    const p = trackAt(tip.fraction + tip.buttonOffset / TRACK_LENGTH);
    if (
      seconds - at >= tip.dropSeconds + tip.holdSeconds + tip.riseSeconds + tip.rearmSeconds &&
      cars.some(
        (c) =>
          !c.eliminated &&
          !c.falling &&
          Math.abs(c.y - p.y) < 1 &&
          Math.hypot(
            c.x - (p.x + p.nx * p.halfWidth * 0.6),
            c.z - (p.z + p.nz * p.halfWidth * 0.6),
          ) < 2.4,
      )
    )
      at = seconds;
    for (const c of cars) c[tip.stateKey] = Number.isFinite(at) ? at : null;
  }
}
function tipSurface(t, x, z) {
  const tip = activeTrack.id === 'factory' && factoryTipAt(t.fraction, TRACK_LENGTH);
  if (!tip) return t;
  const lateral = (x - t.x) * t.nx + (z - t.z) * t.nz;
  if (lateral >= 0) return t;
  const angle = factoryTipAngle(tipTime, tipState[tip.stateKey]);
  if (lateral < -(t.halfWidth + 0.6) * Math.cos(angle)) return null;
  const slope = Math.tan(angle),
    ny = Math.cos(angle);
  return {
    ...t,
    y: t.y + lateral * slope,
    surface: { nx: -t.nx * Math.sin(angle), ny, nz: -t.nz * Math.sin(angle) },
  };
}
export function roadSurfaceAt(x, z, hint) {
  if (activeTrack.id === 'cafe') return { ...arenaSurface(x, z), x, z, halfWidth: 80, fraction: 0 };
  const t = nearestTrack(x, z, hint),
    gap = iceSplit(t.x),
    lateral = Math.abs((x - t.x) * t.nx + (z - t.z) * t.nz);
  return t.distance <= t.halfWidth + 0.6 && (gap < 0.01 || lateral >= gap)
    ? tipSurface(t, x, z)
    : null;
}
// Tyres follow visible land. Height limits distinguish a reachable surface from
// an overhead deck; slope traction, gravity and impacts govern volcano terrain.
export function drivingSurfaceAt(x, z, hint, ceiling = Infinity) {
  if (activeTrack.id === 'cafe') {
    const surface = arenaSurface(x, z, ceiling);
    return { ...surface, surface, x, z, fraction: 0, halfWidth: 80 };
  }
  const road = roadSurfaceAt(x, z, hint);
  if (road && road.y <= ceiling) return road;
  if (activeTrack.id === 'volcano') {
    const surface = getLandscape().surface.sample(x, z, ceiling);
    if (!surface || surface.ny < 0.12 || surface.y < -3) return null;
    return { ...nearestTrack(x, z, hint), y: surface.y, surface };
  }
  if (activeTrack.id !== 'coast') return null;
  const t = nearestTrack(x, z, hint);
  if (t.distance > t.halfWidth + 12) return null;
  const surface = terrainAt(x, z, t.y + 0.5);
  return surface && surface.y > SEA_LEVEL + 0.15 && surface.ny > 0.7
    ? { ...t, y: surface.y, surface }
    : null;
}
// A surviving shoulder must have an unbroken climbable route back to the deck.
// Testing only the current normal would incorrectly bless flat ground below a cliff.
export const VOLCANO_RECOVERY_ANGLE = (35 * Math.PI) / 180;
export function volcanoRecoverableAt(car, road = nearestTrack(car.x, car.z, car.trackFraction)) {
  if (activeTrack.id !== 'volcano') return false;
  if (road.distance <= road.halfWidth + 0.6 && car.y >= road.y - 1.2) return true;
  const terrain = getLandscape().surface,
    minNormal = Math.cos(VOLCANO_RECOVERY_ANGLE),
    surface = terrain.sample(car.x, car.z, car.y + 1.2);
  if (!surface || surface.ny < minNormal || surface.y < -3) return false;
  const lateral = (car.x - road.x) * road.nx + (car.z - road.z) * road.nz,
    side = Math.sign(lateral) || 1,
    edge = road.halfWidth + 0.75,
    distance = Math.abs(lateral);
  const steps = Math.max(1, Math.ceil((distance - edge) / 3));
  for (let i = 0; i <= steps; i++) {
    const offset = edge + (Math.max(0, distance - edge) * i) / steps,
      hit = terrain.sample(road.x + road.nx * offset * side, road.z + road.nz * offset * side);
    if (!hit || hit.ny < minNormal) return false;
  }
  return true;
}
function tyreSupportFloor(car, surface) {
  let floor = surface.y;
  for (const [x, z] of WHEEL_POINTS) {
    const p = bodyOffset(car, x, 0, z),
      s = drivingSurfaceAt(
        car.x + p.x,
        car.z + p.z,
        car.trackFraction,
        activeTrack.id === 'volcano' ? car.y + p.y + 0.6 : Infinity,
      );
    if (s) floor = Math.max(floor, s.y - p.y);
  }
  return floor;
}
function supportRoad(car, t) {
  if (car.falling) return;
  const tipped = activeTrack.id === 'factory' && factoryTipAt(t.fraction, TRACK_LENGTH, CAR_LENGTH);
  // A ramp or weapon launch releases the tyre pivot. Losing contact while
  // rising is flight, not an irreversible fall off the road.
  if (car.vy > 0 || (car.y > car.groundY + 0.5 && !car.edgeBalance)) {
    car.edgeBalance = false;
    return;
  }
  // Interior driving retains the existing cheap path. Only edge contacts sample
  // individual tyres against the shared road and coastal terrain surfaces.
  const lateral = Math.abs((car.x - t.x) * t.nx + (car.z - t.z) * t.nz),
    gap = iceSplit(t.x),
    extent = CAR_LENGTH / 2;
  if (
    !tipped &&
    (!['factory', 'volcano'].includes(activeTrack.id) || car.y >= t.y - 0.6) &&
    t.distance + extent < t.halfWidth + 0.6 &&
    (gap < 0.01 || lateral - extent > gap)
  ) {
    car.supportedWheels = 4;
    car.edgeBalance = false;
    return;
  }
  let supportedFootprints = 0;
  const support = wheelSupports(car, (x, z, ceiling) => {
    const surface = drivingSurfaceAt(
      x,
      z,
      car.trackFraction,
      ['factory', 'volcano'].includes(activeTrack.id) ? ceiling : Infinity,
    );
    if (surface) supportedFootprints++;
    return surface;
  });
  // A ramp lip can put front and rear tyres at different surface heights.
  // Only a missing driving surface is an edge; a height mismatch alone is not.
  if (supportedFootprints === 4) {
    car.supportedWheels = 4;
    car.edgeBalance = false;
    return;
  }
  car.supportedWheels = support.length;
  car.edgeBalance = support.length > 0 && support.length < 4;
  if (!support.length || (car.edgeBalance && car.y < car.groundY - 0.4)) {
    car.falling = true;
    car.edgeBalance = false;
    car.offRoadTime = 0;
    car.vy = Math.min(car.vy, car.edgeVy || 0);
    // Releasing the contact pivot carries its angular COM velocity into the fall.
    car.vx +=
      (-Math.sin(car.angle) * car.rollVelocity - Math.cos(car.angle) * car.pitchVelocity) * 0.5;
    car.vz +=
      (Math.cos(car.angle) * car.rollVelocity - Math.sin(car.angle) * car.pitchVelocity) * 0.5;
  }
}
export function constrainRoad(car) {
  if (activeTrack.id === 'cafe') return constrainArena(car);
  if (activeTrack.id === 'factory') {
    tipTime = car.circuitTime ?? car.raceTime ?? 0;
    tipState = car;
  }
  const t = nearestTrack(car.x, car.z, car.trackFraction);
  const support = ['coast', 'factory', 'volcano'].includes(activeTrack.id)
    ? drivingSurfaceAt(
        car.x,
        car.z,
        car.trackFraction,
        ['factory', 'volcano'].includes(activeTrack.id) ? car.y + 0.6 : Infinity,
      )
    : null;
  if (support?.surface) t.surface = support.surface;
  const floor = support?.surface
    ? activeTrack.id === 'factory'
      ? support.y
      : tyreSupportFloor(car, support)
    : (activeTrack.id === 'coast' && t.distance > t.halfWidth + 0.6) ||
        (['factory', 'volcano'].includes(activeTrack.id) && !support)
      ? car.groundY || 0
      : t.y;
  // Upright landings recover on reachable sand, mountainside or volcano road.
  if (
    car.falling &&
    (support?.surface || (activeTrack.id === 'volcano' && support)) &&
    !car.wrecked &&
    car.vy <= 0 &&
    car.y <= floor + 0.15 &&
    car.y > floor - 1.5 &&
    Math.cos(car.roll) * Math.cos(car.pitch) > 0.35
  ) {
    car.falling = false;
    car.edgeBalance = false;
    car.offRoadTime = 0;
    car.vy = 0;
    car.y = floor;
    car.rollVelocity = 0;
    car.pitchVelocity = 0;
    car.mineFlight = false;
    car.rampFlight = false;
  }
  if (car.falling) return t;
  const oldFloor = car.groundY || 0;
  // A lower panel cannot lift a car through the adjoining fixed deck. Both
  // longitudinal ends release it into flight, just like the outside edge.
  if (['factory', 'volcano'].includes(activeTrack.id) && !support && car.y < t.y - 0.6) {
    car.falling = true;
    car.edgeBalance = false;
    car.offRoadTime = 0;
    car.vy = Math.min(0, car.vy);
    return t;
  }
  // Leaving a sheer cliff is ballistic; gentle terrain follows the tyres.
  if (
    activeTrack.id === 'volcano' &&
    support?.surface &&
    !car.edgeBalance &&
    car.y <= oldFloor + 0.01 &&
    floor < oldFloor - 0.8
  ) {
    car.falling = true;
    car.edgeBalance = false;
    car.offRoadTime = 0;
    return t;
  }
  car.groundY = floor;
  if (!car.edgeBalance && car.y <= oldFloor + 0.001 && car.vy <= 0) car.y = floor;
  // Barriers still stop grounded cars; exposed edges use individual tyre support.
  if (activeTrack.id === 'ice') {
    const lateral = (car.x - t.x) * t.nx + (car.z - t.z) * t.nz,
      side = lateral < 0 ? -1 : 1,
      gap = iceSplit(t.x);
    const extent =
      (Math.abs(Math.cos(car.angle) * t.nx + Math.sin(car.angle) * t.nz) * CAR_LENGTH) / 2 +
      (Math.abs(-Math.sin(car.angle) * t.nx + Math.cos(car.angle) * t.nz) * CAR_WIDTH) / 2;
    let corrected = Math.abs(lateral),
      normal = 0;
    if (corrected > t.halfWidth + 0.6 || (gap > 0.6 && corrected < gap - 0.6)) {
      supportRoad(car, t);
      return t;
    }
    if (car.y - t.y < 1.4) {
      if (hasBarrier(t.fraction, side) && corrected > t.halfWidth - extent) {
        corrected = t.halfWidth - extent;
        normal = -side;
      }
      if (gap > 0.3 && hasBarrier(t.fraction, side, true) && corrected < gap + extent) {
        corrected = gap + extent;
        normal = side;
      }
      if (normal) {
        recordContact(
          car,
          car.x - t.nx * normal * extent,
          car.y + 0.6,
          car.z - t.nz * normal * extent,
          -t.nx * normal,
          -t.nz * normal,
          Math.hypot(car.vx, car.vz),
        );
        car.x += t.nx * (side * corrected - lateral);
        car.z += t.nz * (side * corrected - lateral);
        const impact = -(car.vx * t.nx + car.vz * t.nz) * normal;
        if (impact > 0) {
          const speed = Math.hypot(car.vx, car.vz);
          car.vx += t.nx * normal * impact * 1.12;
          car.vz += t.nz * normal * impact * 1.12;
          softenPadBoostImpact(car, speed, Math.hypot(car.vx, car.vz));
          car.impactTime = 0.3;
          if (car.wallCooldown <= 0 && impact > 4) {
            damageCar(car, wallDamage(speed, Math.hypot(car.vx, car.vz)));
            car.wallCooldown = 0.2;
          }
        }
      }
    }
    supportRoad(car, t);
    return t;
  }
  if (t.distance > t.halfWidth + 0.6) {
    supportRoad(car, t);
    return t;
  }
  const extent =
    (Math.abs(Math.cos(car.angle) * t.nx + Math.sin(car.angle) * t.nz) * CAR_LENGTH) / 2 +
    (Math.abs(-Math.sin(car.angle) * t.nx + Math.cos(car.angle) * t.nz) * CAR_WIDTH) / 2;
  const limit = t.halfWidth - extent,
    side = (car.x - t.x) * t.nx + (car.z - t.z) * t.nz < 0 ? -1 : 1;
  if (car.y - t.y < 1.4 && hasBarrier(t.fraction, side) && t.distance > limit) {
    const nx = (car.x - t.x) / (t.distance || 1),
      nz = (car.z - t.z) / (t.distance || 1);
    recordContact(
      car,
      t.x + nx * t.halfWidth,
      car.y + 0.6,
      t.z + nz * t.halfWidth,
      nx,
      nz,
      Math.hypot(car.vx, car.vz),
    );
    car.x = t.x + nx * limit;
    car.z = t.z + nz * limit;
    const impact = car.vx * nx + car.vz * nz;
    if (impact > 0) {
      const speedBefore = Math.hypot(car.vx, car.vz);
      car.vx -= nx * impact * 1.12;
      car.vz -= nz * impact * 1.12;
      softenPadBoostImpact(car, speedBefore, Math.hypot(car.vx, car.vz));
      car.impactTime = Math.max(car.impactTime, 0.3);
      if (car.wallCooldown <= 0 && impact > 4) {
        damageCar(car, wallDamage(speedBefore, Math.hypot(car.vx, car.vz)));
        car.wallCooldown = 0.2;
      }
    }
  }
  if (activeTrack.id === 'factory')
    collideFactoryRotors(car, trackAt, car.circuitTime ?? car.raceTime ?? 0);
  constrainObstacles(car);
  supportRoad(car, t);
  return t;
}
export function stepCar(car, input, dt = STEP) {
  if (car.eliminated && !car.wrecked) {
    car.vx = 0;
    car.vz = 0;
    return;
  }
  for (const key of [
    'moleCooldown',
    'tased',
    'boost',
    'stun',
    'shield',
    'impactTime',
    'wallCooldown',
    'contactCooldown',
    'nudgeCooldown',
    'contactTime',
  ])
    car[key] = Math.max(0, (car[key] || 0) - dt);
  car.tasePhase = (car.tasePhase || 0) + dt;
  if (activeTrack.id === 'factory') {
    car.circuitTime = (car.raceTime || 0) + dt;
    tipTime = car.circuitTime;
    tipState = car;
  }
  const padSpeed = boostSpeed(car, dt, TOP_SPEED);
  const circuitRoad = EXTRA_CIRCUITS.includes(activeTrack.id)
    ? nearestTrack(car.x, car.z, car.trackFraction)
    : null;
  const circuitEffect = circuitRoad
    ? circuitSurface(
        activeTrack.id,
        circuitRoad.fraction,
        (car.x - circuitRoad.x) * circuitRoad.nx + (car.z - circuitRoad.z) * circuitRoad.nz,
        circuitRoad.halfWidth,
        TRACK_LENGTH,
        (car.raceTime || 0) + dt,
        circuitRoad.insideSide,
      )
    : null;
  const lavaGrip =
    activeTrack.id === 'volcano' &&
    !car.falling &&
    !car.overturned &&
    Math.abs(car.y - circuitRoad.y) < 0.55
      ? volcanoLavaGrip(
          circuitRoad.fraction,
          (car.x - circuitRoad.x) * circuitRoad.nx + (car.z - circuitRoad.z) * circuitRoad.nz,
          circuitRoad.halfWidth,
          TRACK_LENGTH,
        )
      : 1;
  const onHotLane =
    circuitEffect?.kind === 'heat' &&
    !car.falling &&
    !car.overturned &&
    Math.abs(car.y - circuitRoad.y) < 0.55;
  if (activeTrack.id === 'volcano') damageCar(car, advanceCircuitHeat(car, onHotLane, dt));
  const heatBoost = onHotLane ? heatSpeedMultiplier(car.circuitHeat) : 1;
  const terrainContact =
    activeTrack.id === 'volcano'
      ? drivingSurfaceAt(car.x, car.z, car.trackFraction, car.y + 0.6)
      : null;
  const hillside =
    terrainContact?.surface && Math.abs(car.y - car.groundY) < 0.55 && !car.falling
      ? terrainContact.surface
      : null;
  const terrainGrip = hillside ? clamp((hillside.ny - 0.25) / 0.65, 0.06, 1) ** 2 : 1;
  const beltSpeed = circuitEffect?.kind === 'belt' ? Math.max(0, circuitEffect.flow) * 0.65 : 0;
  verticalStep(car, dt);
  stepRollover(car, input, dt);
  if (car.falling && car.y < -20) {
    car.vx = 0;
    car.vz = 0;
    return;
  }
  car.nudgeMoved = false;
  const direction = input.nudge === -1 ? -1 : input.nudge === 1 ? 1 : 0;
  if (
    direction &&
    !car.nudgeHeld &&
    car.nudgeCooldown <= 0 &&
    !car.finished &&
    !car.eliminated &&
    !car.overturned &&
    !car.falling &&
    car.y - (car.groundY || 0) < 0.05
  ) {
    car.nudgeTime = NUDGE_DURATION;
    car.nudgeCooldown = 0.8;
    car.nudgeDirection = direction;
    car.nudgeAngle = car.angle;
    car.nudgeHits = [];
  }
  car.nudgeHeld = direction;
  const spinStep = Math.min(car.spinout || 0, dt);
  car.spinout = Math.max(0, (car.spinout || 0) - dt);
  if (spinStep) car.angle += (Math.PI * 2 * spinStep) / START_SPIN_SECONDS;
  // Steering rack inertia is simulation state, replicated with the car so
  // prediction/replay has the same gradual turn-in and release as the server.
  const icy = activeTrack.id === 'ice',
    targetSteer = car.finished ? 0 : input.steer;
  if (icy) car.steering = targetSteer;
  else {
    const current = car.steering || 0,
      releasing = Math.abs(targetSteer) < Math.abs(current) && targetSteer * current >= 0;
    car.steering =
      current + (targetSteer - current) * (1 - Math.exp(-dt / (releasing ? 0.16 : 0.11)));
  }
  const uncontrolled =
    spinStep > 0 ||
    car.wrecked ||
    car.overturned ||
    car.y - (car.groundY || 0) > 0.05 ||
    car.falling;
  if (uncontrolled) {
    const drag = car.y - (car.groundY || 0) > 0.05 || car.falling ? 0.15 : car.wrecked ? 2.4 : 3;
    car.vx *= Math.exp(-drag * dt);
    car.vz *= Math.exp(-drag * dt);
    car.angle += car.yawVelocity * dt;
    if (
      ['desert', 'volcano'].includes(activeTrack.id) &&
      car.rampFlight &&
      !car.mineFlight &&
      !spinStep &&
      !car.wrecked &&
      !car.overturned &&
      !car.falling &&
      !car.finished &&
      car.y - (car.groundY || 0) > 0.05
    ) {
      // Gentle jump correction: about 13 degrees/s of heading and 7 degrees/s
      // of travel at full steering. Rotate momentum without adding speed/lift.
      const turn = car.steering * dt,
        courseTurn = turn * 0.125,
        c = Math.cos(courseTurn),
        s = Math.sin(courseTurn),
        vx = car.vx;
      car.angle += turn * 0.225;
      car.vx = vx * c - car.vz * s;
      car.vz = vx * s + car.vz * c;
    }
  } else {
    if (car.finished) input = NEUTRAL;
    let c = Math.cos(car.angle),
      s = Math.sin(car.angle);
    let forward = car.vx * c + car.vz * s,
      lateral = -car.vx * s + car.vz * c;
    // Reverse is immediate input: while rolling forwards it applies braking
    // and loosens rear grip; through zero it becomes ordinary reverse drive.
    const braking = input.brake || (input.reverse && forward > 0);
    const speedFactor = healthSpeedFactor(car.health),
      maxSpeed = Math.max(
        (TOP_SPEED * heatBoost + beltSpeed) * speedFactor * (car.boost > 0 ? 1.1 : 1),
        padSpeed ?? 0,
      );
    const force =
      car.stun > 0
        ? 0
        : input.reverse
          ? -24 * speedFactor
          : forward >= maxSpeed && car.impactTime > 0
            ? 0
            : input.throttle * 25.2 * heatBoost * speedFactor * (car.boost > 0 ? 1.35 : 1);
    const steering = clamp(
      car.steering +
        (car.tased > 0
          ? (Math.sin(car.tasePhase * 19) + 0.5 * Math.sin(car.tasePhase * 31)) * 0.3
          : 0),
      -1,
      1,
    );
    forward += force * terrainGrip * dt;
    forward *= Math.exp(
      -(braking ? 1.7 : Math.abs(force) > 0 ? 0.64 + Math.abs(steering) * 0.23 : 1.5) * dt,
    );
    // External impacts may exceed engine top speed; they decay instead of being erased.
    if (car.impactTime <= 0) forward = clamp(forward, -14.4 * speedFactor, maxSpeed);
    // Boost supplies bounded thrust, so impacts cannot restore the old speed in one tick.
    if (padSpeed !== null && !input.reverse)
      forward += Math.min(Math.max(0, padSpeed - forward), 120 * (car.padBoostPower ?? 1) * dt);
    const handling =
      healthHandlingFactor(car.health) *
      (hillside ? Math.max(0.12, Math.sqrt(terrainGrip)) : 1) *
      (car.tased > 0 ? 0.28 : 1) *
      (car.edgeBalance ? Math.max(0.35, (car.supportedWheels || 0) / 4) : 1);
    // At speed, the rear tyres shed grip so the body turns ahead of its
    // momentum: a physical tail-out slide that settles as the rack centres.
    // Dry-road straight-line recovery and low-speed manoeuvres retain their
    // established grip; no extra impulse or visual-only rotation is added.
    const fast = clamp((Math.abs(forward) - TOP_SPEED * 0.5) / (TOP_SPEED * 0.5), 0, 1);
    const speedDrift =
      icy || braking ? 0 : fast * fast * (3 - 2 * fast) * Math.min(1, Math.abs(steering) / 0.65);
    // Ice keeps more momentum under steering load, strongest in tight, fast
    // U-turns. Straight-line grip and low-speed positioning stay familiar.
    const iceDrift =
      icy && !braking
        ? clamp((Math.abs(forward) - 6) / 18, 0, 1) * Math.min(1, Math.abs(steering) / 0.6)
        : 0;
    lateral *= Math.exp(
      -(car.impactTime > 0
        ? 0.65
        : braking
          ? 1.5 * activeTrack.grip
          : (icy ? 9.5 * (1 - 0.4 * iceDrift) : 8.2) *
            (1 - 0.72 * speedDrift) *
            handling *
            activeTrack.grip) *
        lavaGrip *
        dt,
    );
    const turn =
      steering *
      (braking ? 2.9 : 2.05) *
      (0.8 + 0.2 * handling) *
      clamp(Math.abs(forward) / 7, 0, 1) *
      Math.sign(forward);
    car.angle += (turn + car.yawVelocity) * dt;
    const nc = Math.cos(car.angle),
      ns = Math.sin(car.angle),
      grip =
        (braking ? 0.2 : icy ? 0.65 * (1 - 0.25 * iceDrift) : 0.58 * (1 - 0.58 * speedDrift)) *
        handling *
        activeTrack.grip *
        lavaGrip;
    c = c * (1 - grip) + nc * grip;
    s = s * (1 - grip) + ns * grip;
    car.vx = c * forward - s * lateral;
    car.vz = s * forward + c * lateral;
  }
  if (hillside && !car.falling && car.y <= car.groundY + 0.1) {
    car.vx += 22 * hillside.ny * hillside.nx * dt;
    car.vz += 22 * hillside.ny * hillside.nz * dt;
  }
  if (
    activeTrack.id === 'factory' &&
    circuitRoad &&
    tipSurface(circuitRoad, car.x, car.z)?.surface &&
    car.y <= car.groundY + 0.1 &&
    !car.falling
  ) {
    const slide =
      40 *
      Math.sin(
        factoryTipAngle(tipTime, car[factoryTipAt(circuitRoad.fraction, TRACK_LENGTH)?.stateKey]),
      ) *
      dt;
    car.vx -= circuitRoad.nx * slide;
    car.vz -= circuitRoad.nz * slide;
  }
  if (circuitRoad)
    applyCircuitForces(
      car,
      activeTrack.id,
      circuitRoad,
      TRACK_LENGTH,
      (car.raceTime || 0) + dt,
      dt,
    );
  if (activeTrack.id === 'desert') applyDesertWind(car, (car.raceTime || 0) + dt, dt);
  car.yawVelocity *= Math.exp(-3 * dt);
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  advanceNudge(car, dt);
  const track = constrainRoad(car);
  if (car.edgeBalance && !car.falling) {
    balanceOnWheels(
      car,
      wheelSupports(car, (x, z, ceiling) =>
        drivingSurfaceAt(
          x,
          z,
          car.trackFraction,
          ['factory', 'volcano'].includes(activeTrack.id) ? ceiling : Infinity,
        ),
      ),
      dt,
    );
    supportRoad(car, nearestTrack(car.x, car.z, car.trackFraction));
  }
  if (car.falling) {
    car.offRoadTime = (car.offRoadTime || 0) + dt;
    const groundImpact = collideTerrain(car, terrainAt, dt);
    if (
      activeTrack.id === 'factory' &&
      groundImpact.touched &&
      car.groundY <= -7.5 &&
      !car.wrecked
    ) {
      car.shield = 0;
      damageCar(car, 100);
    }
    if (activeTrack.id === 'volcano') {
      if (!car.wrecked && groundImpact.maxImpact > 11)
        damageCar(car, (groundImpact.maxImpact - 11) * 4);
      if (!car.wrecked && car.y < -2.5) {
        car.shield = 0;
        damageCar(car, 100);
      }
    } else if (
      !car.wrecked &&
      (car.offRoadTime > 1.2 || (activeTrack.id === 'coast' && car.y < SEA_LEVEL))
    ) {
      car.shield = 0;
      damageCar(car, 100);
    }
  }
  if (activeTrack.id === 'volcano' && !car.finished && !car.eliminated) {
    car.volcanoFallTime = volcanoRecoverableAt(car, track) ? 0 : (car.volcanoFallTime || 0) + dt;
    if (car.volcanoFallTime >= 1.2) {
      car.shield = 0;
      damageCar(car, 100);
    }
  }
  if (
    !car.edgeBalance &&
    !car.falling &&
    !car.overturned &&
    !car.wrecked &&
    car.y <= car.groundY + 0.001 &&
    car.vy <= 0
  ) {
    // Match the actual road normal in the same YXZ body basis as the renderer.
    // Airborne impact rotations remain entirely ballistic.
    const grade = track.grade || 0,
      normal = track.surface;
    const along = normal
        ? -(normal.nx * Math.cos(car.angle) + normal.nz * Math.sin(car.angle)) / normal.ny
        : grade * (Math.cos(car.angle) * track.nz - Math.sin(car.angle) * track.nx),
      across = normal
        ? -(-normal.nx * Math.sin(car.angle) + normal.nz * Math.cos(car.angle)) / normal.ny
        : grade * (-Math.sin(car.angle) * track.nz - Math.cos(car.angle) * track.nx),
      blend = 1 - Math.exp(-dt * 14);
    car.pitch += (Math.atan2(along, Math.sqrt(1 + across * across)) - car.pitch) * blend;
    car.roll += (Math.atan(-across) - car.roll) * blend;
  }
  let diff = track.fraction - car.trackFraction;
  if (diff > 0.5) diff -= 1;
  if (diff < -0.5) diff += 1;
  if (
    track.distance < track.halfWidth + (activeTrack.id === 'volcano' && track.surface ? 40 : 5) &&
    !car.falling &&
    !car.eliminated
  )
    car.progress += clamp(diff, -0.01, 0.01);
  if (activeTrack.id === 'desert' && !uncontrolled && Math.hypot(car.vx, car.vz) > 12) {
    for (const ramp of DESERT_JUMPS)
      if (
        car.trackFraction < ramp.fraction &&
        track.fraction >= ramp.fraction &&
        diff > 0 &&
        diff < 0.01
      ) {
        car.y = Math.max(car.y, trackAt(ramp.fraction).y + ramp.height + 0.08);
        car.vy = 8 + Math.hypot(car.vx, car.vz) * 0.15;
        car.rampFlight = true;
        car.edgeBalance = false;
      }
  }
  car.trackFraction = track.fraction;
  car.lap = clamp(Math.floor(Math.max(0, car.progress)) + 1, 1, LAPS);
}
export function carContact(a, b) {
  const fa = { x: Math.cos(a.angle), z: Math.sin(a.angle) },
    sa = { x: -fa.z, z: fa.x },
    fb = { x: Math.cos(b.angle), z: Math.sin(b.angle) },
    sb = { x: -fb.z, z: fb.x };
  const dx = b.x - a.x,
    dz = b.z - a.z;
  let depth = Infinity,
    nx = 0,
    nz = 0;
  for (const axis of [fa, sa, fb, sb]) {
    const ra =
      (Math.abs(fa.x * axis.x + fa.z * axis.z) * CAR_LENGTH) / 2 +
      (Math.abs(sa.x * axis.x + sa.z * axis.z) * CAR_WIDTH) / 2;
    const rb =
      (Math.abs(fb.x * axis.x + fb.z * axis.z) * CAR_LENGTH) / 2 +
      (Math.abs(sb.x * axis.x + sb.z * axis.z) * CAR_WIDTH) / 2;
    const d = dx * axis.x + dz * axis.z,
      overlap = ra + rb - Math.abs(d);
    if (overlap <= 0) return null;
    if (overlap < depth) {
      depth = overlap;
      nx = axis.x * (d < 0 ? -1 : 1);
      nz = axis.z * (d < 0 ? -1 : 1);
    }
  }
  // Centre of the overlapping contact face, rather than an arbitrary support
  // corner. Nearly parallel bumpers must not produce a huge false spin impulse.
  const tx = -nz,
    tz = nx;
  const radius = (f, s, x, z) =>
    (Math.abs(f.x * x + f.z * z) * CAR_LENGTH) / 2 + (Math.abs(s.x * x + s.z * z) * CAR_WIDTH) / 2;
  const at = a.x * tx + a.z * tz,
    bt = b.x * tx + b.z * tz,
    ar = radius(fa, sa, tx, tz),
    br = radius(fb, sb, tx, tz);
  const tangent = (Math.max(at - ar, bt - br) + Math.min(at + ar, bt + br)) / 2;
  const normal =
    (a.x * nx + a.z * nz + radius(fa, sa, nx, nz) + b.x * nx + b.z * nz - radius(fb, sb, nx, nz)) /
    2;
  return { depth, nx, nz, x: nx * normal + tx * tangent, z: nz * normal + tz * tangent };
}
export function collideCars(cars, { road = false, damage = true, onElimination } = {}) {
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i < cars.length; i++)
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i],
          b = cars[j];
        if (
          (a.eliminated && !a.wrecked) ||
          (b.eliminated && !b.wrecked) ||
          Math.abs(a.y - b.y) > 1.3 ||
          a.falling ||
          b.falling
        )
          continue;
        const hit = carContact(a, b);
        if (!hit) continue;
        const { nx, nz } = hit;
        const ma = a.wrecked ? 0.4 : 1,
          mb = b.wrecked ? 0.4 : 1,
          inertia = (CAR_LENGTH ** 2 + CAR_WIDTH ** 2) / 12;
        const ax = hit.x - a.x,
          az = hit.z - a.z,
          bx = hit.x - b.x,
          bz = hit.z - b.z;
        const va = (a.vx - a.yawVelocity * az) * nx + (a.vz + a.yawVelocity * ax) * nz,
          vb = (b.vx - b.yawVelocity * bz) * nx + (b.vz + b.yawVelocity * bx) * nz;
        const contactSpeed = Math.max(
          0,
          va - vb,
          Math.abs((a.vx - b.vx) * -nz + (a.vz - b.vz) * nx),
        );
        recordContact(a, hit.x, Math.max(a.y, b.y) + 0.6, hit.z, nx, nz, contactSpeed, 'car');
        recordContact(b, hit.x, Math.max(a.y, b.y) + 0.6, hit.z, -nx, -nz, contactSpeed, 'car');

        const speed = va - vb,
          ta = ax * nz - az * nx,
          tb = bx * nz - bz * nx;
        const push = (hit.depth + 0.002) / (ma + mb);
        a.x -= nx * push * ma;
        a.z -= nz * push * ma;
        b.x += nx * push * mb;
        b.z += nz * push * mb;
        if (speed > 0) {
          const beforeA = Math.hypot(a.vx, a.vz),
            beforeB = Math.hypot(b.vx, b.vz);
          const impulse =
            (speed * 1.08) / (ma + mb + (ta * ta * ma) / inertia + (tb * tb * mb) / inertia);
          a.vx -= nx * impulse * ma;
          a.vz -= nz * impulse * ma;
          b.vx += nx * impulse * mb;
          b.vz += nz * impulse * mb;
          shoveRollover(a, -nx * impulse * ma, -nz * impulse * ma);
          shoveRollover(b, nx * impulse * mb, nz * impulse * mb);
          a.yawVelocity = clamp(a.yawVelocity - (ta * impulse * ma) / inertia, -3, 3);
          b.yawVelocity = clamp(b.yawVelocity + (tb * impulse * mb) / inertia, -3, 3);
          // A little contact friction makes rubbing doors and clipping a rear
          // quarter transfer sideways motion, while retaining deliberate drift.
          const tx = -nz,
            tz = nx,
            tangentSpeed = (b.vx - a.vx) * tx + (b.vz - a.vz) * tz;
          const friction = clamp(-tangentSpeed / (ma + mb), -impulse * 0.25, impulse * 0.25);
          a.vx -= tx * friction * ma;
          a.vz -= tz * friction * ma;
          b.vx += tx * friction * mb;
          b.vz += tz * friction * mb;
          shoveRollover(a, -tx * friction * ma, -tz * friction * ma);
          shoveRollover(b, tx * friction * mb, tz * friction * mb);
          softenPadBoostImpact(a, beforeA, Math.hypot(a.vx, a.vz));
          softenPadBoostImpact(b, beforeB, Math.hypot(b.vx, b.vz));
          a.impactTime = b.impactTime = 0.65;
          if (damage && pass === 0 && speed > 7) {
            if (a.contactCooldown <= 0) {
              if (damageCar(a, (speed - 7) * 0.35) && a.wrecked) onElimination?.(a, b);
              a.contactCooldown = 0.2;
            }
            if (b.contactCooldown <= 0) {
              if (damageCar(b, (speed - 7) * 0.35) && b.wrecked) onElimination?.(b, a);
              b.contactCooldown = 0.2;
            }
          }
        }
      }
    if (road) for (const car of cars) if (!car.eliminated || car.wrecked) constrainRoad(car);
  }
}
// Swept ray against the oriented chassis: fast bullets cannot tunnel between snapshots.
export function rayCar(x, z, dx, dz, car, padding = 0) {
  const c = Math.cos(car.angle),
    s = Math.sin(car.angle),
    ox = (x - car.x) * c + (z - car.z) * s,
    oz = -(x - car.x) * s + (z - car.z) * c,
    rx = dx * c + dz * s,
    rz = -dx * s + dz * c;
  let lo = 0,
    hi = 1;
  for (const [o, d, extent] of [
    [ox, rx, CAR_LENGTH / 2 + padding],
    [oz, rz, CAR_WIDTH / 2 + padding],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(o) > extent) return null;
      continue;
    }
    let a = (-extent - o) / d,
      b = (extent - o) / d;
    if (a > b) [a, b] = [b, a];
    lo = Math.max(lo, a);
    hi = Math.min(hi, b);
    if (lo > hi) return null;
  }
  return lo;
}
// Once alongside a split, keep the branch the car actually occupies. A new
// round may put either grid column here, regardless of the bot's preferred side.
export function botRouteSide(car, preferred = 1) {
  if (activeTrack.id === 'ice') {
    const p = trackAt(car.trackFraction),
      lateral = (car.x - p.x) * p.nx + (car.z - p.z) * p.nz;
    if (Math.abs(p.x) < 130 && Math.abs(lateral) > 0.1) return Math.sign(lateral);
  }
  return preferred;
}
// All profiles use the normal car physics. Difficulty changes planning, never engine power.
export const BOT_DRIVING_PROFILES = Object.freeze({
  easy: Object.freeze({ speed: 28, corner: 17, line: 0, look: 0.6, rotorSpeed: 8 }),
  medium: Object.freeze({ speed: 36, corner: 12, line: 0.9, look: 0.55, rotorSpeed: 9 }),
  hard: Object.freeze({ speed: 39, corner: 10, line: 1.65, look: 0.6, rotorSpeed: 19 }),
});
export function botSteeringTarget(
  car,
  { lane = 0, side = 0, splitLead = 175, avoidLane = null, difficulty = 'medium' } = {},
) {
  const profile = BOT_DRIVING_PROFILES[difficulty] ?? BOT_DRIVING_PROFILES.medium;
  side = botRouteSide(car, side);
  const speed = Math.hypot(car.vx, car.vz),
    road = trackAt(car.trackFraction),
    icy = activeTrack.id === 'ice';
  const fraction =
      car.trackFraction + Math.max(7, speed * (icy ? 0.65 : profile.look)) / TRACK_LENGTH,
    p = trackAt(fraction);
  // Corner speed follows road curvature, not the sideways chassis angle during a drift.
  const ahead = trackAt(car.trackFraction + 24 / TRACK_LENGTH),
    turn = angleDelta(ahead.angle, road.angle),
    bend = Math.abs(turn);
  const iceSpace = icy ? clamp((Math.min(road.halfWidth, p.halfWidth) - 9) / 6, 0, 1) : 0;
  let offset =
    clamp(lane, -p.halfWidth + CAR_WIDTH / 2 + 0.8, p.halfWidth - CAR_WIDTH / 2 - 0.8) *
    clamp(1 - bend / 0.3, 0, 1);
  // Wide ice turns leave room to aim inside and let momentum drift outward.
  offset += Math.sign(turn) * 4 * iceSpace * clamp(bend / 0.3, 0, 1);
  // Sample the bend at the steering horizon, aiming inside its apex. This
  // bounded analytic racing line costs two road samples, with no per-tick search.
  if (!icy) {
    const before = trackAt(fraction - 12 / TRACK_LENGTH),
      after = trackAt(fraction + 12 / TRACK_LENGTH),
      curve = angleDelta(after.angle, before.angle);
    offset +=
      Math.sign(curve) *
      Math.min(profile.line, p.halfWidth * 0.18) *
      clamp(Math.abs(curve) / 0.22, 0, 1);
  }
  for (const f of PLAZAS) {
    const d = arcDistance(car.trackFraction, f);
    if (d < 65) {
      const blend = clamp((65 - d) / 17, 0, 1);
      offset = offset * (1 - blend) + (side || car.botLane || 1) * 5 * clamp((48 - d) / 18, 0, 1);
    }
  }
  if (activeTrack.id === 'ice' && Math.abs(p.x) < splitLead) {
    const blend = clamp((splitLead - Math.abs(p.x)) / (splitLead - 130), 0, 1);
    offset =
      offset * (1 - blend) + (side || car.botLane || (car.gridSlot % 2 ? -1 : 1)) * 8 * blend;
  }
  if (activeTrack.id === 'factory')
    for (const f of FACTORY_PRESSES) {
      const d = arcDistance(car.trackFraction, f);
      if (d < 38) {
        const blend = clamp((38 - d) / 18, 0, 1);
        offset = offset * (1 - blend) - trackAt(f).insideSide * road.halfWidth * 0.57 * blend;
      }
    }
  if (activeTrack.id === 'volcano') {
    // Pick a clear lane before reaching each basalt boulder, with a stable choice
    // throughout approach and exit rather than steering at its centre.
    for (const o of OBSTACLES) {
      const d = (((((o.fraction - car.trackFraction + 0.5) % 1) + 1) % 1) - 0.5) * TRACK_LENGTH;
      if (d < -8 || d > 48) continue;
      const q = trackAt(o.fraction),
        rockLane = (o.x - q.x) * q.nx + (o.z - q.z) * q.nz;
      if (Math.abs(rockLane - offset) < o.radius + 2.7) {
        const candidate = rockLane > 1 ? rockLane - o.radius - 3.3 : rockLane + o.radius + 3.3;
        offset = candidate;
      }
    }
  }
  if (Number.isFinite(avoidLane)) offset = avoidLane;
  const bounds = botLaneBounds(fraction, side || Math.sign(offset) || 1, splitLead);
  offset = clamp(offset, bounds.min, bounds.max);
  p.x += p.nx * offset;
  p.z += p.nz * offset;
  const rotor =
    activeTrack.id === 'factory' ? rotorBotTarget(car, trackAt, TRACK_LENGTH, difficulty) : null;
  return {
    point: rotor?.point ?? p,
    lane: offset,
    speed,
    bend,
    iceSpace,
    icy,
    rotor: !!rotor,
    profile,
  };
}
// Legal lane centres keep the whole chassis away from road edges and ice gaps.
export function botLaneBounds(fraction, side = 1, splitLead = 175) {
  const p = trackAt(fraction),
    edge = p.halfWidth - CAR_WIDTH / 2 - 0.8;
  let min = -edge,
    max = edge;
  if (activeTrack.id === 'ice' && Math.abs(p.x) < splitLead) {
    const inner = iceSplit(p.x) > 0 ? iceSplit(p.x) + CAR_WIDTH / 2 + 0.65 : 0;
    if (side > 0) min = inner;
    else max = -inner;
  }
  return { min, max };
}
export function botInput(car, options = {}) {
  const { point: p, speed, bend, iceSpace, icy, rotor, profile } = botSteeringTarget(car, options);
  const target = Math.atan2(p.z - car.z, p.x - car.x);
  const error = angleDelta(target, car.angle);
  // Correct outward momentum as well as heading; bound collision-induced slip.
  const slip =
    speed > 4
      ? clamp(angleDelta(car.angle, Math.atan2(car.vz, car.vx)), icy ? -0.9 : -0.6, icy ? 0.9 : 0.6)
      : 0;
  const desired = rotor
    ? profile.rotorSpeed
    : clamp(
        profile.speed - bend * (icy ? 20 : profile.corner),
        icy ? 8 + 10 * iceSpace : 16,
        profile.speed,
      );
  return {
    steer: clamp(error * 2.5 + slip * (icy ? 0.5 : 1.5), -1, 1),
    throttle: speed > desired ? 0 : 1,
    reverse: false,
    brake: Math.abs(error) > 1.1,
    fire: false,
  };
}

selectTrack();
