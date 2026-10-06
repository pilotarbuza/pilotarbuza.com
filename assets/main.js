/* pilotarbuza.com — динамика */
(() => {
  // запрет pinch-zoom и double-tap zoom в iOS Safari
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
  let lastTouch = 0;
  document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastTouch < 320 && !e.target.closest('input, textarea')) e.preventDefault(); lastTouch = n; }, { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });

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
    navigator.clipboard.writeText(a.dataset.copy).then(() => (a.classList.add('copied'), setTimeout(() => a.classList.remove('copied'), 1600), say(window.t ? window.t('toast.copied') : 'ADDRESS COPIED'))).catch(() => { location.href = a.href; });
  }));

  /* ---------- рельсы: счётчик, точки, стрелки, подсказка свайпа ---------- */
  $$('[data-rail]').forEach(rail => {
    const track = $('.rail__track', rail), count = $('.rail__count', rail), dotsBox = $('.rail__dots', rail);
    const prev = $('.rail__prev', rail), next = $('.rail__next', rail);
    if (!track) return;
    const items = Array.from(track.children), n = items.length;
    if (dotsBox) dotsBox.innerHTML = items.map(() => '<i></i>').join('');
    const step = () => (items[1] ? items[1].offsetLeft - items[0].offsetLeft : items[0].offsetWidth);
    const cur = () => clamp(Math.round(track.scrollLeft / step()), 0, n - 1);
    const upd = () => {
      const i = cur();
      if (count) count.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(n).padStart(2, '0');
      if (dotsBox) $$('i', dotsBox).forEach((d, k) => d.classList.toggle('on', k === i));
      if (prev) prev.disabled = i === 0; if (next) next.disabled = i === n - 1;
    };
    const go = d => track.scrollTo({ left: clamp(cur() + d, 0, n - 1) * step(), behavior: 'smooth' });
    if (prev) prev.addEventListener('click', () => go(-1)); if (next) next.addEventListener('click', () => go(1));
    track.addEventListener('scroll', upd, { passive: true }); upd();
    if (!reduce) new IntersectionObserver(([e], o) => { if (e.isIntersecting && mobile.matches) { rail.classList.add('nudge'); o.disconnect(); } }, { threshold: .6 }).observe(track);
  });

  /* ---------- раскрывашки: на десктопе всё открыто, на мобильном по умолчанию свёрнуто ---------- */
  const syncAcc = () => $$('details.acc').forEach(d => { d.open = mobile.matches ? d.hasAttribute('data-open-mobile') : d.hasAttribute('data-open-desktop'); });
  syncAcc(); mobile.addEventListener('change', syncAcc);
})();

/* ============================================================
   Лайтбокс для фото вершин
   ============================================================ */
(() => {
  const lb = document.getElementById('lb'); if (!lb) return;
  const img = document.getElementById('lb-img'), cap = document.getElementById('lb-cap');
  let list = [], idx = 0, last = null;
  const show = () => { const t = list[idx]; img.classList.remove('lb--doc'); document.getElementById('lb-prev').hidden = document.getElementById('lb-next').hidden = list.length < 2; img.src = t.full; img.alt = t.alt; cap.textContent = t.alt.toUpperCase() + ' · ' + String(idx + 1).padStart(2, '0') + ' / ' + String(list.length).padStart(2, '0'); };
  const open = (gal, i) => {
    list = Array.from(gal.querySelectorAll('.thumb')).map(b => { const im = b.querySelector('img'); return { full: b.dataset.full || im.src, alt: im.alt }; });
    idx = i; last = document.activeElement; lb.hidden = false; document.body.style.overflow = 'hidden'; show(); document.getElementById('lb-close').focus();
  };
  const close = () => { lb.hidden = true; document.body.style.overflow = ''; if (last) last.focus(); };
  document.querySelectorAll('.thumbs').forEach(gal => gal.querySelectorAll('.thumb').forEach((b, i) => b.addEventListener('click', () => open(gal, i))));
  document.querySelectorAll('[data-lb-src]').forEach(b => b.addEventListener('click', () => {
    list = [{ full: b.dataset.lbSrc, alt: b.dataset.lbAlt || '' }]; idx = 0; last = b; lb.hidden = false; document.body.style.overflow = 'hidden'; show(); img.classList.add('lb--doc'); document.getElementById('lb-close').focus();
  }));
  document.getElementById('lb-close').addEventListener('click', close);
  document.getElementById('lb-prev').addEventListener('click', () => { idx = (idx - 1 + list.length) % list.length; show(); });
  document.getElementById('lb-next').addEventListener('click', () => { idx = (idx + 1) % list.length; show(); });
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  addEventListener('keydown', e => { if (lb.hidden) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') { idx = (idx - 1 + list.length) % list.length; show(); } if (e.key === 'ArrowRight') { idx = (idx + 1) % list.length; show(); } });
})();
