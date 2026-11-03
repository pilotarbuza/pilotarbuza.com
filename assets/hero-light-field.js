/**
 * Particle occupancy and illumination in a 64³ volume, with a sphere material.
 * The volume is stored as a 512² atlas so the same path works in WebGL 2 without
 * layered framebuffer attachments. All geometry is supplied by the caller.
 *
 * const field = createHeroLightField({ THREE, renderer, sampleUVs, center, track });
 * field.bindGeometry(instancedGeometry); // adds explicit emission flags, if supplied
 * const mesh = new THREE.Mesh(instancedGeometry, field.material);
 * field.update(currentPositionTexture, frameSeconds); // before rendering the mesh
 *
 * Material attributes: simUv (vec2), rand (vec2), optional emissive (float).
 * Position textures contain world XYZ and remaining life in W, decreasing 1→0.
 * Material alpha is bloom energy, so preserve it in the scene render target and
 * extract bloom as scene.rgb * scene.a. The material itself uses no blending.
 * `track` receives one owner with an idempotent dispose; do not track material twice.
 */
(function () {
  'use strict';

  window.createHeroLightField = function ({
    THREE: T, renderer, sampleUVs, emissiveFlags,
    center = new T.Vector3(), track,
  }) {
    if (!sampleUVs || sampleUVs.length < 2 || sampleUVs.length % 2 !== 0) {
      throw new Error('Particle light field requires pairs of simulation UVs');
    }
    const count = sampleUVs.length / 2;
    if (emissiveFlags && emissiveFlags.length !== count) {
      throw new Error('Particle emission flags must match simulation UV count');
    }
    const grid = 64, columns = 8, atlasSize = 512;
    const voxelSize = 8 / 63;
    const extent = voxelSize * grid;
    const resources = [];
    const own = resource => (resources.push(resource), resource);
    let disposed = false, initialized = false;
    const fieldCenter = center.clone();
    const fieldOrigin = center.clone().addScalar(-extent * .5);
    // The first texel column contains the luminous particles by default.
    const emissiveCut = Math.max(.000001, sampleUVs[0] * 2);
    const flags = emissiveFlags || new Float32Array(count);
    if (!emissiveFlags) {
      for (let i = 0; i < count; i++) flags[i] = sampleUVs[i * 2] < emissiveCut ? 1 : 0;
    }
    const targetOptions = {
      type: T.HalfFloatType, minFilter: T.LinearFilter, magFilter: T.LinearFilter,
      depthBuffer: false, stencilBuffer: false,
    };
    const splats = own(new T.WebGLRenderTarget(atlasSize, atlasSize, targetOptions));
    let current = own(splats.clone()), history = own(splats.clone());
    const fieldUniforms = {
      particleField: { value: current.texture },
      fieldCenter: { value: fieldCenter },
      fieldOrigin: { value: fieldOrigin },
      fieldExtent: { value: extent },
      fieldGrid: { value: grid },
      fieldColumns: { value: columns },
      fieldAtlasSize: { value: new T.Vector2(atlasSize, atlasSize) },
    };
    const fieldGLSL = `
      uniform sampler2D particleField;
      uniform vec3 fieldCenter, fieldOrigin;
      uniform float fieldExtent, fieldGrid, fieldColumns;
      uniform vec2 fieldAtlasSize;
      vec2 fieldUV(vec3 cell) {
        cell = clamp(cell, vec3(.5), vec3(fieldGrid-.5));
        float slice = floor(cell.z);
        vec2 tile = vec2(mod(slice,fieldColumns), floor(slice/fieldColumns));
        // World-grid coordinates are integer-indexed; address texel centres.
        return (tile*fieldGrid + cell.xy + .5) / fieldAtlasSize;
      }
      vec4 sampleFieldGrid(sampler2D map, vec3 cell) {
        float slicePosition = cell.z-.5;
        vec3 lower = vec3(cell.xy, floor(slicePosition)+.5);
        return mix(texture2D(map,fieldUV(lower)),
          texture2D(map,fieldUV(lower+vec3(0.,0.,1.))), fract(slicePosition));
      }
      vec4 sampleParticleField(vec3 worldPoint) {
        return sampleFieldGrid(particleField,
          (worldPoint-fieldOrigin)/fieldExtent*fieldGrid);
      }
    `;
    const camera = new T.Camera();
    const splatScene = new T.Scene();
    const splatGeometry = own(new T.BufferGeometry());
    // Position stores UV coordinates here; its count determines the point count.
    splatGeometry.setAttribute('position', new T.BufferAttribute(sampleUVs, 2));
    splatGeometry.setAttribute('emissive', new T.BufferAttribute(flags, 1));
    const splatMaterial = own(new T.ShaderMaterial({
      name: 'HeroParticleFieldSplat',
      uniforms: { ...fieldUniforms, curr: { value: null } },
      vertexShader: `${fieldGLSL}
        uniform sampler2D curr;
        attribute float emissive;
        varying vec4 fieldValue;
        void main() {
          vec4 state = texture2D(curr,position.xy);
          vec3 cell = (state.xyz-fieldOrigin)/fieldExtent*fieldGrid;
          gl_Position = vec4(fieldUV(cell)*2.-1.,0.,1.);
          gl_PointSize = 1.;
          float fade = clamp((1.-state.w)/.1,0.,1.);
          fieldValue = vec4(vec3(mix(.1,1.,emissive)),1.)*fade;
        }`,
      fragmentShader: `varying vec4 fieldValue;
        void main() { gl_FragColor=fieldValue; }`,
      depthTest: false, depthWrite: false, transparent: true,
      blending: T.CustomBlending,
      blendEquation: T.MaxEquation, blendEquationAlpha: T.MaxEquation,
      blendSrc: T.OneFactor, blendDst: T.OneFactor,
      blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneFactor,
    }));
    const points = new T.Points(splatGeometry, splatMaterial);
    points.frustumCulled = false;
    splatScene.add(points);

    const blurScene = new T.Scene();
    const blurMaterial = own(new T.ShaderMaterial({
      name: 'HeroParticleFieldFilter',
      uniforms: {
        ...fieldUniforms, freshField: { value: splats.texture },
        historyField: { value: history.texture }, delta: { value: 1 / 60 },
        firstFrame: { value: 1 },
      },
      vertexShader: `varying vec2 vUV;
        void main() { vUV=uv; gl_Position=vec4(position.xy,0.,1.); }`,
      fragmentShader: `${fieldGLSL}
        varying vec2 vUV;
        uniform sampler2D freshField, historyField;
        uniform float delta, firstFrame;
        vec4 crossSection(vec3 cell) {
          vec4 value = texture2D(freshField,fieldUV(cell+vec3(-.5,-.5,0.)));
          value += texture2D(freshField,fieldUV(cell+vec3(.5,-.5,0.)));
          value += texture2D(freshField,fieldUV(cell+vec3(-.5,.5,0.)));
          value += texture2D(freshField,fieldUV(cell+vec3(.5,.5,0.)));
          return value*.25;
        }
        void main() {
          vec2 pixel = gl_FragCoord.xy;
          vec2 tile = floor(pixel/fieldGrid);
          vec3 cell = vec3(mod(pixel,fieldGrid),tile.x+tile.y*fieldColumns+.5);
          vec4 fresh = (crossSection(cell-vec3(0.,0.,1.))+
            crossSection(cell)*2.+crossSection(cell+vec3(0.,0.,1.)))*.25;
          vec4 old = texture2D(historyField,vUV);
          float rate = mix(.15,.08,clamp(old.r,0.,1.));
          rate = 1.-pow(1.-rate,clamp(delta*60.,0.,6.));
          gl_FragColor = mix(old,fresh,mix(rate,1.,firstFrame));
        }`,
      depthTest: false, depthWrite: false, blending: T.NoBlending,
    }));
    const plane = own(new T.PlaneGeometry(2, 2));
    blurScene.add(new T.Mesh(plane, blurMaterial));

    const uniforms = {
      ...fieldUniforms, curr: { value: null },
      emissiveCut: { value: emissiveCut }, sizeMultiplier: { value: 1 },
    };
    const material = own(new T.ShaderMaterial({
      name: 'HeroParticleVolumeMaterial',
      uniforms,
      defines: emissiveFlags ? { HAS_EMISSIVE_ATTRIBUTE: 1 } : {},
      vertexShader: `${fieldGLSL}
        attribute vec2 simUv, rand;
        #ifdef HAS_EMISSIVE_ATTRIBUTE
          attribute float emissive;
        #endif
        uniform sampler2D curr;
        uniform float emissiveCut, sizeMultiplier;
        varying vec3 vWorld, vWorldNormal, vViewNormal;
        varying float vDiffuse, vAO, vEmission;
        vec4 hash43(vec3 p) {
          vec4 p4 = fract(vec4(p.xyzx)*vec4(.1031,.1030,.0973,.1099));
          p4 += dot(p4,p4.wzxy+33.33);
          return fract((p4.xxyz+p4.yzzw)*p4.zywx);
        }
        void main() {
          vec4 state = texture2D(curr,simUv);
          #ifdef HAS_EMISSIVE_ATTRIBUTE
            float luminous = emissive;
          #else
            float luminous = 1.-step(emissiveCut,simUv.x);
          #endif
          float life = clamp(state.w/.1,0.,1.)*clamp((1.-state.w)/.1,0.,1.);
          float size = mix(.06,.175,luminous)*(.5+hash43(vec3(simUv,0.)).x*.5)*life*sizeMultiplier;
          vec3 pos = state.xyz+position*size;
          vec4 world = modelMatrix*vec4(pos,1.);
          gl_Position = projectionMatrix*modelViewMatrix*vec4(pos,1.);
          vWorld = world.xyz;
          vViewNormal = normalMatrix*normal;
          vWorldNormal = normalize((vec4(vViewNormal,0.)*viewMatrix).xyz);
          float voxel = fieldExtent/fieldGrid;
          vec4 neighbourhood = sampleParticleField(vWorld+vWorldNormal*voxel);
          float lifeLight = mix(.5,1.,life);
          vAO = 1.-neighbourhood.a;
          vDiffuse = vAO*lifeLight*clamp((5.-length(vWorld-fieldCenter))/3.5,0.,1.);
          vEmission = (neighbourhood.a*.55*lifeLight+.45)*luminous;
        }`,
      fragmentShader: `${fieldGLSL}
        varying vec3 vWorld, vWorldNormal, vViewNormal;
        varying float vDiffuse, vAO, vEmission;
        vec3 pixelNoise(vec2 pixel) {
          vec3 p = fract(vec3(pixel.xyx)*vec3(.1031,.1030,.0973));
          p += dot(p,p.yxz+33.33);
          return fract((p.xxy+p.yzz)*p.zyx);
        }
        float lightScatter(vec3 eye, vec3 surface) {
          vec3 from = fieldCenter+vec3(0.,10.,0.);
          vec3 to = fieldCenter+vec3(0.,-8.,0.);
          vec3 axis = normalize(to-from);
          float halfLength = length(to-from)*.5;
          vec3 ray = surface-eye;
          float rayLength = length(ray);
          vec3 direction = ray/max(rayLength,.0001);
          vec3 offset = eye-(from+to)*.5;
          float alignment = -dot(direction,axis);
          float rayProjection = dot(offset,direction);
          float axisProjection = -dot(offset,axis);
          float along = clamp((alignment*rayProjection-axisProjection)/
            max(.0001,abs(1.-alignment*alignment)),-halfLength,halfLength);
          vec3 nearest = (from+to)*.5+along*axis;
          vec3 q = eye-nearest;
          float b = dot(direction,q);
          float perpendicular2 = max(0.,dot(q,q)-b*b);
          float falloff = 1./(2.5+pow(.001+perpendicular2,.8));
          float integral = falloff*(atan((rayLength+b)*falloff)-atan(b*falloff));
          float denominator = mix(1.1,5.5,along/halfLength*.5+.5);
          return pow(max(0.,integral/denominator),2.);
        }
        void main() {
          vec3 N = normalize(vWorldNormal);
          vec3 incoming = normalize(vWorld-cameraPosition);
          vec3 noise = pixelNoise(gl_FragCoord.xy);
          vec3 jitter = (noise-.5)*.25;
          float voxel = fieldExtent/fieldGrid;
          vec3 reflected = reflect(incoming,N);
          vec3 refracted = refract(incoming,N,1./1.4);
          vec4 reflection = sampleParticleField(vWorld+
            normalize(reflected+jitter)*(1.+noise.z)*voxel);
          vec4 transmission = sampleParticleField(vWorld+
            normalize(refracted+jitter)*(1.5+noise.z)*voxel);
          float shade = vDiffuse*.45+reflection.r+
            transmission.r*(1.-transmission.a*.75);
          shade += lightScatter(cameraPosition,vWorld)*1.35;
          float viewShade = clamp((dot(normalize(vViewNormal),vec3(.5773503))+1.)*.5,0.,1.);
          shade = mix(shade,viewShade,vEmission*vAO)*(.4+vAO*.6);
          shade = mix(shade,smoothstep(0.,1.,shade),.5);
          gl_FragColor = vec4(vec3(shade),vDiffuse*vDiffuse+vEmission);
        }`,
      depthTest: true, depthWrite: true, blending: T.NoBlending,
    }));

    const clearColor = new T.Color();
    function update(currTexture, deltaSeconds = 1 / 60) {
      if (disposed || !currTexture) return;
      const oldTarget = renderer.getRenderTarget();
      renderer.getClearColor(clearColor);
      const oldAlpha = renderer.getClearAlpha();
      const oldAutoClear = renderer.autoClear;
      try {
        renderer.autoClear = false;
        renderer.setClearColor(0, 0);
        if (!initialized) {
          renderer.setRenderTarget(history); renderer.clear();
          renderer.setRenderTarget(current); renderer.clear();
        }
        renderer.setRenderTarget(splats); renderer.clear();
        splatMaterial.uniforms.curr.value = currTexture;
        renderer.render(splatScene, camera);
        const swap = history; history = current; current = swap;
        blurMaterial.uniforms.historyField.value = history.texture;
        blurMaterial.uniforms.delta.value = Math.max(0, deltaSeconds);
        blurMaterial.uniforms.firstFrame.value = initialized ? 0 : 1;
        renderer.setRenderTarget(current); renderer.render(blurScene, camera);
        fieldUniforms.particleField.value = current.texture;
        uniforms.curr.value = currTexture;
        initialized = true;
      } finally {
        renderer.autoClear = oldAutoClear;
        renderer.setClearColor(clearColor, oldAlpha);
        renderer.setRenderTarget(oldTarget);
      }
    }
    function bindGeometry(geometry) {
      if (emissiveFlags) geometry.setAttribute('emissive', new T.InstancedBufferAttribute(flags, 1));
      return geometry;
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      resources.forEach(resource => resource.dispose());
    }
    const api = { material, uniforms, fieldUniforms, update, bindGeometry, dispose };
    if (track) track(api);
    return api;
  };
})();
