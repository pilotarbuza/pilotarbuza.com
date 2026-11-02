/**
 * pilotarbuza — particle flight.
 * GPU advection, instanced beads, depth of field and a separate bloom pass.
 * Everything is generated locally; no runtime requests to the reference site.
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
  const hero = document.getElementById('hero');
  const canvas = document.getElementById('hero-balloons-canvas');
  if (!hero || !canvas) return;
  const motion = document.getElementById('hero-motion-toggle');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer, stopped = false, paused = reducedMotion.matches;
  let frame = 0, visible = true, previousTime = 0, elapsed = 0, accumulator = 0;
  const simulationStep = 1 / 90;
  let width = 1, height = 1, pixelRatio = 1;
  let isDown = false, speed = 1;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const resources = [];
  const track = resource => { resources.push(resource); return resource; };

  function fallback() {
    stopped = true;
    cancelAnimationFrame(frame);
    hero.classList.add('hero-static');
    hero.dataset.renderState = 'fallback';
    if (motion) motion.hidden = true;
    resources.forEach(resource => resource.dispose());
    if (renderer) renderer.dispose();
  }

  try {
    if (!window.THREE) throw new Error('WebGL library unavailable');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    const gl = renderer.getContext();
    // Float simulation targets must be renderable, not merely sampleable.
    const capable = renderer.capabilities.isWebGL2 && gl.getExtension('EXT_color_buffer_float');
    if (!capable || renderer.capabilities.maxVertexTextures === 0) throw new Error('Float render targets unavailable');
    renderer.setClearColor(0x020304, 1);
    const small = matchMedia('(max-width: 700px), (pointer: coarse)').matches;
    const grid = small ? 80 : 128;
    const count = grid * grid;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 40);
    const simScene = new THREE.Scene();
    const screenCamera = new THREE.Camera();
    const screenGeometry = track(new THREE.PlaneGeometry(2, 2));
    const screenVertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
    const targetOptions = { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false };
    let readTarget = track(new THREE.WebGLRenderTarget(grid, grid, targetOptions));
    let writeTarget = track(readTarget.clone());
    renderer.setRenderTarget(readTarget);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete simulation target');
    renderer.setRenderTarget(null);

    // Stable seeded distribution makes the first frame useful even with motion disabled.
    let seed = 48173;
    function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
    const initial = new Float32Array(count * 4);
    const samples = new Float32Array(count * 2);
    const variants = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const u = random() * 2 - 1, v = random() * 2 - 1;
      const angle = v * 3.1 + .4 * Math.sin(v * 2.7);
      const ribbonWidth = .28 + .16 * Math.cos(v * 2.2);
      const thickness = (random() + random() + random() - 1.5) * .035;
      let x = .72 * Math.sin(angle) + u * ribbonWidth * Math.cos(angle);
      let y = 1.6 * v + .12 * u;
      let z = .6 * Math.cos(angle) - u * ribbonWidth * Math.sin(angle) + thickness;
      const tail = random() > .89;
      if (tail) { x *= 1.25; y *= 1.2; z += (random() - .5) * 1.45; }
      // Adjacent particles share an age so a folding sheet remains a sheet.
      // A small diffuse population supplies the drifting fringe between folds.
      const life = tail ? random() : (i % 3) / 3 + random() * .006;
      initial.set([x, y + .62, z, life], i * 4);
      samples.set([(i % grid + 0.5) / grid, (Math.floor(i / grid) + 0.5) / grid], i * 2);
      // Sparse luminous pearls; ordinary beads remain slate grey.
      variants.set([random(), random(), random(), i % 2017 === 0 ? 1 : 0], i * 4);
    }
    const initialTexture = track(new THREE.DataTexture(initial, grid, grid, THREE.RGBAFormat, THREE.FloatType));
    initialTexture.needsUpdate = true;
    const simUniforms = {
      positions: {value: initialTexture}, origins: {value: initialTexture},
      dt: {value: 1 / 60}, time: {value: 0}, pointer: {value: new THREE.Vector3()}, press: {value: 0}
    };
    const simMaterial = track(new THREE.ShaderMaterial({
      uniforms: simUniforms, vertexShader: screenVertex,
      fragmentShader: `
        precision highp float;
        uniform sampler2D positions, origins;
        uniform float dt, time, press;
        uniform vec3 pointer;
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

// p is relative to cloud centre. Use directly as velocity with dt seconds.
// Three derivative-noise evaluations versus the original eight scalar evaluations.
vec3 foldedFlow(vec3 p,float time){
    const float frequency=.93;
    const float strength=.26;
    float n0,n1,n2;
    vec4 q=vec4(p*frequency,time*.115);
    vec4 g0=snoiseGradient(q,n0);
    vec4 g1=snoiseGradient(q+vec4(31.42,17.73,-11.67,9.21),n1);
    vec4 g2=snoiseGradient(q+vec4(-21.16,8.39,43.51,-17.31),n2);
    vec3 potential=vec3(n0,n1,n2)*strength;
    vec3 velocity=vec3(g2.y-g1.z,g0.z-g2.x,g1.x-g0.y)*frequency*strength;

    // Weak changing rotation supplies large-scale twisting; noise remains dominant.
    // A = -.5*dot(p,p)*omega gives curl(A)=cross(omega,p).
    vec3 omega=vec3(.06*sin(time*.13),.18,.04*cos(time*.17));
    potential-=.5*dot(p,p)*omega;
    velocity+=cross(omega,p);

    // Apply a broad smooth envelope to the potential, then take its curl.
    // Multiplying velocity by an envelope alone would introduce compression.
    vec3 invRadius2=1./vec3(1.6*1.6,2.1*2.1,1.3*1.3);
    float radius2=dot(p*p,invRadius2);
    float envelope=exp(-radius2*.32);
    vec3 envelopeGradient=-.64*envelope*p*invRadius2;
    return envelope*velocity+cross(envelopeGradient,potential);
}

        vec3 velocityAt(vec3 p, float t) {
          vec3 velocity = foldedFlow(p, t);
          vec3 relative = p - (pointer - vec3(0., .62, 0.));
          float influence = exp(-dot(relative, relative) * 1.6);
          velocity += cross(vec3(0., 0., 1.), relative) * influence * press * .8;
          return velocity;
        }
        void main(){
          vec4 state=texture2D(positions,vUv);
          float nextLife=state.w+dt/11.;
          if(nextLife>=1.){
            state=texture2D(origins,vUv);
            // Slowly turn the emitting sheet, so successive folds do not stack.
            float angle=.24*sin(time*.19);
            state.xz=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*state.xz;
          }
          state.w=fract(nextLife);
          vec3 p=state.xyz-vec3(0.,.62,0.);
          vec3 first=velocityAt(p,time);
          vec3 velocity=velocityAt(p+first*dt*.5,time+dt*.5);
          state.xyz+=velocity*dt;
          gl_FragColor=state;
        }`
    }));
    simScene.add(new THREE.Mesh(screenGeometry, simMaterial));
    function simulate(dt, time) {
      simUniforms.dt.value = dt;
      simUniforms.time.value = time;
      renderer.setRenderTarget(writeTarget);
      renderer.render(simScene, screenCamera);
      const swap = readTarget; readTarget = writeTarget; writeTarget = swap;
      simUniforms.positions.value = readTarget.texture;
    }
    // Complete one lifetime so all three sheets have distinct physical ages.
    // Yield between batches to keep navigation responsive during initialization.
    for (let step = 0; step < 540; step++) {
      simulate(1 / 45, step / 45);
      if (step % 36 === 35) {
        renderer.setRenderTarget(null);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    elapsed = 12;
    renderer.setRenderTarget(null);

    // Reuse the compact dome geometry already shipped with the site. Camera-facing
    // hemispheres retain the reference bead outline at a fraction of full-sphere cost.
    function decodeBead(buffer) {
      const length = new DataView(buffer).getUint32(0, true);
      const metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, length)));
      const result = new THREE.BufferGeometry();
      let offset = 4 + length;
      for (const attribute of metadata.attributes) {
        const type = {Int16Array, Uint16Array, Uint8Array}[attribute.storageType];
        if (!type) throw new Error('Unsupported bead attribute');
        const count = (attribute.id === 'indices' ? metadata.indexCount : metadata.vertexCount) * attribute.componentSize;
        const bytes = count * type.BYTES_PER_ELEMENT;
        const raw = new type(buffer.slice(offset, offset + bytes));
        offset += bytes;
        let values = raw;
        if (attribute.needsPack) {
          values = new Float32Array(count);
          const signedOffset = type === Int16Array ? 32768 : 0;
          for (let i = 0; i < count; i++) {
            const component = attribute.packedComponents[i % attribute.componentSize];
            values[i] = (raw[i] + signedOffset) / 65536 * component.delta + component.from;
          }
        }
        if (attribute.id === 'indices') result.setIndex(new THREE.BufferAttribute(values, 1));
        else result.setAttribute(attribute.id, new THREE.BufferAttribute(values, attribute.componentSize));
      }
      return result;
    }
    const beadResponse = await fetch('assets/models/sphere_m.buf');
    if (!beadResponse.ok) throw new Error('Bead geometry unavailable');
    const bead = track(decodeBead(await beadResponse.arrayBuffer()));
    const geometry = track(new THREE.InstancedBufferGeometry());
    geometry.index = bead.index;
    Object.keys(bead.attributes).forEach(name => geometry.setAttribute(name, bead.attributes[name]));
    geometry.setAttribute('sampleUV', new THREE.InstancedBufferAttribute(samples, 2));
    geometry.setAttribute('variant', new THREE.InstancedBufferAttribute(variants, 4));
    geometry.instanceCount = count;
    const beadUniforms = {
      positions: {value: readTarget.texture}, previousPositions: {value: writeTarget.texture},
      interpolation: {value: 1}, fogStart: {value: 6.6},
      lightA: {value: new THREE.Vector3()}, lightB: {value: new THREE.Vector3()}
    };
    const beadMaterial = track(new THREE.ShaderMaterial({
      uniforms: beadUniforms,
      side: THREE.DoubleSide,
      vertexShader: `
        attribute vec2 sampleUV;
        attribute vec4 variant;
        uniform sampler2D positions, previousPositions;
        uniform float interpolation;
        varying vec3 vNormal, vWorld;
        varying vec4 vVariant;
        varying float vDepth;
        void main(){
          vec4 state=texture2D(positions,sampleUV);
          vec4 previous=texture2D(previousPositions,sampleUV);
          // Never interpolate across respawn: that would draw a streak back to the emitter.
          if(state.w>=previous.w) state=mix(previous,state,interpolation);
          float life=smoothstep(0.,.06,state.w)*(1.-smoothstep(.94,1.,state.w));
          float size=mix(.018,.062,pow(variant.x,2.2));
          size=mix(size,.095+variant.x*.025,variant.w);
          vec3 center=vec3(0.,.62,0.);
          vec3 cloud=state.xyz-center;

          float fringe=smoothstep(.985,1.,variant.z);
          cloud*=1.+fringe*.35;
          cloud.z+=fringe*1.3;
          cloud.z+=variant.w*.42;
          vec3 beadPosition=vec3(position.xy,-position.z);

          vec3 world=center+cloud+(vec4(beadPosition*size*life,0.)*viewMatrix).xyz;
          vec4 view=modelViewMatrix*vec4(world,1.);
          vNormal=(vec4(normal.xy,-normal.z,0.)*viewMatrix).xyz;
          vWorld=world;
          vVariant=variant;
          vDepth=-view.z;
          gl_Position=projectionMatrix*view;
        }`,
      fragmentShader: `
        uniform vec3 lightA, lightB;
        uniform float fogStart;
        varying vec3 vNormal, vWorld;
        varying vec4 vVariant;
        varying float vDepth;
        void main(){
          vec3 N=normalize(vNormal), V=normalize(cameraPosition-vWorld);
          vec3 deltaA=lightA-vWorld, deltaB=lightB-vWorld;
          vec3 L=normalize(deltaA), L2=normalize(deltaB);
          float a=1./(1.+dot(deltaA,deltaA)*1.7);
          float b=1./(1.+dot(deltaB,deltaB)*2.1);
          float diffuse=max(dot(N,normalize(vec3(-.35,.8,1.))),0.);
          float local=max(dot(N,L),0.)*a+max(dot(N,L2),0.)*b*.8;
          float spec=pow(max(dot(N,normalize(L+V)),0.),28.)*a;
          float rim=pow(1.-max(dot(N,V),0.),3.);

          vec3 slate=mix(vec3(.10,.12,.135),vec3(.22,.255,.27),vVariant.y);
          vec3 color=slate*(.28+diffuse*.75+local*1.8);
          color+=vec3(.32,.38,.40)*spec*.75;
          color+=vec3(.08,.13,.14)*rim*.30;
          if(vVariant.w>.5) color=vec3(1.85,2.1,2.15)*(.16+.84*sqrt(max(dot(N,V),0.)));
          float fog=exp(-max(vDepth-fogStart,0.)*.28);
          color=mix(vec3(.008,.012,.016),color,fog);
          gl_FragColor=vec4(color,1.);
        }`
    }));
    const beads = new THREE.Mesh(geometry, beadMaterial);
    beads.frustumCulled = false;
    scene.add(beads);

    // Half-float colour retains luminous cores until bloom and tone mapping.
    const sceneTarget=track(new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType, minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true}));
    sceneTarget.depthTexture=track(new THREE.DepthTexture(1,1));
    const bloomA=track(new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false}));
    const bloomB=track(bloomA.clone());
    const postScene=new THREE.Scene();
    const quad=new THREE.Mesh(screenGeometry,new THREE.MeshBasicMaterial());
    quad.material.dispose();
    postScene.add(quad);
    const brightMaterial=track(new THREE.ShaderMaterial({vertexShader:screenVertex,uniforms:{source:{value:sceneTarget.texture}},fragmentShader:`
      varying vec2 vUv;uniform sampler2D source;
      void main(){vec3 c=texture2D(source,vUv).rgb;float l=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c*smoothstep(.65,1.4,l),1.);}` }));
    const blurMaterial=track(new THREE.ShaderMaterial({vertexShader:screenVertex,uniforms:{source:{value:null},direction:{value:new THREE.Vector2()}},fragmentShader:`
      varying vec2 vUv;uniform sampler2D source;uniform vec2 direction;
      void main(){vec3 c=texture2D(source,vUv).rgb*.227027;
      c+=texture2D(source,vUv+direction*1.384615).rgb*.316216;
      c+=texture2D(source,vUv-direction*1.384615).rgb*.316216;
      c+=texture2D(source,vUv+direction*3.230769).rgb*.070270;
      c+=texture2D(source,vUv-direction*3.230769).rgb*.070270;
      gl_FragColor=vec4(c,1.);}` }));
    const compositeUniforms={source:{value:sceneTarget.texture},depth:{value:sceneTarget.depthTexture},bloom:{value:bloomA.texture},resolution:{value:new THREE.Vector2()},focus:{value:6.5},time:{value:0}};
    const compositeMaterial=track(new THREE.ShaderMaterial({vertexShader:screenVertex,uniforms:compositeUniforms,fragmentShader:`
      varying vec2 vUv;uniform sampler2D source,depth,bloom;uniform vec2 resolution;uniform float focus,time;
      float viewDepth(vec2 uv){float d=texture2D(depth,uv).x;return 4./(40.-d*39.9);}
      void main(){
        vec3 color=texture2D(source,vUv).rgb;
        float z=viewDepth(vUv);
        float blur=clamp(abs(z-focus)*2.6-.35,0.,5.5);
        // Spiral aperture samples: out-of-focus beads get soft edges, focal beads stay crisp.
        float weight=1.;
        for(int i=0;i<12;i++){
          float f=float(i)+.5;
          float angle=f*2.399963;
          vec2 offset=vec2(cos(angle),sin(angle))*sqrt(f/12.)*blur/resolution;
          vec2 uv=vUv+offset;
          float neighbour=viewDepth(uv);
          float w=neighbour<z-.35?.35:1.;
          color+=texture2D(source,uv).rgb*w;weight+=w;
        }
        color/=weight;
        color+=texture2D(bloom,vUv).rgb*.8;
        // Mild filmic curve preserves grey beads and rolls off bright pearls.
        color=vec3(1.)-exp(-color*1.45);
        color=pow(color,vec3(.82));
        float vignette=1.-smoothstep(.25,.82,length((vUv-.5)*vec2(1.,.8)))*.50;
        color*=vignette;
        gl_FragColor=vec4(color,1.);
      }` }));
    function post(material,target){quad.material=material;renderer.setRenderTarget(target);renderer.render(postScene,screenCamera);}
    function render(){
      beadUniforms.positions.value=readTarget.texture;
      beadUniforms.previousPositions.value=writeTarget.texture;
      beadUniforms.interpolation.value=paused||!previousTime?1:accumulator/simulationStep;
      beadUniforms.lightA.value.set(Math.sin(elapsed*.24)*.65,.8+Math.cos(elapsed*.31)*.55,.9);
      beadUniforms.lightB.value.set(Math.cos(elapsed*.19)*.7,.25, -.15);
      camera.position.x=pointer.x*.22;
      camera.position.y=pointer.y*.15;
      camera.lookAt(0,.14,0);
      renderer.setRenderTarget(sceneTarget);renderer.render(scene,camera);
      post(brightMaterial,bloomA);
      for(let i=0;i<3;i++){
        blurMaterial.uniforms.source.value=bloomA.texture;
        blurMaterial.uniforms.direction.value.set((1+i*1.8)/bloomA.width,0);post(blurMaterial,bloomB);
        blurMaterial.uniforms.source.value=bloomB.texture;
        blurMaterial.uniforms.direction.value.set(0,(1+i*1.8)/bloomA.height);post(blurMaterial,bloomA);
      }
      post(compositeMaterial,null);
      hero.dataset.renderState='ready';
    }
    function resize(){
      if(stopped)return;
      width=Math.max(1,hero.clientWidth);height=Math.max(1,hero.clientHeight);
      pixelRatio=Math.min(devicePixelRatio||1,small?1.35:1.6);
      renderer.setPixelRatio(pixelRatio);renderer.setSize(width,height,false);
      const w=Math.round(width*pixelRatio),h=Math.round(height*pixelRatio);
      sceneTarget.setSize(w,h);bloomA.setSize(Math.max(1,w>>2),Math.max(1,h>>2));bloomB.setSize(bloomA.width,bloomA.height);
      compositeUniforms.resolution.value.set(w,h);
      camera.aspect=width/height;
      camera.position.z=width<700?9.1:6.5;
      beadUniforms.fogStart.value=camera.position.z+.1;
      camera.fov=width<700?46:39;camera.updateProjectionMatrix();
      compositeUniforms.focus.value=camera.position.z-.2;
      if(paused&&!stopped)render();
    }
    function syncMotion(){
      if(!motion)return;
      motion.hidden=false;
      motion.setAttribute('aria-pressed',String(paused));
      motion.setAttribute('aria-label',paused?'Resume motion':'Pause motion');
      const label=motion.querySelector('.hero-motion-label');
      if(label)label.textContent=paused?'RESUME MOTION':'PAUSE MOTION';
      else motion.textContent=paused?'RESUME MOTION':'PAUSE MOTION';
      hero.dataset.motion=paused?'paused':'running';
    }
    function animate(now){
      frame=0;
      if(stopped||paused||!visible||document.hidden)return;
      const dt=previousTime?Math.min((now-previousTime)/1000,.1):1/60;
      previousTime=now;
      const ease=1-Math.exp(-dt*5);
      const stirring=Math.min(1,Math.hypot(pointer.targetX-pointer.x,pointer.targetY-pointer.y)*2);
      pointer.x+=(pointer.targetX-pointer.x)*ease;pointer.y+=(pointer.targetY-pointer.y)*ease;
      speed+=((isDown?.10:1)-speed)*ease;
      simUniforms.pointer.value.set(pointer.x*2,pointer.y*1.8+.3,.35);
      simUniforms.press.value=stirring;
      accumulator+=dt*speed;
      while(accumulator>=simulationStep){
        simulate(simulationStep,elapsed);
        elapsed+=simulationStep;
        accumulator-=simulationStep;
      }
      render();
      frame=requestAnimationFrame(animate);
    }
    function schedule(){if(!stopped&&!frame&&!paused&&visible&&!document.hidden){previousTime=0;accumulator=0;frame=requestAnimationFrame(animate);}}
    function setPaused(value){if(stopped)return;paused=value;cancelAnimationFrame(frame);frame=0;syncMotion();if(paused)render();else schedule();}
    if(motion)motion.addEventListener('click',()=>setPaused(!paused));
    reducedMotion.addEventListener('change',event=>setPaused(event.matches));
    canvas.addEventListener('pointermove',event=>{
      if(event.pointerType==='touch')return;
      const rect=canvas.getBoundingClientRect();
      pointer.targetX=(event.clientX-rect.left)/rect.width*2-1;
      pointer.targetY=1-(event.clientY-rect.top)/rect.height*2;
    },{passive:true});
    canvas.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse')isDown=true;},{passive:true});
    const release=()=>{isDown=false;};
    window.addEventListener('pointerup',release,{passive:true});
    window.addEventListener('pointercancel',release,{passive:true});
    window.addEventListener('blur',release);
    canvas.addEventListener('pointerleave',()=>{release();pointer.targetX=0;pointer.targetY=0;},{passive:true});
    const observer=new IntersectionObserver(entries=>{
      visible=entries[0].isIntersecting;
      hero.dataset.visible=String(visible);
      if(!visible){cancelAnimationFrame(frame);frame=0;release();}else schedule();
    },{threshold:0});observer.observe(hero);
    document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;release();}else schedule();});
    window.addEventListener('resize',resize,{passive:true});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();observer.disconnect();fallback();});
    window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);frame=0;release();});
    window.addEventListener('pageshow',schedule);
    resize();syncMotion();render();schedule();
  } catch(error) {
    console.warn('Particle scene unavailable:', error.message);
    fallback();
  }
})();
