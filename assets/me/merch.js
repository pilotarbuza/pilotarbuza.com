/* pilotarbuza.com/me — «Мерч»: предзаказы из магазина /shop/ (бывшая страница /admin/), сводка спроса, статусы и заметки.
   Данные — server/orders.py (/api/admin/orders). Всё, что ввёл покупатель, попадает на страницу только как текст. Адрес: #merch. */
(() => {
  const { el, icon, state, screen, navBtn, group, row, toast, ask, plural } = ME;
  const STATUS = { new: 'Новый', confirmed: 'Подтверждён', paid: 'Оплачен', shipped: 'Отправлен', done: 'Выполнен', cancelled: 'Отменён' };
  const COLOR = { new: '#FF5C73', confirmed: '#4A5AD6', paid: '#4FB872', shipped: '#C9A227', done: '#9AAABD', cancelled: '#43536A' };
  const CW = { sky_on_cloud: 'Небо на облаке', bordo_on_cloud: 'Бордо на облаке', cloud_on_bordo: 'Облако на бордо', high_on_night: 'Высота на ночном', white_on_sky: 'Белый на небе' };
  const VIA = { telegram: 'Telegram', whatsapp: 'WhatsApp', email: 'Email' };
  const m = { orders: null, prints: {}, filter: 'all', q: '' };

  const load = async () => {
    const r = await ME.api('admin/orders');
    if (!r.ok) throw new Error(await ME.why(r));
    const d = await r.json(); m.orders = d.orders; m.prints = d.prints; state.orders = d.orders;
  };
  ME.merch = { load, open: () => (m.orders || state.orders || []).filter(o => o.status === 'new').length };
  const patch = async (o, data) => {
    const r = await ME.api('admin/orders/' + o.id, { method: 'PATCH', body: JSON.stringify(data) });
    if (!r.ok) { toast('Не удалось сохранить', true); return false; }
    Object.assign(o, data); return true;
  };
  function contact(o) {
    const v = o.contact.trim();
    let href = '';
    if (o.contact_type === 'telegram' && /^@?[A-Za-z0-9_]{4,32}$/.test(v)) href = 'https://t.me/' + v.replace('@', '');
    else if (o.contact_type === 'email' && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(v)) href = 'mailto:' + v;
    else if (/^\+?[\d\s()-]{7,20}$/.test(v)) href = (o.contact_type === 'whatsapp' ? 'https://wa.me/' : 'tel:+') + v.replace(/\D/g, '');
    return href ? el('a', { href, target: '_blank', rel: 'noopener noreferrer', text: v }) : document.createTextNode(v);
  }

  function orderSheet(o) {
    const st = el('select', { 'aria-label': 'Статус' }, Object.entries(STATUS).map(([k, t]) => el('option', { value: k, text: t, selected: k === o.status })));
    const note = el('textarea', { value: o.note || '', placeholder: 'Заметка для себя', maxLength: 1000 });
    const when = new Date(o.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    ME.sheet({ title: `Предзаказ № ${o.id}`, body: [
      el('div', { class: 'group' }, el('div', { class: 'card mc-card' }, [
        el('img', { src: `/assets/img/shop/${encodeURIComponent(o.print)}-${encodeURIComponent(o.colorway)}.webp`, alt: '', width: 96, height: 90 }),
        el('div', {}, [el('b', { text: m.prints[o.print] || o.print }), el('p', { class: 'muted', text: `${CW[o.colorway] || o.colorway} · ${o.size} · ${o.qty} шт.` }), el('p', { class: 'muted', text: when })]),
      ])),
      group('Покупатель', [
        row({ title: o.name, sub: o.city || null }),
        el('div', { class: 'row' }, [el('span', { class: 'row__lbl', text: VIA[o.contact_type] || o.contact_type }), el('span', { class: 'row__v', style: 'margin-left:auto' }, contact(o))]),
        o.comment ? el('div', { class: 'row', style: 'white-space:pre-wrap;display:block', text: o.comment }) : null,
      ]),
      group(null, [ME.inputRow('Статус', st), el('div', { class: 'row' }, note)]),
      group(null, [row({ title: 'Удалить предзаказ', cls: 'row--danger', chev: false, onclick: async () => {
        if (!await ask(`Удалить предзаказ № ${o.id} (${o.name}) без возможности восстановления?`)) return;
        const r = await ME.api('admin/orders/' + o.id, { method: 'DELETE' });
        if (r.ok) { m.orders = m.orders.filter(x => x.id !== o.id); ME.closeSheet(); ME.render(); toast(`№ ${o.id} удалён`); }
      } })]),
    ], done: async () => {
      const data = {};
      if (st.value !== o.status) data.status = st.value;
      if (note.value !== (o.note || '')) data.note = note.value;
      if (Object.keys(data).length && !await patch(o, data)) return false;
      ME.render(); return true;
    } });
  }

  function demand() {
    const live = m.orders.filter(o => o.status !== 'cancelled');
    if (!live.length) return null;
    const prints = ['buttons', 'flap', 'autopilot', 'holding', '1500'].filter(p => p in m.prints), cws = Object.keys(CW);
    const sum = f => live.filter(f).reduce((n, o) => n + o.qty, 0), total = sum(() => true);
    const max = Math.max(1, ...prints.flatMap(p => cws.map(c => sum(o => o.print === p && o.colorway === c))));
    const cell = (n, heat) => el('td', { class: n ? (heat ? 'hot' : '') : 'zero', style: n && heat ? `--k:${n / max}` : null, text: n || '·' });
    return el('section', { class: 'group' }, [el('h2', { class: 'group__h' }, [el('span', { text: 'Спрос' }), el('span', { class: 'muted', style: 'font-size:13px;font-weight:400', text: `${total} шт. без отменённых` })]), el('div', { class: 'card mc-dm' }, [
      el('div', { class: 'mc-scroll' }, el('table', {}, [
        el('thead', {}, el('tr', {}, [el('th', { text: 'Принт' }), ...cws.map(c => el('th', { text: CW[c] })), el('th', { text: 'Всего' })])),
        el('tbody', {}, prints.map(p => el('tr', {}, [el('td', { text: m.prints[p] }), ...cws.map(c => cell(sum(o => o.print === p && o.colorway === c), true)), cell(sum(o => o.print === p))]))),
        el('tfoot', {}, el('tr', {}, [el('td', { text: 'Всего' }), ...cws.map(c => cell(sum(o => o.colorway === c))), cell(total)])),
      ])),
      el('div', { class: 'chips', style: 'margin-top:12px' }, ['XS', 'S', 'M', 'L', 'XL', 'XXL'].map(z => el('span', { class: 'chip' }, [z, el('b', { text: String(sum(o => o.size === z)) })]))),
    ])]);
  }

  ME.views.merch = box => {
    const body = screen(box, { title: 'Мерч', back: '#more', backText: 'Ещё', right: [
      navBtn('file', () => { location.href = '/api/admin/orders.csv'; }, { 'aria-label': 'Скачать CSV' }),
      navBtn('briefcase', () => window.open('/shop/', '_blank'), { 'aria-label': 'Магазин' }),
    ] });
    if (!m.orders) { body.append(el('p', { class: 'muted', style: 'text-align:center', text: 'Загружаю…' })); load().then(() => { if (ME.cur.view === 'merch') ME.render(); }).catch(e => body.replaceChildren(ME.empty('Заказы не загрузились', e.message))); return; }
    const count = k => m.orders.filter(o => k === 'all' || o.status === k).length;
    const qty = m.orders.filter(o => o.status !== 'cancelled').reduce((n, o) => n + o.qty, 0);
    body.append(el('div', { class: 'hm-gate dark dots', style: 'margin-bottom:16px' }, [el('span', { class: 'hm-gate__n doto led', text: String(m.orders.length) }),
      el('span', {}, [el('b', { text: plural(m.orders.length, 'предзаказ', 'предзаказа', 'предзаказов') }), el('span', { text: `${count('new')} новых · ${qty} шт. футболок` })])]));
    body.append(el('div', { class: 'chips mc-filter' }, ['all', ...Object.keys(STATUS)].map(k => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(m.filter === k), onclick: () => { m.filter = k; ME.render(); } }, [k === 'all' ? 'Все' : STATUS[k], el('b', { text: String(count(k)), style: 'opacity:.55;margin-left:4px' })]))));
    const q = el('input', { type: 'search', placeholder: 'Имя, контакт, город, №', value: m.q });
    const list = el('div');
    const draw = () => {
      m.q = q.value.trim().toLowerCase();
      const rows = m.orders.filter(o => (m.filter === 'all' || o.status === m.filter) && (!m.q || [o.id, o.name, o.contact, o.city, o.comment, o.note, m.prints[o.print]].join(' ').toLowerCase().includes(m.q)));
      list.replaceChildren(rows.length ? group(null, rows.map(o => row({
        lead: el('img', { class: 'mc-thumb', src: `/assets/img/shop/${encodeURIComponent(o.print)}-${encodeURIComponent(o.colorway)}.webp`, alt: '', loading: 'lazy', width: 44, height: 41 }),
        title: `№ ${o.id} · ${m.prints[o.print] || o.print}`, sub: `${o.name} · ${o.size} × ${o.qty}${o.city ? ' · ' + o.city : ''}`,
        value: el('span', { class: 'mc-st', style: `--c:${COLOR[o.status]}`, text: STATUS[o.status] }), onclick: () => orderSheet(o),
      }))) : ME.empty(m.orders.length ? 'Ничего не найдено' : 'Предзаказов пока нет'));
    };
    q.addEventListener('input', draw);
    body.append(el('div', { class: 'search' }, [icon('search'), q]), list);
    draw();
    const dm = demand();
    if (dm) body.append(dm);
  };
})();
