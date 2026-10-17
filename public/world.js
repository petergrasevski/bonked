import { ScorePopups } from './score-popups.js';
import { sweepTrackWalls } from '/shared/weapon-geometry.js';
import { buildCatCafe } from './cat-cafe.js';
import { arenaOverview } from '/shared/arena.js';
import { HeatOverlay } from './heat-overlay.js';
import {
  createWheelHeatMaterial,
  createWheelHeatFlames,
  updateWheelHeatFlames,
} from './wheel-heat.js';
import {
  CIRCUIT_PALETTES,
  circuitRoadMaterial,
  circuitGroundMaterial,
  buildExtraCircuit,
} from './extra-circuits.js';
import { isCoastalBeach } from '/shared/coastal-barriers.js';
import { SceneMaterials } from './scene-materials.js';
import { StaticShadows } from './static-shadows.js';
import { DistanceFade, sceneRange } from './scene-distance.js';
import { spatialPieces, prepareSceneryLOD, updateSceneryLOD } from './scenery-lod.js';
import { AdaptiveResolution } from './adaptive-resolution.js';
import { yieldToLobby } from './circuit-loading.js';
import { WeaponEffects, createWeaponShieldMaterial } from './weapon-effects.js';
import { createCoastalSandMaterial } from './sand-surface.js';
import { updateCarVisuals } from './car-animation.js';
import { weatherSurface } from './surface-detail.js';
import { buildLandscapeBackdrop } from './landscape-backdrop.js';
import { buildSceneryDetails } from './scenery-details.js';
import { createTyreTracks } from './tyre-tracks.js';
import { createCarShadows } from './car-shadows.js';
import { createNudgeEffects } from './nudge-effects.js';
import { createEliminationLine } from './elimination-line.js';
import { SkyBeamView } from './sky-beam.js';
import { skySurfaces } from '/shared/sky-ground.js';
import { rolloverLift } from '/shared/rollover.js';
import { buildCoastalCrabs, updateCoastalCrabs } from './coastal-crabs.js';
import { boostExhaustStrength } from '/shared/boost-pads.js';
import { buildBoostPads } from './boost-pads.js';
import { createPickupGround } from './pickup-ground.js';
import { buildDetailedScenery, buildDetailedBiome, detailedPalm, detailedRock } from './scenery.js';
import { createSnowMaterial } from './snow-surface.js';
import { buildIceShelf } from './ice-shelf.js';
import { createIceMaterial } from './ice-surface.js';
import { buildGlacierValley, updateGlacierValley } from './glacier-valley.js';
import { buildTrackBarrier } from './track-barriers.js';
import { buildDesertScenery } from './desert-scenery.js';
import { buildDesertMoles, updateDesertMoles } from './desert-moles.js';
import { createDesertMaterial } from './desert-surface.js';
import { createAtmosphere } from './atmosphere.js';
import { createGustTrails } from './desert-storm.js';
import { createCoastalWater } from './water.js';
import { projectilePose } from './projectile-motion.js';
import * as THREE from 'three';
import { createFlamethrower, createFlamethrowerMaterial } from './flamethrower.js';
import { syncCarWeapon } from './car-weapons.js';
import { buildLandmarks, animateLandmarks, LANDMARKS } from './landmarks.js';
import { createPickupModel, PICKUP_COLORS } from './pickups.js';
import { WEAPON_IDS } from '/shared/combat.js';
import { createSportsCar, disposeCarInstance } from './car-model.js';
import { mergeGeometries } from '/vendor/BufferGeometryUtils.js';
import {
  iceSplit,
  activeTrack,
  TRACK,
  SEGMENTS,
  ROAD_WIDTH,
  trackAt,
  angleDelta,
  COLORS,
  TRACK_LENGTH,
  START_FRACTION,
  PICKUP_LOCATIONS,
  spawnCar,
  MAX_PLAYERS,
  hasBarrier,
  damageLevel,
  damageSeverity,
  CAR_LENGTH,
  CAR_WIDTH,
  SURFACE_HALF_WIDTH,
  nearestTrack,
  collideCars,
  OBSTACLES,
} from '/shared/game.js';
import { cameraFrame, createChase } from '/shared/chase.js';
import { factoryTipAt } from '/shared/extra-circuits.js';
import { CAMERA_FOV, stepCamera, stepPersonalCamera, cameraPose } from '/shared/camera.js';
const C = {
  asphalt: 0x394951,
  sand: 0x938d7c,
  cliff: 0x777568,
  cream: 0xc8c6b7,
  coral: 0xae6654,
  navy: 0x263941,
  teal: 0x497475,
  lime: 0xcbd3db,
};
export class World {
  constructor(container, { preview = false, deferred = false } = {}) {
    this.trackId = activeTrack.id;
    this.cameraView = 'shared';
    this.previewOnly = preview;
    this.distanceCulledScenery = [];
    this.distanceFade = new DistanceFade();
    this.sceneMaterials = new SceneMaterials();
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8094a3);
    this.weaponEffects = new WeaponEffects(this.scene);
    this.scorePopups = new ScorePopups(this.scene);
    this.tyreTracks = createTyreTracks();
    this.scene.add(this.tyreTracks.mesh);
    this.carShadows = createCarShadows();
    this.scene.add(this.carShadows.mesh);
    this.nudgeEffects = createNudgeEffects(MAX_PLAYERS);
    this.scene.add(this.nudgeEffects.group);
    skySurfaces();
    this.skyView = new SkyBeamView(this.scene);
    this.skyMove = { x: 0, y: 0 };
    this.skyAim = null;
    this.scene.fog = new THREE.FogExp2(0x8094a3, 0.0045);
    this.renderer = new THREE.WebGLRenderer({
      antialias: preview,
      powerPreference: 'high-performance',
      alpha: false,
    });
    let graphicsStorage;
    try {
      graphicsStorage = localStorage;
    } catch {}
    if (!preview)
      this.resolution = new AdaptiveResolution({
        pixelRatio: devicePixelRatio,
        width: container.clientWidth,
        height: container.clientHeight,
        trackId: this.trackId,
        storage: graphicsStorage,
        onChange: (ratio) => this.renderer.setPixelRatio(ratio),
      });
    this.renderer.info.autoReset = false;
    this.renderer.setPixelRatio(this.resolution?.ratio || 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    if (activeTrack.id === 'volcano') this.heatOverlay = new HeatOverlay(container);
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.2, 1600);
    this.camera.position.set(0, 90, 64);
    this.camera.lookAt(0, 0, 0);
    this.atmosphere = createAtmosphere(this.renderer, this.scene, activeTrack.id);
    this.sun = this.atmosphere.sun;
    this.environment = this.atmosphere.environment;
    this.gustTrails = activeTrack.id === 'desert' ? createGustTrails(MAX_PLAYERS) : null;
    if (this.gustTrails) this.scene.add(this.gustTrails.mesh);
    this.materials = new Map();
    this.textures = new Map();
    this.static = new THREE.Group();
    this.scene.add(this.static);
    this.cars = new Map();
    this.boxes = [];
    this.rockets = new Map();
    this.frame = 0;
    this.mines = new Map();
    this.chains = new Map();
    this.particles = [];
    this.particleClock = 0;
    this.previewCars = [];
    if (!deferred) {
      for (const [, build] of this.buildStages()) build();
      this.finishBuild();
      if (!preview) this.renderer.compile(this.scene, this.camera);
    }
  }
  *buildStages() {
    if (this.trackId === 'cafe') {
      yield [
        'Building Cat Café',
        () => {
          buildCatCafe(this);
          this.landmarks = [];
          this.waterMaterial = { uniforms: { time: { value: 0 } } };
        },
      ];
      yield [
        'Preparing arena objects',
        () => {
          this.buildPickups();
          this.buildEliminationLine();
          this.buildParticles();
        },
      ];
      yield [
        'Preparing cars',
        () => {
          this.previewCars = COLORS.slice(0, 2).map((color) => {
            const mesh = this.createCar(color);
            this.scene.add(mesh);
            return mesh;
          });
        },
      ];
      return;
    }

    yield ['Building road', () => this.buildTrack()];
    yield [
      'Building terrain',
      () => {
        if (activeTrack.id === 'coast') this.buildScenery();
        else this.buildBiome();
      },
    ];
    yield [
      'Adding landmarks',
      () => {
        this.landmarks = activeTrack.id === 'coast' ? buildLandmarks(this) : [];
      },
    ];
    yield [
      'Adding circuit details',
      () => {
        if (activeTrack.id === 'coast') this.coastalCrabs = buildCoastalCrabs(this.scene);
        if (activeTrack.id === 'ice') this.valley = buildGlacierValley(this);
        if (activeTrack.id === 'desert') {
          buildDesertScenery(this);
          this.desertMoles = buildDesertMoles(this);
        }
      },
    ];
    yield [
      'Adding scenery',
      () => {
        this.sceneryDetails = CIRCUIT_PALETTES[activeTrack.id]
          ? { group: new THREE.Group() }
          : buildSceneryDetails(this);
        this.mergeStatic();
        this.distanceCulledScenery.push(...this.sceneryDetails.group.children);
        for (const mesh of this.sceneryDetails.group.children) prepareSceneryLOD(mesh);
      },
    ];
    yield [
      'Preparing environment',
      () => {
        this.buildWater();
        this.landscapeBackdrop = buildLandscapeBackdrop(this.scene, activeTrack.id);
      },
    ];
    yield [
      'Preparing race objects',
      () => {
        this.buildPickups();
        this.buildEliminationLine();
        this.buildParticles();
        this.boostPads = buildBoostPads(this.scene);
      },
    ];
    yield [
      'Preparing cars',
      () => {
        this.previewCars = COLORS.slice(0, 2).map((color) => {
          const mesh = this.createCar(color);
          this.scene.add(mesh);
          return mesh;
        });
      },
    ];
    yield [
      'Caching scenery shadows',
      () => {
        this.staticShadows = new StaticShadows(
          this.renderer,
          this.distanceCulledScenery,
          this.atmosphere.profile.sunOffset,
        );
        this.staticShadows.apply(this.scene);
        this.distanceFade.apply(this.scene);
      },
    ];
  }
  finishBuild() {
    if (this.previewOnly) this.renderer.setSize(320, 320);
    else {
      this.resize();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.container);
    }
  }
  static async load(container, { current = () => true, progress = () => {} } = {}) {
    let world;
    const check = () => {
      if (!current()) throw new Error('Circuit selection changed');
    };
    try {
      check();
      world = new World(container, { deferred: true });
      for (const [stage, build] of world.buildStages()) {
        progress(stage);
        await yieldToLobby();
        check();
        build();
      }
      world.finishBuild();
      progress('Preparing graphics');
      await yieldToLobby();
      check();
      if (world.renderer.compileAsync) await world.renderer.compileAsync(world.scene, world.camera);
      else world.renderer.compile(world.scene, world.camera);
      check();
      return world;
    } catch (error) {
      world?.dispose();
      throw error;
    }
  }

  roadMaterial(kind) {
    if (CIRCUIT_PALETTES[activeTrack.id])
      return (this.extraRoadMaterial ??= circuitRoadMaterial(this, activeTrack.id));
    if (kind === 'sand' && activeTrack.id === 'coast') {
      if (!this.materials.has('coastal-sand'))
        this.materials.set('coastal-sand', createCoastalSandMaterial());
      return this.materials.get('coastal-sand');
    }
    if (kind === 'ice') return (this.iceRoadMaterial ??= createIceMaterial());
    if (kind === 'sand' && activeTrack.id === 'desert')
      return (this.desertRoadMaterial ??= createDesertMaterial(false));
    const ice = kind === 'ice';
    return new THREE.MeshPhysicalMaterial({
      map: this.texture(kind),
      color: ice ? 0xb5e9f7 : kind === 'sand' ? 0xe4bd88 : 0xaab7c4,
      bumpMap: this.texture('micro'),
      bumpScale: ice ? 0.025 : kind === 'sand' ? 0.07 : 0.025,
      roughnessMap: this.texture('roughness'),
      roughness: ice ? 0.28 : kind === 'sand' ? 0.95 : 0.72,
      metalness: ice ? 0.08 : 0.02,
      clearcoat: ice ? 0.85 : 0.12,
      clearcoatRoughness: ice ? 0.14 : 0.4,
      envMapIntensity: ice ? 1.4 : 0.65,
      side: THREE.DoubleSide,
    });
  }
  texture(kind) {
    if (this.textures.has(kind)) return this.textures.get(kind);
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    let seed = 731;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    if (kind === 'micro' || kind === 'roughness') {
      const data = ctx.createImageData(512, 512);
      for (let i = 0; i < data.data.length; i += 4) {
        const v =
          kind === 'micro' ? 100 + Math.floor(random() * 55) : 145 + Math.floor(random() * 100);
        data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
        data.data[i + 3] = 255;
      }
      ctx.putImageData(data, 0, 0);
    } else if (kind === 'glow') {
      const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.25, '#ffffffaa');
      grad.addColorStop(0.6, '#ffffff35');
      grad.addColorStop(1, '#ffffff00');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);
    } else {
      ctx.fillStyle =
        kind === 'ice'
          ? '#d5eff5'
          : kind === 'sand'
            ? '#c6a66f'
            : kind === 'asphalt'
              ? '#737a7f'
              : '#c5c2b8';
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 50; i++) {
        const x = random() * 512,
          y = random() * 512,
          r = 15 + random() * 110,
          grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, i % 2 ? '#10191d0d' : '#eff5f00a');
        grad.addColorStop(1, '#00000000');
        ctx.fillStyle = grad;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 26000; i++) {
        ctx.fillStyle = i % 2 ? '#eef0e51a' : '#10192329';
        const size = 1 + random() * 2;
        ctx.fillRect(random() * 512, random() * 512, size, size);
      }
      for (let i = 0; i < (kind === 'sand' ? 0 : kind === 'asphalt' ? 10 : 24); i++) {
        let x = random() * 512,
          y = random() * 512;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let j = 0; j < 5; j++) {
          x += (random() - 0.4) * 15;
          y += random() * 18;
          ctx.lineTo(x, y);
        }
        ctx.lineWidth = kind === 'asphalt' ? 0.8 : 1.2;
        ctx.strokeStyle = '#18212430';
        ctx.stroke();
      }
      if (kind === 'ice') {
        for (let i = 0; i < 12; i++) {
          let x = random() * 512,
            y = random() * 512;
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let j = 0; j < 8; j++) {
            x += (random() - 0.35) * 40;
            y += (random() - 0.2) * 35;
            ctx.lineTo(x, y);
          }
          ctx.strokeStyle = '#24698545';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.strokeStyle = '#eeffffb0';
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
        for (let i = 0; i < 120; i++) {
          ctx.fillStyle = '#f2ffff44';
          ctx.beginPath();
          ctx.ellipse(
            random() * 512,
            random() * 512,
            2 + random() * 7,
            1 + random() * 2,
            random() * 6,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
      if (kind === 'sand') {
        for (let i = 0; i < 1800; i++) {
          const x = random() * 512,
            y = random() * 512;
          ctx.fillStyle = i % 2 ? '#6f543a55' : '#ffe2a666';
          ctx.beginPath();
          ctx.ellipse(x, y, 1 + random() * 2, 0.5 + random(), random() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (kind === 'asphalt') {
        ctx.strokeStyle = '#10191d10';
        ctx.lineWidth = 5;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(random() * 512, 0);
          ctx.bezierCurveTo(random() * 512, 150, random() * 512, 350, random() * 512, 512);
          ctx.stroke();
        }
      }
    }
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = ['micro', 'roughness'].includes(kind)
      ? THREE.NoColorSpace
      : THREE.SRGBColorSpace;
    if (kind !== 'glow') texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.textures.set(kind, texture);
    return texture;
  }
  mat(color, roughness = 0.8, metalness = 0) {
    const key = `${color}-${roughness}-${metalness}`;
    if (!this.materials.has(key)) {
      const weathered = [
        C.cliff,
        C.sand,
        C.cream,
        C.coral,
        C.teal,
        0xa66542,
        0xe6b478,
        0xb97c51,
        0xd79760,
        0xaa7752,
      ].includes(color);
      this.materials.set(
        key,
        activeTrack.id === 'ice' && [0xe0eff2, 0xe1f4fa, 0xd3e5ed, 0xe8f5fa].includes(color)
          ? createSnowMaterial(color)
          : new THREE.MeshStandardMaterial({
              color,
              roughness,
              metalness,
              map: weathered ? this.texture('concrete') : null,
              bumpMap: weathered ? this.texture('micro') : null,
              bumpScale: weathered ? 0.1 : 0,
              envMapIntensity: 0.75,
            }),
      );
      if (weathered)
        weatherSurface(this.materials.get(key), {
          rock: color === C.cliff || [0xa66542, 0xb97c51, 0xaa7752].includes(color),
        });
    }
    return this.materials.get(key);
  }
  mesh(geometry, color, x = 0, y = 0, z = 0, parent = this.static) {
    if (!geometry.attributes.uv) {
      const p = geometry.attributes.position,
        uv = [];
      for (let i = 0; i < p.count; i++) uv.push((p.getX(i) + p.getZ(i)) / 5, p.getY(i) / 3);
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    }
    const mesh = new THREE.Mesh(geometry, typeof color === 'object' ? color : this.mat(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  box(x, y, z, w, h, d, color, parent = this.static) {
    return this.mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, parent);
  }
  cylinder(x, y, z, r1, r2, h, color, n = 8, parent = this.static) {
    return this.mesh(new THREE.CylinderGeometry(r1, r2, h, n), color, x, y, z, parent);
  }
  ribbon(offset, width, y, color, skip = 0, protectedOnly = false) {
    const vertices = [],
      uv = [];
    for (let i = 0; i < TRACK.length; i++) {
      if (skip && Math.floor(i / skip) % 2) continue;
      if (protectedOnly === true && !hasBarrier(SEGMENTS[i].start / TRACK_LENGTH)) continue;
      if (protectedOnly === 'exposed' && hasBarrier(SEGMENTS[i].start / TRACK_LENGTH)) continue;
      const a = SEGMENTS[i],
        b = SEGMENTS[(i + 1) % TRACK.length];
      const ao = typeof offset === 'function' ? offset(a) : offset,
        bo = typeof offset === 'function' ? offset(b) : offset,
        aw = typeof width === 'function' ? width(a) : width,
        bw = typeof width === 'function' ? width(b) : width;
      const ag = iceSplit(a.x),
        bg = iceSplit(b.x),
        ranges = ag || bg ? [-1, 1] : [0];
      for (const side of ranges) {
        const al = side === 1 ? Math.max(ao - aw / 2, ag) : ao - aw / 2,
          ar = side === -1 ? Math.min(ao + aw / 2, -ag) : ao + aw / 2;
        const bl = side === 1 ? Math.max(bo - bw / 2, bg) : bo - bw / 2,
          br = side === -1 ? Math.min(bo + bw / 2, -bg) : bo + bw / 2;
        if (ar <= al && br <= bl) continue;
        const tip =
          activeTrack.id === 'factory' &&
          factoryTipAt((a.start + a.len * 0.5) / TRACK_LENGTH, TRACK_LENGTH);
        if (tip && ar <= 0 && br <= 0) continue;
        const l0 = tip ? Math.max(0, al) : al,
          r0 = Math.max(l0, ar),
          l1 = tip ? Math.max(0, bl) : bl,
          r1 = Math.max(l1, br);
        const p = [
          [a.x + a.nx * l0, y + a.y, a.z + a.nz * l0],
          [a.x + a.nx * r0, y + a.y, a.z + a.nz * r0],
          [b.x + b.nx * l1, y + b.y, b.z + b.nz * l1],
          [b.x + b.nx * r1, y + b.y, b.z + b.nz * r1],
        ];
        for (const j of [0, 1, 2, 1, 3, 2]) {
          vertices.push(...p[j]);
          uv.push(p[j][0] / 10, p[j][2] / 10);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return this.mesh(geo, color);
  }
  buildTrack() {
    // A narrow raised causeway, with water on both sides. No invisible grass
    // runoff: the top surface ends at the same edge used by the simulation.
    this.ribbon(
      0,
      (p) => (p.halfWidth + 0.6) * 2,
      -0.18,
      activeTrack.id === 'ice' ? 0x91c5d8 : C.sand,
    );
    if (activeTrack.id === 'ice') buildIceShelf(this);
    else
      for (const side of [-1, 1]) {
        const vertices = [];
        for (let i = 0; i < SEGMENTS.length; i++) {
          const p = SEGMENTS[i],
            q = SEGMENTS[(i + 1) % SEGMENTS.length],
            off = side * (p.halfWidth + 0.6),
            offQ = side * (q.halfWidth + 0.6);
          if (
            activeTrack.id === 'factory' &&
            side < 0 &&
            factoryTipAt((p.start + p.len * 0.5) / TRACK_LENGTH, TRACK_LENGTH)
          )
            continue;
          if (activeTrack.id === 'coast' && isCoastalBeach((p.start + p.len * 0.5) / TRACK_LENGTH))
            continue;
          const points = [
            [p.x + p.nx * off, p.y - 0.18, p.z + p.nz * off],
            [q.x + q.nx * offQ, q.y - 0.18, q.z + q.nz * offQ],
            [p.x + p.nx * off, p.y - 2, p.z + p.nz * off],
            [q.x + q.nx * offQ, q.y - 2, q.z + q.nz * offQ],
          ];
          for (const j of [0, 1, 2, 1, 3, 2]) vertices.push(...points[j]);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.computeVertexNormals();
        const mat = this.mat(CIRCUIT_PALETTES[activeTrack.id]?.wall ?? C.cliff);
        mat.side = THREE.DoubleSide;
        this.mesh(geo, mat);
      }
    this.ribbon(
      0,
      (p) => p.halfWidth * 2 + 0.8,
      -0.05,
      activeTrack.id === 'ice' ? 0xb8e2ec : activeTrack.id === 'volcano' ? 0x653629 : 0x797d6c,
    );
    this.ribbon(
      0,
      (p) => p.halfWidth * 2,
      0.01,
      this.roadMaterial(
        activeTrack.id === 'ice' ? 'ice' : activeTrack.id === 'desert' ? 'sand' : 'asphalt',
      ),
      0,
      true,
    );
    this.ribbon(
      0,
      (p) => (p.halfWidth + 0.6) * 2,
      0.01,
      this.roadMaterial(activeTrack.id === 'ice' ? 'ice' : 'sand'),
      0,
      'exposed',
    );
    if (activeTrack.id === 'ice') this.buildSplitEdges();
    for (const side of [-1, 1]) {
      // Unprotected sections are bare sand; paint and curbs belong to guarded asphalt.
      if (activeTrack.id === 'coast') {
        this.ribbon((p) => side * (p.halfWidth - 0.18), 0.28, 0.045, 0xffce32, 0, true);
        this.ribbon((p) => side * (p.halfWidth + 0.16), 0.55, 0.06, C.cream, 0, true);
        this.ribbon((p) => side * (p.halfWidth + 0.16), 0.55, 0.065, C.coral, 3, true);
      }
      if (activeTrack.id === 'desert')
        this.ribbon((p) => side * (p.halfWidth - 0.25), 0.18, 0.065, 0xf0d6a8, 0, 'exposed');
      for (let i = 0; i < TRACK.length; i += 2) {
        const p = SEGMENTS[i],
          q = SEGMENTS[(i + 2) % TRACK.length];
        if (!hasBarrier(p.start / TRACK_LENGTH, side)) continue;
        const x = p.x + p.nx * (p.halfWidth + 0.28) * side,
          z = p.z + p.nz * (p.halfWidth + 0.28) * side,
          ex = q.x + q.nx * (q.halfWidth + 0.28) * side,
          ez = q.z + q.nz * (q.halfWidth + 0.28) * side;
        const length = Math.hypot(ex - x, ez - z),
          angle = -Math.atan2(ez - z, ex - x);
        if (activeTrack.id !== 'coast') {
          buildTrackBarrier(this, activeTrack.id, { x, y: p.y, z }, { x: ex, y: q.y, z: ez }, i);
          continue;
        }
        const wall = this.box(
          (x + ex) / 2,
          (p.y + q.y) / 2 + 0.64,
          (z + ez) / 2,
          length + 0.04,
          1.25,
          0.56,
          Math.floor(i / 8) % 2 ? 0xc9c9bb : 0xb7382b,
        );
        wall.rotation.y = angle;
        const cap = this.box(
          (x + ex) / 2,
          (p.y + q.y) / 2 + 1.34,
          (z + ez) / 2,
          length + 0.04,
          0.16,
          0.68,
          0x27343d,
        );
        cap.rotation.y = angle;
        if (
          !hasBarrier(SEGMENTS[(i + TRACK.length - 2) % TRACK.length].start / TRACK_LENGTH, side) ||
          !hasBarrier(q.start / TRACK_LENGTH, side)
        ) {
          const post = this.box(x, p.y + 1.1, z, 0.75, 2.2, 0.75, 0xffce32);
          post.rotation.y = angle;
          for (const y of [0.4, 1, 1.6]) {
            const stripe = this.box(x, p.y + y, z, 0.79, 0.23, 0.79, 0x151e25);
            stripe.rotation.y = angle;
          }
        }
      }
    }
    for (const o of OBSTACLES) {
      if (o.kind === 'cactus' || o.kind === 'basalt') continue;
      this.cylinder(o.x, 0.18, o.z, o.radius, o.radius, 0.36, 0x202b32, 20);
      this.cylinder(o.x, 0.72, o.z, o.radius * 0.93, o.radius * 0.98, 1.08, 0xeabf32, 20);
      this.cylinder(o.x, 0.87, o.z, o.radius * 0.95, o.radius * 0.95, 0.32, 0x1d2930, 20);
      this.cylinder(o.x, 1.4, o.z, o.radius * 0.85, o.radius * 0.93, 0.2, 0xeabf32, 20);
      for (const offset of [-0.6, 0.6]) {
        const stripe = this.box(
          o.x + Math.cos(trackAt(o.fraction).angle) * offset,
          1.51,
          o.z + Math.sin(trackAt(o.fraction).angle) * offset,
          0.35,
          0.025,
          2.25,
          0x18252d,
        );
        stripe.rotation.y = -trackAt(o.fraction).angle;
      }
      this.cylinder(o.x, 1.68, o.z, 0.13, 0.13, 0.48, 0xf18e23, 8);
    }
    if (activeTrack.id !== 'volcano') this.ribbon(0, 0.12, 0.06, 0xb6b89d, 5, true);
    const start = trackAt(START_FRACTION);
    const line = new THREE.Group();
    line.position.set(start.x, start.y + 0.075, start.z);
    line.rotation.y = -start.angle;
    this.static.add(line);
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 12; c++)
        this.box(
          (r - 0.5) * 0.7,
          0,
          (c - 5.5) * 0.9,
          0.7,
          0.02,
          0.9,
          (r + c) % 2 ? 0xf4efd4 : 0x1c2d34,
          line,
        );
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = trackAt(START_FRACTION - (6 + Math.floor(i / 2) * 5.5) / TRACK_LENGTH),
        g = new THREE.Group();
      g.position.set(
        p.x + p.nx * (i % 2 ? -2.3 : 2.3),
        p.y + 0.06,
        p.z + p.nz * (i % 2 ? -2.3 : 2.3),
      );
      g.rotation.y = -p.angle;
      this.static.add(g);
      this.box(-1.6, 0, 0, 0.12, 0.02, 2.4, 0xe2d9bc, g);
      this.box(0, 0, -1.2, 3.2, 0.02, 0.1, 0xe2d9bc, g);
      this.box(0, 0, 1.2, 3.2, 0.02, 0.1, 0xe2d9bc, g);
    }
    // Start-line gantry and its illuminated timing panel.
    const gantry = new THREE.Group();
    gantry.position.set(start.x, start.y, start.z);
    gantry.rotation.y = -start.angle;
    this.static.add(gantry);
    this.box(0, 3.2, -(start.halfWidth + 1.7), 0.6, 6.4, 0.6, C.navy, gantry);
    this.box(0, 3.2, start.halfWidth + 1.7, 0.6, 6.4, 0.6, C.navy, gantry);
    this.box(0, 6.3, 0, 0.65, 0.65, (start.halfWidth + 2) * 2, C.navy, gantry);
    this.box(0, 6.5, 0, 0.8, 1.2, 8, C.lime, gantry);
    for (let i = 0; i < 5; i++)
      this.box(0.46, 6.55, (i - 2) * 1.1, 0.05, 0.55, 0.55, 0x173b38, gantry);
    const banner = this.makeText('START', 512, 80, '#d4dce3', '#17313c', 52);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 1.5),
      new THREE.MeshBasicMaterial({ map: banner, side: THREE.DoubleSide }),
    );
    sign.position.set(-0.48, 6.5, 0);
    sign.rotation.y = -Math.PI / 2;
    gantry.add(sign);
    sign.userData.sceneryKind = 'start-sign';
  }
  buildSplitEdges() {
    for (let i = 0; i < SEGMENTS.length - 1; i++) {
      const a = SEGMENTS[i],
        b = SEGMENTS[i + 1],
        gap = iceSplit((a.x + b.x) / 2);
      if (gap <= 0) continue;
      const floor = this.box(
        (a.x + b.x) / 2,
        -3.7,
        (a.z + b.z) / 2,
        Math.hypot(b.x - a.x, b.z - a.z) + 0.04,
        0.05,
        gap * 2,
        0x123244,
      );
      floor.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    }
    for (const side of [-1, 1])
      for (let i = 0; i < SEGMENTS.length - 1; i += 2) {
        const a = SEGMENTS[i],
          b = SEGMENTS[(i + 2) % SEGMENTS.length],
          gap = iceSplit(a.x),
          next = iceSplit(b.x);
        if (gap < 0.02 || next < 0.02) continue;
        const x = a.x + a.nx * gap * side,
          z = a.z + a.nz * gap * side,
          ex = b.x + b.nx * next * side,
          ez = b.z + b.nz * next * side,
          length = Math.hypot(ex - x, ez - z),
          angle = -Math.atan2(ez - z, ex - x);
        const cliff = this.box(
          (x + ex) / 2,
          (a.y + b.y) / 2 - 2.3,
          (z + ez) / 2,
          length + 0.03,
          4.5,
          0.15,
          0x538d9f,
        );
        cliff.rotation.y = angle;
        const protectedEdge = hasBarrier(a.start / TRACK_LENGTH, side, true);
        const paint = this.box(
          (x + ex) / 2,
          (a.y + b.y) / 2 + 0.05,
          (z + ez) / 2,
          length + 0.03,
          0.035,
          0.2,
          protectedEdge ? 0xd8f4f8 : 0xf8cb59,
        );
        paint.rotation.y = angle;
        if (protectedEdge)
          buildTrackBarrier(this, 'ice', { x, y: a.y, z }, { x: ex, y: b.y, z: ez }, i);
      }
  }
  makeText(text, w, h, bg, fg, size) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    x.fillStyle = fg;
    x.font = `italic 900 ${size}px sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, w / 2, h / 2 + 3);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  palm(x, z, scale = 1, angle = 0) {
    return detailedPalm(this, x, z, scale, angle);
  }
  rock(x, z, size, color = C.cliff) {
    return detailedRock(this, x, z, size, color);
  }
  buildScenery() {
    buildDetailedScenery(this, LANDMARKS);
  }
  mergeStatic() {
    this.static.updateMatrixWorld(true);
    const groups = new Map();
    this.static.traverse((obj) => {
      if (!obj.isMesh) return;
      let geo = obj.geometry.clone().applyMatrix4(obj.matrixWorld);
      if (geo.index) geo = geo.toNonIndexed();
      if (!geo.attributes.uv)
        geo.setAttribute(
          'uv',
          new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2),
        );
      for (const key of Object.keys(geo.attributes))
        if (!['position', 'normal', 'uv'].includes(key)) geo.deleteAttribute(key);
      for (const piece of spatialPieces(geo)) {
        piece.computeBoundingBox();
        const center = piece.boundingBox.getCenter(new THREE.Vector3());
        const key = `${obj.material.uuid}:${Math.floor(center.x / 70)}:${Math.floor(center.z / 70)}`;
        if (!groups.has(key)) groups.set(key, { material: obj.material, geos: [] });
        groups.get(key).geos.push(piece);
      }
    });
    this.scene.remove(this.static);
    this.static.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
    for (const { material, geos } of groups.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), material);
      mesh.castShadow = true;
      mesh.receiveShadow = !material.userData.skipBakedShadow;
      mesh.geometry.computeBoundingSphere();
      this.distanceCulledScenery.push(mesh);
      this.scene.add(mesh);
      for (const geo of geos) geo.dispose();
    }
  }
  cullDistantScenery(camera) {
    // Extend only the large backdrop's useful range; small static props retain
    // their previous far-plane budget even when the island is in view.
    const e = camera.matrixWorld.elements,
      p = camera.position,
      far = camera === this.camera ? sceneRange(this.trackId, this.follow) : camera.far;
    for (const mesh of this.distanceCulledScenery) {
      updateSceneryLOD(mesh, camera);
      const { center: c, radius: r } = mesh.userData.lodBounds || mesh.geometry.boundingSphere;
      mesh.visible = -(c.x - p.x) * e[8] - (c.y - p.y) * e[9] - (c.z - p.z) * e[10] - r < far;
    }
    const within = (c, r) =>
      -(c.x - p.x) * e[8] - (c.y - p.y) * e[9] - (c.z - p.z) * e[10] - r < far;
    for (const g of this.boxes) g.visible = g.userData.available !== false && within(g.position, 6);
    for (const l of this.landmarks)
      l.mesh.visible = within(l.mesh.position, l.kind === 'lighthouse' ? 70 : 28);
  }
  buildBiome() {
    if (CIRCUIT_PALETTES[activeTrack.id]) this.extraCircuit = buildExtraCircuit(this);
    else buildDetailedBiome(this);
  }
  buildWater() {
    if (activeTrack.id !== 'coast') {
      this.waterMaterial = { uniforms: { time: { value: 0 } } };
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(6000, 6000),
        CIRCUIT_PALETTES[activeTrack.id]
          ? circuitGroundMaterial(this, activeTrack.id)
          : activeTrack.id === 'ice'
            ? this.mat(0xe0eff2)
            : createDesertMaterial(true),
      );
      if (activeTrack.id === 'desert') {
        ground.material.polygonOffset = true;
        ground.material.polygonOffsetFactor = 2;
        ground.material.polygonOffsetUnits = 4;
      }
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = activeTrack.id === 'factory' ? -8 : -4;
      ground.receiveShadow = true;
      this.scene.add(ground);
      return;
    }
    const ocean = createCoastalWater(
      TRACK,
      SEGMENTS,
      this.scene.fog,
      this.atmosphere.profile,
      this.coastalLandforms,
    );
    this.waterMaterial = ocean.waterMaterial;
    this.waterMaterial.uniforms.sceneFadeStart = this.distanceFade.start;
    this.waterMaterial.uniforms.sceneFadeEnd = this.distanceFade.end;
    ocean.shore.material.uniforms.sceneFadeStart = this.distanceFade.start;
    ocean.shore.material.uniforms.sceneFadeEnd = this.distanceFade.end;
    this.textures.set('coast-depth', ocean.depthTexture);
    this.scene.add(ocean.water, ocean.shore);
  }
  setPickupModel(g, kind) {
    if (g.userData.kind === kind) return;
    if (g.userData.model) g.remove(g.userData.model);
    const model = this.sceneMaterials.adopt(createPickupModel(kind), true);
    this.staticShadows?.apply(model);
    this.distanceFade.apply(model);
    g.add(model);
    g.userData.model = model;
    g.userData.kind = kind;
    g.userData.halo.material.color.setHex(PICKUP_COLORS[kind]);
    g.userData.ring.material.uniforms.color.value.setHex(PICKUP_COLORS[kind]);
    g.userData.beacon.material.color.setHex(PICKUP_COLORS[kind]);
  }
  buildPickups() {
    for (const [i, p] of PICKUP_LOCATIONS.entries()) {
      const g = new THREE.Group();
      g.position.set(p.x, p.y + 1.9, p.z);
      const { halo, ring } = createPickupGround(p, this.texture('glow'));
      g.add(halo, ring);
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(1.85, 1.85, 0.8, 24, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.2,
          side: THREE.DoubleSide,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      beacon.position.y = -1.3;
      g.add(beacon);
      g.userData = { halo, ring, beacon };
      this.setPickupModel(g, WEAPON_IDS[i % WEAPON_IDS.length]);
      this.scene.add(g);
      this.boxes.push(g);
    }
  }
  buildEliminationLine() {
    this.deadline = createEliminationLine();
    this.scene.add(this.deadline);
    this.deadline.visible = false;
  }
  followFrame(frame, dt, cars) {
    const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
    const f = (this.follow = frame.personalCar
        ? stepPersonalCamera(this.follow, frame.personalCar, dt)
        : frame.arenaOverview
          ? {
              ...frame,
              distance: Math.max(205, 95 / (Math.tan((CAMERA_FOV * Math.PI) / 360) * aspect)),
              far: Math.max(350, 95 / (Math.tan((CAMERA_FOV * Math.PI) / 360) * aspect) + 150),
            }
          : stepCamera(this.follow, frame, cars, aspect, dt, activeTrack.camera)),
      pose = cameraPose(f);
    if (frame.personalCar) {
      const c = frame.personalCar,
        origin = { x: c.x, y: (c.y || 0) + 2.2, z: c.z },
        delta = { x: pose.x - origin.x, y: pose.y - origin.y, z: pose.z - origin.z },
        hit = sweepTrackWalls(origin, delta, 0.4);
      if (hit !== null) {
        const t = Math.max(0.05, hit - 0.04);
        pose.x = origin.x + delta.x * t;
        pose.y = origin.y + delta.y * t;
        pose.z = origin.z + delta.z * t;
      }
    }
    // Avoid drawing scenery already hidden by weather; always retain the pack.
    const far = sceneRange(this.trackId, f);
    this.distanceFade.update(far);
    if (this.camera.aspect !== aspect || this.camera.far !== far) {
      this.camera.aspect = aspect;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.set(pose.x, pose.y, pose.z);
    this.camera.lookAt(pose.targetX, pose.targetY, pose.targetZ);
    this.camera.updateMatrixWorld();
    const [sx, sy, sz] = this.atmosphere.profile.sunOffset;
    this.sun.position.set(f.x + sx, (f.y || 0) + sy, f.z + sz);
    this.sun.target.position.set(f.x, f.y || 0, f.z);
    this.sun.target.updateMatrixWorld();
  }
  createCar(color) {
    const g = createSportsCar(color, { headlights: activeTrack.id === 'ice' }),
      { paint } = g.userData;
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 20, 12),
      createWeaponShieldMaterial(),
    );
    shield.position.y = 0.7;
    shield.scale.y = 0.65;
    shield.visible = false;
    g.add(shield);
    g.userData = {
      ...g.userData,
      shield,
      paint,
      baseColor: new THREE.Color(color),
      chassisSize: { length: CAR_LENGTH, width: CAR_WIDTH },
    };
    g.rotation.order = 'YXZ';
    const flame = createFlamethrower((this.flamethrowerMaterial ??= createFlamethrowerMaterial()));
    g.add(flame);
    g.userData.flame = flame;
    const exhaust = new THREE.Group();
    exhaust.visible = false;
    for (const side of [-1, 1]) {
      const jet = this.createFlame();
      jet.visible = true;
      jet.position.set(-2.36, 0.37, side * 0.5);
      jet.rotation.y = Math.PI;
      jet.scale.set(0.32, 0.13, 0.13);
      exhaust.add(jet);
    }
    g.add(exhaust);
    g.userData.boostExhaust = exhaust;
    if (activeTrack.id === 'volcano') {
      const heatFlames = createWheelHeatFlames(
        (this.heatFlameMaterial ??= createWheelHeatMaterial()),
      );
      g.add(heatFlames);
      g.userData.heatFlames = heatFlames;
    }
    this.sceneMaterials.adopt(g);
    this.staticShadows?.apply(g);
    this.distanceFade.apply(g);
    return g;
  }
  createFlame() {
    if (!this.flameMaterial)
      this.flameMaterial = new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `varying vec2 vUv;uniform float time;void main(){float x=vUv.x,y=vUv.y*2.-1.;float flicker=sin(x*28.-time*26.+sin(y*12.))*0.10+sin(x*53.-time*39.)*.05;float width=(.09+sqrt(x)*.66)*(1.-pow(x,5.));float edge=abs(y+sin(x*14.-time*19.)*x*.13);float a=1.-smoothstep(width*.6,width+flicker*.6,edge);a*=1.-smoothstep(.7,1.,x);float core=(1.-smoothstep(0.,width*.7,edge))*(1.-x*.65);vec3 col=mix(vec3(1.,.10,.005),vec3(1.,.78,.12),core);col=mix(col,vec3(1.,.97,.65),core*core*.85);gl_FragColor=vec4(col,a*.9);}`,
      });
    const g = new THREE.Group();
    g.visible = false;
    g.position.set(CAR_LENGTH / 2, 0.65, 0);
    for (const angle of [0, Math.PI / 2]) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(8.35, 4), this.flameMaterial);
      plane.position.x = 4.175;
      plane.rotation.x = angle;
      g.add(plane);
    }
    return g;
  }
  buildParticles() {
    this.particleMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({
        map: this.texture('glow'),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
      600,
    );
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.count = 0;
    this.scene.add(this.particleMesh);
    this.fireMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({
        map: this.texture('glow'),
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      600,
    );
    this.fireMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fireMesh.frustumCulled = false;
    this.fireMesh.count = 0;
    this.scene.add(this.fireMesh);
    this.particleDummy = new THREE.Object3D();
    this.particleColor = new THREE.Color();
  }
  particle(x, y, z, kind, vx = 0, vz = 0) {
    if (this.particles.length >= 600) return;
    const smoke = kind === 'smoke' || kind === 'steam';
    this.particles.push({
      x,
      y,
      z,
      vx: vx + (Math.random() - 0.5) * 1.4,
      vz: vz + (Math.random() - 0.5) * 1.4,
      vy: smoke ? 2 + Math.random() * 2 : 1 + Math.random() * 3,
      kind,
      life: smoke ? 0.8 + Math.random() * 0.8 : 0.25 + Math.random() * 0.4,
      max: smoke ? 1.6 : 0.65,
      size: smoke ? 0.16 + Math.random() * 0.22 : 0.25 + Math.random() * 0.45,
    });
  }
  updateParticles(dt) {
    let count = 0,
      fireCount = 0;
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.y += p.vy * dt;
      const fade = Math.min(1, p.life / 0.3),
        size = p.size * (p.kind !== 'fire' ? 1 + (p.max - p.life) * 1.4 : 1) * fade;
      this.particleDummy.position.set(p.x, p.y, p.z);
      this.particleDummy.scale.setScalar(size);
      this.particleDummy.quaternion.copy(this.camera.quaternion);
      this.particleDummy.updateMatrix();
      const mesh = p.kind !== 'fire' ? this.particleMesh : this.fireMesh,
        index = p.kind !== 'fire' ? count++ : fireCount++;
      mesh.setMatrixAt(index, this.particleDummy.matrix);
      this.particleColor.set(
        p.kind === 'steam'
          ? 0xd9f5f4
          : p.kind === 'smoke'
            ? 0x454950
            : p.life < 0.18
              ? 0xe64c22
              : 0xffc43d,
      );
      mesh.setColorAt(index, this.particleColor);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.particleMesh.count = count;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.fireMesh.count = fireCount;
    this.fireMesh.instanceMatrix.needsUpdate = true;
    if (this.fireMesh.instanceColor) this.fireMesh.instanceColor.needsUpdate = true;
  }
  combatObjects(state, dt, now) {
    const sync = (map, list, create, move) => {
      const ids = new Set();
      for (const item of list) {
        ids.add(item.id);
        let g = map.get(item.id);
        if (!g) {
          g = create(item);
          map.set(item.id, g);
          this.scene.add(g);
        }
        move(g, item);
      }
      for (const [id, g] of map)
        if (!ids.has(id)) {
          this.scene.remove(g);
          g.traverse((o) => {
            if (o.isMesh || o.isSprite) {
              if (o.isMesh) o.geometry.dispose();
              if (o.userData.ownedMaterial) o.material.dispose();
            }
          });
          map.delete(id);
        }
    };
    sync(
      this.rockets,
      state?.projectiles || [],
      (r) => {
        const g = new THREE.Group();
        const mesh = new THREE.Mesh(
          r.kind === 'plasma'
            ? new THREE.IcosahedronGeometry(0.65, 1)
            : new THREE.ConeGeometry(
                r.kind === 'rocket' ? 0.32 : 0.08,
                r.kind === 'rocket' ? 1.8 : 1.5,
                7,
              ),
          new THREE.MeshBasicMaterial({ color: r.kind === 'plasma' ? 0x7feaff : 0xffc257 }),
        );
        mesh.rotation.z = -Math.PI / 2;
        mesh.userData.ownedMaterial = true;
        g.add(mesh);
        if (r.kind === 'plasma') {
          const halo = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: this.texture('glow'),
              color: 0x32eaff,
              transparent: true,
              opacity: 0.55,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              toneMapped: false,
            }),
          );
          halo.scale.set(2.8, 2.8, 2.8);
          halo.userData.ownedMaterial = true;
          g.add(halo);
        }
        return g;
      },
      (g, r) => {
        const pose = (g.userData.motion = projectilePose(
          g.userData.motion,
          r,
          state.combatTime ?? state.time,
          dt,
          now,
        ));
        g.position.set(pose.x, pose.y, pose.z);
        g.rotation.order = 'YXZ';
        g.rotation.set(0, -pose.angle, pose.pitch || 0);
      },
    );
    sync(
      this.mines,
      state?.mines || [],
      () => {
        const g = new THREE.Group();
        this.cylinder(0, 0.2, 0, 0.7, 0.9, 0.35, 0x243541, 10, g);
        this.mesh(
          new THREE.SphereGeometry(0.22, 6, 4),
          new THREE.MeshBasicMaterial({ color: 0xff5446 }),
          0,
          0.5,
          0,
          g,
        ).userData.ownedMaterial = true;
        return g;
      },
      (g, m) => {
        g.position.set(m.x, m.y || 0, m.z);
        g.rotation.set(0, -(m.angle || 0), m.pitch || 0, 'YXZ');
        g.children[1].visible = Math.sin(now * 0.012) > -0.2;
      },
    );
    sync(
      this.chains,
      state?.chains || [],
      () => {
        const g = new THREE.Group();
        const ball = this.mesh(new THREE.IcosahedronGeometry(0.95, 1), 0x4b5258, 0, 0, 0, g);
        for (let i = 0; i < 8; i++)
          this.mesh(new THREE.TorusGeometry(0.22, 0.07, 4, 6), 0xa4a9ad, 0, 0, 0, g);
        return g;
      },
      (g, b) => {
        const pose = (g.userData.motion = projectilePose(
          g.userData.motion,
          {
            ...b,
            vx: b.renderVx ?? b.vx,
            vy: b.renderVy ?? b.vy,
            vz: b.renderVz ?? b.vz,
            angle: 0,
            pitch: 0,
          },
          state.combatTime ?? state.time,
          dt,
          now,
        ));
        const ownerState = state.players.find((p) => p.id === b.owner),
          ballRoad = nearestTrack(pose.x, pose.z, ownerState?.trackFraction);
        if (ballRoad.distance <= ballRoad.halfWidth + 0.6)
          pose.y = Math.max(pose.y, ballRoad.y + 0.98);
        const owner = this.cars.get(b.owner),
          anchor = owner
            ? owner.localToWorld(new THREE.Vector3(-CAR_LENGTH / 2, 0.9, 0))
            : { x: b.anchorX ?? pose.x, y: b.anchorY ?? pose.y, z: b.anchorZ ?? pose.z };
        g.children[0].position.set(pose.x, pose.y, pose.z);
        g.children[0].rotation.z = now * 0.002;
        for (let i = 1; i < 9; i++) {
          const t = i / 9,
            x = pose.x + (anchor.x - pose.x) * t,
            z = pose.z + (anchor.z - pose.z) * t,
            road = nearestTrack(x, z, ownerState?.trackFraction),
            lineY = pose.y + (anchor.y - pose.y) * t,
            y = road.distance <= road.halfWidth + 0.6 ? Math.max(lineY, road.y + 0.22) : lineY;
          g.children[i].position.set(x, y, z);
          g.children[i].rotation.set(
            ((i % 2) * Math.PI) / 2,
            -Math.atan2(anchor.z - pose.z, anchor.x - pose.x),
            Math.atan2(anchor.y - pose.y, Math.hypot(anchor.x - pose.x, anchor.z - pose.z)),
          );
        }
      },
    );
  }
  dispose() {
    this.scorePopups.dispose();
    this.heatOverlay?.dispose();
    this.staticShadows?.dispose();
    this.weaponEffects.dispose();
    this.resizeObserver?.disconnect();
    this.previewTarget?.dispose();
    const geometries = new Set(),
      materials = new Set(this.sceneMaterials.materials.values()),
      textures = new Set(this.textures.values());
    this.scene.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.name === 'ice-headlight') o.dispose();
      if (o.geometry) geometries.add(o.geometry);
      for (const geometry of o.userData.detailLevels || []) geometries.add(geometry);
      for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
        materials.add(m);
        if (m.map) textures.add(m.map);
      }
    });
    for (const g of geometries) if (!g.userData.sharedCarResource) g.dispose();
    for (const m of materials) if (!m.userData.sharedCarResource) m.dispose();
    for (const t of textures) t.dispose();
    this.environment?.dispose();
    this.sun.shadow.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
  resetRound() {
    this.weaponEffects.reset();
    this.follow = null;
    this.cameraMode = null;
    this.particles = [];
    this.nudgeEffects.reset();
    this.tyreTracks.reset();
    for (const g of this.cars.values()) g.userData.snap = true;
  }
  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (w && h) {
      this.resolution?.resize(w, h);
      this.renderer.setSize(w, h, false);
    }
  }
  update(state, localId, localCar, dt, now) {
    this.renderer.info.reset();
    this.extraCircuit?.update(state?.raceTime ?? now / 1000, state?.players || []);
    this.boostPads?.update(state, now);
    if (this.coastalCrabs)
      updateCoastalCrabs(this.coastalCrabs, state?.raceTime ?? now / 1000, this.camera);
    if (this.desertMoles) updateDesertMoles(this.desertMoles, state?.raceTime ?? now / 1000);
    if (this.valley) updateGlacierValley(this.valley, now);
    this.waterMaterial.uniforms.time.value = now / 1000;
    if (this.flameMaterial) this.flameMaterial.uniforms.time.value = now / 1000;
    this.frame++;
    this.particleClock += dt;
    this.emitParticles = this.particleClock >= 1 / 30;
    if (this.emitParticles) this.particleClock %= 1 / 30;
    const previewProgress = START_FRACTION + (((now / 1000) * 22) % TRACK_LENGTH) / TRACK_LENGTH;
    const previewChase = createChase([{ progress: previewProgress - START_FRACTION }]);
    const mode = state ? `${state.code}:${state.round || 1}` : 'preview';
    if (this.cameraMode !== mode) {
      this.follow = null;
      this.cameraMode = mode;
      this.weaponEffects.reset();
      this.nudgeEffects.reset();
      this.tyreTracks.reset();
    }
    this.deadline.visible = this.trackId !== 'cafe' && !!state && state.phase !== 'lobby';
    if (state?.chase) {
      const d = state.chase;
      this.deadline.position.set(d.x, d.y || 0, d.z);
      this.deadline.rotation.order = 'YXZ';
      this.deadline.rotation.set(0, -d.angle, Math.atan(d.grade || 0));
      this.deadline.scale.z = ((d.halfWidth || 6) * 2 + 2) / (ROAD_WIDTH + 2);
    }
    const previewFleet = [];
    const inRoom = !!state;
    this.previewCars.forEach((g, i) => {
      g.visible = !inRoom;
      if (!inRoom) {
        const fraction = previewProgress - (i * 1.7) / TRACK_LENGTH,
          p =
            this.trackId === 'cafe'
              ? { x: -10 + i * 20, y: 0, z: 15, angle: 0, halfWidth: 6, nx: 0, nz: 1 }
              : trackAt(fraction),
          lane = Math.min(
            p.halfWidth - CAR_WIDTH / 2 - 0.5,
            activeTrack.id === 'ice' ? iceSplit(p.x) + 1.8 : 1.8,
          ),
          side = i === 0 ? -lane : lane,
          x = p.x + p.nx * side,
          z = p.z + p.nz * side;
        g.position.set(x, p.y, z);
        g.rotation.set(0, -p.angle, Math.atan(p.grade || 0));
        updateCarVisuals(
          g,
          {
            ...p,
            vx: Math.cos(p.angle) * 22,
            vz: Math.sin(p.angle) * 22,
            steering: angleDelta(trackAt(fraction + 0.002).angle, p.angle) * 4,
          },
          dt,
        );
        previewFleet.push({
          ...p,
          x,
          z,
          trackFraction: fraction,
          progress: fraction - START_FRACTION,
        });
      }
    });
    const present = new Set(),
      tyreCars = [];
    if (state)
      for (const p of state.players) {
        present.add(p.id);
        let g = this.cars.get(p.id);
        if (!g) {
          g = this.createCar(p.color);
          this.scene.add(g);
          this.cars.set(p.id, g);
          g.position.set(p.x, 0, p.z);
          g.rotation.y = -p.angle;
        }
        const car = p.id === localId && localCar && !p.wrecked ? localCar : p;
        const a = 1;
        g.userData.snap = false;
        g.position.x += (car.x - g.position.x) * a;
        g.position.z += (car.z - g.position.z) * a;
        g.rotation.y += angleDelta(-car.angle, g.rotation.y) * a;
        g.position.y =
          (car.y || 0) +
          (1 - Math.cos(car.roll || 0) * Math.cos(car.pitch || 0)) * 0.5 +
          rolloverLift(car);
        g.rotation.x = car.roll || 0;
        g.rotation.z = car.pitch || 0;
        g.visible = (!p.eliminated || p.wrecked) && g.position.y > -15;
        updateCarVisuals(g, car, dt);
        if (g.userData.heatFlames) updateWheelHeatFlames(g.userData.heatFlames, car, now / 1000);
        const oldWeapon = g.userData.weaponModel;
        syncCarWeapon(g, p);
        if (g.userData.weaponModel && g.userData.weaponModel !== oldWeapon) {
          this.sceneMaterials.adopt(g.userData.weaponModel, true);
          this.staticShadows?.apply(g.userData.weaponModel);
          this.distanceFade.apply(g.userData.weaponModel);
        }
        g.userData.flame.visible = p.firing === 'flame' && !p.eliminated;
        if (g.userData.flame.visible) this.flamethrowerMaterial.uniforms.time.value = now / 1000;
        const thrust =
          boostExhaustStrength(car.padBoostRemaining) * Math.sqrt(car.padBoostPower ?? 1);
        g.userData.boostExhaust.visible = thrust > 0 && !p.eliminated;
        for (const jet of g.userData.boostExhaust.children)
          jet.scale.set(0.32 * thrust, 0.13 * Math.sqrt(thrust), 0.13 * Math.sqrt(thrust));
        g.userData.shield.visible = p.shield > 0 && !p.eliminated;
        g.userData.paint.emissive.setHex(p.tased > 0 ? 0x2868c5 : 0xff641c);
        g.userData.paint.emissiveIntensity =
          p.tased > 0 ? 0.7 : Math.min(1, (car.circuitHeat || 0) / 3) * 0.65;
        g.userData.paint.color
          .copy(g.userData.baseColor)
          .multiplyScalar(p.wrecked ? 0.22 : 1 - damageSeverity(p.health ?? 100) * 0.396);
        if (
          g.visible &&
          state.phase === 'countdown' &&
          p.input?.throttle > 0.1 &&
          !p.input.reverse &&
          now - (g.userData.burnoutAt || -Infinity) > 66
        ) {
          g.userData.burnoutAt = now;
          for (const side of [-1, 1]) {
            const wheel = g.localToWorld(
              new THREE.Vector3(-CAR_LENGTH * 0.31, 0.18, side * CAR_WIDTH * 0.44),
            );
            this.particle(
              wheel.x,
              wheel.y,
              wheel.z,
              'steam',
              -Math.cos(car.angle),
              -Math.sin(car.angle),
            );
          }
        }
        if (g.visible && this.emitParticles) {
          const level = damageLevel(p.health ?? 100),
            fx = Math.cos(car.angle),
            fz = Math.sin(car.angle);
          if (level > 0) {
            for (let j = 0; j < level; j++)
              this.particle(
                car.x + fx * 1.2,
                g.position.y + 0.9,
                car.z + fz * 1.2,
                'smoke',
                -car.vx * 0.12,
                -car.vz * 0.12,
              );
            if (level >= 3)
              for (let j = 0; j < level - 1; j++)
                this.particle(
                  car.x + fx * 1.2 + (Math.random() - 0.5),
                  g.position.y + 0.7,
                  car.z + fz * 1.2 + (Math.random() - 0.5),
                  'fire',
                );
          }
        }
        if (g.visible && state.phase === 'racing')
          tyreCars.push({ ...car, id: p.id, eliminated: p.eliminated });
      }
    for (const [id, g] of this.cars)
      if (!present.has(id)) {
        this.scene.remove(g);
        disposeCarInstance(g);
        this.cars.delete(id);
      }
    // Smoothing must never draw two solid chassis inside one another.
    const visibleCars = [...this.cars]
      .filter(([id, g]) => g.visible)
      .map(([id, g]) => {
        const p = state?.players.find((p) => p.id === id);
        return {
          ...p,
          x: g.position.x,
          z: g.position.z,
          angle: -g.rotation.y,
          y: g.position.y,
          vx: 0,
          vz: 0,
          yawVelocity: 0,
        };
      });
    this.gustTrails?.update(state?.phase === 'racing' ? state.raceTime : 0, visibleCars);
    this.tyreTracks.update(now / 1000, tyreCars);
    this.carShadows.update(state ? visibleCars : previewFleet);
    this.nudgeEffects.update(now / 1000, state?.phase === 'racing' ? visibleCars : []);
    // Rendering is read-only: physics contacts are solved only on simulation ticks.
    const me = state?.players.find((p) => p.id === localId),
      personal =
        !!me &&
        !me.eliminated &&
        state.phase !== 'lobby' &&
        (this.trackId === 'cafe' || this.cameraView === 'personal');
    const viewMode = personal ? 'personal' : this.trackId === 'cafe' ? 'arena' : 'shared';
    if (this.viewMode !== viewMode) {
      this.follow = null;
      this.viewMode = viewMode;
    }
    const cameraTarget = personal
      ? { personalCar: visibleCars.find((p) => p.id === localId) || me }
      : this.trackId === 'cafe'
        ? arenaOverview()
        : state?.camera || cameraFrame(previewChase, previewFleet);
    this.followFrame(cameraTarget, dt, state ? visibleCars : previewFleet);
    this.heatOverlay?.update(
      visibleCars,
      this.camera,
      this.container.clientWidth,
      this.container.clientHeight,
    );
    this.skyView.update(
      state,
      localId,
      this.camera,
      this.follow,
      this.skyMove,
      dt,
      this.skyControllers,
    );
    this.skyAim = this.skyView.aim;
    this.boxes.forEach((g, i) => {
      const pickup = state?.pickups[i];
      g.visible = g.userData.available = !state || pickup?.readyAt <= state.time;
      this.setPickupModel(g, pickup?.item || WEAPON_IDS[i % WEAPON_IDS.length]);
      g.userData.model.rotation.y = now * 0.00045 + i;
      g.position.y = (PICKUP_LOCATIONS[i]?.y || 0) + 1.9 + Math.sin(now * 0.0017 + i) * 0.18;
      g.userData.halo.position.y = (PICKUP_LOCATIONS[i]?.y || 0) + 0.08 - g.position.y;
      g.userData.ring.position.y = (PICKUP_LOCATIONS[i]?.y || 0) + 0.13 - g.position.y;
    });
    this.combatObjects(state, dt, now);
    this.weaponEffects.update(
      state,
      this.cars,
      this.rockets,
      this.mines,
      this.chains,
      this.camera,
      dt,
      now,
      this.container.clientHeight,
    );
    animateLandmarks(this, now);
    this.updateParticles(dt);
    this.scorePopups.update(state, this.cars, now);
    this.atmosphere.update(
      this.camera,
      now,
      this.follow?.y || 0,
      state ? (state.phase === 'racing' ? state.raceTime : 0) : now / 1000,
      this.follow,
    );
    this.cullDistantScenery(this.camera);
    this.renderer.render(this.scene, this.camera);
  }
  screenPosition(id) {
    const g = this.cars.get(id);
    if (!g) return null;
    const p = g.position.clone();
    p.y += 3.3;
    p.project(this.camera);
    const r = this.container.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }
}
