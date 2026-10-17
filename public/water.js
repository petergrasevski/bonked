import { isCoastalBeach } from '../shared/coastal-barriers.js';
import { useBakedNoise, noise2DGLSL } from './baked-noise.js';
import * as THREE from 'three';
import { hasBarrier, TRACK_LENGTH, getLandscape } from '../shared/game.js';
import { beachSegments, beachShorePoint, beachPoint, beachWidth } from '../shared/beach-profile.js';
// A single ocean pass: displaced swells, analytic normals, sky reflection and
// sun glints. No reflection camera, scene copy, or full-screen postprocessing.
const waves = `
vec3 wave(vec2 p,vec2 d,float frequency,float amplitude,float speed){
  float phase=dot(p,d)*frequency+time*speed;
  return vec3(amplitude*sin(phase),d*amplitude*frequency*cos(phase));
}
vec3 surface(vec2 p){
  return wave(p,vec2(.94,.342),.13,.19,.65)
    +wave(p,vec2(-.45,.893),.23,.13,.9)
    +wave(p,vec2(.6,-.8),.48,.07,1.1);
}`;
const vertex = `
uniform float time;varying vec3 vWorld;varying vec2 vUv;
${waves}
void main(){vUv=uv;vec4 world=modelMatrix*vec4(position,1.);world.y+=surface(world.xz).x;vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`;
const noise = `${noise2DGLSL} float noise(vec2 p){return bakedNoise2D(p);}`;
export function createCoastalWater(track, segments, fog, lighting, landforms = []) {
  const time = { value: 0 },
    fogColor = { value: fog.color.clone() },
    fogDensity = { value: fog.density };
  const bounds = {
    minX: Math.min(...track.map((p) => p.x)) - 100,
    minZ: Math.min(...track.map((p) => p.z)) - 100,
    maxX: Math.max(...track.map((p) => p.x)) + 100,
    maxZ: Math.max(...track.map((p) => p.z)) + 100,
  };
  const width = bounds.maxX - bounds.minX,
    height = bounds.maxZ - bounds.minZ;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.scale(1024 / width, 1024 / height);
  ctx.translate(-bounds.minX, -bounds.minZ);
  for (let size = 100; size >= 12; size -= 2) {
    const shade = Math.round(225 * Math.exp(-(size - 12) / 22));
    ctx.beginPath();
    track.forEach((p, i) => (i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z)));
    ctx.closePath();
    ctx.lineWidth = size;
    ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
    ctx.stroke();
  }
  // Paint shallows at the actual beach/water intersection, including curved
  // exposed shoulders. The road-centre mask alone made the new beach look deep.
  ctx.globalCompositeOperation = 'lighten';
  const beaches = beachSegments({ segments, trackLength: TRACK_LENGTH, hasBarrier }),
    coastalSurface = getLandscape().surface;
  for (const { a, b, side } of beaches) {
    const p = beachShorePoint(a, side, -2.1, coastalSurface),
      q = beachShorePoint(b, side, -2.1, coastalSurface);
    if (!p || !q) continue;
    ctx.beginPath();
    ctx.moveTo(p[0], p[2]);
    ctx.lineTo(q[0], q[2]);
    for (let size = 30; size >= 2; size -= 2) {
      const shade = Math.round(235 * Math.exp(-size / 18));
      ctx.lineWidth = size;
      ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
      ctx.stroke();
    }
  }
  // Extend shallow turquoise water and foam around the newly connected islands.
  for (const land of landforms) {
    const points = land.shoreline;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p[0], p[2]) : ctx.moveTo(p[0], p[2])));
    ctx.closePath();
    for (let size = 42; size >= 2; size -= 2) {
      const shade = Math.round(230 * Math.exp(-size / 15));
      ctx.lineWidth = size;
      ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
      ctx.stroke();
    }
    ctx.fillStyle = '#eee';
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  const depthTexture = new THREE.CanvasTexture(canvas);
  depthTexture.colorSpace = THREE.NoColorSpace;
  depthTexture.generateMipmaps = false;
  depthTexture.minFilter = THREE.LinearFilter;
  depthTexture.magFilter = THREE.LinearFilter;
  const waterMaterial = new THREE.ShaderMaterial({
    fog: true,
    uniforms: {
      time,
      fogColor,
      fogDensity,
      sunDirection: {
        value: new THREE.Vector3(...(lighting?.sunOffset || [-55, 62, -44])).normalize(),
      },
      sunColor: { value: new THREE.Color(lighting?.sunColor || 0xffd4a0) },
      skyHorizon: { value: new THREE.Color(lighting?.horizon || 0xb6c6cb) },
      skyZenith: { value: new THREE.Color(lighting?.zenith || 0x6593b7) },
      coastMap: { value: depthTexture },
      coastBounds: { value: new THREE.Vector4(bounds.minX, bounds.minZ, width, height) },
    },
    vertexShader: vertex,
    fragmentShader: `
    uniform float sceneFadeStart,sceneFadeEnd;uniform float time;uniform vec3 fogColor,sunDirection,sunColor,skyHorizon,skyZenith;uniform float fogDensity;uniform sampler2D coastMap;uniform vec4 coastBounds;varying vec3 vWorld;varying vec2 vUv;
    ${waves}${noise}
    void main(){
      vec2 p=vWorld.xz;vec3 w=surface(p);
      float a=dot(p,vec2(.8,.6))*1.7+time*1.9+noise(p*.34+time*.08)*7.,b=dot(p,vec2(-.6,.8))*3.3-time*2.7+noise(p*.57-time*.09)*7.;
      float aa=1.-smoothstep(.5,2.2,fwidth(a)),ab=1.-smoothstep(.5,2.2,fwidth(b));
      vec2 ripples=vec2(.8,.6)*cos(a)*.031*aa+vec2(-.6,.8)*cos(b)*.024*ab;
      vec3 normal=normalize(vec3(-w.y-ripples.x,1.,-w.z-ripples.y));
      vec3 view=normalize(cameraPosition-vWorld),reflected=reflect(-view,normal);
      vec2 coastUV=(p-coastBounds.xy)/coastBounds.zw;coastUV.y=1.-coastUV.y;
      float shallow=texture2D(coastMap,coastUV).r;
      float variation=noise(p*.055+time*.018)*.65+noise(p*.19-time*.023)*.35;
      vec3 deep=vec3(.009,.075,.135),turquoise=vec3(.025,.31,.30);
      vec3 water=mix(deep,turquoise,clamp(shallow*1.3,0.,1.))*(.84+variation*.3);
      vec3 sky=mix(skyHorizon,skyZenith,smoothstep(0.,.8,reflected.y));sky+=sunColor*pow(max(0.,dot(reflected,sunDirection)),12.)*.15;
      float fresnel=.035+.965*pow(1.-clamp(dot(normal,view),0.,1.),5.);
      vec3 color=mix(water,sky,clamp(fresnel,.035,.85));
      vec3 sun=sunDirection;float shine=max(0.,dot(reflect(-sun,normal),view));
      color+=sunColor*(pow(shine,420.)*3.8+pow(shine,45.)*.22);
      float crest=smoothstep(.27,.36,w.x)*smoothstep(.66,.9,noise(p*.8+time*.07));color=mix(color,vec3(.55,.8,.79),crest*.2);
      float distanceToEye=length(cameraPosition-vWorld);float haze=1.-exp(-pow(fogDensity*distanceToEye,2.));
      haze=max(haze,smoothstep(sceneFadeStart,sceneFadeEnd,-(viewMatrix*vec4(vWorld,1.)).z));
      gl_FragColor=vec4(mix(color,fogColor,haze),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  waterMaterial.uniforms.terrainNoise = { value: useBakedNoise(waterMaterial) };
  const geometry = new THREE.PlaneGeometry(2000, 2000, 128, 128);
  geometry.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(geometry, waterMaterial);
  water.position.y = -2.1;
  // One foam batch for protected walls, sloping beaches and landmark islands.
  // The beach rows sit on the shared terrain profile and rise with wave swash;
  // their UVs follow the real shoreline instead of an inset road-width ribbon.
  const vertices = [],
    uv = [];
  const put = (corners) => {
    for (const j of [0, 1, 2, 1, 3, 2]) {
      vertices.push(...corners[j].p);
      uv.push(...corners[j].uv);
    }
  };
  for (const side of [-1, 1])
    for (let i = 0; i < segments.length; i++) {
      const a = segments[i],
        b = segments[(i + 1) % segments.length];
      if (isCoastalBeach((a.start + a.len * 0.5) / TRACK_LENGTH)) continue;
      const corners = [];
      for (const [s, distance] of [
        [a, a.start],
        [b, a.start + a.len],
      ])
        for (const edge of [0, 1]) {
          const offset = (s.halfWidth + 0.65 + edge * 3.4) * side;
          corners.push({
            p: [s.x + s.nx * offset, -2.06, s.z + s.nz * offset],
            uv: [distance / 5, edge],
          });
        }
      put(corners);
    }
  for (const { a, b, side } of beaches) {
    const pa = beachShorePoint(a, side, -2.1, coastalSurface),
      pb = beachShorePoint(b, side, -2.1, coastalSurface);
    if (!pa || !pb) continue;
    for (let row = 0; row < 8; row++) {
      const corners = [];
      for (const [s, shore, distance] of [
        [a, pa, a.start],
        [b, pb, a.start + a.len],
      ])
        for (const edge of [row / 8, (row + 1) / 8]) {
          const offshore = -1.2 + edge * 6.8,
            shoreDistance = Math.hypot(shore[0] - s.x, shore[2] - s.z),
            offset = shoreDistance + offshore;
          const t = (offset - s.halfWidth - 0.59) / beachWidth(s),
            terrain = beachPoint(s, Math.max(0, Math.min(1, t)), side);
          corners.push({
            p: [
              s.x + s.nx * offset * side,
              Math.max(
                -2.065,
                (coastalSurface.sample(s.x + s.nx * offset * side, s.z + s.nz * offset * side)?.y ??
                  terrain[1]) + 0.025,
              ),
              s.z + s.nz * offset * side,
            ],
            uv: [distance / 5, edge],
          });
        }
      put(corners);
    }
  }
  for (const land of landforms) {
    let distance = 0;
    const points = land.shoreline;
    const center = points.reduce(
      (sum, p) => [sum[0] + p[0] / points.length, sum[1] + p[2] / points.length],
      [0, 0],
    );
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length],
        dx = b[0] - a[0],
        dz = b[2] - a[2],
        len = Math.hypot(dx, dz) || 1;
      const nx = a[0] - center[0],
        nz = a[2] - center[1],
        n = Math.hypot(nx, nz) || 1,
        bx = b[0] - center[0],
        bz = b[2] - center[1],
        bn = Math.hypot(bx, bz) || 1;
      const corners = [
        [a[0], -2.06, a[2]],
        [a[0] + (nx / n) * 3.4, -2.06, a[2] + (nz / n) * 3.4],
        [b[0], -2.06, b[2]],
        [b[0] + (bx / bn) * 3.4, -2.06, b[2] + (bz / bn) * 3.4],
      ];
      for (const j of [0, 1, 2, 1, 3, 2]) {
        vertices.push(...corners[j]);
        uv.push((distance + (j > 1 ? len : 0)) / 5, j % 2);
      }
      distance += len;
    }
  }
  const shoreGeo = new THREE.BufferGeometry();
  shoreGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  shoreGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const shoreMaterial = new THREE.ShaderMaterial({
    uniforms: { time, fogColor, fogDensity },
    vertexShader: `uniform float time;varying vec3 vWorld;varying vec2 vUv;${waves}
    void main(){vUv=uv;vec4 world=modelMatrix*vec4(position,1.);world.y=max(world.y,-2.06+surface(world.xz).x);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fragmentShader: `
    uniform float sceneFadeStart,sceneFadeEnd;uniform float time;uniform vec3 fogColor;uniform float fogDensity;varying vec3 vWorld;varying vec2 vUv;${noise}
    void main(){
      float grain=noise(vWorld.xz*1.6+vec2(time*.045,-time*.06));
      float broken=noise(vec2(vUv.x*.7,time*.08));
      float surge=sin(time*.85+vUv.x*.17)*.065;
      float advance=fract(time*.17+vUv.x*.013);
      float front=1.-advance;
      float band=1.-smoothstep(.025,.11,abs(vUv.y-front+surge+(grain-.5)*.065));
      float lace=smoothstep(.28,.63,grain)*band*smoothstep(0.,.12,advance);
      float edgeFoam=(1.-smoothstep(.1,.35,vUv.y+surge))*(.25+.4*grain);
      float envelope=smoothstep(0.,.09,vUv.y)*(1.-smoothstep(.78,1.,vUv.y));
      float alpha=(lace*.6+edgeFoam*.38)*envelope*(.65+broken*.35);
      alpha*=1.-smoothstep(sceneFadeStart,sceneFadeEnd,-(viewMatrix*vec4(vWorld,1.)).z);
      alpha*=exp(-pow(fogDensity*length(cameraPosition-vWorld),2.));gl_FragColor=vec4(.76,.86,.79,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  shoreMaterial.uniforms.terrainNoise = { value: useBakedNoise(shoreMaterial) };
  const shore = new THREE.Mesh(shoreGeo, shoreMaterial);
  return { water, shore, waterMaterial, depthTexture };
}
