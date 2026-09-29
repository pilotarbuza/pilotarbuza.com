/* pilotarbuza — точечный заголовок, часы, мелочи */
(() => {
  const canvas = document.getElementById('dots');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- часы в шапке hero
  const clock = document.getElementById('clock');
  const tick = () => {
    if (!clock) return;
    const d = new Date();
    clock.textContent = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };
  tick(); setInterval(tick, 15000);

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  if (!ctx) return;

  // ---- dot-matrix заголовок
  const LINES = ['ПИЛОТ', 'АРБУЗА'];
  const INK = '#1f3328';
  const MELON = '#e6455f';

  let dots = [];       // {x, y, ox, oy, r, accent}
  let W = 0, H = 0, dpr = 1;
  let mouse = { x: -9999, y: -9999, active: false };
  let raf = 0;
  let step = 14;

  function layout() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.floor(rect.width));
    H = Math.max(1, Math.floor(rect.height));
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // шаг сетки зависит от ширины
    step = W < 480 ? 9 : W < 900 ? 12 : 15;

    // рисуем текст на офскрин-канвасе, потом семплируем
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const o = off.getContext('2d');
    o.fillStyle = '#000';
    o.textAlign = 'center';
    o.textBaseline = 'middle';

    // подбираем размер шрифта: не шире 96% канваса и не выше канваса
    const longest = LINES.reduce((a, b) => (a.length > b.length ? a : b));
    const fontFor = (s) => `900 ${s}px "Unbounded", "Inter", sans-serif`;
    const GAP = 1.22; // межстрочник относительно высоты заглавных
    const capOf = () => {
      const m = o.measureText('Н');
      return (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0) || size * 0.72;
    };
    let size = Math.floor(H / LINES.length);
    o.font = fontFor(size);
    let cap = capOf();
    while (size > 20 && (o.measureText(longest).width > W * 0.96 || cap * GAP * LINES.length > H * 0.96)) {
      size -= 4; o.font = fontFor(size); cap = capOf();
    }
    o.textBaseline = 'alphabetic';
    const lineH = cap * GAP;
    const totalH = lineH * (LINES.length - 1) + cap;
    const top = (H - totalH) / 2;
    LINES.forEach((t, i) => o.fillText(t, W / 2, top + cap + i * lineH));

    const data = o.getImageData(0, 0, W, H).data;
    dots = [];
    const half = step / 2;
    for (let y = half; y < H; y += step) {
      for (let x = half; x < W; x += step) {
        const idx = ((Math.floor(y) * W) + Math.floor(x)) * 4 + 3;
        if (data[idx] > 90) {
          dots.push({
            x, y, ox: x, oy: y,
            r: step * 0.34,
            phase: Math.random() * Math.PI * 2,
            accent: Math.random() < 0.035
          });
        }
      }
    }
  }

  let t = 0;
  function draw() {
    t += 0.016;
    ctx.clearRect(0, 0, W, H);
    const R = Math.max(90, W * 0.12);
    for (const d of dots) {
      // отталкивание от курсора
      let tx = d.ox, ty = d.oy;
      if (mouse.active) {
        const dx = d.ox - mouse.x, dy = d.oy - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < R) {
          const f = (1 - dist / R) ** 2 * R * 0.55;
          tx += (dx / (dist || 1)) * f;
          ty += (dy / (dist || 1)) * f;
        }
      }
      d.x += (tx - d.x) * 0.12;
      d.y += (ty - d.y) * 0.12;

      const breathe = reduceMotion ? 1 : 0.86 + 0.14 * Math.sin(t * 1.4 + d.phase);
      const near = mouse.active ? Math.max(0, 1 - Math.hypot(d.ox - mouse.x, d.oy - mouse.y) / R) : 0;
      const r = d.r * breathe * (1 + near * 0.6);

      ctx.beginPath();
      ctx.fillStyle = d.accent || near > 0.6 ? MELON : INK;
      ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!reduceMotion || mouse.active) raf = requestAnimationFrame(draw);
    else raf = 0;
  }

  function kick() { if (!raf) raf = requestAnimationFrame(draw); }

  const toLocal = (e) => {
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    mouse.x = p.clientX - rect.left;
    mouse.y = p.clientY - rect.top;
    mouse.active = true;
    kick();
  };
  canvas.addEventListener('pointermove', toLocal);
  canvas.addEventListener('pointerdown', toLocal);
  canvas.addEventListener('pointerleave', () => { mouse.active = false; kick(); });
  canvas.addEventListener('touchmove', toLocal, { passive: true });
  canvas.addEventListener('touchend', () => { mouse.active = false; kick(); });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { layout(); kick(); }, 120);
  });

  const start = () => { layout(); kick(); };
  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load('900 64px "Unbounded"'),
      document.fonts.ready
    ]).then(start).catch(start);
  } else {
    start();
  }
})();
