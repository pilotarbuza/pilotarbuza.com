/* pilotarbuza.com/admin/plan — диаграмма Ганта: дерево задач слева, шкала времени справа.
   Бар можно тянуть (сдвиг) и растягивать за края; этап тянется вместе со всем содержимым.
   Если включено «Сдвигать следующие», задачи из «Начать после» отодвигаются, чтобы не терять исходный зазор. */
(() => {
  const { el, state, L, dn, iso, today, wday, parts, MON_N, MONTHS, fmt, fmtShort, children, descendants, isOverdue, person, label, rollup, byId } = PA;
  const ZOOM = {
    day: { px: 30, name: 'Дни' }, week: { px: 9, name: 'Недели' }, month: { px: 3.2, name: 'Месяцы' }, quarter: { px: 1.15, name: 'Кварталы' },
  };
  const ROW = 40;
  let undo = null;
  let scrollPos = null, pendingCenter = null; // положение прокрутки переживает перерисовку

  const ui = () => {
    state.ui.zoom = ZOOM[state.ui.zoom] ? state.ui.zoom : 'week';
    state.ui.collapsed = state.ui.collapsed || {};
    if (state.ui.cascade === undefined) state.ui.cascade = true;
    state.ui.gq = state.ui.gq || '';
    state.ui.gstatus = state.ui.gstatus || 'all';
    return state.ui;
  };

  // строки: дерево с учётом свёрнутых этапов; при поиске — совпадения и их родители
  function rows() {
    const u = ui(), q = u.gq.toLowerCase(), st = u.gstatus;
    const filtering = q || st !== 'all';
    const match = t => (!q || `${t.code} ${t.title} ${t.notes}`.toLowerCase().includes(q))
      && (st === 'all' || (st === 'overdue' ? isOverdue(t) : t.status === st));
    const keep = new Set();
    if (filtering) state.tasks.forEach(t => { if (match(t)) { let p = t; while (p) { keep.add(p.id); p = p.parent && byId('tasks', p.parent); } } });
    const out = [];
    const walk = (pid, depth) => children(pid).forEach(t => {
      if (filtering && !keep.has(t.id)) return;
      const kids = children(t.id).length;
      out.push({ t, depth, kids, dim: filtering && !match(t) });
      if (kids && (filtering || !u.collapsed[t.id])) walk(t.id, depth + 1);
    });
    walk(null, 0);
    return out;
  }

  function span() {
    const ds = state.tasks.flatMap(t => [t.start, t.end]).filter(Boolean).map(dn);
    const t0 = today();
    let a = Math.min(t0, ...ds), b = Math.max(t0, ...ds);
    const p = parts(a - 14); a = dn(`${p.y}-${String(p.m + 1).padStart(2, '0')}-01`);
    const q = parts(b + 45); b = dn(`${q.y}-${String(q.m + 1).padStart(2, '0')}-01`) - 1;
    return [a, b];
  }

  // ---------- шапка шкалы ----------
  function header(a, b, px, zoom) {
    const top = el('div', { class: 'gt-hrow gt-hrow--top' }), low = el('div', { class: 'gt-hrow gt-hrow--low' });
    const seg = (row, from, to, text, cls) => row.append(el('div', { class: 'gt-hcell ' + (cls || ''), style: `left:${(from - a) * px}px;width:${(to - from + 1) * px}px`, title: text }, el('span', { text })));
    const monthStart = n => { const p = parts(n); return dn(`${p.y}-${String(p.m + 1).padStart(2, '0')}-01`); };
    const nextMonth = n => { const p = parts(n); return p.m === 11 ? dn(`${p.y + 1}-01-01`) : dn(`${p.y}-${String(p.m + 2).padStart(2, '0')}-01`); };
    if (zoom === 'day' || zoom === 'week') {
      for (let m = monthStart(a); m <= b; m = nextMonth(m)) { const p = parts(m); seg(top, Math.max(m, a), Math.min(nextMonth(m) - 1, b), `${MONTHS[p.m]} ${p.y}`); }
    } else {
      for (let y = parts(a).y; y <= parts(b).y; y++) seg(top, Math.max(dn(`${y}-01-01`), a), Math.min(dn(`${y}-12-31`), b), String(y));
    }
    if (zoom === 'day') {
      for (let n = a; n <= b; n++) seg(low, n, n, String(parts(n).d), wday(n) > 4 ? 'gt-hcell--we' : '');
    } else if (zoom === 'week') {
      for (let n = a - wday(a); n <= b; n += 7) { const p = parts(n); seg(low, Math.max(n, a), Math.min(n + 6, b), `${p.d}.${String(p.m + 1).padStart(2, '0')}`); }
    } else if (zoom === 'month') {
      for (let m = monthStart(a); m <= b; m = nextMonth(m)) seg(low, m, Math.min(nextMonth(m) - 1, b), MON_N[parts(m).m]);
    } else {
      for (let m = monthStart(a); m <= b; m = nextMonth(nextMonth(nextMonth(m)))) { const e = nextMonth(nextMonth(nextMonth(m))) - 1; seg(low, Math.max(m, a), Math.min(e, b), `${Math.floor(parts(m).m / 3) + 1} кв.`); }
    }
    // полоса календаря: сессии, каникулы, праздники, дедлайны
    const cal = el('div', { class: 'gt-hrow gt-hrow--cal' });
    state.calendar.slice().sort((x, y) => (x.kind === 'holiday') - (y.kind === 'holiday')).forEach(c => {
      const s = Math.max(dn(c.start), a), e = Math.min(dn(c.end), b);
      if (e < a || s > b) return;
      const w = (e - s + 1) * px;
      const node = el('div', { class: `gt-ev gt-ev--${c.kind}`, style: `left:${(s - a) * px}px;width:${Math.max(w, 6)}px`, title: `${L.cal[c.kind]}: ${c.title}, ${PA.range(c)}` },
        w > 70 ? el('span', { text: c.kind === 'holiday' ? c.title : (L.cal[c.kind] === c.title ? c.title : c.title) }) : null);
      cal.append(node);
    });
    return [top, low, cal];
  }

  // ---------- сдвиги с каскадом ----------
  function plan(task, ns, ne, mode) {
    const moves = new Map(); // id -> {start, end}
    const cur = t => moves.get(t.id) || { start: dn(t.start), end: dn(t.end) };
    const put = (t, s, e) => moves.set(t.id, { start: s, end: e });
    const shiftTree = (t, d) => { const c = cur(t); put(t, c.start + d, c.end + d); if (t.kind === 'phase' || children(t.id).length) descendants(t.id).forEach(x => { if (x.start) { const cx = cur(x); put(x, cx.start + d, cx.end + d); } }); };
    if (mode === 'move' && (task.kind === 'phase' || children(task.id).length)) shiftTree(task, ns - dn(task.start));
    else put(task, ns, ne);
    if (ui().cascade) {
      const queue = [task, ...descendants(task.id)];
      const seen = new Set();
      while (queue.length) {
        const p = queue.shift();
        if (!p.end || seen.has(p.id)) continue;
        seen.add(p.id);
        const oldEnd = dn(p.end), newEnd = cur(p).end;
        if (newEnd <= oldEnd && !moves.has(p.id)) continue;
        state.tasks.filter(s => (s.deps || []).includes(p.id) && s.start).forEach(s => {
          const gap = dn(s.start) - oldEnd, need = Math.min(gap, s.kind === 'milestone' ? 0 : 1);
          const push = need - (cur(s).start - newEnd);
          if (push > 0) { shiftTree(s, push); queue.push(s, ...descendants(s.id)); }
        });
      }
    }
    // этапы растягиваются, чтобы вмещать свои задачи
    [...moves.keys()].forEach(id => {
      let p = byId('tasks', id);
      while (p && p.parent) {
        const par = byId('tasks', p.parent), m = cur(p), pm = cur(par);
        if (par.start && (m.start < pm.start || m.end > pm.end)) put(par, Math.min(pm.start, m.start), Math.max(pm.end, m.end));
        p = par;
      }
    });
    const ops = [], back = [];
    moves.forEach((v, id) => {
      const t = byId('tasks', id);
      if (iso(v.start) === t.start && iso(v.end) === t.end) return;
      ops.push({ op: 'update', kind: 'tasks', id, data: { start: iso(v.start), end: iso(v.end) } });
      back.push({ op: 'update', kind: 'tasks', id, data: { start: t.start, end: t.end } });
    });
    return { ops, back };
  }

  async function commit(task, ns, ne, mode) {
    const { ops, back } = plan(task, ns, ne, mode);
    if (!ops.length) return PA.render();
    if (await PA.batch(ops)) {
      undo = back;
      const others = ops.length - 1;
      PA.toast(`${label(task)}: ${PA.range(byId('tasks', task.id))}${others > 0 ? `, сдвинуто ещё ${others}` : ''}`);
    }
    PA.render();
  }

  // ---------- вид ----------
  PA.views.gantt = box => {
    const u = ui(), Z = ZOOM[u.zoom], px = Z.px;
    const [a, b] = span();
    const W = Math.round((b - a + 1) * px);
    const list = rows();
    const H = Math.max(list.length, 1) * ROW;
    const x = n => (n - a) * px;

    // панель
    const zoomBtns = el('div', { class: 'pl-seg', role: 'group', 'aria-label': 'Масштаб' }, Object.entries(ZOOM).map(([k, z]) =>
      el('button', { type: 'button', text: z.name, 'aria-pressed': String(k === u.zoom), onclick: () => { pendingCenter = centerDay(); u.zoom = k; PA.saveUi(); PA.render(); } })));
    const search = el('input', { class: 'fld-in pl-search', type: 'search', placeholder: 'Поиск задачи', value: u.gq, 'aria-label': 'Поиск задачи', 'data-keep': 'gq' });
    search.addEventListener('input', () => { u.gq = search.value.trim(); PA.saveUi(); redraw(); });
    const stSel = PA.select([['all', 'Все статусы'], ['overdue', 'Просроченные'], ...Object.entries(L.status)], u.gstatus, { 'aria-label': 'Статус' });
    stSel.addEventListener('change', () => { u.gstatus = stSel.value; PA.saveUi(); redraw(); });
    const cascade = el('label', { class: 'pl-check' }, [el('input', { type: 'checkbox', checked: u.cascade, onchange: e => { u.cascade = e.target.checked; PA.saveUi(); } }), 'Сдвигать следующие']);
    const fold = el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: Object.keys(u.collapsed).length ? 'Развернуть всё' : 'Свернуть этапы', onclick: () => {
      if (Object.keys(u.collapsed).length) u.collapsed = {}; else state.tasks.filter(t => t.kind === 'phase').forEach(t => { u.collapsed[t.id] = true; });
      PA.saveUi(); PA.render();
    } });
    const undoBtn = !undo ? null : el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Отменить сдвиг', onclick: async () => { const ops = undo; undo = null; if (await PA.batch(ops)) PA.toast('Сдвиг отменён'); PA.render(); } });
    const toolbar = el('div', { class: 'gt-tools' }, [
      el('div', { class: 'pl-row' }, [el('button', { type: 'button', class: 'btn btn--primary btn--sm', text: 'Сегодня', onclick: () => scrollTo(today(), true) }), zoomBtns]),
      el('div', { class: 'pl-row' }, [search, stSel, cascade, fold, undoBtn]),
    ]);

    // левая колонка
    const leftHead = el('div', { class: 'gt-left gt-left--head' }, [el('span', { class: 'gt-c gt-c--code', text: '№' }), el('span', { class: 'gt-c gt-c--title', text: 'Задача' }), el('span', { class: 'gt-c gt-c--st', text: 'Статус' }), el('span', { class: 'gt-c gt-c--who', text: 'Кто' }), el('span', { class: 'gt-c gt-c--dates', text: 'Сроки' })]);
    const left = el('div', { class: 'gt-left' });
    list.forEach(({ t, depth, kids, dim }) => {
      const caret = kids ? el('button', { type: 'button', class: 'gt-caret', 'aria-expanded': String(!u.collapsed[t.id]), 'aria-label': u.collapsed[t.id] ? 'Развернуть' : 'Свернуть', onclick: e => { e.stopPropagation(); if (u.collapsed[t.id]) delete u.collapsed[t.id]; else u.collapsed[t.id] = true; PA.saveUi(); redraw(); } }) : el('span', { class: 'gt-caret gt-caret--none' });
      const add = t.kind === 'phase' ? el('button', { type: 'button', class: 'gt-add', 'aria-label': 'Добавить задачу в этот этап', title: 'Добавить задачу в этап', text: '+', onclick: e => { e.stopPropagation(); PA.openTask(null, { parent: t.id, start: t.start && dn(t.start) > today() ? t.start : PA.todayIso(), end: iso(Math.max(today(), t.start ? dn(t.start) : today()) + 6) }); } }) : null;
      const pct = t.kind === 'phase' ? rollup(t.id) : null;
      const row = el('div', { class: `gt-lrow gt-lrow--${t.kind}${dim ? ' gt-dim' : ''}${isOverdue(t) ? ' gt-late' : ''}`, tabindex: 0, role: 'button', 'aria-label': `${label(t)}, ${L.status[t.status]}, ${PA.range(t)}`, onclick: () => PA.openTask(t.id), onkeydown: e => { if (e.key === 'Enter') PA.openTask(t.id); } }, [
        el('span', { class: 'gt-c gt-c--code', text: t.code || '' }),
        el('span', { class: 'gt-c gt-c--title', style: `padding-left:${depth * 16}px` }, [caret, el('span', { class: 'gt-title', text: t.kind === 'phase' ? t.title : t.title.replace(/^T-\d+\w?\s/, ''), title: label(t) }), add]),
        el('span', { class: 'gt-c gt-c--st' }, t.kind === 'phase' ? el('span', { class: 'gt-pct', text: pct === null ? '' : pct + '%' }) : PA.statusPill(t.status, true)),
        el('span', { class: 'gt-c gt-c--who' }, t.kind === 'phase' ? null : PA.avatar(person(t.assignee))),
        el('span', { class: 'gt-c gt-c--dates', text: t.start ? (t.start === t.end ? fmtShort(t.start) : `${fmtShort(t.start)}–${fmtShort(t.end)}`) : '—' }),
      ]);
      left.append(row);
    });
    if (!list.length) left.append(el('div', { class: 'gt-lrow gt-lrow--empty', text: state.tasks.length ? 'Ничего не найдено' : 'Задач пока нет' }));

    // шкала
    const [hTop, hLow, hCal] = header(a, b, px, u.zoom);
    const tHead = el('div', { class: 'gt-thead', style: `width:${W}px` }, [hTop, hLow, hCal]);
    const area = el('div', { class: `gt-area gt-area--${u.zoom}`, style: `width:${W}px;height:${H}px;--px:${px}px;--off:${-wday(a) * px}px` });
    state.calendar.forEach(c => {
      if (c.kind === 'event') return;
      const s = Math.max(dn(c.start), a), e = Math.min(dn(c.end), b);
      if (e < a || s > b) return;
      area.append(el('div', { class: `gt-band gt-band--${c.kind}`, style: `left:${x(s)}px;width:${Math.max((e - s + 1) * px, c.kind === 'deadline' ? 0 : 1)}px`, title: `${c.title}, ${PA.range(c)}` }));
    });
    list.forEach((r, i) => { if (r.t.kind === 'phase') area.append(el('div', { class: 'gt-rowbg', style: `top:${i * ROW}px` })); });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'gt-deps'); svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.innerHTML = '<defs><marker id="gt-arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z"/></marker></defs>';
    const idx = new Map(list.map((r, i) => [r.t.id, i]));
    list.forEach((r, i) => (r.t.deps || []).forEach(d => {
      if (!idx.has(d)) return;
      const p = byId('tasks', d); if (!p.end || !r.t.start) return;
      const j = idx.get(d);
      const x1 = x(dn(p.end) + 1) + (p.kind === 'milestone' ? 0 : 1), y1 = j * ROW + ROW / 2, x2 = x(dn(r.t.start)) - (r.t.kind === 'milestone' ? 4 : 1), y2 = i * ROW + ROW / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const mid = y1 < y2 ? j * ROW + ROW : j * ROW;
      path.setAttribute('d', x2 - x1 >= 14 ? `M${x1} ${y1}H${x1 + 6}V${y2}H${x2}` : `M${x1} ${y1}H${x1 + 6}V${mid}H${x2 - 8}V${y2}H${x2}`);
      path.dataset.a = d; path.dataset.b = r.t.id;
      svg.append(path);
    }));
    area.append(svg);

    list.forEach(({ t, dim }, i) => {
      if (!t.start) return;
      const s = dn(t.start), e = dn(t.end || t.start), top = i * ROW;
      let bar;
      if (t.kind === 'milestone') {
        bar = el('div', { class: `gt-ms gt-ms--${t.status}${isOverdue(t) ? ' gt-ms--late' : ''}`, style: `left:${x(s) + px / 2}px;top:${top + ROW / 2}px`, title: `${label(t)} · ${fmt(t.start, true)}` });
      } else {
        const pct = t.kind === 'phase' ? rollup(t.id) || 0 : (t.status === 'done' ? 100 : t.progress || 0);
        bar = el('div', { class: `gt-bar gt-bar--${t.kind} gt-bar--${t.status}${isOverdue(t) ? ' gt-bar--late' : ''}`, style: `left:${x(s)}px;width:${Math.max((e - s + 1) * px, 4)}px;top:${top + (t.kind === 'phase' ? 13 : 8)}px`, title: `${label(t)} · ${PA.range(t)}` }, [
          el('i', { class: 'gt-prog', style: `width:${pct}%` }),
          t.kind !== 'phase' ? el('b', { class: 'gt-h gt-h--l', 'data-mode': 'left' }) : null,
          t.kind !== 'phase' ? el('b', { class: 'gt-h gt-h--r', 'data-mode': 'right' }) : null,
        ]);
      }
      if (dim) bar.classList.add('gt-dim');
      bar.dataset.id = t.id;
      const lblX = t.kind === 'milestone' ? x(s) + px / 2 + 14 : x(e + 1) + 8;
      const lbl = el('span', { class: `gt-lbl gt-lbl--${t.kind}${dim ? ' gt-dim' : ''}`, style: `left:${lblX}px;top:${top}px`, text: t.kind === 'milestone' && t.code ? `${t.code} · ${fmt(t.start)}` : label(t) });
      area.append(bar, lbl);
      drag(bar, t, px, x);
      bar.addEventListener('mouseenter', () => svg.querySelectorAll(`[data-a="${t.id}"],[data-b="${t.id}"]`).forEach(p => p.classList.add('on')));
      bar.addEventListener('mouseleave', () => svg.querySelectorAll('.on').forEach(p => p.classList.remove('on')));
    });

    const t0 = today();
    if (t0 >= a && t0 <= b) {
      area.append(el('div', { class: 'gt-today', style: `left:${x(t0) + px / 2}px` }));
      tHead.append(el('div', { class: 'gt-today-tag doto', style: `left:${x(t0) + px / 2}px`, text: 'сегодня' }));
    }
    const tip = el('div', { class: 'gt-tip', hidden: true });

    const wrap = el('div', { class: 'gt-wrap' }, el('div', { class: 'gt-grid' }, [
      el('div', { class: 'gt-head' }, [leftHead, tHead]),
      el('div', { class: 'gt-body' }, [left, area]),
    ]));
    box.append(el('section', { class: 'gt' }, [toolbar, wrap, tip]));

    function centerDay() { const w = box.querySelector('.gt-wrap'); return w ? a + (w.scrollLeft + (w.clientWidth - leftW()) / 2) / px : today(); }
    function leftW() { return box.querySelector('.gt-left')?.offsetWidth || 0; }
    function scrollTo(n, smooth) {
      const w = box.querySelector('.gt-wrap'); if (!w) return;
      const [a2] = span(), p2 = ZOOM[ui().zoom].px;
      w.scrollTo({ left: Math.max(0, (n - a2) * p2 - (w.clientWidth - leftW()) / 2), behavior: smooth ? 'smooth' : 'auto' });
    }
    function redraw() { PA.render(); }
    PA.ganttTip = tip;
    const w = box.querySelector('.gt-wrap');
    if (pendingCenter !== null) { scrollTo(pendingCenter); pendingCenter = null; }
    else if (scrollPos && scrollPos.zoom === u.zoom) { w.scrollLeft = scrollPos.l; w.scrollTop = scrollPos.t; }
    else scrollTo(today());
    w.addEventListener('scroll', () => { scrollPos = { l: w.scrollLeft, t: w.scrollTop, zoom: u.zoom }; }, { passive: true });
  };

  // ---------- перетаскивание ----------
  function drag(bar, t, px) {
    bar.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const mode = e.target.dataset.mode || 'move';
      if (t.kind === 'milestone' && mode !== 'move') return;
      e.preventDefault();
      bar.setPointerCapture(e.pointerId);
      const x0 = e.clientX, s0 = dn(t.start), e0 = dn(t.end || t.start), left0 = parseFloat(bar.style.left), w0 = parseFloat(bar.style.width) || 0;
      let d = 0, moved = false;
      const tip = PA.ganttTip;
      const dates = () => {
        let s = s0, en = e0;
        if (mode === 'move') { s += d; en += d; } else if (mode === 'left') s = Math.min(s0 + d, e0); else en = Math.max(e0 + d, s0);
        return [s, en];
      };
      const move = ev => {
        const nd = Math.round((ev.clientX - x0) / px);
        if (Math.abs(ev.clientX - x0) > 3) moved = true;
        if (!moved) return;
        d = nd;
        const [s, en] = dates();
        bar.classList.add('gt-dragging');
        if (t.kind === 'milestone') bar.style.left = `${left0 + d * px}px`;
        else if (mode === 'move') bar.style.left = `${left0 + d * px}px`;
        else if (mode === 'left') { bar.style.left = `${left0 + (s - s0) * px}px`; bar.style.width = `${Math.max(w0 - (s - s0) * px, 4)}px`; }
        else bar.style.width = `${Math.max(w0 + (en - e0) * px, 4)}px`;
        tip.hidden = false;
        tip.textContent = s === en ? PA.fmt(iso(s), true) : `${PA.fmt(iso(s))} — ${PA.fmt(iso(en), true)} · ${PA.days(en - s + 1)}`;
        tip.style.left = `${ev.clientX + 14}px`; tip.style.top = `${ev.clientY + 16}px`;
      };
      const up = () => {
        bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up);
        tip.hidden = true;
        if (!moved) return PA.openTask(t.id);
        const [s, en] = dates();
        if (s === s0 && en === e0) return PA.render();
        commit(t, s, t.kind === 'milestone' ? s : en, mode);
      };
      bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    });
  }
})();
