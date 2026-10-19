/* pilotarbuza.com/admin/plan — общее: данные, запросы к server/crm.py, даты, редактор задачи.
   Всё, что пришло с сервера, попадает на страницу только как текст (textContent). */
window.PA = (() => {
  const $ = s => document.querySelector(s);
  const L = {
    status: { todo: 'Не начата', doing: 'В работе', review: 'На проверке', blocked: 'Заблокирована', done: 'Готово' },
    priority: { low: 'Низкий', normal: 'Обычный', high: 'Высокий', critical: 'Критичный' },
    kind: { phase: 'Этап', task: 'Задача', milestone: 'Веха', test: 'Испытание' },
    ckind: { regulator: 'Регулятор', university: 'Университет', competition: 'Конкурс', supplier: 'Поставщик', sponsor: 'Финансирование', team: 'Команда', other: 'Другое' },
    cstatus: { new: 'Новый', contacted: 'Написали', waiting: 'Ждём ответ', active: 'В работе', closed: 'Закрыт' },
    act: { email: 'Письмо', call: 'Звонок', meeting: 'Встреча', message: 'Сообщение', note: 'Заметка' },
    cal: { session: 'Сессия', holiday: 'Праздник', vacation: 'Каникулы', event: 'Событие', deadline: 'Дедлайн' },
  };
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MON_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const MON_N = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

  const state = { people: [], projects: [], tasks: [], contacts: [], activities: [], calendar: [], lessons: [], view: 'overview', ui: {} };
  try { state.ui = JSON.parse(localStorage.getItem('pa-plan-ui') || '{}') || {}; } catch (e) { state.ui = {}; }
  const saveUi = () => { try { localStorage.setItem('pa-plan-ui', JSON.stringify(state.ui)); } catch (e) { /* без памяти браузера тоже работает */ } };

  // ---------- DOM ----------
  const el = (tag, props = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'style') n.style.cssText = v;
      else if (k === 'value') n.value = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k in n && typeof v !== 'string') n[k] = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    [].concat(kids).forEach(c => { if (c !== null && c !== undefined && c !== false) n.append(c); });
    return n;
  };

  // ---------- даты: целые номера дней в UTC, без сдвигов часовых поясов ----------
  const dn = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
  const iso = n => new Date(n * 864e5).toISOString().slice(0, 10);
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const today = () => dn(todayIso());
  const wday = n => (new Date(n * 864e5).getUTCDay() + 6) % 7; // 0 = понедельник
  const parts = n => { const d = new Date(n * 864e5); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; };
  const fmt = (isoStr, withYear = false) => {
    if (!isoStr) return '—';
    const p = parts(dn(isoStr));
    return `${p.d} ${MON[p.m]}${withYear ? ' ' + p.y : ''}`;
  };
  const fmtShort = isoStr => { if (!isoStr) return '—'; const p = parts(dn(isoStr)); return `${String(p.d).padStart(2, '0')}.${String(p.m + 1).padStart(2, '0')}.${String(p.y).slice(2)}`; };
  const range = t => {
    if (!t.start) return 'без дат';
    if (!t.end || t.start === t.end) return fmt(t.start, true);
    return `${fmt(t.start, parts(dn(t.start)).y !== parts(dn(t.end)).y)} — ${fmt(t.end, true)}`;
  };
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
  const days = n => `${n} ${plural(n, 'день', 'дня', 'дней')}`;

  // нерабочие дни: выходные, праздники; сессия и каникулы — рабочие, но с другим темпом
  const holidaySet = () => {
    const s = new Set();
    state.calendar.filter(c => c.kind === 'holiday').forEach(c => { for (let i = dn(c.start); i <= dn(c.end); i++) s.add(i); });
    return s;
  };
  const workdays = (a, b) => { const h = holidaySet(); let n = 0; for (let i = dn(a); i <= dn(b); i++) if (wday(i) < 5 && !h.has(i)) n++; return n; };

  // ---------- задачи ----------
  const byId = (kind, id) => state[kind].find(x => x.id === id);
  const children = id => state.tasks.filter(t => (t.parent || null) === id).sort((a, b) => (a.order || 0) - (b.order || 0) || (a.start || '').localeCompare(b.start || ''));
  const descendants = id => { const out = []; const walk = p => children(p).forEach(c => { out.push(c); walk(c.id); }); walk(id); return out; };
  const isOverdue = t => t.status !== 'done' && t.end && dn(t.end) < today();
  const person = id => byId('people', id);
  const initials = p => (p ? p.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?');
  const phaseOf = t => { let p = t; while (p && p.parent) p = byId('tasks', p.parent); return p; };
  const label = t => (t.code && !t.title.startsWith(t.code) && t.kind !== 'phase' ? `${t.code} ${t.title}` : t.title);
  // готовность этапа: по часам задач внутри, вехи и пустые задачи считаются за 1 ч
  const rollup = id => {
    const items = descendants(id).filter(t => t.kind !== 'phase');
    if (!items.length) return null;
    let all = 0, done = 0;
    items.forEach(t => { const w = Math.max(1, t.hours || 0); all += w; done += w * (t.status === 'done' ? 1 : (t.progress || 0) / 100); });
    return Math.round(done / all * 100);
  };

  // ---------- сеть ----------
  let onAuthLost = () => {};
  const api = async (path, opts = {}) => {
    const r = await fetch('/api/admin/' + path, { credentials: 'same-origin', ...opts, headers: opts.body ? { 'Content-Type': 'application/json' } : {} });
    if (r.status === 401 && path !== 'login') { onAuthLost(); throw new Error('auth'); }
    return r;
  };
  // action — необязательная кнопка в сообщении: { label: 'Вернуть', fn }
  const toast = (text, bad = false, action = null) => {
    const t = $('#toast'), btn = $('#toast-act');
    $('#toast-text').textContent = text; t.classList.toggle('pl-toast--bad', bad); t.classList.add('pl-toast--on');
    btn.hidden = !action;
    btn.onclick = action ? () => { t.classList.remove('pl-toast--on'); action.fn(); } : null;
    if (action) btn.textContent = action.label;
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('pl-toast--on'), bad ? 5000 : action ? 6000 : 2600);
  };
  const FIELD = { title: 'название', name: 'имя', start: 'начало', end: 'конец', parent: 'этап', date: 'дата', text: 'текст', contact: 'контакт', email: 'почта', color: 'цвет' };
  const why = async r => {
    let d = {};
    try { d = await r.json(); } catch (e) { /* не JSON */ }
    if (r.status === 404 && !d.error) return 'Сервер не знает этот адрес — перезапустите службу заказов';
    if (d.error === 'fields') return 'Проверьте поля: ' + d.fields.map(f => FIELD[f] || f).join(', ');
    if (d.error === 'not found') return 'Запись уже удалена — обновите страницу';
    return 'Не удалось сохранить';
  };
  const apply = rec => { const kind = rec._kind; delete rec._kind; const list = state[kind]; const i = list.findIndex(x => x.id === rec.id); if (i >= 0) list[i] = rec; else list.push(rec); };
  const save = async (kind, id, data) => {
    const r = await api(id ? `crm/${kind}/${id}` : `crm/${kind}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) });
    if (!r.ok) { toast(await why(r), true); return null; }
    const rec = await r.json(); rec._kind = kind; apply(rec); return rec;
  };
  const remove = async (kind, id) => {
    const r = await api(`crm/${kind}/${id}`, { method: 'DELETE' });
    if (!r.ok) { toast(await why(r), true); return false; }
    const { deleted } = await r.json();
    dropIds(deleted); return true;
  };
  const dropIds = ids => {
    const gone = new Set(ids);
    for (const k of ['people', 'projects', 'tasks', 'contacts', 'activities', 'calendar', 'lessons']) state[k] = state[k].filter(x => !gone.has(x.id));
    state.tasks.forEach(t => { t.deps = (t.deps || []).filter(d => !gone.has(d)); if (gone.has(t.parent)) t.parent = null; if (gone.has(t.assignee)) t.assignee = null; });
    state.contacts.forEach(c => { c.tasks = (c.tasks || []).filter(d => !gone.has(d)); });
  };
  const batch = async ops => {
    const r = await api('crm/batch', { method: 'POST', body: JSON.stringify({ ops }) });
    if (!r.ok) { toast(await why(r), true); return false; }
    const { results } = await r.json();
    results.forEach((res, i) => { if (res.deleted) dropIds(res.deleted); else { res._kind = ops[i].kind; apply(res); } });
    return true;
  };
  const load = async () => {
    const r = await api('crm');
    if (!r.ok) throw new Error(await why(r));
    const d = await r.json();
    for (const k of ['people', 'projects', 'tasks', 'contacts', 'activities', 'calendar', 'lessons']) state[k] = d[k] || [];
  };

  // ---------- общий рендер ----------
  const views = {};
  const render = () => {
    const v = views[state.view] || views.overview;
    const box = $('#view');
    const ae = document.activeElement, keep = ae && ae.dataset && ae.dataset.keep, caret = keep && ae.selectionStart;
    box.replaceChildren();
    box.dataset.view = state.view;
    v(box);
    if (keep) { const n = box.querySelector(`[data-keep="${keep}"]`); if (n) { n.focus(); try { n.setSelectionRange(caret, caret); } catch (e) { /* не текстовое поле */ } } }
    document.querySelectorAll('#tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.view === state.view ? 'page' : 'false'));
  };

  // ---------- мелкие элементы ----------
  const statusPill = (s, small) => el('span', { class: `pl-st pl-st--${s}${small ? ' pl-st--sm' : ''}`, text: L.status[s] || s });
  const avatar = p => { const a = el('span', { class: 'pl-ava', title: p ? p.name : 'Не назначено', text: initials(p) }); if (p && p.color) a.style.setProperty('--c', p.color); if (!p) a.classList.add('pl-ava--none'); return a; };
  const select = (opts, value, props = {}) => el('select', { class: 'fld-in', ...props }, opts.map(([v, t]) => el('option', { value: v, text: t, selected: String(v) === String(value ?? '') })));
  const field = (labelText, input, extra) => el('label', { class: 'fld' + (extra ? ' ' + extra : '') }, [el('span', { text: labelText }), input]);
  const empty = (text, action) => el('div', { class: 'pl-empty' }, [el('p', { text }), action || null]);
  const taskOptions = (excludeId, phasesOnly) => {
    const out = [];
    const walk = (pid, depth) => children(pid).forEach(t => {
      if (t.id === excludeId) return;
      if (!phasesOnly || t.kind === 'phase') out.push([t.id, ' '.repeat(depth * 2) + label(t)]);
      if (t.kind === 'phase' || children(t.id).length) walk(t.id, depth + 1);
    });
    walk(null, 0);
    return out;
  };

  // ---------- редактор задачи ----------
  const drawer = $('#drawer');
  const closeDrawer = () => { if (drawer.open) drawer.close(); };
  drawer.addEventListener('click', e => { if (e.target === drawer) closeDrawer(); });

  function openTask(id, preset = {}) {
    const t = id ? { ...byId('tasks', id) } : { kind: 'task', status: 'todo', priority: 'normal', progress: 0, deps: [], assignee: state.people[0]?.id || null, project: state.projects[0]?.id || null, start: todayIso(), end: iso(today() + 6), ...preset };
    if (!t.title && id) return;
    const f = {};
    f.title = el('input', { class: 'fld-in', value: t.title || '', required: true, maxLength: 200, placeholder: 'Что нужно сделать' });
    f.kind = select(Object.entries(L.kind), t.kind);
    f.code = el('input', { class: 'fld-in', value: t.code || '', maxLength: 24, placeholder: '1.3 или T-05' });
    f.parent = select([['', 'Без этапа (верхний уровень)'], ...taskOptions(t.id, false)], t.parent);
    f.status = select(Object.entries(L.status), t.status);
    f.priority = select(Object.entries(L.priority), t.priority);
    f.assignee = select([['', 'Не назначено'], ...state.people.map(p => [p.id, p.name])], t.assignee);
    f.start = el('input', { class: 'fld-in', type: 'date', value: t.start || '' });
    f.end = el('input', { class: 'fld-in', type: 'date', value: t.end || '' });
    f.hours = el('input', { class: 'fld-in', type: 'number', min: 0, max: 5000, value: t.hours || 0 });
    f.progress = el('input', { type: 'range', min: 0, max: 100, step: 5, value: t.progress || 0, class: 'pl-range' });
    const progOut = el('output', { class: 'pl-range__out', text: (t.progress || 0) + '%' });
    f.progress.addEventListener('input', () => { progOut.textContent = f.progress.value + '%'; });
    f.criteria = el('textarea', { class: 'fld-in', rows: 2, maxLength: 1500, value: t.criteria || '', placeholder: 'Когда задача считается выполненной' });
    f.notes = el('textarea', { class: 'fld-in', rows: 4, maxLength: 6000, value: t.notes || '' });
    const span = el('p', { class: 'pl-hint' });
    const upd = () => {
      const k = f.kind.value;
      if (k === 'milestone' && f.start.value) f.end.value = f.start.value;
      f.end.disabled = k === 'milestone';
      span.textContent = f.start.value && f.end.value && f.end.value >= f.start.value
        ? `${days(dn(f.end.value) - dn(f.start.value) + 1)}, из них рабочих ${workdays(f.start.value, f.end.value)}` : 'Конец раньше начала';
    };
    [f.kind, f.start, f.end].forEach(i => i.addEventListener('change', upd));
    f.status.addEventListener('change', () => { if (f.status.value === 'done') { f.progress.value = 100; progOut.textContent = '100%'; } });

    // зависимости: чипы + поиск
    let deps = [...(t.deps || [])];
    const depBox = el('div', { class: 'pl-chips' });
    const depPick = el('select', { class: 'fld-in', 'aria-label': 'Добавить предшественника' });
    const drawDeps = () => {
      depBox.replaceChildren(...deps.map(d => { const x = byId('tasks', d); return x ? el('span', { class: 'pl-chip' }, [label(x), el('button', { type: 'button', 'aria-label': 'Убрать', text: '×', onclick: () => { deps = deps.filter(y => y !== d); drawDeps(); } })]) : null; }));
      depPick.replaceChildren(el('option', { value: '', text: deps.length ? 'Добавить ещё…' : 'Добавить предшественника…' }),
        ...taskOptions(t.id, false).filter(([v]) => !deps.includes(v)).map(([v, txt]) => el('option', { value: v, text: txt })));
    };
    depPick.addEventListener('change', () => { if (depPick.value) { deps.push(Number(depPick.value)); drawDeps(); } });
    drawDeps();

    const linked = id ? state.contacts.filter(c => (c.tasks || []).includes(id)) : [];
    const kids = id ? children(id) : [];
    const msg = el('p', { class: 'pl-msg', role: 'alert' });
    const form = el('form', { class: 'pl-form', method: 'dialog' }, [
      el('div', { class: 'pl-drawer__head' }, [
        el('h2', { id: 'drawer-title', text: id ? 'Задача' : 'Новая задача' }),
        el('button', { type: 'button', class: 'pl-ico', 'aria-label': 'Закрыть', onclick: closeDrawer }, el('span', { 'aria-hidden': 'true', text: '×' })),
      ]),
      field('Название', f.title, 'pl-span2'),
      field('Тип', f.kind), field('Код', f.code),
      field('Входит в', f.parent, 'pl-span2'),
      field('Статус', f.status), field('Приоритет', f.priority),
      field('Исполнитель', f.assignee), field('Оценка, ч', f.hours),
      field('Начало', f.start), field('Конец', f.end),
      el('div', { class: 'pl-span2' }, span),
      el('div', { class: 'fld pl-span2' }, [el('span', { text: 'Готовность' }), el('div', { class: 'pl-range__row' }, [f.progress, progOut])]),
      el('div', { class: 'fld pl-span2' }, [el('span', { text: 'Начать после' }), depBox, depPick]),
      field('Критерий выполнения', f.criteria, 'pl-span2'),
      field('Заметки', f.notes, 'pl-span2'),
      linked.length ? el('div', { class: 'fld pl-span2' }, [el('span', { text: 'Контакты' }), el('div', { class: 'pl-chips' }, linked.map(c => el('a', { class: 'pl-chip pl-chip--link', href: '#crm/' + c.id, onclick: closeDrawer, text: c.name })))]) : null,
      kids.length ? el('p', { class: 'pl-hint pl-span2', text: `Внутри ${kids.length} ${plural(kids.length, 'задача', 'задачи', 'задач')}${t.kind === 'phase' ? `, готовность этапа ${rollup(id) ?? 0}%` : ''}.` }) : null,
      msg,
      el('div', { class: 'pl-drawer__foot pl-span2' }, [
        id ? el('button', { type: 'button', class: 'pl-del', text: 'Удалить', onclick: async () => {
          const n = descendants(id).length;
          if (!confirm(n ? `Удалить «${t.title}» и ещё ${n} ${plural(n, 'задачу', 'задачи', 'задач')} внутри?` : `Удалить «${t.title}»?`)) return;
          if (await remove('tasks', id)) { closeDrawer(); toast('Задача удалена'); render(); }
        } }) : el('span'),
        el('div', { class: 'pl-row' }, [
          el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Отмена', onclick: closeDrawer }),
          el('button', { type: 'submit', class: 'btn btn--primary btn--sm', text: id ? 'Сохранить' : 'Создать' }),
        ]),
      ]),
    ]);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = {
        title: f.title.value, kind: f.kind.value, code: f.code.value, parent: f.parent.value ? Number(f.parent.value) : null,
        status: f.status.value, priority: f.priority.value, assignee: f.assignee.value ? Number(f.assignee.value) : null,
        start: f.start.value || null, end: (f.kind.value === 'milestone' ? f.start.value : f.end.value) || null,
        hours: Number(f.hours.value) || 0, progress: f.status.value === 'done' ? 100 : Number(f.progress.value), deps,
        criteria: f.criteria.value, notes: f.notes.value,
      };
      if (!id) data.project = t.project;
      if (!id) { const sib = children(data.parent); data.order = (sib.length ? Math.max(...sib.map(x => x.order || 0)) : 0) + 10; }
      if (!data.title.trim()) { msg.textContent = 'Напишите название.'; f.title.focus(); return; }
      if (data.start && data.end && data.end < data.start) { msg.textContent = 'Конец раньше начала.'; return; }
      const rec = await save('tasks', id, data);
      if (rec) { closeDrawer(); toast(id ? 'Сохранено' : 'Задача создана'); render(); }
    });
    upd();
    drawer.replaceChildren(form);
    drawer.showModal();
    if (!id) f.title.focus();
  }

  return { $, el, L, MONTHS, MON_G, MON, MON_N, WD, state, saveUi, dn, iso, today, todayIso, wday, parts, fmt, fmtShort, range, plural, days, workdays, holidaySet,
    byId, children, descendants, isOverdue, person, initials, phaseOf, label, rollup, api, toast, why, save, remove, batch, load, views, render,
    statusPill, avatar, select, field, empty, taskOptions, openTask, closeDrawer, drawer, setAuthLost: f => { onAuthLost = f; } };
})();
