/* pilotarbuza.com/me — «Страны», по образцу Country Tracker: неделя с флагами, календарь, Шенген 90/180, дни без данных,
   сводка по годам, карта, страница страны с поездками. Сверх него: свои правила и лимиты (налоговое резидентство РФ и т.п.),
   планировщик поездок, импорт из фото галереи и CSV, экспорт, автоотслеживание через «Быстрые команды».
   Адреса: #countries, /cal/2026-10, /c/TR, /rules, /rule/<id>, /gaps, /setup, /import, /trips. */
(() => {
  const { el, icon, state, screen, navBtn, group, row, toggle, sheet, closeSheet, menu, ask, toast, go, flag, cname, plural, days, dn, iso, today, todayIso, wday, parts, MONTHS, MON_G, MON, WD, fmt, fmtShort, post, save, remove } = ME;
  const SRC = { auto: 'автоматически', photo: 'по фото', manual: 'вручную', import: 'импорт' };

  // ---------- расчёты ----------
  const dmap = () => ME.days2map();
  const has = (m, n, cs) => (m.get(iso(n)) || []).some(x => cs.has(x.c));
  const yearRange = y => (y === 'last12' ? [today() - 364, today()] : [dn(`${y}-01-01`), Math.min(dn(`${y}-12-31`), today())]);
  const yearLabel = y => (y === 'last12' ? 'Последние 12 месяцев' : String(y));
  function counts(m, [a, b]) {
    const out = {};
    for (let n = a; n <= b; n++) (m.get(iso(n)) || []).forEach(x => { out[x.c] = (out[x.c] || 0) + 1; });
    return out;
  }
  function noData(m, [a, b]) {
    let n = 0;
    for (let d = a; d <= b; d++) if (!m.has(iso(d))) n++;
    return n;
  }
  function gaps(m, [a, b]) {
    const out = []; let s = null;
    for (let d = a; d <= b + 1; d++) {
      const empty = d <= b && !m.has(iso(d));
      if (empty && s === null) s = d;
      if (!empty && s !== null) { out.push([s, d - 1]); s = null; }
    }
    return out.reverse();
  }
  const neighbor = (m, n, step) => { for (let i = 1; i < 400; i++) { const x = m.get(iso(n + step * i)); if (x) return x.map(y => y.c); } return []; };
  function visits(m, cc) {
    const ds = state.days.filter(d => d[1] === cc).map(d => dn(d[0])).sort((a, b) => a - b);
    const out = [];
    ds.forEach(n => { const last = out[out.length - 1]; if (last && n === last[1] + 1) last[1] = n; else out.push([n, n]); });
    return out.reverse();
  }
  // правило: сколько дней набрано на дату end (по умолчанию сегодня); extra — запланированные дни (Set номеров)
  function usage(rule, m, end = today(), extra = null) {
    const cs = new Set(rule.countries || []);
    let start;
    if (rule.mode === 'year') start = dn(`${parts(end).y}-01-01`);
    else if (rule.mode === 'since' && rule.since) start = dn(rule.since);
    else start = end - (rule.window || 180) + 1;
    let used = 0;
    for (let n = start; n <= end; n++) if (has(m, n, cs) || (extra && extra.has(n))) used++;
    return { used, start, end, left: rule.limit - used };
  }
  // сколько дней подряд можно пробыть, если въехать в день from (для правил «не больше»)
  function maxStay(rule, m, from) {
    let n = 0; const extra = new Set();
    while (n < 400) { extra.add(from + n); if (usage(rule, m, from + n, extra).used > rule.limit) break; n++; }
    return n;
  }
  // когда в скользящем окне освободятся дни: ближайшие даты, когда старые дни выпадают из окна
  function freesUp(rule, m, count = 5) {
    const cs = new Set(rule.countries || []), out = [];
    const start = today() - rule.window + 1;
    for (let n = start; n <= today() && out.length < count; n++) if (has(m, n, cs)) out.push(n + rule.window);
    return out;
  }
  const tracked = () => { const lp = state.last_ping; if (!state.keys || !state.keys.track) return lp ? 'warn' : 'off'; if (!lp) return 'off'; const h = (Date.now() - new Date(lp.at)) / 3600e3; return h < 26 ? 'ok' : h < 72 ? 'warn' : 'off'; };
  const plannedDays = rule => { const cs = new Set(rule.countries || []), s = new Set(); state.trips.forEach(t => { if (cs.has(t.country)) for (let n = dn(t.start); n <= dn(t.end); n++) s.add(n); }); return s; };

  // ---------- день ----------
  async function daySheet(n) {
    const d = iso(n), m = dmap(), items = m.get(d) || [];
    const pts = el('div');
    const body = [
      group(null, [
        ...items.map(x => row({ flag: flag(x.c), title: cname(x.c), sub: SRC[x.s] || x.s, value: el('button', { type: 'button', class: 'nb', style: 'color:var(--red)', 'aria-label': 'Убрать', onclick: async () => {
          const r = await post('days', { remove: [{ date: d, country: x.c }] }); if (r) { state.days = r.days; closeSheet(); ME.render(); toast(`${cname(x.c)} убрана с ${fmt(d)}`); }
        } }, icon('trash')) })),
        row({ icon: 'plus', color: 'var(--orange)', title: items.length ? 'Добавить ещё страну' : 'Добавить страну', chev: false, onclick: () => ME.pickCountry(fmt(d, true), async c => {
          const r = await post('days', { add: [{ date: d, country: c }], source: 'manual' }); if (r) { state.days = r.days; ME.render(); toast(`${flag(c)} ${cname(c)} — ${fmt(d)}`); }
        }) }),
      ], items.length > 1 ? 'День в двух странах засчитывается каждой — как в Country Tracker и в правилах Шенгена.' : null),
      pts,
    ];
    sheet({ title: `${WD[wday(n)]}, ${fmt(d, true)}`, body });
    try {
      const r = await ME.api('me/points?date=' + d);
      const { points } = await r.json();
      if (points.length) pts.replaceChildren(group('Отметки за день', points.map(p => row({ icon: p.source === 'auto' ? 'location' : 'photo', color: p.source === 'auto' ? 'var(--blue)' : 'var(--purple)',
        title: p.country ? `${flag(p.country)} ${cname(p.country)}` : 'Вне стран (море, полёт)', sub: `${ME.hm(p.at)} · ${p.source === 'auto' ? 'автоотслеживание' : 'фото'}${p.acc ? ` · ±${Math.round(p.acc)} м` : ''}`,
        href: `https://maps.apple.com/?ll=${p.lat},${p.lon}&q=${encodeURIComponent(cname(p.country) || 'Отметка')}`, target: '_blank' }))));
    } catch (e) { /* без отметок */ }
  }

  // ---------- добавить данные ----------
  function addMenu() {
    menu('Добавить данные', [
      { icon: 'location', text: 'Где я сейчас', sub: 'Отметить по геопозиции телефона', fn: here },
      { icon: 'calendar', text: 'По датам', sub: 'Страна за день или период', fn: () => rangeSheet() },
      { icon: 'photo', text: 'Из фото галереи', sub: 'Дата и место съёмки', fn: () => go('countries/import') },
      { icon: 'import', text: 'Из файла CSV', sub: 'Перенос из Country Tracker и таблиц', fn: importCsv },
      { icon: 'bolt', text: 'Автоотслеживание', sub: 'Настроить «Быстрые команды»', fn: () => go('countries/setup') },
    ]);
  }
  const position = () => new Promise((res, rej) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60e3 }) : rej(new Error('geo')));
  async function here(silent) {
    try {
      const p = await position();
      const r = await ME.api('me/ping', { method: 'POST', body: JSON.stringify({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, date: todayIso() }) });
      if (!r.ok) { if (!silent) toast(await ME.why(r), true); return; }
      const d = await r.json();
      try { localStorage.setItem('me-ping', String(Date.now())); } catch (e) { /* ничего */ }
      await ME.load(); ME.render();
      if (!silent) toast(d.country ? `${flag(d.country)} ${cname(d.country)} — отмечено на ${fmt(d.date)}` : 'Похоже, вы над морем: страна не определилась');
    } catch (e) { if (!silent) toast(e.code === 1 ? 'Нет доступа к геопозиции — разрешите в настройках Safari' : 'Не получилось определить место', true); }
  }
  // при открытии приложения — отметка не чаще раза в 3 часа, если доступ к геопозиции уже выдан
  async function pingOnOpen() {
    if (!state.settings.track_on_open || !navigator.permissions) return;
    try {
      const last = Number(localStorage.getItem('me-ping') || 0);
      if (Date.now() - last < 3 * 3600e3) return;
      const st = await navigator.permissions.query({ name: 'geolocation' });
      if (st.state === 'granted') here(true);
    } catch (e) { /* браузер не умеет */ }
  }
  function rangeSheet(preset = {}) {
    const from = el('input', { type: 'date', value: preset.from || todayIso(), max: '2100-01-01' });
    const to = el('input', { type: 'date', value: preset.to || preset.from || todayIso() });
    let cc = preset.country || (state.days.length ? state.days[state.days.length - 1][1] : state.settings.home || 'TR');
    const cRow = el('div');
    const drawC = () => cRow.replaceChildren(row({ flag: flag(cc), title: cname(cc), sub: 'Страна', onclick: () => ME.pickCountry('Страна', c => { cc = c; drawC(); rangeSheet({ from: from.value, to: to.value, country: c }); }, cc) }));
    drawC();
    const info = el('p', { class: 'group__f' });
    const upd = () => { const a = dn(from.value || todayIso()), b = dn(to.value || from.value || todayIso()); info.textContent = b < a ? 'Конец раньше начала' : `${days(b - a + 1)}. Дни, где уже есть другая страна, останутся — добавится ещё одна.`; };
    [from, to].forEach(i => i.addEventListener('change', () => { if (to.value < from.value) to.value = from.value; upd(); }));
    upd();
    sheet({ title: 'Добавить по датам', doneText: 'Добавить', body: [el('div', { class: 'group' }, el('div', { class: 'list' }, cRow)),
      el('section', { class: 'group' }, [el('div', { class: 'list' }, [ME.inputRow('С', from), ME.inputRow('По', to)]), info])], done: async () => {
      const a = dn(from.value), b = dn(to.value);
      if (!(b >= a) || b - a > 3660) { toast('Проверьте даты', true); return false; }
      const add = []; for (let n = a; n <= b; n++) add.push({ date: iso(n), country: cc });
      const r = await post('days', { add, source: 'manual' });
      if (!r) return false;
      state.days = r.days; ME.render(); toast(`${flag(cc)} ${cname(cc)}: ${days(b - a + 1)}`); return true;
    } });
  }

  // ---------- CSV ----------
  const byName = () => { const m = new Map(); Object.entries(WORLD.names).forEach(([c, ns]) => { ns.forEach(n => m.set(n.toLowerCase(), c)); m.set(c.toLowerCase(), c); }); m.set('turkey', 'TR'); m.set('türkiye', 'TR'); m.set('russia', 'RU'); m.set('россия', 'RU'); m.set('usa', 'US'); m.set('uk', 'GB'); return m; };
  async function importCsv() {
    const [f] = await ME.pickFiles('.csv,text/csv,text/plain', false);
    if (!f) return;
    const text = await f.text(), names = byName(), add = [];
    let bad = 0;
    text.split(/\r?\n/).forEach(line => {
      const cells = line.split(/[;,\t]/).map(s => s.trim().replace(/^"|"$/g, ''));
      let d = null, c = null;
      for (const x of cells) {
        let m;
        if (!d && (m = /^(\d{4})-(\d{2})-(\d{2})/.exec(x))) d = `${m[1]}-${m[2]}-${m[3]}`;
        else if (!d && (m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(x))) d = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        else if (!c && names.has(x.toLowerCase())) c = names.get(x.toLowerCase());
      }
      if (d && c) add.push({ date: d, country: c }); else if (line.trim()) bad++;
    });
    if (!add.length) { toast('В файле не нашлось строк «дата, страна»', true); return; }
    const per = {}; add.forEach(x => { per[x.country] = (per[x.country] || 0) + 1; });
    sheet({ title: 'Импорт CSV', doneText: 'Добавить', body: group(`${add.length} ${plural(add.length, 'строка', 'строки', 'строк')}${bad ? `, не распознано ${bad}` : ''}`,
      Object.entries(per).sort((a, b) => b[1] - a[1]).map(([c, n]) => row({ flag: flag(c), title: cname(c), value: days(n) }))), done: async () => {
      for (let i = 0; i < add.length; i += 3000) { const r = await post('days', { add: add.slice(i, i + 3000), source: 'import' }); if (!r) return false; state.days = r.days; }
      ME.render(); toast('Импорт готов'); return true;
    } });
  }
  function exportCsv() {
    const rows = [['date', 'country_code', 'country', 'source'], ...state.days.map(([d, c, s]) => [d, c, cname(c), s])];
    const csv = '﻿' + rows.map(r => r.map(v => /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(',')).join('\n');
    const file = new File([csv], `countries-${todayIso()}.csv`, { type: 'text/csv' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: 'Дни по странам' }).catch(() => {});
    else { const a = el('a', { href: URL.createObjectURL(file), download: file.name }); document.body.append(a); a.click(); a.remove(); }
  }
  function report(year) {
    const m = dmap(), rng = yearRange(year), c = counts(m, rng);
    const w = window.open('', '_blank');
    if (!w) { toast('Разрешите всплывающие окна', true); return; }
    const d = w.document;
    d.title = `Дни по странам — ${yearLabel(year)}`;
    const css = d.createElement('style');
    css.textContent = 'body{font:14px/1.45 -apple-system,system-ui,sans-serif;margin:32px;color:#111}h1{font-size:22px;margin:0 0 4px}table{border-collapse:collapse;width:100%;margin:14px 0 22px}td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}th{font-size:12px;text-transform:uppercase;color:#666}td.n{text-align:right;font-variant-numeric:tabular-nums}p{color:#555;margin:0}';
    d.head.append(css);
    const add = (tag, text, parent = d.body) => { const n = d.createElement(tag); if (text !== undefined) n.textContent = text; parent.append(n); return n; };
    add('h1', `Дни по странам: ${yearLabel(year)}`);
    add('p', `${fmtShort(iso(rng[0]))} — ${fmtShort(iso(rng[1]))}. Сформировано ${fmtShort(todayIso())}. Дни без данных: ${noData(m, rng)}.`);
    const t = add('table'); const h = add('tr', undefined, t); ['Страна', 'Дней'].forEach(x => add('th', x, h));
    Object.entries(c).sort((a, b) => b[1] - a[1]).forEach(([cc, n]) => { const r = add('tr', undefined, t); add('td', `${cname(cc)} (${cc})`, r); add('td', String(n), r).className = 'n'; });
    add('h1', 'Поездки');
    const t2 = add('table'); const h2 = add('tr', undefined, t2); ['Страна', 'С', 'По', 'Дней'].forEach(x => add('th', x, h2));
    Object.keys(c).forEach(cc => visits(m, cc).filter(([a, b]) => b >= rng[0] && a <= rng[1]).forEach(([a, b]) => {
      const r = add('tr', undefined, t2); add('td', cname(cc), r); add('td', fmtShort(iso(a)), r); add('td', fmtShort(iso(b)), r); add('td', String(b - a + 1), r).className = 'n';
    }));
    setTimeout(() => w.print(), 300);
  }

  // ---------- главный экран ----------
  let weekOffset = 0;
  function main(box) {
    const m = dmap(), t0 = today();
    const years = [...new Set([parts(t0).y, ...state.days.map(d => Number(d[0].slice(0, 4)))])].sort((a, b) => b - a);
    const year = state.ui.ctYear && (state.ui.ctYear === 'last12' || years.includes(Number(state.ui.ctYear))) ? state.ui.ctYear : parts(t0).y;
    const rng = yearRange(year);
    const root = el('div', { class: 'screen ct' });
    box.append(root);
    root.append(el('header', { class: 'nav' }, el('div', { class: 'nav__row' }, [el('div'), el('span', { class: 'nav__title', text: 'Страны' }), el('div', { class: 'nav__r nav__r--stuck' }, [
      navBtn('share', () => menu('Экспорт', [{ icon: 'file', text: 'Файл CSV', sub: 'Все дни: дата, страна, источник', fn: exportCsv }, { icon: 'doc', text: `Отчёт за ${yearLabel(year).toLowerCase()}`, sub: 'Для печати или PDF', fn: () => report(year) }]), { 'aria-label': 'Экспорт' }),
      navBtn('menu', trackerMenu, { 'aria-label': 'Меню' }),
    ])])));
    root.append(el('div', { class: 'lt' }, [
      el('a', { class: 'ct-pro', href: '#countries/setup' }, [icon('bolt'), 'PRO']),
      el('h1', { text: 'Страны' }),
      navBtn('share', () => exportCsv(), { 'aria-label': 'Экспорт CSV', class: 'nb', style: 'color:var(--label)' }),
      navBtn('menu', trackerMenu, { 'aria-label': 'Меню', style: 'color:var(--label)' }),
    ]));

    // неделя
    const end = t0 - wday(t0) + 6 + weekOffset * 7, start = end - 6, mid = parts(start + 3);
    const dayBtn = n => {
      const items = m.get(iso(n)) || [], p = parts(n);
      return el('button', { type: 'button', class: `ct-day${n === t0 ? ' is-today' : ''}${n > t0 ? ' is-future' : ''}`, onclick: () => n <= t0 && daySheet(n), 'aria-label': `${p.d} ${MON_G[p.m]}: ${items.map(x => cname(x.c)).join(', ') || 'нет данных'}` }, [
        el('span', { class: 'ct-day__pill' }, [el('small', { text: 'ПВСЧПСВ'[wday(n)] }), el('b', { text: String(p.d) })]),
        el('span', { class: 'ct-day__f' + (items.length > 1 ? ' ct-day__f--two' : '') }, items.length ? items.slice(0, 2).map(x => flag(x.c)).join('') : n <= t0 ? el('i') : ''),
      ]);
    };
    const daysBox = el('div', { class: 'ct-days' }, Array.from({ length: 7 }, (_, i) => dayBtn(start + i)));
    let sx = null;
    daysBox.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    daysBox.addEventListener('touchend', e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50) { weekOffset += dx > 0 ? -1 : (weekOffset < 0 ? 1 : 0); ME.render(); } });
    const st = tracked(), lp = state.last_ping;
    const statusText = { ok: 'Автотрекинг работает', warn: lp ? `Последняя автоотметка ${ME.ago(lp.at)}` : 'Автотрекинг ещё не присылал отметок', off: lp ? `Автотрекинг молчит с ${fmt(lp.date)}` : 'Автотрекинг не настроен — нажмите, чтобы включить' }[st];
    root.append(el('section', { class: 'ct-week' }, [
      el('a', { class: 'ct-week__head', href: `#countries/cal/${mid.y}-${String(mid.m + 1).padStart(2, '0')}` }, [el('span', {}, icon('calendar')), el('b', { text: `${MONTHS[mid.m].replace(/^./, c => c.toUpperCase())} ${mid.y}` }), weekOffset ? el('button', { type: 'button', class: 'btn btn--soft btn--sm', text: 'Сегодня', onclick: e => { e.preventDefault(); weekOffset = 0; ME.render(); } }) : null, icon('chev', 'row__chev')]),
      daysBox,
      el('a', { class: `ct-status ct-status--${st}`, href: '#countries/setup' }, [icon(st === 'ok' ? 'okcircle' : 'warn'), el('span', { text: statusText })]),
    ]));

    // плитки: правила + дни без данных
    const tiles = state.rules.filter(r => r.on && r.tile).sort((a, b) => (a.order || 0) - (b.order || 0)).map(r => {
      const u = usage(r, m), max = r.goal === 'max';
      const v = max ? u.used : u.used, pct = Math.min(100, u.used / r.limit * 100);
      const color = max ? (u.left < 0 ? 'var(--red)' : u.left <= r.warn ? 'var(--orange)' : 'var(--green)') : (u.used >= r.limit ? 'var(--green)' : 'var(--orange)');
      return el('a', { class: 'ct-tile', href: `#countries/rule/${r.id}` }, [
        el('span', { class: 'ct-tile__n' }, [String(v), el('small', { text: ` / ${r.limit}` })]),
        el('span', { class: 'ct-tile__l', text: r.name }),
        el('div', { class: 'bar', style: `--c:${color}` }, el('i', { style: `width:${pct}%` })),
        el('span', { class: 'ct-tile__i', text: 'i' }),
      ]);
    });
    const nd = noData(m, rng);
    tiles.push(el('a', { class: 'ct-tile', href: '#countries/gaps' }, [el('span', { class: 'ct-tile__n', text: String(nd) }), el('span', { class: 'ct-tile__l', text: 'Дни без данных' }), el('span', { class: 'ct-tile__i', text: 'i' })]));
    root.append(el('div', { class: 'ct-tiles' }, tiles));
    root.append(el('button', { type: 'button', class: 'btn ct-add', onclick: addMenu }, [icon('plus'), 'Добавить данные']));

    // сводка
    const c = counts(m, rng);
    const sel = el('select', { class: 'ct-year', 'aria-label': 'Период', onchange: e => { state.ui.ctYear = e.target.value === 'last12' ? 'last12' : Number(e.target.value); ME.saveUi(); ME.render(); } },
      [...years.map(y => el('option', { value: y, text: String(y), selected: String(y) === String(year) })), el('option', { value: 'last12', text: '12 мес', selected: year === 'last12' })]);
    const sum = Object.entries(c).sort((a, b) => b[1] - a[1]);
    root.append(el('section', { class: 'group ct-sum' }, [
      el('div', { class: 'group__h group__h--big', style: 'align-items:center' }, [el('span', { text: 'Сводка' }), sel]),
      sum.length ? el('div', {}, sum.map(([cc, n]) => row({ flag: flag(cc), title: cname(cc), value: `${n} ${plural(n, 'день', 'дня', 'дней')}`, href: `#countries/c/${cc}` })))
        : ME.empty('Пока пусто', 'Добавьте дни вручную, из фото или включите автоотслеживание.'),
    ]));

    // карта
    root.append(el('section', { class: 'group' }, [el('h2', { class: 'group__h group__h--big', text: 'Карта' }), worldMap(new Set(Object.keys(c)), c),
      el('div', { class: 'ct-stats' }, [
        el('div', {}, [el('b', { text: String(sum.length) }), el('span', { text: plural(sum.length, 'страна', 'страны', 'стран') })]),
        el('div', {}, [el('b', { text: String(new Set(state.days.map(d => d[1])).size) }), el('span', { text: 'за всё время' })]),
        el('div', {}, [el('b', { text: String(sum.filter(([cc]) => cc !== state.settings.home).reduce((s, x) => s + x[1], 0)) }), el('span', { text: `дней не в ${cname(state.settings.home || 'TR').replace(/я$/, 'и')}` })]),
      ])]));
    pingOnOpen();
  }

  function trackerMenu() {
    menu('Страны', [
      { icon: 'chart', text: 'Правила и лимиты', sub: 'Шенген, резидентство, свои', fn: () => go('countries/rules') },
      { icon: 'plane', text: 'Планы поездок', sub: 'Проверить лимиты наперёд', fn: () => go('countries/trips') },
      { icon: 'calendar', text: 'Календарь', fn: () => go(`countries/cal/${todayIso().slice(0, 7)}`) },
      { icon: 'warn', text: 'Дни без данных', fn: () => go('countries/gaps') },
      { icon: 'photo', text: 'Импорт из фото', fn: () => go('countries/import') },
      { icon: 'import', text: 'Импорт CSV', fn: importCsv },
      { icon: 'bolt', text: 'Автоотслеживание', fn: () => go('countries/setup') },
    ]);
  }

  // ---------- карта ----------
  function worldMap(on, c) {
    const [x0, y0, w0, h0] = WORLD.view;
    let vb = [x0, y0, w0, h0];
    const svg = el('svg', { viewBox: vb.join(' '), role: 'img', 'aria-label': `Карта: ${on.size} ${plural(on.size, 'страна', 'страны', 'стран')}` });
    const tip = el('div', { class: 'ct-map__tip', hidden: true });
    Object.entries(WORLD.shapes).forEach(([cc, d]) => svg.append(el('path', { d, class: on.has(cc) ? 'on' : null, 'data-c': cc })));
    Object.entries(WORLD.dots).forEach(([cc, [x, y]]) => { if (on.has(cc)) svg.append(el('circle', { cx: x, cy: y, r: 3, 'data-c': cc })); });
    const set = () => svg.setAttribute('viewBox', vb.map(v => v.toFixed(1)).join(' '));
    const zoom = (k, cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2) => {
      const w = Math.max(w0 / 12, Math.min(w0, vb[2] * k)), h = w * h0 / w0;
      vb = [Math.max(x0, Math.min(x0 + w0 - w, cx - w / 2)), Math.max(y0, Math.min(y0 + h0 - h, cy - h / 2)), w, h]; set();
    };
    // по умолчанию — приблизить к посещённым странам
    if (on.size) {
      const boxes = [...on].map(cc => svg.querySelector(`[data-c="${cc}"]`)).filter(Boolean);
      requestAnimationFrame(() => {
        try {
          const bb = boxes.map(b => b.getBBox()).reduce((a, b) => ({ x1: Math.min(a.x1, b.x), y1: Math.min(a.y1, b.y), x2: Math.max(a.x2, b.x + b.width), y2: Math.max(a.y2, b.y + b.height) }), { x1: 1e9, y1: 1e9, x2: -1e9, y2: -1e9 });
          const k = Math.min(1, Math.max((bb.x2 - bb.x1) * 1.5 / w0, (bb.y2 - bb.y1) * 1.6 / h0, .18));
          zoom(k, (bb.x1 + bb.x2) / 2, (bb.y1 + bb.y2) / 2);
        } catch (e) { /* карта ещё не на странице */ }
      });
    }
    let drag = null, moved = false;
    svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vb: [...vb] }; moved = false; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove', e => {
      if (!drag) return;
      const k = vb[2] / svg.clientWidth, dx = (e.clientX - drag.x) * k, dy = (e.clientY - drag.y) * k;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      vb = [Math.max(x0, Math.min(x0 + w0 - vb[2], drag.vb[0] - dx)), Math.max(y0, Math.min(y0 + h0 - vb[3], drag.vb[1] - dy)), vb[2], vb[3]]; set();
    });
    svg.addEventListener('pointerup', e => {
      drag = null;
      if (moved) return;
      const t = document.elementFromPoint(e.clientX, e.clientY), cc = t && t.dataset && t.dataset.c;
      if (!cc) { tip.hidden = true; return; }
      tip.hidden = false; tip.textContent = `${flag(cc)} ${cname(cc)}${c[cc] ? ' — ' + days(c[cc]) : ''}`;
    });
    return el('div', { class: 'ct-map' }, [svg, tip, el('div', { class: 'ct-map__btns' }, [
      el('button', { type: 'button', 'aria-label': 'Приблизить', text: '+', onclick: () => zoom(.6) }),
      el('button', { type: 'button', 'aria-label': 'Отдалить', text: '−', onclick: () => zoom(1.7) }),
    ])]);
  }

  // ---------- календарь ----------
  function calendar(box, ym) {
    const m = dmap(), t0 = today();
    const [y, mo] = (ym || todayIso().slice(0, 7)).split('-').map(Number);
    const first = dn(`${y}-${String(mo).padStart(2, '0')}-01`), last = dn(iso(Date.UTC(y, mo, 1) / 864e5 - 1));
    const prev = parts(first - 1), next = parts(last + 1);
    const body = screen(box, { title: `${MONTHS[mo - 1].replace(/^./, c => c.toUpperCase())} ${y}`, back: '#countries', backText: 'Страны', cls: 'ct', right: [
      navBtn('back', () => go(`countries/cal/${prev.y}-${String(prev.m + 1).padStart(2, '0')}`), { 'aria-label': 'Предыдущий месяц' }),
      navBtn('chev', () => go(`countries/cal/${next.y}-${String(next.m + 1).padStart(2, '0')}`), { 'aria-label': 'Следующий месяц', disabled: last + 1 > t0 }),
    ] });
    const cells = [];
    for (let i = 0; i < wday(first); i++) cells.push(el('span', { class: 'cal__d is-out' }));
    for (let n = first; n <= last; n++) {
      const items = m.get(iso(n)) || [];
      const src = items.length ? items.reduce((a, x) => ({ manual: 3, import: 2, photo: 2, auto: 1 }[x.s] > ({ manual: 3, import: 2, photo: 2, auto: 1 }[a] || 0) ? x.s : a), '') : null;
      cells.push(el('button', { type: 'button', class: `cal__d${n === t0 ? ' is-today' : ''}${n > t0 ? ' is-future' : ''}`, disabled: n > t0, onclick: () => daySheet(n) }, [
        el('b', { text: String(parts(n).d) }),
        el('span', { class: items.length > 1 ? 'two' : !items.length && n <= t0 ? 'none' : '', text: items.slice(0, 2).map(x => flag(x.c)).join('') }),
        src ? el('i', { class: `src src--${src}` }) : null,
      ]));
    }
    const c = counts(m, [first, Math.min(last, t0)]);
    body.append(el('div', { class: 'cal' }, [
      el('div', { class: 'cal__wd' }, WD.map(w => el('span', { text: w }))),
      el('div', { class: 'cal__grid' }, cells),
      el('div', { class: 'legend' }, [el('span', {}, [el('i', { style: 'background:var(--blue)' }), 'авто']), el('span', {}, [el('i', { style: 'background:var(--purple)' }), 'фото']), el('span', {}, [el('i', { style: 'background:var(--gray)' }), 'вручную']), el('span', {}, [el('i', { style: 'background:var(--red);opacity:.6' }), 'нет данных'])]),
    ]));
    const sum = Object.entries(c).sort((a, b) => b[1] - a[1]);
    if (sum.length) body.append(group('За месяц', sum.map(([cc, n]) => row({ flag: flag(cc), title: cname(cc), value: days(n), href: `#countries/c/${cc}` }))));
    body.append(el('div', { class: 'group' }, el('button', { type: 'button', class: 'btn btn--soft', style: '--tint:var(--orange)', onclick: () => rangeSheet({ from: iso(first), to: iso(Math.min(last, t0)) }) }, [icon('plus'), 'Заполнить период'])));
  }

  // ---------- страна ----------
  function country(box, cc) {
    const m = dmap(), t0 = today(), y = parts(t0).y;
    const vs = visits(m, cc), total = state.days.filter(d => d[1] === cc).length;
    const inYear = counts(m, yearRange(y))[cc] || 0;
    const body = screen(box, { title: `${flag(cc)} ${cname(cc)}`, back: '#countries', backText: 'Страны', cls: 'ct' });
    const months = Array.from({ length: 12 }, (_, i) => { const a = dn(`${y}-${String(i + 1).padStart(2, '0')}-01`), b = dn(iso(Date.UTC(y, i + 1, 1) / 864e5 - 1)); return counts(m, [a, Math.min(b, t0)])[cc] || 0; });
    const mx = Math.max(1, ...months);
    body.append(el('div', { class: 'group' }, el('div', { class: 'card' }, [
      el('div', { class: 'ct-stats', style: 'margin:0' }, [
        el('div', {}, [el('b', { text: String(inYear) }), el('span', { text: `в ${y}` })]),
        el('div', {}, [el('b', { text: String(total) }), el('span', { text: 'всего дней' })]),
        el('div', {}, [el('b', { text: String(vs.length) }), el('span', { text: plural(vs.length, 'поездка', 'поездки', 'поездок') })]),
      ]),
      el('div', { class: 'months', 'aria-label': `По месяцам ${y}` }, months.map((n, i) => el('div', { title: `${MONTHS[i]}: ${n}` }, [el('i', { style: `height:${n / mx * 70}px` }), MON[i].slice(0, 1).toUpperCase()]))),
    ])));
    const rules = state.rules.filter(r => (r.countries || []).includes(cc));
    if (rules.length) body.append(group('Правила', rules.map(r => { const u = usage(r, m); return row({ title: r.name, value: `${u.used} / ${r.limit}`, href: `#countries/rule/${r.id}` }); })));
    body.append(group('Поездки', vs.length ? vs.map(([a, b]) => row({ title: a === b ? fmt(iso(a), true) : `${fmt(iso(a))} — ${fmt(iso(b), true)}`, value: days(b - a + 1), onclick: () => daySheet(a) })) : [row({ title: 'Нет дней' })]));
    if (vs.length) body.append(el('p', { class: 'group__f', style: 'margin:-14px 32px 20px', text: `Первый раз: ${fmt(iso(vs[vs.length - 1][0]), true)}. Последний: ${fmt(iso(vs[0][1]), true)}.` }));
    body.append(group(null, [row({ title: `Удалить все дни: ${cname(cc)}`, cls: 'row--danger', chev: false, onclick: async () => {
      if (!await ask(`Удалить ${days(total)} в стране «${cname(cc)}»?`)) return;
      const r = await post('days', { remove: state.days.filter(d => d[1] === cc).map(d => ({ date: d[0], country: cc })) });
      if (r) { state.days = r.days; go('countries'); toast('Удалено'); }
    } })]));
  }

  // ---------- правила ----------
  const PRESETS = [
    { name: 'Шенген 90/180', countries: () => state.meta.schengen, mode: 'rolling', window: 180, limit: 90, goal: 'max', warn: 15 },
    { name: 'Налоговый резидент РФ', countries: () => ['RU'], mode: 'year', window: 365, limit: 183, goal: 'min', warn: 30 },
    { name: 'Турция без визы 90/180', countries: () => ['TR'], mode: 'rolling', window: 180, limit: 90, goal: 'max', warn: 10 },
    { name: 'Грузия 365/365', countries: () => ['GE'], mode: 'rolling', window: 365, limit: 365, goal: 'max', warn: 30 },
    { name: 'Своё правило', countries: () => [], mode: 'rolling', window: 180, limit: 90, goal: 'max', warn: 10 },
  ];
  function rules(box) {
    const m = dmap();
    const body = screen(box, { title: 'Правила', back: '#countries', backText: 'Страны', cls: 'ct', right: [navBtn('plus', () => menu('Новое правило', PRESETS.map(p => ({ icon: 'plus', text: p.name, fn: () => editRule(null, { ...p, countries: p.countries() }) }))), { 'aria-label': 'Новое правило' })] });
    const list = [...state.rules].sort((a, b) => (a.order || 0) - (b.order || 0));
    body.append(group(null, list.map(r => {
      const u = usage(r, m);
      return el('a', { class: 'row', href: `#countries/rule/${r.id}`, style: r.on ? '' : 'opacity:.5' }, el('div', { class: 'prog', style: 'padding:4px 0;flex:1' }, [
        el('div', { class: 'prog__top' }, [el('b', { text: r.name }), el('span', { text: `${u.used} из ${r.limit}` })]),
        el('div', { class: 'bar', style: `--c:${r.goal === 'max' ? (u.left < 0 ? 'var(--red)' : u.left <= r.warn ? 'var(--orange)' : 'var(--green)') : (u.used >= r.limit ? 'var(--green)' : 'var(--orange)')}` }, el('i', { style: `width:${Math.min(100, u.used / r.limit * 100)}%` })),
        el('p', { text: ruleLine(r, u) }),
      ]));
    }), 'Правило считает дни в выбранных странах: в скользящем окне (как Шенген 90/180), за календарный год или с даты. «Не больше» — лимит, «не меньше» — цель, например 183 дня для налогового резидентства.'));
  }
  const ruleLine = (r, u) => r.goal === 'max'
    ? (u.left >= 0 ? `Можно ещё ${days(u.left)}` : `Превышение на ${days(-u.left)}`) + (r.mode === 'rolling' ? ` · окно ${r.window} дн.` : r.mode === 'year' ? ' · за год' : '')
    : (u.used >= r.limit ? 'Цель выполнена' : `Нужно ещё ${days(r.limit - u.used)}`) + (r.mode === 'year' ? `, до конца года ${days(dn(`${parts(today()).y}-12-31`) - today())}` : '');

  function rule(box, id) {
    const r = state.rules.find(x => x.id === Number(id));
    if (!r) { go('countries/rules'); return; }
    const m = dmap(), u = usage(r, m), t0 = today();
    const body = screen(box, { title: r.name, back: '#countries/rules', backText: 'Правила', cls: 'ct', right: [navBtn(el('span', { text: 'Изменить' }), () => editRule(r))] });
    const pct = Math.min(100, u.used / r.limit * 100);
    const color = r.goal === 'max' ? (u.left < 0 ? 'var(--red)' : u.left <= r.warn ? 'var(--orange)' : 'var(--green)') : (u.used >= r.limit ? 'var(--green)' : 'var(--orange)');
    body.append(el('div', { class: 'group' }, el('div', { class: 'card', style: 'display:grid;gap:8px' }, [
      el('div', { class: 'ct-tile__n' }, [String(u.used), el('small', { text: ` из ${r.limit} ${plural(r.limit, 'дня', 'дней', 'дней')}` })]),
      el('div', { class: 'bar', style: `--c:${color};height:10px;border-radius:5px` }, el('i', { style: `width:${pct}%` })),
      el('p', { style: 'margin:0', text: ruleLine(r, u) }),
      el('p', { class: 'muted', style: 'margin:0;font-size:15px', text: `Считается с ${fmt(iso(u.start), true)} по сегодня. Страны: ${(r.countries || []).length > 6 ? `${r.countries.length} стран` : (r.countries || []).map(cname).join(', ') || 'не выбраны'}.` }),
      r.note ? el('p', { class: 'muted', style: 'margin:0;font-size:15px', text: r.note }) : null,
    ])));
    if (r.goal === 'max' && r.mode === 'rolling') {
      const stay = maxStay(r, m, t0 + 1), frees = freesUp(r, m);
      body.append(group('Если въехать завтра', [row({ title: 'Можно пробыть подряд', value: days(stay) }), row({ title: 'Выехать не позже', value: stay ? fmt(iso(t0 + stay), true) : '—' })],
        'С учётом дней, которые за это время выпадут из окна.'));
      if (frees.length) body.append(group('Дни освобождаются', frees.map(n => row({ title: fmt(iso(n), true), value: '+1 день' }))));
    }
    // планировщик: проверить поездку
    const from = el('input', { type: 'date', value: iso(t0 + 14) }), to = el('input', { type: 'date', value: iso(t0 + 21) });
    const out = el('p', { class: 'group__f' });
    const check = () => {
      const a = dn(from.value), b = dn(to.value);
      if (!(b >= a)) { out.textContent = 'Конец раньше начала'; return; }
      const extra = plannedDays(r);
      for (let n = a; n <= b; n++) extra.add(n);
      let bad = null, peak = 0;
      for (let n = a; n <= b; n++) { const x = usage(r, m, n, extra).used; peak = Math.max(peak, x); if (r.goal === 'max' && x > r.limit && bad === null) bad = n; }
      if (r.goal === 'max') out.textContent = bad === null ? `Поездка укладывается: максимум ${peak} из ${r.limit}.` : `Превышение с ${fmt(iso(bad), true)}: выехать нужно до ${fmt(iso(bad - 1), true)} (${days(bad - a)} поездки).`;
      else { const x = usage(r, m, dn(`${parts(b).y}-12-31`), extra).used; out.textContent = `С этой поездкой к концу года будет ${x} из ${r.limit}${x >= r.limit ? ' — цель выполнена' : ''}.`; }
    };
    [from, to].forEach(i => i.addEventListener('change', check));
    body.append(el('section', { class: 'group' }, [el('h2', { class: 'group__h', text: 'Проверить поездку' }), el('div', { class: 'list' }, [ME.inputRow('Въезд', from), ME.inputRow('Выезд', to)]), out]));
    check();
    if (state.trips.length) body.append(el('p', { class: 'group__f', style: 'margin:-14px 32px 20px', text: 'Запланированные поездки из «Планов поездок» тоже учитываются.' }));
  }
  function editRule(r, preset) {
    const d = { ...r, ...preset };
    const name = el('input', { class: 'l', value: d.name || '', maxLength: 80, placeholder: 'Название' });
    const lim = el('input', { type: 'number', inputmode: 'numeric', value: d.limit, min: 1, max: 3660 });
    const win = el('input', { type: 'number', inputmode: 'numeric', value: d.window, min: 1, max: 3660 });
    const warn = el('input', { type: 'number', inputmode: 'numeric', value: d.warn || 0, min: 0, max: 365 });
    const since = el('input', { type: 'date', value: d.since || todayIso() });
    const box = el('div');
    const draw = () => box.replaceChildren(...[
      group(null, [el('div', { class: 'row' }, name)]),
      group('Как считать', [
        ME.seg([['rolling', 'Окно'], ['year', 'Год'], ['since', 'С даты']], d.mode, v => { d.mode = v; draw(); }),
        d.mode === 'rolling' ? ME.inputRow('Окно, дней', win) : null, d.mode === 'since' ? ME.inputRow('Начиная с', since) : null,
        ME.seg([['max', 'Не больше'], ['min', 'Не меньше']], d.goal, v => { d.goal = v; draw(); }),
        ME.inputRow(d.goal === 'max' ? 'Лимит, дней' : 'Цель, дней', lim),
        d.goal === 'max' ? ME.inputRow('Предупредить за, дней', warn) : null,
      ].filter(Boolean).map(x => x.classList.contains('seg') ? el('div', { class: 'row' }, el('div', { style: 'flex:1' }, x)) : x)),
      group('Страны', [
        row({ title: (d.countries || []).length ? `${d.countries.length} ${plural(d.countries.length, 'страна', 'страны', 'стран')}` : 'Выбрать', sub: (d.countries || []).slice(0, 8).map(flag).join(' '), onclick: () => pickMany() }),
      ]),
      group(null, [ME.toggle('Показывать плиткой на главной', d.tile !== false, v => { d.tile = v; }), ME.toggle('Включено', d.on !== false, v => { d.on = v; })]),
      r ? group(null, [row({ title: 'Удалить правило', cls: 'row--danger', chev: false, onclick: async () => { if (await ask(`Удалить «${r.name}»?`) && await remove('rules', r.id)) { closeSheet(); go('countries/rules'); } } })]) : null,
    ].filter(Boolean));
    const pickMany = () => {
      const all = Object.keys(WORLD.names).sort((a, b) => cname(a).localeCompare(cname(b), 'ru'));
      const picked = new Set(d.countries || []);
      const q = el('input', { type: 'search', placeholder: 'Поиск' });
      const lst = el('div', { class: 'list pick-list' });
      const drawL = () => { const s = q.value.trim().toLowerCase(); lst.replaceChildren(...all.filter(c => !s || WORLD.names[c].some(n => n.toLowerCase().includes(s))).sort((a, b) => picked.has(b) - picked.has(a)).map(c => el('label', { class: 'row' }, [el('span', { class: 'row__flag', text: flag(c) }), el('span', { class: 'row__main' }, el('span', { class: 'row__t', text: cname(c) })), el('input', { type: 'checkbox', class: 'switch', checked: picked.has(c), onchange: e => { if (e.target.checked) picked.add(c); else picked.delete(c); } })]))); };
      q.addEventListener('input', drawL);
      sheet({ title: 'Страны правила', body: [el('div', { class: 'search' }, [icon('search'), q]), el('div', { class: 'group' }, lst)], done: () => { d.countries = [...picked]; editRule(r, d); return false; } });
      drawL();
    };
    draw();
    sheet({ title: r ? 'Правило' : 'Новое правило', body: box, done: async () => {
      const data = { name: name.value.trim(), countries: d.countries || [], mode: d.mode, goal: d.goal, limit: Number(lim.value) || 1, window: Number(win.value) || 180, warn: Number(warn.value) || 0, since: d.mode === 'since' ? since.value : null, tile: d.tile !== false, on: d.on !== false };
      if (!data.name) { name.focus(); return false; }
      if (!r) data.order = Math.max(0, ...state.rules.map(x => x.order || 0)) + 10;
      const rec = await save('rules', r ? r.id : null, data);
      if (!rec) return false;
      closeSheet(); go(`countries/rule/${rec.id}`); ME.render(); return true;
    } });
  }

  // ---------- дни без данных ----------
  function gapsView(box) {
    const m = dmap(), y = state.ui.ctYear || parts(today()).y;
    const list = gaps(m, yearRange(y));
    const body = screen(box, { title: 'Дни без данных', back: '#countries', backText: 'Страны', cls: 'ct', sub: `${yearLabel(y)}: ${days(list.reduce((s, [a, b]) => s + b - a + 1, 0))}` });
    const obvious = list.filter(([a, b]) => { const p = neighbor(m, a, -1), n = neighbor(m, b, 1); return p.length === 1 && n.length === 1 && p[0] === n[0]; });
    if (obvious.length) {
      const total = obvious.reduce((s, [a, b]) => s + b - a + 1, 0);
      body.append(el('div', { class: 'group' }, el('button', { type: 'button', class: 'btn', style: '--tint:var(--orange)', onclick: async () => {
        const add = []; obvious.forEach(([a, b]) => { const c = neighbor(m, a, -1)[0]; for (let n = a; n <= b; n++) add.push({ date: iso(n), country: c }); });
        const r = await post('days', { add, source: 'manual' }); if (r) { state.days = r.days; ME.render(); toast(`Заполнено ${days(total)}`); }
      } }, [icon('check'), `Заполнить очевидные: ${days(total)}`])), el('p', { class: 'group__f', style: 'margin:-12px 32px 20px', text: 'Пропуски, где до и после одна и та же страна — скорее всего, вы никуда не уезжали.' }));
    }
    if (!list.length) { body.append(ME.empty('Пропусков нет', 'Каждый день отмечен.')); return; }
    body.append(group(null, list.map(([a, b]) => {
      const p = neighbor(m, a, -1), n = neighbor(m, b, 1), guess = p[0] || n[0];
      return row({ title: a === b ? fmt(iso(a), true) : `${fmt(iso(a))} — ${fmt(iso(b), true)}`, sub: `${days(b - a + 1)}${p.length ? ` · до: ${p.map(flag).join('')}` : ''}${n.length ? ` · после: ${n.map(flag).join('')}` : ''}`,
        onclick: () => rangeSheet({ from: iso(a), to: iso(b), country: guess }) });
    })));
  }

  // ---------- импорт из фото ----------
  function importView(box) {
    const body = screen(box, { title: 'Из фото', back: '#countries', backText: 'Страны', cls: 'ct' });
    const out = el('div');
    body.append(el('section', { class: 'group' }, [el('div', { class: 'card', style: 'display:grid;gap:12px' }, [
      el('p', { style: 'margin:0', text: 'Выберите снимки — приложение прочитает дату и место съёмки прямо на телефоне (сами фото никуда не загружаются) и предложит дни по странам.' }),
      el('p', { class: 'muted', style: 'margin:0;font-size:15px', text: 'На iPhone в окне выбора фото нажмите «Параметры» вверху и включите «Геопозиция», иначе Safari вырежет координаты. Можно выбрать сразу сотни снимков: удобнее всего «Выбрать» → провести пальцем по сетке.' }),
      el('button', { type: 'button', class: 'btn', style: '--tint:var(--orange)', onclick: pick }, [icon('photo'), 'Выбрать фото']),
    ])]), out);
    body.append(group('Вся галерея сразу', [row({ icon: 'bolt', color: 'var(--orange)', title: 'Через «Быстрые команды»', sub: 'Тысячи снимков за любой период', href: '#countries/setup' })], 'Команда сама найдёт фото за выбранный период и отправит их координаты — без ручного выбора.'));

    async function pick() {
      const files = await ME.pickFiles('image/*,.heic,.heif', true);
      if (!files.length) return;
      const prog = el('p', { class: 'muted', style: 'text-align:center' });
      out.replaceChildren(prog);
      const res = []; let done = 0, noGps = 0;
      const queue = [...files];
      const worker = async () => { while (queue.length) { const f = queue.shift(); const x = await EXIF.parse(f); done++; if (x.lat != null) res.push({ ...x, date: x.date || ME.localIso(new Date(f.lastModified)) }); else noGps++; if (done % 10 === 0 || done === files.length) prog.textContent = `Прочитано ${done} из ${files.length}…`; } };
      await Promise.all([1, 2, 3, 4].map(worker));
      if (!res.length) { out.replaceChildren(ME.empty('Координат не нашлось', `${files.length} ${plural(files.length, 'снимок', 'снимка', 'снимков')} без геопозиции. Включите «Параметры → Геопозиция» при выборе или используйте «Быстрые команды».`)); return; }
      prog.textContent = 'Определяю страны…';
      const uniq = new Map(); res.forEach(x => { const k = `${x.lat.toFixed(2)},${x.lon.toFixed(2)}`; if (!uniq.has(k)) uniq.set(k, [x.lat, x.lon]); });
      const keys = [...uniq.keys()], countries = {};
      for (let i = 0; i < keys.length; i += 2000) {
        const r = await post('geo', { points: keys.slice(i, i + 2000).map(k => uniq.get(k)) });
        if (!r) return;
        r.countries.forEach((c, j) => { countries[keys[i + j]] = c; });
      }
      const per = new Map();
      res.forEach(x => { const c = countries[`${x.lat.toFixed(2)},${x.lon.toFixed(2)}`]; if (!c) return; const k = x.date + '|' + c; per.set(k, (per.get(k) || 0) + 1); });
      const m = dmap();
      const items = [...per.entries()].map(([k, n]) => { const [d, c] = k.split('|'); return { d, c, n, have: (m.get(d) || []).some(x => x.c === c) }; }).sort((a, b) => b.d.localeCompare(a.d));
      const fresh = items.filter(x => !x.have);
      const checks = new Map();
      const head = el('p', { class: 'group__f', style: 'margin:0 32px 12px', text: `${res.length} с координатами${noGps ? `, ${noGps} без` : ''}. Новых дней: ${fresh.length}.` });
      const addBtn = el('button', { type: 'button', class: 'btn', style: '--tint:var(--orange)', onclick: async () => {
        const add = items.filter(x => checks.get(x) && checks.get(x).checked).map(x => ({ date: x.d, country: x.c }));
        if (!add.length) return;
        const r = await post('days', { add, source: 'photo' });
        if (r) { state.days = r.days; toast(`Добавлено ${days(r.added)}`); go('countries'); }
      } }, `Добавить отмеченные`);
      out.replaceChildren(...[head, el('div', { class: 'group' }, el('div', { class: 'list' }, items.map(x => {
        const cb = el('input', { type: 'checkbox', checked: !x.have, disabled: x.have }); checks.set(x, cb);
        return el('label', { class: 'import-row' }, [cb, el('span', {}, [el('b', { text: `${flag(x.c)} ${cname(x.c)}` }), el('br'), el('span', { class: 'muted', style: 'font-size:15px', text: `${fmt(x.d, true)} · ${x.n} фото` })]), el('span', { class: x.have ? 'muted' : 'ok', style: 'font-size:13px', text: x.have ? 'уже есть' : 'новый' })]);
      }))), fresh.length ? el('div', { class: 'group' }, addBtn) : null].filter(Boolean));
    }
  }

  // ---------- автоотслеживание ----------
  function setup(box) {
    const body = screen(box, { title: 'Автоотслеживание', back: '#countries', backText: 'Страны', cls: 'ct' });
    const k = state.keys && state.keys.track, lp = state.last_ping, st = tracked();
    const origin = location.origin;
    body.append(el('div', { class: 'group' }, el('a', { class: `ct-status ct-status--${st}`, style: 'background:var(--bg2)', href: '#countries' }, [icon(st === 'ok' ? 'okcircle' : 'warn'), el('span', { text: lp ? `Последняя отметка ${ME.ago(lp.at)}: ${lp.country ? flag(lp.country) + ' ' + cname(lp.country) : 'вне стран'}` : 'Отметок пока не было' })])));
    body.append(el('p', { class: 'group__f', style: 'margin:-14px 32px 20px', text: 'Веб-приложение не может следить за местом в фоне — это умеют только «Быстрые команды» iPhone. Они по расписанию отправляют сюда геопозицию, и день сам отмечается страной. Если отметок нет больше 36 часов, придёт уведомление.' }));

    const keyBox = el('div');
    const drawKey = (plain) => keyBox.replaceChildren(group('1. Ключ доступа', [
      plain ? el('div', { class: 'row', style: 'display:block' }, [el('p', { style: 'margin:0 0 6px;font-size:15px', text: 'Скопируйте ключ сейчас — потом он не покажется. В команде он идёт в заголовок Authorization после слова Bearer и пробела.' }), el('div', { class: 'code-row' }, [el('span', { class: 'code', text: plain }), el('button', { type: 'button', class: 'btn btn--sm', onclick: () => ME.copy(plain) }, 'Копировать')])])
        : row({ icon: 'key', color: 'var(--orange)', title: k ? 'Ключ выпущен' : 'Ключа ещё нет', sub: k ? `${fmt(k.created_at.slice(0, 10), true)}${k.last_used ? ' · работал ' + ME.ago(k.last_used) : ''}` : 'Нужен, чтобы команда могла писать в приложение' }),
      row({ title: k || plain ? 'Выпустить новый (старый перестанет работать)' : 'Создать ключ', cls: 'row--tint', chev: false, onclick: async () => {
        if ((k || plain) && !await ask('Старый ключ перестанет работать — его нужно будет заменить во всех командах.', 'Выпустить новый')) return;
        const r = await post('keys/track', {}); if (r) { state.keys = r.keys; drawKey(r.key); }
      } }),
    ]));
    drawKey();
    body.append(keyBox);
    const url = `${origin}/api/me/ping`;
    body.append(el('section', { class: 'group' }, [el('h2', { class: 'group__h', text: '2. Команда «Где я»' }), el('ol', { class: 'steps list' }, [
      el('li', { text: 'Откройте «Быстрые команды» → вкладка «Автоматизация» → «+» → «Время суток». Выберите 09:00, «Ежедневно» и «Запускать сразу».' }),
      el('li', { text: 'Добавьте действие «Текущее местоположение».' }),
      el('li', {}, ['Добавьте «Получить содержимое URL». Адрес: ', el('span', { class: 'code', text: url }), el('button', { type: 'button', class: 'btn btn--sm btn--soft', style: 'margin:6px 0 0;--tint:var(--orange)', onclick: () => ME.copy(url) }, 'Копировать адрес')]),
      el('li', { text: 'Разверните действие: Метод — POST. Заголовки: добавьте «Authorization» со значением «Bearer ваш_ключ».' }),
      el('li', { text: 'Текст запроса — JSON. Поля: lat — переменная «Текущее местоположение», нажмите на неё и выберите «Широта»; lon — то же, «Долгота»; date — переменная «Текущая дата».' }),
      el('li', { text: 'Сохраните. Сделайте ещё такие же автоматизации на 15:00 и 22:00 и на событие «Авиарежим выключен» — так страна отметится сразу после посадки.' }),
    ])]));
    const urlImp = `${origin}/api/me/import`;
    body.append(el('section', { class: 'group' }, [el('h2', { class: 'group__h', text: '3. Команда «Фото из галереи»' }), el('ol', { class: 'steps list' }, [
      el('li', { text: 'Создайте обычную команду. Действие «Найти фото»: фильтр «Дата съёмки» — «за последние» N дней (или «между» двумя датами).' }),
      el('li', { text: 'Действие «Повторить с каждым». Внутри: «Получить сведения об изображениях» → «Местоположение», затем «Получить сведения о местоположениях» → «Широта» и ещё раз → «Долгота», и «Получить сведения об изображениях» → «Дата съёмки».' }),
      el('li', { text: 'Там же действие «Текст»: Широта;Долгота;Дата съёмки — через точку с запятой. Конец повтора.' }),
      el('li', { text: 'После повтора: «Объединить текст» (через «Новая строка»).' }),
      el('li', {}, ['«Получить содержимое URL»: ', el('span', { class: 'code', text: urlImp }), ', POST, тот же заголовок Authorization, текст запроса — «Файл» с объединённым текстом.']),
      el('li', { text: 'Запустите — приложение ответит, сколько дней и стран нашлось. Повторные запуски ничего не дублируют.' }),
    ])]));
    body.append(group('В самом приложении', [
      toggle('Отмечать при открытии', !!state.settings.track_on_open, async v => { const r = await post('settings', { track_on_open: v }); if (r) state.settings = r.settings; }, 'Раз в 3 часа, если вы уже разрешили доступ к геопозиции'),
      row({ icon: 'location', color: 'var(--blue)', title: 'Отметить сейчас', chev: false, onclick: () => here() }),
      ME.inputRow('Домашняя страна', el('button', { type: 'button', class: 'row__v', text: `${flag(state.settings.home || 'TR')} ${cname(state.settings.home || 'TR')}`, onclick: () => ME.pickCountry('Домашняя страна', async c => { const r = await post('settings', { home: c }); if (r) { state.settings = r.settings; ME.render(); } }, state.settings.home) })),
    ]));
  }

  // ---------- планы поездок ----------
  function trips(box) {
    const m = dmap();
    const body = screen(box, { title: 'Планы поездок', back: '#countries', backText: 'Страны', cls: 'ct', right: [navBtn('plus', () => tripSheet(), { 'aria-label': 'Новая поездка' })] });
    const list = [...state.trips].sort((a, b) => a.start.localeCompare(b.start));
    if (!list.length) { body.append(ME.empty('Планов нет', 'Добавьте будущую поездку — правила (Шенген, резидентство) посчитают её заранее.', el('button', { type: 'button', class: 'btn btn--sm', style: '--tint:var(--orange);margin-top:12px', onclick: () => tripSheet() }, 'Добавить поездку'))); return; }
    body.append(group(null, list.map(t => {
      const warns = state.rules.filter(r => r.on && r.goal === 'max' && (r.countries || []).includes(t.country)).map(r => {
        const extra = plannedDays(r); let bad = null;
        for (let n = dn(t.start); n <= dn(t.end) && bad === null; n++) if (usage(r, m, n, extra).used > r.limit) bad = n;
        return bad === null ? null : `${r.name}: превышение с ${fmt(iso(bad))}`;
      }).filter(Boolean);
      return row({ flag: flag(t.country), title: `${cname(t.country)}${t.note ? ' · ' + t.note : ''}`, sub: `${fmt(t.start)} — ${fmt(t.end, true)} · ${days(dn(t.end) - dn(t.start) + 1)}${warns.length ? ' · ⚠️ ' + warns.join('; ') : ''}`, onclick: () => tripSheet(t) });
    }), 'Прошедшие поездки не превращаются в дни сами — отмечайте фактические дни как обычно.'));
  }
  function tripSheet(t) {
    let cc = t ? t.country : 'DE';
    const from = el('input', { type: 'date', value: t ? t.start : iso(today() + 30) }), to = el('input', { type: 'date', value: t ? t.end : iso(today() + 37) });
    const note = el('input', { class: 'l', value: t ? t.note : '', placeholder: 'Заметка', maxLength: 200 });
    const cRow = el('div');
    const drawC = () => cRow.replaceChildren(row({ flag: flag(cc), title: cname(cc), sub: 'Страна', onclick: () => ME.pickCountry('Страна', c => { cc = c; tripSheet({ ...(t || {}), country: c, start: from.value, end: to.value, note: note.value, id: t && t.id }); }, cc) }));
    drawC();
    sheet({ title: t && t.id ? 'Поездка' : 'Новая поездка', body: [el('div', { class: 'group' }, el('div', { class: 'list' }, cRow)), group(null, [ME.inputRow('С', from), ME.inputRow('По', to), el('div', { class: 'row' }, note)]),
      t && t.id ? group(null, [row({ title: 'Удалить поездку', cls: 'row--danger', chev: false, onclick: async () => { if (await remove('trips', t.id)) { closeSheet(); ME.render(); } } })]) : null], done: async () => {
      if (!(to.value >= from.value)) { toast('Проверьте даты', true); return false; }
      const rec = await save('trips', t && t.id, { country: cc, start: from.value, end: to.value, note: note.value });
      if (!rec) return false; ME.render(); return true;
    } });
  }

  ME.views.countries = (box, args) => {
    const [v, a] = args;
    if (v === 'cal') return calendar(box, a);
    if (v === 'c') return country(box, a);
    if (v === 'rules') return rules(box);
    if (v === 'rule') return rule(box, a);
    if (v === 'gaps') return gapsView(box);
    if (v === 'import') return importView(box);
    if (v === 'setup') return setup(box);
    if (v === 'trips') return trips(box);
    return main(box);
  };
  ME.countries = { usage, counts, noData, yearRange, tracked, here, addMenu, dmap, pingOnOpen };
})();
