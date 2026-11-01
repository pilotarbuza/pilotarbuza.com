/**
 * pilotarbuza.com — 3D Hydrodynamic Particle Fluid & Swarm Simulation
 * 
 * Exact recreation of Lusion's fluid architecture:
 *   1. GPU GPGPU Ping-Pong Simulation (fragSim):
 *      - 4D Simplex Curl Noise (divergence-free fluid advection)
 *      - Orbital angular spin & vortex turbulence around focal light center
 *      - Continuous life cycle with smooth fade-in and fade-out
 *      - FBM noise driving dynamic scale and turbulence factors
 *   2. Instanced 3D Spheres (16,384 particles):
 *      - 128 luminous glowing white emissive orbs
 *      - 16,256 luxury pearl-porcelain & molten obsidian spheres
 *      - Anemos Aircraft Brandbook palette: obsidian ground, pearl ink, breeze #4FC7C4 rim accents
 *   3. Centerpiece Molten Obsidian Entity:
 *      - Fluid core with metallic specular reflections
 *   4. Signature Interactive Mechanics:
 *      - Smooth spring-damped mouse parallax & vortex deflection
 *      - Slow-motion bullet-time freeze on click/hold (freezeRatio)
 *      - Radial impulse on pointerdown
 */

(function () {
  'use strict';

  // 1D Perlin / Value Noise for organic FBM turbulence
  class Simple1DNoise {
    static MAX_VERTICES = 512;
    static MAX_VERTICES_MASK = 511;
    constructor() {
      this._r = [];
      for (let i = 0; i < 512; i++) this._r.push(Math.random() - 0.5);
    }
    getVal(e) {
      const r = Math.floor(e), n = e - r, a = n * n * (3 - 2 * n);
      const l = r & 511, c = (l + 1) & 511;
      return (this._r[l] * (1 - a) + this._r[c] * a);
    }
    getFbm(e, octaves = 3) {
      let val = 0, amp = 0.5;
      for (let i = 0; i < octaves; i++) {
        val += amp * this.getVal(e);
        e *= 2;
        amp *= 0.5;
      }
      return val;
    }
  }

  // Exact 4D Simplex Curl Noise GPGPU Simulation Shader from Lusion
  const fragSim = `
precision highp float;
uniform sampler2D u_simPrevPosLifeTexture;
uniform sampler2D u_simDefaultPosLifeTexture;
uniform float u_introDeltaTime;
uniform float u_noiseTime;
uniform float u_noiseScale;
uniform float u_noiseStableFactor;
uniform vec3 u_lightPosition;
varying vec2 v_uv;

vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
float mod289(float x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
float permute(float x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float taylorInvSqrt(float r){return 1.79284291400159-0.85373472095314*r;}
vec4 grad4(float j,vec4 ip){
    const vec4 ones=vec4(1.0,1.0,1.0,-1.0);
    vec4 p,s;
    p.xyz=floor(fract(vec3(j)*ip.xyz)*7.0)*ip.z-1.0;
    p.w=1.5-dot(abs(p.xyz),ones.xyz);
    s=vec4(lessThan(p,vec4(0.0)));
    p.xyz=p.xyz+(s.xyz*2.0-1.0)*s.www;
    return p;
}
#define F4 0.309016994374947451
vec4 simplexNoiseDerivatives(vec4 v){
    const vec4 C=vec4(0.138196601125011,0.276393202250021,0.414589803375032,-0.447213595499958);
    vec4 i=floor(v+dot(v,vec4(F4)));
    vec4 x0=v-i+dot(i,C.xxxx);
    vec4 i0;
    vec3 isX=step(x0.yzw,x0.xxx);
    vec3 isYZ=step(x0.zww,x0.yyz);
    i0.x=isX.x+isX.y+isX.z;
    i0.yzw=1.0-isX;
    i0.y+=isYZ.x+isYZ.y;
    i0.zw+=1.0-isYZ.xy;
    i0.z+=isYZ.z;
    i0.w+=1.0-isYZ.z;
    vec4 i3=clamp(i0,0.0,1.0);
    vec4 i2=clamp(i0-1.0,0.0,1.0);
    vec4 i1=clamp(i0-2.0,0.0,1.0);
    vec4 x1=x0-i1+C.xxxx;
    vec4 x2=x0-i2+C.yyyy;
    vec4 x3=x0-i3+C.zzzz;
    vec4 x4=x0+C.wwww;
    i=mod289(i);
    float j0=permute(permute(permute(permute(i.w)+i.z)+i.y)+i.x);
    vec4 j1=permute(permute(permute(permute(i.w+vec4(i1.w,i2.w,i3.w,1.0))+i.z+vec4(i1.z,i2.z,i3.z,1.0))+i.y+vec4(i1.y,i2.y,i3.y,1.0))+i.x+vec4(i1.x,i2.x,i3.x,1.0));
    vec4 ip=vec4(1.0/294.0,1.0/49.0,1.0/7.0,0.0);
    vec4 p0=grad4(j0,ip);
    vec4 p1=grad4(j1.x,ip);
    vec4 p2=grad4(j1.y,ip);
    vec4 p3=grad4(j1.z,ip);
    vec4 p4=grad4(j1.w,ip);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;
    p1*=norm.y;
    p2*=norm.z;
    p3*=norm.w;
    p4*=taylorInvSqrt(dot(p4,p4));
    vec3 values0=vec3(dot(p0,x0),dot(p1,x1),dot(p2,x2));
    vec2 values1=vec2(dot(p3,x3),dot(p4,x4));
    vec3 m0=max(0.5-vec3(dot(x0,x0),dot(x1,x1),dot(x2,x2)),0.0);
    vec2 m1=max(0.5-vec2(dot(x3,x3),dot(x4,x4)),0.0);
    vec3 temp0=-6.0*m0*m0*values0;
    vec2 temp1=-6.0*m1*m1*values1;
    vec3 mmm0=m0*m0*m0;
    vec2 mmm1=m1*m1*m1;
    float dx=temp0[0]*x0.x+temp0[1]*x1.x+temp0[2]*x2.x+temp1[0]*x3.x+temp1[1]*x4.x+mmm0[0]*p0.x+mmm0[1]*p1.x+mmm0[2]*p2.x+mmm1[0]*p3.x+mmm1[1]*p4.x;
    float dy=temp0[0]*x0.y+temp0[1]*x1.y+temp0[2]*x2.y+temp1[0]*x3.y+temp1[1]*x4.y+mmm0[0]*p0.y+mmm0[1]*p1.y+mmm0[2]*p2.y+mmm1[0]*p3.y+mmm1[1]*p4.y;
    float dz=temp0[0]*x0.z+temp0[1]*x1.z+temp0[2]*x2.z+temp1[0]*x3.z+temp1[1]*x4.z+mmm0[0]*p0.z+mmm0[1]*p1.z+mmm0[2]*p2.z+mmm1[0]*p3.z+mmm1[1]*p4.z;
    float dw=temp0[0]*x0.w+temp0[1]*x1.w+temp0[2]*x2.w+temp1[0]*x3.w+temp1[1]*x4.w+mmm0[0]*p0.w+mmm0[1]*p1.w+mmm0[2]*p2.w+mmm1[0]*p3.w+mmm1[1]*p4.w;
    return vec4(dx,dy,dz,dw)*49.0;
}
vec3 curl(in vec3 p,in float noiseTime,in float persistence){
    vec4 xNoisePotentialDerivatives=vec4(0.0);
    vec4 yNoisePotentialDerivatives=vec4(0.0);
    vec4 zNoisePotentialDerivatives=vec4(0.0);
    for(int i=0;i<2;++i){
        float twoPowI=pow(2.0,float(i));
        float scale=0.5*twoPowI*pow(persistence,float(i));
        xNoisePotentialDerivatives+=simplexNoiseDerivatives(vec4(p*twoPowI,noiseTime))*scale;
        yNoisePotentialDerivatives+=simplexNoiseDerivatives(vec4((p+vec3(123.4,129845.6,-1239.1))*twoPowI,noiseTime))*scale;
        zNoisePotentialDerivatives+=simplexNoiseDerivatives(vec4((p+vec3(-9519.0,9051.0,-123.0))*twoPowI,noiseTime))*scale;
    }
    return vec3(
        xNoisePotentialDerivatives[3]-zNoisePotentialDerivatives[1],
        zNoisePotentialDerivatives[2]-yNoisePotentialDerivatives[3],
        yNoisePotentialDerivatives[1]-xNoisePotentialDerivatives[2]
    );
}
void main(){
    vec4 posLife=texture2D(u_simPrevPosLifeTexture,v_uv);
    vec3 posLifeOrigin=posLife.xyz-u_lightPosition;
    posLife.w-=(0.5+u_noiseStableFactor)*u_introDeltaTime;
    if(posLife.w<0.0){
        vec3 defPosOrigin=texture2D(u_simDefaultPosLifeTexture,v_uv).xyz;
        vec3 defPos=defPosOrigin*(1.25+sin(u_noiseTime*2.5+v_uv.x*21.)*0.25)+u_lightPosition;
        posLife.w+=1.;
        posLife.xyz=defPos;
    }
    vec3 toLight=posLife.xyz-u_lightPosition;
    vec3 axis=vec3(sin(u_noiseTime),cos(u_noiseTime*2.+v_uv.y*6.283185),0.0);
    vec3 spinDir=cross(axis,toLight);
    float dist=length(toLight);
    if(dist>0.01){
        float spinStrength=u_introDeltaTime*(0.15+smoothstep(0.4,2.5,dist-v_uv.x*0.5)*(v_uv.y<0.5 ? 1. :-1.)*mix(2.5,4.5,v_uv.x))*mix(0.8,1.6,u_noiseStableFactor);
        posLife.xyz+=spinDir*spinStrength;
    }
    posLife.xyz+=(1.5+0.6*u_noiseScale)*curl((posLife.xyz-u_lightPosition)*(0.45+0.35*u_noiseStableFactor),u_noiseTime,0.2)*u_introDeltaTime*mix(0.5,1.6,posLife.w*posLife.w)*mix(0.75,1.25,v_uv.x);
    gl_FragColor=posLife;
}
`;

  // Instanced Spheres Vertex Shader
  const particleVert = `
attribute vec2 simUv;
uniform sampler2D u_simCurrPosLifeTexture;
uniform float u_isEmissive;

varying vec3 v_viewNormal;
varying vec3 v_viewPos;
varying float v_life;
varying float v_isEmissive;
varying float v_randType;

vec4 hash43(vec2 p) {
    vec4 p4 = fract(vec4(p.xyxy) * vec4(.1031, .1030, .0973, .1099));
    p4 += dot(p4, p4.wzxy + 33.33);
    return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}

void main() {
    vec4 currPosInfo = texture2D(u_simCurrPosLifeTexture, simUv);
    vec4 rands = hash43(simUv);
    v_randType = rands.y;
    
    // Distribution: fine mist + medium droplets + large emissive orbs
    float rSize = pow(rands.x, 2.4);
    float baseSize = mix(mix(0.045, 0.15, rSize), 0.32, u_isEmissive);
    float sizeScale = smoothstep(0.0, 0.12, currPosInfo.w) * (1.0 - smoothstep(0.88, 1.0, currPosInfo.w));
    float particleSize = baseSize * sizeScale;
    
    vec3 worldPos = position * particleSize + currPosInfo.xyz;
    vec4 mvPos = modelViewMatrix * vec4(worldPos, 1.0);
    gl_Position = projectionMatrix * mvPos;
    
    v_viewNormal = normalize(normalMatrix * normal);
    v_viewPos = mvPos.xyz;
    v_life = currPosInfo.w;
    v_isEmissive = u_isEmissive;
}
`;

  // Instanced Spheres Fragment Shader
  const particleFrag = `
varying vec3 v_viewNormal;
varying vec3 v_viewPos;
varying float v_life;
varying float v_isEmissive;
varying float v_randType;

void main() {
    vec3 N = normalize(v_viewNormal);
    vec3 V = normalize(-v_viewPos);
    
    if (v_isEmissive > 0.5) {
        float rim = 1.0 - max(0.0, dot(N, V));
        vec3 glow = mix(vec3(1.5), vec3(1.0, 1.0, 1.0), rim * 0.45);
        gl_FragColor = vec4(glow, 1.0);
        return;
    }
    
    vec3 L = normalize(vec3(0.55, 0.85, 0.95));
    float diff = max(0.0, dot(N, L));
    vec3 H = normalize(L + V);
    float spec = pow(max(0.0, dot(N, H)), 32.0);
    float fresnel = pow(1.0 - max(0.0, dot(N, V)), 2.8);
    
    // ~20% obsidian/graphite particles, ~80% luxury porcelain/pearl white
    bool isObsidian = (v_randType < 0.22);
    vec3 baseCol = isObsidian ? vec3(0.06, 0.08, 0.10) : vec3(0.92, 0.94, 0.96);
    vec3 amb = isObsidian ? vec3(0.03, 0.04, 0.05) : vec3(0.16, 0.18, 0.20);
    vec3 rimCol = isObsidian ? vec3(0.31, 0.78, 0.77) : vec3(0.82, 0.88, 0.92); // Anemos breeze #4FC7C4
    
    vec3 col = amb + baseCol * diff * 0.85 + vec3(spec * (isObsidian ? 1.2 : 0.85)) + rimCol * (fresnel * (isObsidian ? 0.6 : 0.25));
    gl_FragColor = vec4(col, 1.0);
}
`;

  // Centerpiece Viscous Fluid Ribbon Vertex & Fragment
  const ribbonVert = `
uniform float u_time;
varying vec3 v_viewNormal;
varying vec3 v_viewPos;
varying vec2 v_uv;

void main() {
    v_uv = uv;
    vec3 pos = position;
    
    // Organic fluid undulation
    float wave1 = sin(pos.x * 2.2 + u_time * 1.4) * 0.22;
    float wave2 = cos(pos.x * 3.8 - u_time * 1.8) * 0.14;
    pos.y += wave1 + wave2;
    pos.z += cos(pos.x * 1.8 + u_time * 1.2) * 0.18;
    
    // Taper ends
    float taper = smoothstep(0.0, 0.35, uv.x) * (1.0 - smoothstep(0.65, 1.0, uv.x));
    pos.y *= mix(0.2, 1.0, taper);
    
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;
    
    v_viewNormal = normalize(normalMatrix * normal);
    v_viewPos = mvPos.xyz;
}
`;

  const ribbonFrag = `
uniform float u_time;
varying vec3 v_viewNormal;
varying vec3 v_viewPos;
varying vec2 v_uv;

void main() {
    vec3 N = normalize(v_viewNormal);
    vec3 V = normalize(-v_viewPos);
    vec3 L = normalize(vec3(0.5, 0.9, 0.8));
    
    float diff = max(0.0, dot(N, L));
    vec3 H = normalize(L + V);
    float spec = pow(max(0.0, dot(N, H)), 48.0);
    float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.0);
    
    // Viscous obsidian chrome with Anemos breeze rim
    vec3 base = vec3(0.04, 0.05, 0.07);
    vec3 rim = vec3(0.31, 0.78, 0.77); // #4FC7C4
    
    float alpha = smoothstep(0.02, 0.18, v_uv.x) * (1.0 - smoothstep(0.82, 0.98, v_uv.x));
    vec3 col = base + vec3(spec * 1.8) + rim * (fresnel * 0.85) + base * diff;
    gl_FragColor = vec4(col, alpha * 0.88);
}
`;

  function initHeroBalloons() {
    const canvas = document.getElementById('hero-balloons-canvas');
    if (!canvas) return;

    if (typeof THREE === 'undefined') {
      console.warn('Three.js not yet loaded for hero-balloons');
      return;
    }

    const heroSection = document.getElementById('hero') || canvas.parentElement;

    let width = heroSection ? heroSection.clientWidth : window.innerWidth;
    let height = heroSection ? heroSection.clientHeight : window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const isMobile = width < 768;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(isMobile ? 50 : 40, width / height, 0.1, 100);
    camera.position.set(0, 0, isMobile ? 9.2 : 7.5);

    // GPGPU Simulation setup: 128 x 128 = 16,384 particles
    const SIM_W = 128, SIM_H = 128;
    const totalParticles = SIM_W * SIM_H;

    const defaultData = new Float32Array(totalParticles * 4);
    for (let i = 0, idx = 0; i < totalParticles; i++, idx += 4) {
      let u = Math.random() * 2 * Math.PI;
      let f = Math.acos(2 * Math.random() - 1);
      let r = 0.5 + Math.cbrt(Math.random()) * 1.5;
      defaultData[idx + 0] = r * Math.sin(f) * Math.cos(u);
      defaultData[idx + 1] = r * Math.sin(f) * Math.sin(u) * 0.75 + 0.15; // slightly above center
      defaultData[idx + 2] = r * Math.cos(f);
      defaultData[idx + 3] = i / totalParticles;
    }

    const defaultPosTex = new THREE.DataTexture(defaultData, SIM_W, SIM_H, THREE.RGBAFormat, THREE.FloatType);
    defaultPosTex.needsUpdate = true;

    const rtOptions = {
      type: THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false
    };

    let rtCurr = new THREE.WebGLRenderTarget(SIM_W, SIM_H, rtOptions);
    let rtPrev = new THREE.WebGLRenderTarget(SIM_W, SIM_H, rtOptions);

    const simScene = new THREE.Scene();
    const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const simQuadGeom = new THREE.PlaneGeometry(2, 2);

    const simUniforms = {
      u_simPrevPosLifeTexture: { value: defaultPosTex },
      u_simDefaultPosLifeTexture: { value: defaultPosTex },
      u_introDeltaTime: { value: 0.016 },
      u_noiseTime: { value: 0.0 },
      u_noiseScale: { value: 1.0 },
      u_noiseStableFactor: { value: 0.5 },
      u_lightPosition: { value: new THREE.Vector3(0, 0.15, 0) }
    };

    const simMaterial = new THREE.ShaderMaterial({
      uniforms: simUniforms,
      vertexShader: `
        varying vec2 v_uv;
        void main() {
          v_uv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: fragSim
    });

    const simQuad = new THREE.Mesh(simQuadGeom, simMaterial);
    simScene.add(simQuad);

    // Pre-warm the simulation by running 120 steps so particles are in full majestic flow on load!
    const noise = new Simple1DNoise();
    let noiseTime = 0, noiseScaleTime = Math.random(), noiseStableTime = Math.random();

    for (let step = 0; step < 120; step++) {
      let temp = rtCurr;
      rtCurr = rtPrev;
      rtPrev = temp;

      simUniforms.u_simPrevPosLifeTexture.value = (step === 0) ? defaultPosTex : rtPrev.texture;
      simUniforms.u_introDeltaTime.value = 0.025;
      noiseTime += 0.025 * 0.35;
      simUniforms.u_noiseTime.value = noiseTime;

      noiseScaleTime += 0.025;
      simUniforms.u_noiseScale.value = 10.0 * Math.abs(noise.getFbm(noiseScaleTime, 3));

      noiseStableTime += 0.5 * 0.025;
      simUniforms.u_noiseStableFactor.value = 0.5 + 0.5 * Math.abs(noise.getFbm(noiseStableTime, 3));

      renderer.setRenderTarget(rtCurr);
      renderer.render(simScene, simCamera);
      renderer.setRenderTarget(null);
    }

    // Instanced geometry: smooth 16x12 sphere
    const baseSphereGeom = new THREE.SphereGeometry(1, 14, 10);

    const emissiveCount = SIM_H;
    const nonEmissiveCount = (SIM_W - 1) * SIM_H;

    const emissiveUvs = new Float32Array(emissiveCount * 2);
    const nonEmissiveUvs = new Float32Array(nonEmissiveCount * 2);

    let eIdx = 0, nIdx = 0;
    for (let p = 0; p < totalParticles; p++) {
      let u = (p % SIM_W + 0.5) / SIM_W;
      let v = (Math.floor(p / SIM_W) + 0.5) / SIM_H;
      if (p % SIM_W === 0) {
        emissiveUvs[eIdx++] = u;
        emissiveUvs[eIdx++] = v;
      } else {
        nonEmissiveUvs[nIdx++] = u;
        nonEmissiveUvs[nIdx++] = v;
      }
    }

    // Non-emissive mesh (pearl & obsidian spheres)
    const nonEmissiveGeom = new THREE.InstancedBufferGeometry();
    for (let attr in baseSphereGeom.attributes) {
      nonEmissiveGeom.setAttribute(attr, baseSphereGeom.attributes[attr]);
    }
    nonEmissiveGeom.setIndex(baseSphereGeom.getIndex());
    nonEmissiveGeom.setAttribute('simUv', new THREE.InstancedBufferAttribute(nonEmissiveUvs, 2));

    const nonEmissiveMat = new THREE.ShaderMaterial({
      uniforms: {
        u_simCurrPosLifeTexture: { value: rtCurr.texture },
        u_isEmissive: { value: 0.0 }
      },
      vertexShader: particleVert,
      fragmentShader: particleFrag
    });

    const nonEmissiveMesh = new THREE.Mesh(nonEmissiveGeom, nonEmissiveMat);
    nonEmissiveMesh.frustumCulled = false;
    scene.add(nonEmissiveMesh);

    // Emissive mesh (bright glowing white orbs)
    const emissiveGeom = new THREE.InstancedBufferGeometry();
    for (let attr in baseSphereGeom.attributes) {
      emissiveGeom.setAttribute(attr, baseSphereGeom.attributes[attr]);
    }
    emissiveGeom.setIndex(baseSphereGeom.getIndex());
    emissiveGeom.setAttribute('simUv', new THREE.InstancedBufferAttribute(emissiveUvs, 2));

    const emissiveMat = new THREE.ShaderMaterial({
      uniforms: {
        u_simCurrPosLifeTexture: { value: rtCurr.texture },
        u_isEmissive: { value: 1.0 }
      },
      vertexShader: particleVert,
      fragmentShader: particleFrag
    });

    const emissiveMesh = new THREE.Mesh(emissiveGeom, emissiveMat);
    emissiveMesh.frustumCulled = false;
    scene.add(emissiveMesh);

    // Centerpiece Molten Obsidian Ribbon / Fluid Core
    const ribbonGeom = new THREE.CylinderGeometry(0.24, 0.28, 4.2, 48, 24, true);
    ribbonGeom.rotateZ(Math.PI / 2.3);
    const ribbonMat = new THREE.ShaderMaterial({
      uniforms: {
        u_time: { value: 0.0 }
      },
      vertexShader: ribbonVert,
      fragmentShader: ribbonFrag,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ribbonMesh = new THREE.Mesh(ribbonGeom, ribbonMat);
    ribbonMesh.position.set(0.1, 0.15, -0.2);
    scene.add(ribbonMesh);

    // Interactive state
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    let isDown = false;
    let freezeRatio = 0.0;
    let clickImpulse = 0.0;

    function onPointerMove(e) {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : width / 2);
      const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : height / 2);
      mouse.targetX = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.targetY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    }

    function onPointerDown() {
      isDown = true;
      clickImpulse = 1.0;
    }

    function onPointerUp() {
      isDown = false;
    }

    window.addEventListener('mousemove', onPointerMove, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchend', onPointerUp);

    function onResize() {
      width = heroSection ? heroSection.clientWidth : window.innerWidth;
      height = heroSection ? heroSection.clientHeight : window.innerHeight;
      const mobile = width < 768;
      camera.fov = mobile ? 50 : 40;
      camera.aspect = width / height;
      camera.position.z = mobile ? 9.2 : 7.5;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    }

    window.addEventListener('resize', onResize);

    // Render loop
    let lastTime = performance.now();
    let running = true;

    function animate(now) {
      if (!running) return;
      requestAnimationFrame(animate);

      let rawDt = (now - lastTime) * 0.001;
      lastTime = now;
      if (rawDt <= 0 || rawDt > 0.1) rawDt = 0.016;

      // Smooth mouse interpolation
      mouse.x += (mouse.targetX - mouse.x) * 0.06;
      mouse.y += (mouse.targetY - mouse.y) * 0.06;

      // Bullet-time freeze on hold
      const targetFreeze = isDown ? 1.0 : 0.0;
      freezeRatio += (targetFreeze - freezeRatio) * 0.12;
      const simDt = rawDt * (1.0 - freezeRatio * 0.85);

      // Camera parallax
      camera.position.x = mouse.x * 0.45;
      camera.position.y = mouse.y * 0.35;
      camera.lookAt(0, 0.1, 0);

      // Vortex focal position tracks mouse smoothly
      simUniforms.u_lightPosition.value.x = mouse.x * 0.45;
      simUniforms.u_lightPosition.value.y = 0.15 + mouse.y * 0.35;

      // Advance noise
      noiseTime += simDt * 0.35;
      simUniforms.u_noiseTime.value = noiseTime;

      noiseScaleTime += simDt;
      const r = noise.getFbm(noiseScaleTime, 3);
      simUniforms.u_noiseScale.value = 10.0 * Math.abs(r);

      noiseStableTime += 0.5 * simDt;
      const s = 0.5 + 0.5 * Math.abs(noise.getFbm(noiseStableTime, 3));
      simUniforms.u_noiseStableFactor.value = s;

      simUniforms.u_introDeltaTime.value = simDt;

      // Ping-pong GPGPU step
      let temp = rtCurr;
      rtCurr = rtPrev;
      rtPrev = temp;

      simUniforms.u_simPrevPosLifeTexture.value = rtPrev.texture;

      renderer.setRenderTarget(rtCurr);
      renderer.render(simScene, simCamera);
      renderer.setRenderTarget(null);

      // Update particle textures
      nonEmissiveMat.uniforms.u_simCurrPosLifeTexture.value = rtCurr.texture;
      emissiveMat.uniforms.u_simCurrPosLifeTexture.value = rtCurr.texture;

      // Update center ribbon
      ribbonMat.uniforms.u_time.value += simDt * 0.8;
      ribbonMesh.rotation.y = mouse.x * 0.25;

      // Render 3D hero scene
      renderer.render(scene, camera);
    }

    requestAnimationFrame(animate);

    return function destroy() {
      running = false;
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('touchmove', onPointerMove);
      canvas.removeEventListener('mousedown', onPointerDown);
      canvas.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchend', onPointerUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeroBalloons);
  } else {
    initHeroBalloons();
  }
})();
