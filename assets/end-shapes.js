/* ============================================================
   pilotarbuza.com — финал «Let's work together!»
   Плоское поле фигур (квадрат, круг, треугольник, крест, плюс), разложенных
   равномерно (Poisson disk) от ~60% высоты до низа экрана. В покое оно ровное.
   Курсор возмущает поверхность: по сетке высот бежит затухающая волна, фигуры
   поднимаются гребнями и расходятся вокруг курсора, потом поле успокаивается.
   При первом появлении фигуры всплывают снизу на свои места.
   Кадры рисуются, только пока секция видна и поле не успокоилось.
   ============================================================ */
(() => {
  'use strict';

  function init() {
    const section = document.getElementById('end-section');
    const canvas = document.getElementById('end-shapes-canvas');
    if (!section || !canvas) return;
    const ctx = canvas.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    let W = 0, H = 0, dpr = 1, top = 0, r = 18, pts = [];
    // сетка высот для волны
    let gw = 0, gh = 0, cell = 26, hgt, vel;
    const mouse = { x: -1e4, y: -1e4, px: -1e4, py: -1e4, on: false };
    let intro = reduce ? 1 : 0, introStarted = false;

    /* ---------- раскладка: Poisson disk (Bridson) ---------- */
    function poisson(x0, y0, x1, y1, rad) {
      const k = 24, cs = rad / Math.SQRT2;
      const cols = Math.ceil((x1 - x0) / cs), rows = Math.ceil((y1 - y0) / cs);
      const grid = new Int32Array(cols * rows).fill(-1);
      const out = [], active = [];
      const put = (x, y) => { out.push([x, y]); active.push(out.length - 1); grid[((y - y0) / cs | 0) * cols + ((x - x0) / cs | 0)] = out.length - 1; };
      put(x0 + Math.random() * (x1 - x0), y0 + Math.random() * (y1 - y0));
      while (active.length) {
        const ai = (Math.random() * active.length) | 0, [ax, ay] = out[active[ai]];
        let found = false;
        for (let n = 0; n < k; n++) {
          const a = Math.random() * 6.2832, d = rad * (1 + Math.random());
          const x = ax + Math.cos(a) * d, y = ay + Math.sin(a) * d;
          if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
          const gx = (x - x0) / cs | 0, gy = (y - y0) / cs | 0;
          let ok = true;
          for (let yy = Math.max(0, gy - 2); yy <= Math.min(rows - 1, gy + 2) && ok; yy++)
            for (let xx = Math.max(0, gx - 2); xx <= Math.min(cols - 1, gx + 2); xx++) {
              const j = grid[yy * cols + xx];
              if (j >= 0) { const dx = out[j][0] - x, dy = out[j][1] - y; if (dx * dx + dy * dy < rad * rad) { ok = false; break; } }
            }
          if (ok) { put(x, y); found = true; break; }
        }
        if (!found) active.splice(ai, 1);
      }
      return out;
    }

    function build() {
      const mobile = W < 768;
      r = mobile ? 14 : Math.max(15, Math.min(22, W / 78));
      top = H * (mobile ? 0.62 : 0.6);
      const kinds = [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 4]; // квадрат, круг, треугольник, крест, плюс
      pts = poisson(-r, top, W + r, H + r * 2, r).map(([x, y]) => ({
        x, y, type: kinds[(Math.random() * kinds.length) | 0], rot: Math.random() * 6.2832,
        dx: 0, dy: 0, delay: Math.random() * 0.45 + ((y - top) / (H - top)) * 0.35,
      }));
      cell = mobile ? 22 : 26;
      gw = Math.ceil(W / cell) + 2; gh = Math.ceil((H - top + 200) / cell) + 2;
      hgt = new Float32Array(gw * gh); vel = new Float32Array(gw * gh);
    }

    function resize() {
      const b = section.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(b.width)); H = Math.max(1, Math.round(b.height));
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    /* ---------- волна ---------- */
    const gi = (x, y) => y * gw + x;
    function stir(x, y, power) {
      const R = (W < 768 ? 70 : 110) / cell;
      const cx = x / cell, cy = (y - top + 200) / cell;
      for (let j = Math.max(1, cy - R | 0); j <= Math.min(gh - 2, cy + R | 0); j++)
        for (let i = Math.max(1, cx - R | 0); i <= Math.min(gw - 2, cx + R | 0); i++) {
          const d = Math.hypot(i - cx, j - cy) / R;
          if (d < 1) vel[gi(i, j)] += power * (1 - d) * (1 - d);
        }
    }
    function stepWave() {
      let energy = 0;
      for (let j = 1; j < gh - 1; j++)
        for (let i = 1; i < gw - 1; i++) {
          const k = gi(i, j);
          const lap = (hgt[k - 1] + hgt[k + 1] + hgt[k - gw] + hgt[k + gw]) * 0.25 - hgt[k];
          vel[k] = (vel[k] + lap * 0.5) * 0.965;
        }
      for (let k = 0; k < hgt.length; k++) { hgt[k] = (hgt[k] + vel[k]) * 0.985; energy += Math.abs(hgt[k]) + Math.abs(vel[k]); }
      return energy;
    }
    function heightAt(x, y) {
      const fx = x / cell, fy = (y - top + 200) / cell;
      const i = Math.max(0, Math.min(gw - 2, fx | 0)), j = Math.max(0, Math.min(gh - 2, fy | 0));
      const tx = Math.min(1, Math.max(0, fx - i)), ty = Math.min(1, Math.max(0, fy - j));
      const a = hgt[gi(i, j)], b = hgt[gi(i + 1, j)], c = hgt[gi(i, j + 1)], d = hgt[gi(i + 1, j + 1)];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }

    /* ---------- рисование ---------- */
    function shape(type, x, y, s, rot) {
      const c = Math.cos(rot), si = Math.sin(rot);
      ctx.setTransform(c * dpr, si * dpr, -si * dpr, c * dpr, x * dpr, y * dpr);
      switch (type) {
        case 0: ctx.fillRect(-s * .5, -s * .5, s, s); break;
        case 1: ctx.beginPath(); ctx.arc(0, 0, s * .52, 0, 6.2832); ctx.fill(); break;
        case 2: ctx.beginPath(); ctx.moveTo(0, -s * .62); ctx.lineTo(s * .58, s * .42); ctx.lineTo(-s * .58, s * .42); ctx.closePath(); ctx.fill(); break;
        case 3: ctx.rotate(.785); // крест ×
        // fallthrough
        default: ctx.fillRect(-s * .62, -s * .11, s * 1.24, s * .22); ctx.fillRect(-s * .11, -s * .62, s * .22, s * 1.24);
      }
    }

    let raf = 0, visible = false, last = 0, calm = 0;
    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;

      // курсор будит волну пропорционально скорости
      if (mouse.on && mouse.px > -1e3) {
        const sp = Math.min(60, Math.hypot(mouse.x - mouse.px, mouse.y - mouse.py));
        if (sp > 0.5) stir(mouse.x, mouse.y, sp * 0.9);
      }
      mouse.px = mouse.x; mouse.py = mouse.y;
      const energy = reduce ? 0 : stepWave();
      if (introStarted && intro < 1) intro = Math.min(1, intro + dt / 1.6);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#FFF8F0';
      const s = r * 0.47, R = W < 768 ? 60 : 90, R2 = R * R;
      let moving = energy > 0.5;
      for (const p of pts) {
        // всплытие при первом показе
        const t = Math.min(1, Math.max(0, (intro - p.delay) / 0.5));
        if (t <= 0) continue;
        const e = 1 - Math.pow(1 - t, 3);
        // гребень волны поднимает фигуру и чуть сдвигает вбок по уклону
        const h = heightAt(p.x, p.y);
        let tx = 0, ty = -h * 1.6;
        // курсор раздвигает фигуры, получается «ямка»
        if (mouse.on) {
          const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
          if (d2 < R2) { const d = Math.sqrt(d2) || 1, f = (1 - d / R) ** 2 * R * 0.55; tx += (dx / d) * f; ty += (dy / d) * f; }
        }
        p.dx += (tx - p.dx) * 0.18; p.dy += (ty - p.dy) * 0.18;
        if (Math.abs(tx - p.dx) + Math.abs(ty - p.dy) > 0.05) moving = true;
        const y = p.y + p.dy + (1 - e) * (H - top + 60);
        shape(p.type, p.x + p.dx, y, s * (0.6 + 0.4 * e), p.rot + h * 0.01);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (intro < 1 || moving || mouse.on) { calm = 0; raf = requestAnimationFrame(frame); }
      else if (++calm < 3) raf = requestAnimationFrame(frame);
      else last = 0;
    }
    const wake = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };

    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !introStarted && e.intersectionRatio > 0.35) introStarted = true;
      wake();
    }, { threshold: [0, 0.35, 0.6] }).observe(section);
    document.addEventListener('visibilitychange', wake);
    section.addEventListener('pointermove', e => {
      const b = section.getBoundingClientRect();
      mouse.x = e.clientX - b.left; mouse.y = e.clientY - b.top;
      if (!mouse.on) { mouse.px = mouse.x; mouse.py = mouse.y; }
      mouse.on = true; wake();
    }, { passive: true });
    section.addEventListener('pointerleave', () => { mouse.on = false; mouse.px = -1e4; wake(); });
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { resize(); wake(); }, 150); }, { passive: true });
    resize();

    // заголовок: буквы выезжают снизу при появлении и перекатываются при наведении
    const title = section.querySelector('.end-title');
    if (title && !reduce) {
      new IntersectionObserver(([e], o) => { if (e.isIntersecting) { title.classList.add('is-in'); o.disconnect(); } }, { threshold: 0.4 }).observe(title);
      title.addEventListener('pointerenter', () => { title.classList.remove('is-rolling'); void title.offsetWidth; title.classList.add('is-rolling'); });
    } else if (title) title.classList.add('is-in');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
