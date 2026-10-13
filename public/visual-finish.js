import * as THREE from 'three';

// One scene draw, two quarter-resolution bloom draws, one output draw.
// The same visual finish runs on desktop and touch devices.
const vertexShader=`varying vec2 vUv;void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}`;
const bloomFragment=`
  uniform sampler2D source;uniform vec2 stepUV;uniform float extract;
  varying vec2 vUv;
  vec3 tap(vec2 uv){vec3 c=texture2D(source,uv).rgb;float l=max(c.r,max(c.g,c.b));
    return mix(c,c*smoothstep(1.1,2.3,l),extract);}
  void main(){vec3 c=tap(vUv)*.227027;
    c+=(tap(vUv+stepUV*1.384615)+tap(vUv-stepUV*1.384615))*.316216;
    c+=(tap(vUv+stepUV*3.230769)+tap(vUv-stepUV*3.230769))*.070270;
    gl_FragColor=vec4(c,1.);
  }`;
const finishFragment=`
  uniform sampler2D sceneColor,sceneDepth,bloom;
  uniform mat4 inverseProjection;uniform vec2 texel;uniform float projectionY;
  varying vec2 vUv;
  vec3 viewPoint(vec2 uv,float depth){vec4 p=inverseProjection*vec4(uv*2.-1.,depth*2.-1.,1.);return p.xyz/p.w;}
  void main(){
    vec3 c=texture2D(sceneColor,vUv).rgb;
    float depth=texture2D(sceneDepth,vUv).r;
    vec3 p=viewPoint(vUv,depth);
    // Derivatives supply a geometric normal without a second geometry pass.
    vec3 geometricNormal=cross(dFdx(p),dFdy(p));
    vec3 n=geometricNormal*inversesqrt(max(dot(geometricNormal,geometricNormal),1e-12));
    if(dot(n,-p)<0.)n=-n;
    float ao=0.;
    if(depth<.99999){
      float radius=2.4;
      float screenRadius=clamp(radius*projectionY/max(1.,-p.z)*.5,texel.y*2.,.055);
      for(int i=0;i<12;i++){
        float a=float(i)*2.399963;float r=sqrt((float(i)+.5)/12.);
        vec2 uv=vUv+vec2(cos(a)*texel.x/texel.y,sin(a))*screenRadius*r;
        float d=texture2D(sceneDepth,uv).r;
        vec3 delta=viewPoint(uv,d)-p;float len=length(delta);
        float valid=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.)*step(d,.99999);
        float horizon=max(0.,dot(n,delta)/max(len,.001)-.12);
        ao+=horizon*(1.-smoothstep(.15,radius,len))*valid;
      }
    }
    c*=1.-clamp(ao/12.*1.65,0.,.32);
    c+=texture2D(bloom,vUv).rgb*.16;
    gl_FragColor=vec4(c,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class VisualFinish{
  constructor(renderer){
    this.renderer=renderer;this.size=new THREE.Vector2();
    const type=renderer.extensions&&!renderer.extensions.has('EXT_color_buffer_float')?THREE.UnsignedByteType:THREE.HalfFloatType;
    this.target=new THREE.WebGLRenderTarget(1,1,{type,samples:Math.min(4,renderer.capabilities.maxSamples)});
    this.target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    this.blurA=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:false});
    this.blurB=this.blurA.clone();
    this.blur=new THREE.ShaderMaterial({vertexShader,fragmentShader:bloomFragment,depthTest:false,depthWrite:false,toneMapped:false,
      uniforms:{source:{value:null},stepUV:{value:new THREE.Vector2()},extract:{value:1}}});
    this.finish=new THREE.ShaderMaterial({vertexShader,fragmentShader:finishFragment,depthTest:false,depthWrite:false,
      uniforms:{sceneColor:{value:this.target.texture},sceneDepth:{value:this.target.depthTexture},bloom:{value:this.blurB.texture},inverseProjection:{value:new THREE.Matrix4()},texel:{value:new THREE.Vector2()},projectionY:{value:1}}});
    this.geometry=new THREE.BufferGeometry();
    this.geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    this.quad=new THREE.Mesh(this.geometry,this.finish);this.quad.frustumCulled=false;
    this.scene=new THREE.Scene();this.scene.add(this.quad);this.camera=new THREE.Camera();
  }
  render(scene,camera){
    const r=this.renderer;r.getDrawingBufferSize(this.size);
    const w=this.size.x,h=this.size.y;
    if(this.target.width!==w||this.target.height!==h){
      this.target.setSize(w,h);this.blurA.setSize(Math.max(1,Math.ceil(w/4)),Math.max(1,Math.ceil(h/4)));this.blurB.setSize(this.blurA.width,this.blurA.height);
      this.finish.uniforms.texel.value.set(1/w,1/h);
    }
    const previous=r.getRenderTarget();
    try{
      r.setRenderTarget(this.target);r.render(scene,camera);
      this.quad.material=this.blur;this.blur.uniforms.source.value=this.target.texture;this.blur.uniforms.extract.value=1;
      this.blur.uniforms.stepUV.value.set(1/this.blurA.width,0);r.setRenderTarget(this.blurA);r.render(this.scene,this.camera);
      this.blur.uniforms.source.value=this.blurA.texture;this.blur.uniforms.extract.value=0;
      this.blur.uniforms.stepUV.value.set(0,1/this.blurB.height);r.setRenderTarget(this.blurB);r.render(this.scene,this.camera);
      this.finish.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);this.finish.uniforms.projectionY.value=camera.projectionMatrix.elements[5];
      this.quad.material=this.finish;r.setRenderTarget(previous);r.render(this.scene,this.camera);
    }finally{r.setRenderTarget(previous);}
  }
  dispose(){this.target.dispose();this.blurA.dispose();this.blurB.dispose();this.blur.dispose();this.finish.dispose();this.geometry.dispose();}
}
