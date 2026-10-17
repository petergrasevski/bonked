import * as THREE from 'three';
import { buildVolcanoBoundaryBushes } from './volcano-bushes.js';
import { buildVolcanoStreams } from './volcano-streams.js';
import { trackAt, getLandscape, OBSTACLES } from '../shared/game.js';

// World-space stone detail stays the same size on the mountain and small props.
// It survives static geometry merging without stretching or texture seams.
export function volcanicStoneMaterial(color, { glass = false, mountain = false } = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: glass ? 0.25 : 0.94,
    metalness: glass ? 0.32 : 0.025,
    side: THREE.DoubleSide,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 volcanicPoint;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvolcanicPoint=(modelMatrix*vec4(position,1.)).xyz;',
    );
    shader.fragmentShader =
      `varying vec3 volcanicPoint;
      float rockHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float rockNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(rockHash(i),rockHash(i+vec3(1,0,0)),f.x),mix(rockHash(i+vec3(0,1,0)),rockHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(rockHash(i+vec3(0,0,1)),rockHash(i+vec3(1,0,1)),f.x),mix(rockHash(i+vec3(0,1,1)),rockHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      vec3 rp=volcanicPoint;
      float broad=rockNoise(rp*.045),grain=rockNoise(rp*2.5);
      float strata=sin(rp.y*.43+rockNoise(rp*.075)*8.);
      float fracture=1.-smoothstep(.018,.075,abs(rockNoise(rp*.38)-.5));
      vec3 basalt=mix(vec3(.18,.16,.19),vec3(.66,.35,.23),smoothstep(.28,.75,broad));
      diffuseColor.rgb=mix(diffuseColor.rgb,basalt,${mountain ? '.52' : '.18'})*(.77+grain*.34)*(1.-fracture*.26);
      diffuseColor.rgb*=.91+.09*smoothstep(-.3,.3,strata);
      float ash=smoothstep(.60,.83,rockNoise(rp*.14+13.))*smoothstep(200.,315.,rp.y);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.48,.43,.42),ash*.27);
    `,
    );
    if (!glass)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal=normalize(normal+vec3(dFdx(grain),dFdy(grain),0.)*.22);',
      );
  };
  m.customProgramCacheKey = () => `volcanic-stone-v2-${glass}-${mountain}`;
  return m;
}

export function buildVolcanoScenery(w, animatedSurface) {
  buildVolcanoBoundaryBushes(w);
  const landscape = getLandscape(),
    surface = landscape.surface,
    stone = volcanicStoneMaterial(0x6e483d),
    dark = volcanicStoneMaterial(0x343139),
    glass = volcanicStoneMaterial(0x28232d, { glass: true }),
    sulfur = w.mat(0xc7ae54),
    ochre = w.mat(0x99733e),
    wood = w.mat(0x322c30);
  for (const vertices of landscape.volcano) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    const mesh = w.mesh(geo, volcanicStoneMaterial(0x85513f, { mountain: true }));
    mesh.material.userData.skipBakedShadow = true;
  }
  const rockGeo = new THREE.DodecahedronGeometry(1, 0),
    columnGeo = new THREE.CylinderGeometry(0.8, 1, 1, 6),
    shardGeo = new THREE.ConeGeometry(1, 1, 4);
  const rock = (x, y, z, sx, sy, sz, mat = stone, angle = 0) => {
    const m = w.mesh(rockGeo.clone(), mat, x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.set(angle * 0.13, angle, angle * 0.07);
    return m;
  };
  // Interior talus fans and clusters of cooling hexagonal basalt columns.
  for (let i = 0; i < 180; i++) {
    const a = i * 2.39996323,
      radius = 76 + ((i * 73) % 131),
      x = Math.cos(a) * radius,
      z = Math.sin(a) * radius,
      hit = surface.sample(x, z);
    if (!hit || hit.y < 185) continue;
    const s = 1.4 + ((i * 17) % 47) / 11;
    rock(
      x,
      hit.y + s * 0.22,
      z,
      s * (1 + (i % 3) * 0.25),
      s * (0.6 + (i % 4) * 0.17),
      s * 0.8,
      i % 3 ? stone : dark,
      a,
    );
  }
  for (let i = 0; i < 52; i++) {
    const p = trackAt((i * 0.61803398875 + 0.023) % 1),
      offset = p.halfWidth + 11 + (i % 4) * 5,
      x = p.x + p.nx * offset,
      z = p.z + p.nz * offset,
      hit = surface.sample(x, z);
    if (!hit) continue;
    const kind = i % 5,
      base = hit.y - 0.3,
      first = w.static.children.length;
    if (kind === 0) {
      // Organ-pipe formations: stepped, split columns with mineral-dark joints.
      for (let j = 0; j < 9; j++) {
        const a = j * 2.399,
          r = j === 0 ? 0 : 1.1 + Math.floor(j / 4) * 1.2,
          cx = x + Math.cos(a) * r,
          cz = z + Math.sin(a) * r,
          h = 3 + ((j * 7 + i) % 8),
          ground = surface.sample(cx, cz)?.y ?? base;
        const m = w.mesh(columnGeo.clone(), j % 3 ? dark : stone, cx, ground + h * 0.5 - 0.2, cz);
        m.scale.set(1, h, 1);
        m.rotation.y = i * 0.8;
        for (const u of [0.3, 0.65]) {
          const seam = w.cylinder(cx, ground + h * u, cz, 0.85, 0.86, 0.06, 0x222026, 6);
          seam.rotation.y = i * 0.8;
        }
      }
    } else if (kind === 1) {
      // Fumaroles have an open dark throat, sulfur lips and a broken rubble skirt.
      const h = 2.4 + (i % 3);
      w.cylinder(x, base + h * 0.5, z, 0.75, 1.7, h, dark, 9);
      const rim = w.mesh(new THREE.TorusGeometry(0.64, 0.22, 4, 9), sulfur, x, base + h, z);
      rim.rotation.x = Math.PI / 2;
      w.cylinder(x, base + h - 0.14, z, 0.48, 0.5, 0.05, 0x17151b, 10);
      for (let j = 0; j < 8; j++) {
        const a = (j * Math.PI) / 4;
        rock(
          x + Math.cos(a) * 1.7,
          base + 0.2,
          z + Math.sin(a) * 1.7,
          0.65,
          0.32,
          0.72,
          j % 3 ? ochre : sulfur,
          a,
        );
      }
    } else if (kind === 2) {
      // Glassy obsidian splinters catch the low evening light.
      for (let j = 0; j < 7; j++) {
        const a = j * 2.399,
          h = 1.5 + ((j * 3 + i) % 5),
          m = w.mesh(
            shardGeo.clone(),
            glass,
            x + Math.cos(a) * (j % 3),
            base + h * 0.4,
            z + Math.sin(a) * (j % 3),
          );
        m.scale.set(0.65, h, 0.45);
        m.rotation.set(0.16 * Math.sin(a), a, 0.25 * Math.cos(a));
      }
    } else if (kind === 3) {
      // Bleached ochre crusts contrast against the otherwise dark cinder slope.
      for (let j = 0; j < 12; j++) {
        const a = j * 2.399,
          r = 1 + Math.sqrt(j) * 0.75,
          cx = x + Math.cos(a) * r,
          cz = z + Math.sin(a) * r,
          ground = surface.sample(cx, cz)?.y ?? base;
        rock(
          cx,
          ground + 0.08,
          cz,
          0.8 + (j % 3) * 0.6,
          0.12,
          0.6 + (j % 2),
          j % 3 ? sulfur : ochre,
          a,
        );
      }
    } else {
      const trunk = w.cylinder(x, base + 2.5, z, 0.19, 0.48, 5, wood, 7);
      trunk.rotation.z = 0.13;
      for (let j = 0; j < 3; j++) {
        const a = j * 2.399 + i,
          branch = w.cylinder(
            x + Math.cos(a) * 0.6,
            base + 2.8 + j * 0.55,
            z + Math.sin(a) * 0.6,
            0.05,
            0.16,
            1.9,
            wood,
            5,
          );
        branch.rotation.set(Math.sin(a) * 0.8, 0, Math.cos(a) * 0.8);
      }
      for (let j = 0; j < 5; j++)
        rock(x + Math.sin(j * 7) * 2, base + 0.2, z + Math.cos(j * 7) * 2, 0.5, 0.28, 0.5, dark, j);
    }
    for (const mesh of w.static.children.slice(first))
      mesh.userData.sceneryKind = [
        'basalt-columns',
        'fumarole',
        'obsidian',
        'sulfur-crust',
        'charred-tree',
      ][kind];
  }
  columnGeo.dispose();
  shardGeo.dispose();
  const streams = buildVolcanoStreams(w, surface, trackAt);
  for (const o of OBSTACLES) {
    if (o.kind !== 'basalt') continue;
    rock(o.x, o.y + o.radius * 0.7, o.z, o.radius, o.radius * 1.2, o.radius * 0.9, stone, o.angle);
  }
  const crater = animatedSurface(0xff561c, 'lava');
  w.cylinder(0, 307.1, 0, 42, 42, 0.3, crater.material, 64);
  // Broken crater teeth replace the smooth artificial torus silhouette.
  for (let i = 0; i < 90; i++) {
    const a = (i * Math.PI * 2) / 90,
      r = 54 + Math.sin(i * 2.7) * 3,
      x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    rock(x, 325 + Math.sin(i * 1.9) * 3, z, 3.8, 3 + (i % 4), 3, dark, a);
  }
  rockGeo.dispose();
  return { ...crater, streams };
}
