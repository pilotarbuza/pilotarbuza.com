/* Фон секции с глобусом: контурные названия городов, где я был.
   Контуры еле видны; курсор оставляет след, и в следе контуры
   загораются переливающимся градиентом. Плюс медленная диагональная
   волна света и сдвиг строк по скроллу с задержкой от строки к строке. */
(() => {
  'use strict';
  const sec = document.getElementById('travel');
  if (!sec || !window.PLACES) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const cv = document.createElement('canvas');
  cv.className = 'city-bg';
  cv.setAttribute('aria-hidden', 'true');
  sec.prepend(cv);
  const ctx = cv.getContext('2d');
  const layer = document.createElement('canvas'), lctx = layer.getContext('2d');
  const trail = document.createElement('canvas'), tctx = trail.getContext('2d');
  const mask = document.createElement('canvas'), mctx = mask.getContext('2d');

  const COLORS = ['#FF6A4A', '#F4B860', '#8CC48A', '#4FC7C4', '#3E8FD0', '#B98BE0'].map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
  const MS = 6;                       // во сколько раз маска меньше холста
  let W = 0, H = 0, dpr = 1, fs = 40, lh = 48, rows = [], lang = '';
  let mx = -1e4, my = -1e4, pmx = -1e4, pmy = -1e4, moved = false;
  let visible = false, raf = 0, t0 = performance.now();

  const rnd = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const lstep = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));

  function names() {
    const L = window.LANG || document.documentElement.lang || 'en';
    const seen = new Set(), out = [];
    window.PLACES.forEach(p => {
      const n = String(p[L] || p.en || '').toUpperCase();
      if (n && !seen.has(n)) { seen.add(n); out.push(n); }
    });
    return out;
  }

  function build() {
    const r = sec.getBoundingClientRect();
    W = Math.round(r.width); H = Math.round(r.height);
    if (!W || !H) return;
    dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    cv.width = layer.width = Math.round(W * dpr);
    cv.height = layer.height = Math.round(H * dpr);
    trail.width = mask.width = Math.ceil(W / MS);
    trail.height = mask.height = Math.ceil(H / MS);

    fs = Math.round(Math.min(72, Math.max(30, W * 0.034)));
    lh = Math.round(fs * 1.16);
    const font = `600 ${fs}px Unbounded, Manrope, sans-serif`;
    const list = names();
    lang = window.LANG || '';
    const n = Math.ceil(H / lh) + 1;
    const meas = document.createElement('canvas').getContext('2d');
    meas.font = font;
    const gap = '   ';
    rows = [];
    for (let i = 0; i < n; i++) {
      const rand = rnd(97 + i * 131);
      const order = list.slice().sort(() => rand() - 0.5);
      // одна порция названий шириной не меньше экрана, повторённая дважды: строка зациклена
      let seq = '', k = 0;
      while (meas.measureText(seq).width < W * 1.05) { seq += order[k % order.length] + gap; k++; }
      const period = meas.measureText(seq).width;
      const txt = seq + seq;
      const w = Math.ceil(meas.measureText(txt).width);
      const c = document.createElement('canvas');
      c.width = Math.ceil(w * dpr); c.height = Math.ceil(lh * dpr);
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      g.font = font; g.textBaseline = 'middle';
      g.lineWidth = Math.max(1, W / 1200); g.lineJoin = 'round';
      g.strokeStyle = '#1F3A45';
      g.strokeText(txt, 0, lh / 2);
      rows.push({ c, w, period, off: rand() * period, dir: i % 2 ? 1 : -1, v: 14 + rand() * 16 });
    }
    draw(performance.now());
  }

  function colorAt(u) {
    u = ((u % 1) + 1) % 1 * COLORS.length;
    const i = Math.floor(u), f = u - i, a = COLORS[i], b = COLORS[(i + 1) % COLORS.length];
    return `rgb(${a[0] + (b[0] - a[0]) * f | 0},${a[1] + (b[1] - a[1]) * f | 0},${a[2] + (b[2] - a[2]) * f | 0})`;
  }

  function progress() {
    const r = sec.getBoundingClientRect(), vh = innerHeight;
    return Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
  }

  function paintTrail() {
    const tw = trail.width, th = trail.height;
    tctx.globalCompositeOperation = 'destination-out';
    tctx.fillStyle = 'rgba(0,0,0,0.035)';
    tctx.fillRect(0, 0, tw, th);
    tctx.globalCompositeOperation = 'lighter';
    if (moved && pmx > -1e3) {
      const dx = mx - pmx, dy = my - pmy, d = Math.hypot(dx, dy);
      const speed = Math.min(1, d / 60);
      const steps = Math.max(1, Math.ceil(d / 14));
      const rad = (70 + 60 * speed) / MS;
      for (let s = 1; s <= steps; s++) {
        const x = (pmx + dx * s / steps) / MS, y = (pmy + dy * s / steps) / MS;
        const g = tctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, `rgba(255,255,255,${0.16 + 0.22 * speed})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        tctx.fillStyle = g;
        tctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
    pmx = mx; pmy = my; moved = false;
  }

  function draw(now) {
    if (!W) return;
    const t = (now - t0) / 1000;
    const p = progress();
    const n = rows.length;
    const xs = rows.map((r, i) => {
      const lr = Math.floor(i / n * 6) / 6;
      // сами по себе ползут влево и вправо через строку, плюс сдвиг по скроллу
      const drift = reduce ? 0 : r.dir * r.v * t;
      const x = r.off + lstep(lr * 0.4, 0.56 + lr * 0.4, p) * 0.5 * W - drift;
      return -(((x % r.period) + r.period) % r.period);
    });

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    // контуры: еле заметная основа
    ctx.globalAlpha = 0.09;
    rows.forEach((r, i) => ctx.drawImage(r.c, Math.round(xs[i] * dpr), Math.round(i * lh * dpr)));
    ctx.globalAlpha = 1;

    // маска: след курсора + диагональная волна cos((x+y)*k + t)
    const mw = mask.width, mh = mask.height;
    mctx.globalCompositeOperation = 'source-over';
    mctx.clearRect(0, 0, mw, mh);
    mctx.drawImage(trail, 0, 0);
    mctx.globalCompositeOperation = 'lighter';
    const wave = mctx.createLinearGradient(0, 0, mw, mh);
    for (let s = 0; s <= 24; s++) {
      const u = s / 24, d = Math.cos(u * 8 + t * 0.6) * 0.5 + 0.5;
      wave.addColorStop(u, `rgba(255,255,255,${(Math.max(0, d * 2 - 1) * 0.13).toFixed(3)})`);
    }
    mctx.fillStyle = wave;
    mctx.fillRect(0, 0, mw, mh);

    // слой цвета: контуры, залитые градиентом, вырезанные маской
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, layer.width, layer.height);
    rows.forEach((r, i) => lctx.drawImage(r.c, Math.round(xs[i] * dpr), Math.round(i * lh * dpr)));
    lctx.globalCompositeOperation = 'source-in';
    const grad = lctx.createLinearGradient(0, 0, layer.width, layer.height);
    const ph = t * 0.05 + (mx + my) / (W + H) * 0.6;
    for (let s = 0; s <= 10; s++) grad.addColorStop(s / 10, colorAt(s / 10 * 1.5 + ph));
    lctx.fillStyle = grad;
    lctx.fillRect(0, 0, layer.width, layer.height);
    lctx.globalCompositeOperation = 'destination-in';
    lctx.imageSmoothingEnabled = true;
    lctx.drawImage(mask, 0, 0, layer.width, layer.height);
    lctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(layer, 0, 0);
  }

  function loop(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    paintTrail();
    draw(now);
    raf = requestAnimationFrame(loop);
  }
  const start = () => { if (!raf && !reduce) raf = requestAnimationFrame(loop); };

  sec.addEventListener('pointermove', (e) => {
    const r = sec.getBoundingClientRect();
    mx = e.clientX - r.left; my = e.clientY - r.top;
    if (pmx < -1e3) { pmx = mx; pmy = my; }
    moved = true;
  }, { passive: true });
  sec.addEventListener('pointerleave', () => { pmx = pmy = -1e4; });

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }, { rootMargin: '100px' }).observe(sec);
  document.addEventListener('visibilitychange', start);
  let rt = 0, lastW = 0;
  new ResizeObserver(() => {
    const w = sec.clientWidth;
    clearTimeout(rt);
    rt = setTimeout(() => { if (w !== lastW || Math.abs(sec.clientHeight - H) > 40) { lastW = w; build(); } }, 150);
  }).observe(sec);
  document.addEventListener('langchange', () => { if ((window.LANG || '') !== lang) build(); });
  if (reduce) addEventListener('scroll', () => draw(performance.now()), { passive: true });

  const ready = document.fonts && document.fonts.load ? document.fonts.load('600 40px Unbounded') : Promise.resolve();
  ready.catch(() => {}).then(() => { lastW = sec.clientWidth; build(); });
})();
