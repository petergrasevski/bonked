import * as THREE from 'three';
import { SEGMENTS, TRACK_LENGTH } from '../shared/game.js';
import { padRoadTriangles } from '../shared/boost-pads.js';
import { padSurfaceGeometry } from './boost-pads.js';

// Bake ground markers onto the exact road triangles once, including curved
// grades and the correct deck at crossings. The weapon model still bobs above.
export function pickupGroundGeometry(p) {
  const geometry = padSurfaceGeometry(
    { ...p, width: 8, length: 8, surface: padRoadTriangles(SEGMENTS, p.fraction, TRACK_LENGTH) },
    0,
    0,
  );
  const positions = geometry.attributes.position,
    local = geometry.attributes.padLocal,
    uv = [];
  for (let i = 0; i < positions.count; i++) {
    positions.setXYZ(i, positions.getX(i) - p.x, positions.getY(i) - p.y, positions.getZ(i) - p.z);
    uv.push(local.getX(i) / 8 + 0.5, local.getY(i) / 8 + 0.5);
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.deleteAttribute('padLocal');
  geometry.deleteAttribute('color');
  return geometry;
}
export function createPickupGround(p, glow) {
  const geometry = pickupGroundGeometry(p);
  const halo = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      map: glow,
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const ring = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: { color: { value: new THREE.Color(0xffffff) } },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform vec3 color;varying vec2 vUv;void main(){float r=length((vUv-.5)*8.);float edge=max(fwidth(r),.015);float alpha=(1.-smoothstep(.11,.11+edge,abs(r-1.85)));if(alpha<.01)discard;gl_FragColor=vec4(color,alpha);
      #include <colorspace_fragment>
    }`,
    }),
  );
  return { halo, ring };
}
