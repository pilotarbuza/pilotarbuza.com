/* pilotarbuza.com — глобус «Где я был».
   Растровая ортографическая проекция по маске суши и границ (world-atlas 50m),
   вращение по долготе и широте (север всегда сверху), инерция, зум 1–8× колесом с Ctrl/щипком/кнопками/двойным тапом,
   перелёт к стране по клику на чип, подписи городов при приближении. */
(() => {
  const canvas = document.getElementById('globe');
  if (!canvas || !window.PLACES) return;
  const wrap = canvas.parentElement;
  const ctx = canvas.getContext('2d');
  const tip = document.getElementById('globe-tip');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const places = window.PLACES;
  const D = Math.PI / 180;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const L = () => window.LANG || 'en';
  const name = p => p[L()] || p.en;

  /* ---------- статистика и чипы стран ---------- */
  const byC = {}; places.forEach(p => { (byC[p.c] = byC[p.c] || []).push(p); });
  const setCount = (id, v) => { const el = document.getElementById(id); if (el) el.dataset.count = v; };
  setCount('stat-countries', Object.keys(byC).length);
  setCount('stat-cities', places.length);
  const CN = { RU: ['Russia', 'Россия', 'Rusya'], TR: ['Türkiye', 'Турция', 'Türkiye'], CR: ['Crimea', 'Крым', 'Kırım'], IR: ['Iran', 'Иран', 'İran'], GE: ['Georgia', 'Грузия', 'Gürcistan'], TN: ['Tunisia', 'Тунис', 'Tunus'], UA: ['Ukraine', 'Украина', 'Ukrayna'], AZ: ['Azerbaijan', 'Азербайджан', 'Azerbaycan'] };
  const cname = c => (CN[c] || [c, c, c])[Math.max(0, ['en', 'ru', 'tr'].indexOf(L()))];
  const chips = document.getElementById('cchips');
  let activeC = null;
  const drawChips = () => {
    if (!chips) return;
    chips.innerHTML = Object.entries(byC).sort((a, b) => b[1].length - a[1].length)
      .map(([c, list]) => `<li><button type="button" data-c="${c}" aria-pressed="${c === activeC}">${cname(c)} <b>${list.length}</b></button></li>`).join('');
  };
  drawChips(); document.addEventListener('langchange', () => { drawChips(); dirty = true; });

  /* ---------- маска суши и границ ---------- */
  const MW = 4096, MH = 2048;
  let land = null;
  function decode(arr) { const pts = []; let x = 0, y = 0; for (let i = 0; i < arr.length; i += 2) { x += arr[i]; y += arr[i + 1]; pts.push([x / 20, y / 20]); } return pts; }
  function unwrap(pts) { let prev = pts[0][0], sh = 0; return pts.map(([lo, la]) => { const d = lo - prev; if (d > 180) sh -= 360; else if (d < -180) sh += 360; prev = lo; return [lo + sh, la]; }); }
  function buildMask() {
    const G = window.GEO; if (!G) return;
    const off = document.createElement('canvas'); off.width = MW; off.height = MH;
    const o = off.getContext('2d');
    const X = lo => (lo + 180) / 360 * MW, Y = la => (90 - la) / 180 * MH;
    o.fillStyle = 'rgb(255,0,0)'; o.beginPath();
    G.L.forEach(r => { const pts = unwrap(decode(r)); [-MW, 0, MW].forEach(dx => { pts.forEach(([lo, la], i) => { const x = X(lo) + dx, y = Y(la); i ? o.lineTo(x, y) : o.moveTo(x, y); }); o.closePath(); }); });
    o.fill('evenodd');
    const d = o.getImageData(0, 0, MW, MH).data;
    land = new Uint8Array(MW * MH);
    for (let i = 0, j = 0; i < land.length; i++, j += 4) land[i] = d[j];
    coast = G.L.map(r => toVec(decode(r)));
    borders = G.B.map(r => toVec(decode(r)));
  }
  // кольцо → Float32Array единичных векторов + центр и угловой радиус для отсечения
  let coast = [], borders = [];
  function toVec(pts) {
    const v = new Float32Array(pts.length * 3); let cx = 0, cy = 0, cz = 0;
    pts.forEach(([lo, la], i) => { const a = la * D, b = lo * D, c = Math.cos(a); const x = c * Math.sin(b), y = Math.sin(a), z = c * Math.cos(b); v[i * 3] = x; v[i * 3 + 1] = y; v[i * 3 + 2] = z; cx += x; cy += y; cz += z; });
    const n = Math.hypot(cx, cy, cz) || 1; cx /= n; cy /= n; cz /= n;
    let mind = 1; for (let i = 0; i < v.length; i += 3) mind = Math.min(mind, v[i] * cx + v[i + 1] * cy + v[i + 2] * cz);
    return { v, c: [cx, cy, cz], rad: Math.acos(clamp(mind, -1, 1)) };
  }

  /* ---------- состояние вида ---------- */
  const view = { lon: 38, lat: 44, k: 1 };          // центр — Чёрное море
  const vel = { lon: 0, lat: 0 };
  let target = null;                                 // перелёт {lon, lat, k, t0, from}
  let lastInteract = 0, dirty = true, moving = false;
  const KMAX = 7;
  const normLon = l => ((l + 540) % 360) - 180;

  // мир (lat, lon) → вид (x, y, z), z > 0 — передняя полусфера
  function project(lat, lon) {
    const la = lat * D, lo = lon * D, cl = Math.cos(la);
    const x = cl * Math.sin(lo), y = Math.sin(la), z = cl * Math.cos(lo);
    const L0 = view.lon * D, A = view.lat * D;
    const x1 = x * Math.cos(L0) - z * Math.sin(L0), z1 = x * Math.sin(L0) + z * Math.cos(L0);
    return [x1, y * Math.cos(A) - z1 * Math.sin(A), y * Math.sin(A) + z1 * Math.cos(A)];
  }

  /* ---------- размеры ---------- */
  let W = 0, R0 = 0, dpr = 1, off = null, octx = null;
  function size() {
    const r = wrap.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(80, Math.round(r.width * dpr));
    canvas.width = canvas.height = W;
    R0 = W / 2 * 0.9;
    dirty = true;
  }

  /* ---------- растр ---------- */
  const OC = [24, 41, 66], OD = [12, 22, 38], LC = [244, 239, 230], LD = [150, 162, 180], BC = [19, 34, 58];
  const lx = -0.42, ly = 0.52, lz = 0.74;          // свет сверху-слева
  function raster(q) {
    const S = Math.max(64, Math.round(W * q));
    if (!off || off.width !== S) { off = document.createElement('canvas'); off.width = off.height = S; octx = off.getContext('2d'); }
    const img = octx.createImageData(S, S), buf = new Uint32Array(img.data.buffer);
    const c = S / 2, lens = R0 / W * S, Rk = lens * view.k, inv = 1 / Rk, lens2 = lens * lens;
    const L0 = view.lon * D, A = view.lat * D, cL = Math.cos(L0), sL = Math.sin(L0), cA = Math.cos(A), sA = Math.sin(A);
    const bil = q >= 0.99;
    for (let py = 0; py < S; py++) {
      const dyp = py + .5 - c, y2 = -dyp * inv;
      for (let px = 0, k = py * S; px < S; px++, k++) {
        const dxp = px + .5 - c;
        if (dxp * dxp + dyp * dyp > lens2) continue;
        const x2 = dxp * inv, rr = x2 * x2 + y2 * y2;
        if (rr > 1) continue;
        const z2 = Math.sqrt(1 - rr);
        const y = y2 * cA + z2 * sA, z1 = -y2 * sA + z2 * cA;
        const x = x2 * cL + z1 * sL, z = -x2 * sL + z1 * cL;
        const lat = Math.asin(y), lon = Math.atan2(x, z);
        let u = (lon / Math.PI + 1) / 2 * MW - .5, v = (.5 - lat / Math.PI) * MH - .5;
        let ln = 0;
        if (land) {
          if (bil) {
            if (v < 0) v = 0; if (v > MH - 1.001) v = MH - 1.001;
            const u0 = Math.floor(u), v0 = v | 0, fu = u - u0, fv = v - v0;
            const ua = (u0 + MW) % MW, ub = (u0 + 1 + MW) % MW, r0 = v0 * MW, r1 = r0 + MW;
            ln = (land[r0 + ua] * (1 - fu) + land[r0 + ub] * fu) * (1 - fv) + (land[r1 + ua] * (1 - fu) + land[r1 + ub] * fu) * fv;
          } else {
            const i = (clamp(Math.round(v), 0, MH - 1)) * MW + ((Math.round(u) + MW) % MW);
            ln = land[i];
          }
        }
        const t = ln / 255;
        const sh = clamp(.45 + .55 * (x2 * lx + y2 * ly + z2 * lz), 0, 1);
        const rim = rr > .9 ? 1 - (rr - .9) * 2.2 : 1;
        const m = sh * rim;
        let R = (OD[0] + (OC[0] - OD[0]) * m) * (1 - t) + (LD[0] + (LC[0] - LD[0]) * m) * t;
        let Gc = (OD[1] + (OC[1] - OD[1]) * m) * (1 - t) + (LD[1] + (LC[1] - LD[1]) * m) * t;
        let B = (OD[2] + (OC[2] - OD[2]) * m) * (1 - t) + (LD[2] + (LC[2] - LD[2]) * m) * t;
        buf[k] = 0xff000000 | (B << 16) | (Gc << 8) | R;
      }
    }
    octx.putImageData(img, 0, 0);
  }

  /* ---------- оверлей: сетка, ободок, пины, подписи ---------- */
  let pins = [], selected = null;
  function overlay() {
    const c = W / 2, Rk = R0 * view.k;
    ctx.save(); ctx.beginPath(); ctx.arc(c, c, R0, 0, 6.2832); ctx.clip();
    // сетка
    ctx.strokeStyle = 'rgba(243,238,230,.09)'; ctx.lineWidth = Math.max(1, dpr * .6);
    const stepG = view.k > 3 ? 10 : 30;
    const line = (fn) => { ctx.beginPath(); let on = false; for (let t = 0; t <= 1.0001; t += .01) { const [la, lo] = fn(t); const v = project(la, lo); if (v[2] < 0) { on = false; continue; } const X = c + v[0] * Rk, Y = c - v[1] * Rk; on ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); on = true; } ctx.stroke(); };
    for (let lo = -180; lo < 180; lo += stepG) line(t => [-90 + 180 * t, lo]);
    for (let la = -60; la <= 60; la += stepG) line(t => [la, -180 + 360 * t]);
    // берега и границы — векторно, чётко на любом зуме
    const L0 = view.lon * D, A = view.lat * D, cL = Math.cos(L0), sL = Math.sin(L0), cA = Math.cos(A), sA = Math.sin(A);
    const lensR = R0 / Rk;
    const stroke = (rings, style, width, closed) => {
      ctx.beginPath();
      rings.forEach(rg => {
        const [x, y, z] = rg.c, x1 = x * cL - z * sL, z1 = x * sL + z * cL, y2 = y * cA - z1 * sA, z2 = y * sA + z1 * cA;
        if (z2 < -Math.sin(Math.min(rg.rad, 1.5707))) return;                       // целиком на обратной стороне
        if (Math.hypot(x1, y2) - Math.sin(Math.min(rg.rad, 1.5707)) > lensR + .02 && z2 > 0) return; // вне линзы
        const v = rg.v; let on = false;
        for (let i = 0; i < v.length; i += 3) {
          const px = v[i], py = v[i + 1], pz = v[i + 2];
          const a1 = px * cL - pz * sL, c1 = px * sL + pz * cL, b2 = py * cA - c1 * sA, c2 = py * sA + c1 * cA;
          if (c2 < 0) { on = false; continue; }
          const X = c + a1 * Rk, Y = c - b2 * Rk;
          on ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); on = true;
        }
      });
      ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.stroke();
    };
    const zw = Math.min(1.6, .7 + Math.log2(view.k) * .3);
    stroke(borders, 'rgba(19,34,58,.32)', dpr * .75 * zw);
    stroke(coast, 'rgba(19,34,58,.55)', dpr * .8 * zw);
    // пины
    pins = [];
    const ps = dpr * (1 + Math.log2(view.k) * .35);
    places.forEach(p => {
      const v = project(p.lat, p.lon); if (v[2] < .04) return;
      const X = c + v[0] * Rk, Y = c - v[1] * Rk;
      if ((X - c) ** 2 + (Y - c) ** 2 > R0 * R0) return;
      pins.push({ p, X, Y, z: v[2] });
    });
    pins.sort((a, b) => a.z - b.z);
    const dim = activeC ? .28 : 1;
    pins.forEach(pn => {
      const { p, X, Y, z } = pn, on = !activeC || p.c === activeC;
      const r = (2.6 + 1.6 * z) * ps * (pn === selected || p === (selected && selected.p) ? 1.5 : 1);
      ctx.globalAlpha = on ? 1 : dim;
      ctx.beginPath(); ctx.arc(X, Y + r * .25, r * 1.25, 0, 6.2832); ctx.fillStyle = 'rgba(8,16,30,.45)'; ctx.fill();
      ctx.beginPath(); ctx.arc(X, Y, r, 0, 6.2832); ctx.fillStyle = p.b ? '#3D6DF2' : '#FF5C73'; ctx.fill();
      ctx.lineWidth = Math.max(1, dpr * .8); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(X - r * .32, Y - r * .32, r * .32, 0, 6.2832); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fill();
      pn.r = r;
    });
    ctx.globalAlpha = 1;
    // подписи при приближении
    if (view.k >= 2.6) {
      const boxes = []; ctx.font = `600 ${Math.round(11 * dpr)}px Geologica, system-ui, sans-serif`; ctx.textBaseline = 'middle';
      pins.slice().sort((a, b) => b.z - a.z).forEach(pn => {
        if (activeC && pn.p.c !== activeC) return;
        const t = name(pn.p), w = ctx.measureText(t).width + 10 * dpr, h = 18 * dpr, x = pn.X + pn.r + 4 * dpr, y = pn.Y - h / 2;
        if (boxes.some(b => x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1])) return;
        boxes.push([x, y, w, h]);
        ctx.fillStyle = 'rgba(14,26,43,.82)'; roundRect(x, y, w, h, 6 * dpr); ctx.fill();
        ctx.fillStyle = '#F3EEE6'; ctx.fillText(t, x + 5 * dpr, y + h / 2 + .5);
      });
    }
    ctx.restore();
    // ободок линзы и атмосфера
    const g = ctx.createRadialGradient(c, c, R0 * .98, c, c, R0 * 1.1);
    g.addColorStop(0, 'rgba(120,160,230,.35)'); g.addColorStop(1, 'rgba(120,160,230,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, R0 * 1.1, 0, 6.2832); ctx.arc(c, c, R0, 0, 6.2832, true); ctx.fill();
    ctx.beginPath(); ctx.arc(c, c, R0 - .5, 0, 6.2832); ctx.strokeStyle = 'rgba(243,238,230,.35)'; ctx.lineWidth = Math.max(1, dpr); ctx.stroke();
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function draw(q) {
    raster(q);
    ctx.clearRect(0, 0, W, W);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, W, W);
    overlay();
    placeTip();
  }

  /* ---------- анимационный цикл ---------- */
  let hiresTimer = 0, visible = false, raf = 0;
  const ease = t => 1 - Math.pow(1 - t, 3);
  function frame(now) {
    raf = 0;
    let changed = false;
    if (target) {
      const t = clamp((now - target.t0) / target.dur, 0, 1), e = ease(t), f = target.from;
      let dl = normLon(target.lon - f.lon);
      view.lon = normLon(f.lon + dl * e); view.lat = f.lat + (target.lat - f.lat) * e;
      view.k = Math.exp(Math.log(f.k) + (Math.log(target.k) - Math.log(f.k)) * e);
      changed = true; if (t >= 1) target = null;
    } else if (!drag && (Math.abs(vel.lon) > .002 || Math.abs(vel.lat) > .002)) {
      view.lon = normLon(view.lon + vel.lon); view.lat = clamp(view.lat + vel.lat, -85, 85);
      vel.lon *= .93; vel.lat *= .93; changed = true;
    } else if (!drag && !reduce && view.k < 1.05 && !selected && !activeC && now - lastInteract > 3500) {
      view.lon = normLon(view.lon - .05); changed = 'auto';
    }
    if (changed || dirty) { moving = changed; draw(changed === 'auto' ? (W > 900 ? .75 : 1) : changed ? (W > 700 ? .5 : .7) : 1); dirty = false; clearTimeout(hiresTimer); if (changed) hiresTimer = setTimeout(() => { dirty = true; kick(); }, 140); }
    if (visible && (changed || target || drag || Math.abs(vel.lon) > .002 || (!selected && !activeC && view.k < 1.05))) kick();
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { dirty = true; kick(); } }, { rootMargin: '100px' }).observe(canvas);

  /* ---------- управление ---------- */
  const pts = new Map(); let drag = null, pinch = null, lastTap = 0;
  const local = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]; };
  const setTouch = () => { canvas.style.touchAction = view.k > 1.05 ? 'none' : 'pan-y'; };
  function flyTo(lon, lat, k, dur = 900) { target = { lon, lat: clamp(lat, -85, 85), k: clamp(k, 1, KMAX), t0: performance.now(), dur: reduce ? 1 : dur, from: { ...view } }; vel.lon = vel.lat = 0; lastInteract = performance.now(); setTimeout(setTouch, dur); kick(); }
  function zoomBy(f) { flyTo(view.lon, view.lat, view.k * f, 380); }
  function pickPin(x, y) { let best = null; pins.forEach(pn => { const d = Math.hypot(pn.X - x, pn.Y - y); if (d < pn.r + 9 * dpr && (!best || d < best.d)) best = { pn, d }; }); return best && best.pn; }

  canvas.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, local(e)); canvas.setPointerCapture(e.pointerId);
    target = null; lastInteract = performance.now();
    if (pts.size === 1) { const [x, y] = local(e); drag = { x, y, t: performance.now(), moved: 0, hist: [] }; vel.lon = vel.lat = 0; canvas.classList.add('grabbing'); }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: view.k }; drag = null; }
    kick();
  });
  canvas.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) {
      if (e.pointerType === 'mouse') { const [x, y] = local(e); const pn = pickPin(x, y); canvas.style.cursor = pn ? 'pointer' : ''; hover = pn; placeTip(); }
      return;
    }
    pts.set(e.pointerId, local(e)); lastInteract = performance.now();
    if (pinch && pts.size >= 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); view.k = clamp(pinch.k * d / pinch.d, 1, KMAX); dirty = true; kick(); return; }
    if (!drag) return;
    const [x, y] = local(e), dx = x - drag.x, dy = y - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    const deg = 180 / Math.PI / (R0 * view.k);
    view.lon = normLon(view.lon - dx * deg); view.lat = clamp(view.lat + dy * deg, -85, 85);
    const now = performance.now(); drag.hist.push([now, -dx * deg, dy * deg]); while (drag.hist.length && now - drag.hist[0][0] > 90) drag.hist.shift();
    drag.x = x; drag.y = y; dirty = true; kick();
  });
  const end = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pinch && pts.size < 2) { pinch = null; setTouch(); if (pts.size === 1) { const [p] = [...pts.values()]; drag = { x: p[0], y: p[1], t: performance.now(), moved: 99, hist: [] }; } return; }
    if (drag) {
      if (drag.moved < 8 * dpr && e.type === 'pointerup') {
        const [x, y] = local(e), now = performance.now(), pn = pickPin(x, y);
        if (now - lastTap < 300) { const v = unproject(x, y); if (v) flyTo(v[1], v[0], view.k * 2, 500); lastTap = 0; }
        else { lastTap = now; selected = pn || null; hover = null; dirty = true; placeTip(); }
      } else if (drag.hist.length > 1) {
        const n = drag.hist.length, sl = drag.hist.reduce((s, h) => s + h[1], 0), sa = drag.hist.reduce((s, h) => s + h[2], 0);
        vel.lon = clamp(sl / n, -4, 4); vel.lat = clamp(sa / n, -4, 4);
      }
      drag = null; canvas.classList.remove('grabbing'); kick();
    }
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { if (!drag) { hover = null; placeTip(); } });
  canvas.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey || view.k > 1.05)) return;   // обычное колесо листает страницу, пока глобус не приближен
    e.preventDefault(); lastInteract = performance.now(); target = null;
    view.k = clamp(view.k * Math.exp(-e.deltaY * (e.ctrlKey ? .012 : .0025)), 1, KMAX); setTouch(); dirty = true; kick();
  }, { passive: false });
  canvas.addEventListener('dblclick', e => e.preventDefault());

  function unproject(x, y) {
    const c = W / 2, Rk = R0 * view.k, x2 = (x - c) / Rk, y2 = -(y - c) / Rk, rr = x2 * x2 + y2 * y2; if (rr > 1) return null;
    const z2 = Math.sqrt(1 - rr), L0 = view.lon * D, A = view.lat * D;
    const yy = y2 * Math.cos(A) + z2 * Math.sin(A), z1 = -y2 * Math.sin(A) + z2 * Math.cos(A);
    const xx = x2 * Math.cos(L0) + z1 * Math.sin(L0), zz = -x2 * Math.sin(L0) + z1 * Math.cos(L0);
    return [Math.asin(yy) / D, Math.atan2(xx, zz) / D];
  }

  /* ---------- подсказка ---------- */
  let hover = null;
  function placeTip() {
    if (!tip) return;
    const pn = hover || selected;
    if (!pn) { tip.hidden = true; return; }
    const cur = pins.find(q => q.p === pn.p);
    if (!cur) { tip.hidden = true; return; }
    tip.innerHTML = `<b>${name(cur.p)}</b><span>${cname(cur.p.c)}</span>`;
    tip.style.left = cur.X / W * 100 + '%'; tip.style.top = cur.Y / W * 100 + '%'; tip.hidden = false;
  }

  /* ---------- кнопки и чипы ---------- */
  const btn = sel => wrap.querySelector(sel);
  btn('[data-g="in"]')?.addEventListener('click', () => zoomBy(1.8));
  btn('[data-g="out"]')?.addEventListener('click', () => zoomBy(1 / 1.8));
  btn('[data-g="reset"]')?.addEventListener('click', () => { activeC = null; selected = null; drawChips(); flyTo(38, 44, 1, 900); });
  chips?.addEventListener('click', e => {
    const b = e.target.closest('button[data-c]'); if (!b) return;
    const c = b.dataset.c;
    if (activeC === c) { activeC = null; drawChips(); flyTo(view.lon, view.lat, 1, 700); return; }
    activeC = c; selected = null; drawChips();
    const list = byC[c]; let sx = 0, sy = 0, sz = 0;
    list.forEach(p => { const la = p.lat * D, lo = p.lon * D; sx += Math.cos(la) * Math.sin(lo); sy += Math.sin(la); sz += Math.cos(la) * Math.cos(lo); });
    const lat = Math.atan2(sy, Math.hypot(sx, sz)) / D, lon = Math.atan2(sx, sz) / D;
    const spread = Math.max(...list.map(p => Math.acos(clamp(Math.sin(p.lat * D) * Math.sin(lat * D) + Math.cos(p.lat * D) * Math.cos(lat * D) * Math.cos((p.lon - lon) * D), -1, 1))), 1.5 * D);
    flyTo(lon, lat, clamp(.8 / Math.sin(Math.min(spread * 1.25, Math.PI / 2)), 1, 7), 1100);
    if (matchMedia('(max-width: 900px)').matches) wrap.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  });

  /* ---------- старт ---------- */
  addEventListener('resize', () => { size(); kick(); });
  const start = () => { buildMask(); size(); setTouch(); dirty = true; kick(); };
  if (window.GEO) start(); else addEventListener('load', start, { once: true });
})();
