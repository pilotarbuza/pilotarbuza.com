/* pilotarbuza.com — динамика */
(() => {
  // запрет pinch-zoom в iOS Safari
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
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

  /* ---------- шапка и меню ---------- */
  const top = $('#top'), hero = $('#hero');
  if (top && hero) {
    // шапка светлая, только когда под ней светлая секция: на hero, контактах, вершинах и финале остается темной
    const DARK = '#hero, .dark, #cards, #end-section, .marquee-wrap';
    let queued = false;
    const syncTop = () => {
      queued = false;
      const y = Math.min(innerHeight - 1, top.offsetHeight + 1);
      const under = document.elementsFromPoint(innerWidth / 2, y).find(el => !top.contains(el) && el !== top);
      top.classList.toggle('top--light', !(under && under.closest(DARK)));
    };
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(syncTop); } }, { passive: true });
    addEventListener('resize', syncTop); syncTop();
  }
  // открытие и закрытие меню — в lusion-ui.js; здесь только подсветка текущего раздела
  const menu = $('#menu');
  if (menu) {
    const menuNavLinks = $$('.lusion-nav-link', menu);
    if (menuNavLinks.length) {
      const sections = menuNavLinks.map(link => document.getElementById(link.dataset.nav)).filter(Boolean)
        .sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
      let spyFrame = 0;
      const syncActive = () => {
        spyFrame = 0;
        const line = innerHeight * .35;
        let current = sections[0];
        sections.forEach(section => { if (section.getBoundingClientRect().top <= line) current = section; });
        menuNavLinks.forEach(link => link.classList.toggle('active', current && link.dataset.nav === current.id));
      };
      const queueSpy = () => { if (!spyFrame) spyFrame = requestAnimationFrame(syncActive); };
      addEventListener('scroll', queueSpy, { passive: true });
      addEventListener('resize', queueSpy, { passive: true });
      queueSpy();
    }
  }

  /* ---------- скорость скролла (для бегущей строки) ---------- */
  let lastY = scrollY, vel = 0;
  addEventListener('scroll', () => { vel = scrollY - lastY; lastY = scrollY; }, { passive: true });

  /* ---------- цикл анимации, который спит, пока элемент вне экрана или вкладка скрыта ---------- */
  function liveLoop(el, step, margin = '120px') {
    let raf = 0, onScreen = false;
    const tick = () => { raf = 0; if (!onScreen || document.hidden) return; step(); raf = requestAnimationFrame(tick); };
    const wake = () => { if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(tick); };
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; wake(); }, { rootMargin: margin }).observe(el);
    document.addEventListener('visibilitychange', wake);
    return wake;
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
    const step = now => { const p = clamp((now - t0) / dur, 0, 1); const e = 1 - Math.pow(1 - p, 3), latest = Number(el.dataset.count); el.textContent = Math.round((Number.isFinite(latest) ? latest : to) * e); if (p < 1) requestAnimationFrame(step); };
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
    // самолет догоняет позицию скролла; цикл работает, только пока карта видна
    fit(); render(0);
    liveLoop(route, () => { target = progress(); cur += (target - cur) * (reduce ? 1 : .1); render(cur); });
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
    // ширину считаем один раз и на resize, а не в каждом кадре: scrollWidth заставляет браузер пересчитывать раскладку
    let half = mq.scrollWidth / 2;
    addEventListener('resize', () => { half = mq.scrollWidth / 2; });
    if (document.fonts) document.fonts.ready.then(() => { half = mq.scrollWidth / 2; });
    liveLoop(mq.parentElement, () => {
      const want = hover ? .08 : 1 + Math.min(2, Math.abs(vel) / 12);
      speed += (want - speed) * .06; vel *= .9;
      x -= speed * .9; if (-x >= half) x += half;
      mq.style.transform = `translateX(${x}px)`;
    });
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
    const maxScroll = () => Math.max(0, track.scrollWidth - track.clientWidth);
    const cur = () => {
      const max = maxScroll();
      if (max > 1 && track.scrollLeft >= max - 1) return n - 1;
      return clamp(Math.round(track.scrollLeft / (step() || 1)), 0, n - 1);
    };
    const upd = () => {
      const i = cur();
      if (count) count.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(n).padStart(2, '0');
      if (dotsBox) $$('i', dotsBox).forEach((d, k) => d.classList.toggle('on', k === i));
      if (prev) prev.disabled = track.scrollLeft <= 1;
      if (next) next.disabled = track.scrollLeft >= maxScroll() - 1;
    };
    const go = d => {
      const positions = items.map((_, i) => Math.min(i * step(), maxScroll()));
      const candidates = d > 0 ? positions : positions.reverse();
      const target = candidates.find(x => d > 0 ? x > track.scrollLeft + 1 : x < track.scrollLeft - 1);
      if (target !== undefined) track.scrollTo({ left: target, behavior: 'smooth' });
    };
    if (prev) prev.addEventListener('click', () => go(-1)); if (next) next.addEventListener('click', () => go(1));
    track.addEventListener('scroll', upd, { passive: true });
    addEventListener('resize', upd); upd();
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
