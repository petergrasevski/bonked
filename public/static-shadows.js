import * as THREE from 'three';
// One scenery depth bake per circuit. Animated objects stay in the small live
// sun map; the bake shades only the sun, leaving ambient/rim lighting intact.
export class StaticShadows {
  constructor(renderer, casters, sunOffset, size = 4096) {
    size = Math.min(size, renderer.capabilities.maxTextureSize);
    this.size = size;
    this.materials = new WeakSet();
    this.matrix = new THREE.Matrix4();
    this.target = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    const scene = new THREE.Scene(),
      material = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        side: THREE.DoubleSide,
      });
    const bounds = new THREE.Box3();
    for (const source of casters) {
      if (!source.castShadow) continue;
      source.updateWorldMatrix(true, false);
      const mesh = new THREE.Mesh(source.geometry, material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(source.matrixWorld);
      scene.add(mesh);
      bounds.expandByObject(mesh);
    }
    if (bounds.isEmpty()) throw new Error('No static shadow casters');
    const center = bounds.getCenter(new THREE.Vector3()),
      span = bounds.getSize(new THREE.Vector3()).length(),
      direction = new THREE.Vector3(...sunOffset).normalize();
    const camera = new THREE.OrthographicCamera();
    camera.position.copy(center).addScaledVector(direction, span + 100);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    const viewBounds = new THREE.Box3();
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z])
          viewBounds.expandByPoint(
            new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse),
          );
    Object.assign(camera, {
      left: viewBounds.min.x - 2,
      right: viewBounds.max.x + 2,
      bottom: viewBounds.min.y - 2,
      top: viewBounds.max.y + 2,
      near: Math.max(0.1, -viewBounds.max.z - 10),
      far: -viewBounds.min.z + 10,
    });
    camera.updateProjectionMatrix();
    this.normalBias = Math.max(0.08, ((camera.right - camera.left) / size) * 0.35);
    this.matrix
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse);
    this.texture = new THREE.FramebufferTexture(size, size);
    this.texture.name = 'Cached scenery shadows';
    const previous = renderer.getRenderTarget(),
      enabled = renderer.shadowMap.enabled,
      clear = renderer.getClearColor(new THREE.Color()),
      alpha = renderer.getClearAlpha();
    try {
      renderer.shadowMap.enabled = false;
      renderer.setRenderTarget(this.target);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.copyFramebufferToTexture(this.texture);
    } finally {
      renderer.setRenderTarget(previous);
      renderer.setClearColor(clear, alpha);
      renderer.shadowMap.enabled = enabled;
      material.dispose();
      this.target.dispose();
    }
    for (const source of casters) source.castShadow = false;
  }
  apply(root) {
    root.traverse((object) => {
      for (const material of object.material
        ? Array.isArray(object.material)
          ? object.material
          : [object.material]
        : [])
        this.applyMaterial(material);
    });
  }
  applyMaterial(material) {
    if (
      !material.isMeshStandardMaterial ||
      material.userData.skipBakedShadow ||
      this.materials.has(material)
    )
      return;
    this.materials.add(material);
    const previous = material.onBeforeCompile,
      key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      Object.assign(shader.uniforms, {
        bakedShadowMap: { value: this.texture },
        bakedShadowMatrix: { value: this.matrix },
        bakedShadowBias: { value: this.normalBias },
        bakedShadowTexel: { value: 1 / this.size },
      });
      shader.vertexShader =
        'uniform mat4 bakedShadowMatrix;uniform float bakedShadowBias;varying vec4 vBakedShadow;\n' +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 bakePoint=vec4(transformed,1.);
        #ifdef USE_INSTANCING
          bakePoint=instanceMatrix*bakePoint;
        #endif
        bakePoint=modelMatrix*bakePoint;
        bakePoint.xyz+=inverseTransformDirection(transformedNormal,viewMatrix)*bakedShadowBias;
        vBakedShadow=bakedShadowMatrix*bakePoint;`,
      );
      shader.fragmentShader =
        'uniform sampler2D bakedShadowMap;uniform float bakedShadowTexel;varying vec4 vBakedShadow;\n' +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <packing>',
        `#include <packing>
        float sceneryShadow(){
          vec3 p=vBakedShadow.xyz/vBakedShadow.w;
          if(p.x<0.||p.x>1.||p.y<0.||p.y>1.||p.z<0.||p.z>1.)return 1.;
          vec2 grid=p.xy/bakedShadowTexel-.5,f=fract(grid),base=floor(grid);float sum=0.;
          for(int y=0;y<2;y++)for(int x=0;x<2;x++){
            vec2 corner=vec2(float(x),float(y)),weight=mix(1.-f,f,corner);
            sum+=weight.x*weight.y*step(p.z-.00025,unpackRGBAToDepth(texture2D(bakedShadowMap,(base+corner+.5)*bakedShadowTexel)));
          }
          return sum;
        }`,
      );
      const lights = THREE.ShaderChunk.lights_fragment_begin.replace(
        'getDirectionalLightInfo( directionalLight, directLight );',
        `getDirectionalLightInfo( directionalLight, directLight );
        #if UNROLLED_LOOP_INDEX == 0
          if(receiveShadow)directLight.color*=sceneryShadow();
        #endif`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_begin>',
        lights,
      );
    };
    material.customProgramCacheKey = () => `${key}-baked-sun-v1`;
    material.needsUpdate = true;
  }
  dispose() {
    this.texture.dispose();
  }
}
