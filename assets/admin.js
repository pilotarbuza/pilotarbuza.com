/* pilotarbuza.com/admin — управление предзаказами. Данные приходят из server/orders.py после входа по паролю. */
(() => {
  const $ = s => document.querySelector(s);
  const STATUS = { new: 'Новый', confirmed: 'Подтверждён', paid: 'Оплачен', shipped: 'Отправлен', done: 'Выполнен', cancelled: 'Отменён' };
  const COLOR = { new: '#FF5C73', confirmed: '#4A5AD6', paid: '#6FD08C', shipped: '#C9A227', done: '#9AAABD', cancelled: '#43536A' };
  const CW = { sky_on_cloud: 'Небо на облаке', bordo_on_cloud: 'Бордо на облаке', cloud_on_bordo: 'Облако на бордо', high_on_night: 'Высота на ночном', white_on_sky: 'Белый на небе' };
  const VIA = { telegram: 'Telegram', whatsapp: 'WhatsApp', email: 'Email' };
  const state = { orders: [], prints: {}, filter: 'all', q: '' };
  const login = $('#login'), panel = $('#panel'), list = $('#list'), msg = $('#msg');

  // Всё, что ввёл покупатель, попадает на страницу только как текст.
  const el = (tag, props = {}, kids = []) => {
    const n = Object.assign(document.createElement(tag), props);
    [].concat(kids).forEach(k => n.append(k));
    return n;
  };
  const api = async (path, opts = {}) => {
    const r = await fetch('/api/admin/' + path, { credentials: 'same-origin', ...opts, headers: opts.body ? { 'Content-Type': 'application/json' } : {} });
    if (r.status === 401 && path !== 'login') { show(false); throw new Error('auth'); }
    return r;
  };
  const show = authed => { login.hidden = authed; panel.hidden = !authed; if (!authed) $('#password').focus(); };
  const say = text => { msg.textContent = text; clearTimeout(say.t); if (text) say.t = setTimeout(() => { msg.textContent = ''; }, 3000); };

  function contactLink(o) {
    const v = o.contact.trim();
    let href = '';
    if (o.contact_type === 'telegram' && /^@?[A-Za-z0-9_]{4,32}$/.test(v)) href = 'https://t.me/' + v.replace('@', '');
    else if (o.contact_type === 'email' && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(v)) href = 'mailto:' + v;
    else if (/^\+?[\d\s()-]{7,20}$/.test(v)) href = (o.contact_type === 'whatsapp' ? 'https://wa.me/' : 'tel:+') + v.replace(/\D/g, '');
    return href ? el('a', { href, target: '_blank', rel: 'noopener noreferrer', textContent: v }) : document.createTextNode(v);
  }

  function card(o) {
    const status = el('select', { className: 'fld-in', ariaLabel: 'Статус' }, Object.keys(STATUS).map(k => el('option', { value: k, textContent: STATUS[k], selected: k === o.status })));
    status.addEventListener('change', async () => {
      const r = await api('orders/' + o.id, { method: 'PATCH', body: JSON.stringify({ status: status.value }) });
      if (r.ok) { o.status = status.value; say(`№ ${o.id}: ${STATUS[o.status]}`); render(); } else { status.value = o.status; say('Не удалось сохранить статус'); }
    });
    const note = el('textarea', { className: 'fld-in', value: o.note, placeholder: 'Заметка для себя', maxLength: 1000 });
    note.addEventListener('change', async () => {
      const r = await api('orders/' + o.id, { method: 'PATCH', body: JSON.stringify({ note: note.value }) });
      if (r.ok) { o.note = note.value; say(`№ ${o.id}: заметка сохранена`); } else say('Не удалось сохранить заметку');
    });
    const del = el('button', { type: 'button', className: 'ord__del', textContent: 'Удалить' });
    del.addEventListener('click', async () => {
      if (!confirm(`Удалить предзаказ № ${o.id} (${o.name}) без возможности восстановления?`)) return;
      const r = await api('orders/' + o.id, { method: 'DELETE' });
      if (r.ok) { state.orders = state.orders.filter(x => x.id !== o.id); say(`№ ${o.id} удалён`); render(); } else say('Не удалось удалить');
    });
    const when = new Date(o.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const main = el('div', { className: 'ord__main' }, [
      el('span', { className: 'ord__id doto', textContent: `№ ${o.id} · ${when}` }),
      el('span', { className: 'ord__what', textContent: `${state.prints[o.print] || o.print} — ${CW[o.colorway] || o.colorway}` }),
      el('span', { className: 'ord__meta', textContent: `Размер ${o.size} · ${o.qty} шт.` }),
      el('span', { className: 'ord__meta' }, [`${o.name} · ${VIA[o.contact_type] || o.contact_type}: `, contactLink(o)]),
    ]);
    if (o.city) main.append(el('span', { className: 'ord__meta', textContent: o.city }));
    if (o.comment) main.append(el('span', { className: 'ord__comment', textContent: o.comment }));
    const art = el('article', { className: 'ord card' }, [
      el('img', { src: `/assets/img/shop/${encodeURIComponent(o.print)}-${encodeURIComponent(o.colorway)}.webp`, alt: '', loading: 'lazy', width: 96, height: 90 }),
      main, el('div', { className: 'ord__side' }, [status, note, del]),
    ]);
    art.style.setProperty('--st', COLOR[o.status] || '');
    return art;
  }

  function render() {
    const count = k => state.orders.filter(o => k === 'all' || o.status === k).length;
    $('#total').textContent = state.orders.length;
    $('#chips').replaceChildren(...['all', ...Object.keys(STATUS)].map(k => {
      const b = el('button', { type: 'button' }, [k === 'all' ? 'Все' : STATUS[k], el('b', { textContent: count(k) })]);
      b.setAttribute('aria-pressed', state.filter === k);
      b.addEventListener('click', () => { state.filter = k; render(); });
      return b;
    }));
    const q = state.q.toLowerCase();
    const rows = state.orders.filter(o => (state.filter === 'all' || o.status === state.filter)
      && (!q || [o.id, o.name, o.contact, o.city, o.comment, o.note, state.prints[o.print]].join(' ').toLowerCase().includes(q)));
    list.replaceChildren(...(rows.length ? rows.map(card) : [el('p', { className: 'ad__empty card', textContent: state.orders.length ? 'Ничего не найдено.' : 'Предзаказов пока нет.' })]));
  }

  async function load() {
    const r = await api('orders');
    if (!r.ok) return say('Не удалось загрузить заказы');
    const d = await r.json();
    state.orders = d.orders; state.prints = d.prints;
    render();
  }

  login.addEventListener('submit', async e => {
    e.preventDefault();
    const out = $('#login-msg'), pw = $('#password');
    out.textContent = '';
    let r;
    try { r = await api('login', { method: 'POST', body: JSON.stringify({ password: pw.value }) }); } catch (ex) { out.textContent = 'Сервер заказов недоступен.'; return; }
    pw.value = '';
    if (r.ok) { show(true); return load(); }
    out.textContent = r.status === 429 ? 'Слишком много попыток. Подождите 15 минут.' : r.status === 401 ? 'Неверный пароль.' : 'Сервер заказов недоступен.';
  });
  $('#logout').addEventListener('click', async () => { await api('logout', { method: 'POST', body: '{}' }).catch(() => {}); state.orders = []; list.replaceChildren(); show(false); });
  $('#search').addEventListener('input', e => { state.q = e.target.value.trim(); render(); });

  fetch('/api/admin/me', { credentials: 'same-origin' }).then(r => r.json()).then(d => { show(!!d.auth); if (d.auth) load(); })
    .catch(() => { show(false); $('#login-msg').textContent = 'Сервер заказов недоступен.'; });
})();
