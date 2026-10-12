import * as THREE from 'three';
import {addConnectedLand,buildCoastalBeaches} from './coastal-terrain.js';
import {createIslandBand} from './scenery.js';
import {trackAt,nearestTrack,TRACK_LENGTH,hasBarrier} from '../shared/game.js';
export const LANDMARKS=[
  {kind:'island',name:'Palm Island',fraction:.025},
  {kind:'volcano',name:'Ember Caldera',fraction:.15},
  {kind:'geyser',name:'Geyser Springs',fraction:.275},
  {kind:'harbour',name:'Cargo Harbour',fraction:.40},
  {kind:'ruins',name:'Sunken Temple',fraction:.525},
  {kind:'waterfall',name:'Twin Falls',fraction:.65},
  {kind:'lighthouse',name:'Beacon Point',fraction:.775},
  {kind:'shipwreck',name:'Wreck Bay',fraction:.90},
];
export function buildLandmarks(w){
  const animated=[],glows=new Map();buildCoastalBeaches(w);
  const glow=color=>{if(!glows.has(color))glows.set(color,new THREE.MeshBasicMaterial({color,toneMapped:false}));return glows.get(color);};
  for(const landmark of LANDMARKS){
    const p=trackAt(landmark.fraction);
    let side=1; // Camera is on the positive normal: tall landmarks remain in view.
    const radius=landmark.kind==='volcano'?17:landmark.kind==='waterfall'?13:landmark.kind==='harbour'?14:11;
    let x,z,best=null;
    // Keep large silhouettes beside the road, clear of every neighbouring bend.
    placement: for(const sign of [side,-side])for(let distance=p.halfWidth+radius+1.5;distance<65;distance+=3){
      const tx=p.x+p.nx*distance*sign,tz=p.z+p.nz*distance*sign,t=nearestTrack(tx,tz),clearance=t.distance-t.halfWidth;
      if(clearance>=radius+1){best={x:tx,z:tz,side:sign};break placement;}
    }
    if(!best)best={x:p.x+p.nx*(p.halfWidth+radius+5),z:p.z+p.nz*(p.halfWidth+radius+5),side:1};
    ({x,z,side}=best);const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=-p.angle;w.static.add(g);
    const box=(a,b,c,d,e,f,color)=>w.box(a,b,c,d,e,f,color,g);
    const cylinder=(a,b,c,r1,r2,h,color,n=16)=>w.cylinder(a,b,c,r1,r2,h,color,n,g);
    const mesh=(geo,color,a=0,b=0,c=0)=>w.mesh(geo,color,a,b,c,g);
    // Small opaque details share the landmark palette and join the 70 m static batches.
    // No extra lights, textures, transparency or per-frame updates for these props.
    const spar=(a,b,r,color)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),mid=start.clone().add(end).multiplyScalar(.5),part=cylinder(mid.x,mid.y,mid.z,r,r,start.distanceTo(end),color,6);part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());return part;};
    const ring=(x,y,z,r,thickness,color)=>{const part=mesh(new THREE.TorusGeometry(r,thickness,4,24),color,x,y,z);part.rotation.x=-Math.PI/2;return part;};
    const rock=(x,y,z,size,color,seed)=>{const part=mesh(new THREE.IcosahedronGeometry(size,0),color,x,y,z);part.scale.set(1,.6+.12*Math.sin(seed),.8);part.rotation.set(seed*.13,seed*.8,seed*.17);return part;};
    if(landmark.kind==='island'){
      // One flowing shoreline follows the causeway; overlapping discs made the old
      // island read as a scalloped green strip. All terrain stays below the road.
      const bands=[[],[],[]],grass=[],samples=[];
      const tri=(v,a,b,c)=>v.push(...a,...b,...c);
      const terrain=(v,color)=>{const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.computeVertexNormals();return w.mesh(geo,color);};
      for(let d=-78;d<=78;d+=3){
        const f=landmark.fraction+d/TRACK_LENGTH,q=trackAt(f),t=d/78;
        const width=Math.sqrt(Math.max(0,1-t*t))*(20+1.9*Math.sin(d*.075)+1.2*Math.cos(d*.143));
        samples.push({d,q,width,guarded:hasBarrier(f)});
      }
      const pt=(sample,side,r,y)=>{const {d,q,width}=sample,edge=width*r*(1+side*.055*Math.sin(d*.11));return [q.x+q.nx*edge*side,y,q.z+q.nz*edge*side];};
      for(let i=1;i<samples.length;i++){
        const a=samples[i-1],b=samples[i];if(!a.guarded||!b.guarded)continue;
        // Separate bedrock, sand and grass share coherent contours with no seams.
        for(const side of [-1,1])for(const [band,outer,inner,oy,iy]of [[0,1.08,1,-2.9,-.76],[1,1,.76,-.76,-.21],[2,.76,0,-.21,-.13]]){
          const ap=pt(a,side,outer,oy),bp=pt(b,side,outer,oy),ai=pt(a,side,inner,iy),bi=pt(b,side,inner,iy);
          if(side===1){tri(bands[band],ap,bp,ai);tri(bands[band],ai,bp,bi);}
          else{tri(bands[band],ap,ai,bp);tri(bands[band],ai,bi,bp);}
        }
      }
      for(const [i,color]of [0x777568,0x938d7c,0x89956a].entries())terrain(bands[i],color).userData.sceneryKind='palm-island-shore';
      for(let i=4;i<samples.length-4;i+=3){const sample=samples[i],{d,q,width}=sample;if(!sample.guarded)continue;
        for(const sign of [-1,1]){
          const offset=q.halfWidth+4.4+(i%3)*.5;if(offset>width*.7)continue;
          const x=q.x+q.nx*offset*sign,z=q.z+q.nz*offset*sign,t=nearestTrack(x,z);if(t.distance<t.halfWidth+3)continue;
          if(i%2===0)w.palm(x,z,1.15+(i%3)*.12,q.angle+sign*.15);
          else{const stone=w.mesh(new THREE.IcosahedronGeometry(.8+(i%3)*.22,1),0x777568,x,.1,z);stone.scale.set(1.7,.6,1);stone.rotation.y=d;}
          // Folded grass tufts break up the broad surface, batched into one mesh.
          for(let j=0;j<6;j++){const a=j*2.4+i,gx=x+Math.sin(a)*1.8,gz=z+Math.cos(a)*1.8,h=.35+(j%3)*.1;tri(grass,[gx-.15,-.15,gz],[gx+.18,h,gz+.15],[gx+.15,-.15,gz]);tri(grass,[gx,-.15,gz-.15],[gx+.18,h,gz+.15],[gx,-.15,gz+.15]);}
        }
      }
      terrain(grass,0x799851);
      // Stone gateway makes the crossing recognizable from either direction.
      const gate=new THREE.Group();gate.position.set(p.x,0,p.z);gate.rotation.y=-p.angle;w.static.add(gate);
      for(const sign of [-1,1]){w.box(0,3,sign*(p.halfWidth+1.5),2,6,2,0xbca97d,gate);w.mesh(new THREE.ConeGeometry(2.2,2,4),0x657e4d,0,6.9,sign*(p.halfWidth+1.5),gate);}
      w.box(0,6,0,1.1,.8,(p.halfWidth+2)*2,0xbca97d,gate);
      continue;
    }
    if(['volcano','geyser','ruins','waterfall'].includes(landmark.kind))addConnectedLand(w,landmark,x,z,radius);
    else cylinder(0,-2,0,radius,radius+2,3.4,0x625c51,32);
    // Broken coastal edges catch the low sun without turning islands into round drums.
    for(let i=0;i<18;i++){const a=i*2.39996,r=radius-.3+(i%3)*.35;rock(Math.cos(a)*r,-.75,Math.sin(a)*r,1.2+(i%4)*.24,i%3?0x625c51:0x998778,i);}
    if(landmark.kind==='volcano'){
      // Many radial ribs and irregular layers form eroded lava channels, not a cone.
      const mountain=new THREE.CylinderGeometry(5.2,17,15.2,56,10,true),mp=mountain.attributes.position;
      for(let i=0;i<mp.count;i++){const px=mp.getX(i),py=mp.getY(i),pz=mp.getZ(i),a=Math.atan2(pz,px),t=(py+7.6)/15.2,rib=1+.05*Math.sin(a*14)+.035*Math.sin(a*23+t*2);mp.setXYZ(i,px*rib,py+Math.sin(a*9)*(.16+t*.34),pz*rib);}
      mountain.computeVertexNormals();mesh(mountain,0x443f42,0,6.9,0);
      for(let i=0;i<28;i++){const a=i*2.39996,t=.15+(i%7)*.105,r=17-11.8*t;const stone=rock(Math.cos(a)*r, -.2+t*15,Math.sin(a)*r, .6+(i%3)*.25,i%2?0x292a31:0x625c51,i);stone.scale.y=.5;}
      const crater=mesh(new THREE.CylinderGeometry(5.2,3.9,2.6,48,2,true),0x292a31,0,13.3,0);crater.material.side=THREE.DoubleSide;
      const rim=mesh(new THREE.TorusGeometry(5.1,.65,7,22),0x292a31,0,14.45,0);rim.rotation.x=-Math.PI/2;
      const lava=mesh(new THREE.CircleGeometry(4.65,24),glow(0xff5b13),0,14.42,0);lava.rotation.x=-Math.PI/2;
      const core=mesh(new THREE.CircleGeometry(2.8,20),glow(0xffbe22),0,14.44,0);core.rotation.x=-Math.PI/2;
      for(let i=0;i<7;i++){
        const a=i*Math.PI*2/7,points=[];for(let j=0;j<=8;j++){const t=j/8,r=5.7+10.4*t,angle=a+Math.sin(t*7+i)*.035;points.push(new THREE.Vector3(Math.cos(angle)*r,14.1-12.9*t,Math.sin(angle)*r));}
        mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,.18,5,false),glow(i%2?0xff7918:0xef3d0e));
      }
      for(let i=0;i<12;i++){const a=i*2.39996;rock(Math.cos(a)*8,9.5,Math.sin(a)*8,1.3,0x292a31,i);}
      // The pulsing core must remain outside the static geometry merge.
      g.updateWorldMatrix(true,false);w.scene.attach(core);
      animated.push({kind:'volcano',x,z,y:15,phase:0,mesh:core});
    }else if(landmark.kind==='geyser'){
      for(let i=0;i<4;i++){const r=11-i*2.25;mesh(createIslandBand(r,2.4,[[1.05,-.15+i*.14],[1,.12+i*.14],[.89,.17+i*.14]],48),i%2?0xd7c499:0xe2d6b5);}
      for(let i=0;i<24;i++){const a=i*2.4,r=9.4+(i%3)*.3;rock(Math.cos(a)*r,.1,Math.sin(a)*r,.35+(i%4)*.13,0xe2d6b5,i);}
      const pool=mesh(new THREE.CircleGeometry(8.8,32),glow(0x3eafbc),0,.48,0);pool.rotation.x=-Math.PI/2;
      for(const r of [3,5.8,8.5])mesh(createIslandBand(r,2.4,[[1,.49],[.92,.58],[.84,.50]],48),0xbad8c7);
      cylinder(0,.8,0,1.7,2.6,1.5,0xe2d6b5);
      const jet=new THREE.Group();jet.position.set(x,1,z);w.scene.add(jet);
      const jetMaterial=new THREE.MeshStandardMaterial({color:0xc6f4ee,roughness:.2,transparent:true,opacity:.78,depthWrite:false}),jets=[];
      for(let i=0;i<7;i++){const a=i*2.4,water=w.mesh(new THREE.CylinderGeometry(.10,.38,1,8,5),jetMaterial,Math.sin(a)*.45,0,Math.cos(a)*.45,jet);water.rotation.z=Math.sin(a)*.035;jets.push(water);}
      const droplets=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.08,0),jetMaterial,48);droplets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);droplets.frustumCulled=false;jet.add(droplets);
      animated.push({kind:'geyser',x,z,y:1,mesh:jet,jets,droplets,dropletMatrix:new THREE.Matrix4(),phase:1});
    }else if(landmark.kind==='harbour'){
      box(0,.05,0,27,.65,22,0x998778);
      for(let row=0;row<2;row++)for(let i=0;i<3;i++){const color=[0x308d94,0xc25e39,0xdbba49][i];box((i-1)*6,1.5+row*2.8,3,5.5,2.7,10,color);for(let j=-4;j<=4;j++)box((i-1)*6,1.5+row*2.8,3+j,5.6,.07,.08,0x354650);}
      for(const a of [-8,8])box(a,8,-6,.9,16,.9,0xe5af31);box(0,16,-6,20,.9,1.4,0xe5af31);box(0,17,-6,.6,2.5,.6,0xe5af31);box(3,11,-6,.16,9,.16,0x27353b);box(3,6.5,-6,2,.4,2,0x27353b);
      for(let i=-10;i<=10;i+=4){cylinder(i,-.4,-11,.4,.5,3,0x4a4140);cylinder(i,.65,-10,.3,.4,.9,0x27353b,8);spar([i-.55,1,-10],[i+.55,1,-10],.14,0x27353b);}
      // Gantry lattice, access ladder, motor trolley and suspended hook.
      for(const a of [-8,8])for(let y=1;y<15;y+=3){spar([a-.4,y,-6.4],[a+.4,y+3,-5.6],.09,0x27353b);box(a-.6,y+1.5,-6,.1,3,.1,0xe5af31);for(let j=0;j<4;j++)box(a-.6,y+j*.65,-6,.13,.08,.65,0x27353b);}
      for(let a=-8;a<8;a+=4){spar([a,16.5,-6],[a+2,18,-6],.12,0xe5af31);spar([a+2,18,-6],[a+4,16.5,-6],.12,0xe5af31);}
      box(3,15.4,-6,2.7,.65,2.1,0x27353b);box(6,14.5,-6,2.1,2.2,1.8,0xe5af31);box(6,14.8,-6.92,1.5,1,.04,0x354650);
      const hook=mesh(new THREE.TorusGeometry(.45,.12,5,12,Math.PI*1.55),0x27353b,3,5.9,-6);hook.rotation.z=-.7;
      // Corrugated ends with paired doors, locking bars and corner castings.
      for(let row=0;row<2;row++)for(let i=0;i<3;i++){const cx=(i-1)*6,cy=1.5+row*2.8;box(cx,cy,-2.03,.08,2.55,.06,0x354650);for(const side of [-1,1]){box(cx+side*1.55,cy,-2.07,.065,2.35,.08,0x998778);box(cx+side*1.45,cy-.45,-2.12,.4,.07,.08,0x354650);for(const h of [-1.15,1.15])box(cx+side*2.5,cy+h,-2.05,.2,.16,.08,0x354650);}}
      // Deck expansion joints, edge paint and tire fenders give the quay scale.
      for(let i=-12;i<=12;i+=3)box(i,.386,-1,.035,.018,20,0x625c51);
      for(let i=-12;i<=12;i+=2)box(i,.4,-10.2,1,.025,.18,0xdbba49);
      for(let i=-9;i<=9;i+=6)mesh(new THREE.TorusGeometry(.7,.22,6,12),0x27353b,i,-.1,-11.25);
    }else if(landmark.kind==='ruins'){
      cylinder(0,.4,0,10,11,1.2,0xb4ae87,8);box(0,1.1,0,15,.8,12,0xc4b88c);
      for(const a of [-5,-1.7,1.7,5])for(const b of [-4,4]){cylinder(a,4.6,b,.75,.95,6.6,0xd7caa5,10);box(a,7.9,b,2.1,.6,2.1,0xcabc97);}
      box(0,8.45,-4,13,.65,2,0xcabc97);box(0,8.45,4,13,.65,2,0xcabc97);
      const roof=mesh(new THREE.ConeGeometry(8.7,3,4),0xbda77c,0,10,0);roof.rotation.y=Math.PI/4;roof.scale.z=.7;
      for(let i=0;i<4;i++){const ruin=cylinder(-6+i*3,1.6,8,.8,.8,4,0xcabc97,12);ruin.rotation.z=1.2;}
      for(const a of [-5,-1.7,1.7,5])for(const b of [-4,4]){for(const y of [1.7,2,7.2,7.55])cylinder(a,y,b,1.02,1.02,.18,0xcabc97,16);for(let j=0;j<10;j++){const t=j*Math.PI/5;spar([a+Math.cos(t)*.79,2.2,b+Math.sin(t)*.79],[a+Math.cos(t)*.65,7,b+Math.sin(t)*.65],.06,0xb4ae87);}}
      for(const z of [-4,4])for(let x=-5.8;x<=5.8;x+=1.45)box(x,8.42,z, .18,.72,2.04,0xb4ae87);
      for(let i=0;i<3;i++)box(0,.25+i*.22,-7.8+i*.58,10-i*.6,.25,1.1,0xcabc97);
      for(let i=0;i<16;i++)rock(Math.sin(i*2.4)*8,1,Math.cos(i*2.4)*7, .45+i%3*.2,0xcabc97,i);
      for(const side of [-1,1]){
        // Pediment relief, cornice teeth, tiled roof ridges and carved acroteria.
        for(let i=-6;i<=6;i++)box(i,8.93,side*4.8,.25,.25,.5,0xd7caa5);
        for(let i=-5;i<=5;i++){const h=Math.max(.1,1.7-Math.abs(i)*.29);box(i,9.3+h/2,side*4.25,.42,h,.2,0xd7caa5);}
        for(let i=-6;i<=6;i+=1.5)spar([i,10.95-Math.abs(i)*.3,0],[i,8.65,side*5.4],.06,0xcabc97);
        box(side*8,1.2,-2,1.8,2.4,1.8,0xcabc97);const statue=mesh(new THREE.IcosahedronGeometry(.9,1),0xd7caa5,side*8,3,-2);statue.scale.set(.65,1.7,.65);mesh(new THREE.IcosahedronGeometry(.4,1),0xd7caa5,side*8,4.4,-2);
      }
      for(let i=0;i<5;i++)box(0,.06+i*.14,-11.5+i*.62,8.5-i*.28,.2,1,0xcabc97);
    }else if(landmark.kind==='waterfall'){
      for(const a of [-7,0,7]){const cliff=mesh(new THREE.IcosahedronGeometry(7,2),0x7b8472,a,5,2);cliff.scale.set(.75,1.5,.7);cliff.rotation.y=a*.3;}
      for(let i=0;i<24;i++){const a=i%6,x=-10+a*4,y=1+Math.floor(i/6)*3;const ledge=rock(x,y,1.3+Math.sin(i)*1.4,1.7, i%3?0x7b8472:0x629361,i);ledge.scale.set(1.6,.35,.65);}
      const stream=mesh(createIslandBand(10.5,4,[[1,11.7],[.82,12.05],[0,12.08]],40),0x629361);stream.scale.z=.48;stream.position.z=2;
      const falls=new THREE.Group();falls.position.set(x,0,z);falls.rotation.y=-p.angle;w.scene.add(falls);
      const time={value:0},material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,fog:true,uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),time},vertexShader:`
        varying vec2 vUv;
        #include <fog_pars_vertex>
        void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
        }`,fragmentShader:`
        uniform float time;varying vec2 vUv;
        #include <fog_pars_fragment>
        void main(){float ribbons=sin(vUv.x*91.+sin(vUv.y*11.-time*4.))*sin(vUv.x*37.+time*.6);float rush=sin(vUv.y*97.+time*13.+ribbons*3.);float foam=smoothstep(.3,.85,ribbons*.5+rush*.35)+pow(abs(vUv.x-.5)*2.,5.)*.35;vec3 water=mix(vec3(.16,.51,.53),vec3(.8,.95,.88),clamp(foam,0.,1.));gl_FragColor=vec4(water,.79+foam*.2);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
        }`});
      const poolMaterial=new THREE.MeshStandardMaterial({color:0x68aaaa,roughness:.15,metalness:.3});
      const pool=w.mesh(new THREE.CircleGeometry(10,48),poolMaterial,0,.02,-4.2,falls);pool.rotation.x=-Math.PI/2;pool.scale.y=.65;
      for(const a of [-5,5]){
        const curtain=new THREE.PlaneGeometry(3.6,12,12,18),pos=curtain.attributes.position;
        for(let i=0;i<pos.count;i++){const px=pos.getX(i),py=pos.getY(i);pos.setZ(i,.16*Math.sin(px*8)+.4*Math.pow((6-py)/12,3));}curtain.computeVertexNormals();w.mesh(curtain,material,a,6.1,-1.9,falls);
        const foam=w.mesh(new THREE.CircleGeometry(2.9,32),new THREE.MeshBasicMaterial({color:0xe6fbf1,transparent:true,opacity:.68,depthWrite:false}),a,.08,-2.2,falls);foam.rotation.x=-Math.PI/2;foam.scale.y=.65;
        for(let i=0;i<7;i++)rock(a+Math.sin(i*2.4)*3.3,.1,-3+Math.cos(i*2.4)*3.3,.65+i%3*.2,0x7b8472,i);
      }
      animated.push({kind:'waterfall',mesh:falls,material,time,x,z,mistX:x+2*Math.sin(p.angle),mistZ:z-2*Math.cos(p.angle)});
    }else if(landmark.kind==='lighthouse'){
      cylinder(0,6,0,2.5,3.6,13,0xe8dfbd,18);for(const y of [3,7,11])cylinder(0,y,0,3.4-y*.07,3.5-y*.07,1.4,0xc65342,18);
      cylinder(0,13.2,0,3.8,3.8,.6,0x263944,18);cylinder(0,14.4,0,2.2,2.2,2,0x9ccbc9,16);mesh(new THREE.ConeGeometry(3.3,2,16),0xb94938,0,16,0);
      box(-6,1.3,3,5,2.6,6,0xe8dfbd);
      // A pitched keeper's roof, chimney and inset windows replace the flat slab.
      for(const sign of [-1,1]){const roof=box(-6+sign*1.55,3.5,3,3.5,.18,7,0xb94938);roof.rotation.z=-sign*.4;box(-6+sign*2.51,1.55,3,.05,1,1.1,0x263944);box(-6+sign*2.56,1.5,3,.08,.08,1.2,0xe8dfbd);}
      box(-7.5,4.2,4.5,.6,1.7,.7,0xe8dfbd);box(-7.5,5.08,4.5,.8,.2,.9,0x263944);
      box(-6,1, -.035,1.1,2,.08,0x263944);box(-6,.08,-.7,1.8,.16,1.1,0x998778);
      // Balcony rails and lantern mullions produce a fine silhouette in sunset light.
      for(const y of [13.55,14.1])ring(0,y,0,3.55,.065,0x263944);
      for(let i=0;i<20;i++){const a=i*Math.PI/10;spar([Math.cos(a)*3.55,13.4,Math.sin(a)*3.55],[Math.cos(a)*3.55,14.15,Math.sin(a)*3.55],.045,0x263944);}
      for(let i=0;i<8;i++){const a=i*Math.PI/4;spar([Math.cos(a)*2.23,13.5,Math.sin(a)*2.23],[Math.cos(a)*2.23,15.35,Math.sin(a)*2.23],.075,0x263944);}
      ring(0,15.3,0,2.25,.1,0x263944);cylinder(0,17.25,0,.08,.14,.65,0x263944,8);
      for(const y of [4.8,8.6]){const r=3.6-y*.085;box(r,y,0,.09,1.2,.65,0x263944);box(r+.06,y-.65,0,.24,.12,.95,0xe8dfbd);}
      for(let i=0;i<8;i++)box(-1+i*.72,.08,4.5+Math.sin(i*.25),.6,.16,1.3,0x998778);
      const beam=new THREE.Group();beam.position.set(x,14.3,z);w.scene.add(beam);
      const light=w.mesh(new THREE.ConeGeometry(5,30,16,1,true),new THREE.MeshBasicMaterial({color:0xffe5a0,transparent:true,opacity:.1,blending:THREE.AdditiveBlending,depthWrite:false}),15,0,0,beam);light.rotation.z=Math.PI/2;
      animated.push({kind:'lighthouse',mesh:beam});
    }else if(landmark.kind==='shipwreck'){
      const hull=mesh(new THREE.SphereGeometry(1,16,8),0x713d35,0,1,0);hull.scale.set(16,4,5);hull.rotation.z=.13;
      box(-1,4,0,22,.5,7,0x9c7454);box(-5,6.1,0,6,4,6,0xc5bba0);box(-5,8.4,0,7,.6,7,0x524b46);
      const mast=cylinder(4,9,0,.25,.4,15,0x544c43,8);mast.rotation.z=-.28;box(6,11,0,.2,.3,10,0x544c43);
      // A low-poly billowing, torn sail: 96 triangles rather than a flat rectangle.
      const sailGeometry=new THREE.PlaneGeometry(5,6,8,6),positions=sailGeometry.attributes.position;
      for(let i=0;i<positions.count;i++){const sx=positions.getX(i),sy=positions.getY(i);positions.setZ(i,Math.sin((sx/5+.5)*Math.PI)*Math.cos(sy/7)*.85);if(sy< -2.9)positions.setY(i,sy+(.5+.5*Math.sin(i*4.7))*.8);}
      sailGeometry.computeVertexNormals();const sail=mesh(sailGeometry,new THREE.MeshStandardMaterial({color:0xe0cda3,side:THREE.DoubleSide,roughness:.95}),7,10,1);sail.rotation.y=.6;
      for(let i=-10;i<=9;i+=1.15)box(i,4.27,0,.035,.025,6.8,0x524b46);
      for(const sign of [-1,1]){for(let i=-7;i<=8;i+=2.5){const port=mesh(new THREE.TorusGeometry(.36,.07,5,12),0x9c7454,i,2.7,sign*4.15);mesh(new THREE.CircleGeometry(.3,12),0x3a3333,i,2.7,sign*4.16).rotation.y=sign<0?Math.PI:0;if(sign<0)port.rotation.y=Math.PI;}
        for(let i=-10;i<=9;i+=3)spar([i,4.3,sign*3.3],[i,5,sign*3.3],.05,0x544c43);
        spar([-10,5,sign*3.3],[9,5,sign*3.3],.05,0x544c43);
        spar([6,16,0],[9,4.4,sign*3.2],.035,0x544c43);spar([6,16,0],[-9,4.4,sign*3.2],.035,0x544c43);
        for(const a of [-6.5,-4])box(a,6.6,sign*3.02,1.3,1.1,.06,0x3a3333);
      }
      box(-5,6.4,-3.06,.08,1.2,.06,0x9c7454);
      for(const a of [-13,13]){const rib=box(a,3.5,0,1.1,6,8,0x3a3333);rib.rotation.z=a>0?-.25:.3;}
    }
  }
  return animated;
}
export function animateLandmarks(w,now){
  for(const l of w.landmarks){
    if(l.kind==='lighthouse')l.mesh.rotation.y=now*.00035;
    if(l.kind==='waterfall'){l.time.value=now/1000;if(w.emitParticles&&Math.hypot(w.camera.position.x-l.x,w.camera.position.z-l.z)<100)w.particle(l.mistX+(Math.random()-.5)*8,.5,l.mistZ,'steam');}
    if(l.kind==='geyser'){
      const cycle=(now/1000+l.phase)%8,height=3+18*Math.pow(Math.max(0,Math.sin(cycle/8*Math.PI)),3);
      for(const [i,mesh]of l.jets.entries()){const h=height*(.7+.3*Math.sin(now*.012+i)**2);mesh.scale.y=h;mesh.position.y=h/2;}
      const matrix=l.dropletMatrix;for(let i=0;i<48;i++){const t=((now/1500+i*.137)%1),a=i*2.39996,r=.4+2.8*t,dy=height*(1-t*t);matrix.makeTranslation(Math.cos(a)*r,dy,Math.sin(a)*r);l.droplets.setMatrixAt(i,matrix);}l.droplets.instanceMatrix.needsUpdate=true;
      if(w.emitParticles&&Math.hypot(w.camera.position.x-l.x,w.camera.position.z-l.z)<150)for(let i=0;i<2;i++)w.particle(l.x+(Math.random()-.5)*2,height,l.z+(Math.random()-.5)*2,'steam');
    }
    if(l.kind==='volcano'){l.mesh.scale.setScalar(.93+Math.sin(now*.004)*.07);if(w.emitParticles&&Math.hypot(w.camera.position.x-l.x,w.camera.position.z-l.z)<150){w.particle(l.x+(Math.random()-.5)*3,l.y,l.z+(Math.random()-.5)*3,'smoke');if(Math.random()<.3)w.particle(l.x,l.y,l.z,'fire',(Math.random()-.5)*3,(Math.random()-.5)*3);}}
  }
}
