import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CAR_LENGTH,CAR_WIDTH} from '../shared/game.js';
let template;
// Longitudinal splines give the body continuous shoulders and a tapered nose.
const bodySections=[[-2.38,.30,.56,.70],[-2.12,.25,.70,.91],[-1.48,.24,.77,.97],[-.65,.23,.65,.92],[.35,.23,.66,.91],[1.42,.25,.74,.98],[1.94,.28,.62,.91],[2.35,.32,.45,.71]];
const cabinSections=[[-1.50,.64,.66,.45],[-1.12,.64,.86,.62],[-.65,.64,.995,.65],[.08,.64,.99,.62],[.64,.63,.80,.53],[.95,.63,.65,.43]];
function sectionAt(sections,x){
  let i=0;while(i<sections.length-2&&sections[i+1][0]<x)i++;
  const a=sections[i],b=sections[i+1],p=sections[Math.max(0,i-1)],q=sections[Math.min(sections.length-1,i+2)],t=(x-a[0])/(b[0]-a[0]);
  return [x,...[1,2,3].map(k=>a[k]+.5*t*(b[k]-p[k]+t*(2*p[k]-5*a[k]+4*b[k]-q[k]+t*(3*(a[k]-b[k])+q[k]-p[k]))))];
}
function shell(sections,{from=sections[0][0],to=sections.at(-1)[0],start=0,end=Math.PI*2,lift=0,rows=48,sides=24}={}){
  const positions=[],indices=[];
  for(let i=0;i<=rows;i++){
    const [x,bottom,top,width]=sectionAt(sections,from+(to-from)*i/rows);
    for(let j=0;j<=sides;j++){const a=start+(end-start)*j/sides,c=Math.cos(a),s=Math.sin(a);positions.push(x,(bottom+top)/2+Math.sign(c)*Math.abs(c)**.72*(top-bottom)/2+lift,Math.sign(s)*Math.abs(s)**.65*width);}
  }
  for(let i=0;i<rows;i++)for(let j=0;j<sides;j++){const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,a+1,b,a+1,b+1,b);}
  // Full shells have closed nose/tail faces; partial shells form roof/trim panels.
  if(end-start>6){for(const row of [0,rows]){const startIndex=row*(sides+1),center=positions.length/3;const [x,lo,hi]=sectionAt(sections,from+(to-from)*row/rows);positions.push(x,(lo+hi)/2,0);for(let j=0;j<sides;j++)if(row===0)indices.push(center,startIndex+j+1,startIndex+j);else indices.push(center,startIndex+j,startIndex+j+1);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function buildTemplate(){
  const g=new THREE.Group();
  const paint=new THREE.MeshPhysicalMaterial({color:0xffffff,metalness:.55,roughness:.19,clearcoat:1,clearcoatRoughness:.065,envMapIntensity:1.65});paint.name='body-paint';
  const glass=new THREE.MeshPhysicalMaterial({color:0x102735,metalness:.25,roughness:.095,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:1.6});
  const trim=new THREE.MeshStandardMaterial({color:0x15232b,metalness:.4,roughness:.34});
  const rubber=new THREE.MeshStandardMaterial({color:0x0c1115,roughness:.9});
  const alloy=new THREE.MeshStandardMaterial({color:0xcedae0,metalness:.95,roughness:.2,envMapIntensity:1.5});
  const led=new THREE.MeshStandardMaterial({color:0xd8f7ff,emissive:0x92dbff,emissiveIntensity:2.4});
  const rear=new THREE.MeshStandardMaterial({color:0xe73127,emissive:0xff2618,emissiveIntensity:.65,roughness:.25});
  const add=(geo,mat,x=0,y=0,z=0)=>{const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);g.add(mesh);return mesh;};
  const box=(x,y,z,w,h,d,mat=trim)=>add(new THREE.BoxGeometry(w,h,d),mat,x,y,z);
  const tube=(points,r,mat)=>add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),20,r,6,false),mat);
  add(shell(bodySections),paint);add(shell(cabinSections),glass);
  add(shell(cabinSections,{from:-.85,to:.22,start:-.73,end:.73,lift:.012,rows:16,sides:12}),paint);
  // Sill blades, splitter and diffuser establish a low, wide GT silhouette.
  box(2.20,.25,0,.50,.075,1.75);box(-2.21,.25,0,.43,.10,1.70);box(2.365,.385,0,.025,.085,1.04);
  for(const z of [-.58,-.29,0,.29,.58])box(-2.22,.30,z,.4,.16,.035);
  for(const side of [-1,1]){
    tube([[-1.82,.33,side*.94],[-.4,.28,side*.965],[.8,.29,side*.955],[1.8,.33,side*.93]],.055,trim);
    // Cockpit rails slope into the windscreen and rear fastback glass.
    tube([[-1.38,.70,side*.49],[-.84,.96,side*.48],[.16,.95,side*.46],[.85,.69,side*.44]],.025,paint);
    const intake=box(-.62,.52,side*.921,.5,.12,.025);intake.rotation.z=-.12;
    tube([[.42,.71,side*.57],[.42,.75,side*.76],[.42,.79,side*.91]],.025,trim);
    box(.42,.80,side*.955,.23,.10,.16,paint);
    tube([[1.89,.65,side*.80],[2.08,.60,side*.71],[2.25,.51,side*.56]],.031,led);
    tube([[-2.23,.61,side*.82],[-2.30,.59,side*.62],[-2.32,.59,side*.29]],.029,rear);
    for(const x of [-1.48,1.43]){
      const tyre=add(new THREE.TorusGeometry(.285,.075,8,24),rubber,x,.365,side*.91);tyre.scale.z=1.8;
      const wheel=add(new THREE.CylinderGeometry(.24,.24,.024,20),trim,x,.365,side*1.026);wheel.rotation.x=Math.PI/2;
      add(new THREE.TorusGeometry(.225,.018,6,24),alloy,x,.365,side*1.043);
      const hub=add(new THREE.CylinderGeometry(.065,.065,.028,12),alloy,x,.365,side*1.043);hub.rotation.x=Math.PI/2;
      for(let j=0;j<5;j++){const a=j*Math.PI*2/5,spoke=box(x+Math.cos(a)*.125,.365+Math.sin(a)*.125,side*1.044,.20,.025,.018,alloy);spoke.rotation.z=a;}
      box(x+.16,.365,side*1.039,.045,.15,.025,rear);
      add(new THREE.TorusGeometry(.40,.035,6,24,Math.PI),paint,x,.365,side*.982);
    }
    const exhaust=add(new THREE.CylinderGeometry(.077,.077,.13,12),alloy,-2.36,.37,side*.50);exhaust.rotation.z=Math.PI/2;
    const bore=add(new THREE.CylinderGeometry(.052,.052,.008,12),trim,-2.428,.37,side*.50);bore.rotation.z=Math.PI/2;
    box(-1.98,.79,side*.62,.075,.22,.07);
  }
  // Swept rear wing with painted end plates; its height clears the roof mount.
  const wing=box(-2.00,.91,0,.32,.065,1.96);wing.rotation.z=-.08;
  for(const side of [-1,1])box(-2.00,.93,side*.97,.35,.13,.04,paint);
  for(const side of [-1,1])for(let i=0;i<3;i++)box(1.15+i*.14,.75-i*.012,side*.5,.05,.02,.24);
  g.updateMatrixWorld(true);const groups=new Map();
  for(const mesh of g.children){let geo=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);if(geo.index){const flat=geo.toNonIndexed();geo.dispose();geo=flat;}if(!groups.has(mesh.material))groups.set(mesh.material,[]);groups.get(mesh.material).push(geo);mesh.geometry.dispose();}
  const result=new THREE.Group();for(const[material,parts]of groups){const mesh=new THREE.Mesh(mergeGeometries(parts),material);mesh.castShadow=true;mesh.receiveShadow=true;result.add(mesh);parts.forEach(p=>p.dispose());}
  // Match the unchanged collision footprint exactly, including mirrors/wheels.
  const bounds=new THREE.Box3().setFromObject(result),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const fit=new THREE.Matrix4().makeScale(CAR_LENGTH/size.x,1,CAR_WIDTH/size.z).multiply(new THREE.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z));
  for(const mesh of result.children)mesh.geometry.applyMatrix4(fit);
  result.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.userData.sharedCarResource=true;mesh.material.userData.sharedCarResource=true;}});
  return result;
}
export function createSportsCar(color){
  template??=buildTemplate();const car=template.clone(true);let paint;
  for(const mesh of car.children)if(mesh.material.name==='body-paint'){paint=mesh.material.clone();delete paint.userData.sharedCarResource;paint.color.set(color);mesh.material=paint;}
  car.userData={paint,baseColor:new THREE.Color(color),chassisSize:{length:CAR_LENGTH,width:CAR_WIDTH}};car.rotation.order='YXZ';return car;
}

// Chassis buffers are shared by every car and renderer for the page lifetime.
export function disposeCarInstance(car){
  if(car.userData.weaponModel)car.remove(car.userData.weaponModel);
  car.traverse(mesh=>{if(mesh.geometry&&!mesh.geometry.userData.sharedCarResource)mesh.geometry.dispose();});
  car.userData.paint?.dispose();car.userData.shield?.material.dispose();
}
