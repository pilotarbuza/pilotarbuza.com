/* pilotarbuza.com/me — «Деньги»: расходы и доходы в разных валютах с пересчётом в основную, категории, бюджет на месяц,
   подписки (напоминание накануне списания) и долги. Адреса: #money, #money/subs, #money/debts, #money/budget. */
(() => {
  const { el, icon, state, screen, navBtn, group, row, sheet, closeSheet, menu, ask, toast, save, remove, go, plural, dn, iso, today, todayIso, parts, fmt, MONTHS, MON_G, WDL, money, convert, CUR } = ME;
  const EXP = [['Еда', '🍔', '#FF9500'], ['Продукты', '🛒', '#34C759'], ['Транспорт', '🚕', '#FFCC00'], ['Авиа', '✈️', '#5AC8FA'], ['Жильё', '🏠', '#AF52DE'],
    ['Связь', '📱', '#5856D6'], ['Учёба', '🎓', '#007AFF'], ['Здоровье', '💊', '#FF2D55'], ['Спорт', '🏋️', '#30B0C7'], ['Одежда', '👕', '#A2845E'],
    ['Развлечения', '🎬', '#FF3B30'], ['Подарки', '🎁', '#FF6482'], ['Подписки', '🔁', '#8E8E93'], ['Путешествия', '🧳', '#0A84FF'], ['Анемос', '🛩️', '#0E7C86'], ['Другое', '📦', '#636366']];
  const INC = [['Зарплата', '💼', '#34C759'], ['Стипендия', '🎓', '#007AFF'], ['Подработка', '🛠️', '#FF9500'], ['Подарок', '🎁', '#FF6482'], ['Возврат', '↩️', '#30B0C7'], ['Другое', '💰', '#8E8E93']];
  const cats = kind => (kind === 'income' ? INC : (state.settings.money_categories || EXP));
  const catOf = (kind, name) => cats(kind).find(c => c[0] === name) || ['Другое', kind === 'income' ? '💰' : '📦', '#8E8E93'];
  const CURS = ['TRY', 'RUB', 'USD', 'EUR'];
  const base = () => state.settings.base_currency || 'TRY';
  const inBase = (v, cur) => { const x = convert(v, cur, base()); return x === null ? null : x; };
  const PERIOD = { week: 'в неделю', month: 'в месяц', quarter: 'в квартал', year: 'в год' };
  const monthly = s => { const v = inBase(s.amount, s.currency) || 0; return { week: v * 52 / 12, month: v, quarter: v / 3, year: v / 12 }[s.period] || v; };
  const addPeriod = (d, p) => { const x = new Date(d + 'T00:00:00Z'); if (p === 'week') x.setUTCDate(x.getUTCDate() + 7); else x.setUTCMonth(x.getUTCMonth() + ({ month: 1, quarter: 3, year: 12 }[p] || 1)); return x.toISOString().slice(0, 10); };

  const tabs = cur => ME.seg([['ops', 'Операции'], ['subs', 'Подписки'], ['debts', 'Долги'], ['budget', 'Бюджет']], cur, v => go(v === 'ops' ? 'money' : `money/${v}`));
  const ym = () => state.ui.moneyMonth || todayIso().slice(0, 7);
  const monthTx = m => state.tx.filter(t => t.date.slice(0, 7) === m);

  // ---------- операции ----------
  function ops(box) {
    const m = ym(), [y, mo] = m.split('-').map(Number);
    const body = screen(box, { title: 'Деньги', back: '#more', backText: 'Ещё', cls: 'money', right: [navBtn('more', moneyMenu, { 'aria-label': 'Настройки' }), navBtn('plus', () => txSheet(), { 'aria-label': 'Новая операция' })] });
    body.append(tabs('ops'));
    const list = monthTx(m), exp = list.filter(t => t.kind === 'expense'), inc = list.filter(t => t.kind === 'income');
    const sum = arr => arr.reduce((s, t) => s + (inBase(t.amount, t.currency) ?? 0), 0);
    const total = sum(exp), totalIn = sum(inc), unknown = list.filter(t => inBase(t.amount, t.currency) === null).length;
    const shift = k => { const d = new Date(Date.UTC(y, mo - 1 + k, 1)); state.ui.moneyMonth = d.toISOString().slice(0, 7); ME.saveUi(); ME.render(); };
    const byCat = {}; exp.forEach(t => { byCat[t.category || 'Другое'] = (byCat[t.category || 'Другое'] || 0) + (inBase(t.amount, t.currency) ?? 0); });
    const catList = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    body.append(el('section', { class: 'mn-hero' }, [
      el('div', { class: 'mn-hero__m' }, [el('button', { type: 'button', 'aria-label': 'Предыдущий месяц', onclick: () => shift(-1) }, icon('back')), el('b', { text: `${MONTHS[mo - 1]} ${y}` }), el('button', { type: 'button', 'aria-label': 'Следующий месяц', onclick: () => shift(1), disabled: m >= todayIso().slice(0, 7) }, icon('chev'))]),
      el('div', { class: 'card' }, [
        el('div', { class: 'muted', style: 'font-size:15px', text: 'Расходы' }),
        el('div', { class: 'mn-hero__sum' }, money(total, base(), 0)),
        el('div', { class: 'mn-hero__row' }, [el('span', { text: `Доходы ${money(totalIn, base(), 0)}` }), el('span', { class: totalIn - total >= 0 ? 'ok' : 'late', text: `Итог ${totalIn - total >= 0 ? '+' : '−'}${money(Math.abs(totalIn - total), base(), 0)}` })]),
        catList.length ? el('div', { class: 'stack' }, catList.map(([c, v]) => el('i', { style: `width:${v / total * 100}%;background:${catOf('expense', c)[2]}`, title: c }))) : null,
        unknown ? el('p', { class: 'muted', style: 'font-size:13px;margin:6px 0 0', text: `${unknown} ${plural(unknown, 'операция', 'операции', 'операций')} без курса — не вошли в итог.` }) : null,
      ]),
    ]));
    if (catList.length) {
      const budgets = Object.fromEntries(state.budgets.map(b => [b.category, inBase(b.amount, b.currency)]));
      body.append(group('По категориям', catList.map(([c, v]) => {
        const [n, e, col] = catOf('expense', c), b = budgets[c];
        return row({ lead: el('span', { class: 'cat-ico', style: `--c:${col}`, text: e }), title: n, sub: b ? `${Math.round(v / b * 100)}% от бюджета ${money(b, base(), 0)}` : `${Math.round(v / total * 100)}%`, value: el('span', { class: 'amt' + (b && v > b ? ' late' : ''), text: money(v, base(), 0) }) });
      })));
    }
    if (!list.length) { body.append(ME.empty('Операций нет', 'Нажмите «+», чтобы записать расход или доход.')); return; }
    const byDay = new Map();
    [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).forEach(t => { if (!byDay.has(t.date)) byDay.set(t.date, []); byDay.get(t.date).push(t); });
    byDay.forEach((ts, d) => {
      const n = dn(d), daySum = ts.reduce((s, t) => s + (t.kind === 'expense' ? -1 : 1) * (inBase(t.amount, t.currency) ?? 0), 0);
      body.append(group(el('h2', { class: 'group__h' }, [el('span', { text: n === today() ? 'Сегодня' : n === today() - 1 ? 'Вчера' : `${fmt(d)}, ${WDL[ME.wday(n)]}` }), el('span', { text: `${daySum > 0 ? '+' : ''}${money(daySum, base(), 0)}` })]), ts.map(txRow)));
    });
  }
  const txRow = t => {
    const [n, e, col] = catOf(t.kind, t.category);
    const conv = t.currency !== base() ? inBase(t.amount, t.currency) : null;
    return row({ lead: el('span', { class: 'cat-ico', style: `--c:${col}`, text: e }), title: t.note || n, sub: [t.note ? n : null, t.account].filter(Boolean).join(' · ') || null,
      value: el('span', { class: 'amt' + (t.kind === 'income' ? ' amt--in' : '') }, [`${t.kind === 'income' ? '+' : '−'}${money(t.amount, t.currency)}`, conv !== null ? el('small', { text: `≈ ${money(conv, base(), 0)}` }) : null]), onclick: () => txSheet(t), chev: false });
  };

  function txSheet(t, preset = {}) {
    const x = t ? { ...t } : { kind: 'expense', currency: state.ui.lastCur || base(), date: todayIso(), category: '', ...preset };
    const amount = el('input', { type: 'text', inputmode: 'decimal', value: x.amount ? String(x.amount).replace('.', ',') : '', placeholder: '0', 'aria-label': 'Сумма', autocomplete: 'off' });
    const note = el('input', { class: 'l', value: x.note || '', placeholder: 'Комментарий', maxLength: 300 });
    const account = el('input', { value: x.account || state.ui.lastAcc || '', placeholder: 'Карта, наличные…', maxLength: 40, list: 'me-accounts' });
    const date = el('input', { type: 'date', value: x.date });
    const accList = el('datalist', { id: 'me-accounts' }, [...new Set(state.tx.map(t => t.account).filter(Boolean))].map(a => el('option', { value: a })));
    const box = el('div');
    const draw = () => box.replaceChildren(...[
      ME.seg([['expense', 'Расход'], ['income', 'Доход']], x.kind, v => { x.kind = v; x.category = ''; draw(); }),
      el('div', { class: 'keypad-amt' }, [amount, el('div', { class: 'chips' }, [...new Set([...CURS, base(), x.currency])].map(c => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(c === x.currency), text: `${CUR[c] || ''} ${c}`.trim(), onclick: () => { x.currency = c; draw(); } })))]),
      el('div', { class: 'group' }, el('div', { class: 'cat-grid' }, cats(x.kind).map(([n, e, c]) => el('button', { type: 'button', style: `--c:${c}`, 'aria-pressed': String(x.category === n), onclick: () => { x.category = n; draw(); } }, [el('span', { class: 'cat-ico', style: `--c:${c}`, text: e }), n])))),
      group(null, [el('div', { class: 'row' }, note), ME.inputRow('Дата', date), ME.inputRow('Счёт', account), accList]),
      t ? group(null, [row({ title: 'Удалить операцию', cls: 'row--danger', chev: false, onclick: async () => { if (await remove('tx', t.id)) { closeSheet(); ME.render(); toast('Удалено'); } } })]) : null,
    ].filter(Boolean));
    draw();
    sheet({ title: t ? 'Операция' : 'Новая операция', doneText: t ? 'Готово' : 'Добавить', body: box, done: async () => {
      const v = Number(amount.value.replace(/\s/g, '').replace(',', '.'));
      if (!(v > 0)) { amount.focus(); toast('Введите сумму', true); return false; }
      const data = { kind: x.kind, amount: v, currency: x.currency, category: x.category || 'Другое', date: date.value || todayIso(), note: note.value.trim(), account: account.value.trim(), sub: x.sub || null };
      const rec = await save('tx', t && t.id, data);
      if (!rec) return false;
      state.ui.lastCur = data.currency; state.ui.lastAcc = data.account; ME.saveUi();
      ME.render(); toast(t ? 'Сохранено' : `${data.kind === 'income' ? '+' : '−'}${money(v, data.currency)} · ${data.category}`); return true;
    } });
    if (!t) setTimeout(() => amount.focus(), 280);
  }

  function moneyMenu() {
    menu('Деньги', [
      { icon: 'money', text: `Основная валюта: ${base()}`, sub: 'В ней считаются итоги', fn: () => menu('Основная валюта', [...new Set([...CURS, 'GEL', 'AZN', 'GBP'])].map(c => ({ icon: 'money', text: `${CUR[c] || ''} ${c}`, fn: async () => { const r = await ME.post('settings', { base_currency: c }); if (r) { state.settings = r.settings; ME.render(); } } }))) },
      { icon: 'repeat', text: 'Курсы валют', sub: state.rates && state.rates.at ? `Обновлены ${ME.ago(state.rates.at)}` : 'Ещё не загружены', fn: showRates },
      { icon: 'file', text: 'Выгрузить CSV', fn: exportCsv },
    ]);
  }
  function showRates() {
    const b = base();
    sheet({ title: 'Курсы', body: group(`За 1 ${b}`, CURS.concat(['GEL', 'AZN', 'GBP']).filter(c => c !== b).map(c => { const v = convert(1, b, c); return row({ title: c, value: v === null ? '—' : v.toLocaleString('ru-RU', { maximumFractionDigits: 4 }) }); }), 'Источник — open.er-api.com, обновляются на сервере раз в 12 часов.') });
  }
  function exportCsv() {
    const rows = [['date', 'kind', 'amount', 'currency', 'category', 'account', 'note'], ...[...state.tx].sort((a, b) => a.date.localeCompare(b.date)).map(t => [t.date, t.kind, String(t.amount), t.currency, t.category || '', t.account || '', t.note || ''])];
    const csv = '﻿' + rows.map(r => r.map(v => /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : (/^[=+\-@]/.test(v) && isNaN(v) ? "'" + v : v)).join(';')).join('\n');
    const f = new File([csv], `money-${todayIso()}.csv`, { type: 'text/csv' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f] }).catch(() => {});
    else { const a = el('a', { href: URL.createObjectURL(f), download: f.name }); document.body.append(a); a.click(); a.remove(); }
  }

  // ---------- подписки ----------
  function subs(box) {
    const body = screen(box, { title: 'Подписки', back: '#money', backText: 'Деньги', cls: 'money', right: [navBtn('plus', () => subSheet(), { 'aria-label': 'Новая подписка' })] });
    body.append(tabs('subs'));
    const act = state.subs.filter(s => s.active).sort((a, b) => (a.next || '9').localeCompare(b.next || '9')), off = state.subs.filter(s => !s.active);
    const total = act.reduce((s, x) => s + monthly(x), 0);
    body.append(el('div', { class: 'mn-hero' }, el('div', { class: 'card' }, [el('div', { class: 'muted', style: 'font-size:15px', text: 'В месяц' }), el('div', { class: 'mn-hero__sum', text: money(total, base(), 0) }), el('div', { class: 'mn-hero__row', text: `В год ≈ ${money(total * 12, base(), 0)} · ${act.length} ${plural(act.length, 'подписка', 'подписки', 'подписок')}` })])));
    const sRow = s => {
      const n = s.next ? dn(s.next) - today() : null;
      return row({ lead: el('span', { class: 'cat-ico', style: `--c:${catOf('expense', s.category || 'Подписки')[2]}`, text: catOf('expense', s.category || 'Подписки')[1] }), title: s.name,
        sub: `${money(s.amount, s.currency)} ${PERIOD[s.period]}${s.next ? ` · ${n === 0 ? 'сегодня' : n === 1 ? 'завтра' : n < 0 ? `просрочено ${fmt(s.next)}` : fmt(s.next)}` : ''}`,
        value: s.active && s.next && n <= 3 ? el('button', { type: 'button', class: 'btn btn--sm', onclick: e => { e.stopPropagation(); paid(s); } }, 'Оплачено') : null, onclick: () => subSheet(s) });
    };
    if (act.length) body.append(group('Активные', act.map(sRow), 'Накануне списания придёт уведомление. «Оплачено» записывает расход и переносит дату на следующий период.'));
    if (off.length) body.append(group('Приостановлены', off.map(sRow)));
    if (!state.subs.length) body.append(ME.empty('Подписок нет', 'Добавьте телефон, облако, музыку — увидите, сколько уходит в месяц.'));
  }
  async function paid(s) {
    const tx = await save('tx', null, { kind: 'expense', amount: s.amount || 0, currency: s.currency, category: s.category || 'Подписки', date: todayIso(), note: s.name, sub: s.id });
    if (!tx) return;
    await save('subs', s.id, { next: addPeriod(s.next || todayIso(), s.period) });
    ME.render(); toast(`${s.name}: записано, следующее ${fmt(state.subs.find(x => x.id === s.id).next)}`);
  }
  function subSheet(s) {
    const x = s ? { ...s } : { period: 'month', currency: base(), active: true, next: todayIso(), category: 'Подписки' };
    const name = el('input', { class: 'l', value: x.name || '', placeholder: 'Название', maxLength: 120 });
    const amount = el('input', { inputmode: 'decimal', value: x.amount ? String(x.amount).replace('.', ',') : '', placeholder: '0' });
    const cur = el('select', {}, [...new Set([...CURS, x.currency])].map(c => el('option', { value: c, text: c, selected: c === x.currency })));
    const per = el('select', {}, Object.entries(PERIOD).map(([k, v]) => el('option', { value: k, text: v, selected: k === x.period })));
    const next = el('input', { type: 'date', value: x.next || '' });
    const cat = el('select', {}, cats('expense').map(([n]) => el('option', { value: n, text: n, selected: n === x.category })));
    sheet({ title: s ? 'Подписка' : 'Новая подписка', body: [
      group(null, [el('div', { class: 'row' }, name), ME.inputRow('Сумма', amount), ME.inputRow('Валюта', cur), ME.inputRow('Как часто', per), ME.inputRow('Следующее списание', next), ME.inputRow('Категория', cat)]),
      group(null, [ME.toggle('Активна', x.active !== false, v => { x.active = v; })]),
      s ? group(null, [row({ title: 'Удалить подписку', cls: 'row--danger', chev: false, onclick: async () => { if (await ask(`Удалить «${s.name}»?`) && await remove('subs', s.id)) { closeSheet(); ME.render(); } } })]) : null,
    ], done: async () => {
      if (!name.value.trim()) { name.focus(); return false; }
      const rec = await save('subs', s && s.id, { name: name.value.trim(), amount: Number(amount.value.replace(',', '.')) || 0, currency: cur.value, period: per.value, next: next.value || null, category: cat.value, active: x.active !== false });
      if (!rec) return false; ME.render(); return true;
    } });
  }

  // ---------- долги ----------
  function debts(box) {
    const body = screen(box, { title: 'Долги', back: '#money', backText: 'Деньги', cls: 'money', right: [navBtn('plus', () => debtSheet(), { 'aria-label': 'Новый долг' })] });
    body.append(tabs('debts'));
    const open = state.debts.filter(d => !d.settled), done = state.debts.filter(d => d.settled);
    const tot = dir => open.filter(d => d.dir === dir).reduce((s, d) => s + (inBase(d.amount, d.currency) ?? 0), 0);
    body.append(el('div', { class: 'hm-tiles' }, [
      el('div', { class: 'tile', style: '--c:var(--green)' }, [el('span', { class: 'tile__k', text: 'Мне должны' }), el('span', { class: 'tile__v', text: money(tot('they_owe'), base(), 0) })]),
      el('div', { class: 'tile', style: '--c:var(--red)' }, [el('span', { class: 'tile__k', text: 'Я должен' }), el('span', { class: 'tile__v', text: money(tot('i_owe'), base(), 0) })]),
    ]));
    const dRow = d => row({ icon: d.dir === 'they_owe' ? 'people' : 'money', color: d.dir === 'they_owe' ? 'var(--green)' : 'var(--red)', title: d.person,
      sub: [d.note, d.due ? `вернуть до ${fmt(d.due)}` : null].filter(Boolean).join(' · ') || (d.date ? fmt(d.date) : null),
      value: el('span', { class: 'amt' + (d.dir === 'they_owe' ? ' amt--in' : ''), text: money(d.amount, d.currency) }), onclick: () => debtSheet(d) });
    if (open.length) body.append(group('Открытые', open.sort((a, b) => (a.due || '9').localeCompare(b.due || '9')).map(dRow)));
    if (done.length) body.append(group('Закрытые', done.slice(-20).reverse().map(dRow)));
    if (!state.debts.length) body.append(ME.empty('Долгов нет', 'Запишите, кто кому сколько должен, — в срок придёт напоминание.'));
  }
  function debtSheet(d) {
    const x = d ? { ...d } : { dir: 'they_owe', currency: base(), date: todayIso(), settled: false };
    const person = el('input', { class: 'l', value: x.person || '', placeholder: 'Кто', maxLength: 120 });
    const amount = el('input', { inputmode: 'decimal', value: x.amount ? String(x.amount).replace('.', ',') : '', placeholder: '0' });
    const cur = el('select', {}, [...new Set([...CURS, x.currency])].map(c => el('option', { value: c, text: c, selected: c === x.currency })));
    const due = el('input', { type: 'date', value: x.due || '' });
    const note = el('input', { value: x.note || '', placeholder: 'За что', maxLength: 300 });
    const box = el('div');
    const draw = () => box.replaceChildren(...[
      ME.seg([['they_owe', 'Мне должны'], ['i_owe', 'Я должен']], x.dir, v => { x.dir = v; draw(); }),
      group(null, [el('div', { class: 'row' }, person), ME.inputRow('Сумма', amount), ME.inputRow('Валюта', cur), ME.inputRow('За что', note), ME.inputRow('Вернуть до', due)]),
      d ? group(null, [ME.toggle('Вернули', !!x.settled, v => { x.settled = v; })]) : null,
      d ? group(null, [row({ title: 'Удалить', cls: 'row--danger', chev: false, onclick: async () => { if (await remove('debts', d.id)) { closeSheet(); ME.render(); } } })]) : null,
    ].filter(Boolean));
    draw();
    sheet({ title: d ? 'Долг' : 'Новый долг', body: box, done: async () => {
      if (!person.value.trim()) { person.focus(); return false; }
      const rec = await save('debts', d && d.id, { person: person.value.trim(), dir: x.dir, amount: Number(amount.value.replace(',', '.')) || 0, currency: cur.value, due: due.value || null, note: note.value, date: x.date, settled: !!x.settled });
      if (!rec) return false; ME.render(); return true;
    } });
  }

  // ---------- бюджет ----------
  function budget(box) {
    const body = screen(box, { title: 'Бюджет', back: '#money', backText: 'Деньги', cls: 'money' });
    body.append(tabs('budget'));
    const m = todayIso().slice(0, 7), spent = {};
    monthTx(m).filter(t => t.kind === 'expense').forEach(t => { spent[t.category || 'Другое'] = (spent[t.category || 'Другое'] || 0) + (inBase(t.amount, t.currency) ?? 0); });
    const p = parts(today()), dim = new Date(Date.UTC(p.y, p.m + 1, 0)).getUTCDate(), passed = p.d / dim;
    const limTotal = state.budgets.reduce((s, b) => s + (inBase(b.amount, b.currency) ?? 0), 0), spTotal = state.budgets.reduce((s, b) => s + (spent[b.category] || 0), 0);
    if (state.budgets.length) body.append(el('div', { class: 'mn-hero' }, el('div', { class: 'card' }, [el('div', { class: 'muted', style: 'font-size:15px', text: `${MONTHS[p.m]}: потрачено из бюджета` }), el('div', { class: 'mn-hero__sum' }, [money(spTotal, base(), 0), el('small', { text: ` / ${money(limTotal, base(), 0)}` })]),
      el('div', { class: 'bar', style: `margin-top:10px;height:10px;--c:${spTotal > limTotal ? 'var(--red)' : spTotal / limTotal > passed ? 'var(--orange)' : 'var(--green)'}` }, el('i', { style: `width:${Math.min(100, spTotal / (limTotal || 1) * 100)}%` })),
      el('div', { class: 'mn-hero__row', text: `Прошло ${Math.round(passed * 100)}% месяца · осталось ${money(Math.max(0, limTotal - spTotal), base(), 0)}` })])));
    body.append(group('Лимиты на месяц', cats('expense').map(([n, e, c]) => {
      const b = state.budgets.find(x => x.category === n), lim = b ? inBase(b.amount, b.currency) : null, sp = spent[n] || 0;
      return row({ lead: el('span', { class: 'cat-ico', style: `--c:${c}`, text: e }), title: n, sub: lim ? `${money(sp, base(), 0)} из ${money(lim, base(), 0)}` : sp ? `потрачено ${money(sp, base(), 0)}` : 'без лимита',
        value: lim ? el('span', { class: 'amt' + (sp > lim ? ' late' : ''), text: `${Math.round(sp / lim * 100)}%` }) : null, onclick: () => budgetSheet(n, b) });
    }), 'Оранжевый — тратите быстрее, чем идёт месяц, красный — лимит превышен.'));
  }
  function budgetSheet(cat, b) {
    const amount = el('input', { inputmode: 'decimal', value: b ? String(b.amount).replace('.', ',') : '', placeholder: 'Без лимита' });
    sheet({ title: cat, body: group(null, [ME.inputRow(`Лимит, ${base()}`, amount)], 'Пустое поле — убрать лимит.'), done: async () => {
      const v = Number(amount.value.replace(/\s/g, '').replace(',', '.'));
      if (!amount.value.trim()) { if (b) await remove('budgets', b.id); ME.render(); return true; }
      if (!(v > 0)) return false;
      if (!await save('budgets', b && b.id, { category: cat, amount: v, currency: base() })) return false;
      ME.render(); return true;
    } });
  }

  ME.views.money = (box, args) => (args[0] === 'subs' ? subs(box) : args[0] === 'debts' ? debts(box) : args[0] === 'budget' ? budget(box) : ops(box));
  ME.fin = { subSheet, txSheet, monthTx, inBase, base, monthly };
})();
