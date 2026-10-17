import * as THREE from 'three';
import { CAR_LENGTH } from '../shared/game.js';
import { FLAME_RANGE } from '../shared/combat.js';

export function createFlamethrowerMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `varying vec2 flameUv;void main(){flameUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 flameUv;uniform float time;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
    void main(){
      float x=flameUv.x,y=flameUv.y*2.-1.;
      // Turbulence travels from the nozzle toward the tip, within the car's pose.
      float flow=x*9.-time*12.;
      float n=noise(vec2(flow,y*4.))+noise(vec2(flow*2.1,y*9.+time*2.))*.5;
      float sway=sin(x*15.-time*17.)*.08*x;
      float width=(.065+pow(x,.65)*.7)*(1.-smoothstep(.55,1.,x));
      float edge=abs(y+sway)+(n-.75)*.22*x;
      float body=1.-smoothstep(width*.55,width+.025,edge);
      float tongues=smoothstep(.12,.75,n+(1.-x)*.6);
      float alpha=body*tongues*(1.-smoothstep(.82,1.,x));
      float core=(1.-smoothstep(0.,max(.02,width*.65),abs(y+sway)))*(1.-x);
      vec3 color=mix(vec3(1.,.055,.002),vec3(1.,.48,.025),clamp(n*.6+core,0.,1.));
      color=mix(color,vec3(1.,.93,.55),core*core);
      color=mix(color,vec3(.25,.48,1.),(1.-smoothstep(0.,.08,x))*core);
      gl_FragColor=vec4(color,alpha*.72);
      #include <colorspace_fragment>
    }`,
  });
}

export function createFlamethrower(material) {
  const jet = new THREE.Group();
  jet.name = 'flamethrower-jet';
  jet.visible = false;
  jet.position.set(-CAR_LENGTH / 2, 0.9, 0);
  jet.rotation.y = Math.PI;
  // Crossed layers keep the flame visible from above and from the chase camera.
  const length = FLAME_RANGE - CAR_LENGTH / 2,
    geometry = new THREE.PlaneGeometry(length, 5);
  for (const angle of [0, Math.PI / 3, (Math.PI * 2) / 3]) {
    const layer = new THREE.Mesh(geometry, material);
    layer.position.x = length / 2;
    layer.rotation.x = angle;
    jet.add(layer);
  }
  return jet;
}
