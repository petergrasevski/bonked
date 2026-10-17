import * as THREE from 'three';
import { desertStormAt, stormCoverage, stormGustAt } from '../shared/desert-storm.js';
// Bake smooth, seamless noise once per scene instead of evaluating eight sine
// hashes for every pixel of every overlapping cloud. 16 KiB, no asset download.
function createDustNoise() {
  const size = 128,
    period = 8,
    data = new Uint8Array(size * size);
  const hash = (x, y) => {
    const n = Math.sin((x % period) * 127.1 + (y % period) * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = (x / size) * period,
        py = (y / size) * period,
        ix = Math.floor(px),
        iy = Math.floor(py),
        fx = px - ix,
        fy = py - iy;
      const u = fx * fx * (3 - 2 * fx),
        v = fy * fy * (3 - 2 * fy),
        a = hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u,
        b = hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u;
      data[y * size + x] = Math.round((a * (1 - v) + b * v) * 255);
    }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
export function createDustCloud({ mobile = false } = {}) {
  const group = new THREE.Group();
  group.name = 'roving-dust-storm';
  let seed = 8043;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const noiseTexture = createDustNoise(),
    uniforms = {
      time: { value: 0 },
      strength: { value: 0 },
      dustNoise: { value: noiseTexture },
      density: { value: mobile ? 3 : 2 },
    };
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    fog: false,
    uniforms,
    vertexShader: `varying vec2 vUv;varying float seed,fade;void main(){vUv=uv;seed=instanceMatrix[3].x*.071+instanceMatrix[3].z*.043;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);vec2 size=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));vec4 eye=center+vec4(position.xy*size,0.,0.);fade=smoothstep(4.,25.,-eye.z);gl_Position=fade>0.?projectionMatrix*eye:vec4(0.,0.,2.,1.);}`,
    fragmentShader: `uniform float time,strength,density;uniform sampler2D dustNoise;varying vec2 vUv;varying float seed,fade;
      float noise(vec2 p){return texture2D(dustNoise,p/8.+vec2(.5/128.)).r;}
      void main(){if(fade<=0.)discard;vec2 p=vUv*2.-1.;float edge=1.-smoothstep(.2,1.,dot(p,p));vec2 drift=vec2(time*.09,time*-.045);float n=noise(vUv*4.+drift+seed)*.7+noise(vUv*9.-drift+seed)*.3;float alpha=edge*edge*(.04+n*.09)*strength*fade;float clear=1.-alpha;alpha=1.-clear*clear*mix(1.,clear,density-2.);gl_FragColor=vec4(mix(vec3(.40,.25,.12),vec3(.76,.55,.32),n),alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  material.addEventListener('dispose', () => noiseTexture.dispose());
  // Camera-facing discs need only one side. Trim transparent corners and use
  // fewer layers; compensate their opacity to retain the dense storm front.
  const clouds = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.5, 12),
      material,
      mobile ? 24 : 36,
    ),
    dummy = new THREE.Object3D();
  for (let i = 0; i < clouds.count; i++) {
    const a = random() * Math.PI * 2,
      r = Math.sqrt(random()) * 0.85;
    dummy.position.set(Math.cos(a) * r * 220, 8 + random() * 60, Math.sin(a) * r * 150);
    const size = 55 + random() * 85;
    dummy.scale.set(size * 1.4, size, 1);
    dummy.updateMatrix();
    clouds.setMatrixAt(i, dummy.matrix);
  }
  clouds.frustumCulled = false;
  clouds.renderOrder = 3;
  group.add(clouds);
  const count = mobile ? 300 : 550,
    positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (random() - 0.5) * 440;
    positions[i * 3 + 1] = random() * 65;
    positions[i * 3 + 2] = (random() - 0.5) * 300;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const grains = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { time: uniforms.time, strength: uniforms.strength, pointScale: { value: 600 } },
      vertexShader: `uniform float time,pointScale;varying float alpha;void main(){vec3 p=mod(position+vec3(time*19.,-time*1.8,time*7.)+vec3(220.,0.,150.),vec3(440.,65.,300.))-vec3(220.,0.,150.);vec4 eye=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*eye;gl_PointSize=clamp(pointScale*.12/max(1.,-eye.z),1.,5.);alpha=(1.-smoothstep(.55,1.,length(p.xz/vec2(220.,150.))))*smoothstep(1.,7.,-eye.z);}`,
      fragmentShader: `uniform float strength;varying float alpha;void main(){vec2 p=gl_PointCoord*2.-1.;float shape=1.-smoothstep(.1,1.,dot(p,p));gl_FragColor=vec4(.84,.64,.40,shape*alpha*strength*.48);}`,
    }),
  );
  grains.frustumCulled = false;
  grains.renderOrder = 4;
  group.add(grains);
  group.visible = false;
  return {
    group,
    clouds,
    grains,
    update(seconds, bufferHeight = 600) {
      const storm = desertStormAt(seconds);
      group.visible = storm.strength > 0;
      group.position.set(storm.x, 0, storm.z);
      group.scale.set(storm.rx / 220, 1, storm.rz / 150);
      uniforms.strength.value = storm.strength;
      uniforms.time.value = seconds;
      grains.material.uniforms.pointScale.value = bufferHeight;
      return storm;
    },
  };
}
export function stormHaze(storm, focus, height) {
  const coverage = stormCoverage(storm, focus.x, focus.z);
  return { coverage, density: (0.0045 + 0.011 * coverage) / Math.max(1, height / 42) };
}

// Three curved ribbons per car, batched into one draw with no per-frame geometry allocation.
export function createGustTrails(maxCars = 8) {
  const positions = [],
    uvs = [],
    phases = [],
    indices = [],
    segments = 24;
  for (let line = 0; line < 3; line++)
    for (let i = 0; i <= segments; i++) {
      const t = i / segments,
        x = (t - 0.5) * 11,
        z = (line - 1) * 2.3 + Math.sin(t * Math.PI * 2 + line * 0.7) * 0.65,
        y = 0.9 + line * 0.5 + Math.sin(t * Math.PI) * 0.35;
      const width = 0.1 * Math.sin(Math.PI * t);
      for (const side of [-1, 1]) {
        positions.push(x, y, z + side * width);
        uvs.push(t, (side + 1) / 2);
        phases.push(line / 3);
      }
      if (i < segments) {
        const a = line * (segments + 1) * 2 + i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
  geometry.setIndex(indices);
  const strengths = new THREE.InstancedBufferAttribute(new Float32Array(maxCars), 1).setUsage(
    THREE.DynamicDrawUsage,
  );
  geometry.setAttribute('gustStrength', strengths);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 } },
    vertexShader: `uniform float time;attribute float phase,gustStrength;varying vec2 vUv;varying float alpha;
      void main(){vUv=uv;float age=fract(time*1.7+phase);vec3 p=position;p.x+=(age-.5)*6.;alpha=sin(age*3.14159265)*gustStrength;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv;varying float alpha;void main(){float edge=1.-abs(vUv.y*2.-1.);gl_FragColor=vec4(1.,.94,.78,alpha*edge*.85);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, maxCars),
    dummy = new THREE.Object3D();
  mesh.name = 'desert-gust-trails';
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.visible = false;
  return {
    mesh,
    update(seconds, cars) {
      mesh.count = 0;
      material.uniforms.time.value = seconds;
      for (const car of cars) {
        if (mesh.count === maxCars) break;
        if (car.eliminated || car.finished || car.falling || car.overturned) continue;
        const wind = stormGustAt(seconds, car.x, car.z, car.angle);
        if (wind.strength <= 0.001) continue;
        dummy.position.set(car.x, car.y || 0, car.z);
        dummy.rotation.y = -Math.atan2(wind.z, wind.x);
        dummy.updateMatrix();
        mesh.setMatrixAt(mesh.count, dummy.matrix);
        strengths.setX(mesh.count++, wind.strength);
      }
      mesh.visible = mesh.count > 0;
      if (mesh.visible) {
        mesh.instanceMatrix.needsUpdate = true;
        strengths.needsUpdate = true;
      }
    },
  };
}
