import * as THREE from 'three';
import { createPickupModel } from './pickups.js';
import { createSportsCar } from './car-model.js';
import { createEliminationLine } from './elimination-line.js';
import { createSkyStrike } from './sky-beam.js';
import { WeaponEffects } from './weapon-effects.js';
import { helpControls, hasSeenHowToPlay, rememberHowToPlay } from './how-to-play-copy.js';

const WIDTH = 320,
  HEIGHT = 208;
export function createHelpPreview(kind) {
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-11, 11, 7.15, -7.15, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xe9f6ff, 0x455361, 2.3));
  const light = new THREE.DirectionalLight(0xffffff, 4);
  light.position.set(0, 15, 10);
  scene.add(light);
  let tick = () => {};
  if (kind === 'weapon') {
    const model = createPickupModel('machinegun');
    scene.add(model);
    camera.position.set(4, 3, 7);
    camera.lookAt(0, 0, 0);
    camera.left = -3;
    camera.right = 3;
    camera.top = 1.95;
    camera.bottom = -1.95;
    tick = (t) => {
      model.rotation.y = t * 0.65;
      model.position.y = Math.sin(t * 2) * 0.16;
    };
  } else {
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(22, 0.16, 14),
      new THREE.MeshStandardMaterial({ color: 0x263b47, roughness: 0.95 }),
    );
    road.position.y = -0.12;
    scene.add(road);
    for (const z of [-6, 6]) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(22, 0.03, 0.12),
        new THREE.MeshBasicMaterial({ color: 0xa0b0b8 }),
      );
      edge.position.set(0, 0, z);
      scene.add(edge);
    }
    camera.position.set(13, 15, 20);
    camera.lookAt(0, 1, 0);
    const car = createSportsCar(kind === 'line' ? '#e9aa64' : '#67c5cd');
    scene.add(car);
    if (kind === 'objective') {
      car.position.set(1, 0, -2.7);
      const other = createSportsCar('#e9aa64');
      other.position.set(-2, 0, 2.5);
      other.rotation.y = -0.18;
      scene.add(other);
      tick = (t) => {
        car.position.x = 1 + Math.sin(t) * 0.65;
        other.position.x = -2 + Math.sin(t + 0.6) * 0.65;
      };
    } else if (kind === 'line') {
      const line = createEliminationLine();
      line.position.x = -3.5;
      scene.add(line);
      car.position.set(1, 0, 1);
      tick = (t) => {
        line.children[1].material.opacity = 0.23 + Math.sin(t * 3) * 0.07;
        car.position.x = 1 + Math.sin(t) * 0.6;
      };
    } else {
      const beam = createSkyStrike('#67c5cd');
      scene.add(beam);
      const effects = new WeaponEffects(scene),
        empty = new Map();
      let cycle = -1;
      tick = (t, dt) => {
        const loop = Math.floor(t / 2.8),
          age = t % 2.8,
          drop = Math.min(1, age / 0.7);
        beam.visible = age < 0.92;
        beam.position.set(0, 6 + (1 - drop) * 14, 0);
        beam.rotation.y = t * 4;
        beam.scale.x = beam.scale.z = 0.65 + drop * 0.6;
        const state = {
          phase: 'racing',
          code: 'help',
          round: 1,
          trackId: 'coast',
          players: [],
          combatTime: t * 1000,
          effects:
            age >= 0.7 && age < 1.7
              ? [
                  {
                    id: loop,
                    kind: 'pulse',
                    x: 0,
                    y: 0,
                    z: 0,
                    color: 0x67c5cd,
                    radius: 8,
                    duration: 1000,
                    until: (loop * 2.8 + 1.7) * 1000,
                  },
                ]
              : [],
        };
        if (loop !== cycle) {
          cycle = loop;
          effects.reset();
        }
        effects.update(state, empty, empty, empty, empty, camera, dt, t * 1000);
        car.position.set(
          2 + Math.max(0, Math.sin((Math.min(1, (age - 0.7) / 0.8) * Math.PI) / 2)) * 3,
          0,
          1.5,
        );
      };
    }
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d'),
    pixels = new Uint8Array(WIDTH * HEIGHT * 4),
    frame = ctx.createImageData(WIDTH, HEIGHT);
  const target = new THREE.WebGLRenderTarget(WIDTH, HEIGHT);
  target.texture.colorSpace = THREE.SRGBColorSpace;
  return {
    scene,
    camera,
    canvas,
    target,
    tick,
    draw(renderer) {
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x10212c, 1);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, WIDTH, HEIGHT, pixels);
      for (let y = 0; y < HEIGHT; y++)
        frame.data.set(
          pixels.subarray((HEIGHT - y - 1) * WIDTH * 4, (HEIGHT - y) * WIDTH * 4),
          y * WIDTH * 4,
        );
      ctx.putImageData(frame, 0, 0);
    },
  };
}

export class HowToPlay {
  constructor({ root, getWorld, controls, storage, onOpen = () => {}, onClose = () => {} }) {
    Object.assign(this, { root, getWorld, controls, storage, onOpen, onClose });
    this.previews = null;
    this.previousFocus = null;
    this.lastDraw = 0;
    this.openedAt = 0;
    this.firstVisit = !hasSeenHowToPlay(storage);
    this.root.querySelector('.close').onclick = () => this.close();
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        this.root.querySelector('.close').focus();
      }
    });
  }
  isOpen() {
    return !this.root.hidden;
  }
  show() {
    this.previousFocus = document.activeElement;
    this.onOpen();
    this.root.hidden = false;
    this.openedAt = performance.now();
    this.lastDraw = 0;
    this.root.querySelector('.close').focus();
    this.updateControls();
  }
  maybeShow() {
    if (this.firstVisit && !this.isOpen()) {
      this.firstVisit = false;
      this.show();
    }
  }
  close() {
    this.root.hidden = true;
    rememberHowToPlay(this.storage);
    this.firstVisit = false;
    this.onClose();
    if (this.previousFocus?.checkVisibility?.()) this.previousFocus.focus();
    else document.getElementById('how-to-play-open').focus();
  }
  updateControls() {
    const copy = helpControls(this.controls());
    for (const key of ['weapon', 'sky', 'drive'])
      this.root.querySelector(`[data-help-copy="${key}"]`).textContent = copy[key];
  }
  update(now) {
    if (!this.isOpen() || document.hidden || now - this.lastDraw < 50) return;
    const world = this.getWorld();
    if (!world) return;
    this.updateControls();
    if (!this.previews) {
      this.previews = ['objective', 'weapon', 'line', 'sky'].map((kind) => {
        const p = createHelpPreview(kind);
        this.root.querySelector(`[data-help-visual="${kind}"]`).append(p.canvas);
        return p;
      });
    }
    const renderer = world.renderer,
      previous = renderer.getRenderTarget(),
      color = renderer.getClearColor(new THREE.Color()),
      alpha = renderer.getClearAlpha(),
      viewport = renderer.getViewport(new THREE.Vector4()),
      scissor = renderer.getScissor(new THREE.Vector4()),
      scissorTest = renderer.getScissorTest();
    const dt = Math.min(0.05, Math.max(0, (now - this.lastDraw) / 1000)),
      t = matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0.82
        : (now - this.openedAt) / 1000;
    try {
      renderer.setScissorTest(false);
      for (const p of this.previews) {
        p.scene.environment = world.scene.environment;
        p.tick(t, dt);
        p.draw(renderer);
      }
    } finally {
      renderer.setRenderTarget(previous);
      renderer.setClearColor(color, alpha);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
    }
    this.lastDraw = now;
  }
}
