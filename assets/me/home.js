/* pilotarbuza.com/me — главная (сводка дня), бриф, «Ещё» и настройки.
   Пары и задачи Анемоса берутся из /admin/plan (тот же вход), бриф присылает задача, которая собирает его для Telegram. */
(() => {
  const { el, icon, state, screen, navBtn, group, row, toggle, sheet, menu, ask, toast, go, flag, cname, plural, days, dn, iso, today, todayIso, wday, parts, fmt, MON_G, WDL, money, post } = ME;
  const SLOTS = {
    1: ['08:30', '09:15'], 2: ['09:25', '10:10'], 3: ['10:20', '11:05'], 4: ['11:15', '12:00'], 5: ['12:10', '12:55'],
    6: ['13:25', '14:10'], 7: ['14:20', '15:05'], 8: ['15:15', '16:00'], 9: ['16:10', '16:55'], 10: ['17:00', '17:45'],
    11: ['17:50', '18:35'], 12: ['18:40', '19:25'], 13: ['19:30', '20:15'], 14: ['20:20', '21:05'], 15: ['21:10', '21:55'],
  };
  const mins = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  // расписание живёт по времени Турции (UTC+3), где бы ни был телефон
  const trNow = () => { const d = new Date(Date.now() + 3 * 3600e3); return { day: Math.floor(d.getTime() / 864e5), min: d.getUTCHours() * 60 + d.getUTCMinutes() }; };
  const holiday = n => { const s = iso(n); return ((state.plan && state.plan.calendar) || []).find(c => c.kind === 'holiday' && c.start <= s && c.end >= s); };
  const lessonsOn = n => ((state.plan && state.plan.lessons) || []).filter(l => l.weekday === wday(n) && !l.optional).sort((a, b) => a.first - b.first);
  const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'; };
  const MON_P = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
  const KIND = { morning: ['Утренний бриф', 'sun'], evening: ['Вечерний бриф', 'moon'], other: ['Бриф', 'note'] };

  function home(box) {
    const t0 = today(), p = parts(t0), name = state.settings.name || 'Максим';
    const body = screen(box, { title: `${greet()}, ${name}`, right: [navBtn('menu', () => go('more'), { 'aria-label': 'Ещё' })] });
    body.before(el('p', { class: 'hm-date', text: `${WDL[wday(t0)]}, ${p.d} ${MON_G[p.m]}`, style: 'margin-top:-6px;margin-bottom:12px' }));
    body.append(el('div', { class: 'hm-quick' }, [
      el('button', { type: 'button', style: '--c:var(--notes)', onclick: () => ME.notes.newNote() }, [icon('compose'), 'Заметка']),
      el('button', { type: 'button', style: '--c:var(--green)', onclick: () => ME.fin.txSheet() }, [icon('money'), 'Расход']),
      el('button', { type: 'button', style: '--c:var(--orange)', onclick: () => ME.countries.here() }, [icon('location'), 'Где я']),
      el('a', { href: '#brief', style: '--c:var(--indigo)' }, [icon('sun'), 'Бриф']),
    ]));

    // плитки
    const m = ME.countries.dmap(), now = m.get(todayIso()) || [], lastDay = state.days[state.days.length - 1];
    const cc = now.length ? now[now.length - 1].c : lastDay && lastDay[1];
    const yc = cc ? ME.countries.counts(m, ME.countries.yearRange(p.y))[cc] || 0 : 0;
    const tiles = [el('a', { class: 'tile', href: '#countries', style: '--c:var(--orange)' }, [
      el('span', { class: 'tile__k' }, [icon('globe'), 'Сейчас']),
      el('span', { class: 'tile__v', text: cc ? `${flag(cc)} ${cname(cc)}` : '—', style: 'font-size:22px' }),
      el('span', { class: 'tile__s', text: cc ? `${yc}-й день в ${p.y}${now.length ? '' : ' · сегодня ещё не отмечено'}` : 'Отметьте, где вы' }),
    ])];
    const sch = state.rules.find(r => r.on && r.tile && r.goal === 'max');
    if (sch) { const u = ME.countries.usage(sch, m); tiles.push(el('a', { class: 'tile', href: `#countries/rule/${sch.id}`, style: '--c:var(--blue)' }, [el('span', { class: 'tile__k' }, [icon('plane'), sch.name]), el('span', { class: 'tile__v' }, [String(u.used), el('small', { text: ` / ${sch.limit}` })]), el('span', { class: 'tile__s', text: u.left >= 0 ? `можно ещё ${days(u.left)}` : `превышение ${days(-u.left)}` })])); }
    const doc = [...state.docs].filter(d => d.expires && dn(d.expires) >= t0).sort((a, b) => a.expires.localeCompare(b.expires))[0];
    if (doc) { const n = dn(doc.expires) - t0; tiles.push(el('a', { class: 'tile', href: `#docs/${doc.id}`, style: `--c:${n <= 30 ? 'var(--red)' : n <= 90 ? 'var(--orange)' : 'var(--teal)'}` }, [el('span', { class: 'tile__k' }, [icon('doc'), 'Документы']), el('span', { class: 'tile__v', text: n > 999 ? `${Math.round(n / 365)} г.` : days(n), style: 'font-size:22px' }), el('span', { class: 'tile__s', text: `до конца: ${doc.title}` })])); }
    const mt = ME.fin.monthTx(todayIso().slice(0, 7)).filter(t => t.kind === 'expense'), spent = mt.reduce((s, t) => s + (ME.fin.inBase(t.amount, t.currency) ?? 0), 0);
    tiles.push(el('a', { class: 'tile', href: '#money', style: '--c:var(--green)' }, [el('span', { class: 'tile__k' }, [icon('money'), 'Деньги']), el('span', { class: 'tile__v', text: money(spent, ME.fin.base(), 0), style: 'font-size:22px' }), el('span', { class: 'tile__s', text: `потрачено в ${MON_P[p.m]}` })]));
    body.append(el('div', { class: 'hm-tiles' }, tiles));

    // бриф
    const b = (state.brief || [])[0];
    body.append(el('section', { class: 'group' }, [el('h2', { class: 'group__h' }, [el('span', { text: b ? `${KIND[b.kind] ? KIND[b.kind][0] : 'Бриф'} · ${fmt(b.date)}, ${ME.hm(b.created_at)}` : 'Бриф' }), el('a', { href: '#brief', text: 'Все' })]),
      el('a', { class: 'card', href: '#brief', style: 'display:block;color:inherit' }, b ? el('div', { class: 'brief-prev', text: b.text.split('\n').slice(1).join('\n').trim() || b.text }) : el('p', { class: 'muted', style: 'margin:0', text: 'Утренний и вечерний бриф появятся здесь, когда задача их пришлёт. Настройка — в «Ещё» → «Бриф».' }))]));

    // пары
    if (state.plan && state.plan.lessons && state.plan.lessons.length) {
      const { day, min } = trNow(), hol = holiday(day);
      let n = day, ls = hol ? [] : lessonsOn(day).filter(l => mins(SLOTS[l.last][1]) > min), label = 'Пары сегодня';
      if (!ls.length) { for (let i = 1; i < 8; i++) { if (!holiday(day + i) && lessonsOn(day + i).length) { n = day + i; ls = lessonsOn(n); label = i === 1 ? 'Пары завтра' : `Пары: ${WDL[wday(n)]}`; break; } } }
      if (ls.length) body.append(group(el('h2', { class: 'group__h' }, [el('span', { text: hol && n === day ? `${hol.title}` : label }), el('a', { href: '/admin/plan/#uni', text: 'Расписание' })]), ls.map(l => {
        const s = SLOTS[l.first][0], e = SLOTS[l.last][1], live = n === day && mins(s) <= min && min < mins(e);
        return el('a', { class: 'row', href: '/admin/plan/#uni' }, el('div', { class: 'lesson' + (live ? ' is-now' : ''), style: 'flex:1' }, [el('span', { class: 'lesson__t' }, [s, el('small', { text: e })]), el('span', { class: 'row__main' }, [el('span', { class: 'row__t', text: l.course }), el('span', { class: 'row__s', text: [live ? 'идёт сейчас' : null, l.room ? 'ауд. ' + l.room : null, l.teacher].filter(Boolean).join(' · ') })])]));
      })));
    }

    // Анемос
    if (state.plan && state.plan.tasks) {
      const open = state.plan.tasks.filter(t => t.kind !== 'phase' && t.status !== 'done' && t.end);
      const late = open.filter(t => dn(t.end) < t0), due = open.filter(t => dn(t.end) === t0), soon = open.filter(t => dn(t.end) > t0 && dn(t.end) <= t0 + 7);
      const top = [...late, ...due, ...soon].slice(0, 4);
      body.append(group(el('h2', { class: 'group__h' }, [el('span', { text: 'Анемос' }), el('a', { href: '/admin/plan/#today', text: 'План' })]), top.length ? top.map(t => row({ icon: 'plane', color: dn(t.end) < t0 ? 'var(--red)' : dn(t.end) === t0 ? 'var(--orange)' : 'var(--teal)', title: t.title.replace(/^T-\d+\w?\s/, ''), sub: dn(t.end) < t0 ? `просрочено с ${fmt(t.end)}` : dn(t.end) === t0 ? 'срок сегодня' : `до ${fmt(t.end)}`, href: '/admin/plan/#today' }))
        : [row({ icon: 'okcircle', color: 'var(--green)', title: 'На неделю срочного нет', href: '/admin/plan/#today' })], late.length ? `Просрочено: ${late.length}, сегодня: ${due.length}, на неделе: ${soon.length}.` : null));
    }

    // скоро: подписки, долги, документы
    const soonRows = [];
    state.subs.filter(s => s.active && s.next && dn(s.next) - t0 <= 7).sort((a, b) => a.next.localeCompare(b.next)).forEach(s => soonRows.push(row({ icon: 'repeat', color: 'var(--gray)', title: s.name, sub: `${money(s.amount, s.currency)} · ${dn(s.next) === t0 ? 'сегодня' : dn(s.next) === t0 + 1 ? 'завтра' : fmt(s.next)}`, href: '#money/subs' })));
    state.debts.filter(d => !d.settled && d.due && dn(d.due) - t0 <= 7).forEach(d => soonRows.push(row({ icon: 'people', color: d.dir === 'they_owe' ? 'var(--green)' : 'var(--red)', title: `${d.dir === 'they_owe' ? 'Вернуть мне' : 'Вернуть'}: ${d.person}`, sub: `${money(d.amount, d.currency)} · до ${fmt(d.due)}`, href: '#money/debts' })));
    state.docs.filter(d => d.expires && dn(d.expires) - t0 <= 30).forEach(d => soonRows.push(row({ icon: 'doc', color: 'var(--red)', title: d.title, sub: dn(d.expires) < t0 ? `истёк ${fmt(d.expires)}` : `действует до ${fmt(d.expires)}`, href: `#docs/${d.id}` })));
    if (soonRows.length) body.append(group('Скоро', soonRows));

    // закреплённые заметки
    const pinned = ME.notes.live().filter(n => n.pinned).sort((a, b) => ME.notes.stamp(b).localeCompare(ME.notes.stamp(a))).slice(0, 4);
    if (pinned.length) body.append(group(el('h2', { class: 'group__h' }, [el('span', { text: 'Закреплённые заметки' }), el('a', { href: '#notes', text: 'Все' })]), pinned.map(n => row({ icon: 'pin', color: 'var(--notes)', title: ME.notes.titleOf(n), sub: ME.notes.preview(n), href: `#notes/n/${n.id}` }))));
    ME.countries.pingOnOpen();
  }

  // ---------- бриф ----------
  let briefs = null, more = true;
  const loadBriefs = async before => {
    const r = await ME.api('me/briefs' + (before ? '?before=' + before : ''));
    if (!r.ok) return [];
    const d = (await r.json()).briefs; more = d.length === 20; return d;
  };
  // заголовки разделов в брифе написаны заглавными буквами — выделяем их
  const briefText = text => el('div', { class: 'brief' }, text.split('\n').map(line => /^[A-ZА-ЯЁ0-9 ,.()«»:–—-]{5,}$/.test(line.trim()) && /[A-ZА-ЯЁ]{4}/.test(line) ? el('h3', { text: line.trim() }) : document.createTextNode(line + '\n')));
  function brief(box, args) {
    const body = screen(box, { title: 'Бриф', back: '#home', backText: 'Главная', right: [navBtn('gear', () => briefSettings(), { 'aria-label': 'Настройки брифа' })] });
    const q = el('input', { type: 'search', placeholder: 'Поиск по брифам' });
    const out = el('div');
    const draw = () => {
      if (!briefs) { out.replaceChildren(el('p', { class: 'muted', style: 'text-align:center', text: 'Загружаю…' })); return; }
      if (!briefs.length) { out.replaceChildren(ME.empty('Брифов пока нет', 'Они приходят утром и вечером вместе с Telegram. Если не приходят — откройте настройки брифа (шестерёнка).')); return; }
      const s = q.value.trim().toLowerCase();
      const sel = Number(args[0]) || (s ? null : briefs[0].id);
      const list = briefs.filter(b => !s || b.text.toLowerCase().includes(s));
      const cur = briefs.find(b => b.id === sel);
      out.replaceChildren(
        cur ? el('section', { class: 'group' }, [el('h2', { class: 'group__h', text: `${(KIND[cur.kind] || KIND.other)[0]} · ${fmt(cur.date, true)}, ${ME.hm(cur.created_at)}` }), el('div', { class: 'card' }, [briefText(cur.text), el('div', { style: 'display:flex;gap:8px;margin-top:12px' }, [
          el('button', { type: 'button', class: 'btn btn--sm btn--soft', onclick: () => ME.copy(cur.text) }, 'Копировать'),
          el('button', { type: 'button', class: 'btn btn--sm btn--soft', onclick: () => saveAsNote(cur) }, 'В заметки'),
        ])])]) : null,
        group(s ? `Найдено: ${list.length}` : 'Архив', list.map(b => row({ icon: (KIND[b.kind] || KIND.other)[1], color: b.kind === 'evening' ? 'var(--indigo)' : 'var(--orange)', title: `${(KIND[b.kind] || KIND.other)[0]}, ${fmt(b.date)}`, sub: b.text.split('\n').slice(1).find(x => x.trim()) || '', value: b.id === sel ? icon('check') : null, chev: false, onclick: () => { go(`brief/${b.id}`); } }))),
        more && !s ? el('div', { class: 'group' }, el('button', { type: 'button', class: 'btn btn--soft', onclick: async () => { briefs = briefs.concat(await loadBriefs(briefs[briefs.length - 1].id)); draw(); } }, 'Показать ещё')) : null,
      );
    };
    q.addEventListener('input', draw);
    body.append(el('div', { class: 'search' }, [icon('search'), q]), out);
    draw();
    if (!briefs) loadBriefs().then(d => { briefs = d; if (ME.cur.view === 'brief') draw(); });
  }
  async function saveAsNote(b) {
    const title = `${(KIND[b.kind] || KIND.other)[0]}, ${fmt(b.date, true)}`;
    const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const body = `<div>${esc(title)}</div>` + b.text.split('\n').slice(1).map(l => `<div>${esc(l) || '<br>'}</div>`).join('');
    const rec = await ME.save('notes', null, { title, body, text: title + '\n' + b.text, folder: state.folders[0] ? state.folders[0].id : null, edited: new Date().toISOString().slice(0, 19) + 'Z' });
    if (rec) toast('Сохранено в заметки', false, { label: 'Открыть', fn: () => go(`notes/n/${rec.id}`) });
  }
  function briefSettings() {
    const k = state.keys && state.keys.brief;
    const keyBox = el('div');
    const draw = plain => keyBox.replaceChildren(group('Ключ для задачи брифа', [
      plain ? el('div', { class: 'row', style: 'display:block' }, [el('p', { style: 'margin:0 0 6px;font-size:15px', text: 'Скопируйте ключ и отправьте его Claude в чат: «добавь ключ брифа в задачи». Больше он не покажется.' }), el('div', { class: 'code-row' }, [el('span', { class: 'code', text: plain }), el('button', { type: 'button', class: 'btn btn--sm', onclick: () => ME.copy(plain) }, 'Копировать')])])
        : row({ icon: 'key', color: 'var(--indigo)', title: k ? 'Ключ выпущен' : 'Ключа нет', sub: k ? (k.last_used ? `последний бриф ${ME.ago(k.last_used)}` : 'брифов по нему ещё не было') : 'Без ключа задача не сможет присылать бриф сюда' }),
      row({ title: k ? 'Выпустить новый ключ' : 'Создать ключ', cls: 'row--tint', chev: false, onclick: async () => {
        if (k && !await ask('Старый ключ перестанет работать.', 'Выпустить новый')) return;
        const r = await post('keys/brief', {}); if (r) { state.keys = r.keys; draw(r.key); }
      } }),
    ], `Задача отправляет готовый текст на ${location.origin}/api/me/brief с заголовком Authorization: Bearer <ключ>.`));
    draw();
    sheet({ title: 'Бриф', body: [keyBox, group(null, [toggle('Уведомление, когда пришёл бриф', !!state.settings.brief_push, async v => { const r = await post('settings', { brief_push: v }); if (r) state.settings = r.settings; }, 'Обычно хватает сообщения в Telegram')])] });
  }

  // ---------- ещё и настройки ----------
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const pushOk = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const keyBytes = b64 => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64.length % 4) % 4)), c => c.charCodeAt(0));
  async function enablePush() {
    if (!pushOk()) { toast(isIOS && !standalone() ? 'Сначала добавьте приложение на экран «Домой»' : 'Этот браузер не умеет уведомления', true); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Разрешение не выдано', true); return; }
    const info = await (await ME.api('admin/push')).json();
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(info.public_key) });
    const r = await ME.api('admin/push/subscribe', { method: 'POST', body: JSON.stringify({ ...sub.toJSON(), ua: (/iPhone/.test(navigator.userAgent) ? 'iPhone' : 'Браузер') + ' · личное' }) });
    toast(r.ok ? 'Уведомления включены' : await ME.why(r), !r.ok);
    ME.render();
  }
  function moreView(box) {
    const body = screen(box, { title: 'Ещё', back: '#home', backText: 'Главная' });
    body.append(group(null, [
      row({ icon: 'uni', color: 'var(--blue)', title: 'Университет', sub: 'Расписание пар и напоминания', href: '/admin/plan/#uni' }),
      row({ icon: 'plane', color: 'var(--teal)', title: 'Анемос', sub: 'План ANY1, Гант, CRM', href: '/admin/plan/' }),
      row({ icon: 'briefcase', color: 'var(--purple)', title: 'Предзаказы мерча', href: '/admin/' }),
      row({ icon: 'sun', color: 'var(--indigo)', title: 'Бриф', href: '#brief' }),
    ]));
    const perm = pushOk() ? Notification.permission : 'none';
    body.append(group('Уведомления', [
      perm === 'granted' ? row({ icon: 'bell', color: 'var(--red)', title: 'Включены на этом устройстве', sub: 'Документы, подписки, лимиты стран, пары, план' })
        : row({ icon: 'bell', color: 'var(--red)', title: 'Включить уведомления', sub: isIOS && !standalone() ? 'Сначала «Поделиться» → «На экран Домой»' : 'Документы, подписки, лимиты, пары, план', chev: false, onclick: enablePush }),
      row({ icon: 'clock', color: 'var(--gray)', title: 'Время сводок и пар', href: '/admin/plan/#notify' }),
    ], 'Если на экране «Домой» есть и старое приложение «План», оставьте одно — иначе уведомления будут приходить дважды.'));
    const name = el('input', { value: state.settings.name || '', maxLength: 40, onchange: async e => { const r = await post('settings', { name: e.target.value }); if (r) state.settings = r.settings; } });
    body.append(group('Настройки', [
      ME.inputRow('Как обращаться', name),
      row({ icon: 'globe', color: 'var(--orange)', title: 'Страны и автоотслеживание', href: '#countries/setup' }),
      row({ icon: 'money', color: 'var(--green)', title: `Основная валюта: ${state.settings.base_currency || 'TRY'}`, href: '#money' }),
    ]));
    body.append(group(null, [
      row({ icon: 'import', color: 'var(--gray)', title: 'Резервная копия', sub: 'Все данные приложения одним файлом', onclick: async () => {
        const r = await ME.api('me/all'); const blob = new Blob([await r.text()], { type: 'application/json' });
        const a = el('a', { href: URL.createObjectURL(blob), download: `me-${todayIso()}.json` }); document.body.append(a); a.click(); a.remove();
      } }),
      row({ icon: 'logout', color: 'var(--red)', title: 'Выйти', chev: false, onclick: async () => { await ME.api('admin/logout', { method: 'POST', body: '{}' }); location.reload(); } }),
    ]));
  }

  ME.views.home = home;
  ME.views.brief = brief;
  ME.views.more = moreView;
})();
