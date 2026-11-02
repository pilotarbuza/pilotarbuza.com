/* ============================================================
   pilotarbuza.com — финал «Let's work together!»
   Поле из мелких фигур (плюс, крест, квадрат, круг, треугольник) под холмистым
   силуэтом: у гребня ряды мельче, внизу крупнее. Силуэт медленно дышит, поле
   течет, курсор расталкивает фигуры. Цикл спит, пока секция вне экрана или вкладка скрыта.
   Палитра Anemos: фон Breeze #0B7A85, фигуры Ground #FFF8F0.
   ============================================================ */

(() => {
  'use strict';

  function initEndField() {
    const section = document.getElementById('end-section');
    const canvas = document.getElementById('end-shapes-canvas');
    if (!section || !canvas) return;
    const ctx = canvas.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    let W = 0, H = 0, dpr = 1, pts = [];
    const mouse = { x: -9999, y: -9999, sx: -9999, sy: -9999 };

    // Силуэт поля: высокий холм справа от центра, пологий слева, плюс медленная волна.
    // Возвращает y верхнего края поля на экране для точки x.
    function ridge(x, t) {
      const u = x / W;
      const wide = W < 768 ? 2.4 : 1;                 // на узком экране холм шире, иначе выходит пиком
      const hillR = (W < 768 ? 0.2 : 0.30) * Math.exp(-((u - 0.66) ** 2) / (0.045 * wide));
      const hillL = 0.10 * Math.exp(-((u - 0.12) ** 2) / 0.02);
      const wave = 0.022 * Math.sin(u * 7.5 + t * 0.45) + 0.012 * Math.sin(u * 17 - t * 0.7);
      return H * (0.66 - hillR - hillL - wave);
    }

    // Точки лежат рядами от гребня вниз: у гребня ряды и фигуры мельче (дальше), внизу крупнее
    function build() {
      pts = [];
      const mobile = W < 768;
      const rows = mobile ? 34 : 46;
      for (let k = 0; k <= rows; k++) {
        const d = Math.pow(k / rows, 1.35);
        const step = (mobile ? 15 : 19) + d * (mobile ? 16 : 22);
        const n = Math.ceil((W + 80) / step);
        for (let i = 0; i < n; i++) {
          pts.push({
            u: (-40 + (i + 0.15 + Math.random() * 0.7) * step) / W,
            d: Math.min(1.04, d + (Math.random() - 0.5) * 0.9 / rows),
            type: (Math.random() * 5) | 0,
            rot: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.4,
            ph: Math.random() * Math.PI * 2,
            ox: 0, oy: 0,
          });
        }
      }
    }

    function resize() {
      const r = section.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    function shape(type, x, y, s, rot) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      switch (type) {
        case 0: // плюс
          ctx.fillRect(-s, -s * 0.22, s * 2, s * 0.44); ctx.fillRect(-s * 0.22, -s, s * 0.44, s * 2); break;
        case 1: // крест
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-s, -s * 0.2, s * 2, s * 0.4); ctx.fillRect(-s * 0.2, -s, s * 0.4, s * 2); break;
        case 2: // квадрат
          ctx.fillRect(-s * 0.62, -s * 0.62, s * 1.24, s * 1.24); break;
        case 3: // круг
          ctx.beginPath(); ctx.arc(0, 0, s * 0.62, 0, 6.2832); ctx.fill(); break;
        default: // треугольник
          ctx.beginPath(); ctx.moveTo(0, -s * 0.8); ctx.lineTo(s * 0.72, s * 0.5); ctx.lineTo(-s * 0.72, s * 0.5); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    let t = 0, raf = 0, visible = false;
    function frame() {
      raf = 0;
      if (!visible || document.hidden) return;
      if (!reduce) raf = requestAnimationFrame(frame);
      t += 0.016;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#FFF8F0';

      mouse.sx += (mouse.x - mouse.sx) * 0.12; mouse.sy += (mouse.y - mouse.sy) * 0.12;
      const R = W < 768 ? 90 : 150, R2 = R * R;
      const flow = reduce ? 0 : t * 6;                  // поле медленно течет вправо

      for (const p of pts) {
        let x = ((p.u * W + flow * (0.4 + p.d)) % (W + 80) + (W + 80)) % (W + 80) - 40;
        const top = ridge(x, t);
        const y = top + p.d * (H + 30 - top);
        const size = 3.3 + p.d * 5;

        const dx = x + p.ox - mouse.sx, dy = y + p.oy - mouse.sy, d2 = dx * dx + dy * dy;
        if (d2 < R2) { const d = Math.sqrt(d2) || 1, k = (1 - d / R) ** 2 * 26; p.ox += (dx / d) * k * 0.2; p.oy += (dy / d) * k * 0.2; }
        p.ox *= 0.9; p.oy *= 0.9;

        ctx.globalAlpha = Math.min(1, 0.35 + p.d * 3);    // самый дальний ряд у гребня чуть прозрачнее
        shape(p.type, x + p.ox, y + p.oy, size, p.rot + (reduce ? 0 : Math.sin(t * 0.6 + p.ph) * p.spin));
      }
      ctx.globalAlpha = 1;
    }
    const wake = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };

    new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); }, { threshold: 0.02 }).observe(section);
    document.addEventListener('visibilitychange', wake);
    section.addEventListener('pointermove', e => { const r = section.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
    section.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { resize(); wake(); }, 150); }, { passive: true });
    resize();

    // заголовок: буквы перекатываются, когда секция появляется и при наведении
    const title = section.querySelector('.end-title');
    if (title && !reduce) {
      new IntersectionObserver(([e], o) => { if (e.isIntersecting) { title.classList.add('is-in'); o.disconnect(); } }, { threshold: 0.4 }).observe(title);
      title.addEventListener('pointerenter', () => { title.classList.remove('is-rolling'); void title.offsetWidth; title.classList.add('is-rolling'); });
    } else if (title) title.classList.add('is-in');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initEndField);
  else initEndField();
})();
