/* pilotarbuza.com/admin/plan — обзор, календарь, доска, контакты (CRM), команда. */
(() => {
  const { el, state, L, dn, iso, today, todayIso, wday, parts, fmt, fmtShort, MONTHS, WD, children, descendants, isOverdue, person, label, rollup, byId, plural, days } = PA;
  const phases = () => children(null).filter(t => t.kind === 'phase' && t.start);
  const work = () => state.tasks.filter(t => t.kind !== 'phase');
  const curPhase = () => {
    const t0 = today(), ps = phases().filter(p => p.code !== 'R');
    return ps.find(p => dn(p.start) <= t0 && dn(p.end) >= t0) || ps.find(p => dn(p.start) > t0) || ps[ps.length - 1];
  };

  // ================= Обзор =================
  PA.views.overview = box => {
    const t0 = today(), ph = curPhase();
    const gates = work().filter(t => t.kind === 'milestone' && t.status !== 'done' && t.start).sort((a, b) => a.start.localeCompare(b.start));
    const gate = gates.find(g => dn(g.start) >= t0) || gates[0];
    const left = gate ? dn(gate.start) - t0 : null;

    // табло ближайших работ
    const open = work().filter(t => t.status !== 'done' && t.start);
    const soon = open.filter(t => isOverdue(t) || dn(t.start) <= t0 + 21).sort((a, b) => (isOverdue(b) - isOverdue(a)) || a.start.localeCompare(b.start)).slice(0, 9);
    const word = t => isOverdue(t) ? ['Задержка', 'late'] : t.status === 'doing' ? ['В работе', 'doing'] : t.status === 'blocked' ? ['Стоит', 'late'] : t.status === 'review' ? ['Проверка', 'review'] : dn(t.start) <= t0 ? ['Пора начинать', 'go'] : ['По плану', 'plan'];
    const boardRows = soon.map(t => {
      const [w, c] = word(t);
      return el('li', { class: 'ov-tr', tabindex: 0, role: 'button', onclick: () => PA.openTask(t.id), onkeydown: e => { if (e.key === 'Enter') PA.openTask(t.id); } }, [
        el('span', { class: 'ov-tr__d doto', text: fmtShort(t.start).slice(0, 5) }),
        el('span', { class: 'ov-tr__c doto', text: t.code || '·' }),
        el('span', { class: 'ov-tr__t', text: t.title.replace(/^T-\d+\w?\s/, '') }),
        el('span', { class: `ov-tr__s ov-tr__s--${c}`, text: w }),
      ]);
    });
    const pct = ph ? rollup(ph.id) || 0 : 0;
    const board = el('section', { class: 'ov-board dark dots' }, [
      el('div', { class: 'ov-board__top' }, [
        el('div', {}, [
          el('p', { class: 'ov-k', text: 'Сейчас идёт' }),
          el('h1', { class: 'ov-phase', text: ph ? ph.title : 'Этапов пока нет' }),
          ph ? el('p', { class: 'ov-sub', text: `${PA.range(ph)} · готово ${pct}%` }) : null,
          ph ? el('div', { class: 'ov-meter', role: 'img', 'aria-label': `Этап готов на ${pct}%` }, el('i', { style: `width:${pct}%` })) : null,
        ]),
        gate ? el('button', { type: 'button', class: 'ov-gate', onclick: () => PA.openTask(gate.id) }, [
          el('span', { class: 'ov-k', text: `До ${gate.code || 'вехи'}` }),
          el('b', { class: 'doto led', text: left >= 0 ? String(left) : `−${-left}` }),
          el('span', { class: 'ov-k', text: left >= 0 ? `${plural(left, 'день', 'дня', 'дней')}, ${fmt(gate.start, true)}` : 'дней просрочено' }),
        ]) : null,
      ]),
      el('div', { class: 'ov-tablehead', 'aria-hidden': 'true' }, ['Дата', 'Код', 'Задача', 'Статус'].map(h => el('span', { text: h }))),
      boardRows.length ? el('ol', { class: 'ov-table' }, boardRows) : el('p', { class: 'ov-sub', text: 'На ближайшие три недели задач нет.' }),
    ]);

    // лента этапов
    const ps = phases().filter(p => p.code !== 'R');
    let ladder = null;
    if (ps.length) {
      const a = Math.min(...ps.map(p => dn(p.start))), b = Math.max(...ps.map(p => dn(p.end))), tot = b - a + 1;
      const pos = n => `${((n - a) / tot * 100).toFixed(3)}%`;
      ladder = el('section', { class: 'ov-ladder card' }, [
        el('div', { class: 'ov-h' }, [el('h2', { text: 'Этапы и ворота' }), el('span', { class: 'pl-hint', text: `${fmt(iso(a), true)} — ${fmt(iso(b), true)}` })]),
        el('div', { class: 'ov-track' }, [
          ...ps.map(p => {
            const r = rollup(p.id) || 0, now = p === ph;
            return el('button', { type: 'button', class: `ov-seg${now ? ' ov-seg--now' : ''}`, style: `left:${pos(dn(p.start))};width:calc(${((dn(p.end) - dn(p.start) + 1) / tot * 100).toFixed(3)}% - 4px)`, title: `${p.title}, ${PA.range(p)}, готово ${r}%`, onclick: () => { state.ui.collapsed = {}; PA.saveUi(); location.hash = 'gantt'; } }, [
              el('i', { style: `width:${r}%` }),
              el('span', { class: 'ov-seg__n doto', text: p.code }),
              el('span', { class: 'ov-seg__t', text: p.title.replace(/^Этап \d+\.\s*/, '') }),
            ]);
          }),
          ...gates.concat(work().filter(t => t.kind === 'milestone' && t.status === 'done')).filter(g => g.code && /^G\d/.test(g.code)).map(g =>
            el('span', { class: `ov-gd${g.status === 'done' ? ' ov-gd--done' : ''}`, style: `left:${pos(dn(g.start) + 1)}`, title: `${g.title}, ${fmt(g.start, true)}` }, el('b', { text: g.code }))),
          el('span', { class: 'ov-now', style: `left:${pos(Math.min(Math.max(today(), a), b))}`, title: 'Сегодня' }),
        ]),
      ]);
    }

    // колонки
    const wk0 = t0 - wday(t0), wk1 = wk0 + 6;
    const thisWeek = open.filter(t => dn(t.start) <= wk1 && dn(t.end) >= wk0 && !isOverdue(t)).sort((a, b) => a.end.localeCompare(b.end));
    const late = open.filter(isOverdue).sort((a, b) => a.end.localeCompare(b.end));
    const follow = state.contacts.filter(c => c.next_date && c.status !== 'closed').sort((a, b) => a.next_date.localeCompare(b.next_date)).slice(0, 6);
    const tItem = t => el('li', {}, el('button', { type: 'button', class: 'ov-item', onclick: () => PA.openTask(t.id) }, [
      el('span', { class: 'ov-item__t', text: label(t) }),
      el('span', { class: 'ov-item__m' }, [PA.statusPill(t.status, true), el('span', { text: isOverdue(t) ? `срок был ${fmt(t.end)}` : `до ${fmt(t.end)}` })]),
    ]));
    const col = (title, count, items, emptyText) => el('section', { class: 'ov-col card' }, [
      el('div', { class: 'ov-h' }, [el('h2', { text: title }), el('span', { class: 'ov-count', text: String(count) })]),
      items.length ? el('ul', { class: 'ov-list' }, items) : el('p', { class: 'pl-hint', text: emptyText }),
    ]);
    const cols = el('div', { class: 'ov-cols' }, [
      col('Эта неделя', thisWeek.length, thisWeek.map(tItem), 'На этой неделе задач нет.'),
      col('Просрочено', late.length, late.map(tItem), 'Ничего не просрочено.'),
      col('Следующие шаги по контактам', follow.length, follow.map(c => el('li', {}, el('a', { class: 'ov-item', href: '#crm/' + c.id }, [
        el('span', { class: 'ov-item__t', text: c.next_step || c.name }),
        el('span', { class: 'ov-item__m' }, [el('span', { class: 'ov-who', text: c.name }), el('span', { class: dn(c.next_date) < t0 ? 'pl-late' : '', text: fmt(c.next_date) })]),
      ]))), 'Нет запланированных шагов.'),
    ]);
    box.append(el('div', { class: 'ov' }, [board, ladder, cols]));
  };

  // ================= Календарь =================
  PA.views.calendar = box => {
    const u = state.ui;
    const tp = parts(today());
    const [y, m] = (u.calMonth || `${tp.y}-${String(tp.m + 1).padStart(2, '0')}`).split('-').map(Number);
    const first = dn(`${y}-${String(m).padStart(2, '0')}-01`);
    const last = (m === 12 ? dn(`${y + 1}-01-01`) : dn(`${y}-${String(m + 1).padStart(2, '0')}-01`)) - 1;
    const g0 = first - wday(first), g1 = last + (6 - wday(last));
    const sel = u.calDay && dn(u.calDay) >= g0 && dn(u.calDay) <= g1 ? dn(u.calDay) : (today() >= first && today() <= last ? today() : first);
    const go = dm => { const mm = m - 1 + dm, yy = y + Math.floor(mm / 12), m2 = ((mm % 12) + 12) % 12; u.calMonth = `${yy}-${String(m2 + 1).padStart(2, '0')}`; u.calDay = null; PA.saveUi(); PA.render(); };
    const items = work().filter(t => t.start && dn(t.start) <= g1 && dn(t.end || t.start) >= g0).sort((a, b) => a.start.localeCompare(b.start) || (dn(b.end) - dn(b.start)) - (dn(a.end) - dn(a.start)));
    const cal = state.calendar;
    const hol = PA.holidaySet();
    const LANES = 4;

    const weeks = [];
    for (let w = g0; w <= g1; w += 7) {
      const we = w + 6;
      const segs = items.filter(t => dn(t.start) <= we && dn(t.end || t.start) >= w).map(t => ({ t, s: Math.max(dn(t.start), w), e: Math.min(dn(t.end || t.start), we) }));
      const lanes = []; // жадная раскладка по дорожкам
      segs.forEach(sg => { let i = lanes.findIndex(l => l.every(o => o.e < sg.s || o.s > sg.e)); if (i < 0) { lanes.push([]); i = lanes.length - 1; } lanes[i].push(sg); sg.lane = i; });
      const cells = [];
      for (let d = w; d <= we; d++) {
        const p = parts(d), out = d < first || d > last;
        const blocks = cal.filter(c => dn(c.start) <= d && dn(c.end) >= d);
        const hidden = segs.filter(sg => sg.lane >= LANES && sg.s <= d && sg.e >= d).length;
        cells.push(el('button', { type: 'button', class: `cl-day${out ? ' cl-day--out' : ''}${d === today() ? ' cl-day--today' : ''}${d === sel ? ' cl-day--sel' : ''}${wday(d) > 4 || hol.has(d) ? ' cl-day--off' : ''}${blocks.some(c => c.kind === 'session') ? ' cl-day--session' : ''}${blocks.some(c => c.kind === 'vacation') ? ' cl-day--vac' : ''}`,
          'aria-label': `${p.d} ${MONTHS[p.m]}`, onclick: () => { u.calDay = iso(d); PA.saveUi(); PA.render(); } }, [
          el('span', { class: 'cl-num', text: String(p.d) }),
          blocks.filter(c => c.kind === 'holiday' || c.kind === 'deadline' || c.kind === 'exam').sort((a, b) => (a.time || '').localeCompare(b.time || '')).slice(0, 1).map(c => el('span', { class: `cl-tag cl-tag--${c.kind}`, text: c.kind === 'exam' ? `${c.time || ''} ${c.title.replace(/^Vize · /, '')}`.trim() : c.title }))[0] || null,
          hidden ? el('span', { class: 'cl-more', text: `+${hidden}` }) : null,
        ]));
      }
      const bars = segs.filter(sg => sg.lane < LANES).map(({ t, s, e, lane }) => el('button', { type: 'button',
        class: `cl-bar cl-bar--${t.kind} cl-bar--${t.status}${isOverdue(t) ? ' cl-bar--late' : ''}${s > dn(t.start) ? ' cl-bar--cont' : ''}${e < dn(t.end || t.start) ? ' cl-bar--more' : ''}`,
        style: `left:calc(${(s - w) / 7 * 100}% + 3px);width:calc(${(e - s + 1) / 7 * 100}% - 6px);top:${34 + lane * 24}px`, title: `${label(t)} · ${PA.range(t)}`,
        onclick: () => PA.openTask(t.id), text: t.kind === 'milestone' ? `◆ ${t.code || t.title}` : label(t) }));
      weeks.push(el('div', { class: 'cl-week' }, [...cells, ...bars]));
    }

    // повестка выбранного дня
    const dayTasks = work().filter(t => t.start && dn(t.start) <= sel && dn(t.end || t.start) >= sel).sort((a, b) => a.end.localeCompare(b.end));
    const dayCal = cal.filter(c => dn(c.start) <= sel && dn(c.end) >= sel);
    const sp = parts(sel);
    const addForm = (() => {
      const title = el('input', { class: 'fld-in', placeholder: 'Например, сессия или выставка', maxLength: 160, required: true });
      const kind = PA.select(Object.entries(L.cal), 'event');
      const s = el('input', { class: 'fld-in', type: 'date', value: iso(sel) }), e = el('input', { class: 'fld-in', type: 'date', value: iso(sel) });
      const f = el('form', { class: 'cl-add' }, [PA.field('Событие', title, 'pl-span2'), PA.field('Тип', kind, 'pl-span2'), PA.field('С', s), PA.field('По', e), el('button', { type: 'submit', class: 'btn btn--ghost btn--sm pl-span2', text: 'Добавить в календарь' })]);
      f.addEventListener('submit', async ev => { ev.preventDefault(); if (await PA.save('calendar', null, { title: title.value, kind: kind.value, start: s.value, end: e.value || s.value })) { PA.toast('Добавлено в календарь'); PA.render(); } });
      return f;
    })();
    const agenda = el('aside', { class: 'cl-agenda card' }, [
      el('h2', { text: `${sp.d} ${PA.MON_G[sp.m]}, ${WD[wday(sel)]}` }),
      el('p', { class: 'pl-hint', text: wday(sel) > 4 || hol.has(sel) ? 'Выходной' : 'Рабочий день' }),
      dayCal.length ? el('ul', { class: 'cl-list' }, [...dayCal].sort((a, b) => (a.time || '').localeCompare(b.time || '')).map(c => el('li', { class: `cl-ev cl-ev--${c.kind}` }, [
        el('span', {}, [el('b', { text: c.title }), el('span', { class: 'pl-hint', text: ` ${L.cal[c.kind]}, ${c.time ? c.time + ', ' : ''}${PA.range(c)}` })]),
        c.room ? el('span', { class: 'pl-hint', text: `Аудитории: ${c.room}` }) : null,
        c.notes ? el('span', { class: 'pl-hint', text: c.notes }) : null,
        el('button', { type: 'button', class: 'pl-del', text: 'Удалить', onclick: async () => { if (confirm(`Удалить «${c.title}» из календаря?`) && await PA.remove('calendar', c.id)) { PA.toast('Удалено'); PA.render(); } } }),
      ]))) : null,
      dayTasks.length ? el('ul', { class: 'cl-list' }, dayTasks.map(t => el('li', {}, el('button', { type: 'button', class: 'ov-item', onclick: () => PA.openTask(t.id) }, [
        el('span', { class: 'ov-item__t', text: label(t) }),
        el('span', { class: 'ov-item__m' }, [PA.statusPill(t.status, true), el('span', { text: PA.range(t) })]),
      ])))) : el('p', { class: 'pl-hint', text: 'Задач на этот день нет.' }),
      el('button', { type: 'button', class: 'btn btn--primary btn--sm', text: 'Задача на этот день', onclick: () => PA.openTask(null, { start: iso(sel), end: iso(sel) }) }),
      el('details', { class: 'cl-details' }, [el('summary', { text: 'Добавить событие в календарь' }), addForm]),
    ]);

    box.append(el('div', { class: 'cl' }, [
      el('div', { class: 'cl-main' }, [
        el('div', { class: 'cl-head' }, [
          el('h1', { text: `${MONTHS[m - 1]} ${y}` }),
          el('div', { class: 'pl-row' }, [
            el('button', { type: 'button', class: 'pl-ico pl-ico--b', 'aria-label': 'Предыдущий месяц', onclick: () => go(-1) }, el('span', { 'aria-hidden': 'true', text: '‹' })),
            el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Сегодня', onclick: () => { u.calMonth = null; u.calDay = todayIso(); PA.saveUi(); PA.render(); } }),
            el('button', { type: 'button', class: 'pl-ico pl-ico--b', 'aria-label': 'Следующий месяц', onclick: () => go(1) }, el('span', { 'aria-hidden': 'true', text: '›' })),
          ]),
        ]),
        el('div', { class: 'cl-wd', 'aria-hidden': 'true' }, WD.map(d => el('span', { text: d }))),
        el('div', { class: 'cl-grid' }, weeks),
        el('div', { class: 'cl-legend' }, [
          el('span', { class: 'cl-lg cl-lg--session', text: 'Сессия' }), el('span', { class: 'cl-lg cl-lg--vac', text: 'Каникулы' }),
          el('span', { class: 'cl-lg cl-lg--off', text: 'Выходной или праздник' }), el('span', { class: 'cl-lg cl-lg--test', text: 'Испытание' }), el('span', { class: 'cl-lg cl-lg--late', text: 'Просрочено' }), el('span', { class: 'cl-lg cl-lg--exam', text: 'Экзамен' }),
        ]),
      ]),
      agenda,
    ]));
  };

  // ================= Доска =================
  PA.views.board = box => {
    const u = state.ui;
    const ph = curPhase();
    if (u.boardPhase === undefined) u.boardPhase = ph ? String(ph.id) : 'all';
    const phSel = PA.select([['all', 'Все этапы'], ...phases().map(p => [String(p.id), p.title])], u.boardPhase, { 'aria-label': 'Этап' });
    phSel.addEventListener('change', () => { u.boardPhase = phSel.value; PA.saveUi(); PA.render(); });
    const scope = u.boardPhase === 'all' ? work() : descendants(Number(u.boardPhase)).filter(t => t.kind !== 'phase');
    const cols = Object.keys(L.status).map(s => {
      const cards = scope.filter(t => t.status === s).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      const list = el('div', { class: 'bd-list' }, cards.map(t => {
        const c = el('article', { class: `bd-card bd-card--${t.kind}${isOverdue(t) ? ' bd-card--late' : ''} bd-card--p-${t.priority}`, draggable: 'true', tabindex: 0, onclick: () => PA.openTask(t.id), onkeydown: e => { if (e.key === 'Enter') PA.openTask(t.id); } }, [
          el('div', { class: 'bd-card__top' }, [el('span', { class: 'bd-code', text: t.code || L.kind[t.kind] }), PA.avatar(person(t.assignee))]),
          el('p', { class: 'bd-title', text: t.title.replace(/^T-\d+\w?\s/, '') }),
          el('div', { class: 'bd-meta' }, [
            el('span', { class: isOverdue(t) ? 'pl-late' : '', text: t.start ? PA.range(t) : 'без дат' }),
            t.priority === 'high' || t.priority === 'critical' ? el('span', { class: `bd-pr bd-pr--${t.priority}`, text: L.priority[t.priority] }) : null,
          ]),
          t.kind !== 'milestone' && t.progress > 0 && t.status !== 'done' ? el('div', { class: 'bd-prog' }, el('i', { style: `width:${t.progress}%` })) : null,
        ]);
        c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', String(t.id)); c.classList.add('bd-card--drag'); });
        c.addEventListener('dragend', () => c.classList.remove('bd-card--drag'));
        return c;
      }));
      const colEl = el('section', { class: `bd-col bd-col--${s}` }, [el('h2', {}, [PA.statusPill(s), el('span', { class: 'ov-count', text: String(cards.length) })]), list]);
      colEl.addEventListener('dragover', e => { e.preventDefault(); colEl.classList.add('bd-col--over'); });
      colEl.addEventListener('dragleave', e => { if (!colEl.contains(e.relatedTarget)) colEl.classList.remove('bd-col--over'); });
      colEl.addEventListener('drop', async e => {
        e.preventDefault(); colEl.classList.remove('bd-col--over');
        const id = Number(e.dataTransfer.getData('text/plain')), t = byId('tasks', id);
        if (!t || t.status === s) return;
        const data = { status: s }; if (s === 'done') data.progress = 100;
        if (await PA.save('tasks', id, data)) PA.toast(`${label(t)}: ${L.status[s]}`);
        PA.render();
      });
      return colEl;
    });
    box.append(el('div', { class: 'bd' }, [
      el('div', { class: 'bd-head' }, [el('h1', { text: 'Доска' }), el('div', { class: 'pl-row' }, [phSel, el('span', { class: 'pl-hint bd-hint', text: 'Перетащите карточку в другую колонку, чтобы сменить статус' })])]),
      el('div', { class: 'bd-cols' }, cols),
    ]));
  };

  // ================= Контакты (CRM) =================
  PA.views.crm = box => {
    const u = state.ui;
    u.cq = u.cq || ''; u.ckind = u.ckind || 'all';
    const selId = state.sel?.contact;
    const q = u.cq.toLowerCase();
    const shown = state.contacts.filter(c => (u.ckind === 'all' || c.kind === u.ckind) && (!q || `${c.name} ${c.org} ${c.role} ${c.next_step} ${c.notes}`.toLowerCase().includes(q)))
      .sort((a, b) => (a.status === 'closed') - (b.status === 'closed') || (a.next_date || '9').localeCompare(b.next_date || '9'));
    const search = el('input', { class: 'fld-in pl-search', type: 'search', placeholder: 'Поиск контакта', value: u.cq, 'aria-label': 'Поиск контакта', 'data-keep': 'cq' });
    search.addEventListener('input', () => { u.cq = search.value.trim(); PA.saveUi(); PA.render(); });
    const chips = el('div', { class: 'pl-seg pl-seg--wrap', role: 'group', 'aria-label': 'Тип контакта' }, [['all', 'Все'], ...Object.entries(L.ckind)].filter(([k]) => k === 'all' || state.contacts.some(c => c.kind === k)).map(([k, t]) =>
      el('button', { type: 'button', text: t, 'aria-pressed': String(u.ckind === k), onclick: () => { u.ckind = k; PA.saveUi(); PA.render(); } })));
    const funnel = el('div', { class: 'cr-funnel' }, Object.entries(L.cstatus).map(([k, t]) => el('span', { class: `cr-f cr-f--${k}` }, [el('b', { class: 'doto', text: String(state.contacts.filter(c => c.status === k).length) }), t])));
    const list = el('ul', { class: 'cr-list' }, shown.map(c => el('li', {}, el('a', { class: `cr-item${c.id === selId ? ' cr-item--sel' : ''}`, href: '#crm/' + c.id, 'aria-current': c.id === selId ? 'true' : null }, [
      el('span', { class: 'cr-item__top' }, [el('b', { text: c.name }), el('span', { class: `cr-st cr-st--${c.status}`, text: L.cstatus[c.status] })]),
      el('span', { class: 'pl-hint', text: [L.ckind[c.kind], c.org !== c.name ? c.org : ''].filter(Boolean).join(', ') }),
      c.next_step ? el('span', { class: 'cr-next' }, [el('span', { class: c.next_date && dn(c.next_date) < today() && c.status !== 'closed' ? 'pl-late' : '', text: c.next_date ? fmt(c.next_date) : 'без даты' }), ` ${c.next_step}`]) : null,
    ]))));
    const c = selId ? byId('contacts', selId) : null;
    const detail = c ? contactCard(c) : state.sel?.newContact ? contactCard(null) : el('div', { class: 'cr-detail card cr-detail--empty' }, [
      el('h2', { text: 'Выберите контакт' }),
      el('p', { class: 'pl-hint', text: 'Здесь будут данные, следующий шаг и история общения.' }),
    ]);
    box.append(el('div', { class: `cr${c || state.sel?.newContact ? ' cr--open' : ''}` }, [
      el('div', { class: 'cr-side' }, [
        el('div', { class: 'cr-head' }, [el('h1', { text: 'Контакты' }), el('button', { type: 'button', class: 'btn btn--primary btn--sm', text: 'Новый контакт', onclick: () => { state.sel = { newContact: true }; history.replaceState(null, '', '#crm'); PA.render(); } })]),
        funnel, search, chips,
        shown.length ? list : el('p', { class: 'pl-hint', text: state.contacts.length ? 'Ничего не найдено.' : 'Контактов пока нет.' }),
      ]),
      detail,
    ]));
  };

  function contactCard(c) {
    const isNew = !c;
    c = c || { kind: 'other', status: 'new', tasks: [] };
    const f = {
      name: el('input', { class: 'fld-in', value: c.name || '', maxLength: 120, required: true }),
      org: el('input', { class: 'fld-in', value: c.org || '', maxLength: 160 }),
      role: el('input', { class: 'fld-in', value: c.role || '', maxLength: 160, placeholder: 'Чем полезен проекту' }),
      kind: PA.select(Object.entries(L.ckind), c.kind), status: PA.select(Object.entries(L.cstatus), c.status),
      email: el('input', { class: 'fld-in', type: 'email', value: c.email || '', maxLength: 160 }),
      phone: el('input', { class: 'fld-in', type: 'tel', value: c.phone || '', maxLength: 40 }),
      telegram: el('input', { class: 'fld-in', value: c.telegram || '', maxLength: 64, placeholder: '@username' }),
      url: el('input', { class: 'fld-in', type: 'url', value: c.url || '', maxLength: 300, placeholder: 'https://' }),
      next_step: el('input', { class: 'fld-in', value: c.next_step || '', maxLength: 300, placeholder: 'Что сделать дальше' }),
      next_date: el('input', { class: 'fld-in', type: 'date', value: c.next_date || '' }),
      notes: el('textarea', { class: 'fld-in', rows: 3, maxLength: 6000, value: c.notes || '' }),
    };
    let linked = [...(c.tasks || [])];
    const tBox = el('div', { class: 'pl-chips' }), tPick = el('select', { class: 'fld-in', 'aria-label': 'Привязать задачу' });
    const drawT = () => {
      tBox.replaceChildren(...linked.map(id => { const t = byId('tasks', id); return t ? el('span', { class: 'pl-chip' }, [el('button', { type: 'button', class: 'pl-chip__open', text: label(t), onclick: () => PA.openTask(id) }), el('button', { type: 'button', 'aria-label': 'Отвязать', text: '×', onclick: () => { linked = linked.filter(x => x !== id); drawT(); } })]) : null; }));
      tPick.replaceChildren(el('option', { value: '', text: 'Привязать задачу…' }), ...PA.taskOptions(null, false).filter(([v]) => !linked.includes(v)).map(([v, t]) => el('option', { value: v, text: t })));
    };
    tPick.addEventListener('change', () => { if (tPick.value) { linked.push(Number(tPick.value)); drawT(); } });
    drawT();
    const links = [
      c.email && el('a', { class: 'pl-chip pl-chip--link', href: 'mailto:' + c.email, text: 'Написать письмо' }),
      c.telegram && /^@?[A-Za-z0-9_]{4,32}$/.test(c.telegram) && el('a', { class: 'pl-chip pl-chip--link', href: 'https://t.me/' + c.telegram.replace('@', ''), target: '_blank', rel: 'noopener noreferrer', text: 'Telegram' }),
      c.phone && el('a', { class: 'pl-chip pl-chip--link', href: 'tel:' + c.phone.replace(/[^\d+]/g, ''), text: 'Позвонить' }),
      c.url && /^https?:\/\//.test(c.url) && el('a', { class: 'pl-chip pl-chip--link', href: c.url, target: '_blank', rel: 'noopener noreferrer', text: 'Сайт' }),
    ].filter(Boolean);
    const form = el('form', { class: 'pl-form' }, [
      PA.field('Имя или организация', f.name, 'pl-span2'), PA.field('Организация', f.org), PA.field('Роль', f.role),
      PA.field('Тип', f.kind), PA.field('Статус', f.status),
      PA.field('Следующий шаг', f.next_step, 'pl-span2'), PA.field('Когда', f.next_date),
      el('span'),
      PA.field('Почта', f.email), PA.field('Телефон', f.phone), PA.field('Telegram', f.telegram), PA.field('Сайт', f.url),
      el('div', { class: 'fld pl-span2' }, [el('span', { text: 'Связанные задачи' }), tBox, tPick]),
      PA.field('Заметки', f.notes, 'pl-span2'),
      el('div', { class: 'pl-drawer__foot pl-span2' }, [
        !isNew ? el('button', { type: 'button', class: 'pl-del', text: 'Удалить контакт', onclick: async () => {
          if (confirm(`Удалить «${c.name}» вместе с историей общения?`) && await PA.remove('contacts', c.id)) { state.sel = null; history.replaceState(null, '', '#crm'); PA.toast('Контакт удалён'); PA.render(); }
        } }) : el('span'),
        el('button', { type: 'submit', class: 'btn btn--primary btn--sm', text: isNew ? 'Добавить контакт' : 'Сохранить' }),
      ]),
    ]);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = Object.fromEntries(Object.entries(f).map(([k, i]) => [k, i.value || (k === 'next_date' ? null : '')]));
      data.tasks = linked;
      const rec = await PA.save('contacts', isNew ? null : c.id, data);
      if (rec) { PA.toast(isNew ? 'Контакт добавлен' : 'Сохранено'); if (isNew) location.hash = 'crm/' + rec.id; else PA.render(); }
    });

    let history_ = null;
    if (!isNew) {
      const acts = state.activities.filter(a => a.contact === c.id).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      const aType = PA.select(Object.entries(L.act), 'email'), aDate = el('input', { class: 'fld-in', type: 'date', value: todayIso() });
      const aText = el('textarea', { class: 'fld-in', rows: 2, maxLength: 4000, placeholder: 'Что обсудили, что отправили, что ответили', required: true });
      const aForm = el('form', { class: 'cr-addact' }, [aType, aDate, aText, el('button', { type: 'submit', class: 'btn btn--ghost btn--sm', text: 'Записать' })]);
      aForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (!aText.value.trim()) return aText.focus();
        if (await PA.save('activities', null, { contact: c.id, date: aDate.value, type: aType.value, text: aText.value })) {
          if (c.status === 'new' && ['email', 'message', 'call', 'meeting'].includes(aType.value)) await PA.save('contacts', c.id, { status: 'contacted' });
          PA.toast('Записано в историю'); PA.render();
        }
      });
      history_ = el('section', { class: 'cr-hist' }, [
        el('h3', { text: 'История' }), aForm,
        acts.length ? el('ol', { class: 'cr-acts' }, acts.map(a => el('li', { class: `cr-act cr-act--${a.type}` }, [
          el('div', { class: 'cr-act__m' }, [el('b', { text: L.act[a.type] }), el('span', { class: 'pl-hint', text: fmt(a.date, true) }),
            el('button', { type: 'button', class: 'pl-del', text: 'Удалить', onclick: async () => { if (confirm('Удалить запись из истории?') && await PA.remove('activities', a.id)) PA.render(); } })]),
          el('p', { text: a.text }),
        ]))) : el('p', { class: 'pl-hint', text: 'Записей пока нет. Запишите первое письмо или звонок.' }),
      ]);
    }
    return el('div', { class: 'cr-detail card' }, [
      el('div', { class: 'cr-detail__head' }, [
        el('a', { class: 'cr-back', href: '#crm', onclick: () => { state.sel = null; } , text: '‹ Все контакты' }),
        el('h2', { text: isNew ? 'Новый контакт' : c.name }),
        !isNew && c.role ? el('p', { class: 'pl-hint', text: c.role }) : null,
        links.length ? el('div', { class: 'pl-chips' }, links) : null,
      ]),
      form, history_,
    ]);
  }

  // ================= Команда =================
  PA.views.team = box => {
    const t0 = today(), wk0 = t0 - wday(t0), WEEKS = 16;
    const hol = PA.holidaySet();
    const isWork = d => wday(d) < 5 && !hol.has(d);
    const load = (pid, w) => { // часы задач человека, приходящиеся на неделю w, равномерно по рабочим дням задачи
      let h = 0;
      state.tasks.filter(t => t.assignee === pid && t.kind !== 'phase' && t.status !== 'done' && t.hours && t.start).forEach(t => {
        const s = dn(t.start), e = dn(t.end || t.start);
        let all = 0, inW = 0;
        for (let d = s; d <= e; d++) if (isWork(d)) { all++; if (d >= w && d <= w + 6) inW++; }
        if (!all && s >= w && s <= w + 6) h += t.hours; else if (all) h += t.hours * inW / all;
      });
      return h;
    };
    const cards = state.people.map(p => {
      const mine = work().filter(t => t.assignee === p.id);
      const weeks = Array.from({ length: WEEKS }, (_, i) => wk0 + i * 7);
      const vals = weeks.map(w => load(p.id, w)), cap = p.capacity || 0, max = Math.max(cap * 1.4, ...vals, 1);
      const chart = el('div', { class: 'tm-chart', role: 'img', 'aria-label': `Загрузка по неделям: ${vals.map(v => Math.round(v)).join(', ')} ч при норме ${cap} ч` }, [
        cap ? el('span', { class: 'tm-cap', style: `bottom:${cap / max * 100}%`, text: `норма ${cap} ч` }) : null,
        ...weeks.map((w, i) => { const v = vals[i], over = cap && v > cap * 1.05; return el('div', { class: 'tm-col', title: `Неделя с ${fmt(iso(w))}: ${Math.round(v)} ч` }, [
          el('i', { class: over ? 'tm-over' : '', style: `height:${v / max * 100}%` }),
          el('span', { class: 'tm-w', text: i % 2 ? '' : fmtShort(iso(w)).slice(0, 5) }),
        ]); }),
      ]);
      const f = {
        name: el('input', { class: 'fld-in', value: p.name, maxLength: 80, required: true }), role: el('input', { class: 'fld-in', value: p.role || '', maxLength: 120 }),
        capacity: el('input', { class: 'fld-in', type: 'number', min: 0, max: 80, value: p.capacity ?? 8 }), color: el('input', { class: 'fld-in tm-color', type: 'color', value: p.color || '#13223A' }),
        email: el('input', { class: 'fld-in', type: 'email', value: p.email || '', maxLength: 120 }), telegram: el('input', { class: 'fld-in', value: p.telegram || '', maxLength: 64 }),
      };
      const form = el('form', { class: 'pl-form' }, [PA.field('Имя', f.name), PA.field('Роль', f.role), PA.field('Часов в неделю', f.capacity), PA.field('Цвет', f.color), PA.field('Почта', f.email), PA.field('Telegram', f.telegram),
        el('div', { class: 'pl-drawer__foot pl-span2' }, [
          state.people.length > 1 ? el('button', { type: 'button', class: 'pl-del', text: 'Убрать из команды', onclick: async () => { if (confirm(`Убрать ${p.name}? Задачи останутся без исполнителя.`) && await PA.remove('people', p.id)) PA.render(); } }) : el('span'),
          el('button', { type: 'submit', class: 'btn btn--ghost btn--sm', text: 'Сохранить' })])]);
      form.addEventListener('submit', async e => { e.preventDefault(); if (await PA.save('people', p.id, { name: f.name.value, role: f.role.value, capacity: Number(f.capacity.value) || 0, color: f.color.value, email: f.email.value, telegram: f.telegram.value })) { PA.toast('Сохранено'); PA.render(); } });
      const open = mine.filter(t => t.status !== 'done');
      return el('section', { class: 'tm-card card' }, [
        el('div', { class: 'tm-who' }, [PA.avatar(p), el('div', {}, [el('h2', { text: p.name }), el('p', { class: 'pl-hint', text: p.role || '' })])]),
        el('dl', { class: 'tm-stats' }, [
          el('div', {}, [el('dt', { text: 'Открытых задач' }), el('dd', { class: 'doto', text: String(open.length) })]),
          el('div', {}, [el('dt', { text: 'В работе' }), el('dd', { class: 'doto', text: String(mine.filter(t => t.status === 'doing').length) })]),
          el('div', {}, [el('dt', { text: 'Просрочено' }), el('dd', { class: 'doto' + (open.some(isOverdue) ? ' pl-late' : ''), text: String(open.filter(isOverdue).length) })]),
          el('div', {}, [el('dt', { text: 'Часов до конца плана' }), el('dd', { class: 'doto', text: String(open.reduce((n, t) => n + (t.hours || 0) * (1 - (t.progress || 0) / 100), 0) | 0) })]),
        ]),
        el('h3', { text: `Загрузка на ${WEEKS} недель` }),
        el('p', { class: 'pl-hint', text: 'Оценка задачи в часах делится поровну на её рабочие дни. Красный столбец — неделя тяжелее нормы.' }),
        chart,
        el('details', { class: 'cl-details' }, [el('summary', { text: 'Изменить данные' }), form]),
      ]);
    });
    const name = el('input', { class: 'fld-in', placeholder: 'Имя', maxLength: 80, required: true }), role = el('input', { class: 'fld-in', placeholder: 'Роль в проекте', maxLength: 120 });
    const add = el('form', { class: 'tm-add card' }, [el('h2', { text: 'Добавить в команду' }), name, role, el('button', { type: 'submit', class: 'btn btn--primary btn--sm', text: 'Добавить' })]);
    add.addEventListener('submit', async e => { e.preventDefault(); const colors = ['#4A5AD6', '#7A1830', '#C9A227', '#3F7A45']; if (await PA.save('people', null, { name: name.value, role: role.value, capacity: 7, color: colors[state.people.length % colors.length] })) { PA.toast('Добавлен в команду'); PA.render(); } });
    box.append(el('div', { class: 'tm' }, [el('h1', { text: 'Команда' }), el('div', { class: 'tm-grid' }, [...cards, add])]));
  };
})();
