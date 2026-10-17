import { createWheelAssembly, attachHeadlights } from './car-animation.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR_LENGTH, CAR_WIDTH } from '../shared/game.js';
let template;
// Longitudinal splines give the body continuous shoulders and a tapered nose.
const bodySections = [
  [-2.38, 0.3, 0.56, 0.7],
  [-2.12, 0.25, 0.7, 0.91],
  [-1.48, 0.24, 0.77, 0.97],
  [-0.65, 0.23, 0.65, 0.92],
  [0.35, 0.23, 0.66, 0.91],
  [1.42, 0.25, 0.74, 0.98],
  [1.94, 0.28, 0.62, 0.91],
  [2.35, 0.32, 0.45, 0.71],
];
const cabinSections = [
  [-1.5, 0.64, 0.66, 0.45],
  [-1.12, 0.64, 0.86, 0.62],
  [-0.65, 0.64, 0.995, 0.65],
  [0.08, 0.64, 0.99, 0.62],
  [0.64, 0.63, 0.8, 0.53],
  [0.95, 0.63, 0.65, 0.43],
];
function sectionAt(sections, x) {
  let i = 0;
  while (i < sections.length - 2 && sections[i + 1][0] < x) i++;
  const a = sections[i],
    b = sections[i + 1],
    p = sections[Math.max(0, i - 1)],
    q = sections[Math.min(sections.length - 1, i + 2)],
    t = (x - a[0]) / (b[0] - a[0]);
  return [
    x,
    ...[1, 2, 3].map(
      (k) =>
        a[k] +
        0.5 *
          t *
          (b[k] -
            p[k] +
            t * (2 * p[k] - 5 * a[k] + 4 * b[k] - q[k] + t * (3 * (a[k] - b[k]) + q[k] - p[k]))),
    ),
  ];
}
function shell(
  sections,
  {
    from = sections[0][0],
    to = sections.at(-1)[0],
    start = 0,
    end = Math.PI * 2,
    lift = 0,
    rows = 48,
    sides = 24,
  } = {},
) {
  const positions = [],
    indices = [];
  for (let i = 0; i <= rows; i++) {
    const [x, bottom, top, width] = sectionAt(sections, from + ((to - from) * i) / rows);
    for (let j = 0; j <= sides; j++) {
      const a = start + ((end - start) * j) / sides,
        c = Math.cos(a),
        s = Math.sin(a);
      positions.push(
        x,
        (bottom + top) / 2 + (Math.sign(c) * Math.abs(c) ** 0.72 * (top - bottom)) / 2 + lift,
        Math.sign(s) * Math.abs(s) ** 0.65 * width,
      );
    }
  }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j,
        b = a + sides + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  // Full shells have closed nose/tail faces; partial shells form roof/trim panels.
  if (end - start > 6) {
    for (const row of [0, rows]) {
      const startIndex = row * (sides + 1),
        center = positions.length / 3;
      const [x, lo, hi] = sectionAt(sections, from + ((to - from) * row) / rows);
      positions.push(x, (lo + hi) / 2, 0);
      for (let j = 0; j < sides; j++)
        if (row === 0) indices.push(center, startIndex + j + 1, startIndex + j);
        else indices.push(center, startIndex + j, startIndex + j + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2),
  );
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
function buildTemplate() {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.55,
    roughness: 0.19,
    clearcoat: 1,
    clearcoatRoughness: 0.065,
    envMapIntensity: 1.65,
  });
  paint.name = 'body-paint';
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x102735,
    metalness: 0.25,
    roughness: 0.095,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.6,
  });
  const trim = new THREE.MeshStandardMaterial({ color: 0x15232b, metalness: 0.4, roughness: 0.34 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0c1115, roughness: 0.9 });
  const alloy = new THREE.MeshStandardMaterial({
    color: 0xcedae0,
    metalness: 0.95,
    roughness: 0.2,
    envMapIntensity: 1.5,
  });
  const led = new THREE.MeshStandardMaterial({
    color: 0xd8f7ff,
    emissive: 0x92dbff,
    emissiveIntensity: 2.4,
  });
  led.name = 'headlamps';
  const rear = new THREE.MeshStandardMaterial({
    color: 0xe73127,
    emissive: 0xff2618,
    emissiveIntensity: 0.65,
    roughness: 0.25,
  });
  rear.name = 'rear-lights';
  const caliper = new THREE.MeshStandardMaterial({
    color: 0xb8291c,
    metalness: 0.3,
    roughness: 0.5,
  });
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  const box = (x, y, z, w, h, d, mat = trim) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const tube = (points, r, mat) =>
    add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
        20,
        r,
        6,
        false,
      ),
      mat,
    );
  add(shell(bodySections), paint);
  add(shell(cabinSections), glass);
  add(
    shell(cabinSections, {
      from: -0.85,
      to: 0.22,
      start: -0.73,
      end: 0.73,
      lift: 0.012,
      rows: 16,
      sides: 12,
    }),
    paint,
  );
  // Sill blades, splitter and diffuser establish a low, wide GT silhouette.
  box(2.2, 0.25, 0, 0.5, 0.075, 1.75);
  box(-2.21, 0.25, 0, 0.43, 0.1, 1.7);
  box(2.365, 0.385, 0, 0.025, 0.085, 1.04);
  for (const z of [-0.58, -0.29, 0, 0.29, 0.58]) box(-2.22, 0.3, z, 0.4, 0.16, 0.035);
  for (const side of [-1, 1]) {
    tube(
      [
        [-1.82, 0.33, side * 0.94],
        [-0.4, 0.28, side * 0.965],
        [0.8, 0.29, side * 0.955],
        [1.8, 0.33, side * 0.93],
      ],
      0.055,
      trim,
    );
    // Cockpit rails slope into the windscreen and rear fastback glass.
    tube(
      [
        [-1.38, 0.7, side * 0.49],
        [-0.84, 0.96, side * 0.48],
        [0.16, 0.95, side * 0.46],
        [0.85, 0.69, side * 0.44],
      ],
      0.025,
      paint,
    );
    const intake = box(-0.62, 0.52, side * 0.921, 0.5, 0.12, 0.025);
    intake.rotation.z = -0.12;
    tube(
      [
        [0.42, 0.71, side * 0.57],
        [0.42, 0.75, side * 0.76],
        [0.42, 0.79, side * 0.91],
      ],
      0.025,
      trim,
    );
    box(0.42, 0.8, side * 0.955, 0.23, 0.1, 0.16, paint);
    tube(
      [
        [1.89, 0.65, side * 0.8],
        [2.08, 0.6, side * 0.71],
        [2.25, 0.51, side * 0.56],
      ],
      0.031,
      led,
    );
    tube(
      [
        [-2.23, 0.61, side * 0.82],
        [-2.3, 0.59, side * 0.62],
        [-2.32, 0.59, side * 0.29],
      ],
      0.029,
      rear,
    );
    for (const x of [-1.48, 1.43]) {
      box(x + 0.16, 0.365, side * 1.039, 0.045, 0.15, 0.025, caliper);
      add(new THREE.TorusGeometry(0.4, 0.035, 6, 24, Math.PI), paint, x, 0.365, side * 0.982);
    }
    const exhaust = add(
      new THREE.CylinderGeometry(0.077, 0.077, 0.13, 12),
      alloy,
      -2.36,
      0.37,
      side * 0.5,
    );
    exhaust.rotation.z = Math.PI / 2;
    const bore = add(
      new THREE.CylinderGeometry(0.052, 0.052, 0.008, 12),
      trim,
      -2.428,
      0.37,
      side * 0.5,
    );
    bore.rotation.z = Math.PI / 2;
    box(-1.98, 0.79, side * 0.62, 0.075, 0.22, 0.07);
  }
  // Swept rear wing with painted end plates; its height clears the roof mount.
  const wing = box(-2.0, 0.91, 0, 0.32, 0.065, 1.96);
  wing.rotation.z = -0.08;
  for (const side of [-1, 1]) box(-2.0, 0.93, side * 0.97, 0.35, 0.13, 0.04, paint);
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i++)
      box(1.15 + i * 0.14, 0.75 - i * 0.012, side * 0.5, 0.05, 0.02, 0.24);
  g.updateMatrixWorld(true);
  const groups = new Map();
  for (const mesh of g.children) {
    let geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if (geo.index) {
      const flat = geo.toNonIndexed();
      geo.dispose();
      geo = flat;
    }
    if (!groups.has(mesh.material)) groups.set(mesh.material, []);
    groups.get(mesh.material).push(geo);
    mesh.geometry.dispose();
  }
  const result = new THREE.Group();
  for (const [material, parts] of groups) {
    const mesh = new THREE.Mesh(mergeGeometries(parts), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    result.add(mesh);
    parts.forEach((p) => p.dispose());
  }
  const wheelAssembly = createWheelAssembly(rubber);
  result.add(wheelAssembly);
  // Match the unchanged collision footprint exactly, including mirrors/wheels.
  const bounds = new THREE.Box3().setFromObject(result),
    size = bounds.getSize(new THREE.Vector3()),
    center = bounds.getCenter(new THREE.Vector3());
  const fit = new THREE.Matrix4()
    .makeScale(CAR_LENGTH / size.x, 1, CAR_WIDTH / size.z)
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
  for (const mesh of result.children)
    if (mesh.isMesh) mesh.geometry.applyMatrix4(fit);
    else mesh.applyMatrix4(fit);
  result.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.geometry.userData.sharedCarResource = true;
      mesh.material.userData.sharedCarResource = true;
    }
  });
  return result;
}
export function createSportsCar(color, { headlights = false } = {}) {
  template ??= buildTemplate();
  const car = template.clone(true);
  let paint;
  for (const mesh of car.children)
    if (mesh.material?.name === 'body-paint') {
      paint = mesh.material.clone();
      delete paint.userData.sharedCarResource;
      paint.color.set(color);
      mesh.material = paint;
    }
  const lamps = {};
  for (const mesh of car.children)
    if (['rear-lights', 'headlamps'].includes(mesh.material?.name)) {
      mesh.material = mesh.material.clone();
      delete mesh.material.userData.sharedCarResource;
      lamps[mesh.material.name === 'rear-lights' ? 'rearLights' : 'headlamps'] = mesh.material;
    }
  car.userData = {
    ...lamps,
    paint,
    baseColor: new THREE.Color(color),
    chassisSize: { length: CAR_LENGTH, width: CAR_WIDTH },
  };
  car.rotation.order = 'YXZ';
  car.userData.headlamps.emissiveIntensity = headlights ? 5 : 0.12;
  if (headlights) attachHeadlights(car);
  return car;
}

// Chassis buffers are shared by every car and renderer for the page lifetime.
export function disposeCarInstance(car) {
  if (car.userData.weaponModel) car.remove(car.userData.weaponModel);
  car.traverse((mesh) => {
    if (mesh.isInstancedMesh) mesh.dispose();
    if (mesh.geometry && !mesh.geometry.userData.sharedCarResource) mesh.geometry.dispose();
  });
  car.userData.paint?.dispose();
  car.userData.rearLights?.dispose();
  car.userData.headlamps?.dispose();
  car.userData.headlight?.dispose();
  car.userData.shield?.material.dispose();
}
