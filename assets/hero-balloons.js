/**
 * pilotarbuza — облако мелких шариков на первом экране.
 * GPU-симуляция частиц, инстансы шариков, глубина резкости, блум и след курсора.
 * Всё строится в коде, внешних моделей нет.
 */
/* Simplex noise adapted from https://github.com/ashima/webgl-noise
 * Copyright (C) 2011 by Ashima Arts (Simplex noise)
 * Copyright (C) 2011-2016 by Stefan Gustavson (Classic noise and others)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
(async function () {
  'use strict';
  /* Облако мелких шариков вокруг светящегося центра.
     Каждый шарик рождается на оболочке у центра, живёт около двух секунд,
     его закручивает вихрь вокруг плавающей оси (две половины частиц в разные стороны)
     и несёт curl-шум, сила которого то затихает, то вспыхивает.
     Иногда облако входит в «напряжённую» фазу: жизнь короче, вихрь сильнее.
     Зажатая кнопка мыши замедляет время в десять раз; камера смотрит за курсором;
     за курсором по картинке течёт след с лёгким разложением цвета. */
  const hero = document.getElementById('hero');
  const canvas = document.getElementById('hero-balloons-canvas');
  if (!hero || !canvas) return;
  const motion = document.getElementById('hero-motion-toggle');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer, stopped = false, paused = reducedMotion.matches;
  let frame = 0, visible = true, previousTime = 0;
  const resources = [];
  const track = r => (resources.push(r), r);

  function fallback() {
    stopped = true;
    cancelAnimationFrame(frame);
    hero.classList.add('hero-static');
    hero.dataset.renderState = 'fallback';
    if (motion) motion.hidden = true;
    resources.forEach(r => r.dispose && r.dispose());
    if (renderer) renderer.dispose();
  }

  // одномерный шум с октавами — для «дыхания» силы потока
  function noise1D(seed) {
    const vals = []; let s = seed;
    for (let i = 0; i < 256; i++) { s = (s * 16807) % 2147483647; vals.push(s / 2147483647); }
    const at = x => { const i = Math.floor(x), f = x - i, t = f * f * (3 - 2 * f); return vals[i & 255] * (1 - t) + vals[(i + 1) & 255] * t; };
    return (x, oct) => { let a = .5, fr = 1, sum = 0, norm = 0; for (let o = 0; o < oct; o++) { sum += (at(x * fr) * 2 - 1) * a; norm += a; a *= .5; fr *= 2; } return sum / norm; };
  }

  try {
    if (!window.THREE) throw new Error('WebGL library unavailable');
    const T = THREE;
    renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    const gl = renderer.getContext();
    const capable = renderer.capabilities.isWebGL2 && gl.getExtension('EXT_color_buffer_float');
    if (!capable || renderer.capabilities.maxVertexTextures === 0) throw new Error('Float render targets unavailable');
    renderer.setClearColor(0x020304, 1);
    const small = matchMedia('(max-width: 700px), (pointer: coarse)').matches;
    const lite = /[?&]lite\b/.test(location.search);
    const SW = 128, SH = lite ? 40 : small ? 112 : 192, COUNT = SW * SH;

    const screenGeometry = track(new T.PlaneGeometry(2, 2));
    const screenCamera = new T.Camera();
    const screenVertex = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
    const fopt = { type: T.FloatType, minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: false, stencilBuffer: false };
    let readTarget = track(new T.WebGLRenderTarget(SW, SH, fopt));
    let writeTarget = track(readTarget.clone());
    renderer.setRenderTarget(readTarget);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete simulation target');
    renderer.setRenderTarget(null);

    // точки рождения: оболочка радиусом 0.25–0.75, жизнь растянута по номеру частицы
    const defaults = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT; i++) {
      const u = Math.random() * Math.PI * 2, c = Math.acos(2 * Math.random() - 1);
      const r = .25 + Math.cbrt(Math.random()) * .5;
      defaults.set([r * Math.sin(c) * Math.cos(u), r * Math.sin(c) * Math.sin(u), r * Math.cos(c), i / COUNT - 1], i * 4);
    }
    const defaultTex = track(new T.DataTexture(defaults, SW, SH, T.RGBAFormat, T.FloatType));
    defaultTex.needsUpdate = true;

    const simUniforms = {
      prev: { value: defaultTex }, defaults: { value: defaultTex },
      dt: { value: 0 }, noiseTime: { value: 0 }, noiseScale: { value: 0 }, stable: { value: 0 }
    };
    const simMaterial = track(new T.ShaderMaterial({
      uniforms: simUniforms, vertexShader: screenVertex,
      fragmentShader: `
        precision highp float;
        uniform sampler2D prev, defaults;
        uniform float dt, noiseTime, noiseScale, stable;
        varying vec2 vUv;
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
vec4 snoiseGradient(vec4 v,out float value){
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
    vec3 m03=m0*m0*m0, m04=m03*m0;
    vec2 m13=m1*m1*m1, m14=m13*m1;
    value=49.0*(dot(m04,values0)+dot(m14,values1));
    return 49.0*(
       m04.x*p0+m04.y*p1+m04.z*p2+m14.x*p3+m14.y*p4
       -8.0*(m03.x*values0.x*x0+m03.y*values0.y*x1+m03.z*values0.z*x2
             +m13.x*values1.x*x3+m13.y*values1.y*x4));
}

        vec3 curlNoise(vec3 p, float t){
          vec4 gx = vec4(0.), gy = vec4(0.), gz = vec4(0.); float n;
          for (int i = 0; i < 2; i++){
            float k = pow(2., float(i)); float s = .5 * k * pow(.2, float(i));
            gx += snoiseGradient(vec4(p * k, t), n) * s;
            gy += snoiseGradient(vec4((p + vec3(123.4, 129.8, -123.1)) * k, t), n) * s;
            gz += snoiseGradient(vec4((p + vec3(-95.1, 90.5, -12.3)) * k, t), n) * s;
          }
          return vec3(gz.y - gy.z, gx.z - gz.x, gy.x - gx.y);
        }
        void main(){
          vec4 s = texture2D(prev, vUv);
          s.w -= (.5 + stable) * dt;
          if (s.w < 0.) {
            vec3 d = texture2D(defaults, vUv).xyz;
            s.xyz = d * (1.25 + sin(noiseTime * 2.5 + vUv.x * 21.) * .25);
            s.w += 1.;
          }
          // вихрь вокруг плавающей оси; дальние частицы крутятся сильнее, две половины навстречу
          vec3 axis = vec3(sin(noiseTime), cos(noiseTime * 2. + vUv.y * 6.2831853), 0.);
          float dist = length(s.xyz);
          if (dist > .01) {
            float spin = dt * (.1 + smoothstep(.5, 2., dist - vUv.x * .5) * (vUv.y < .5 ? 1. : -1.) * mix(2., 4., vUv.x));
            s.xyz += cross(axis, s.xyz) * spin * mix(.75, 1.5, stable);
          }
          // поток: быстрый у новорождённых, затихает к концу жизни
          s.xyz += (1.25 + .5 * noiseScale) * curlNoise(s.xyz * (.4 + .3 * stable), noiseTime) * dt
                   * mix(.4, 1.5, s.w * s.w) * mix(.75, 1.25, vUv.x);
          gl_FragColor = s;
        }`
    }));
    const simScene = new T.Scene();
    simScene.add(new T.Mesh(screenGeometry, simMaterial));

    /* ---------- параметры потока, которые меняются со временем ---------- */
    const fbmA = noise1D(1234), fbmB = noise1D(98765);
    let noiseTime = 0, scaleT = Math.random() * 50, stableT = Math.random() * 50, stablePhase = Math.random() * 6, intro = 0;
    function simulate(realDt, simDt) {
      noiseTime += realDt * .4;
      scaleT += realDt;
      stableT += realDt * .5;
      stablePhase += 3 * Math.abs(fbmB(stableT, 3)) * realDt;
      const st = Math.min(1, intro / .4) * smooth(.9, .95, .5 + .5 * Math.sin(stablePhase));
      simUniforms.dt.value = simDt;
      simUniforms.noiseTime.value = noiseTime;
      simUniforms.noiseScale.value = 10 * Math.abs(fbmA(scaleT, 3));
      simUniforms.stable.value = st;
      simUniforms.prev.value = readTarget.texture;
      renderer.setRenderTarget(writeTarget);
      renderer.render(simScene, screenCamera);
      const t = readTarget; readTarget = writeTarget; writeTarget = t;
    }
    const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

    // прогрев: облако уже живое к первому кадру
    for (let i = 0; i < 150; i++) {
      simulate(1 / 60, 1 / 60);
      if (i % 30 === 29) { renderer.setRenderTarget(null); await new Promise(r => setTimeout(r, 0)); }
    }
    renderer.setRenderTarget(null);

    /* ---------- шарики ---------- */
    const bead = track(new T.IcosahedronGeometry(1, 1));
    const geometry = track(new T.InstancedBufferGeometry());
    geometry.index = bead.index;
    Object.keys(bead.attributes).forEach(n => geometry.setAttribute(n, bead.attributes[n]));
    const simUv = new Float32Array(COUNT * 2), rands = new Float32Array(COUNT * 2);
    for (let i = 0; i < COUNT; i++) {
      const x = i % SW, y = Math.floor(i / SW);
      simUv[i * 2] = (x + .5) / SW; simUv[i * 2 + 1] = (y + .5) / SH;
      rands[i * 2] = Math.random(); rands[i * 2 + 1] = Math.random();
    }
    geometry.setAttribute('simUv', new T.InstancedBufferAttribute(simUv, 2));
    geometry.setAttribute('rand', new T.InstancedBufferAttribute(rands, 2));
    geometry.instanceCount = COUNT;

    const beadUniforms = {
      curr: { value: null }, prevPos: { value: null },
      stretch: { value: 1.6 }, emissiveCut: { value: 1.5 / SW }, fogStart: { value: 5 }
    };
    const beadMaterial = track(new T.ShaderMaterial({
      uniforms: beadUniforms,
      vertexShader: `
        attribute vec2 simUv; attribute vec2 rand;
        uniform sampler2D curr, prevPos; uniform float stretch, emissiveCut;
        varying vec3 vN, vW; varying float vEm, vLife, vDepth, vDist;
        float ls(float a, float b, float x){ return clamp((x - a) / (b - a), 0., 1.); }
        void main(){
          vec4 c = texture2D(curr, simUv);
          vec4 p = texture2D(prevPos, simUv);
          float em = simUv.x < emissiveCut ? 1. : 0.;
          float life = ls(0., .1, c.w) * ls(1., .9, c.w);
          float size = mix(.06, .175, em) * (.5 + rand.x * .5) * life;
          vec3 n = normalize(position);
          vec3 world = c.xyz + position * size;
          // размытие в движении: задняя половина шарика тянется к прошлому положению
          vec3 vel = c.xyz - p.xyz;
          if (c.w <= p.w && length(vel) > 1e-5) {
            float back = step(dot(n, vel), 0.);
            vec3 tail = vel * stretch;
            float tl = length(tail);
            tail *= min(tl, size * 5.) / tl;             // хвост не длиннее пяти размеров шарика
            world -= tail * back;
          }
          vec4 view = modelViewMatrix * vec4(world, 1.);
          vN = n; vW = world; vEm = em; vLife = life; vDepth = -view.z; vDist = length(c.xyz);
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `
        uniform float fogStart;
        varying vec3 vN, vW; varying float vEm, vLife, vDepth, vDist;
        float ls(float a, float b, float x){ return clamp((x - a) / (b - a), 0., 1.); }
        void main(){
          vec3 N = normalize(vN);
          vec3 V = normalize(cameraPosition - vW);
          // свет живёт в центре облака: ближние к центру шарики освещены сильнее
          vec3 L = normalize(-vW);
          float fall = ls(5., 1.2, vDist);
          float diff = max(dot(N, L), 0.) * fall;
          float key = max(dot(N, normalize(vec3(-.3, .8, .6))), 0.);
          float spec = pow(max(dot(N, normalize(L + V)), 0.), 30.) * fall;
          float rim = pow(1. - max(dot(N, V), 0.), 3.);
          float ao = mix(.55, 1., ls(.3, 2.2, vDist));
          float shade = .08 + diff * .75 + key * .2 + spec * .8 + rim * .1;
          shade *= ao * mix(.5, 1., vLife);
          vec3 col = vec3(.86, .92, .95) * shade;
          // крупные светящиеся шарики
          float face = sqrt(max(dot(N, V), 0.));
          col = mix(col, vec3(1.9, 2.05, 2.1) * (.25 + .75 * face), vEm);
          float fog = exp(-max(vDepth - fogStart, 0.) * .35);
          col = mix(vec3(.008, .011, .014), col, fog);
          gl_FragColor = vec4(col, 1.);
        }`
    }));
    const beads = new T.Mesh(geometry, beadMaterial);
    beads.frustumCulled = false;
    const scene = new T.Scene();
    scene.add(beads);
    const camera = new T.PerspectiveCamera(50, 1, .1, 60);

    /* ---------- постобработка: блум, глубина резкости, свечение центра, след курсора ---------- */
    const sceneTarget = track(new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: true }));
    sceneTarget.depthTexture = track(new T.DepthTexture(1, 1));
    const bloomA = track(new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, depthBuffer: false }));
    const bloomB = track(bloomA.clone());
    const popt = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: false, stencilBuffer: false, type: T.HalfFloatType };
    let paintA = track(new T.WebGLRenderTarget(4, 4, popt)), paintB = track(new T.WebGLRenderTarget(4, 4, popt));
    const postScene = new T.Scene();
    const quad = new T.Mesh(screenGeometry, new T.MeshBasicMaterial());
    quad.material.dispose();
    postScene.add(quad);
    const brightMaterial = track(new T.ShaderMaterial({ vertexShader: screenVertex, uniforms: { source: { value: sceneTarget.texture } }, fragmentShader: `
      varying vec2 vUv; uniform sampler2D source;
      void main(){ vec3 c = texture2D(source, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(.7, 1.5, l), 1.); }` }));
    const blurMaterial = track(new T.ShaderMaterial({ vertexShader: screenVertex, uniforms: { source: { value: null }, direction: { value: new T.Vector2() } }, fragmentShader: `
      varying vec2 vUv; uniform sampler2D source; uniform vec2 direction;
      void main(){ vec3 c = texture2D(source, vUv).rgb * .227027;
        c += texture2D(source, vUv + direction * 1.384615).rgb * .316216;
        c += texture2D(source, vUv - direction * 1.384615).rgb * .316216;
        c += texture2D(source, vUv + direction * 3.230769).rgb * .070270;
        c += texture2D(source, vUv - direction * 3.230769).rgb * .070270;
        gl_FragColor = vec4(c, 1.); }` }));
    const paintMaterial = track(new T.ShaderMaterial({ vertexShader: screenVertex,
      uniforms: { prev: { value: null }, from: { value: new T.Vector2() }, to: { value: new T.Vector2() }, vel: { value: new T.Vector2() }, radius: { value: .05 }, aspect: { value: 1 }, on: { value: 0 } },
      fragmentShader: `
        uniform sampler2D prev; uniform vec2 from, to, vel; uniform float radius, aspect, on;
        varying vec2 vUv;
        void main(){
          vec4 d = texture2D(prev, vUv);
          d = texture2D(prev, vUv - d.xy * .01);           // след течёт по своей скорости
          vec2 v = d.xy * .95; float w = d.z * .95;
          vec2 p = vUv, a = from, b = to; p.x *= aspect; a.x *= aspect; b.x *= aspect;
          vec2 pa = p - a, ba = b - a;
          float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-7), 0., 1.);
          float k = (1. - smoothstep(0., radius, length(pa - ba * h))) * on;
          v = mix(v, vel, k); w = max(w, k * clamp(length(vel) * 3., 0., 1.));
          gl_FragColor = vec4(v, w, 1.);
        }` }));
    const compositeUniforms = { source: { value: sceneTarget.texture }, depth: { value: sceneTarget.depthTexture }, bloom: { value: bloomA.texture }, paint: { value: null },
      resolution: { value: new T.Vector2() }, focus: { value: 5 }, glow: { value: new T.Vector3(.5, .5, 0) } };
    const compositeMaterial = track(new T.ShaderMaterial({ vertexShader: screenVertex, uniforms: compositeUniforms, fragmentShader: `
      varying vec2 vUv; uniform sampler2D source, depth, bloom, paint; uniform vec2 resolution; uniform float focus; uniform vec3 glow;
      float viewDepth(vec2 uv){ float d = texture2D(depth, uv).x; return 6. / (60. - d * 59.9); }
      void main(){
        vec4 pd = texture2D(paint, vUv);
        vec2 off = -pd.xy * pd.z * .06;
        vec2 uv = vUv + off;
        vec3 color = texture2D(source, uv).rgb;
        // разложение цвета в следе курсора
        color.r = texture2D(source, uv + off * .35).r;
        color.b = texture2D(source, uv - off * .35).b;
        float z = viewDepth(uv);
        float blur = clamp(abs(z - focus) * 2.2 - .3, 0., 5.);
        float weight = 1.;
        for (int i = 0; i < 12; i++){
          float f = float(i) + .5; float ang = f * 2.399963;
          vec2 o = vec2(cos(ang), sin(ang)) * sqrt(f / 12.) * blur / resolution;
          float nz = viewDepth(uv + o);
          float w = nz < z - .35 ? .35 : 1.;
          color += texture2D(source, uv + o).rgb * w; weight += w;
        }
        color /= weight;
        color += texture2D(bloom, uv).rgb * .9;
        // мягкое свечение из центра облака
        vec2 q = (vUv - glow.xy) * vec2(resolution.x / resolution.y, 1.);
        color += vec3(.55, .62, .66) * exp(-dot(q, q) * 9.) * .16 * glow.z;
        color = vec3(1.) - exp(-color * 1.45);
        color = pow(color, vec3(.85));
        color *= 1. - smoothstep(.3, .9, length((vUv - .5) * vec2(1., .8))) * .5;
        gl_FragColor = vec4(color, 1.);
      }` }));
    function post(material, target) { quad.material = material; renderer.setRenderTarget(target); renderer.render(postScene, screenCamera); }

    /* ---------- камера ---------- */
    let width = 1, height = 1, pixelRatio = 1, camDist = 5.2;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const mUv = new T.Vector2(.5, .5), mUvPrev = new T.Vector2(.5, .5);
    let pointerIn = false, isDown = false, freeze = 0, scrollRatio = 0;
    const center = new T.Vector3();
    function placeCamera() {
      const lift = height > width ? .35 : .55;                 // облако чуть выше заголовка
      const sy = scrollRatio * 3.2;                             // при прокрутке облако уезжает вверх
      camera.position.set(pointer.x * .35, -lift - sy + pointer.y * .2, camDist);
      camera.lookAt(pointer.x * .25, -lift - sy + pointer.y * .15, 0);
      // где центр облака на экране — туда кладём свечение
      center.set(0, 0, 0).project(camera);
      compositeUniforms.glow.value.set(center.x * .5 + .5, center.y * .5 + .5, 1);
    }

    function render() {
      beadUniforms.curr.value = readTarget.texture;
      beadUniforms.prevPos.value = writeTarget.texture;
      placeCamera();
      renderer.setRenderTarget(sceneTarget); renderer.render(scene, camera);
      post(brightMaterial, bloomA);
      for (let i = 0; i < 3; i++) {
        blurMaterial.uniforms.source.value = bloomA.texture;
        blurMaterial.uniforms.direction.value.set((1 + i * 1.8) / bloomA.width, 0); post(blurMaterial, bloomB);
        blurMaterial.uniforms.source.value = bloomB.texture;
        blurMaterial.uniforms.direction.value.set(0, (1 + i * 1.8) / bloomA.height); post(blurMaterial, bloomA);
      }
      // след курсора
      paintMaterial.uniforms.prev.value = paintA.texture;
      paintMaterial.uniforms.from.value.copy(mUvPrev);
      paintMaterial.uniforms.to.value.copy(mUv);
      const vx = (mUv.x - mUvPrev.x) * 12, vy = (mUv.y - mUvPrev.y) * 12, vl = Math.hypot(vx, vy);
      paintMaterial.uniforms.vel.value.set(vx, vy).multiplyScalar(vl > 1 ? 1 / vl : 1);
      paintMaterial.uniforms.on.value = pointerIn ? 1 : 0;
      post(paintMaterial, paintB);
      const t = paintA; paintA = paintB; paintB = t;
      mUvPrev.copy(mUv);
      compositeUniforms.paint.value = paintA.texture;
      post(compositeMaterial, null);
      hero.dataset.renderState = 'ready';
    }

    function resize() {
      if (stopped) return;
      width = Math.max(1, hero.clientWidth); height = Math.max(1, hero.clientHeight);
      pixelRatio = Math.min(devicePixelRatio || 1, small ? 1.35 : 1.6);
      renderer.setPixelRatio(pixelRatio); renderer.setSize(width, height, false);
      const w = Math.round(width * pixelRatio), h = Math.round(height * pixelRatio);
      sceneTarget.setSize(w, h);
      bloomA.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)); bloomB.setSize(bloomA.width, bloomA.height);
      paintA.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)); paintB.setSize(paintA.width, paintA.height);
      paintMaterial.uniforms.aspect.value = width / height;
      paintMaterial.uniforms.radius.value = Math.max(.04, 70 / height);
      compositeUniforms.resolution.value.set(w, h);
      camera.aspect = width / height;
      camera.fov = width < 700 ? 62 : 50;
      // облако около трёх единиц в поперечнике должно влезать и по ширине
      const half = Math.tan(camera.fov * Math.PI / 360);
      camDist = Math.max(2.9 / half, 2.6 / (half * camera.aspect));
      camera.updateProjectionMatrix();
      compositeUniforms.focus.value = camDist;
      beadUniforms.fogStart.value = camDist + .2;
      if (paused) render();
    }

    function syncMotion() {
      if (!motion) return;
      motion.hidden = false;
      motion.setAttribute('aria-pressed', String(paused));
      motion.setAttribute('aria-label', paused ? 'Resume motion' : 'Pause motion');
      const label = motion.querySelector('.hero-motion-label');
      (label || motion).textContent = paused ? 'RESUME MOTION' : 'PAUSE MOTION';
      hero.dataset.motion = paused ? 'paused' : 'running';
    }

    function animate(now) {
      frame = 0;
      if (stopped || paused || !visible || document.hidden) return;
      const dt = previousTime ? Math.min((now - previousTime) / 1000, 1 / 20) : 1 / 60;
      previousTime = now;
      intro = Math.min(1, intro + dt / 4);
      // зажатая кнопка — замедленная съёмка
      freeze += ((isDown ? 1 : 0) - freeze) * (1 - Math.exp(-dt * 6));
      const simDt = dt * (1 - freeze * .9);
      const ease = 1 - Math.exp(-dt * 4);
      pointer.x += (pointer.tx - pointer.x) * ease; pointer.y += (pointer.ty - pointer.y) * ease;
      simulate(dt, simDt);
      beadUniforms.stretch.value = 1.6 * Math.min(3, (1 / 60) / Math.max(simDt, 1e-4)) * (1 - freeze * .4);
      render();
      frame = requestAnimationFrame(animate);
    }
    function schedule() { if (!stopped && !frame && !paused && visible && !document.hidden) { previousTime = 0; frame = requestAnimationFrame(animate); } }
    function setPaused(v) { if (stopped) return; paused = v; cancelAnimationFrame(frame); frame = 0; syncMotion(); if (paused) render(); else schedule(); }

    /* ---------- ввод ---------- */
    const setPointer = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      pointer.tx = x * 2 - 1; pointer.ty = 1 - y * 2;
      mUv.set(x, 1 - y);
    };
    hero.addEventListener('pointermove', e => {
      setPointer(e);
      if (!pointerIn) { pointerIn = true; mUvPrev.copy(mUv); }
    }, { passive: true });
    hero.addEventListener('pointerdown', e => {
      if (e.target.closest('a, button')) return;
      setPointer(e); pointerIn = true; mUvPrev.copy(mUv);
      isDown = true;
    }, { passive: true });
    const release = () => { isDown = false; };
    addEventListener('pointerup', release, { passive: true });
    addEventListener('pointercancel', release, { passive: true });
    addEventListener('blur', release);
    hero.addEventListener('pointerleave', () => { pointerIn = false; pointer.tx = 0; pointer.ty = 0; release(); }, { passive: true });
    addEventListener('scroll', () => {
      scrollRatio = Math.min(1, Math.max(0, scrollY / Math.max(1, hero.offsetHeight)));
      if (paused && visible) render();
    }, { passive: true });

    if (motion) motion.addEventListener('click', () => setPaused(!paused));
    reducedMotion.addEventListener('change', e => setPaused(e.matches));
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      hero.dataset.visible = String(visible);
      if (!visible) { cancelAnimationFrame(frame); frame = 0; release(); } else schedule();
    }, { threshold: 0 });
    observer.observe(hero);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; release(); } else schedule(); });
    addEventListener('resize', resize, { passive: true });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); observer.disconnect(); fallback(); });
    addEventListener('pagehide', () => { cancelAnimationFrame(frame); frame = 0; release(); });
    addEventListener('pageshow', schedule);
    if (paused) intro = 1;
    resize(); syncMotion(); render(); schedule();
  } catch (error) {
    console.warn('Particle scene unavailable:', error.message);
    fallback();
  }
})();
