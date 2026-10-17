import * as THREE from 'three';
import { WHEEL_POINTS } from '../shared/edge-physics.js';
import { heatFlameStrength } from '../shared/extra-circuits.js';
export function createWheelHeatMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `varying vec2 flameUv;void main(){flameUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 flameUv;uniform float time;void main(){
      float y=flameUv.y,x=flameUv.x*2.-1.;
      float sway=sin(y*12.-time*13.)*.13*y+sin(y*23.-time*21.)*.08;
      float width=(1.-y)*(.70+.12*sin(y*19.-time*17.));
      float alpha=(1.-smoothstep(width*.45,width,abs(x+sway)))*(1.-smoothstep(.78,1.,y))*smoothstep(0.,.1,y);
      vec3 color=mix(vec3(1.,.13,.01),vec3(1.,.91,.38),(1.-y)*(1.-min(1.,abs(x)*2.)));
      gl_FragColor=vec4(color,alpha*.85);
    }`,
  });
}
export function createWheelHeatFlames(material) {
  // Four crossed sprites use one instanced draw per car, with fixed resources.
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, 8);
  mesh.name = 'wheel-heat-flames';
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.transform = new THREE.Object3D();
  return mesh;
}
export function updateWheelHeatFlames(mesh, car, seconds) {
  const strength = heatFlameStrength(car.circuitHeat || 0);
  mesh.visible = strength > 0 && !car.eliminated;
  if (!mesh.visible) return;
  mesh.material.uniforms.time.value = seconds;
  const dummy = mesh.userData.transform,
    height = 0.35 + strength * 1.65,
    width = 0.38 + strength * 0.65;
  for (let i = 0; i < WHEEL_POINTS.length; i++)
    for (let cross = 0; cross < 2; cross++) {
      const [x, z] = WHEEL_POINTS[i];
      dummy.position.set(x, 0.12 + height / 2, z * 1.12);
      dummy.rotation.set(0, (cross * Math.PI) / 2, 0);
      dummy.scale.set(width, height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i * 2 + cross, dummy.matrix);
    }
  mesh.instanceMatrix.needsUpdate = true;
}
