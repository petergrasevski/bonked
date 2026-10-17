import { buildVolcanoScenery } from './volcano-scenery.js';
import { buildFactoryMachinery } from './factory-machinery.js';
import { buildFactoryInterior, mergeMovingGroup } from './factory-interior.js';
import { createSteamVents } from './volcano-effects.js';
import { rotorAngle, rotorWallSegments } from '../shared/factory-rotors.js';
import * as THREE from 'three';
import { activeTrack, trackAt, SEGMENTS, TRACK_LENGTH } from '../shared/game.js';
import {
  FACTORY_BELTS,
  FACTORY_TABLES,
  FACTORY_PRESSES,
  VOLCANO_HOT,
  beltDirection,
  beltTravel,
  volcanoLavaBounds,
  factoryTipAt,
  circuitDistance,
} from '../shared/extra-circuits.js';

export const CIRCUIT_PALETTES = {
  factory: { road: 0x53616a, edge: 0xd9a546, ground: 0x313b3c, wall: 0x304654, light: 0xffc66c },
  volcano: { road: 0x894332, edge: 0xe59c62, ground: 0x29272e, wall: 0x39323b, light: 0xff742c },
};
const TAU = Math.PI * 2;
function group(w, x, y, z, angle = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = -angle;
  w.static.add(g);
  return g;
}
function glow(w, color) {
  return w.mat(color, 0.5, 0.1).clone();
}
function emissive(w, color, strength = 0.6) {
  const m = glow(w, color);
  m.emissive = new THREE.Color(color);
  m.emissiveIntensity = strength;
  return m;
}
function roadPatch(w, fraction, length, lo, hi, material, lift = 0.04) {
  const vertices = [],
    uv = [],
    count = Math.ceil(length / 2);
  for (let i = 0; i < count; i++) {
    const p = trackAt(fraction + ((i / count - 0.5) * length) / TRACK_LENGTH),
      q = trackAt(fraction + (((i + 1) / count - 0.5) * length) / TRACK_LENGTH);
    const organic = material.userData.lavaZone;
    const bounds = (r) =>
      volcanoLavaBounds(
        r.fraction ?? (((fraction + ((i / count - 0.5) * length) / TRACK_LENGTH) % 1) + 1) % 1,
        TRACK_LENGTH,
      )?.[0] || [0.69, 0.69];
    const a = organic
        ? bounds({ ...p, fraction: fraction + ((i / count - 0.5) * length) / TRACK_LENGTH })
        : [lo, hi],
      b = organic
        ? bounds({ ...q, fraction: fraction + (((i + 1) / count - 0.5) * length) / TRACK_LENGTH })
        : [lo, hi];
    const points = [
      [p, a[0], i],
      [p, a[1], i],
      [q, b[0], i + 1],
      [q, b[1], i + 1],
    ];
    for (const index of [0, 1, 2, 1, 3, 2]) {
      const [r, l, j] = points[index];
      vertices.push(r.x + r.nx * r.halfWidth * l, r.y + lift, r.z + r.nz * r.halfWidth * l);
      uv.push((j / count) * length, l);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return w.mesh(geo, material, 0, 0, 0, w.scene);
}
function animatedSurface(color, kind) {
  const time = { value: 0 },
    direction = { value: 1 },
    travel = { value: 0 },
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: kind === 'lava' ? 0.48 : 0.65,
      metalness: kind === 'belt' ? 0.5 : 0.05,
      side: THREE.DoubleSide,
    });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.circuitTravel = travel;
    shader.uniforms.circuitTime = time;
    shader.uniforms.circuitDirection = direction;
    shader.vertexShader = '#define USE_UV\n' + shader.vertexShader;
    shader.fragmentShader =
      '#define USE_UV\nuniform float circuitTime,circuitDirection,circuitTravel;\nfloat lavaHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat lavaNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(lavaHash(i),lavaHash(i+vec2(1,0)),f.x),mix(lavaHash(i+vec2(0,1)),lavaHash(i+vec2(1,1)),f.x),f.y);}\nfloat lavaFbm(vec2 p){float n=0.,a=.5;for(int i=0;i<5;i++){n+=lavaNoise(p)*a;p=p*2.03+vec2(7.1,3.4);a*=.5;}return n;}\n\n' +
      shader.fragmentShader;
    const fragment =
      kind === 'belt'
        ? `
      float tread=step(.82,fract(vUv.x*.7-circuitTravel*2.));
      diffuseColor.rgb*=mix(.45,.9,tread);
      float blend=circuitDirection*.5+.5;
      float across=(abs(vUv.y)-.53)/.35;
      float cell=mod(vUv.x-circuitTravel*5.,9.);
      float arrow=1.-smoothstep(.5,.85,abs(cell-4.+abs(across)*2.5*circuitDirection));
      float rail=step(.86,abs(across));
      vec3 ink=mix(vec3(.17,.62,1.),vec3(1.,.72,.13),blend);
      diffuseColor.rgb=mix(diffuseColor.rgb,ink,max(arrow,rail*.65));
    `
        : `
      vec2 flow=vec2(vUv.x*.19-circuitTime*.45,vUv.y*7.);
      vec2 warp=vec2(lavaFbm(flow*.65+vec2(0.,circuitTime*.08)),lavaFbm(flow*.65+vec2(8.,-circuitTime*.11)));
      float crust=lavaFbm(flow+warp*3.1);
      float veins=1.-smoothstep(.02,.085,abs(crust-.5));
      float hot=pow(veins,5.),embers=lavaNoise(flow*12.+warp)*.15;
      vec3 lavaColor=mix(vec3(.075,.035,.028),vec3(1.,.15,.008),smoothstep(.15,.75,veins));
      lavaColor=mix(lavaColor,vec3(1.,.48,.02),hot*.65);lavaColor+=vec3(.12,.025,.001)*embers;
      diffuseColor.rgb=lavaColor;
    `;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      '#include <map_fragment>\n' + fragment,
    );
    if (kind === 'lava')
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=lavaColor*.45;',
      );
  };
  m.customProgramCacheKey = () => `circuit-${kind}-v2`;
  return { material: m, time, direction, travel };
}
export function circuitRoadMaterial(w, id) {
  const palette = CIRCUIT_PALETTES[id],
    canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `#${palette.road.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, 256, 256);
  // Deterministic fine grain, steel seams, basalt fractures, or limestone slabs.
  for (let i = 0; i < 1700; i++) {
    const x = ((Math.sin(i * 127.1) * 43758.54) % 1) * 256,
      y = ((Math.sin(i * 311.7) * 17371.13) % 1) * 256;
    ctx.fillStyle = i % 2 ? '#ffffff09' : '#00000012';
    ctx.fillRect(Math.abs(x), Math.abs(y), 1 + (i % 3), 1);
  }
  ctx.strokeStyle = id === 'factory' ? '#182a3380' : id === 'volcano' ? '#1d192380' : '#344f4690';
  ctx.lineWidth = 2;
  for (let i = 0; i < (id === 'volcano' ? 0 : 4); i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * 64);
    ctx.lineTo(256, i * 64);
    ctx.stroke();
    if (id !== 'volcano')
      for (let j = 0; j < 2; j++) {
        ctx.beginPath();
        ctx.moveTo(j * 128 + (i % 2) * 64, i * 64);
        ctx.lineTo(j * 128 + (i % 2) * 64, (i + 1) * 64);
        ctx.stroke();
      }
  }
  if (id === 'volcano') {
    // Seamless, seeded cinder gravel: warm dust, angular basalt and shallow ruts.
    let seed = 719;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    ctx.fillStyle = '#854330';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5200; i++) {
      const x = random() * 256,
        y = random() * 256,
        r = 0.35 + random() ** 3 * 6,
        tone = random();
      const colors = ['#542d25', '#643326', '#a85b3e', '#b66b48', '#763c2c', '#3d2926'];
      ctx.fillStyle = colors[Math.floor(tone * colors.length)];
      const points = Array.from({ length: 5 }, (_, k) => {
        const a = (k * Math.PI * 2) / 5;
        return [Math.cos(a) * r * (0.6 + random() * 0.5), Math.sin(a) * r * (0.5 + random() * 0.5)];
      });
      for (const dx of [-256, 0, 256])
        for (const dy of [-256, 0, 256]) {
          ctx.beginPath();
          points.forEach(([px, py], k) =>
            k ? ctx.lineTo(x + px + dx, y + py + dy) : ctx.moveTo(x + px + dx, y + py + dy),
          );
          ctx.closePath();
          ctx.fill();
        }
    }
  }
  if (id === 'factory') {
    // Raised, staggered diamond tread with rubbed highlights and inset rivets.
    // One repeatable texture is shared by every deck and tipping segment.
    for (let y = 10; y < 256; y += 16)
      for (let x = -8; x < 264; x += 16) {
        const dx = x + (((y - 10) / 16) % 2) * 8;
        ctx.save();
        ctx.translate(dx, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#1c2e3899';
        ctx.fillRect(-4, -1, 9, 3);
        ctx.fillStyle = '#b5c0c155';
        ctx.fillRect(-4, -2, 8, 1.5);
        ctx.restore();
      }
    for (const y of [0, 64, 128, 192]) {
      ctx.fillStyle = '#172831';
      ctx.fillRect(0, y, 256, 1.5);
      ctx.fillStyle = '#93a5ac66';
      ctx.fillRect(0, y + 2, 256, 0.7);
      for (const x of [5, 123, 133, 251]) {
        ctx.fillStyle = '#18262d';
        ctx.beginPath();
        ctx.arc(x, y + 7, 2.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#aebec1';
        ctx.beginPath();
        ctx.arc(x - 0.5, y + 6.5, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Broad polished wheel paths break up the regular metal without hiding tread.
    for (const x of [74, 182]) {
      const rub = ctx.createLinearGradient(x - 18, 0, x + 18, 0);
      rub.addColorStop(0, '#101c2500');
      rub.addColorStop(0.5, '#101c2528');
      rub.addColorStop(1, '#101c2500');
      ctx.fillStyle = rub;
      ctx.fillRect(x - 18, 0, 36, 256);
    }
    for (let i = 0; i < 90; i++) {
      const x = (Math.sin(i * 53.1) * 0.5 + 0.5) * 256,
        y = (Math.cos(i * 17.3) * 0.5 + 0.5) * 256;
      ctx.fillStyle = i % 2 ? '#e0e7df33' : '#0e1e2b44';
      ctx.fillRect(x, y, 0.6, 2 + (i % 9));
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  w.textures.set(`${id}-road`, texture);
  return new THREE.MeshStandardMaterial({
    map: texture,
    bumpMap: texture,
    bumpScale: id === 'volcano' ? 0.16 : 0.035,
    roughness: id === 'factory' ? 0.62 : 0.88,
    metalness: id === 'factory' ? 0.4 : 0.04,
    side: THREE.DoubleSide,
  });
}
function volcanoScenery(w) {
  return buildVolcanoScenery(w, animatedSurface);
}
export function circuitGroundMaterial(w, id) {
  const material = new THREE.MeshStandardMaterial({
    color: id === 'factory' ? 0x536166 : CIRCUIT_PALETTES[id].ground,
    roughness: 0.94,
    metalness: 0.03,
  });
  if (id === 'factory') {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = 'varying vec2 factoryFloor;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nfactoryFloor=position.xy;',
      );
      shader.fragmentShader = 'varying vec2 factoryFloor;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 tile=abs(fract(factoryFloor/18.)-.5);float seam=step(.491,max(tile.x,tile.y));
        float grain=fract(sin(dot(floor(factoryFloor*8.),vec2(127.1,311.7)))*43758.54);
        float mottling=sin(factoryFloor.x*.17+sin(factoryFloor.y*.11))*sin(factoryFloor.y*.21)*.055;
        diffuseColor.rgb*=mix(.89,1.05,grain)*(1.-seam*.3)+mottling;
        vec2 aisle=abs(fract(factoryFloor/90.)-.5);float paint=step(.487,max(aisle.x,aisle.y));
        float faded=.72+sin(factoryFloor.x*3.7+factoryFloor.y*7.1)*.12;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.73,.53,.17),paint*faded);
        // Drainage channels, inset grates and expansion joints across the hall.
        float drain=1.-smoothstep(.3,.45,abs(mod(factoryFloor.x+31.,90.)-45.));
        float grate=step(.52,fract(factoryFloor.y*1.6));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.12,.17,.19),drain*(.55+grate*.35));
        vec2 cell=floor(factoryFloor/18.),local=fract(factoryFloor/18.)-.5;
        float stainSeed=fract(sin(dot(cell,vec2(73.13,17.71)))*43758.54);
        float stain=(1.-smoothstep(.05,.4,length(local*vec2(1.1,1.6))))*step(.72,stainSeed);
        diffuseColor.rgb*=1.-stain*.24;
      `,
      );
    };
    material.customProgramCacheKey = () => 'factory-floor-v2';
  }
  return material;
}
export function buildExtraCircuit(w) {
  const id = activeTrack.id,
    palette = CIRCUIT_PALETTES[id];
  if (!palette) return null;
  const animated = [],
    tables = [];
  const interior = id === 'factory' ? buildFactoryInterior(w) : null,
    machinery = id === 'factory' ? buildFactoryMachinery(w) : null;
  if (id === 'volcano') animated.push(volcanoScenery(w));
  const steam = id === 'volcano' ? createSteamVents(w) : null;
  if (id === 'factory')
    for (const side of [-1, 1])
      w.ribbon((p) => side * (p.halfWidth - 0.25), 0.18, 0.07, palette.edge);
  if (id === 'factory') {
    FACTORY_BELTS.forEach((zone, index) => {
      for (const side of [-1, 1]) {
        const surface = animatedSurface(side > 0 ? 0x596a72 : 0x425b63, 'belt');
        roadPatch(
          w,
          zone.fraction,
          zone.length,
          side > 0 ? 0.18 : -0.88,
          side > 0 ? 0.88 : -0.18,
          surface.material,
        );
        animated.push({ ...surface, index, side });
      }
    });
    FACTORY_TABLES.forEach((f, index) => {
      const p = trackAt(f);
      for (const layer of [0, 1]) {
        const g = new THREE.Group();
        g.position.set(p.x, p.y + 0.06 + layer * 0.12, p.z);
        w.scene.add(g);
        const radius = layer ? 11.3 : 24;
        w.cylinder(0, 0, 0, radius, radius, 0.08, layer ? 0x446273 : 0x697d85, 64, g);
        for (let i = 0; i < (layer ? 16 : 24); i++) {
          const a = (i * Math.PI * 2) / (layer ? 16 : 24),
            r = radius - 1;
          const stripe = w.box(
            Math.cos(a) * r,
            0.06,
            Math.sin(a) * r,
            layer ? 1 : 1.8,
            0.03,
            0.25,
            layer ? 0x75bed2 : 0xe0b04e,
            g,
          );
          stripe.rotation.y = -a;
        }
        for (const wall of rotorWallSegments({ x: 0, z: 0 }, 0, index).filter(
          (w) => w.layer === layer,
        )) {
          const dx = wall.bx - wall.ax,
            dz = wall.bz - wall.az,
            length = Math.hypot(dx, dz),
            x = (wall.ax + wall.bx) / 2,
            z = (wall.az + wall.bz) / 2;
          const body = w.box(x, 1.05, z, length + 0.06, 2.1, 1.05, layer ? 0x2b4654 : 0x263e49, g);
          body.rotation.y = -Math.atan2(dz, dx);
          const cap = w.box(x, 2.15, z, length + 0.08, 0.15, 1.13, layer ? 0x75bed2 : 0xe0b04e, g);
          cap.rotation.y = body.rotation.y;
        }
        mergeMovingGroup(g);
        tables.push({ g, index, layer });
      }
    });
  }
  if (id === 'volcano') {
    VOLCANO_HOT.forEach((zone) => {
      const surface = animatedSurface(0x8c4532, 'lava');
      surface.material.userData.lavaZone = true;
      roadPatch(w, zone.fraction, zone.length, 0.28, 0.98, surface.material);
      animated.push(surface);
    });
  }
  // Sparse ground cover and foundation piers keep the elevated roads grounded.
  if (id === 'factory')
    for (let i = 0; i < SEGMENTS.length; i += 36) {
      const p = SEGMENTS[i];
      if (factoryTipAt(p.start / TRACK_LENGTH, TRACK_LENGTH, 3)) continue;
      for (const side of [-1, 1]) {
        const off = (p.halfWidth - 1) * side;
        w.box(p.x + p.nx * off, (p.y - 8) / 2, p.z + p.nz * off, 1.2, p.y + 8, 1.2, palette.wall);
      }
    }
  return {
    update(seconds, cars = []) {
      machinery?.update(seconds, cars);
      interior?.update(seconds, w.camera);
      steam?.update(seconds);
      for (const surface of animated) {
        surface.time.value = seconds;
        if (surface.streams) surface.streams.time.value = seconds;
        if (surface.index !== undefined) {
          surface.direction.value = surface.side * beltDirection(seconds, surface.index);
          surface.travel.value = surface.side * beltTravel(seconds, surface.index);
        }
      }
      for (const { g, index, layer } of tables) g.rotation.y = -rotorAngle(seconds, index, layer);
    },
  };
}
