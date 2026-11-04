/* ============================================================
   pilotarbuza.com — финал «Let's work together!»

   Поле фигур — жидкость на FLIP/PIC-симуляции (метод из курса Ten Minute Physics
   Маттиаса Мюллера): частицы переносят скорость на сетку MAC, на сетке решается
   несжимаемость, скорость возвращается частицам. Параметры подобраны так же,
   как в финале lusion.co:
   - при появлении секции ~2400 фигур льются струей из центра и собираются в бассейн;
   - курсор — круглое препятствие, радиус растет со скоростью, частицы получают
     удвоенную скорость курсора;
   - пока зажата кнопка мыши, частицы уходят через дно и льются из курсора;
   - фигуры (плюс, квадрат, круг, треугольник) крутятся по ходу движения
     и подрастают при быстром вращении.
   Текст: буквы въезжают снизу, каждые 2 с в каждом слове перекатывается одна
   случайная буква, при наведении на заголовок прорисовываются линии.
   ============================================================ */
(() => {
  'use strict';

  const fit = (v, a, b, c, d, e) => { let t = Math.min(1, Math.max(0, (v - a) / (b - a))); if (e) t = e(t); return c + (d - c) * t; };
  const sat = v => Math.min(1, Math.max(0, v));
  // кривая cubic-bezier(.35, 0, 0, 1)
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = t => ((ax * t + bx) * t + cx) * t, sy = t => ((ay * t + by) * t + cy) * t, dx = t => (3 * ax * t + 2 * bx) * t + cx;
    return x => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) { const e = sx(t) - x, d = dx(t); if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break; t -= e / d; }
      return sy(Math.min(1, Math.max(0, t)));
    };
  }
  const easeL = bezier(.35, 0, 0, 1);
  const easeIO = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* ================= FLIP-жидкость ================= */
  const FLUID = 0, AIR = 1, SOLID = 2, EMIT_RATE = 3000;
  const SHAPE_SCALE = .75;   // фигура меньше частицы: между соседями остается просвет

  class Fluid {
    init(tankW, tankH, spacing, radius, count) {
      this.nx = Math.ceil(tankW / spacing) + 1;
      this.ny = Math.ceil(tankH / spacing) + 1;
      this.h = Math.max(tankW / this.nx, tankH / this.ny);
      this.inv = 1 / this.h;
      const n = this.nx * this.ny;
      this.innerW = (this.nx - 2) * this.h; this.innerH = (this.ny - 2) * this.h;
      this.u = new Float32Array(n); this.v = new Float32Array(n);
      this.du = new Float32Array(n); this.dv = new Float32Array(n);
      this.pu = new Float32Array(n); this.pv = new Float32Array(n);
      this.s = new Float32Array(n); this.type = new Int8Array(n); this.dens = new Float32Array(n);
      for (let i = 0; i < this.nx; i++) for (let j = 0; j < this.ny; j++)
        this.s[i * this.ny + j] = (i > 0 && i < this.nx - 1 && j > 0 && j < this.ny - 1) ? 1 : 0;
      this.restDensity = 0;
      this.r = radius;
      // сетка для поиска соседей
      this.pInv = 1 / (2.2 * radius);
      this.pnx = Math.floor(tankW * this.pInv) + 1; this.pny = Math.floor(tankH * this.pInv) + 1;
      this.cellCount = new Uint32Array(this.pnx * this.pny); this.firstCell = new Uint32Array(this.pnx * this.pny + 1);
      this.n = count;
      this.pos = new Float32Array(2 * count); this.vel = new Float32Array(2 * count); this.prev = new Float32Array(2 * count);
      this.dir = new Float32Array(2 * count);
      this.ang = new Float32Array(count); this.spin = new Float32Array(count);
      this.alive = new Uint8Array(count); this.ids = new Uint32Array(count);
      for (let i = 0; i < count; i++) { this.pos[2 * i] = -1e4; this.prev[2 * i] = -1e4; }
      this.colliders = [];
      this.emitA = { x: tankW / 2, y: tankH / 2 }; this.emitB = { x: tankW / 2, y: tankH / 2 };
      this.flushing = false;
    }
    addCollider(x, y, w, hh) {
      const c = { l: x, r: x + w, b: y, t: y + hh, cx: x + w / 2, cy: y + hh / 2, hw: w / 2, hh: hh / 2 };
      this.colliders.push(c);
      for (let i = Math.max(0, Math.round(x * this.inv)); i <= Math.min(this.nx - 1, Math.round((x + w) * this.inv)); i++)
        for (let j = Math.max(0, Math.round(y * this.inv)); j <= Math.min(this.ny - 1, Math.round((y + hh) * this.inv)); j++)
          this.s[i * this.ny + j] = 0;
    }
    emit(dt, g) {
      let need = Math.ceil(EMIT_RATE * dt);
      for (let i = 0; i < this.n && need > 0; i++) {
        if (this.alive[i]) continue;
        const k = Math.random();
        this.pos[2 * i] = this.prev[2 * i] = this.emitA.x + (this.emitB.x - this.emitA.x) * k + (Math.random() - .5) * .01;
        this.pos[2 * i + 1] = this.prev[2 * i + 1] = this.emitA.y + (this.emitB.y - this.emitA.y) * k + (Math.random() - .5) * .01;
        this.vel[2 * i] = 0; this.vel[2 * i + 1] = (2 + Math.random() * Math.random() * 3) * g * .1;
        this.ang[i] = Math.random() * 6.2832; this.spin[i] = 0; this.dir[2 * i] = 0; this.dir[2 * i + 1] = -1;
        this.alive[i] = 1; need--;
      }
    }
    integrate(dt, g) {
      for (let i = 0; i < this.n; i++) if (this.alive[i]) {
        this.vel[2 * i + 1] += dt * g;
        this.pos[2 * i] += this.vel[2 * i] * dt; this.pos[2 * i + 1] += this.vel[2 * i + 1] * dt;
      }
    }
    pushApart(iters) {
      const { pnx, pny, pInv, cellCount, firstCell, ids, pos, alive } = this;
      cellCount.fill(0);
      const cellOf = i => Math.min(pnx - 1, Math.max(0, Math.floor(pos[2 * i] * pInv))) * pny + Math.min(pny - 1, Math.max(0, Math.floor(pos[2 * i + 1] * pInv)));
      for (let i = 0; i < this.n; i++) if (alive[i]) cellCount[cellOf(i)]++;
      let acc = 0;
      for (let c = 0; c < pnx * pny; c++) { acc += cellCount[c]; firstCell[c] = acc; }
      firstCell[pnx * pny] = acc;
      for (let i = 0; i < this.n; i++) if (alive[i]) { const c = cellOf(i); firstCell[c]--; ids[firstCell[c]] = i; }
      // 2.2r, а не 3r: если раздвигать частицы шире, чем их пакует сетка, раздвижка
      // спорит с давлением и фигуры в покое дрожат. Просвет между фигурами дает
      // SHAPE_SCALE при рисовании, а не физика.
      const minD = 2.2 * this.r, minD2 = minD * minD;
      for (let it = 0; it < iters; it++)
        for (let i = 0; i < this.n; i++) {
          if (!alive[i]) continue;
          const px = pos[2 * i], py = pos[2 * i + 1];
          const cx = Math.floor(px * pInv), cy = Math.floor(py * pInv);
          for (let x = Math.max(cx - 1, 0); x <= Math.min(cx + 1, pnx - 1); x++)
            for (let y = Math.max(cy - 1, 0); y <= Math.min(cy + 1, pny - 1); y++) {
              const c = x * pny + y;
              for (let k = firstCell[c]; k < firstCell[c + 1]; k++) {
                const j = ids[k]; if (j === i) continue;
                let dx = pos[2 * j] - px, dy = pos[2 * j + 1] - py; const d2 = dx * dx + dy * dy;
                if (d2 > minD2 || d2 === 0) continue;
                const d = Math.sqrt(d2), s = .5 * (minD - d) / d; dx *= s; dy *= s;
                pos[2 * i] -= dx; pos[2 * i + 1] -= dy; pos[2 * j] += dx; pos[2 * j + 1] += dy;
              }
            }
        }
    }
    collide(dt, ox, oy, orad, ovx, ovy) {
      const { h, r, pos, vel, prev, alive } = this;
      const minX = h + r, maxX = (this.nx - 1) * h - r, minY = h + r, maxY = (this.ny - 1) * h - r;
      const or2 = (orad + r) * (orad + r);
      for (let i = 0; i < this.n; i++) {
        if (!alive[i]) continue;
        let x = pos[2 * i], y = pos[2 * i + 1];
        // курсор
        const dx = x - ox, dy = y - oy, d2 = dx * dx + dy * dy;
        if (d2 < or2) { const d = Math.sqrt(d2) || 1e-6, k = (orad + r - d) / d; x += dx * k; y += dy * k; vel[2 * i] = ovx * 2; vel[2 * i + 1] = ovy * 2; }
        // прямоугольные препятствия: выталкиваем назад вдоль направления движения
        const mx = x - prev[2 * i], my = y - prev[2 * i + 1], ml = Math.hypot(mx, my);
        if (ml > 0) {
          const nx = mx / ml, ny = my / ml;
          const ix = 1 / (Math.abs(nx) > 1e-4 ? nx : 1e-4), iy = 1 / (Math.abs(ny) > 1e-4 ? ny : 1e-4);
          for (const c of this.colliders) if (x > c.l && x < c.r && y > c.b && y < c.t) {
            const tx = (x - c.cx) * ix, ty = (y - c.cy) * iy, ex = Math.abs(ix) * c.hw, ey = Math.abs(iy) * c.hh;
            const back = Math.max(-tx - ex, -ty - ey); x += nx * back; y += ny * back;
          }
        }
        if (x < minX) { x = minX; vel[2 * i] = 0; }
        if (x > maxX) { x = maxX; vel[2 * i] = 0; }
        if (y < minY) {
          if (this.flushing) { alive[i] = 0; x = -1e4; y = 0; }
          else { y = minY; vel[2 * i + 1] = 0; }
        }
        if (y > maxY) { y = maxY; vel[2 * i + 1] = 0; }
        pos[2 * i] = x; pos[2 * i + 1] = y;
      }
      // вращение: угловая скорость растет, когда частица меняет направление
      const damp = 1 - Math.exp(-4 * dt);
      for (let i = 0; i < this.n; i++) {
        const vx = vel[2 * i], vy = vel[2 * i + 1], sp = Math.hypot(vx, vy);
        if (sp > 1e-5) {
          const a1 = Math.atan2(vy / sp, vx / sp), a0 = Math.atan2(this.dir[2 * i + 1], this.dir[2 * i]);
          let da = a1 - a0; da = Math.atan2(Math.sin(da), Math.cos(da));
          this.spin[i] += (0 - this.spin[i]) * damp + sp * da;
          this.ang[i] += this.spin[i] * dt;
          this.dir[2 * i] = vx / sp; this.dir[2 * i + 1] = vy / sp;
        }
        prev[2 * i] = pos[2 * i]; prev[2 * i + 1] = pos[2 * i + 1];
      }
    }
    // частицы -> сетка (toGrid) или сетка -> частицы
    transfer(toGrid) {
      const { nx, ny, h, inv, pos, vel, alive } = this, hh = .5 * h;
      if (toGrid) {
        this.pu.set(this.u); this.pv.set(this.v);
        this.du.fill(0); this.dv.fill(0); this.u.fill(0); this.v.fill(0);
        for (let c = 0; c < nx * ny; c++) this.type[c] = this.s[c] === 0 ? SOLID : AIR;
        for (let i = 0; i < this.n; i++) if (alive[i]) {
          const cx = Math.min(nx - 1, Math.max(0, Math.floor(pos[2 * i] * inv))), cy = Math.min(ny - 1, Math.max(0, Math.floor(pos[2 * i + 1] * inv)));
          const c = cx * ny + cy; if (this.type[c] === AIR) this.type[c] = FLUID;
        }
      }
      for (let comp = 0; comp < 2; comp++) {
        const offX = comp === 0 ? 0 : hh, offY = comp === 0 ? hh : 0;
        const f = comp === 0 ? this.u : this.v, w = comp === 0 ? this.du : this.dv;
        for (let i = 0; i < this.n; i++) {
          if (!alive[i]) continue;
          const x = Math.min((nx - 1) * h, Math.max(h, pos[2 * i])), y = Math.min((ny - 1) * h, Math.max(h, pos[2 * i + 1]));
          const x0 = Math.min(Math.floor((x - offX) * inv), nx - 2), tx = (x - offX - x0 * h) * inv, x1 = Math.min(x0 + 1, nx - 2);
          const y0 = Math.min(Math.floor((y - offY) * inv), ny - 2), ty = (y - offY - y0 * h) * inv, y1 = Math.min(y0 + 1, ny - 2);
          const sx = 1 - tx, sy = 1 - ty;
          const w0 = sx * sy, w1 = tx * sy, w2 = tx * ty, w3 = sx * ty;
          const n0 = x0 * ny + y0, n1 = x1 * ny + y0, n2 = x1 * ny + y1, n3 = x0 * ny + y1;
          if (toGrid) {
            const pv = vel[2 * i + comp];
            f[n0] += pv * w0; w[n0] += w0; f[n1] += pv * w1; w[n1] += w1; f[n2] += pv * w2; w[n2] += w2; f[n3] += pv * w3; w[n3] += w3;
          } else {
            const o = comp === 0 ? ny : 1, T = this.type;
            const v0 = T[n0] !== AIR || T[n0 - o] !== AIR ? 1 : 0, v1 = T[n1] !== AIR || T[n1 - o] !== AIR ? 1 : 0;
            const v2 = T[n2] !== AIR || T[n2 - o] !== AIR ? 1 : 0, v3 = T[n3] !== AIR || T[n3 - o] !== AIR ? 1 : 0;
            const ws = v0 * w0 + v1 * w1 + v2 * w2 + v3 * w3;
            if (ws > 0) vel[2 * i + comp] = (v0 * w0 * f[n0] + v1 * w1 * f[n1] + v2 * w2 * f[n2] + v3 * w3 * f[n3]) / ws; // чистый PIC: спокойная, вязкая жидкость
          }
        }
        if (toGrid) {
          for (let c = 0; c < f.length; c++) if (w[c] > 0) f[c] /= w[c];
          const prevF = comp === 0 ? this.pu : this.pv;
          for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
            const c = i * ny + j, solid = this.type[c] === SOLID;
            const nb = comp === 0 ? (i > 0 && this.type[(i - 1) * ny + j] === SOLID) : (j > 0 && this.type[c - 1] === SOLID);
            if (solid || nb) f[c] = prevF[c];
          }
        }
      }
    }
    density() {
      const { nx, ny, h, inv, pos, alive, dens } = this, hh = .5 * h;
      dens.fill(0);
      for (let i = 0; i < this.n; i++) {
        if (!alive[i]) continue;
        const x = Math.min((nx - 1) * h, Math.max(h, pos[2 * i])), y = Math.min((ny - 1) * h, Math.max(h, pos[2 * i + 1]));
        const x0 = Math.floor((x - hh) * inv), tx = (x - hh - x0 * h) * inv, x1 = Math.min(x0 + 1, nx - 2);
        const y0 = Math.floor((y - hh) * inv), ty = (y - hh - y0 * h) * inv, y1 = Math.min(y0 + 1, ny - 2);
        const sx = 1 - tx, sy = 1 - ty;
        dens[x0 * ny + y0] += sx * sy; dens[x1 * ny + y0] += tx * sy; dens[x1 * ny + y1] += tx * ty; dens[x0 * ny + y1] += sx * ty;
      }
      if (this.restDensity === 0) {
        let sum = 0, cnt = 0;
        for (let c = 0; c < nx * ny; c++) if (this.type[c] === FLUID) { sum += dens[c]; cnt++; }
        if (cnt > 0 && this.alive.reduce((a, b) => a + b, 0) >= this.n * .98) this.restDensity = sum / cnt;
      }
    }
    pressure(iters) {
      const { nx, ny, u, v, s, type, dens } = this;
      for (let it = 0; it < iters; it++)
        for (let i = 1; i < nx - 1; i++) for (let j = 1; j < ny - 1; j++) {
          const c = i * ny + j; if (type[c] !== FLUID) continue;
          const l = (i - 1) * ny + j, r = (i + 1) * ny + j, b = c - 1, t = c + 1;
          const sl = s[l], sr = s[r], sb = s[b], st = s[t], sum = sl + sr + sb + st;
          if (sum === 0) continue;
          let div = u[r] - u[c] + v[t] - v[c];
          if (this.restDensity > 0) { const comp = dens[c] - this.restDensity; if (comp > 0) div -= .5 * comp; }
          const p = -div / sum;
          u[c] -= sl * p; u[r] += sr * p; v[c] -= sb * p; v[t] += st * p;
        }
    }
    step(dt, g, ox, oy, orad, ovx, ovy) {
      dt = Math.min(dt, 1 / 60);
      this.emit(dt, g);
      this.integrate(dt, g);
      this.pushApart(4);
      this.collide(dt, ox, oy, orad, ovx, ovy);
      this.transfer(true);
      this.density();
      this.pressure(60);
      this.transfer(false);
    }
  }

  /* ================= секция ================= */
  function init() {
    const section = document.getElementById('end-section');
    const canvas = document.getElementById('end-shapes-canvas');
    if (!section || !canvas) return;
    const stage = section.querySelector('.end-stage') || section;
    const ctx = canvas.getContext('2d');
    const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    let reduce = motionPreference.matches;
    const coarse = matchMedia('(hover: none)').matches;
    const fluid = new Fluid();

    let W = 0, H = 0, dpr = 1, tankW = 2, tankH = 1, gravity = -9, ready = false;
    function setup() {
      const b = stage.getBoundingClientRect();
      W = Math.max(1, Math.round(b.width)); H = Math.max(1, Math.round(b.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr; canvas.height = H * dpr;
      tankW = 2; tankH = 2 * H / W;
      const cells = Math.ceil(fit(W, 320, 2560, 20, 90));
      const spacing = tankW / cells;
      gravity = Math.ceil(fit(W, 320, 2560, -15, -3));
      const perRow = Math.ceil(fit(W, 320, 2560, 20, 80)), rows = Math.ceil(perRow * H / W);
      // частицы упакованы плотнее (см. pushApart), поэтому их в полтора раза больше: уровень бассейна прежний
      const count = Math.ceil(perRow * rows * 1.5 / 4) * 4;
      fluid.init(tankW, tankH, spacing, .2 * spacing, count);
      fluid.emitA = { x: tankW / 2, y: tankH * .5 }; fluid.emitB = { ...fluid.emitA };
      ready = true;
    }
    const toTank = (px, py) => ({
      x: Math.min(W - 1, Math.max(0, px)) / W * fluid.innerW + fluid.h,
      y: Math.min(H - 1, Math.max(0, H - py)) / H * fluid.innerH + fluid.h,
    });

    /* ---------- рисование: все фигуры одного вида одним путем ---------- */
    const PLUS = [[.0714, -.5], [.0714, -.0714], [.5, -.0714], [.5, .0714], [.0714, .0714], [.0714, .5], [-.0714, .5], [-.0714, .0714], [-.5, .0714], [-.5, -.0714], [-.0714, -.0714], [-.0714, -.5]];
    const SQUARE = [[-.4, -.4], [.4, -.4], [.4, .4], [-.4, .4]];
    const TRI = [[.5, 0], [-.25, .433], [-.25, -.433]];
    function poly(pts, x, y, s, a) {
      const c = Math.cos(a) * s, si = Math.sin(a) * s;
      for (let k = 0; k < pts.length; k++) {
        const [px, py] = pts[k], X = x + px * c - py * si, Y = y + px * si + py * c;
        k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      }
      ctx.closePath();
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#FFF8F0';
      const unit = fluid.r * W * SHAPE_SCALE;        // размер фигуры = радиус частицы в пикселях * 2, с просветом
      const n = fluid.n, quarter = n / 4;
      for (let kind = 0; kind < 4; kind++) {
        ctx.beginPath();
        for (let i = kind * quarter; i < (kind + 1) * quarter; i++) {
          if (!fluid.alive[i]) continue;
          const x = (fluid.pos[2 * i] - fluid.h) / fluid.innerW * W;
          const y = H - (fluid.pos[2 * i + 1] - fluid.h) / fluid.innerH * H;
          const s = unit * (1 + Math.min(1, Math.abs(fluid.spin[i]) * .01)) * appear;
          const a = -fluid.ang[i];
          if (kind === 0) poly(PLUS, x, y, s, a);
          else if (kind === 1) poly(SQUARE, x, y, s, a);
          else if (kind === 2) { ctx.moveTo(x + s * .4, y); ctx.arc(x, y, s * .4, 0, 6.2832); }
          else poly(TRI, x, y, s, a);
        }
        ctx.fill();
      }
    }

    /* ---------- ввод ---------- */
    const mouse = { x: -1e4, y: -1e4, px: -1e4, py: -1e4, down: false, inside: false };
    stage.addEventListener('pointermove', e => {
      const b = stage.getBoundingClientRect();
      mouse.x = e.clientX - b.left; mouse.y = e.clientY - b.top;
      if (!mouse.inside) { mouse.px = mouse.x; mouse.py = mouse.y; mouse.inside = true; }
      wake();
    }, { passive: true });
    stage.addEventListener('pointerleave', () => { mouse.inside = false; mouse.down = false; mouse.x = mouse.y = mouse.px = mouse.py = -1e4; });
    stage.addEventListener('pointerdown', e => { if (e.target.closest('a, button')) return; mouse.down = true; wake(); });
    addEventListener('pointerup', () => { mouse.down = false; });

    /* ---------- текст ---------- */
    const title = section.querySelector('.end-title');
    const crosses = Array.from(section.querySelectorAll('.end-crosses i'));
    const subWords = Array.from(section.querySelectorAll('.end-subtitle .sw'));
    const words = Array.from(section.querySelectorAll('.end-title .w')).map(w => ({ el: w, chars: Array.from(w.querySelectorAll('.cw')), ratio: 0, pick: -1 }));
    const decoTop = section.querySelector('.end-deco--top'), decoL = section.querySelector('.end-deco--bl'), decoR = section.querySelector('.end-deco--br');
    let hover = false, hoverRatio = 0, active = 0, clock = 0;
    if (title && !coarse) { title.addEventListener('pointerenter', () => { hover = true; }); title.addEventListener('pointerleave', () => { hover = false; }); }

    // линии под второй строкой обходят хвост «g»
    function placeDeco() {
      const line2 = section.querySelectorAll('.end-title__line')[1];
      if (!line2 || !decoL || !decoR) return;
      const lb = line2.getBoundingClientRect(), g = Array.from(line2.querySelectorAll('.cw')).find(c => c.textContent.trim()[0] === 'g');
      const fs = parseFloat(getComputedStyle(line2).fontSize);
      if (!g) return;
      const gb = g.getBoundingClientRect(), pad = fs * .05;
      decoL.style.left = (fs * .06) + 'px'; decoL.style.width = Math.max(0, gb.left - lb.left - fs * .06 - pad) + 'px';
      decoR.style.left = (gb.right - lb.left + pad) + 'px'; decoR.style.width = Math.max(0, lb.right - gb.right - pad - fs * .12) + 'px';
    }

    function updateText(dt, inView) {
      active = sat(active + (inView ? dt : -dt));
      hoverRatio = sat(hoverRatio + (hover && active === 1 ? dt : -dt));
      const prevClock = clock; clock += dt;
      if (title) title.style.pointerEvents = inView && active > .75 ? 'auto' : 'none';
      crosses.forEach((c, i) => {
        const k = i / (crosses.length - 1), t = fit(active, k * .2, k * .2 + .7, 0, 1, easeL);
        c.style.transform = `scale(${fit(t, 0, 1, 0, 1, easeL)}) rotate(${fit(t, 0, 1, 0, 180, easeL)}deg)`;
      });
      subWords.forEach((w, i) => {
        const k = subWords.length > 1 ? i / (subWords.length - 1) : 0;
        w.style.transform = `translate3d(0, ${fit(active, k * .15, k * .15 + .75, 200, 0, easeL)}%, 0) rotate(${fit(active, k * .1, k * .1 + .8, 30, 0, easeL)}deg)`;
      });
      const roll = (prevClock % 2) > (clock % 2);         // раз в 2 секунды
      words.forEach((w, wi) => {
        const k = words.length > 1 ? wi / (words.length - 1) : 0;
        if (roll && !reduce) { w.pick = (Math.random() * w.chars.length) | 0; if (w.ratio === 0) w.ratio = .001; }
        if (w.ratio > 0) { w.ratio = sat(w.ratio + (inView ? dt : -dt * 2)); if (w.ratio === 1) w.ratio = 0; }
        w.chars.forEach((c, ci) => {
          const b = w.chars.length > 1 ? ci / (w.chars.length - 1) : 0;
          const rise = W >= 560 ? fit(active, k * .15 + b * .15, k * .15 + b * .15 + .7, 115, 0, easeL) : 0;
          c.firstElementChild.style.transform = `translate3d(0, ${rise}%, 0)`;
          c.style.transform = ci === w.pick && w.ratio > 0 ? `translate3d(0, ${-1.2 * fit(w.ratio, k * .2, k * .2 + .8, 0, 1, easeL)}em, 0)` : 'translateZ(0)';
        });
      });
      if (decoTop) decoTop.style.transform = `scaleX(${fit(hoverRatio, 0, .7, 0, 1, easeIO)})`;
      const g = fit(hoverRatio, .2, 1, 0, 1, easeIO);
      if (decoL) decoL.style.transform = `scaleX(${fit(g, 0, .35, 0, 1)})`;
      if (decoR) decoR.style.transform = `scaleX(${fit(g, .4, 1, 0, 1)})`;
    }

    /* ---------- цикл ---------- */
    let raf = 0, last = 0, visible = false, inView = false, appear = 0;
    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) { last = 0; return; }
      const dt = last ? Math.min(1 / 20, (now - last) / 1000) : 1 / 60; last = now;
      updateText(dt, inView);

      if (ready && !reduce) {
        appear = sat(appear + dt * 3);
        const sdt = Math.max(1 / 120, dt);
        let o = { x: -1e3, y: -1e3 }, ovx = 0, ovy = 0, orad = 0;
        if (mouse.inside) {
          const a = toTank(mouse.px, mouse.py), b = toTank(mouse.x, mouse.y);
          ovx = (b.x - a.x) / sdt; ovy = (b.y - a.y) / sdt;
          orad = 150 / W * (coarse ? (mouse.down ? .35 : 0) : fit(Math.hypot(ovx, ovy), 0, 2, .2, 1));
          o = b;
          if (mouse.down && !coarse) {
            o = { x: -1e3, y: -1e3 }; fluid.flushing = true;
            fluid.emitA = a; fluid.emitB = b;
          } else { fluid.flushing = false; fluid.emitA = { x: tankW / 2, y: tankH * .5 }; fluid.emitB = { ...fluid.emitA }; }
        } else fluid.flushing = false;
        mouse.px = mouse.x; mouse.py = mouse.y;
        fluid.step(sdt, gravity, o.x, o.y, orad, ovx, ovy);
        draw();
      }
      raf = requestAnimationFrame(frame);
    }
    const wake = () => { if (!reduce && !raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };

    // секция выше экрана: жидкость сбрасывается и льется заново при следующем входе
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (!visible) { ready = false; appear = 0; }
      else if (!ready) { setup(); placeDeco(); if (reduce) settle(); }
      wake();
    }, { threshold: 0 }).observe(stage);
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; wake(); }, { threshold: 0 }).observe(stage);
    document.addEventListener('visibilitychange', wake);
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (visible) { setup(); placeDeco(); if (reduce) settle(); } }, 200); }, { passive: true });
    if (document.fonts) document.fonts.ready.then(placeDeco);

    // при reduced motion: один раз прогоняем симуляцию до покоя и рисуем статично
    function settle() {
      for (let i = 0; i < 360; i++) fluid.step(1 / 60, gravity, -1e3, -1e3, 0, 0, 0);
      appear = 1; draw();
      active = 1; updateText(0, true);
    }
    motionPreference.addEventListener('change', e => {
      reduce = e.matches;
      cancelAnimationFrame(raf); raf = 0; last = 0;
      if (!visible) return;
      if (reduce) { if (ready) settle(); }
      else { setup(); wake(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
