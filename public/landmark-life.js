import * as THREE from 'three';
import {weatherSurface} from './surface-detail.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Moving details live outside the static merge. All particle counts are fixed;
// their paths are evaluated from absolute time so camera distance and frame rate
// cannot change the choreography or accumulate orphaned objects.
const TAU=Math.PI*2;
function liveRoot(w,anchor){
  anchor.updateWorldMatrix(true,false);
  const root=new THREE.Group();root.matrix.copy(anchor.matrixWorld);root.matrix.decompose(root.position,root.quaternion,root.scale);w.scene.add(root);return root;
}
function instances(root,geometry,material,count){
  const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;root.add(mesh);return mesh;
}
const standard=(color,roughness=.8,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
function primitives(w,parent){
  const mesh=(geometry,color,x=0,y=0,z=0)=>w.mesh(geometry,color,x,y,z,parent);
  const box=(x,y,z,a,b,c,color)=>mesh(new THREE.BoxGeometry(a,b,c),color,x,y,z);
  const spar=(a,b,r,color)=>{const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),mid=p.clone().add(q).multiplyScalar(.5),m=mesh(new THREE.CylinderGeometry(r,r,p.distanceTo(q),6),color,mid.x,mid.y,mid.z);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),q.sub(p).normalize());return m;};
  return {mesh,box,spar};
}
// Batch rigid decorations within each moving part, retaining cable transforms.
function mergeRigid(group,exclude=[]){
  const groups=new Map();
  for(const child of [...group.children]){
    if(!child.isMesh||child.isInstancedMesh||exclude.includes(child))continue;
    child.updateMatrix();const geometry=child.geometry.clone().applyMatrix4(child.matrix);
    if(!groups.has(child.material))groups.set(child.material,[]);
    groups.get(child.material).push(geometry);group.remove(child);child.geometry.dispose();
  }
  for(const [material,geometries] of groups){const mesh=new THREE.Mesh(mergeGeometries(geometries),material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);for(const geometry of geometries)geometry.dispose();}
}
// Anisotropic value noise makes long non-repeating water filaments. Separate
// advection rates prevent rows of identical droplets or a tiled grid pattern.
export const WATER_WISPS_GLSL=`
  float waterHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
  float waterNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(waterHash(i),waterHash(i+vec2(1.,0.)),f.x),mix(waterHash(i+vec2(0.,1.)),waterHash(i+1.),f.x),f.y);}
  float waterWisps(vec2 uv,float clock){
    float warp=(waterNoise(vec2(uv.x*5.,uv.y*.7+clock*.19))-.5)*.016;
    float x=uv.x+warp;
    float broad=waterNoise(vec2(x*21.3,uv.y*1.4+clock*1.8));
    float slender=waterNoise(vec2(x*83.7+17.3,uv.y*3.2+clock*3.7));
    float fine=waterNoise(vec2(x*167.1+91.6,uv.y*6.7+clock*6.8));
    float fineFade=1.-smoothstep(.002,.012,fwidth(uv.x));
    return broad*.52+slender*.36+mix(.5,fine,fineFade)*.12;
  }
`;
function flowMaterial(color,foam=false){
  return new THREE.ShaderMaterial({side:THREE.DoubleSide,fog:true,uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),time:{value:0},tint:{value:new THREE.Color(color)},foam:{value:foam?1:0}},vertexShader:`
    varying vec2 vUv;
    #include <fog_pars_vertex>
    void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
    #include <fog_vertex>
    }`,fragmentShader:`
    uniform float time;uniform vec3 tint;uniform float foam;varying vec2 vUv;
    ${WATER_WISPS_GLSL}
    #include <fog_pars_fragment>
    void main(){float flow=sin(vUv.y*65.-time*3.+sin(vUv.x*23.)*2.);float cracks=smoothstep(.25,.8,sin(vUv.y*31.-time*1.7+sin(vUv.x*17.)));
      float edge=smoothstep(0.,.13,vUv.x)*smoothstep(0.,.13,1.-vUv.x);
      vec3 lava=mix(vec3(.10,.026,.015),tint*(.9+cracks*1.8),edge*(.65+flow*.12));
      vec3 water=mix(tint,vec3(.85,.96,.92),.25+waterWisps(vUv,time)*.4+(1.-edge)*.12);
      gl_FragColor=vec4(mix(lava,water,foam),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`});
}
function ribbon(points,widths){
  const positions=[],uv=[],indices=[];
  points.forEach((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[2]-a[2],d=Math.hypot(dx,dz)||1;for(const side of [-1,1]){positions.push(p[0]-dz/d*widths[i]*side/2,p[1],p[2]+dx/d*widths[i]*side/2);uv.push((side+1)/2,i/(points.length-1));}if(i){const k=i*2;indices.push(k-2,k,k-1,k-1,k,k+1);}});
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();return geo;
}

// Sculpted terrain profiles share their exact surface with the molten streams.
function volcanicSurface(a,t){
  const ridge=Math.sin(a*11+Math.sin(t*5)*.8)*.045+Math.sin(a*19-t*3)*.02;
  const r=(4.7+11.7*Math.pow(t,.74))*(1+Math.sin(Math.PI*t)*(ridge+.04*Math.sin(a*3)));
  const rim=.8*Math.sin(a*3)+.4*Math.sin(a*7)+.18*Math.sin(a*17);
  const y=15.5*Math.pow(1-t,1.48)-.65+rim*Math.pow(1-t,3)+.22*Math.sin(t*64+a*.4)*Math.sin(Math.PI*t);
  return [Math.cos(a)*r,y,Math.sin(a)*r];
}
function gridSurface(columns,rows,point){
  const position=[],uv=[],indices=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++){position.push(...point(i/columns,j/rows));uv.push(i/columns,j/rows);}
  for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){const a=j*(columns+1)+i,b=a+1,c=a+columns+1;indices.push(a,c,b,b,c,c+1);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
function geologicalMaterial(color){
  const material=weatherSurface(standard(color),{rock:true}),compile=material.onBeforeCompile;
  material.side=THREE.DoubleSide;
  material.onBeforeCompile=function(shader,renderer){compile.call(this,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`diffuseColor.rgb*=.72+.34*strataNoise+.11*sin(finishWorld.y*5.1+strataNoise*8.);
    #include <roughnessmap_fragment>`);};
  material.customProgramCacheKey=()=>`landmark-geological-v2-${color}`;return material;
}
export function buildVolcanicMassif(w,parent){
  const rock=geologicalMaterial(0x5a5350);
  w.mesh(gridSurface(112,44,(a,t)=>volcanicSurface(a*TAU,t)),rock,0,0,0,parent);
  // An asymmetric, recessed bowl replaces the torus on top of the old cone.
  const bowl=gridSurface(112,8,(u,t)=>{const a=u*TAU,p=volcanicSurface(a,0),r=4.7-1.1*t;return [Math.cos(a)*r,p[1]*(1-t)+12.7*t,Math.sin(a)*r];});
  w.mesh(bowl,rock,0,0,0,parent);
  // Low buttresses emerge from the lower flank instead of floating boulders.
  for(let i=0;i<11;i++){const a=i*2.39996,position=volcanicSurface(a,.77),geo=new THREE.SphereGeometry(1,14,9),p=geo.attributes.position;
    for(let j=0;j<p.count;j++){const x=p.getX(j),y=p.getY(j),z=p.getZ(j),n=1+.13*Math.sin(x*9+z*5)*Math.sin(y*7);p.setXYZ(j,x*n,y*n,z*n);}geo.computeVertexNormals();
    const stone=w.mesh(geo,rock,position[0],position[1]-.45,position[2],parent);stone.scale.set(1.6,1.2,1.6);}
}
export function buildFallsMassif(w,parent){
  const rock=geologicalMaterial(0x7b887b);
  // Dense, continuous strata wrap around the cliff. Its back and sides are
  // rounded and tapered; shelves are cut into the mesh instead of box overlays.
  const geometry=gridSurface(96,32,(u,v)=>{
    const a=u*TAU,front=Math.max(0,-Math.sin(a)),width=10.9*(1-.12*v),x=Math.cos(a)*width;
    const top=12.5+.8*Math.cos(a*3)+.35*Math.sin(a*7),y=-.3+v*top;
    const ledge=(.18*Math.sin(v*56+x*.08)+.09*Math.sin(v*117+x*.21))*Math.sin(Math.PI*v);
    const r=1+ledge+Math.sin(a*19+v*3)*.035;
    const z=1.1+Math.sin(a)*(3.2+1.3*(1-v))*r-front*(.2*Math.sin(x*2.1)+.12*Math.sin(x*4.4));
    return [x*(1+ledge*.12),y,z];
  });w.mesh(geometry,rock,0,0,0,parent);
  const cap=gridSurface(72,10,(u,v)=>{const a=u*TAU,r=1-v,top=12.5+.8*Math.cos(a*3)+.35*Math.sin(a*7);return [Math.cos(a)*9.59*r,top+.04,1.1+Math.sin(a)*3.2*r];});w.mesh(cap,geologicalMaterial(0x647d56),0,0,0,parent);
}
function softPlumeMaterial(color,opacity){
  return new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:true,uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),color:{value:new THREE.Color(color)},opacity:{value:opacity},time:{value:0}},vertexShader:`
    varying vec2 vUv;
    #include <fog_pars_vertex>
    void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);mvPosition.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));gl_Position=projectionMatrix*mvPosition;
    #include <fog_vertex>
    }`,fragmentShader:`
    uniform vec3 color;uniform float opacity;uniform float time;varying vec2 vUv;
    #include <fog_pars_fragment>
    void main(){vec2 p=vUv*2.-1.;float d=dot(p,p);float wisps=.7+.16*sin(p.x*12.+time)*sin(p.y*9.-time*.7)+.12*sin((p.x+p.y)*23.);float alpha=pow(max(0.,1.-d),2.)*opacity*wisps;gl_FragColor=vec4(color,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    }`});
}

export function bringVolcanoToLife(w,anchor){
  const root=liveRoot(w,anchor),{mesh}=primitives(w,root),lava=flowMaterial(0xff5b0c);
  // Broad streams with dark cooling crust flow between the mountain's eroded ribs.
  for(let i=0;i<6;i++)for(let branch=0;branch<2;branch++){
    const points=[],widths=[],angle=i*TAU/6+.35,start=branch?.38:0;
    for(let j=0;j<=72;j++){const t=start+(1-start)*j/72,a=angle+Math.sin(t*10+i)*.065+branch*(t-start)*.34,p=volcanicSurface(a,t);
      points.push([p[0],p[1]+.10,p[2]]);widths.push((branch?.28:.62)+t*(branch?.18:.48)+.12*Math.sin(t*24+i));}
    mesh(ribbon(points,widths),lava);
  }
  mergeRigid(root);
  const bombs=instances(root,new THREE.IcosahedronGeometry(1,0),new THREE.MeshBasicMaterial({color:0xffa02d,toneMapped:false}),32);
  const ash=instances(root,new THREE.PlaneGeometry(2,2),softPlumeMaterial(0x696368,.28),24);
  const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3(),position=new THREE.Vector3();
  return {root,update(t){
    lava.uniforms.time.value=t;ash.material.uniforms.time.value=t;
    for(let i=0;i<32;i++){const life=(t*.36+i*.618)%1,a=i*2.39996,r=1.5+life*(5+i%5),burst=.65+.35*Math.sin(t*.34)**2;
      position.set(Math.cos(a)*r,14.5+Math.sin(life*Math.PI)*(7+i%7)*burst-life*3,Math.sin(a)*r);scale.setScalar((.11+(i%4)*.035)*(1-life*.4));matrix.compose(position,rotation,scale);bombs.setMatrixAt(i,matrix);}
    bombs.instanceMatrix.needsUpdate=true;
    for(let i=0;i<24;i++){const life=(t*.065+i/24)%1;position.set(life*8+Math.sin(i*3)*life*3,15+life*21,Math.cos(i*5)*life*3);scale.set(1+life*3,.8+life*2.3,1+life*3);matrix.compose(position,rotation,scale);ash.setMatrixAt(i,matrix);}
    ash.instanceMatrix.needsUpdate=true;if(ash.instanceColor)ash.instanceColor.needsUpdate=true;
  },bombs,ash};
}

export function bringHarbourToLife(w,anchor){
  const root=liveRoot(w,anchor),{mesh,box,spar}=primitives(w,anchor),yellow=standard(0xdab33f,.5,.35),steel=standard(0x34444b,.5,.5),red=standard(0xad5641,.65,.2);
  // A single carrier travels the full gantry while a spreader actually lifts cargo.
  const carrier=new THREE.Group();root.add(carrier);const c=primitives(w,carrier);
  c.box(0,15.65,-6,3,.7,2.4,yellow);
  c.box(1.7,14.8,-6,1.8,1.6,1.6,yellow);c.box(1.7,15,-6.83,1.3,.8,.04,0x375e69);
  for(const x of [-1,1])for(const z of [-6.9,-5.1]){const wheel=c.mesh(new THREE.CylinderGeometry(.35,.35,.25,12),steel,x,16.1,z);wheel.rotation.x=Math.PI/2;}
  const suspended=new THREE.Group();carrier.add(suspended);const s=primitives(w,suspended);
  s.box(0,0,-6,5.8,.3,3.1,yellow);
  const cargo=s.box(0,-1.55,-6,5.5,2.7,3,red);
  // Corrugation, corner castings and door bars move rigidly with the cargo.
  for(let i=-2.4;i<=2.4;i+=.4)for(const side of [-1,1])s.box(i,-1.55,-6+side*1.515,.06,2.45,.06,red);
  for(const x of [-2.55,2.55])for(const z of [-7.35,-4.65])s.box(x,-.26,z,.19,.2,.2,steel);
  for(const z of [-6.9,-5.1])s.box(2.78,-1.55,z,.07,2.4,.09,steel);
  const cables=[];for(const x of [-1.1,1.1])for(const z of [-6.8,-5.2])cables.push(c.mesh(new THREE.CylinderGeometry(.035,.035,1,5),steel,x,0,z));
  // Loading bays and safety lines tell the viewer what the machine is doing.
  for(const x of [-5.7,5.7])for(const z of [-8.1,-3.9])box(x,.395,z,6,.025,.1,0xe5c25c);
  for(const x of [-8.5,-2.8,2.8,8.5])box(x,.395,-6,.1,.025,4.2,0xe5c25c);
  // Service shed, pitched roof, vents and dockside lights make a working place.
  box(-9.8,1.8,6,4.8,3,6.5,0xc1b69a);for(const side of [-1,1]){const roof=box(-9.8+side*1.3,3.7,6,2.9,.18,7,0x45555a);roof.rotation.z=-side*.22;}
  for(let i=0;i<4;i++)box(-12.23,2,4+i*1.1,.04,.7,.65,0x354650);
  for(const x of [-11,11]){spar([x,.4,-9],[x,6,-9],.07,0x34444b);spar([x,6,-9],[x,6,-7.8],.07,0x34444b);box(x,5.92,-7.8,.65,.12,.4,new THREE.MeshBasicMaterial({color:0xffd798,toneMapped:false}));}
  const beacon=primitives(w,root).mesh(new THREE.SphereGeometry(.16,8,6),new THREE.MeshBasicMaterial({color:0xff8f25,toneMapped:false}),0,18.4,-6);
  mergeRigid(carrier,cables);mergeRigid(suspended);
  return {root,carrier,suspended,update(t){
    // Smooth departure, traverse, lowering and return. No accumulating transforms.
    const phase=(t%24)/24,travel=.5-.5*Math.cos(phase*TAU);
    carrier.position.x=-5.7+11.4*travel;
    const lift=Math.pow(Math.sin(phase*TAU),2);suspended.position.y=3.25+7.8*lift;
    suspended.rotation.z=Math.sin(phase*TAU)*.022;
    for(const cable of cables){const length=15.25-suspended.position.y;cable.scale.y=length;cable.position.y=suspended.position.y+length/2;}
    beacon.scale.setScalar(.85+.35*Math.sin(t*5)**2);
  }};
}

export function bringTempleToLife(w,anchor){
  const root=liveRoot(w,anchor),{box,spar,mesh}=primitives(w,anchor);
  // Restored heritage forecourt: paving, balustrades, flower urns and exhibits.
  box(0,.12,-8.1,18,.35,4.4,0xb9ac8a);
  for(let x=-8;x<=8;x+=1.25)box(x,.304,-8.1,.03,.016,4.2,0x998a70);
  for(const z of [-9.4,-8,-6.6])box(0,.304,z,17.5,.016,.025,0x998a70);
  for(const side of [-1,1]){
    for(let i=0;i<7;i++)spar([side*9,.35,-9.7+i*2],[side*9,1.15,-9.7+i*2],.065,0x756e5e);
    spar([side*9,1.15,-9.7],[side*9,1.15,2.3],.065,0x756e5e);
    box(side*7.2,.78,-7.8,2.4,.16,.65,0x8c7355);for(const x of [-.85,.85])box(side*7.2+x,.5,-7.8,.12,.55,.48,0x756e5e);
    const sign=box(side*5.7,1.0,-9.5,1.1,.7,.12,0x354650);sign.rotation.x=-.2;spar([side*5.7,.3,-9.5],[side*5.7,1,-9.5],.06,0x756e5e);
    const urn=mesh(new THREE.CylinderGeometry(.55,.35,.7,12),0xbba982,side*8.2,.65,-5.7);
    for(let i=0;i<5;i++){const a=i*2.4;mesh(new THREE.IcosahedronGeometry(.28,1),i%2?0x997968:0x79956b,urn.position.x+Math.cos(a)*.3,1.05,urn.position.z+Math.sin(a)*.3);}
  }
  const bodies=instances(root,new THREE.BoxGeometry(1,1,1),standard(0xffffff),12*5),heads=instances(root,new THREE.SphereGeometry(1,8,6),standard(0xc99b79),12),hats=instances(root,new THREE.CylinderGeometry(1,1,.15,10),standard(0xd8c6a0),5);
  const obj=new THREE.Object3D(),palette=[0x416877,0xa86a53,0xc6ad71,0xe2dac6,0x687f70,0x75627f],color=new THREE.Color();
  for(let i=0;i<12;i++)for(let j=0;j<5;j++){color.setHex(j<3?palette[i%6]:0x45505a);bodies.setColorAt(i*5+j,color);}
  bodies.instanceColor.needsUpdate=true;
  const place=(target,index,x,y,z,sx,sy,sz,ry,rx=0)=>{obj.position.set(x,y,z);obj.rotation.set(rx,ry,0);obj.scale.set(sx,sy,sz);obj.updateMatrix();target.setMatrixAt(index,obj.matrix);};
  return {root,bodies,heads,update(t){
    for(let i=0;i<12;i++){
      // Eight walkers loop along a protected forecourt; four pause to photograph it.
      const walking=i<8,a=t*.085+i*TAU/8,x=walking?Math.cos(a)*6.4:-4.5+(i-8)*3,z=walking?-8.25+Math.sin(a)*1.05:-9.1;
      const yaw=walking?Math.atan2(-Math.sin(a)*6.4,Math.cos(a)*1.05):0,step=walking?Math.sin(t*4+i)*.36:0,base=.31,bob=walking?Math.abs(Math.sin(t*4+i))*.025:0;
      place(bodies,i*5,x,base+.95+bob,z,.38,.56,.23,yaw);
      for(const side of [-1,1]){
        const dx=Math.cos(yaw)*side,dz=-Math.sin(yaw)*side;
        place(bodies,i*5+(side<0?1:2),x+dx*.26,base+.94+bob,z+dz*.26,.12,.49,.13,yaw,walking?step*side:-1.1);
        place(bodies,i*5+(side<0?3:4),x+dx*.105,base+.38,z+dz*.105,.145,.58,.17,yaw,-step*side);
      }
      place(heads,i,x,base+1.42+bob,z,.19,.23,.19,yaw);
      if(i<5)place(hats,i,x,base+1.62+bob,z,.27,1,.26,yaw);
    }
    for(const mesh of [bodies,heads,hats])mesh.instanceMatrix.needsUpdate=true;
  }};
}

export function bringFallsToLife(w,anchor){
  const root=liveRoot(w,anchor),{mesh,box}=primitives(w,anchor),water=flowMaterial(0x3f9396,true);
  const p=primitives(w,root);
  for(const x of [-5,5]){
    const points=[],widths=[];for(let i=0;i<=16;i++){const t=i/16;points.push([x+Math.sin(t*3)*.2,12.8-t*.5,3.6-t*6.2]);widths.push(4.3+Math.sin(t*2)*.5);}
    p.mesh(ribbon(points,widths),water);
    // Falling water rebounds over a second shelf into the broad plunge basin.
    const cascade=p.mesh(new THREE.PlaneGeometry(4.6,1.6,10,6),water,x,.75,-4.3);cascade.rotation.x=-.35;

  }
  mergeRigid(root);
  const mist=instances(root,new THREE.PlaneGeometry(2,2),softPlumeMaterial(0xdcebe2,.14),48);
  const ripples=instances(root,new THREE.TorusGeometry(1,.026,4,36),new THREE.MeshBasicMaterial({color:0xd0ece3,transparent:true,opacity:.35,depthWrite:false}),8);
  const obj=new THREE.Object3D();
  return {root,mist,ripples,update(t){
    water.uniforms.time.value=t*2.5;mist.material.uniforms.time.value=t;
    for(let i=0;i<48;i++){const life=(t*.24+i*.618)%1,a=i*2.39996;obj.position.set((i%2?5:-5)+Math.cos(a)*life*3,.3+life*2.9,-3.1+Math.sin(a)*life*2.3-life*.8);obj.scale.setScalar(.25+Math.sin(life*Math.PI)*1.1);obj.rotation.set(0,i,0);obj.updateMatrix();mist.setMatrixAt(i,obj.matrix);}
    for(let i=0;i<8;i++){const life=(t*.35+i*.25)%1;obj.position.set(i%2?5:-5,.12,-3.9);obj.rotation.set(-Math.PI/2,0,0);obj.scale.set(1+life*2, .65+life*1.2,1);obj.updateMatrix();ripples.setMatrixAt(i,obj.matrix);}
    mist.instanceMatrix.needsUpdate=true;ripples.instanceMatrix.needsUpdate=true;
  }};
}

export function bringGeyserToLife(w,anchor){
  const root=liveRoot(w,anchor),{mesh,spar,box}=primitives(w,anchor);
  // Mineral terraces and boardwalk give the spray a readable human scale.
  for(const side of [-1,1]){
    for(let i=0;i<16;i++){const angle=-1.1+i*.13,x=Math.cos(angle)*9.6*side,z=Math.sin(angle)*9.6;const plank=box(x,.62,z,.8,.16,1.6,0xa28e66);plank.rotation.y=-angle*side;
      if(i%3===0)spar([x,.65,z],[x,1.65,z],.065,0x756e5e);}
    const points=[];for(let i=0;i<=24;i++){const a=-1.1+i*.082;points.push(new THREE.Vector3(Math.cos(a)*10.3*side,1.65,Math.sin(a)*10.3));}
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,.045,5,false),0x756e5e);
  }
  const ripples=instances(root,new THREE.TorusGeometry(1,.035,4,40),new THREE.MeshBasicMaterial({color:0xd1f7e6,transparent:true,opacity:.4,depthWrite:false}),5);
  const spray=instances(root,new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:0xe0f0e9,transparent:true,opacity:.17,depthWrite:false}),20),obj=new THREE.Object3D();
  return {root,ripples,update(t){
    const height=3+18*Math.pow(Math.max(0,Math.sin(((t+1)%8)/8*Math.PI)),3);
    for(let i=0;i<5;i++){const life=(t*.3+i/5)%1;obj.position.set(0,.61,0);obj.rotation.set(-Math.PI/2,0,0);obj.scale.setScalar(1+life*7);obj.updateMatrix();ripples.setMatrixAt(i,obj.matrix);}
    for(let i=0;i<20;i++){const life=(t*.25+i*.618)%1,a=i*2.39996;obj.position.set(Math.cos(a)*life*2.8,height*(.7+life*.3),Math.sin(a)*life*2.8);obj.rotation.set(0,i,0);obj.scale.setScalar(Math.sin(life*Math.PI)*(.35+height*.05));obj.updateMatrix();spray.setMatrixAt(i,obj.matrix);}
    ripples.instanceMatrix.needsUpdate=true;spray.instanceMatrix.needsUpdate=true;
  }};
}
