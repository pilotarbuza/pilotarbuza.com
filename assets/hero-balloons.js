/**
 * pilotarbuza.com — 3D Hydrodynamic Fluid & Swarm Simulation
 * 
 * Authentic Lusion.co /about Hero visual architecture:
 *   1. 3D Animated Fluid Swimmer Entity:
 *      - 54-bone GPU dual-quaternion / linear-blend skinning
 *      - Continuous hydrodynamic swimming animation (person.buf + person_idle.buf)
 *      - Molten liquid obsidian & pearl specular shading with Anemos breeze (#4FC7C4) rim
 *   2. GPGPU Ping-Pong Simulation (16,384 particles):
 *      - 4D Simplex Curl Noise (divergence-free fluid advection)
 *      - Orbital vortex spin around upper-center focal point (0, 0.85, 0)
 *      - Delicate fine mist (0.012 - 0.045) + luminous glowing pearls (0.09 - 0.12)
 *      - High-contrast backlighting specular shimmer against deep obsidian ground
 *   3. Signature Interactive Mechanics:
 *      - Smooth spring-damped mouse parallax & vortex deflection
 *      - Slow-motion bullet-time freeze on pointerdown (freezeRatio)
 */

(function () {
  'use strict';

  function initHeroSimulation() {
    const canvas = document.getElementById('hero-balloons-canvas');
    if (!canvas) return;

    const heroSection = document.getElementById('hero');
    let width = heroSection ? heroSection.clientWidth : window.innerWidth;
    let height = heroSection ? heroSection.clientHeight : window.innerHeight;

    // WebGL Renderer with alpha transparency so letters are visible behind
    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0.4, 7.2);
    camera.lookAt(0, 0.8, 0);

    // -------------------------------------------------------------
    // GPGPU Particle Simulation Setup
    // -------------------------------------------------------------
    const SIM_W = 128;
    const SIM_H = 128;
    const totalParticles = SIM_W * SIM_H; // 16,384

    const simScene = new THREE.Scene();
    const simCamera = new THREE.Camera();
    simCamera.position.z = 1;

    const rtA = new THREE.WebGLRenderTarget(SIM_W, SIM_H, {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false
    });
    const rtB = rtA.clone();
    let rtPrev = rtA;
    let rtCurr = rtB;

    // GPGPU Initial Particle Positions: upper-center cluster
    const defaultData = new Float32Array(totalParticles * 4);
    for (let i = 0; i < totalParticles; i++) {
      const idx = i * 4;
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.pow(Math.random(), 0.75) * 1.05;

      // Centered at y = 0.85 (upper center, floating around the swimmer)
      defaultData[idx + 0] = r * Math.sin(phi) * Math.sin(theta) * 1.5;
      defaultData[idx + 1] = 0.85 + r * Math.sin(phi) * Math.cos(theta) * 0.75;
      defaultData[idx + 2] = r * Math.cos(phi) * 0.9;
      defaultData[idx + 3] = i / totalParticles; // Life cycle offset
    }

    const defaultTexture = new THREE.DataTexture(
      defaultData,
      SIM_W,
      SIM_H,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    defaultTexture.needsUpdate = true;

    // 4D Simplex Noise + Curl Simulation Shader (Exact Lusion Architecture)
    const simFrag = `
precision highp float;
uniform sampler2D u_simCurrPosLifeTexture;
uniform sampler2D u_defaultPosLifeTexture;
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
    p.xyz=floor(fract(vec3(j)*ip.xyz)*7.0)*ip.z-ones.xyz;
    p.w=1.5-dot(abs(p.xyz),ones.xyz);
    s=vec4(lessThan(p,vec4(0.0)));
    p.xyz=p.xyz+(s.xyz*2.0-1.0)*s.www;
    return p;
}
#define F4 0.309016994374947451
float snoise(vec4 v){
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
    vec4 j1=permute(permute(permute(permute(
        i.w+vec4(i1.w,i2.w,i3.w,1.0))
        +i.z+vec4(i1.z,i2.z,i3.z,1.0))
        +i.y+vec4(i1.y,i2.y,i3.y,1.0))
        +i.x+vec4(i1.x,i2.x,i3.x,1.0));
    vec4 ip=vec4(1.0/294.0,1.0/49.0,1.0/7.0,0.0);
    vec4 p0=grad4(j0,ip);
    vec4 p1=grad4(j1.x,ip);
    vec4 p2=grad4(j1.y,ip);
    vec4 p3=grad4(j1.z,ip);
    vec4 p4=grad4(j1.w,ip);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    p4*=taylorInvSqrt(dot(p4,p4));
    vec3 values0=vec3(dot(p0,x0),dot(p1,x1),dot(p2,x2));
    vec2 values1=vec2(dot(p3,x3),dot(p4,x4));
    vec3 m0=max(0.5-vec3(dot(x0,x0),dot(x1,x1),dot(x2,x2)),0.0);
    vec2 m1=max(0.5-vec2(dot(x3,x3),dot(x4,x4)),0.0);
    m0=m0*m0; m1=m1*m1;
    return 49.0*(dot(m0*m0,values0)+dot(m1*m1,values1));
}
vec3 curl(vec3 p,float t,float e){
    vec4 p4=vec4(p,t);
    float dx=snoise(p4+vec4(e,0.0,0.0,0.0))-snoise(p4-vec4(e,0.0,0.0,0.0));
    float dy=snoise(p4+vec4(0.0,e,0.0,0.0))-snoise(p4-vec4(0.0,e,0.0,0.0));
    float dz=snoise(p4+vec4(0.0,0.0,e,0.0))-snoise(p4-vec4(0.0,0.0,e,0.0));
    float dw=snoise(p4+vec4(0.0,0.0,0.0,e))-snoise(p4-vec4(0.0,0.0,0.0,e));
    return vec3(dz-dy,dx-dw,dy-dx)/(2.0*e);
}

void main(){
    vec4 posLife=texture2D(u_simCurrPosLifeTexture,v_uv);
    posLife.w+=u_introDeltaTime*0.085;
    if(posLife.w>=1.0){
        vec4 def=texture2D(u_defaultPosLifeTexture,v_uv);
        gl_FragColor=vec4(def.xyz+u_lightPosition*0.25,fract(posLife.w));
        return;
    }
    vec3 toLight=posLife.xyz-u_lightPosition;
    vec3 axis=vec3(0.0,1.0,0.0);
    vec3 spinDir=cross(axis,toLight);
    float dist=length(toLight);
    if(dist>0.01){
        float spinStrength=u_introDeltaTime*(0.18+smoothstep(0.3,2.2,dist-v_uv.x*0.5)*(v_uv.y<0.5 ? 1. :-1.)*mix(2.8,5.0,v_uv.x))*mix(0.85,1.7,u_noiseStableFactor);
        posLife.xyz+=spinDir*spinStrength;
    }
    posLife.xyz+=(1.6+0.7*u_noiseScale)*curl((posLife.xyz-u_lightPosition)*(0.6+0.4*u_noiseStableFactor),u_noiseTime,0.2)*u_introDeltaTime*mix(0.5,1.7,posLife.w*posLife.w)*mix(0.75,1.25,v_uv.x);
    gl_FragColor=posLife;
}
`;

    // Instanced Spheres Vertex Shader: Delicate fine droplets + glowing pearls
    const particleVert = `
attribute vec2 simUv;
uniform sampler2D u_simCurrPosLifeTexture;
uniform float u_isEmissive;
varying vec3 v_viewNormal;
varying vec3 v_viewPos;
varying float v_isEmissive;
varying float v_randType;

vec4 hash43(vec2 p) {
    vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
    p4 += dot(p4, p4.wzxy + 33.33);
    return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}

void main() {
    v_isEmissive = u_isEmissive;
    vec4 currPosInfo = texture2D(u_simCurrPosLifeTexture, simUv);
    vec4 rands = hash43(simUv);
    v_randType = rands.y;
    
    // Scale: fine mist droplets (0.016 - 0.048) + glowing pearls (0.095)
    float rSize = pow(rands.x, 3.2);
    float normalSize = mix(0.016, 0.048, rSize);
    float baseSize = mix(normalSize, 0.095, u_isEmissive);
    
    float sizeScale = smoothstep(0.0, 0.12, currPosInfo.w) * (1.0 - smoothstep(0.88, 1.0, currPosInfo.w));
    float particleSize = baseSize * sizeScale;
    
    vec3 localPos = position * particleSize;
    vec3 worldPos = currPosInfo.xyz + localPos;
    
    vec4 mvPos = modelViewMatrix * vec4(worldPos, 1.0);
    gl_Position = projectionMatrix * mvPos;
    
    v_viewNormal = normalize(normalMatrix * normal);
    v_viewPos = mvPos.xyz;
}
`;

    // Instanced Spheres Fragment Shader: Liquid pearl & obsidian specular shimmer
    const particleFrag = `
varying vec3 v_viewNormal;
varying vec3 v_viewPos;
varying float v_isEmissive;
varying float v_randType;

void main() {
    vec3 N = normalize(v_viewNormal);
    vec3 V = normalize(-v_viewPos);
    
    if (v_isEmissive > 0.5) {
        // High-intensity glowing pearl core
        float rim = 1.0 - max(0.0, dot(N, V));
        vec3 glow = mix(vec3(2.2), vec3(1.3, 1.35, 1.4), rim * 0.5);
        gl_FragColor = vec4(glow, 1.0);
        return;
    }
    
    vec3 L1 = normalize(vec3(0.55, 0.85, 0.95));
    vec3 L2 = normalize(vec3(-0.6, 0.4, -0.9)); // Strong backlight rim
    
    float diff = max(0.0, dot(N, L1));
    vec3 H = normalize(L1 + V);
    float spec = pow(max(0.0, dot(N, H)), 32.0);
    float backRim = pow(max(0.0, dot(reflect(-V, N), L2)), 24.0);
    float fresnel = pow(1.0 - max(0.0, dot(N, V)), 2.8);
    
    // ~20% obsidian/graphite particles, ~80% luxury pearl white
    bool isObsidian = (v_randType < 0.22);
    vec3 baseCol = isObsidian ? vec3(0.06, 0.08, 0.10) : vec3(0.92, 0.94, 0.96);
    vec3 amb = isObsidian ? vec3(0.03, 0.04, 0.05) : vec3(0.18, 0.20, 0.22);
    
    vec3 color = amb + baseCol * diff * 0.75 + vec3(spec * 0.8) + vec3(backRim * 1.35);
    // Subtle Anemos breeze rim (#4FC7C4)
    color += vec3(0.31, 0.78, 0.77) * (fresnel * (isObsidian ? 0.65 : 0.25));
    
    gl_FragColor = vec4(color, 1.0);
}
`;

    // 1D Perlin-like Noise Helper
    class Simple1DNoise {
      constructor() {
        this.perm = new Uint8Array(512);
        for (let i = 0; i < 256; i++) this.perm[i] = i;
        for (let i = 255; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const t = this.perm[i];
          this.perm[i] = this.perm[j];
          this.perm[j] = t;
        }
        for (let i = 0; i < 256; i++) this.perm[256 + i] = this.perm[i];
      }
      get(x) {
        const xi = Math.floor(x) & 255;
        const xf = x - Math.floor(x);
        const u = xf * xf * (3.0 - 2.0 * xf);
        const g0 = (this.perm[xi] % 2 === 0) ? 1 : -1;
        const g1 = (this.perm[xi + 1] % 2 === 0) ? 1 : -1;
        return (g0 * xf * (1 - u) + g1 * (xf - 1) * u) * 0.5 + 0.5;
      }
    }

    // Simulation Quad
    const simQuadGeom = new THREE.BufferGeometry();
    const posArr = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]);
    const uvArr = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
    simQuadGeom.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    simQuadGeom.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));

    const simUniforms = {
      u_simCurrPosLifeTexture: { value: defaultTexture },
      u_defaultPosLifeTexture: { value: defaultTexture },
      u_introDeltaTime: { value: 0.016 },
      u_noiseTime: { value: 0.0 },
      u_noiseScale: { value: 1.0 },
      u_noiseStableFactor: { value: 0.5 },
      u_lightPosition: { value: new THREE.Vector3(0, 0.85, 0) }
    };

    const simMaterial = new THREE.ShaderMaterial({
      uniforms: simUniforms,
      vertexShader: `
varying vec2 v_uv;
void main(){
    v_uv=uv;
    gl_Position=vec4(position,1.0);
}
`,
      fragmentShader: simFrag
    });

    const simQuad = new THREE.Mesh(simQuadGeom, simMaterial);
    simScene.add(simQuad);

    // Pre-warm the simulation so particles start in full fluid vortex
    const noise = new Simple1DNoise();
    let noiseTime = 0, noiseScaleTime = Math.random(), noiseStableTime = Math.random();

    for (let i = 0; i < 90; i++) {
      const dt = 0.016;
      noiseTime += dt * 0.35;
      noiseScaleTime += dt * 0.2;
      noiseStableTime += dt * 0.25;

      simUniforms.u_introDeltaTime.value = dt;
      simUniforms.u_noiseTime.value = noiseTime;
      simUniforms.u_noiseScale.value = noise.get(noiseScaleTime) * 1.5;
      simUniforms.u_noiseStableFactor.value = noise.get(noiseStableTime);

      renderer.setRenderTarget(rtCurr);
      renderer.render(simScene, simCamera);
      simUniforms.u_simCurrPosLifeTexture.value = rtCurr.texture;

      const tmp = rtPrev;
      rtPrev = rtCurr;
      rtCurr = tmp;
      renderer.setRenderTarget(null);
    }

    // Instanced geometry: smooth 12x8 sphere
    const baseSphereGeom = new THREE.SphereGeometry(1, 12, 8);
    const emissiveCount = SIM_H; // 128 emissive orbs
    const nonEmissiveCount = (SIM_W - 1) * SIM_H; // 16,256 standard particles

    const nonEmissiveUvs = new Float32Array(nonEmissiveCount * 2);
    let pIdx = 0;
    for (let x = 0; x < SIM_W - 1; x++) {
      for (let y = 0; y < SIM_H; y++) {
        nonEmissiveUvs[pIdx * 2 + 0] = (x + 0.5) / SIM_W;
        nonEmissiveUvs[pIdx * 2 + 1] = (y + 0.5) / SIM_H;
        pIdx++;
      }
    }

    const emissiveUvs = new Float32Array(emissiveCount * 2);
    pIdx = 0;
    for (let y = 0; y < SIM_H; y++) {
      emissiveUvs[pIdx * 2 + 0] = (SIM_W - 1 + 0.5) / SIM_W;
      emissiveUvs[pIdx * 2 + 1] = (y + 0.5) / SIM_H;
      pIdx++;
    }

    // Non-emissive mesh
    const nonEmissiveGeom = new THREE.InstancedBufferGeometry();
    for (let attr in baseSphereGeom.attributes) {
      nonEmissiveGeom.setAttribute(attr, baseSphereGeom.attributes[attr]);
    }
    nonEmissiveGeom.setIndex(baseSphereGeom.index);
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

    // Emissive mesh (bright glowing sparkles/orbs)
    const emissiveGeom = new THREE.InstancedBufferGeometry();
    for (let attr in baseSphereGeom.attributes) {
      emissiveGeom.setAttribute(attr, baseSphereGeom.attributes[attr]);
    }
    emissiveGeom.setIndex(baseSphereGeom.index);
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

    // -------------------------------------------------------------
    // 3D Animated Swimmer (Lusion's person.buf + person_idle.buf)
    // -------------------------------------------------------------
    function parseBuf(buffer) {
      const headerLen = new Uint32Array(buffer, 0, 1)[0];
      const jsonStr = new TextDecoder().decode(new Uint8Array(buffer, 4, headerLen));
      const meta = JSON.parse(jsonStr);
      const vc = meta.vertexCount;
      const ic = meta.indexCount;
      let offset = 4 + headerLen;
      const geom = new THREE.BufferGeometry();
      const attrs = meta.attributes;

      for (let i = 0; i < attrs.length; i++) {
        const attr = attrs[i];
        const id = attr.id;
        const count = (id === "indices") ? ic : vc;
        const compSize = attr.componentSize;
        
        let TypedArray;
        switch (attr.storageType) {
          case 'Uint16Array': TypedArray = Uint16Array; break;
          case 'Int16Array': TypedArray = Int16Array; break;
          case 'Float32Array': TypedArray = Float32Array; break;
          case 'Uint8Array': TypedArray = Uint8Array; break;
          case 'Int8Array': TypedArray = Int8Array; break;
          default: TypedArray = Float32Array;
        }
        
        const bytesPerElem = TypedArray.BYTES_PER_ELEMENT;
        const totalBytes = count * compSize * bytesPerElem;
        const raw = new TypedArray(buffer, offset, count * compSize);
        
        let finalArray;
        if (attr.needsPack) {
          const packed = attr.packedComponents;
          const k = packed.length;
          const isInt = attr.storageType.indexOf('Int') === 0 && attr.storageType.indexOf('Uint') !== 0;
          const D = 1 << (bytesPerElem * 8);
          const ne = isInt ? D * 0.5 : 0;
          const re = 1.0 / D;
          finalArray = new Float32Array(count * compSize);
          let z = 0;
          for (let c = 0; c < count; c++) {
            for (let j = 0; j < k; j++) {
              finalArray[z] = (raw[z] + ne) * re * packed[j].delta + packed[j].from;
              z++;
            }
          }
        } else {
          finalArray = raw;
        }

        if (id === "indices") {
          geom.setIndex(new THREE.BufferAttribute(finalArray, 1));
        } else {
          geom.setAttribute(id, new THREE.BufferAttribute(finalArray, compSize));
        }
        offset += totalBytes;
      }
      return { geom, meta };
    }

    const BONE_COUNT = 54;
    const bonePoses = [];
    const boneOrients = [];
    for (let i = 0; i < BONE_COUNT; i++) {
      bonePoses.push(new THREE.Vector3());
      boneOrients.push(new THREE.Vector4(0, 0, 0, 1));
    }

    const swimmerVert = `
#define BONE_COUNT 54
attribute vec2 boneIndices;
attribute vec2 boneWeights;
uniform vec3 u_bonePoses[BONE_COUNT];
uniform vec4 u_boneOrients[BONE_COUNT];
varying vec3 v_worldPosition;
varying vec3 v_worldNormal;
varying vec2 v_uv;

vec3 inverseTransformDirection(in vec3 dir, in mat4 matrix) {
    return normalize((vec4(dir, 0.0) * matrix).xyz);
}

vec3 qrotate(vec4 q, vec3 v) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

void main() {
    vec3 pos = vec3(0.0);
    vec3 nor = vec3(0.0);
    
    int idx0 = int(boneIndices.x);
    vec3 bPos0 = u_bonePoses[idx0];
    vec4 bOri0 = u_boneOrients[idx0];
    pos += (qrotate(bOri0, position) + bPos0) * boneWeights.x;
    nor += qrotate(bOri0, normal) * boneWeights.x;
    
    int idx1 = int(boneIndices.y);
    vec3 bPos1 = u_bonePoses[idx1];
    vec4 bOri1 = u_boneOrients[idx1];
    pos += (qrotate(bOri1, position) + bPos1) * boneWeights.y;
    nor += qrotate(bOri1, normal) * boneWeights.y;
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    v_worldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    v_worldNormal = inverseTransformDirection(nor, viewMatrix);
    v_uv = uv;
}
`;

    const swimmerFrag = `
uniform sampler2D u_texture;
uniform vec3 u_lightPosition;
varying vec3 v_worldPosition;
varying vec3 v_worldNormal;
varying vec2 v_uv;

void main() {
    vec3 N = normalize(v_worldNormal);
    vec3 V = normalize(cameraPosition - v_worldPosition);
    vec3 L1 = normalize(vec3(0.6, 0.8, 1.0));
    vec3 L2 = normalize(vec3(-0.6, 0.4, -0.9));
    
    vec4 tex = texture2D(u_texture, v_uv);
    float diff1 = max(0.0, dot(N, L1));
    vec3 H = normalize(L1 + V);
    float spec = pow(max(0.0, dot(N, H)), 32.0);
    
    // Backlight reflection
    float backRim = pow(max(0.0, dot(reflect(-V, N), L2)), 16.0);
    float fresnel = pow(1.0 - max(0.0, dot(N, V)), 2.6);
    
    vec3 baseCol = mix(vec3(0.07, 0.10, 0.12), vec3(0.88, 0.92, 0.96), tex.a * 0.85);
    vec3 col = baseCol * (0.3 + 0.7 * diff1) + vec3(spec * 0.75) + vec3(backRim * 1.3);
    // Anemos breeze rim accent (#4FC7C4)
    col += vec3(0.31, 0.78, 0.77) * (fresnel * 0.5);
    
    gl_FragColor = vec4(col, 1.0);
}
`;

    let swimmerMesh = null;
    let animPos = null;
    let animOrient = null;
    let swimmerFrameCount = 0;
    const _qA = new THREE.Quaternion();
    const _qB = new THREE.Quaternion();

    Promise.all([
      fetch('assets/models/person.buf').then(r => r.arrayBuffer()),
      fetch('assets/models/person_idle.buf').then(r => r.arrayBuffer()),
      new THREE.TextureLoader().loadAsync('assets/textures/person.webp')
    ]).then(([modelBuf, animBuf, texture]) => {
      const modelData = parseBuf(modelBuf);
      const animData = parseBuf(animBuf);
      
      animPos = animData.geom.attributes.position.array;
      animOrient = animData.geom.attributes.orient.array;
      swimmerFrameCount = animPos.length / (BONE_COUNT * 3);

      const mat = new THREE.ShaderMaterial({
        vertexShader: swimmerVert,
        fragmentShader: swimmerFrag,
        uniforms: {
          u_texture: { value: texture },
          u_lightPosition: { value: new THREE.Vector3(0, 0.85, 0) },
          u_bonePoses: { value: bonePoses },
          u_boneOrients: { value: boneOrients }
        },
        side: THREE.DoubleSide
      });

      swimmerMesh = new THREE.Mesh(modelData.geom, mat);
      // Floating horizontally in the center of the particle vortex
      swimmerMesh.position.set(0.1, 0.85, -0.15);
      swimmerMesh.rotation.set(0.08, 0.25, Math.PI * 0.5);
      swimmerMesh.scale.set(1.5, 1.5, 1.5);
      scene.add(swimmerMesh);
    }).catch(err => {
      console.warn('Swimmer model load skipped:', err);
    });

    // -------------------------------------------------------------
    // Interactive state
    // -------------------------------------------------------------
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    let isDown = false;
    let freezeRatio = 0.0;

    function onPointerMove(e) {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      mouse.targetX = ((clientX - rect.left) / rect.width) * 2.0 - 1.0;
      mouse.targetY = -(((clientY - rect.top) / rect.height) * 2.0 - 1.0);
    }

    function onPointerDown() {
      isDown = true;
    }

    function onPointerUp() {
      isDown = false;
    }

    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    canvas.addEventListener('touchmove', onPointerMove, { passive: true });
    canvas.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchend', onPointerUp, { passive: true });

    function onResize() {
      width = heroSection ? heroSection.clientWidth : window.innerWidth;
      height = heroSection ? heroSection.clientHeight : window.innerHeight;
      const mobile = width < 768;
      camera.fov = mobile ? 48 : 38;
      camera.aspect = width / height;
      camera.position.z = mobile ? 8.5 : 7.2;
      camera.position.y = 0.4;
      camera.updateProjectionMatrix();
      camera.lookAt(0, 0.8, 0);
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    }
    window.addEventListener('resize', onResize);

    // Visibility Culling
    let isHeroVisible = true;
    const observer = new IntersectionObserver((entries) => {
      isHeroVisible = entries[0].isIntersecting;
    }, { threshold: 0.05 });
    if (heroSection) observer.observe(heroSection);

    // -------------------------------------------------------------
    // Main Render Loop
    // -------------------------------------------------------------
    let lastTime = performance.now();
    let simTotalTime = 0;

    function animate(currentTime) {
      requestAnimationFrame(animate);
      if (!isHeroVisible) return;

      const rawDt = Math.min((currentTime - lastTime) * 0.001, 0.05);
      lastTime = currentTime;

      // Smooth mouse spring
      mouse.x += (mouse.targetX - mouse.x) * 0.06;
      mouse.y += (mouse.targetY - mouse.y) * 0.06;

      // Slow-motion freeze on click/hold
      const targetFreeze = isDown ? 0.88 : 0.0;
      freezeRatio += (targetFreeze - freezeRatio) * 0.1;
      const simDt = rawDt * (1.0 - freezeRatio * 0.85);
      simTotalTime += simDt;

      // Camera parallax
      camera.position.x = mouse.x * 0.35;
      camera.position.y = 0.4 + mouse.y * 0.25;
      camera.lookAt(0, 0.8, 0);

      // Vortex focal position tracks mouse smoothly around upper-center
      simUniforms.u_lightPosition.value.x = mouse.x * 0.45;
      simUniforms.u_lightPosition.value.y = 0.85 + mouse.y * 0.35;

      // Advance noise
      noiseTime += simDt * 0.35;
      noiseScaleTime += simDt * 0.2;
      noiseStableTime += simDt * 0.25;

      simUniforms.u_introDeltaTime.value = simDt;
      simUniforms.u_noiseTime.value = noiseTime;
      simUniforms.u_noiseScale.value = noise.get(noiseScaleTime) * 1.5;
      simUniforms.u_noiseStableFactor.value = noise.get(noiseStableTime);

      // GPGPU Step
      renderer.setRenderTarget(rtCurr);
      renderer.render(simScene, simCamera);

      const temp = rtPrev;
      rtPrev = rtCurr;
      rtCurr = temp;

      renderer.setRenderTarget(null);

      // Update particle uniforms
      simUniforms.u_simCurrPosLifeTexture.value = rtPrev.texture;
      nonEmissiveMat.uniforms.u_simCurrPosLifeTexture.value = rtCurr.texture;
      emissiveMat.uniforms.u_simCurrPosLifeTexture.value = rtCurr.texture;

      // Update 3D swimmer animation
      if (swimmerMesh && animPos && swimmerFrameCount > 0) {
        const t = (simTotalTime * 30) % swimmerFrameCount;
        const r = Math.floor(t);
        const n = (r + 1) % swimmerFrameCount;
        const a = t - r;
        const l = r * BONE_COUNT;
        const c = n * BONE_COUNT;

        for (let f = 0; f < BONE_COUNT; f++) {
          const i0 = (l + f) * 3;
          const i1 = (c + f) * 3;
          bonePoses[f].set(
            animPos[i0] * (1 - a) + animPos[i1] * a,
            animPos[i0 + 1] * (1 - a) + animPos[i1 + 1] * a,
            animPos[i0 + 2] * (1 - a) + animPos[i1 + 2] * a
          );

          const q0 = (l + f) * 4;
          const q1 = (c + f) * 4;
          _qA.set(animOrient[q0], animOrient[q0 + 1], animOrient[q0 + 2], animOrient[q0 + 3]);
          _qB.set(animOrient[q1], animOrient[q1 + 1], animOrient[q1 + 2], animOrient[q1 + 3]);
          _qA.slerp(_qB, a);
          boneOrients[f].set(_qA.x, _qA.y, _qA.z, _qA.w);
        }

        // Swimmer parallax tilt
        swimmerMesh.rotation.y = 0.25 + mouse.x * 0.2;
        swimmerMesh.rotation.x = 0.08 - mouse.y * 0.15;
      }

      // Render 3D hero scene
      renderer.render(scene, camera);
    }

    requestAnimationFrame(animate);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeroSimulation);
  } else {
    initHeroSimulation();
  }
})();
