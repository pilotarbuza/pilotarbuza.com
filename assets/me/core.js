/* pilotarbuza.com/me — общее: данные с сервера (server/me.py), экраны, списки, листы снизу, даты, флаги.
   Всё, что пришло с сервера, попадает на страницу как текст; HTML заметок проходит через очистку (ME.cleanHtml). */
window.ME = (() => {
  const $ = s => document.querySelector(s);
  const KINDS = ['folders', 'notes', 'docs', 'tx', 'subs', 'debts', 'budgets', 'rules', 'trips'];
  const state = { days: [], settings: {}, keys: {}, files: [], brief: [], rates: null, last_ping: null, plan: null, ui: {} };
  KINDS.forEach(k => { state[k] = []; });
  try { state.ui = JSON.parse(localStorage.getItem('me-ui') || '{}') || {}; } catch (e) { state.ui = {}; }
  const saveUi = () => { try { localStorage.setItem('me-ui', JSON.stringify(state.ui)); } catch (e) { /* без памяти браузера тоже работает */ } };

  // ---------- DOM ----------
  const el = (tag, props = {}, kids = []) => {
    const n = tag === 'svg' || tag === 'path' || tag === 'circle' || tag === 'g' ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') n.setAttribute('class', v);
      else if (k === 'text') n.textContent = v;
      else if (k === 'style') n.style.cssText = v;
      else if (k === 'value') n.value = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k in n && typeof v !== 'string' && !(n instanceof SVGElement)) n[k] = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    [].concat(kids).forEach(c => { if (c !== null && c !== undefined && c !== false) n.append(c); });
    return n;
  };
  // иконки в духе SF Symbols: контуры 24×24
  const P = {
    back: 'M15 5l-7 7 7 7', chev: 'M9 5l7 7-7 7', plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', check: 'M5 12.5l4.5 4.5L19 7',
    home: 'M3.5 11L12 4l8.5 7M5.5 9.5V20h5v-6h3v6h5V9.5',
    note: 'M6 3.5h9l4 4V20a.5.5 0 0 1-.5.5h-12a.5.5 0 0 1-.5-.5zM15 3.5V8h4M8.5 12h7M8.5 15.5h7M8.5 9h3',
    globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z',
    doc: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM7 15.5c.6-1.6 1.8-2.5 3-2.5s2.4.9 3 2.5M10 11.2a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM15 9.5h2.5M15 12.5h2.5',
    money: 'M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5zM12 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zM6.5 9.5v5M17.5 9.5v5',
    compose: 'M11 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h12a1.5 1.5 0 0 0 1.5-1.5v-5M17.5 3.5l3 3L12 15l-4 1 1-4z',
    folder: 'M3.5 7A1.5 1.5 0 0 1 5 5.5h4.2l2 2H19A1.5 1.5 0 0 1 20.5 9v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z',
    newfolder: 'M3.5 7A1.5 1.5 0 0 1 5 5.5h4.2l2 2H19A1.5 1.5 0 0 1 20.5 9v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18zM12 10.5v6M9 13.5h6',
    trash: 'M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13M10 10v6.5M14 10v6.5',
    pin: 'M9 3.5h6M10 3.5v6l-3 4h10l-3-4v-6M12 13.5v7',
    search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20',
    share: 'M12 15V3.5M8 7.5l4-4 4 4M7 11H5.5v9.5h13V11H17',
    more: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM7.8 12h.01M12 12h.01M16.2 12h.01',
    menu: 'M4 7h16M4 12h16M4 17h16',
    checklist: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12.2l2.8 2.8L16 9.5',
    camera: 'M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.6-2h5.4l1.6 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM12 16a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z',
    photo: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM4 15.5l4.5-4.5 4 4 2.5-2.5 5 5M15.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    calendar: 'M4.5 6.5A1.5 1.5 0 0 1 6 5h12a1.5 1.5 0 0 1 1.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19zM4.5 9.5h15M8.5 3v4M15.5 3v4',
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5.5M12 7.6h.01',
    okcircle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12.2l2.8 2.8L16 9.5',
    warn: 'M12 4l9 16H3zM12 10v4.5M12 17.4h.01',
    location: 'M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11zM12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z',
    arrow: 'M4.5 11.5L20 4l-7.5 15.5-1.8-6.2z',
    bolt: 'M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z',
    bell: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5h4',
    gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4.9a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.5a7 7 0 0 0-2 1.2l-2.4-.9-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-.9a7 7 0 0 0 2 1.2L10 21h4l.5-2.5a7 7 0 0 0 2-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
    uni: 'M2.5 9.5L12 5l9.5 4.5L12 14zM6.5 11.5v4.2c1.6 1.5 3.4 2.3 5.5 2.3s3.9-.8 5.5-2.3v-4.2M21.5 9.5v5',
    plane: 'M10.2 20.5l1.8-6.2-5.5 1.6L5 18l-1.3-.4 1-4.4L3 9.6l1.3-.4 2 2.4 5.5-1.6L10 3.5l1.6-.5 4 6.4 4-1.2a1.8 1.8 0 0 1 1 3.4l-4 1.2.6 7.5z',
    briefcase: 'M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM9 7V5.5h6V7M4 12.5h16',
    sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4',
    moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
    eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z',
    copy: 'M9 9.5A1.5 1.5 0 0 1 10.5 8h8A1.5 1.5 0 0 1 20 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 9 18.5zM15 8V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H9',
    key: 'M8 15.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM11.5 11.5h9M17.5 11.5v3M20.5 11.5v2.5',
    list: 'M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01',
    numlist: 'M10 6.5h10M10 12h10M10 17.5h10M4 5l1.5-1v5M3.5 14.5c.3-.6.9-1 1.5-1 .8 0 1.4.6 1.4 1.3 0 1.2-2.9 2.2-2.9 3.7h3',
    dash: 'M10 6.5h10M10 12h10M10 17.5h10M4 6.5h3M4 12h3M4 17.5h3',
    indent: 'M10 6.5h10M10 12h10M10 17.5h10M4 9l3 3-3 3',
    outdent: 'M10 6.5h10M10 12h10M10 17.5h10M7 9l-3 3 3 3',
    table: 'M4 5.5h16v13H4zM4 10h16M4 14.5h16M10 5.5v13',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2',
    repeat: 'M17 3.5l3 3-3 3M20 6.5H8a4 4 0 0 0-4 4V11M7 20.5l-3-3 3-3M4 17.5h12a4 4 0 0 0 4-4V13',
    people: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 11.2a3 3 0 1 0-.7-5.9M18 14.6c2 .6 3.2 2.3 3.5 4.9',
    chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
    import: 'M12 3.5V15M8 11l4 4 4-4M4.5 15.5V20h15v-4.5',
    file: 'M6 3.5h8l4 4V20.5H6zM14 3.5V8h4',
    lock: 'M6 10.5h12v10H6zM8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3',
    logout: 'M14 4.5H6v15h8M10.5 12H21M17.5 8.5L21 12l-3.5 3.5',
    restore: 'M4 12a8 8 0 1 0 2.4-5.7M4 4.5v4h4',
    move: 'M3.5 7A1.5 1.5 0 0 1 5 5.5h4.2l2 2H19A1.5 1.5 0 0 1 20.5 9v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18zM9 13.5h6M12.5 11l2.5 2.5-2.5 2.5',
  };
  const icon = (name, cls = '') => { const s = el('svg', { class: 'i ' + cls, viewBox: '0 0 24 24', 'aria-hidden': 'true' }); s.append(el('path', { d: P[name] || P.info })); return s; };

  // ---------- даты (номер дня в UTC — без сдвигов поясов) ----------
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MON_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const WDL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
  const dn = s => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
  const iso = n => new Date(n * 864e5).toISOString().slice(0, 10);
  const localIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayIso = () => localIso();
  const today = () => dn(todayIso());
  const wday = n => (new Date(n * 864e5).getUTCDay() + 6) % 7;
  const parts = n => { const d = new Date(n * 864e5); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; };
  const fmt = (s, year) => { if (!s) return '—'; const p = parts(dn(s)); return `${p.d} ${MON_G[p.m]}${year === true || (year !== false && p.y !== parts(today()).y) ? ' ' + p.y : ''}`; };
  const fmtShort = s => { if (!s) return '—'; const p = parts(dn(s)); return `${String(p.d).padStart(2, '0')}.${String(p.m + 1).padStart(2, '0')}.${p.y}`; };
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
  const days = n => `${n} ${plural(n, 'день', 'дня', 'дней')}`;
  const ago = isoStamp => {
    if (!isoStamp) return '';
    const s = (Date.now() - new Date(isoStamp).getTime()) / 1000;
    if (s < 90) return 'только что';
    if (s < 3600) return `${Math.round(s / 60)} мин назад`;
    if (s < 86400) { const h = Math.round(s / 3600); return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`; }
    const d = Math.round(s / 86400); return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
  };
  const hm = isoStamp => { const d = new Date(isoStamp); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  // ---------- страны ----------
  const flag = cc => cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map(c => 0x1F1A5 + c.charCodeAt(0))) : '🏳️';
  const cname = cc => (window.WORLD && WORLD.names[cc] ? WORLD.names[cc][0] : cc);

  // ---------- деньги ----------
  const CUR = { TRY: '₺', RUB: '₽', USD: '$', EUR: '€', GBP: '£', GEL: '₾', AZN: '₼', KZT: '₸', AED: 'AED' };
  const money = (v, cur, frac) => {
    const n = Number(v) || 0, f = frac ?? (Math.abs(n) < 100 && n % 1 ? 2 : 0);
    const s = n.toLocaleString('ru-RU', { minimumFractionDigits: f, maximumFractionDigits: f });
    return `${s} ${CUR[cur] || cur || ''}`.trim();
  };
  const rate = cur => (state.rates && state.rates.rates && state.rates.rates[cur]) || (cur === 'USD' ? 1 : null);
  // перевод суммы в другую валюту по курсам к доллару; без курса — null
  const convert = (v, from, to) => { if (from === to) return Number(v) || 0; const a = rate(from), b = rate(to); return a && b ? (Number(v) || 0) / a * b : null; };

  // ---------- сеть ----------
  let onAuthLost = () => {};
  const api = async (path, opts = {}) => {
    const headers = opts.headers || (opts.body && typeof opts.body === 'string' ? { 'Content-Type': 'application/json' } : {});
    const r = await fetch('/api/' + path, { credentials: 'same-origin', ...opts, headers });
    if (r.status === 401 && !path.endsWith('login')) { onAuthLost(); throw new Error('auth'); }
    return r;
  };
  const toast = (text, bad = false, action = null) => {
    const t = $('#toast'), btn = $('#toast-act');
    $('#toast-text').textContent = text; t.classList.toggle('toast--bad', bad); t.classList.add('on');
    btn.hidden = !action;
    btn.onclick = action ? () => { t.classList.remove('on'); action.fn(); } : null;
    if (action) btn.textContent = action.label;
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), bad ? 5000 : action ? 6000 : 2400);
  };
  const FIELD = { title: 'название', name: 'имя', date: 'дата', amount: 'сумма', person: 'кто', country: 'страна', start: 'начало', end: 'конец', limit: 'лимит', category: 'категория' };
  const why = async r => {
    let d = {};
    try { d = await r.json(); } catch (e) { /* не JSON */ }
    if (r.status === 404 && !d.error) return 'Сервер не знает этот адрес — перезапустите службу: sudo systemctl restart pilotarbuza-orders';
    if (r.status === 413) return 'Слишком большой файл';
    if (d.error === 'fields') return 'Проверьте поля: ' + d.fields.map(f => FIELD[f] || f).join(', ');
    if (r.status >= 500) return `Сервер ответил ошибкой ${r.status}`;
    return 'Не удалось сохранить';
  };
  const apply = (kind, rec) => { const list = state[kind]; const i = list.findIndex(x => x.id === rec.id); if (i >= 0) list[i] = rec; else list.push(rec); return rec; };
  const save = async (kind, id, data, quiet) => {
    let r;
    try { r = await api(id ? `me/r/${kind}/${id}` : `me/r/${kind}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) }); } catch (e) {
      if (e.message !== 'auth') toast('Нет связи с сервером', true); return null;
    }
    if (!r.ok) { if (!quiet) toast(await why(r), true); return null; }
    return apply(kind, await r.json());
  };
  const remove = async (kind, id) => {
    const r = await api(`me/r/${kind}/${id}`, { method: 'DELETE' });
    if (!r.ok) { toast(await why(r), true); return false; }
    state[kind] = state[kind].filter(x => x.id !== id);
    if (kind === 'folders') state.notes.forEach(n => { if (n.folder === id) { n.folder = null; n.deleted = n.deleted || todayIso(); } });
    state.files = state.files.filter(f => f.rec !== id);
    return true;
  };
  const post = async (path, data) => {
    const r = await api('me/' + path, { method: 'POST', body: JSON.stringify(data) });
    if (!r.ok) { toast(await why(r), true); return null; }
    return r.json();
  };
  const load = async () => {
    const r = await api('me/all');
    if (!r.ok) throw new Error(await why(r));
    const d = await r.json();
    KINDS.forEach(k => { state[k] = d[k] || []; });
    ['days', 'settings', 'keys', 'files', 'brief', 'rates', 'last_ping', 'meta'].forEach(k => { state[k] = d[k]; });
    loadPlan();
    if (!state.rates || !state.rates.at || Date.now() - new Date(state.rates.at) > 12 * 3600e3) api('me/rates').then(x => x.json()).then(x => { if (x.at) { state.rates = x; render(); } }).catch(() => {});
  };
  // расписание пар и задачи Анемоса — из того же входа, из /admin/plan
  const loadPlan = async () => {
    try { const r = await api('admin/crm'); if (r.ok) { state.plan = await r.json(); if (['home'].includes(cur.view)) render(); } } catch (e) { /* план недоступен — на главной его просто не будет */ }
  };
  const days2map = () => {
    const m = new Map();
    state.days.forEach(([d, c, s]) => { if (!m.has(d)) m.set(d, []); m.get(d).push({ c, s }); });
    return m;
  };

  // ---------- экраны ----------
  const views = {};
  const cur = { view: 'home', args: [], hash: '' };
  const scrolls = {};
  const TABS = { home: 'home', notes: 'notes', countries: 'countries', docs: 'more', money: 'more', brief: 'home', more: 'more' };

  // экран: строка навигации (назад, заголовок, кнопки), крупный заголовок, содержимое
  function screen(box, { title, back, backText, right = [], left, large = true, cls = '', full = false, sub, kick }) {
    const navTitle = el('span', { class: 'nav__title', text: title || '' });
    const nav = el('header', { class: 'nav' + (large ? '' : ' nav--plain') }, el('div', { class: 'nav__row' }, [
      el('div', { class: 'nav__l' }, left || (back ? el('a', { class: 'nb nb--back', href: back }, [icon('back'), el('span', { text: backText || 'Назад' })]) : el('a', { class: 'nav__brand hand', href: '#home', text: 'pilot_arbuza' }))),
      navTitle,
      el('div', { class: 'nav__r' }, right),
    ]));
    const body = el('div', { class: 'screen__body' });
    const root = el('div', { class: `screen ${cls}${full ? ' screen--full' : ''}` }, [nav,
      kick ? el('p', { class: 'lt__kick', text: kick }) : null,
      large && title ? el('div', { class: 'lt' }, [el('h1', { text: title })]) : null,
      sub ? el('p', { class: 'lt__sub', text: sub }) : null, body]);
    box.append(root);
    return body;
  }
  const navBtn = (content, onclick, props = {}) => el(props.href ? 'a' : 'button', { class: 'nb' + (props.bold ? ' nb--bold' : ''), type: props.href ? null : 'button', onclick, ...props }, typeof content === 'string' && P[content] ? icon(content) : content);
  const group = (head, rows, foot, cls = '') => el('section', { class: 'group ' + cls }, [
    head ? (typeof head === 'string' ? el('h2', { class: 'group__h', text: head }) : head) : null,
    el('div', { class: 'list' }, rows.filter(Boolean)),
    foot ? el('p', { class: 'group__f', text: foot }) : null,
  ]);
  // строка списка: { icon, color, flag, title, sub, value, href, onclick, chev, cls }
  const row = o => {
    const kids = [
      o.icon ? el('span', { class: 'row__ico', style: `--c:${o.color || 'var(--gray)'}` }, typeof o.icon === 'string' ? icon(o.icon) : o.icon) : null,
      o.flag ? el('span', { class: 'row__flag', text: o.flag }) : null,
      o.lead || null,
      el('span', { class: 'row__main' }, [el('span', { class: 'row__t' + (o.wrap ? ' row__t--wrap' : ''), text: o.title }), o.sub ? el('span', { class: 'row__s', text: o.sub }) : null]),
      o.value !== undefined && o.value !== null ? (typeof o.value === 'object' ? o.value : el('span', { class: 'row__v', text: String(o.value) })) : null,
      o.chev !== false && (o.href || o.onclick) ? icon('chev', 'row__chev') : null,
    ];
    const props = { class: 'row ' + (o.cls || ''), style: o.style };
    if (o.href) return el('a', { ...props, href: o.href }, kids);
    if (o.onclick) return el('button', { ...props, type: 'button', onclick: o.onclick }, kids);
    return el('div', props, kids);
  };
  const toggle = (title, checked, onchange, sub) => el('label', { class: 'row' }, [
    el('span', { class: 'row__main' }, [el('span', { class: 'row__t row__t--wrap', text: title }), sub ? el('span', { class: 'row__s', text: sub, style: 'white-space:normal' }) : null]),
    el('input', { type: 'checkbox', class: 'switch', checked, onchange: e => onchange(e.target.checked) }),
  ]);
  const inputRow = (label, input) => el('label', { class: 'row' }, [el('span', { class: 'row__lbl', text: label }), input]);
  const seg = (items, value, onpick) => el('div', { class: 'seg', role: 'group' }, items.map(([v, t]) => el('button', { type: 'button', 'aria-pressed': String(v === value), text: t, onclick: () => onpick(v) })));
  const empty = (title, text, action) => el('div', { class: 'empty' }, [el('b', { text: title }), text ? el('p', { text }) : null, action || null]);

  // ---------- листы снизу ----------
  const sheetEl = () => $('#sheet');
  const closeSheet = () => { const s = sheetEl(); if (s.open) s.close(); };
  // sheet({title, body, done: fn → true/Promise<true> закрывает, doneText, cancelText})
  function sheet({ title, body, done, doneText = 'Готово', cancelText = 'Отменить', onclose }) {
    const s = sheetEl();
    const doneBtn = done ? el('button', { type: 'button', class: 'nb nb--bold', text: doneText }) : el('span');
    if (done) doneBtn.onclick = async () => { doneBtn.disabled = true; try { if (await done()) closeSheet(); } finally { doneBtn.disabled = false; } };
    s.replaceChildren(el('div', { class: 'sheet__grip', 'aria-hidden': 'true' }), el('div', { class: 'sheet__bar' }, [
      el('button', { type: 'button', class: 'nb', text: done ? cancelText : 'Закрыть', onclick: closeSheet }),
      el('h2', { text: title || '' }), doneBtn,
    ]), ...[].concat(body));
    s.onclose = onclose || null;
    if (!s.open) s.showModal();
    return s;
  }
  // меню действий: [{ icon, text, fn, danger }]
  const menu = (title, items) => sheet({ title, body: group(null, items.filter(Boolean).map(it => row({ icon: it.icon, color: it.color || (it.danger ? 'var(--red)' : 'var(--tint)'), title: it.text, sub: it.sub, chev: false, cls: it.danger ? 'late' : '', onclick: () => { closeSheet(); it.fn(); } })), null, 'menu') });
  const ask = (text, okText = 'Удалить') => new Promise(res => {
    let answered = false;
    sheet({ title: '', body: [el('p', { style: 'text-align:center;margin:4px 24px 18px;font-size:17px', text }),
      el('div', { class: 'group' }, el('div', { class: 'list' }, [
        row({ title: okText, cls: 'row--danger', chev: false, onclick: () => { answered = true; closeSheet(); res(true); } }),
        row({ title: 'Отменить', cls: 'row--center row--tint', chev: false, onclick: () => { closeSheet(); } }),
      ]))], onclose: () => { if (!answered) res(false); } });
  });
  sheetEl().addEventListener('click', e => { if (e.target === sheetEl()) closeSheet(); });

  // ---------- маршрутизация ----------
  function render() {
    const box = $('#view');
    const v = views[cur.view] || views.home;
    document.body.classList.remove('no-tabs');
    box.replaceChildren();
    v(box, cur.args);
    const tab = TABS[cur.view] || 'home';
    document.querySelectorAll('#tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === tab ? 'page' : 'false'));
    onScroll();
  }
  function route() {
    scrolls[cur.hash] = window.scrollY;
    const h = location.hash.replace(/^#/, '') || 'home';
    const [v, ...args] = h.split('/');
    const same = cur.view === v && cur.args.join('/') === args.join('/');
    cur.view = views[v] ? v : 'home'; cur.args = args; cur.hash = h;
    closeSheet();
    render();
    if (!same) window.scrollTo(0, scrolls[h] || 0);
  }
  const go = h => { if (location.hash === '#' + h) route(); else location.hash = h; };
  const onScroll = () => { const n = document.querySelector('.nav'); if (n) n.classList.toggle('is-stuck', window.scrollY > 28); };
  window.addEventListener('scroll', onScroll, { passive: true });

  // ---------- выбор страны ----------
  function pickCountry(title, onpick, current) {
    const all = Object.keys(WORLD.names).sort((a, b) => cname(a).localeCompare(cname(b), 'ru'));
    const used = [...new Set(state.days.slice(-400).map(d => d[1]))];
    const q = el('input', { type: 'search', placeholder: 'Поиск страны', autocomplete: 'off' });
    const list = el('div', { class: 'list pick-list' });
    const draw = () => {
      const s = q.value.trim().toLowerCase();
      const hit = c => !s || WORLD.names[c].some(n => n.toLowerCase().includes(s)) || c.toLowerCase() === s;
      const items = (s ? all.filter(hit) : [...used.filter(c => WORLD.names[c]), ...all.filter(c => !used.includes(c))]);
      list.replaceChildren(...items.slice(0, 260).map(c => row({ flag: flag(c), title: cname(c), value: c === current ? icon('check') : null, chev: false, onclick: () => { closeSheet(); onpick(c); } })));
    };
    q.addEventListener('input', draw);
    sheet({ title, body: [el('div', { class: 'search' }, [icon('search'), q]), el('div', { class: 'group' }, list)] });
    draw();
  }

  // ---------- очистка HTML заметок ----------
  const ALLOWED = { P: [], DIV: [], BR: [], B: [], STRONG: [], I: [], EM: [], U: [], S: [], STRIKE: [], DEL: [], MARK: [], H1: [], H2: [], H3: [], PRE: [], CODE: [], UL: ['class'], OL: [], LI: ['class'], A: ['href'], IMG: ['src', 'alt'], TABLE: [], TBODY: [], TR: [], TD: [], BLOCKQUOTE: [], SPAN: [] };
  function cleanHtml(html) {
    const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) return;
        if (n.nodeType !== 1) { n.remove(); return; }
        if (!ALLOWED[n.tagName]) { if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE'].includes(n.tagName)) n.remove(); else { walk(n); n.replaceWith(...n.childNodes); } return; }
        [...n.attributes].forEach(a => {
          const keep = ALLOWED[n.tagName].includes(a.name);
          if (!keep) n.removeAttribute(a.name);
          else if (a.name === 'href' && !/^(https?:|mailto:|tel:)/i.test(a.value)) n.removeAttribute(a.name);
          else if (a.name === 'src' && !/^\/api\/me\/files\/\d+$/.test(a.value)) n.removeAttribute(a.name);
          else if (a.name === 'class') n.setAttribute('class', a.value.split(/\s+/).filter(c => ['cl', 'dash', 'done'].includes(c)).join(' '));
        });
        if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); }
        walk(n);
      });
    };
    walk(doc.body);
    return doc.body.innerHTML;
  }

  // ---------- файлы ----------
  async function upload(file, rec) {
    const type = (file.type || '').toLowerCase() || (/\.heic$/i.test(file.name) ? 'image/heic' : /\.pdf$/i.test(file.name) ? 'application/pdf' : '');
    let r;
    try { r = await api(`me/files?name=${encodeURIComponent(file.name || 'file')}${rec ? '&rec=' + rec : ''}`, { method: 'POST', body: file, headers: { 'Content-Type': type } }); } catch (e) { toast('Нет связи с сервером', true); return null; }
    if (!r.ok) { toast(await why(r), true); return null; }
    const f = await r.json(); state.files.push(f); return f;
  }
  // уменьшить фото перед загрузкой (заметки) — до 1600 px по длинной стороне
  async function shrink(file, max = 1600) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      if (k === 1 && file.size < 900e3) return file;
      const c = el('canvas', { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', .85));
      return new File([blob], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch (e) { return file; }
  }
  const pickFiles = (accept, multiple) => new Promise(res => {
    const i = el('input', { type: 'file', accept, multiple, style: 'display:none' });
    i.addEventListener('change', () => { res([...i.files]); i.remove(); });
    document.body.append(i); i.click();
  });
  const copy = async text => { try { await navigator.clipboard.writeText(text); toast('Скопировано'); } catch (e) { toast('Не получилось скопировать', true); } };

  return { $, el, icon, state, saveUi, KINDS, MONTHS, MON_G, MON, WD, WDL, dn, iso, localIso, todayIso, today, wday, parts, fmt, fmtShort, plural, days, ago, hm,
    flag, cname, CUR, money, rate, convert, api, toast, why, save, remove, post, load, loadPlan, days2map,
    views, cur, render, route, go, screen, navBtn, group, row, toggle, inputRow, seg, empty, sheet, closeSheet, menu, ask, pickCountry,
    cleanHtml, upload, shrink, pickFiles, copy, setAuthLost: f => { onAuthLost = f; } };
})();
