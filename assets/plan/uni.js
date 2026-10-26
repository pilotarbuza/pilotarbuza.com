/* pilotarbuza.com/admin/plan — «Университет»: расписание пар, что идёт сейчас, напоминания.
   Перенесено из бота Энн (uni_schedule.py); пары теперь хранятся на сервере и правятся прямо здесь. */
(() => {
  const { el, state, plural } = PA;
  const SLOTS = {
    1: ['08:30', '09:15'], 2: ['09:25', '10:10'], 3: ['10:20', '11:05'], 4: ['11:15', '12:00'], 5: ['12:10', '12:55'],
    6: ['13:25', '14:10'], 7: ['14:20', '15:05'], 8: ['15:15', '16:00'], 9: ['16:10', '16:55'], 10: ['17:00', '17:45'],
    11: ['17:50', '18:35'], 12: ['18:40', '19:25'], 13: ['19:30', '20:15'], 14: ['20:20', '21:05'], 15: ['21:10', '21:55'],
  };
  const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const MON_G = PA.MON_G;
  const mins = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  const start = l => SLOTS[l.first][0], end = l => SLOTS[l.last][1];
  const hours = l => l.last - l.first + 1;

  // Время Турции (UTC+3, без перехода на летнее) — расписание живёт в нём, где бы ни был телефон.
  const trNow = () => { const d = new Date(Date.now() + 3 * 3600e3); return { day: Math.floor(d.getTime() / 864e5), min: d.getUTCHours() * 60 + d.getUTCMinutes() }; };
  const wd = day => (new Date(day * 864e5).getUTCDay() + 6) % 7;
  const dateOf = day => { const d = new Date(day * 864e5); return `${d.getUTCDate()} ${MON_G[d.getUTCMonth()]}`; };
  // дни без пар: праздники и сессия (неделя экзаменов)
  const holiday = day => { const iso = PA.iso(day); return state.calendar.find(c => (c.kind === 'holiday' || c.kind === 'session') && c.start <= iso && c.end >= iso); };
  const examsOn = day => { const iso = PA.iso(day); return state.calendar.filter(c => c.kind === 'exam' && c.start === iso).sort((a, b) => (a.time || '').localeCompare(b.time || '')); };
  const on = (w, withOpt = true) => state.lessons.filter(l => l.weekday === w && (withOpt || !l.optional)).sort((a, b) => a.optional - b.optional || a.first - b.first);

  let settings = null, subs = 0;
  const loadSettings = async () => { const r = await PA.api('push'); if (r.ok) { const d = await r.json(); settings = d.settings; subs = d.subscriptions.length; } };
  const saveSetting = async data => {
    const r = await PA.api('push/settings', { method: 'POST', body: JSON.stringify(data) });
    if (!r.ok) return PA.toast(await PA.why(r), true);
    settings = (await r.json()).settings; PA.toast('Сохранено'); PA.render();
  };

  // ---------- карточка «сейчас» ----------
  function nowCard() {
    const { day, min } = trNow(), w = wd(day), hol = holiday(day);
    const must = hol ? [] : on(w, false);
    const cur = must.find(l => mins(start(l)) <= min && min < mins(end(l)));
    const next = must.find(l => mins(start(l)) > min);
    const card = (k, big, title, sub, extra) => el('section', { class: 'un-now dark dots' }, [
      el('div', { class: 'un-now__top' }, [el('p', { class: 'ov-k', text: k }), big ? el('b', { class: 'un-now__big doto led', text: big }) : null]),
      el('h2', { class: 'un-now__t', text: title }), sub ? el('p', { class: 'ov-sub', text: sub }) : null, extra || null,
    ]);
    const meta = l => [l.room && `ауд. ${l.room}`, l.teacher].filter(Boolean).join(' · ');
    if (cur) {
      const left = mins(end(cur)) - min, pct = Math.round((min - mins(start(cur))) / (mins(end(cur)) - mins(start(cur))) * 100);
      return card(`Сейчас идёт, до ${end(cur)}`, `${left}`, cur.course, `${meta(cur)} · ещё ${left} ${plural(left, 'минута', 'минуты', 'минут')}`,
        el('div', { class: 'ov-meter' }, el('i', { style: `width:${pct}%` })));
    }
    if (next) {
      const inMin = mins(start(next)) - min, h = Math.floor(inMin / 60), m = inMin % 60;
      return card(`Следующая пара в ${start(next)}`, h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`, next.course,
        `${meta(next)} · через ${h ? `${h} ч ${m} мин` : `${m} мин`}`);
    }
    // ближайший день с парами
    let d = day + 1;
    while (d < day + 15 && (holiday(d) || !on(wd(d), false).length)) d++;
    const nd = on(wd(d), false);
    const later = nd.length ? `${d === day + 1 ? 'Завтра' : `${DAYS[wd(d)]}, ${dateOf(d)}`} — с ${start(nd[0])}: ${nd[0].course}` : 'Ближайших пар нет';
    return card(hol ? (hol.kind === 'session' ? `Сегодня занятий нет: ${hol.title}` : `Сегодня праздник: ${hol.title}`) : must.length ? 'На сегодня пары закончились' : 'Сегодня пар нет', null, later, nd[0]?.room ? `ауд. ${nd[0].room}` : null);
  }

  // ---------- пара ----------
  function lessonCard(l, live) {
    return el('li', {}, el('button', { type: 'button', class: `un-l${l.optional ? ' un-l--opt' : ''}${live ? ' un-l--now' : ''}`, onclick: () => editLesson(l.id) }, [
      el('span', { class: 'un-l__time' }, [el('b', { text: start(l) }), el('span', { text: end(l) })]),
      el('span', { class: 'un-l__main' }, [
        el('span', { class: 'un-l__c', text: l.course }),
        el('span', { class: 'un-l__m', text: [l.room && `ауд. ${l.room}`, l.teacher, `${hours(l)} ${plural(hours(l), 'час', 'часа', 'часов')}`].filter(Boolean).join(' · ') }),
        l.note ? el('span', { class: 'un-l__n', text: l.note }) : null,
        live ? el('span', { class: 'un-tag un-tag--now', text: 'идёт сейчас' }) : null,
      ]),
    ]));
  }

  function dayView(day) {
    const w = wd(day), hol = holiday(day), { day: today, min } = trNow();
    const must = on(w, false), opt = on(w).filter(l => l.optional);
    const live = l => day === today && mins(start(l)) <= min && min < mins(end(l));
    const head = el('div', { class: 'un-dh' }, [el('h2', { text: `${DAYS[w]}, ${dateOf(day)}` }),
      must.length ? el('span', { class: 'pl-hint', text: `пары с ${start(must[0])} до ${must.map(end).sort().pop()}` }) : null]);
    if (hol && hol.kind === 'session') {
      const ex = examsOn(day);
      return el('div', { class: 'un-day' }, [el('div', { class: 'un-dh' }, [el('h2', { text: `${DAYS[w]}, ${dateOf(day)}` })]),
        el('p', { class: 'un-hol', text: `${hol.title}: занятий нет.` }),
        ex.length ? el('ul', { class: 'un-list' }, ex.map(c => el('li', {}, el('div', { class: 'un-l un-l--exam' }, [
          el('span', { class: 'un-l__time' }, [el('b', { text: c.time || '' })]),
          el('span', { class: 'un-l__main' }, [el('span', { class: 'un-l__c', text: c.title.replace(/^Vize · /, '') }), el('span', { class: 'un-l__m', text: ['экзамен', c.room ? 'ауд. ' + c.room : null].filter(Boolean).join(' · ') }),
            c.notes && /хвост|уточнить/.test(c.notes) ? el('span', { class: 'un-l__n', text: c.notes.replace(/^Ara sınav \(vize\), осень 2026–2027\.\s*/, '') }) : null]),
        ])))) : el('p', { class: 'pl-hint', text: 'Экзаменов в этот день нет.' })]);
    }
    if (!must.length && !opt.length) return el('div', { class: 'un-day' }, [head, el('p', { class: 'un-empty', text: 'Пар нет' })]);
    return el('div', { class: 'un-day' }, [
      head,
      hol ? el('p', { class: 'un-hol', text: `Праздник: ${hol.title}. Напоминаний в этот день не будет.` }) : null,
      must.length ? el('ul', { class: 'un-list' }, must.map(l => lessonCard(l, live(l)))) : el('p', { class: 'pl-hint', text: 'Обязательных пар нет.' }),
      opt.length ? el('h3', { class: 'un-sub', text: 'Можно не ходить' }) : null,
      opt.length ? el('ul', { class: 'un-list' }, opt.map(l => lessonCard(l, live(l)))) : null,
    ]);
  }

  function weekView(monday) {
    const maxSlot = Math.max(9, ...state.lessons.map(l => l.last));
    const { day: today } = trNow();
    if (window.matchMedia('(max-width: 860px)').matches) {  // на телефоне — списком по дням
      return el('div', { class: 'un-wlist' }, [0, 1, 2, 3, 4].map(i => {
        const ls = on(i);
        return el('section', { class: `un-wd${monday + i === today ? ' un-wd--today' : ''}` }, [
          el('h3', { text: `${DAYS[i]}, ${dateOf(monday + i)}` }),
          ls.length ? el('ul', {}, ls.map(l => el('li', {}, el('button', { type: 'button', class: l.optional ? 'un-wl un-wl--opt' : 'un-wl', onclick: () => editLesson(l.id) }, [
            el('b', { text: `${start(l)}–${end(l)}` }), el('span', { text: l.course }), el('span', { class: 'pl-hint', text: l.room ? `ауд. ${l.room}` : '' }),
          ])))) : el('p', { class: 'pl-hint', text: 'пар нет' }),
        ]);
      }));
    }
    const cells = [el('div', { class: 'un-g__corner' })];
    [0, 1, 2, 3, 4].forEach(i => cells.push(el('div', { class: `un-g__dh${monday + i === today ? ' un-g__dh--today' : ''}`, style: `grid-column:${i + 2}` }, [el('b', { text: SHORT[i] }), ` ${dateOf(monday + i)}`])));
    for (let s = 1; s <= maxSlot; s++) {
      cells.push(el('div', { class: 'un-g__slot', style: `grid-row:${s + 1}` }, [el('b', { text: String(s) }), el('span', { text: SLOTS[s][0] })]));
      [0, 1, 2, 3, 4].forEach(i => cells.push(el('div', { class: 'un-g__cell', style: `grid-row:${s + 1};grid-column:${i + 2}` })));
    }
    // пересекающиеся пары (обязательная и «можно не ходить») делят ячейку пополам
    [0, 1, 2, 3, 4].forEach(i => {
      const ls = on(i);
      ls.forEach(l => {
        const clash = ls.filter(o => o !== l && o.first <= l.last && o.last >= l.first);
        const half = clash.length ? (l.optional ? ' un-g__l--right' : ' un-g__l--left') : '';
        cells.push(el('button', { type: 'button', class: `un-g__l${l.optional ? ' un-g__l--opt' : ''}${half}`, style: `grid-row:${l.first + 1} / ${l.last + 2};grid-column:${i + 2}`, onclick: () => editLesson(l.id), title: `${l.course}, ${start(l)}–${end(l)}` }, [
          el('b', { text: l.course }), el('span', { text: `${start(l)}–${end(l)}${l.room ? ` · ${l.room}` : ''}` }),
        ]));
      });
    });
    return el('div', { class: 'un-g', style: `grid-template-rows:auto repeat(${maxSlot}, 44px)` }, cells);
  }

  // ---------- редактор пары ----------
  function editLesson(id, preset = {}) {
    const l = id ? { ...state.lessons.find(x => x.id === id) } : { weekday: 0, first: 1, last: 2, optional: false, ...preset };
    const slotOpts = (which) => Object.entries(SLOTS).map(([n, t]) => [n, `${n} пара · ${which === 'first' ? t[0] : t[1]}`]);
    const f = {
      course: el('input', { class: 'fld-in', value: l.course || '', maxLength: 160, required: true, placeholder: 'Например, Termodinamik-1' }),
      weekday: PA.select(DAYS.slice(0, 6).map((d, i) => [i, d]), l.weekday),
      first: PA.select(slotOpts('first'), l.first), last: PA.select(slotOpts('last'), l.last),
      room: el('input', { class: 'fld-in', value: l.room || '', maxLength: 60, placeholder: '312 или Bilmer-Lab-1' }),
      teacher: el('input', { class: 'fld-in', value: l.teacher || '', maxLength: 120, list: 'un-teachers' }),
      note: el('input', { class: 'fld-in', value: l.note || '', maxLength: 300 }),
      optional: el('input', { type: 'checkbox', checked: !!l.optional }),
    };
    const teachers = el('datalist', { id: 'un-teachers' }, [...new Set(state.lessons.map(x => x.teacher).filter(Boolean))].sort().map(t => el('option', { value: t })));
    const msg = el('p', { class: 'pl-msg', role: 'alert' });
    const form = el('form', { class: 'pl-form' }, [
      el('div', { class: 'pl-drawer__head' }, [el('h2', { id: 'drawer-title', text: id ? 'Пара' : 'Новая пара' }), el('button', { type: 'button', class: 'pl-ico', 'aria-label': 'Закрыть', onclick: PA.closeDrawer }, el('span', { 'aria-hidden': 'true', text: '×' }))]),
      PA.field('Предмет', f.course, 'pl-span2'), PA.field('День', f.weekday, 'pl-span2'),
      PA.field('С', f.first), PA.field('По', f.last),
      PA.field('Аудитория', f.room), PA.field('Преподаватель', f.teacher), teachers,
      PA.field('Заметка', f.note, 'pl-span2'),
      el('label', { class: 'pl-check pl-span2' }, [f.optional, 'Можно не ходить — не считается началом дня и не попадает в напоминания']),
      msg,
      el('div', { class: 'pl-drawer__foot pl-span2' }, [
        id ? el('button', { type: 'button', class: 'pl-del', text: 'Удалить пару', onclick: async () => { if (confirm(`Удалить «${l.course}» (${DAYS[l.weekday].toLowerCase()})?`) && await PA.remove('lessons', id)) { PA.closeDrawer(); PA.toast('Пара удалена'); PA.render(); } } }) : el('span'),
        el('div', { class: 'pl-row' }, [el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Отмена', onclick: PA.closeDrawer }), el('button', { type: 'submit', class: 'btn btn--primary btn--sm', text: id ? 'Сохранить' : 'Добавить' })]),
      ]),
    ]);
    f.first.addEventListener('change', () => { if (Number(f.last.value) < Number(f.first.value)) f.last.value = f.first.value; });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (Number(f.last.value) < Number(f.first.value)) { msg.textContent = 'Последняя пара раньше первой.'; return; }
      const data = { course: f.course.value, weekday: Number(f.weekday.value), first: Number(f.first.value), last: Number(f.last.value), room: f.room.value, teacher: f.teacher.value, note: f.note.value, optional: f.optional.checked };
      if (await PA.save('lessons', id, data)) { PA.closeDrawer(); PA.toast(id ? 'Сохранено' : 'Пара добавлена'); PA.render(); }
    });
    PA.drawer.replaceChildren(form);
    PA.drawer.showModal();
  }

  // ---------- напоминания ----------
  function remindCard() {
    if (!settings) return el('section', { class: 'nt-card card' }, el('p', { class: 'pl-hint', text: 'Загружаю настройки…' }));
    const s = settings;
    const sw = (key, label) => { const i = el('input', { type: 'checkbox', class: 'nt-switch', role: 'switch', checked: s[key], 'aria-label': label }); i.addEventListener('change', () => saveSetting({ [key]: i.checked })); return i; };
    const time = key => { const i = el('input', { class: 'fld-in nt-time', type: 'time', value: s[key], step: 300 }); i.addEventListener('change', () => { if (i.value) saveSetting({ [key]: i.value.slice(0, 5) }); }); return i; };
    const before = PA.select([5, 10, 15, 20, 30, 45, 60].map(n => [n, `за ${n} мин`]), s.uni_before_min, { class: 'fld-in nt-time' });
    before.addEventListener('change', () => saveSetting({ uni_before_min: Number(before.value) }));
    const opt = (key, title, hint, ctrl) => el('div', { class: 'nt-opt' }, [el('label', { class: 'nt-opt__t' }, [sw(key, title), el('span', {}, [el('b', { text: title }), el('span', { class: 'pl-hint', text: hint })])]), ctrl]);
    // свёрнуто в одну строку со сводкой; раскрытие запоминается, чтобы не схлопывалось после сохранения
    const summary = s.uni_paused ? 'на паузе' : [s.uni_morning_on ? `утром ${s.uni_morning_time}` : null, s.uni_before_on ? `за ${s.uni_before_min} мин` : null, s.uni_evening_on ? `вечером ${s.uni_evening_time}` : null].filter(Boolean).join(' · ') || 'выключены';
    const box = el('details', { class: 'nt-card card un-remind', open: !!state.ui.uniRemindOpen }, [
      el('summary', {}, [el('span', {}, [el('h2', { text: 'Напоминания о парах' }), el('span', { class: 'pl-hint', text: summary })]), el('i', { class: 'un-remind__chev', 'aria-hidden': 'true' })]),
      el('div', { class: 'nt-opt' }, [el('label', { class: 'nt-opt__t' }, [sw('uni_paused', 'Пауза'), el('span', {}, [el('b', { text: 'Пауза на каникулы и сессию' }), el('span', { class: 'pl-hint', text: s.uni_paused ? 'Сейчас напоминания не приходят' : 'Включите, когда пар нет' })])])]),
      opt('uni_morning_on', 'Утром — пары на сегодня', 'Только в дни, когда есть обязательные пары', time('uni_morning_time')),
      opt('uni_before_on', 'Перед первой парой', 'Предмет, аудитория и преподаватель', before),
      opt('uni_evening_on', 'Вечером — пары на завтра', 'Во сколько первая пара и до скольки', time('uni_evening_time')),
      el('p', { class: 'pl-hint', text: subs ? `Приходят на ${subs} ${plural(subs, 'устройство', 'устройства', 'устройств')}. В праздники и сессию из календаря не приходят.` : 'Пока ни одно устройство не подписано.' }),
      subs ? null : el('a', { class: 'btn btn--ghost btn--sm', href: '#notify', text: 'Включить уведомления' }),
    ]);
    box.addEventListener('toggle', () => { state.ui.uniRemindOpen = box.open; PA.saveUi(); });
    return box;
  }

  // ---------- раздел ----------
  PA.views.uni = box => {
    const u = state.ui, { day: today } = trNow();
    u.uniView = u.uniView || 'today';
    const monday = today - wd(today) + (wd(today) >= 5 ? 7 : 0);  // в выходные — уже следующая неделя
    const seg = el('div', { class: 'pl-seg', role: 'group', 'aria-label': 'Что показать' }, [['today', 'Сегодня'], ['tomorrow', 'Завтра'], ['week', 'Неделя']].map(([k, t]) =>
      el('button', { type: 'button', text: t, 'aria-pressed': String(u.uniView === k), onclick: () => { u.uniView = k; PA.saveUi(); PA.render(); } })));
    const chips = el('div', { class: 'pl-seg', role: 'group', 'aria-label': 'День недели' }, [0, 1, 2, 3, 4].map(i =>
      el('button', { type: 'button', text: SHORT[i], 'aria-pressed': String(u.uniView === 'd' + i), onclick: () => { u.uniView = 'd' + i; PA.saveUi(); PA.render(); } })));
    let body;
    if (u.uniView === 'week') body = weekView(monday);
    else if (u.uniView === 'tomorrow') body = dayView(today + 1);
    else if (/^d\d$/.test(u.uniView)) body = dayView(monday + Number(u.uniView[1]));
    else body = dayView(today);

    const tmap = {};
    state.lessons.forEach(l => { if (l.teacher) (tmap[l.teacher] = tmap[l.teacher] || new Set()).add(l.course); });
    const teachers = el('details', { class: 'un-teach card' }, [
      el('summary', {}, [el('h2', { text: 'Преподаватели' }), el('span', { class: 'td-n', text: String(Object.keys(tmap).length) })]),
      el('ul', {}, Object.entries(tmap).sort().map(([t, cs]) => el('li', {}, [el('b', { text: t }), el('span', { class: 'pl-hint', text: [...cs].join(', ') })]))),
    ]);

    box.append(el('div', { class: 'un' }, [
      el('header', { class: 'un-head' }, [
        el('div', {}, [el('h1', { text: 'Университет' }), el('p', { class: 'pl-hint', text: 'Selçuk Üniversitesi · Teknoloji Fakültesi · Makine Mühendisliği, 2 курс' })]),
        el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Добавить пару', onclick: () => editLesson(null, { weekday: Math.min(wd(today), 4) }) }),
      ]),
      state.lessons.length ? nowCard() : PA.empty('Расписания пока нет.', el('button', { type: 'button', class: 'btn btn--primary btn--sm', text: 'Добавить первую пару', onclick: () => editLesson(null) })),
      settings && settings.uni_paused ? el('p', { class: 'un-hol', text: 'Напоминания о парах на паузе.' }) : null,
      el('div', { class: 'un-tools' }, [seg, chips]),
      body,
      el('div', { class: 'un-cols' }, [remindCard(), teachers]),
    ]));
    if (!settings) loadSettings().then(() => { if (state.view === 'uni') PA.render(); }).catch(() => {});
  };
})();
