import {createDustCloud,stormHaze} from './desert-storm.js';
import {detectDevice} from './display.js';
import * as THREE from 'three';
// Lighting, fog, reflections and ocean share the same palette and sun direction.
export const ATMOSPHERES={
  coast:{viewDistance:420,fog:0xb4b4b5,density:.0036,zenith:0x4d789e,horizon:0xf3c5a0,ground:0x80666b,sunColor:0xffcf91,sunOffset:[-70,24,-50],sunPower:3.8,skyLight:0xa9c7e7,groundLight:0x665448,ambient:.68,exposure:1.0,clouds:.25},
  ice:{viewDistance:250,fog:0xb9ccd9,density:.0062,zenith:0x667f99,horizon:0xc7d6df,ground:0x8299b0,sunColor:0xd5e8ff,sunOffset:[-45,60,-38],sunPower:1.85,skyLight:0xc4dff5,groundLight:0x536c87,ambient:1.12,exposure:1.0,clouds:.85},
  desert:{viewDistance:600,fog:0xcda279,density:.0045,zenith:0x6593b7,horizon:0xebbe8f,ground:0x92705a,sunColor:0xffe0b5,sunOffset:[-135,315,-105],sunPower:4.6,skyLight:0xaecbed,groundLight:0x514237,ambient:.48,exposure:.98,clouds:.035},
};
const skyFragment=`
  uniform vec3 zenith,horizon,groundColor,sunDirection,sunColor,hazeColor;uniform float background;
  uniform float cloudCover;varying vec3 skyDirection;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
  void main(){
    vec3 d=normalize(skyDirection);
    vec3 color=mix(horizon,zenith,smoothstep(.0,.82,d.y));
    color=mix(groundColor,color,smoothstep(-.35,.02,d.y));
    float facing=max(0.,dot(d,sunDirection));
    color+=sunColor*(pow(facing,10.)*.22+pow(facing,85.)*.24)*(1.-cloudCover*.65);
    vec2 cloudUV=d.xz/max(.15,d.y+.2)*vec2(1.8,4.2);
    float cloud=noise(cloudUV)*.65+noise(cloudUV*2.17)*.25+noise(cloudUV*4.6)*.1;
    float veil=smoothstep(.39,.73,cloud)*smoothstep(-.03,.18,d.y)*cloudCover;
    color=mix(color,mix(horizon,zenith,.5)*.85,veil*.65);
    color+=sunColor*pow(facing,1800.)*5.*(1.-cloudCover*.92);
    if(background>.5)color=mix(hazeColor,color,smoothstep(-.025,.16,abs(d.y)));
    gl_FragColor=vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
function skyMaterial(profile,background=false){
  return new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
    uniforms:{background:{value:background?1:0},hazeColor:{value:new THREE.Color(profile.fog)},zenith:{value:new THREE.Color(profile.zenith)},horizon:{value:new THREE.Color(profile.horizon)},groundColor:{value:new THREE.Color(profile.ground)},sunDirection:{value:new THREE.Vector3(...profile.sunOffset).normalize()},sunColor:{value:new THREE.Color(profile.sunColor)},cloudCover:{value:profile.clouds}},
    vertexShader:background?'varying vec3 skyDirection;void main(){skyDirection=position;gl_Position=projectionMatrix*viewMatrix*vec4(cameraPosition+position*450.,1.);gl_Position.z=gl_Position.w*.999999;}':'varying vec3 skyDirection;void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:skyFragment});
}
export function createBlizzard(count=1800){
  let seed=34719;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const positions=new Float32Array(count*3),sizes=new Float32Array(count);
  for(let i=0;i<count;i++){positions[i*3]=random()*150;positions[i*3+1]=random()*65;positions[i*3+2]=random()*150;sizes[i]=.2+random()*.55;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('flakeSize',new THREE.BufferAttribute(sizes,1));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:false,
    uniforms:{time:{value:0},center:{value:new THREE.Vector3()},pointScale:{value:600}},
    vertexShader:`uniform float time,pointScale;uniform vec3 center;attribute float flakeSize;varying float alpha;varying vec2 streak;
      void main(){float gust=sin(time*.57)*3.5+sin(time*.19)*5.;vec3 drift=vec3(time*8.+gust,-time*(2.1+flakeSize),time*2.6+sin(time*.37)*3.);
        vec3 world=mod(position+drift-center+vec3(75.,32.5,75.),vec3(150.,65.,150.))-vec3(75.,32.5,75.)+center;
        vec4 eye=viewMatrix*vec4(world,1.);gl_Position=projectionMatrix*eye;
        gl_PointSize=clamp(pointScale*flakeSize/max(1.,-eye.z),1.,28.);
        alpha=smoothstep(1.5,7.,-eye.z)*(1.-smoothstep(65.,135.,-eye.z))*smoothstep(-.5,1.,world.y)*(.36+flakeSize*.4);
        streak=normalize((viewMatrix*vec4(8.+cos(time*.57)*2.,-3.,2.6,0.)).xy+vec2(.001));
      }`,
    fragmentShader:`varying float alpha;varying vec2 streak;void main(){vec2 uv=gl_PointCoord*2.-1.;float along=dot(uv,streak),across=dot(uv,vec2(-streak.y,streak.x));float shape=1.-smoothstep(.12,1.,along*along+across*across*6.);if(shape<.02)discard;gl_FragColor=vec4(.85,.94,1.,shape*alpha);}`});
  const snow=new THREE.Points(geometry,material);snow.frustumCulled=false;snow.renderOrder=5;return snow;
}
export function weatherFogDensity(profile,cameraHeight){
  // A spread-out pack raises the camera: keep the cars below it readable.
  return profile.density/Math.max(1,cameraHeight/50);
}
export function createAtmosphere(renderer,scene,trackId,{mobile=detectDevice(globalThis.navigator).mobile}={}){
  const profile=ATMOSPHERES[trackId]||ATMOSPHERES.coast;
  scene.background=new THREE.Color(profile.fog);scene.fog=new THREE.FogExp2(profile.fog,profile.density);renderer.toneMappingExposure=profile.exposure;
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1,32,16),skyMaterial(profile,true));sky.frustumCulled=false;sky.renderOrder=-1000;scene.add(sky);
  const reflectionScene=new THREE.Scene(),reflectionGeometry=new THREE.SphereGeometry(20,32,16),reflectionMaterial=skyMaterial(profile);
  reflectionScene.add(new THREE.Mesh(reflectionGeometry,reflectionMaterial));const generator=new THREE.PMREMGenerator(renderer),environment=generator.fromScene(reflectionScene,.035);
  scene.environment=environment.texture;scene.environmentIntensity=trackId==='ice'?.72:.85;generator.dispose();reflectionGeometry.dispose();reflectionMaterial.dispose();
  scene.add(new THREE.HemisphereLight(profile.skyLight,profile.groundLight,profile.ambient));
  const sun=new THREE.DirectionalLight(profile.sunColor,profile.sunPower);sun.castShadow=true;sun.position.set(...profile.sunOffset);sun.shadow.mapSize.setScalar(1024);const reach=68;Object.assign(sun.shadow.camera,{left:-reach,right:reach,top:68,bottom:-68,near:1,far:trackId==='desert'?850:200});sun.shadow.radius=trackId==='desert'?1:3;sun.shadow.normalBias=.07;sun.shadow.bias=-.0004;scene.add(sun,sun.target);
  const rim=new THREE.DirectionalLight(trackId==='coast'?0xa3bbeb:0x98c6ff,trackId==='ice'?.25:trackId==='desert'?.18:.48);rim.position.set(35,20,60);scene.add(rim);
  const snow=trackId==='ice'?createBlizzard(mobile?1600:2200):null;if(snow)scene.add(snow);
  const dust=trackId==='desert'?createDustCloud({mobile}):null;if(dust)scene.add(dust.group);
  const size=new THREE.Vector2(),clearFog=new THREE.Color(profile.fog),dustFog=new THREE.Color(0xb68b60),clearHorizon=new THREE.Color(profile.horizon);
  return {profile,environment,sun,sky,snow,dust,update(camera,now,groundY=0,weatherTime=now/1000,focus=null){const height=Math.max(0,camera.position.y-groundY);scene.fog.density=weatherFogDensity(profile,height);if(dust){renderer.getDrawingBufferSize(size);const storm=dust.update(weatherTime,size.y),haze=stormHaze(storm,focus||camera.position,height);scene.fog.density=haze.density;scene.fog.color.copy(clearFog).lerp(dustFog,haze.coverage*.8);sun.intensity=profile.sunPower*(1-haze.coverage*.58);sky.material.uniforms.horizon.value.copy(clearHorizon).lerp(dustFog,haze.coverage*.75);sky.material.uniforms.hazeColor.value.copy(scene.fog.color);sky.material.uniforms.cloudCover.value=profile.clouds+haze.coverage*.65;}if(snow){snow.material.uniforms.time.value=now/1000;snow.material.uniforms.center.value.copy(camera.position);renderer.getDrawingBufferSize(size);snow.material.uniforms.pointScale.value=size.y*.55;}}};
}
