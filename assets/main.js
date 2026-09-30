/* pilotarbuza.com — динамика */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = matchMedia('(max-width: 900px)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- часы Коньи, год ---------- */
  const tick = () => {
    let t = '--:--';
    try { t = new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }); } catch (e) {}
    $$('#clock, .clock').forEach(el => { el.textContent = t; });
  };
  tick(); setInterval(tick, 15000);
  const y = $('#year'); if (y) y.textContent = new Date().getFullYear();

  /* ---------- курсор-самолётик ---------- */
  const cursor = $('#cursor');
  if (cursor && fine.matches && !reduce) {
    document.body.classList.add('has-cursor');
    let cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy, ang = 0;
    addEventListener('pointermove', e => {
      tx = e.clientX; ty = e.clientY;
      const el = e.target.closest('a, button, summary, input, [data-tilt]');
      cursor.classList.toggle('cursor--link', !!el);
      const dark = e.target.closest('.dark, .board, .pcard--ann, .pcard--brand, .chart, .menu, .marquee-wrap');
      cursor.classList.toggle('cursor--dark', !!dark);
    });
    const loop = () => {
      const dx = tx - cx, dy = ty - cy;
      cx += dx * .22; cy += dy * .22;
      if (Math.hypot(dx, dy) > .5) {
        const target = Math.atan2(dy, dx) * 180 / Math.PI;
        let d = target - ang; d = ((d + 540) % 360) - 180; ang += d * .15;
      }
      cursor.style.transform = `translate(${cx}px, ${cy}px) rotate(${ang}deg)`;
      requestAnimationFrame(loop);
    };
    loop();
  }

  /* ---------- шапка и меню ---------- */
  const top = $('#top'), hero = $('#hero');
  if (top && hero) {
    new IntersectionObserver(([e]) => top.classList.toggle('top--light', !e.isIntersecting), { rootMargin: '-64px 0px 0px 0px', threshold: 0 }).observe(hero);
  }
  const burger = $('#burger'), menu = $('#menu');
  if (burger && menu) {
    const set = (open) => { menu.classList.toggle('menu--open', open); burger.setAttribute('aria-expanded', open); document.body.style.overflow = open ? 'hidden' : ''; };
    burger.addEventListener('click', () => set(!menu.classList.contains('menu--open')));
    $$('a', menu).forEach(a => a.addEventListener('click', () => set(false)));
  }

  /* ---------- альтиметр ---------- */
  const altVal = $('#alt-val');
  let scrollP = 0, lastY = scrollY, vel = 0;
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    scrollP = max > 0 ? scrollY / max : 0;
    if (altVal) altVal.textContent = 'FL' + String(Math.round(scrollP * 410)).padStart(3, '0');
    vel = scrollY - lastY; lastY = scrollY;
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---------- hero: точечное табло ---------- */
  const canvas = $('#dots');
  const ctx = canvas && canvas.getContext('2d');
  if (ctx) {
    const CREAM = '#F3EEE6', ACCENT = '#FF5C73';
    let dots = [], W = 0, H = 0, step = 14, raf = 0, t = 0;
    const mouse = { x: -9e3, y: -9e3, on: false };
    const linesFor = () => (W < 640 ? ['pilot', 'arbuza'] : ['pilotarbuza']);

    function layout() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      W = Math.max(1, Math.floor(r.width)); H = Math.max(1, Math.floor(r.height));
      canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      step = W < 480 ? 9 : W < 900 ? 12 : W < 1300 ? 14 : 16;
      const LINES = linesFor();
      const off = document.createElement('canvas'); off.width = W; off.height = H;
      const o = off.getContext('2d');
      o.fillStyle = '#000'; o.textAlign = 'center'; o.textBaseline = 'alphabetic';
      const fontFor = s => `700 ${s}px "Geologica", "Inter", system-ui, sans-serif`;
      const longest = LINES.reduce((a, b) => (a.length > b.length ? a : b));
      const GAP = 1.18;
      let size = Math.floor(H / LINES.length); o.font = fontFor(size);
      const capOf = () => { const m = o.measureText('pb'); return (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0) || size * .8; };
      let cap = capOf();
      while (size > 20 && (o.measureText(longest).width > W * .98 || cap * GAP * LINES.length > H * .96)) { size -= 4; o.font = fontFor(size); cap = capOf(); }
      const asc = o.measureText('pb').actualBoundingBoxAscent || cap * .75;
      const lineH = cap * GAP, total = lineH * (LINES.length - 1) + cap, topY = (H - total) / 2;
      LINES.forEach((s, i) => o.fillText(s, W / 2, topY + asc + i * lineH));
      const data = o.getImageData(0, 0, W, H).data;
      dots = [];
      for (let yy = step / 2; yy < H; yy += step) for (let xx = step / 2; xx < W; xx += step) {
        if (data[((yy | 0) * W + (xx | 0)) * 4 + 3] > 90) dots.push({ x: xx, y: yy, ox: xx, oy: yy, r: step * .33, ph: Math.random() * 6.28, acc: Math.random() < .04, fall: .4 + Math.random(), born: Math.random() * .6 });
      }
    }
    let heroP = 0; // 0..1 — насколько hero ушёл вверх
    function draw() {
      t += .016;
      ctx.clearRect(0, 0, W, H);
      const R = Math.max(90, W * .11);
      const intro = clamp((t - .2) / 1.2, 0, 1);
      for (const d of dots) {
        let tx = d.ox, ty = d.oy + heroP * heroP * 900 * d.fall; // разлетаются вниз при скролле
        if (mouse.on) {
          const dx = d.ox - mouse.x, dy = d.oy - mouse.y, dist = Math.hypot(dx, dy);
          if (dist < R) { const f = (1 - dist / R) ** 2 * R * .55; tx += dx / (dist || 1) * f; ty += dy / (dist || 1) * f; }
        }
        d.x += (tx - d.x) * .14; d.y += (ty - d.y) * .14;
        const appear = clamp((intro - d.born) / .4, 0, 1);
        if (appear <= 0) continue;
        const breathe = reduce ? 1 : .86 + .14 * Math.sin(t * 1.6 + d.ph);
        const near = mouse.on ? Math.max(0, 1 - Math.hypot(d.ox - mouse.x, d.oy - mouse.y) / R) : 0;
        ctx.globalAlpha = appear * (1 - heroP * .9);
        ctx.fillStyle = d.acc || near > .6 ? ACCENT : CREAM;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r * breathe * (1 + near * .6) * appear, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    }
    const local = e => { const r = canvas.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; mouse.x = p.clientX - r.left; mouse.y = p.clientY - r.top; mouse.on = true; };
    hero.addEventListener('pointermove', local);
    hero.addEventListener('pointerleave', () => { mouse.on = false; });
    addEventListener('scroll', () => { heroP = clamp(scrollY / (hero.offsetHeight || innerHeight), 0, 1); }, { passive: true });
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 120); });
    const start = () => { layout(); if (!raf) draw(); };
    if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('700 64px "Geologica"'), document.fonts.ready]).then(start).catch(start); else start();
  }

  /* ---------- перещёлкивание, как на табло Solari ---------- */
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ·-/';
  function scramble(el, delay = 0) {
    if (reduce) return;
    const final = el.dataset.text || (el.dataset.text = el.textContent);
    const chars = final.split('');
    const spins = chars.map(() => 6 + Math.floor(Math.random() * 5));
    let frame = 0, start = 0;
    const run = (now) => {
      if (!start) start = now;
      frame = Math.floor((now - start) / 35);
      let out = '', done = true;
      chars.forEach((c, i) => {
        const stop = spins[i] + i * .6;
        if (c === ' ' || frame >= stop) out += c; else { done = false; out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)]; }
      });
      el.textContent = out;
      if (!done) requestAnimationFrame(run);
    };
    setTimeout(() => requestAnimationFrame(run), delay);
  }
  // на загрузке: табло hero-строки не трогаем, а DEPARTURES перещёлкнется при появлении

  /* ---------- счётчики ---------- */
  function countUp(el, to, dur = 1000) {
    if (reduce) { el.textContent = to; return; }
    const t0 = performance.now();
    const step = now => { const p = clamp((now - t0) / dur, 0, 1); const e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function odometer(el, to) {
    const digits = String(to).split('');
    el.innerHTML = digits.map(() => '<span>0</span>').join('');
    if (reduce) { el.textContent = to; return; }
    const spans = $$('span', el);
    const t0 = performance.now();
    const step = now => {
      let alive = false;
      spans.forEach((s, i) => {
        const stopAt = 500 + i * 180;
        if (now - t0 < stopAt) { s.textContent = Math.floor((now - t0) / 40 + i * 3) % 10; alive = true; } else s.textContent = digits[i];
      });
      if (alive) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- индексы для чипов ---------- */
  $$('.tags').forEach(box => $$('.tag', box).forEach((t, i) => t.style.setProperty('--i', i)));

  /* ---------- reveal + сценарии по секциям ---------- */
  const once = new WeakSet();
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target; el.classList.add('in'); io.unobserve(el);
      if (once.has(el)) return; once.add(el);
      $$('[data-flip]', el).forEach((f, i) => scramble(f, i * 60));
      if (el.matches('[data-flip]')) scramble(el);
      if (el.classList.contains('langs')) setTimeout(() => el.classList.add('tuned'), 250);
      const chat = $('.chat', el); if (chat) { setTimeout(() => chat.classList.add('play'), 200); setTimeout(() => chat.classList.add('replied'), 1900); }
      $$('[data-count]', el).forEach(c => { countUp(c, +c.dataset.count, 1100); setTimeout(() => el.classList.add('counted'), 1100); });
      $$('[data-odometer]', el).forEach(o => odometer(o, o.dataset.odometer));
    });
  }, { threshold: .18, rootMargin: '0px 0px -6% 0px' });
  $$('[data-reveal], .rows').forEach(el => io.observe(el));

  /* ---------- языковые шкалы: сначала до упора, потом на уровень ---------- */
  const langs = $('.langs');
  if (langs && !reduce) {
    const needles = $$('.needle', langs);
    new IntersectionObserver(([e], obs) => { if (!e.isIntersecting) return; obs.disconnect(); needles.forEach(n => { n.style.left = '100%'; }); setTimeout(() => needles.forEach(n => n.style.removeProperty('left')), 350); }, { threshold: .3 }).observe(langs);
  }

  /* ---------- маршрут: скролл ведёт самолёт ---------- */
  const route = $('#route'), map = $('#map'), wrap = $('#map-wrap'), plane = $('#plane'), pathEl = $('#route-draw');
  if (route && map && plane && pathEl) {
    const L = pathEl.getTotalLength();
    pathEl.style.strokeDasharray = L; pathEl.style.strokeDashoffset = L;
    const wps = $$('.wp', map);
    let cur = 0, target = 0;
    function fit() {
      if (mobile.matches) { map.style.transform = ''; wrap.style.height = ''; return; }
      const s = Math.min(1, wrap.clientWidth / 1344);
      map.style.transform = `scale(${s})`; wrap.style.height = 410 * s + 'px';
    }
    function progress() {
      if (mobile.matches) { const m = wrap.scrollWidth - wrap.clientWidth; return m > 0 ? wrap.scrollLeft / m : 0; }
      const r = route.getBoundingClientRect();
      return clamp(-r.top / (route.offsetHeight - innerHeight), 0, 1);
    }
    function render(p) {
      const len = p * L, pt = pathEl.getPointAtLength(len), ahead = pathEl.getPointAtLength(Math.min(L, len + 2));
      const a = Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180 / Math.PI;
      plane.style.transform = `translate(${pt.x}px, ${pt.y}px) rotate(${a}deg)`;
      pathEl.style.strokeDashoffset = L * (1 - p);
      wps.forEach(w => w.classList.toggle('passed', !w.classList.contains('wp--future') && p >= +w.dataset.at - .01));
    }
    const loop = () => { target = progress(); cur += (target - cur) * (reduce ? 1 : .1); render(cur); requestAnimationFrame(loop); };
    fit(); render(0); loop();
    addEventListener('resize', fit);
    if (mobile.matches) wrap.scrollLeft = 0;
  }

  /* ---------- наклейки бренда качаются за курсором ---------- */
  $$('[data-tilt-stickers]').forEach(card => {
    if (!fine.matches) return;
    card.addEventListener('pointermove', e => { const r = card.getBoundingClientRect(); const k = ((e.clientX - r.left) / r.width - .5) * 12; $$('.stk', card).forEach((s, i) => s.style.setProperty('--tilt', (k * (i % 2 ? -1 : 1)) + 'deg')); });
    card.addEventListener('pointerleave', () => $$('.stk', card).forEach(s => s.style.removeProperty('--tilt')));
  });

  /* ---------- футболки поворачиваются в 3D ---------- */
  $$('[data-tilt]').forEach(card => {
    if (!fine.matches) return;
    const stage = $('.tee__stage', card) || card;
    card.addEventListener('pointermove', e => { const r = card.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, yy = (e.clientY - r.top) / r.height - .5; stage.style.setProperty('--ry', (x * 20) + 'deg'); stage.style.setProperty('--rx', (-yy * 16) + 'deg'); });
    card.addEventListener('pointerleave', () => { stage.style.removeProperty('--rx'); stage.style.removeProperty('--ry'); });
  });

  /* ---------- вершины: параллакс хребта ---------- */
  const par = $$('[data-parallax] svg');
  if (par.length && !reduce) {
    const upd = () => par.forEach(s => { const r = s.parentElement.getBoundingClientRect(); const k = clamp((r.top + r.height / 2 - innerHeight / 2) / innerHeight, -1, 1); s.style.transform = `translateY(${k * 40}px)`; });
    addEventListener('scroll', upd, { passive: true }); upd();
  }

  /* ---------- бегущая строка: разгоняется от скролла ---------- */
  const mq = $('#marquee');
  if (mq && !reduce) {
    let x = 0, speed = 1, hover = false;
    mq.parentElement.addEventListener('pointerenter', () => { hover = true; });
    mq.parentElement.addEventListener('pointerleave', () => { hover = false; });
    const loop = () => {
      const want = hover ? .08 : 1 + Math.min(2, Math.abs(vel) / 12);
      speed += (want - speed) * .06; vel *= .9;
      x -= speed * .9; const half = mq.scrollWidth / 2; if (-x >= half) x += half;
      mq.style.transform = `translateX(${x}px)`; requestAnimationFrame(loop);
    };
    loop();
  }

  /* ---------- кнопка магазина, копирование почты ---------- */
  const toast = $('#toast');
  const say = (m) => { if (!toast) return; toast.textContent = m; toast.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => toast.classList.remove('show'), 2200); };
  const notify = $('#notify');
  if (notify) notify.addEventListener('click', () => { notify.classList.add('done'); notify.disabled = true; });
  $$('[data-copy]').forEach(a => a.addEventListener('click', e => {
    if (!navigator.clipboard) return; e.preventDefault();
    navigator.clipboard.writeText(a.dataset.copy).then(() => say(window.t ? window.t('toast.copied') : 'ADDRESS COPIED')).catch(() => { location.href = a.href; });
  }));

  /* ---------- рельсы: счётчик и точки ---------- */
  $$('[data-rail]').forEach(rail => {
    const track = $('.rail__track', rail), count = $('.rail__count', rail), dotsBox = $('.rail__dots', rail);
    if (!track) return;
    const items = Array.from(track.children), n = items.length;
    if (dotsBox) dotsBox.innerHTML = items.map(() => '<i></i>').join('');
    const upd = () => {
      const i = clamp(Math.round(track.scrollLeft / (items[0].offsetWidth + 12)), 0, n - 1);
      if (count) count.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(n).padStart(2, '0');
      if (dotsBox) $$('i', dotsBox).forEach((d, k) => d.classList.toggle('on', k === i));
    };
    track.addEventListener('scroll', upd, { passive: true }); upd();
  });

  /* ---------- раскрывашки: на десктопе всё открыто, на мобильном по умолчанию свёрнуто ---------- */
  const syncAcc = () => $$('details.acc').forEach(d => { d.open = mobile.matches ? d.hasAttribute('data-open-mobile') : d.hasAttribute('data-open-desktop'); });
  syncAcc(); mobile.addEventListener('change', syncAcc);
})();

/* ============================================================
   Глобус: растровая маска суши + пины, вращение по всем осям
   ============================================================ */
(() => {
  const canvas = document.getElementById('globe');
  if (!canvas || !window.PLACES) return;
  const ctx = canvas.getContext('2d');
  const tip = document.getElementById('globe-tip');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const places = window.PLACES;

  // статистика
  const visited = places.filter(p => !p.wish);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.dataset.count = v; };
  set('stat-countries', new Set(visited.map(p => p.c)).size);
  set('stat-cities', visited.length);
  set('stat-wish', places.filter(p => p.wish).length);

  // маска суши в равнопромежуточной проекции
  const MW = 1440, MH = 720; let mask = null;
  function buildMask() {
    if (!window.LAND) return;
    const off = document.createElement('canvas'); off.width = MW; off.height = MH;
    const o = off.getContext('2d'); o.fillStyle = '#fff';
    o.beginPath();
    window.LAND.forEach(poly => {
      // разворачиваем долготы по непрерывности, чтобы контур через 180° не резал карту
      let prev = poly[0][0], shift = 0; const pts = poly.map(([lon, lat]) => { let d = lon - prev; if (d > 180) shift -= 360; else if (d < -180) shift += 360; prev = lon; return [lon + shift, lat]; });
      [-MW, 0, MW].forEach(dx => { pts.forEach(([lon, lat], i) => { const x = (lon + 180) / 360 * MW + dx, y = (90 - lat) / 180 * MH; i ? o.lineTo(x, y) : o.moveTo(x, y); }); o.closePath(); });
    });
    o.fill('evenodd');
    const d = o.getImageData(0, 0, MW, MH).data; mask = new Uint8Array(MW * MH);
    for (let i = 0; i < MW * MH; i++) mask[i] = d[i * 4] > 127 ? 1 : 0;
  }

  // вращение: матрица 3x3, строки
  let R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const mul = (a, b) => [
    a[0]*b[0]+a[1]*b[3]+a[2]*b[6], a[0]*b[1]+a[1]*b[4]+a[2]*b[7], a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
    a[3]*b[0]+a[4]*b[3]+a[5]*b[6], a[3]*b[1]+a[4]*b[4]+a[5]*b[7], a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
    a[6]*b[0]+a[7]*b[3]+a[8]*b[6], a[6]*b[1]+a[7]*b[4]+a[8]*b[7], a[6]*b[2]+a[7]*b[5]+a[8]*b[8]];
  const rotX = a => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
  const rotY = a => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
  const spin = (ay, ax) => { R = mul(mul(rotY(ay), rotX(ax)), R); };
  // стартовый вид: Турция и Россия в центре
  R = mul(rotX(0.75), rotY(-0.70));

  const toXYZ = (lon, lat) => { const la = lat * Math.PI / 180, lo = lon * Math.PI / 180; return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)]; };
  const apply = (m, v) => [m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];

  let W = 0, img = null, buf = null;
  function size() {
    const r = canvas.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = Math.max(64, Math.floor(r.width * dpr)); canvas.width = W; canvas.height = W;
    img = ctx.createImageData(W, W); buf = new Uint32Array(img.data.buffer);
  }
  const OCEAN = [27, 45, 71], OCEAN2 = [14, 26, 43], LAND = [243, 238, 230], LAND2 = [160, 172, 190];
  const pack = (r, g, b, a = 255) => (a << 24) | (b << 16) | (g << 8) | r;
  function raster() {
    const c = W / 2, rad = W / 2 - 1, inv = 1 / rad;
    // обратная матрица = транспонированная
    const m = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
    let k = 0;
    for (let py = 0; py < W; py++) {
      const y = (c - py) * inv;
      for (let px = 0; px < W; px++, k++) {
        const x = (px - c) * inv; const rr = x * x + y * y;
        if (rr > 1) { buf[k] = 0; continue; }
        const z = Math.sqrt(1 - rr);
        const vx = m[0]*x + m[1]*y + m[2]*z, vy = m[3]*x + m[4]*y + m[5]*z, vz = m[6]*x + m[7]*y + m[8]*z;
        const lat = Math.asin(vy), lon = Math.atan2(vx, vz);
        let land = 0;
        if (mask) { const mx = ((lon / Math.PI + 1) / 2 * MW) | 0, my = ((0.5 - lat / Math.PI) * MH) | 0; land = mask[(my * MW + mx)] || 0; }
        const shade = 0.55 + 0.45 * z; // освещение от центра
        const edge = rr > 0.92 ? 1 - (rr - 0.92) / 0.08 * 0.5 : 1;
        const A = land ? LAND : OCEAN, B = land ? LAND2 : OCEAN2;
        const t = shade * edge;
        buf[k] = pack((B[0] + (A[0] - B[0]) * t) | 0, (B[1] + (A[1] - B[1]) * t) | 0, (B[2] + (A[2] - B[2]) * t) | 0);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  let pins = [];
  function overlay() {
    const c = W / 2, rad = W / 2 - 1;
    // сетка меридианов и параллелей
    ctx.strokeStyle = 'rgba(243,238,230,.10)'; ctx.lineWidth = Math.max(1, W / 600);
    for (let lon = -180; lon < 180; lon += 30) { ctx.beginPath(); let up = false; for (let lat = -90; lat <= 90; lat += 3) { const v = apply(R, toXYZ(lon, lat)); if (v[2] < 0) { up = false; continue; } const X = c + v[0] * rad, Y = c - v[1] * rad; up ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); up = true; } ctx.stroke(); }
    for (let lat = -60; lat <= 60; lat += 30) { ctx.beginPath(); let up = false; for (let lon = -180; lon <= 180; lon += 3) { const v = apply(R, toXYZ(lon, lat)); if (v[2] < 0) { up = false; continue; } const X = c + v[0] * rad, Y = c - v[1] * rad; up ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); up = true; } ctx.stroke(); }
    // ободок
    ctx.beginPath(); ctx.arc(c, c, rad - .5, 0, 6.2832); ctx.strokeStyle = 'rgba(243,238,230,.25)'; ctx.lineWidth = 1; ctx.stroke();
    // пины
    pins = [];
    const s = W / 560;
    places.forEach(p => {
      const v = apply(R, toXYZ(p.lon, p.lat)); if (v[2] < 0.02) return;
      const X = c + v[0] * rad, Y = c - v[1] * rad, r = (3.2 + 2.2 * v[2]) * s;
      ctx.beginPath(); ctx.arc(X, Y, r + 2 * s, 0, 6.2832); ctx.fillStyle = 'rgba(14,26,43,.55)'; ctx.fill();
      ctx.beginPath(); ctx.arc(X, Y, r, 0, 6.2832); ctx.fillStyle = p.wish ? '#3D6DF2' : '#FF5C73'; ctx.fill();
      ctx.beginPath(); ctx.arc(X - r * .3, Y - r * .3, r * .3, 0, 6.2832); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
      pins.push({ p, X, Y, r });
    });
  }
  let dirty = true, idle = 0, vx = 0, vy = 0, drag = null, auto = !reduce;
  function frame() {
    if (auto && !drag && Math.abs(vx) < 1e-4) { spin(0.0016, 0); dirty = true; }
    if (!drag && (Math.abs(vx) > 1e-4 || Math.abs(vy) > 1e-4)) { spin(vx, vy); vx *= .94; vy *= .94; dirty = true; }
    if (dirty && buf) { raster(); overlay(); dirty = false; }
    requestAnimationFrame(frame);
  }
  const pos = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * W]; };
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, t: performance.now() }; vx = vy = 0; canvas.setPointerCapture(e.pointerId); canvas.classList.add('grabbing'); });
  canvas.addEventListener('pointermove', e => {
    if (drag) {
      const r = canvas.getBoundingClientRect(); const k = 2 / r.width;
      const ay = (e.clientX - drag.x) * k, ax = (e.clientY - drag.y) * k;
      spin(ay, ax); vx = ay * .5; vy = ax * .5; drag.x = e.clientX; drag.y = e.clientY; dirty = true; tip.hidden = true; return;
    }
    const [x, y] = pos(e); let best = null;
    pins.forEach(pn => { const d = Math.hypot(pn.X - x, pn.Y - y); if (d < pn.r + 8 && (!best || d < best.d)) best = { pn, d }; });
    if (best) { const L = window.LANG || 'en'; tip.textContent = (best.pn.p[L] || best.pn.p.en).toUpperCase(); tip.style.left = best.pn.X / W * 100 + '%'; tip.style.top = best.pn.Y / W * 100 + '%'; tip.hidden = false; canvas.style.cursor = 'pointer'; }
    else { tip.hidden = true; canvas.style.cursor = ''; }
  });
  const up = () => { drag = null; canvas.classList.remove('grabbing'); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
  canvas.addEventListener('wheel', e => { if (!e.shiftKey) return; e.preventDefault(); R = mul([Math.cos(e.deltaY * .003), -Math.sin(e.deltaY * .003), 0, Math.sin(e.deltaY * .003), Math.cos(e.deltaY * .003), 0, 0, 0, 1], R); dirty = true; }, { passive: false });
  addEventListener('resize', () => { size(); dirty = true; });
  const start = () => { buildMask(); size(); dirty = true; frame(); };
  if (window.LAND) start(); else { const s = document.querySelector('script[src*="land.js"]'); if (s) s.addEventListener('load', start, { once: true }); addEventListener('load', () => { if (!buf) start(); }, { once: true }); }
})();

/* ============================================================
   Лайтбокс для фото вершин
   ============================================================ */
(() => {
  const lb = document.getElementById('lb'); if (!lb) return;
  const img = document.getElementById('lb-img'), cap = document.getElementById('lb-cap');
  let list = [], idx = 0, last = null;
  const show = () => { const t = list[idx]; img.src = t.full; img.alt = t.alt; cap.textContent = t.alt.toUpperCase() + ' · ' + String(idx + 1).padStart(2, '0') + ' / ' + String(list.length).padStart(2, '0'); };
  const open = (gal, i) => {
    list = Array.from(gal.querySelectorAll('.thumb')).map(b => { const im = b.querySelector('img'); return { full: b.dataset.full || im.src, alt: im.alt }; });
    idx = i; last = document.activeElement; lb.hidden = false; document.body.style.overflow = 'hidden'; show(); document.getElementById('lb-close').focus();
  };
  const close = () => { lb.hidden = true; document.body.style.overflow = ''; if (last) last.focus(); };
  document.querySelectorAll('.thumbs').forEach(gal => gal.querySelectorAll('.thumb').forEach((b, i) => b.addEventListener('click', () => open(gal, i))));
  document.getElementById('lb-close').addEventListener('click', close);
  document.getElementById('lb-prev').addEventListener('click', () => { idx = (idx - 1 + list.length) % list.length; show(); });
  document.getElementById('lb-next').addEventListener('click', () => { idx = (idx + 1) % list.length; show(); });
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  addEventListener('keydown', e => { if (lb.hidden) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') { idx = (idx - 1 + list.length) % list.length; show(); } if (e.key === 'ArrowRight') { idx = (idx + 1) % list.length; show(); } });
})();
