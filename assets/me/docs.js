/* pilotarbuza.com/me — «Документы»: паспорта, визы, икамет, лицензии, медкомиссия, страховки.
   Сроки и напоминания (push за 90/30/7/1 день — server/me.py, due), номер скрыт, фото и PDF документа. Адреса: #docs, #docs/<id>. */
(() => {
  const { el, icon, state, screen, navBtn, group, row, sheet, closeSheet, ask, toast, save, remove, go, flag, cname, plural, days, dn, today, todayIso, fmt, fmtShort } = ME;
  const TYPES = {
    passport: ['Паспорт', '#B3261E', 'doc'], intpassport: ['Загранпаспорт', '#7A1F2B', 'globe'], id: ['Удостоверение', '#5856D6', 'doc'],
    visa: ['Виза', '#AF52DE', 'plane'], residence: ['Икамет / ВНЖ', '#0E7C86', 'home'], license: ['Лицензия / права', '#0A63C9', 'plane'],
    medical: ['Медкомиссия', '#248A3D', 'okcircle'], insurance: ['Страховка', '#E07800', 'okcircle'], student: ['Студенческий', '#3949AB', 'uni'], other: ['Другое', '#636366', 'file'],
  };
  const T = d => TYPES[d.type] || TYPES.other;
  const left = d => (d.expires ? dn(d.expires) - today() : null);
  const when = d => {
    const n = left(d);
    if (n === null) return ['бессрочно', 'muted'];
    if (n < 0) return [`истёк ${fmt(d.expires, true)}`, 'late'];
    if (n === 0) return ['истекает сегодня', 'late'];
    if (n <= 90) return [`через ${days(n)}`, n <= 30 ? 'late' : 'soon'];
    const y = Math.floor(n / 365), mo = Math.floor((n % 365) / 30);
    return [`ещё ${y ? `${y} ${plural(y, 'год', 'года', 'лет')}` : ''}${y && mo ? ' ' : ''}${mo ? `${mo} мес.` : ''}`.trim(), 'muted'];
  };
  const mask = num => (!num ? '' : num.length <= 4 ? num : '•••• ' + num.slice(-4));
  const files = d => state.files.filter(f => f.rec === d.id);

  function list(box) {
    const body = screen(box, { title: 'Документы', cls: 'docs', right: [navBtn('plus', () => edit(), { 'aria-label': 'Новый документ' })] });
    if (!state.docs.length) { body.append(ME.empty('Документов пока нет', 'Добавьте паспорт, визу, икамет или медкомиссию — приложение напомнит, когда пора продлевать.', el('button', { type: 'button', class: 'btn btn--sm', style: 'margin-top:12px', onclick: () => edit() }, 'Добавить документ'))); return; }
    const card = d => {
      const [w, cls] = when(d), [name, color, ic] = T(d);
      return el('a', { class: 'doc-card', href: `#docs/${d.id}` }, [
        el('span', { class: 'doc-card__ico', style: `--c:${color}` }, d.country ? el('span', { text: flag(d.country) }) : icon(ic)),
        el('span', { class: 'row__main' }, [el('span', { class: 'row__t', text: d.title }), el('span', { class: 'row__s', text: [name, d.holder, mask(d.number)].filter(Boolean).join(' · ') })]),
        el('span', { class: 'doc-card__d' }, [d.expires ? fmtShort(d.expires) : '', el('small', { class: cls, text: w })]),
      ]);
    };
    const sorted = [...state.docs].sort((a, b) => (a.expires || '9999').localeCompare(b.expires || '9999'));
    const attn = sorted.filter(d => left(d) !== null && left(d) <= 90 && left(d) >= 0), gone = sorted.filter(d => left(d) !== null && left(d) < 0);
    const ok = sorted.filter(d => !attn.includes(d) && !gone.includes(d));
    if (attn.length) body.append(group(`Скоро истекают · ${attn.length}`, attn.map(card)));
    if (ok.length) body.append(group('Действуют', ok.map(card)));
    if (gone.length) body.append(group('Истекли', gone.map(card)));
  }

  function view(box, id) {
    const d = state.docs.find(x => x.id === Number(id));
    if (!d) { go('docs'); return; }
    const [name, color] = T(d), [w, cls] = when(d);
    const body = screen(box, { title: d.title, back: '#docs', backText: 'Документы', cls: 'docs', large: false, right: [navBtn(el('span', { text: 'Изменить' }), () => edit(d))] });
    let shown = false;
    const num = el('span', { text: mask(d.number) || '—' });
    body.append(el('div', { class: 'doc-hero', style: `--c:${color}`, 'aria-label': name }, [
      el('div', { class: 'doc-hero__top' }, [el('span', { text: name.toUpperCase() }), el('span', { style: 'font-size:26px', text: d.country ? flag(d.country) : '' })]),
      el('h2', { text: d.title }),
      d.holder ? el('div', { style: 'opacity:.9', text: d.holder }) : null,
      d.number ? el('div', { class: 'doc-hero__num' }, [num,
        el('button', { type: 'button', 'aria-label': 'Показать номер', onclick: () => { shown = !shown; num.textContent = shown ? d.number : mask(d.number); } }, icon('eye')),
        el('button', { type: 'button', 'aria-label': 'Скопировать номер', onclick: () => ME.copy(d.number) }, icon('copy'))]) : null,
      el('div', { class: 'doc-hero__foot' }, [
        el('span', {}, ['Выдан', el('b', { text: d.issued ? fmtShort(d.issued) : '—' })]),
        el('span', { style: 'text-align:right' }, ['Действует до', el('b', { text: d.expires ? fmtShort(d.expires) : 'бессрочно' })]),
      ]),
    ]));
    body.append(group(null, [
      row({ title: 'Срок', value: el('span', { class: 'row__v ' + cls, text: w }) }),
      d.country ? row({ title: 'Страна', value: `${flag(d.country)} ${cname(d.country)}` }) : null,
      d.issuer ? row({ title: 'Кем выдан', sub: d.issuer }) : null,
      row({ title: 'Напоминания', value: (d.remind || []).length ? (d.remind || []).map(n => n === 0 ? 'в день' : `за ${n}`).join(', ') + ' дн.' : 'выключены' }),
    ]));
    if (d.notes) body.append(group('Заметки', [el('div', { class: 'row', style: 'white-space:pre-wrap;display:block', text: d.notes })]));
    // файлы: фото и PDF
    const fl = files(d);
    body.append(el('section', { class: 'group' }, [el('h2', { class: 'group__h', text: 'Фото и сканы' }), el('div', { class: 'list thumbs' }, [
      ...fl.map(f => el('button', { type: 'button', 'aria-label': f.name, onclick: () => fileMenu(f) }, f.type.startsWith('image/') && !/hei[cf]/.test(f.type) ? el('img', { src: `/api/me/files/${f.id}`, alt: '', loading: 'lazy' }) : [icon('file'), el('span', { text: f.type === 'application/pdf' ? 'PDF' : f.name.slice(0, 14) })])),
      el('button', { type: 'button', 'aria-label': 'Добавить фото или PDF', onclick: async () => {
        const fs = await ME.pickFiles('image/*,application/pdf,.heic', true);
        for (const f of fs) { if (f.size > 10e6) { toast(`${f.name}: больше 10 МБ`, true); continue; } await ME.upload(f.type.startsWith('image/') ? await ME.shrink(f, 2400) : f, d.id); }
        if (fs.length) ME.render();
      } }, [icon('plus'), el('span', { text: 'Добавить' })]),
    ]), el('p', { class: 'group__f', text: 'Файлы хранятся на вашем сервере и открываются только после входа.' })]));
    body.append(group(null, [row({ title: 'Удалить документ', cls: 'row--danger', chev: false, onclick: async () => { if (await ask(`Удалить «${d.title}» вместе с файлами?`) && await remove('docs', d.id)) { go('docs'); toast('Удалено'); } } })]));
  }
  const fileMenu = f => ME.menu(f.name, [
    { icon: 'eye', text: 'Открыть', fn: () => window.open(`/api/me/files/${f.id}`, '_blank', 'noopener') },
    { icon: 'trash', text: 'Удалить файл', danger: true, fn: async () => {
      if (!await ask('Удалить файл?')) return;
      const r = await ME.api(`me/files/${f.id}`, { method: 'DELETE' });
      if (r.ok) { state.files = state.files.filter(x => x.id !== f.id); ME.render(); }
    } },
  ]);

  function edit(d) {
    const x = d ? { ...d } : { type: 'passport', remind: [90, 30, 7, 1] };
    const inp = (v, ph, props = {}) => el('input', { value: v || '', placeholder: ph, ...props });
    const f = {
      title: inp(x.title, 'Например, «Загранпаспорт»', { class: 'l', maxLength: 160 }), holder: inp(x.holder, 'Имя', { maxLength: 120 }),
      number: inp(x.number, 'Номер', { maxLength: 80, autocomplete: 'off' }), issuer: inp(x.issuer, 'Орган', { maxLength: 160 }),
      issued: el('input', { type: 'date', value: x.issued || '' }), expires: el('input', { type: 'date', value: x.expires || '' }),
      notes: el('textarea', { value: x.notes || '', placeholder: 'Заметки: где лежит, что нужно для продления…', maxLength: 4000 }),
    };
    const typeSel = el('select', { 'aria-label': 'Тип' }, Object.entries(TYPES).map(([k, [n]]) => el('option', { value: k, text: n, selected: k === x.type })));
    typeSel.addEventListener('change', () => { x.type = typeSel.value; if (!f.title.value.trim()) f.title.placeholder = TYPES[x.type][0]; });
    let cc = x.country || null;
    const cBtn = el('button', { type: 'button', class: 'row__v' });
    const drawC = () => { cBtn.textContent = cc ? `${flag(cc)} ${cname(cc)}` : 'Не указана'; };
    cBtn.onclick = () => ME.pickCountry('Страна документа', c => { cc = c; drawC(); open(); }, cc);
    drawC();
    const remind = new Set(x.remind || []);
    const chips = el('div', { class: 'chips', style: 'padding:12px 16px' }, [180, 90, 60, 30, 14, 7, 1, 0].map(n => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(remind.has(n)), text: n === 0 ? 'в день' : `${n} дн.`, onclick: e => { if (remind.has(n)) remind.delete(n); else remind.add(n); e.target.setAttribute('aria-pressed', String(remind.has(n))); } })));
    const build = () => [
      group(null, [el('div', { class: 'row' }, f.title), ME.inputRow('Тип', typeSel), ME.inputRow('Страна', cBtn)]),
      group(null, [ME.inputRow('Владелец', f.holder), ME.inputRow('Номер', f.number), ME.inputRow('Кем выдан', f.issuer)]),
      group(null, [ME.inputRow('Выдан', f.issued), ME.inputRow('Действует до', f.expires)], 'Без даты окончания документ считается бессрочным.'),
      el('section', { class: 'group' }, [el('h2', { class: 'group__h', text: 'Напомнить за' }), el('div', { class: 'list' }, chips)]),
      group('Заметки', [el('div', { class: 'row' }, f.notes)]),
    ];
    const open = () => sheet({ title: d ? 'Документ' : 'Новый документ', body: build(), done: async () => {
      const data = { type: typeSel.value, title: f.title.value.trim() || TYPES[typeSel.value][0], holder: f.holder.value, number: f.number.value.trim(), issuer: f.issuer.value,
        issued: f.issued.value || null, expires: f.expires.value || null, country: cc, remind: [...remind], notes: f.notes.value };
      if (data.issued && data.expires && data.expires < data.issued) { toast('Срок раньше даты выдачи', true); return false; }
      const rec = await save('docs', d && d.id, data);
      if (!rec) return false;
      closeSheet(); go(`docs/${rec.id}`); ME.render(); toast(d ? 'Сохранено' : 'Документ добавлен'); return true;
    } });
    open();
  }

  ME.views.docs = (box, args) => (args[0] ? view(box, args[0]) : list(box));
  ME.docs = { left, when, T };
})();
