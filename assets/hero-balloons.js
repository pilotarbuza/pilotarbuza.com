/**
 * pilotarbuza — live particle cloud.
 * Separate particle clocks, density lighting, motion vectors and cursor advection.
 * All geometry and textures are generated locally.
 */
(async function () {
  'use strict';
  const hero = document.getElementById('hero');
  const canvas = document.getElementById('hero-balloons-canvas');
  if (!hero || !canvas) return;
  const motion = document.getElementById('hero-motion-toggle');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer, stopped = false, paused = reducedMotion.matches;
  let frame = 0, visible = true, previousTime = 0, observer, initialized = false;
  const resources = [];
  const track = r => (resources.push(r), r);
  function fallback() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    hero.classList.add('hero-static');
    hero.dataset.renderState = 'fallback';
    if (motion) motion.hidden = true;
    resources.forEach(r => r.dispose?.());
    renderer?.dispose();
  }
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fallback(); });

  try {
    if (!window.THREE || !window.createHeroFlow || !window.createHeroLightField) throw new Error('Particle renderer unavailable');
    const T = THREE;
    // Velocity targets need a neutral RGB value even where their alpha is zero.
    renderer = new T.WebGLRenderer({canvas, antialias:false, alpha:false, premultipliedAlpha:false, powerPreference:'high-performance'});
    const gl = renderer.getContext();
    if (!renderer.capabilities.isWebGL2 || !gl.getExtension('EXT_color_buffer_float') || !renderer.capabilities.maxVertexTextures) throw new Error('Float render targets unavailable');
    renderer.setClearColor(0x030507, 0);
    const small = matchMedia('(max-width:700px), (pointer:coarse)').matches;
    const lite = /[?&]lite\b/.test(location.search);
    const screenGeometry = track(new T.PlaneGeometry(2,2));
    const screenCamera = new T.Camera();
    const screenVertex = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
    const postScene = new T.Scene();
    const quad = new T.Mesh(screenGeometry, track(new T.MeshBasicMaterial()));
    postScene.add(quad);
    function post(material,target) { quad.material=material;renderer.setRenderTarget(target);renderer.render(postScene,screenCamera); }

    const flow = window.createHeroFlow({THREE:T,renderer,small,lite,track});
    const samples = new Float32Array(flow.count*2);
    const flags = new Float32Array(flow.count);
    for(let i=0;i<flow.count;i++) {
      samples[i*2]=(i%flow.width+.5)/flow.width;
      samples[i*2+1]=(Math.floor(i/flow.width)+.5)/flow.height;
      flags[i]=i%flow.width===0?1:0;
    }
    const lighting = window.createHeroLightField({THREE:T,renderer,sampleUVs:samples,emissiveFlags:flags,center:new T.Vector3(),track});
    // A front-facing hemisphere has the same silhouette as the reference bead,
    // without turning every bead into a full, oversized faceted icosahedron.
    const bead = track(new T.SphereGeometry(.5,8,6,0,Math.PI*2,0,Math.PI/2));
    bead.rotateX(-Math.PI/2);
    const geometry = track(new T.InstancedBufferGeometry());
    geometry.index=bead.index;
    Object.keys(bead.attributes).forEach(n=>geometry.setAttribute(n,bead.attributes[n]));
    geometry.setAttribute('simUv',new T.InstancedBufferAttribute(samples,2));
    geometry.instanceCount=flow.count;
    lighting.bindGeometry(geometry);
    const scene = new T.Scene();
    const beads = new T.Mesh(geometry,lighting.material);
    beads.frustumCulled=false;
    scene.add(beads);
    const camera = new T.PerspectiveCamera(60,1,.1,200);

    const popt={type:T.HalfFloatType,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false,stencilBuffer:false};
    const target=(depth=false)=>track(new T.WebGLRenderTarget(1,1,{...popt,depthBuffer:depth}));
    const sceneTarget=target(true), motionTarget=target(true), motionTemp=target(), motionFiltered=target();
    const movingTarget=target(), bloomA=target(), bloomB=target();
    let paintA=target(),paintB=target();
    const motionGeometry=track(new T.InstancedBufferGeometry());
    const motionPlane=track(new T.PlaneGeometry(1,1));
    motionGeometry.index=motionPlane.index;
    Object.keys(motionPlane.attributes).forEach(n=>motionGeometry.setAttribute(n,motionPlane.attributes[n]));
    motionGeometry.setAttribute('simUv',new T.InstancedBufferAttribute(samples,2));
    motionGeometry.instanceCount=flow.count;
    const motionUniforms={current:{value:null},previous:{value:null},aspect:{value:1},enabled:{value:1}};
    const motionMaterial=track(new T.ShaderMaterial({uniforms:motionUniforms,vertexShader:`#define GLSLIFY 1
attribute vec2 simUv;uniform sampler2D previous;uniform sampler2D current;uniform vec2 u_simTextureSize;uniform float enabled;uniform float aspect;varying vec2 v_delta;varying float v_headTail;float linearStep(float edge0,float edge1,float x){return clamp((x-edge0)/(edge1-edge0),0.0,1.0);}vec4 hash43(vec3 p){vec4 p4=fract(vec4(p.xyzx)*vec4(.1031,.1030,.0973,.1099));p4+=dot(p4,p4.wzxy+33.33);return fract((p4.xxyz+p4.yzzw)*p4.zywx);}vec2 rotate(vec2 v,float a){float s=sin(a);float c=cos(a);mat2 m=mat2(c,s,-s,c);return m*v;}void main(){vec4 currPositionInfo=texture2D(current,simUv);vec4 prevPositionInfo=texture2D(previous,simUv);vec4 rands=hash43(vec3(simUv.xy,0.));float particleSize=(simUv.x<0.005 ? 0.175 : 0.06)*(0.5+rands.x*0.5);mat4 mvp=projectionMatrix*modelViewMatrix;vec4 currScreenPos=mvp*vec4(currPositionInfo.xyz,1.0);vec4 prevScreenPos=mvp*vec4(prevPositionInfo.xyz,1.0);currScreenPos/=currScreenPos.w;prevScreenPos/=prevScreenPos.w;vec2 screenPosDelta=currScreenPos.xy-prevScreenPos.xy;float screenPosDist=length(screenPosDelta);float angle=screenPosDist>0.001 ? atan(screenPosDelta.y,screenPosDelta.x*aspect): 0.;vec4 screenPos=position.x>-0.0001 ? currScreenPos : prevScreenPos;vec4 offsetScreenPos=modelViewMatrix*vec4((position.x>0. ? currPositionInfo.xyz : prevPositionInfo.xyz),1.0);offsetScreenPos.xy+=particleSize;offsetScreenPos=projectionMatrix*offsetScreenPos;offsetScreenPos/=offsetScreenPos.w;offsetScreenPos=offsetScreenPos-screenPos;v_delta=screenPosDelta;v_headTail=position.x;vec4 pos=vec4(position,0.);pos.xy=rotate(pos.xy,angle)*length(offsetScreenPos.xy*vec2(aspect,1.));pos.xy*=vec2(1./aspect,1.);pos+=screenPos;pos.xy+=v_delta*.5;v_delta=v_delta*2.+.5;gl_Position=pos;if(enabled<.5 || currPositionInfo.w>prevPositionInfo.w || currScreenPos.z>1. || prevScreenPos.z>1.){gl_Position=vec4(2.,0.,0.,1.);}}`,fragmentShader:`#define GLSLIFY 1
varying vec2 v_delta;varying float v_headTail;void main(){float ratio=sqrt(abs(v_headTail)*2.);float strength=sign(v_headTail)*ratio*-.5;gl_FragColor=vec4(v_delta,strength+.5,v_headTail+0.5);}`}));
    const motionScene=new T.Scene(), motionMesh=new T.Mesh(motionGeometry,motionMaterial);
    motionMesh.frustumCulled=false;motionScene.add(motionMesh);
    const blurMaterial=track(new T.ShaderMaterial({vertexShader:screenVertex,uniforms:{source:{value:null},direction:{value:new T.Vector2()}},fragmentShader:`
      varying vec2 vUv;uniform sampler2D source;uniform vec2 direction;
      void main(){vec4 c=texture2D(source,vUv)*.227027;
      c+=texture2D(source,vUv+direction*1.384615)*.316216;
      c+=texture2D(source,vUv-direction*1.384615)*.316216;
      c+=texture2D(source,vUv+direction*3.230769)*.070270;
      c+=texture2D(source,vUv-direction*3.230769)*.070270;
      gl_FragColor=c;}` }));
    function blur(source,temp,destination,radius) {
      blurMaterial.uniforms.source.value=source.texture;
      blurMaterial.uniforms.direction.value.set(radius/source.width,0);post(blurMaterial,temp);
      blurMaterial.uniforms.source.value=temp.texture;
      blurMaterial.uniforms.direction.value.set(0,radius/source.height);post(blurMaterial,destination);
    }
    const movingMaterial=track(new T.ShaderMaterial({vertexShader:screenVertex,uniforms:{source:{value:sceneTarget.texture},velocity:{value:motionFiltered.texture}},fragmentShader:`
      varying vec2 vUv;uniform sampler2D source,velocity;
      void main(){
        vec4 m=texture2D(velocity,vUv);vec2 stepUV=(m.xy-.5)*(m.z-.5)*(.12/16.);
        vec4 color=vec4(0.);vec2 offset=stepUV*.5;
        for(int i=0;i<16;i++){offset+=stepUV;color+=texture2D(source,vUv+offset);}
        gl_FragColor=max(texture2D(source,vUv),color/16.);
      }` }));
    const brightMaterial=track(new T.ShaderMaterial({vertexShader:screenVertex,uniforms:{source:{value:movingTarget.texture}},fragmentShader:`
      varying vec2 vUv;uniform sampler2D source;
      void main(){vec4 c=texture2D(source,vUv);gl_FragColor=vec4(c.rgb*c.a*3.,1.);}` }));
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

    const compositeUniforms={source:{value:movingTarget.texture},bloom:{value:bloomA.texture},paint:{value:null},resolution:{value:new T.Vector2()}};
    const compositeMaterial=track(new T.ShaderMaterial({vertexShader:screenVertex,uniforms:compositeUniforms,fragmentShader:`
      varying vec2 vUv;uniform sampler2D source,bloom,paint;uniform vec2 resolution;
      vec3 dodge(vec3 src,vec3 dst){return min(vec3(1.),dst/max(vec3(.001),1.-src));}
      vec3 burn(vec3 src,vec3 dst){return 1.-min(vec3(1.),(1.-dst)/max(src,vec3(.001)));}
      void main(){
        vec4 p=texture2D(paint,vUv);vec2 offset=-p.xy*p.z*.06;vec2 uv=vUv+offset;
        // Plain displacement: the reference smear has no RGB split.
        vec3 color=texture2D(source,uv).rgb;
        color+=texture2D(bloom,uv).rgb*.36;
        color=clamp(color,0.,1.);
        vec3 dark=mix(color,burn(vec3(0.,.941176,1.),color),.15);
        vec3 light=mix(color,dodge(vec3(0.,.352941,1.),color),.12);
        color=mix(dark,light,color);
        color=max(color,vec3(.009,.012,.015));
        gl_FragColor=vec4(color,1.);
      }` }));

    let width=1,height=1,camDist=5.00107,scrollRatio=0;
    const pointer={x:0,y:0,tx:0,ty:0};
    const mUv=new T.Vector2(.5,.5),mUvPrev=new T.Vector2(.5,.5);
    let pointerIn=false,isDown=false,freeze=0;
    const cameraEuler=new T.Euler(),cameraTurn=new T.Quaternion();
    function placeCamera() {
      const cameraY=-.700562-scrollRatio*3.2;
      camera.position.set(0,cameraY,-camDist);
      camera.lookAt(0,cameraY,-camDist+1);
      // Orbit about the view point one unit ahead, as in the reference camera.
      camera.translateZ(-1);
      cameraEuler.set(pointer.y*.1,-pointer.x*.1,0);
      cameraTurn.setFromEuler(cameraEuler);camera.quaternion.multiply(cameraTurn);camera.translateZ(1);
      camera.updateMatrixWorld();
    }
    function render(dt=0) {
      if(stopped)return;
      lighting.update(flow.currentTexture,dt);
      motionUniforms.current.value=flow.currentTexture;motionUniforms.previous.value=flow.previousTexture;
      motionUniforms.enabled.value=paused||dt===0?0:1;
      placeCamera();
      renderer.setClearColor(0x030507,0);
      renderer.setRenderTarget(sceneTarget);renderer.render(scene,camera);
      renderer.setClearColor(new T.Color(.5,.5,.5),0);
      renderer.setRenderTarget(motionTarget);renderer.render(motionScene,camera);
      blur(motionTarget,motionTemp,motionFiltered,1);
      renderer.setClearColor(0x030507,0);
      post(movingMaterial,movingTarget);
      post(brightMaterial,bloomA);
      for(let i=0;i<3;i++)blur(bloomA,bloomB,bloomA,1+i*1.8);
      paintMaterial.uniforms.prev.value=paintA.texture;
      paintMaterial.uniforms.from.value.copy(mUvPrev);paintMaterial.uniforms.to.value.copy(mUv);
      const vx=(mUv.x-mUvPrev.x)*12,vy=(mUv.y-mUvPrev.y)*12,length=Math.hypot(vx,vy);
      paintMaterial.uniforms.vel.value.set(vx,vy).multiplyScalar(length>1?1/length:1);
      paintMaterial.uniforms.on.value=pointerIn&&!paused?1:0;
      post(paintMaterial,paintB);const swap=paintA;paintA=paintB;paintB=swap;mUvPrev.copy(mUv);
      compositeUniforms.paint.value=paintA.texture;post(compositeMaterial,null);
      hero.dataset.renderState='ready';
    }
    function resize() {
      if(stopped)return;
      width=Math.max(1,hero.clientWidth);height=Math.max(1,hero.clientHeight);
      const pixelRatio=Math.min(devicePixelRatio||1,small?1.35:1.6);
      renderer.setPixelRatio(pixelRatio);renderer.setSize(width,height,false);
      const w=Math.round(width*pixelRatio),h=Math.round(height*pixelRatio),qw=Math.max(1,w>>2),qh=Math.max(1,h>>2);
      sceneTarget.setSize(w,h);movingTarget.setSize(w,h);
      for(const t of [motionTarget,motionTemp,motionFiltered,bloomA,bloomB,paintA,paintB])t.setSize(qw,qh);
      // Newly allocated paint buffers must contain zero velocity, including after resize.
      renderer.setClearColor(0,0);
      for(const t of [paintA,paintB]){renderer.setRenderTarget(t);renderer.clear();}
      renderer.setRenderTarget(null);renderer.setClearColor(0x030507,0);mUvPrev.copy(mUv);
      paintMaterial.uniforms.aspect.value=width/height;paintMaterial.uniforms.radius.value=Math.max(.04,70/height);
      motionUniforms.aspect.value=width/height;compositeUniforms.resolution.value.set(w,h);
      camera.aspect=width/height;camera.fov=60;
      camDist=width<700?Math.max(5.00107,2.2/(Math.tan(Math.PI/6)*camera.aspect)):5.00107;
      camera.updateProjectionMatrix();
      if(paused)render();
    }
    function syncMotion() {
      if(!motion)return;
      motion.hidden=false;motion.setAttribute('aria-pressed',String(paused));
      motion.setAttribute('aria-label',paused?'Resume motion':'Pause motion');
      (motion.querySelector('.hero-motion-label')||motion).textContent=paused?'RESUME MOTION':'PAUSE MOTION';
      hero.dataset.motion=paused?'paused':'running';
    }
    function animate(now) {
      frame=0;if(stopped||paused||!visible||document.hidden)return;
      const dt=previousTime?Math.min((now-previousTime)/1000,.05):1/60;previousTime=now;
      const ease=1-Math.exp(-dt*6.32);
      freeze+=((isDown?1:0)-freeze)*ease;
      pointer.x+=(pointer.tx-pointer.x)*ease;pointer.y+=(pointer.ty-pointer.y)*ease;
      flow.step(dt,dt*(1-freeze*.9));render(dt);
      frame=requestAnimationFrame(animate);
    }
    function schedule(){if(initialized&&!stopped&&!frame&&!paused&&visible&&!document.hidden){previousTime=0;frame=requestAnimationFrame(animate);}}
    function setPaused(value){if(stopped)return;paused=value;cancelAnimationFrame(frame);frame=0;syncMotion();if(paused)render();else schedule();}
    const setPointer=e=>{const r=canvas.getBoundingClientRect();const x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;pointer.tx=x*2-1;pointer.ty=1-y*2;mUv.set(x,1-y);};
    hero.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;setPointer(e);if(!pointerIn){pointerIn=true;mUvPrev.copy(mUv);}},{passive:true});
    hero.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.target.closest('a,button'))return;setPointer(e);pointerIn=true;mUvPrev.copy(mUv);isDown=true;},{passive:true});
    const release=()=>{isDown=false;};
    addEventListener('pointerup',release,{passive:true});addEventListener('pointercancel',release,{passive:true});addEventListener('blur',release);
    hero.addEventListener('pointerleave',()=>{pointerIn=false;pointer.tx=0;pointer.ty=0;release();},{passive:true});
    addEventListener('scroll',()=>{scrollRatio=Math.min(1,Math.max(0,scrollY/Math.max(1,hero.offsetHeight)));if(paused&&visible)render();},{passive:true});
    motion?.addEventListener('click',()=>setPaused(!paused));
    reducedMotion.addEventListener('change',e=>setPaused(e.matches));
    observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;hero.dataset.visible=String(visible);if(!visible){cancelAnimationFrame(frame);frame=0;release();}else schedule();},{threshold:0});observer.observe(hero);
    document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;release();}else schedule();});
    addEventListener('resize',resize,{passive:true});addEventListener('pagehide',()=>{cancelAnimationFrame(frame);frame=0;release();});addEventListener('pageshow',schedule);
    // Warm a complete life cycle without blocking input for the full batch.
    for(let i=0;i<120;i++){
      if(stopped)return;
      flow.step(1/60,1/60);
      if(i%24===23){lighting.update(flow.currentTexture,.08);renderer.setRenderTarget(null);await new Promise(r=>setTimeout(r,0));}
    }
    if(stopped)return;
    initialized=true;resize();syncMotion();render();schedule();
  } catch(error) {
    console.warn('Particle scene unavailable:',error.message);
    fallback();
  }
})();
