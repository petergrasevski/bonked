import * as THREE from 'three';
// A single ocean pass: displaced swells, analytic normals, sky reflection and
// sun glints. No reflection camera, scene copy, or full-screen postprocessing.
const waves=`
vec3 wave(vec2 p,vec2 d,float frequency,float amplitude,float speed){
  float phase=dot(p,d)*frequency+time*speed;
  return vec3(amplitude*sin(phase),d*amplitude*frequency*cos(phase));
}
vec3 surface(vec2 p){
  return wave(p,vec2(.94,.342),.13,.19,.65)
    +wave(p,vec2(-.45,.893),.23,.13,.9)
    +wave(p,vec2(.6,-.8),.48,.07,1.1);
}`;
const vertex=`
uniform float time;varying vec3 vWorld;varying vec2 vUv;
${waves}
void main(){vUv=uv;vec4 world=modelMatrix*vec4(position,1.);world.y+=surface(world.xz).x;vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`;
const noise=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}`;
export function createCoastalWater(track,segments,fog){
  const time={value:0},fogColor={value:fog.color.clone()},fogDensity={value:fog.density};
  const bounds={minX:Math.min(...track.map(p=>p.x))-100,minZ:Math.min(...track.map(p=>p.z))-100,maxX:Math.max(...track.map(p=>p.x))+100,maxZ:Math.max(...track.map(p=>p.z))+100};
  const width=bounds.maxX-bounds.minX,height=bounds.maxZ-bounds.minZ;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;const ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,1024,1024);ctx.lineJoin=ctx.lineCap='round';
  ctx.scale(1024/width,1024/height);ctx.translate(-bounds.minX,-bounds.minZ);
  for(let size=100;size>=12;size-=2){const shade=Math.round(225*Math.exp(-(size-12)/22));ctx.beginPath();track.forEach((p,i)=>i?ctx.lineTo(p.x,p.z):ctx.moveTo(p.x,p.z));ctx.closePath();ctx.lineWidth=size;ctx.strokeStyle=`rgb(${shade},${shade},${shade})`;ctx.stroke();}
  const depthTexture=new THREE.CanvasTexture(canvas);depthTexture.colorSpace=THREE.NoColorSpace;depthTexture.generateMipmaps=false;depthTexture.minFilter=THREE.LinearFilter;depthTexture.magFilter=THREE.LinearFilter;
  const waterMaterial=new THREE.ShaderMaterial({fog:true,uniforms:{time,fogColor,fogDensity,coastMap:{value:depthTexture},coastBounds:{value:new THREE.Vector4(bounds.minX,bounds.minZ,width,height)}},vertexShader:vertex,fragmentShader:`
    uniform float time;uniform vec3 fogColor;uniform float fogDensity;uniform sampler2D coastMap;uniform vec4 coastBounds;varying vec3 vWorld;varying vec2 vUv;
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
      vec3 sky=mix(vec3(.68,.76,.78),vec3(.19,.39,.64),smoothstep(0.,.8,reflected.y));
      float fresnel=.035+.965*pow(1.-max(dot(normal,view),0.),5.);
      vec3 color=mix(water,sky,clamp(fresnel,.035,.85));
      vec3 sun=normalize(vec3(-55.,62.,-44.));float shine=max(0.,dot(reflect(-sun,normal),view));
      color+=vec3(1.,.82,.55)*(pow(shine,420.)*2.6+pow(shine,45.)*.09);
      float crest=smoothstep(.27,.36,w.x)*smoothstep(.66,.9,noise(p*.8+time*.07));color=mix(color,vec3(.55,.8,.79),crest*.2);
      float distanceToEye=length(cameraPosition-vWorld);float haze=1.-exp(-pow(fogDensity*distanceToEye,2.));
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,haze);
    }`});
  const geometry=new THREE.PlaneGeometry(2000,2000,128,128);geometry.rotateX(-Math.PI/2);const water=new THREE.Mesh(geometry,waterMaterial);water.position.y=-2.1;
  // Coastline foam has road-distance UVs, so it flows around bends without seams.
  const vertices=[],uv=[];
  for(const side of [-1,1])for(let i=0;i<segments.length;i++){
    const a=segments[i],b=segments[(i+1)%segments.length],corners=[];
    for(const [s,distance]of [[a,a.start],[b,i+1===segments.length?a.start+a.len:b.start]])for(const edge of [0,1]){const offset=(s.halfWidth+.65+edge*3.4)*side;corners.push({p:[s.x+s.nx*offset,-2.06,s.z+s.nz*offset],uv:[distance/5,edge]});}
    for(const j of [0,1,2,1,3,2]){vertices.push(...corners[j].p);uv.push(...corners[j].uv);}
  }
  const shoreGeo=new THREE.BufferGeometry();shoreGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));shoreGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  const shoreMaterial=new THREE.ShaderMaterial({uniforms:{time,fogColor,fogDensity},vertexShader:vertex,transparent:true,depthWrite:false,side:THREE.DoubleSide,fragmentShader:`
    uniform float time;uniform vec3 fogColor;uniform float fogDensity;varying vec3 vWorld;varying vec2 vUv;${noise}
    void main(){float grain=noise(vWorld.xz*1.9+time*.12),wash=sin(vUv.y*13.-time*1.3+sin(vUv.x*1.8)*1.2)*.5+.5;
      float alpha=(.08+.48*smoothstep(.45,.8,wash))*pow(1.-vUv.y,1.7)*(.3+.7*grain)+.22*(1.-smoothstep(0.,.08,vUv.y));
      alpha*=exp(-pow(fogDensity*length(cameraPosition-vWorld),2.));gl_FragColor=vec4(.65,.9,.87,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const shore=new THREE.Mesh(shoreGeo,shoreMaterial);
  return {water,shore,waterMaterial,depthTexture};
}
