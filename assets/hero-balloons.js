/**
 * pilotarbuza — шары на первом экране.
 * 22 шара тянутся к центру, сталкиваются и медленно вращаются вокруг общей оси.
 * Курсор — луч из камеры: он расталкивает шары и передаёт им свою скорость,
 * а за курсором по картинке тянется смазанный след (буфер скорости).
 * Клик по сцене разбрасывает шары и меняет цвет акцентных.
 * Геометрия, свет и шейдеры свои, никаких внешних моделей.
 */
(function () {
  'use strict';
  const hero = document.getElementById('hero');
  const canvas = document.getElementById('hero-balloons-canvas');
  if (!hero || !canvas) return;
  const motion = document.getElementById('hero-motion-toggle');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer, stopped = false, paused = reducedMotion.matches;
  let raf = 0, visible = true, last = 0, time = 0;
  const resources = [];
  const track = r => (resources.push(r), r);

  function fallback() {
    stopped = true;
    cancelAnimationFrame(raf);
    hero.classList.add('hero-static');
    hero.dataset.renderState = 'fallback';
    if (motion) motion.hidden = true;
    resources.forEach(r => r.dispose && r.dispose());
    if (renderer) renderer.dispose();
  }

  try {
    if (!window.THREE) throw new Error('WebGL library unavailable');
    const T = THREE;
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor(0x0b1214, 1);
    renderer.autoClear = true;
    const small = matchMedia('(max-width: 700px), (pointer: coarse)').matches;

    /* ---------- шары: состав как у студийной сцены — акцентные, светлые, тёмные ---------- */
    const ACCENTS = ['#0B7A85', '#E8492A', '#4FC7C4', '#3F7A45', '#F4B860'];
    let accent = 0;
    const KINDS = [];
    for (let i = 0; i < 6; i++) KINDS.push({ kind: 'accent', rough: i === 2 ? .12 : .75 });
    for (let i = 0; i < 8; i++) KINDS.push({ kind: 'light', rough: i === 3 ? .12 : .75, color: '#FFF8F0' });
    for (let i = 0; i < 8; i++) KINDS.push({ kind: 'dark', rough: i % 3 === 0 ? .15 : .6, color: '#101A1D' });
    const N = KINDS.length;

    let seed = 2511;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    const bodies = KINDS.map((k, i) => {
      const r = 1.05;
      const p0 = new T.Vector3((rnd() - .5) * 12, (rnd() - .5) * 12, (rnd() - .5) * 6);
      const vol = Math.PI * r * 1.3333;
      const mass = vol * r * r;
      return {
        i, r, mass, inertia: mass * r * r * .4, friction: 2, rest: .8, fr: 0,
        p0, pos: p0.clone(), vel: p0.clone().multiplyScalar(-2),
        q: new T.Quaternion().setFromEuler(new T.Euler(rnd() * 6, rnd() * 6, rnd() * 6))
      };
    });
    const resetBodies = () => bodies.forEach(b => { b.pos.copy(b.p0); b.vel.copy(b.p0).multiplyScalar(-2); });

    /* ---------- физика ---------- */
    const GRAVITY = 40, MOUSE_R = .025, MOUSE_INF = .1, MOUSE_PUSH = .12;
    const AXIS = new T.Vector3(1, 1, 1).normalize();
    const mouse = new T.Vector3(), mousePrev = new T.Vector3(), mouseVel = new T.Vector3();
    const ray = new T.Vector3(), tmp = new T.Vector3(), tmp2 = new T.Vector3(), nrm = new T.Vector3(), qt = new T.Quaternion();
    let pointerIn = false, mouseReady = false;
    const ndc = new T.Vector2(0, 0);

    function step(dt) {
      // луч мыши: из камеры через курсор до плоскости z = 0
      tmp.set(ndc.x, ndc.y, .5).unproject(camera).sub(camera.position).normalize();
      const k = -camera.position.z / tmp.z;
      mouse.copy(camera.position).addScaledVector(tmp, k);
      if (!mouseReady) { mousePrev.copy(mouse); mouseReady = true; }
      mouseVel.copy(mouse).sub(mousePrev).multiplyScalar(MOUSE_PUSH / dt);
      mousePrev.copy(mouse);
      ray.copy(mouse).sub(camera.position);
      const rayLen2 = ray.lengthSq();

      for (let a = 0; a < N; a++) {
        const A = bodies[a];
        // притяжение к центру, ослабленное трением в толпе
        tmp.copy(A.pos).multiplyScalar(-GRAVITY / A.mass / (1 + A.fr));
        A.vel.addScaledVector(tmp, dt);
        A.fr *= .5;

        for (let b = a + 1; b < N; b++) {
          const B = bodies[b];
          nrm.copy(A.pos).sub(B.pos);
          const d = nrm.length(), min = A.r + B.r;
          if (d < min && d > 1e-5) {
            const f = Math.sqrt(A.friction * B.friction);
            A.fr += f; B.fr += f;
            nrm.multiplyScalar(1 / d);
            const push = .5 * (min - d);
            A.pos.addScaledVector(nrm, push); B.pos.addScaledVector(nrm, -push);
            const va = A.vel.dot(nrm), vb = B.vel.dot(nrm);
            const ma = A.mass, mb = B.mass;
            const na = (ma * va + mb * vb - mb * (va - vb) * A.rest) / (ma + mb);
            const nb = (ma * va + mb * vb - ma * (vb - va) * B.rest) / (ma + mb);
            A.vel.addScaledVector(nrm, (na - va) / (1 + f));
            B.vel.addScaledVector(nrm, (nb - vb) / (1 + f));
          }
        }

        // курсор: расстояние от центра шара до луча
        if (pointerIn) {
          tmp.copy(A.pos).sub(camera.position);
          const t = tmp.dot(ray) / rayLen2;
          tmp2.copy(ray).multiplyScalar(t);
          const perp = tmp.sub(tmp2);                 // от луча к шару
          const gap = perp.length() - A.r - MOUSE_R;
          if (gap < 0) {
            perp.normalize();
            A.pos.addScaledVector(perp, -MOUSE_INF * gap);
            A.vel.addScaledVector(perp, -MOUSE_INF * gap * MOUSE_PUSH / dt);
            A.vel.add(mouseVel);
          }
        }

        // медленный хоровод вокруг диагональной оси, соседние шары в разные стороны
        const len = A.pos.length();
        if (len > 0) {
          let ang = 1 - Math.abs(AXIS.dot(tmp.copy(A.pos).normalize()));
          ang *= dt * Math.min(1, len / 2) * .5 * (a % 2 ? 1 : -1);
          qt.setFromAxisAngle(AXIS, ang);
          tmp.copy(A.pos).applyQuaternion(qt).sub(A.pos);
          A.vel.add(tmp);
        }

        // вращение от движения
        tmp.copy(A.pos).sub(camera.position).cross(A.vel);
        const w = tmp.length() / A.inertia;
        if (w > 0) { qt.setFromAxisAngle(tmp.normalize(), w * dt); A.q.premultiply(qt); }

        A.pos.addScaledVector(A.vel, dt);
        A.vel.multiplyScalar(Math.pow(.2, dt));
      }
    }

    function explode() {
      accent = (accent + 1) % ACCENTS.length;
      bodies.forEach(b => {
        tmp.copy(b.pos).multiplyScalar(-10);
        tmp2.set(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(80);
        tmp.add(tmp2).multiplyScalar(1 / b.mass);
        b.vel.negate().add(tmp);
      });
      accentColor.set(ACCENTS[accent]);
    }

    /* ---------- сцена ---------- */
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(25, 1, .5, 120);
    const geo = track(new T.SphereGeometry(1, small ? 40 : 64, small ? 28 : 48));
    const spheres = [];                                    // xyz + r, общие для всех шейдеров
    for (let i = 0; i < N; i++) spheres.push(new T.Vector4(0, 0, 0, 1.05));
    const colors = [];
    for (let i = 0; i < N; i++) colors.push(new T.Color());
    const accentColor = new T.Color(ACCENTS[0]);

    const vert = `
      varying vec3 vN; varying vec3 vW; varying vec3 vLocalN;
      void main(){
        vec4 w = modelMatrix * vec4(position,1.);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vLocalN = normal;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`;
    const frag = `
      #define N ${N}
      uniform vec3 uColor; uniform float uRough; uniform int uSelf;
      uniform vec4 uSpheres[N]; uniform vec3 uColors[N];
      uniform vec3 uCam; uniform float uTime;
      varying vec3 vN; varying vec3 vW; varying vec3 vLocalN;
      // студийное окружение: большой софтбокс сверху, полоса сбоку, слабый контровой
      vec3 env(vec3 d, float rough){
        float top = smoothstep(.55 - rough*.5, .95, d.y) * (1. - smoothstep(.0, 1.2, abs(d.x + .25)) * .35);
        float side = smoothstep(.45 + rough*.3 - .2, .9, -d.x) * smoothstep(-.4, .3, d.y) * smoothstep(-.6, .4, d.z);
        float rim = smoothstep(.5 - rough*.3, 1., d.x) * smoothstep(-.2, .6, -d.z) * .6;
        float floorDark = smoothstep(.1, -.8, d.y);
        vec3 c = vec3(.05,.07,.075);
        c += vec3(1.0,.98,.95) * top * 1.6;
        c += vec3(.75,.85,.88) * side * .9;
        c += vec3(.55,.75,.8) * rim;
        c *= 1. - floorDark * .7;
        return c;
      }
      void main(){
        vec3 n = normalize(vN);
        vec3 v = normalize(uCam - vW);
        // мягкая тень и затенение от соседних шаров (аналитическая окклюзия сферы)
        float ao = 1.; vec3 bleed = vec3(0.);
        for (int i = 0; i < N; i++){
          if (i == uSelf) continue;
          vec3 d = uSpheres[i].xyz - vW;
          float l = length(d); float r = uSpheres[i].w;
          float o = r*r * clamp(dot(n, d/l), 0., 1.) / (l*l);
          ao *= 1. - clamp(o * 1.15, 0., .95);
          bleed += uColors[i] * o * .35;
        }
        vec3 L = normalize(vec3(-.45, .85, .6));
        float wrap = clamp((dot(n, L) + .35) / 1.35, 0., 1.);
        float hemi = n.y * .5 + .5;
        vec3 diffuse = uColor * (wrap * .95 + .18 + hemi * .12);
        vec3 r = reflect(-v, n);
        float fres = pow(1. - clamp(dot(n, v), 0., 1.), 4.);
        float lum = dot(uColor, vec3(.299,.587,.114));
        float specAmt = mix(.85, .32, uRough) * (.35 + .65 * fres) + mix(.05, .0, uRough);
        vec3 spec = env(r, uRough) * specAmt;
        vec3 h = normalize(L + v);
        float gl = pow(max(dot(n, h), 0.), mix(220., 18., uRough)) * mix(1.4, .25, uRough);
        vec3 col = diffuse * ao + bleed * uColor * .6 + spec * mix(ao, 1., .35) + gl * ao;
        col += fres * vec3(.35,.5,.55) * .25 * (1. - lum * .6);
        // плёночная кривая
        col = 1. - exp(-col * 1.55);
        col = pow(col, vec3(.92));
        gl_FragColor = vec4(col, 1.);
      }`;
    const meshes = bodies.map((b, i) => {
      const k = KINDS[i];
      const mat = track(new T.ShaderMaterial({
        uniforms: {
          uColor: { value: k.kind === 'accent' ? accentColor : new T.Color(k.color) },
          uRough: { value: k.rough }, uSelf: { value: i },
          uSpheres: { value: spheres }, uColors: { value: colors },
          uCam: { value: camera.position }, uTime: { value: 0 }
        },
        vertexShader: vert, fragmentShader: frag
      }));
      const m = new T.Mesh(geo, mat);
      m.scale.setScalar(1.05);
      scene.add(m);
      return m;
    });

    /* ---------- след курсора: буфер скорости, смазывающий картинку ---------- */
    const rtOpt = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: false, stencilBuffer: false, type: T.UnsignedByteType };
    const sceneRT = track(new T.WebGLRenderTarget(4, 4, { minFilter: T.LinearFilter, magFilter: T.LinearFilter }));
    let paintA = track(new T.WebGLRenderTarget(4, 4, rtOpt)), paintB = track(new T.WebGLRenderTarget(4, 4, rtOpt));
    const quadCam = new T.Camera();
    const quadGeo = track(new T.PlaneGeometry(2, 2));
    const quadVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
    const paintMat = track(new T.ShaderMaterial({
      uniforms: { uPrev: { value: null }, uFrom: { value: new T.Vector2() }, uTo: { value: new T.Vector2() }, uVel: { value: new T.Vector2() }, uRadius: { value: .06 }, uAspect: { value: 1 }, uOn: { value: 0 } },
      vertexShader: quadVert,
      fragmentShader: `
        uniform sampler2D uPrev; uniform vec2 uFrom, uTo, uVel; uniform float uRadius, uAspect, uOn;
        varying vec2 vUv;
        void main(){
          vec4 prev = texture2D(uPrev, vUv);
          vec2 vel = (prev.xy - .5) * 2.;
          // перенос по собственной скорости: след течёт, а не просто гаснет
          prev = texture2D(uPrev, vUv - vel * .012);
          vel = (prev.xy - .5) * 2. * .955;
          float w = prev.z * .955;
          vec2 p = vUv; p.x *= uAspect;
          vec2 a = uFrom; a.x *= uAspect; vec2 b = uTo; b.x *= uAspect;
          vec2 pa = p - a, ba = b - a;
          float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0., 1.);
          float d = 1. - smoothstep(0., uRadius, length(pa - ba * h));
          d *= uOn;
          vel = mix(vel, uVel, d);
          w = max(w, d * clamp(length(uVel) * 3., 0., 1.));
          gl_FragColor = vec4(clamp(vel * .5 + .5, 0., 1.), w, 1.);
        }`
    }));
    const finalMat = track(new T.ShaderMaterial({
      uniforms: { uScene: { value: sceneRT.texture }, uPaint: { value: null }, uRes: { value: new T.Vector2(1, 1) } },
      vertexShader: quadVert,
      fragmentShader: `
        uniform sampler2D uScene, uPaint; uniform vec2 uRes;
        varying vec2 vUv;
        void main(){
          vec4 p = texture2D(uPaint, vUv);
          vec2 vel = (p.xy - .5) * 2. * p.z;
          vec2 off = -vel * .075;
          vec3 c = vec3(0.); float tw = 0.;
          for (int i = 0; i < 9; i++){
            float t = float(i) / 8.; float w = 1. - t * .6;
            c += texture2D(uScene, vUv + off * t).rgb * w; tw += w;
          }
          c /= tw;
          // мягкая виньетка
          vec2 q = vUv - .5; q.x *= uRes.x / uRes.y;
          c *= 1. - smoothstep(.45, 1.15, length(q)) * .45;
          gl_FragColor = vec4(c, 1.);
        }`
    }));
    const quad = new T.Mesh(quadGeo, paintMat);
    const quadScene = new T.Scene(); quadScene.add(quad);
    const mUv = new T.Vector2(.5, .5), mUvPrev = new T.Vector2(.5, .5);

    /* ---------- раскладка ---------- */
    let W = 1, H = 1, fovBase = 25, dist = 22, intro = 0;
    function resize() {
      if (stopped) return;
      W = Math.max(1, hero.clientWidth); H = Math.max(1, hero.clientHeight);
      const pr = Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75);
      renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
      const w = Math.round(W * pr), h = Math.round(H * pr);
      sceneRT.setSize(w, h);
      paintA.setSize(w >> 2, h >> 2); paintB.setSize(w >> 2, h >> 2);
      finalMat.uniforms.uRes.value.set(w, h);
      paintMat.uniforms.uAspect.value = W / H;
      paintMat.uniforms.uRadius.value = Math.max(.035, 60 / H);
      const aspect = W / H;
      fovBase = aspect >= 2.2 ? 18 : aspect <= 2 / 3 ? 30 : 18 + (2.2 - aspect) / (2.2 - 2 / 3) * 12;
      camera.aspect = aspect;
      const half = Math.tan(fovBase * Math.PI / 360);
      // кучка радиусом ~3.6 занимает примерно 70% высоты и не вылезает по ширине
      dist = Math.max(5.3 / half, 4.6 / (half * aspect));
      camera.updateProjectionMatrix();
      if (paused) render();
    }

    function updateCamera() {
      // вход: «долли-зум» — поле зрения сужается, камера отъезжает, кучка будто проявляется
      const e = intro >= 1 ? 1 : backOut(Math.min(1, intro));
      const fov = fovBase + (1 - e) * 45;
      camera.fov = fov;
      const d = dist * Math.tan(fovBase * Math.PI / 360) / Math.tan(fov * Math.PI / 360);
      const lift = H > W ? .5 : .95;                     // кучка выше заголовка
      camera.position.set(pointerSmooth.x * .6, -lift + pointerSmooth.y * .4, d);
      camera.lookAt(0, -lift, 0);
      camera.updateProjectionMatrix();
    }
    const backOut = t => { const s = 1.4; t -= 1; return t * t * ((s + 1) * t + s) + 1; };
    const pointerSmooth = new T.Vector2();

    function render() {
      for (let i = 0; i < N; i++) {
        const b = bodies[i];
        meshes[i].position.copy(b.pos);
        meshes[i].quaternion.copy(b.q);
        spheres[i].set(b.pos.x, b.pos.y, b.pos.z, b.r);
        colors[i].copy(meshes[i].material.uniforms.uColor.value);
      }
      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);
      // след
      paintMat.uniforms.uPrev.value = paintA.texture;
      paintMat.uniforms.uFrom.value.copy(mUvPrev);
      paintMat.uniforms.uTo.value.copy(mUv);
      const vx = (mUv.x - mUvPrev.x) * 14, vy = (mUv.y - mUvPrev.y) * 14;
      const vl = Math.hypot(vx, vy), cl = vl > 1 ? 1 / vl : 1;
      paintMat.uniforms.uVel.value.set(vx * cl, vy * cl);
      paintMat.uniforms.uOn.value = pointerIn ? 1 : 0;
      quad.material = paintMat;
      renderer.setRenderTarget(paintB); renderer.render(quadScene, quadCam);
      const t = paintA; paintA = paintB; paintB = t;
      mUvPrev.copy(mUv);
      finalMat.uniforms.uPaint.value = paintA.texture;
      quad.material = finalMat;
      renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
      hero.dataset.renderState = 'ready';
    }

    let acc = 0;
    const STEP = 1 / 120;
    function frame(now) {
      raf = 0;
      if (stopped || paused || !visible || document.hidden) return;
      const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
      last = now; time += dt;
      intro = Math.min(1.2, intro + dt / 2.6);
      pointerSmooth.lerp(ndc, 1 - Math.exp(-dt * 3));
      updateCamera();
      acc += dt;
      while (acc >= STEP) { step(STEP); acc -= STEP; }
      render();
      raf = requestAnimationFrame(frame);
    }
    function schedule() { if (!stopped && !raf && !paused && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } }

    function syncMotion() {
      if (!motion) return;
      motion.hidden = false;
      motion.setAttribute('aria-pressed', String(paused));
      motion.setAttribute('aria-label', paused ? 'Resume motion' : 'Pause motion');
      const label = motion.querySelector('.hero-motion-label');
      (label || motion).textContent = paused ? 'RESUME MOTION' : 'PAUSE MOTION';
      hero.dataset.motion = paused ? 'paused' : 'running';
    }
    function settle() {
      // без анимации: прогоняем физику заранее, чтобы показать уже собравшуюся кучку
      intro = 1; updateCamera();
      for (let i = 0; i < 900; i++) step(STEP);
      render();
    }
    function setPaused(v) {
      if (stopped) return;
      paused = v; cancelAnimationFrame(raf); raf = 0; syncMotion();
      if (paused) { if (intro < 1) settle(); else render(); } else schedule();
    }

    /* ---------- ввод ---------- */
    const setPointer = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      ndc.set(x * 2 - 1, 1 - y * 2);
      mUv.set(x, 1 - y);
    };
    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' && !e.isPrimary) return;
      setPointer(e);
      if (!pointerIn) { pointerIn = true; mUvPrev.copy(mUv); mouseReady = false; }
    }, { passive: true });
    hero.addEventListener('pointerdown', (e) => { setPointer(e); pointerIn = true; mUvPrev.copy(mUv); mouseReady = false; }, { passive: true });
    const leave = () => { pointerIn = false; };
    hero.addEventListener('pointerleave', leave, { passive: true });
    hero.addEventListener('pointercancel', leave, { passive: true });
    hero.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') leave(); }, { passive: true });
    hero.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      explode();
      if (paused) { for (let i = 0; i < 400; i++) step(STEP); render(); }
    });

    if (motion) motion.addEventListener('click', () => setPaused(!paused));
    reducedMotion.addEventListener('change', e => setPaused(e.matches));
    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting; hero.dataset.visible = String(visible);
      if (!visible) { cancelAnimationFrame(raf); raf = 0; leave(); } else schedule();
    }, { threshold: 0 });
    io.observe(hero);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else schedule(); });
    addEventListener('resize', resize, { passive: true });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); io.disconnect(); fallback(); });
    addEventListener('pagehide', () => { cancelAnimationFrame(raf); raf = 0; });
    addEventListener('pageshow', schedule);

    resize(); syncMotion();
    if (paused) settle(); else { updateCamera(); render(); schedule(); }
  } catch (err) {
    console.warn('Hero scene unavailable:', err.message);
    fallback();
  }
})();
