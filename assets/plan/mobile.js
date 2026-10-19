/* pilotarbuza.com/admin/plan — «Сегодня» (главный экран на телефоне) и настройки уведомлений. */
(() => {
  const { el, state, L, dn, iso, today, wday, parts, fmt, MON_G, isOverdue, label, byId, plural } = PA;
  const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const work = () => state.tasks.filter(t => t.kind !== 'phase' && t.start);

  // ================= Сегодня =================
  async function complete(t) {
    const before = { status: t.status, progress: t.progress || 0 };
    if (!await PA.save('tasks', t.id, { status: 'done', progress: 100 })) return;
    PA.render();
    PA.toast(`Готово: ${t.title.replace(/^T-\d+\w?\s/, '')}`, false, { label: 'Вернуть', fn: async () => { if (await PA.save('tasks', t.id, before)) PA.render(); } });
  }

  const row = t => {
    const late = isOverdue(t), t0 = today();
    const when = late ? `срок был ${fmt(t.end)}` : t.kind === 'milestone' ? fmt(t.start, true)
      : dn(t.end) === t0 ? 'срок сегодня' : dn(t.start) > t0 ? `с ${fmt(t.start)}` : `до ${fmt(t.end)}`;
    return el('li', { class: `td-row${late ? ' td-row--late' : ''}` }, [
      el('button', { type: 'button', class: 'td-check', 'aria-label': `Отметить «${t.title}» выполненной`, onclick: () => complete(t) }, el('span', { 'aria-hidden': 'true' })),
      el('button', { type: 'button', class: 'td-main', onclick: () => PA.openTask(t.id) }, [
        el('span', { class: 'td-title', text: t.title.replace(/^T-\d+\w?\s/, '') }),
        el('span', { class: 'td-meta' }, [
          t.code ? el('b', { text: t.code }) : null,
          el('span', { class: late ? 'pl-late' : '', text: when }),
          t.status === 'doing' || t.status === 'review' || t.status === 'blocked' ? PA.statusPill(t.status, true) : null,
          t.kind === 'test' ? el('span', { class: 'td-kind', text: 'испытание' }) : null,
        ]),
      ]),
    ]);
  };

  PA.views.today = box => {
    const t0 = today(), p = parts(t0), open = work().filter(t => t.status !== 'done');
    const late = open.filter(isOverdue).sort((a, b) => a.end.localeCompare(b.end));
    const dueToday = open.filter(t => !isOverdue(t) && dn(t.end) === t0);
    const going = open.filter(t => !isOverdue(t) && dn(t.start) <= t0 && dn(t.end) > t0).sort((a, b) => a.end.localeCompare(b.end));
    const soon = open.filter(t => dn(t.start) > t0 && dn(t.start) <= t0 + 7).sort((a, b) => a.start.localeCompare(b.start));
    const steps = state.contacts.filter(c => c.next_date && c.status !== 'closed' && dn(c.next_date) <= t0 + 2).sort((a, b) => a.next_date.localeCompare(b.next_date));
    const doneToday = state.tasks.filter(t => t.status === 'done' && (t.updated_at || '').slice(0, 10) === iso(t0) && t.kind !== 'phase');
    const blocks = state.calendar.filter(c => dn(c.start) <= t0 && dn(c.end) >= t0);
    const nextGate = open.filter(t => t.kind === 'milestone' && dn(t.start) >= t0).sort((a, b) => a.start.localeCompare(b.start))[0];

    const sec = (title, items, extra) => items.length ? el('section', { class: 'td-sec' }, [
      el('h2', {}, [title, el('span', { class: 'td-n', text: String(items.length) })]), extra || null,
      el('ul', { class: 'td-list' }, items.map(row)),
    ]) : null;

    const summary = [];
    if (late.length) summary.push(`${late.length} ${plural(late.length, 'просрочена', 'просрочены', 'просрочено')}`);
    if (dueToday.length) summary.push(`${dueToday.length} со сроком сегодня`);
    if (going.length) summary.push(`${going.length} в процессе`);

    const cStep = c => el('li', {}, el('a', { class: 'td-step', href: '#crm/' + c.id }, [
      el('span', { class: 'td-title', text: c.next_step || 'Следующий шаг' }),
      el('span', { class: 'td-meta' }, [el('b', { text: c.name }), el('span', { class: dn(c.next_date) < t0 ? 'pl-late' : '', text: dn(c.next_date) === t0 ? 'сегодня' : fmt(c.next_date) })]),
    ]));

    const empty = !late.length && !dueToday.length && !going.length && !soon.length;
    box.append(el('div', { class: 'td' }, [
      el('header', { class: 'td-head' }, [
        el('p', { class: 'td-day', text: DAYS[wday(t0)] }),
        el('h1', { text: `${p.d} ${MON_G[p.m]}` }),
        el('p', { class: 'pl-hint', text: summary.length ? summary.join(', ') : 'Срочного ничего нет' }),
        blocks.length ? el('div', { class: 'pl-chips' }, blocks.map(c => el('span', { class: `td-block td-block--${c.kind}`, text: c.title }))) : null,
        nextGate ? el('button', { type: 'button', class: 'td-gate', onclick: () => PA.openTask(nextGate.id) }, [
          el('span', { class: 'td-gate__n doto', text: String(dn(nextGate.start) - t0) }),
          el('span', {}, [el('b', { text: `${plural(dn(nextGate.start) - t0, 'день', 'дня', 'дней')} до ${nextGate.code || 'вехи'}` }), el('span', { class: 'pl-hint', text: nextGate.title.replace(/^Ворота G\d:?\s*/, '') })]),
        ]) : null,
      ]),
      sec('Просрочено', late),
      sec('Срок сегодня', dueToday),
      sec('В процессе', going),
      sec('На этой неделе', soon),
      steps.length ? el('section', { class: 'td-sec' }, [el('h2', {}, ['Контакты', el('span', { class: 'td-n', text: String(steps.length) })]), el('ul', { class: 'td-list' }, steps.map(cStep))]) : null,
      empty ? PA.empty('Ближайшую неделю задач нет. Можно взять что-то из следующего этапа.', el('a', { class: 'btn btn--ghost btn--sm', href: '#gantt', text: 'Открыть Гант' })) : null,
      doneToday.length ? el('p', { class: 'pl-hint td-done', text: `Сегодня сделано: ${doneToday.length}` }) : null,
    ]));
  };

  // ================= Уведомления =================
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const keyBytes = b64 => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64.length % 4) % 4)), c => c.charCodeAt(0));
  const device = () => { const u = navigator.userAgent; return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) || isIOS ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'Браузер'; };
  const HOST = h => /apple/.test(h) ? 'Apple' : /google/.test(h) ? 'Google (Chrome, Android)' : /mozilla/.test(h) ? 'Firefox' : /windows/.test(h) ? 'Windows' : h;

  let info = null;
  async function loadInfo() {
    const r = await PA.api('push');
    if (!r.ok) throw new Error(await PA.why(r));
    info = await r.json();
  }
  async function currentSub() {
    if (!supported()) return null;
    const reg = await navigator.serviceWorker.getRegistration('/admin/plan/');
    return reg ? reg.pushManager.getSubscription() : null;
  }
  async function enable() {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { PA.toast(perm === 'denied' ? 'Уведомления запрещены в настройках телефона' : 'Разрешение не выдано', true); return PA.render(); }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(info.public_key) });
    const r = await PA.api('push/subscribe', { method: 'POST', body: JSON.stringify({ ...sub.toJSON(), ua: device() }) });
    if (!r.ok) { PA.toast(await PA.why(r), true); return; }
    PA.toast('Уведомления включены');
    await loadInfo(); PA.render();
  }
  async function disable() {
    const sub = await currentSub();
    if (sub) { await PA.api('push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
    PA.toast('На этом устройстве уведомления выключены');
    await loadInfo(); PA.render();
  }
  async function sendNow(kind) {
    const r = await PA.api('push/' + kind, { method: 'POST', body: '{}' });
    if (!r.ok) return PA.toast(await PA.why(r), true);
    const d = await r.json();
    if (d.empty) return PA.toast('Сегодня в сводке нечего сообщить');
    PA.toast(d.sent ? `Отправлено на ${d.sent} ${plural(d.sent, 'устройство', 'устройства', 'устройств')}` : 'Не отправлено: нет подписанных устройств', !d.sent);
    if (d.removed) await loadInfo();
  }
  async function saveSetting(data) {
    const r = await PA.api('push/settings', { method: 'POST', body: JSON.stringify(data) });
    if (!r.ok) return PA.toast(await PA.why(r), true);
    info.settings = (await r.json()).settings;
    PA.toast('Сохранено');
  }

  PA.views.notify = box => {
    const wrap = el('div', { class: 'nt' }, [el('h1', { text: 'Уведомления' }), el('p', { class: 'pl-hint', text: 'Загружаю…' })]);
    box.append(wrap);
    (info ? Promise.resolve() : loadInfo()).then(currentSub).then(sub => {
      if (state.view !== 'notify') return;
      wrap.replaceChildren(...build(sub));
    }).catch(e => { wrap.replaceChildren(el('h1', { text: 'Уведомления' }), PA.empty(e.message === 'auth' ? 'Войдите снова.' : e.message)); });
  };

  function build(sub) {
    const parts_ = [el('h1', { text: 'Уведомления' })];
    const perm = supported() ? Notification.permission : 'none';
    let status;
    if (isIOS && !standalone()) {
      status = el('section', { class: 'nt-card card' }, [
        el('h2', { text: 'Сначала добавьте план на экран «Домой»' }),
        el('p', { class: 'pl-hint', text: 'На iPhone уведомления работают только у веб-приложения на экране «Домой», iOS 16.4 и новее.' }),
        el('ol', { class: 'nt-steps' }, [
          el('li', { text: 'Откройте эту страницу в Safari.' }),
          el('li', { text: 'Нажмите «Поделиться» — квадрат со стрелкой вверх.' }),
          el('li', { text: 'Выберите «На экран „Домой“» и нажмите «Добавить».' }),
          el('li', { text: 'Откройте «План» с экрана «Домой», войдите и вернитесь сюда.' }),
        ]),
      ]);
    } else if (!supported()) {
      status = el('section', { class: 'nt-card card' }, [el('h2', { text: 'Этот браузер не умеет получать уведомления' }), el('p', { class: 'pl-hint', text: 'Подойдут Safari на iPhone (через экран «Домой»), Chrome, Edge или Firefox.' })]);
    } else if (perm === 'denied') {
      status = el('section', { class: 'nt-card card' }, [el('h2', { text: 'Уведомления запрещены' }), el('p', { class: 'pl-hint', text: isIOS ? 'Включите их в «Настройки» → «Уведомления» → «План», затем вернитесь сюда.' : 'Разрешите уведомления для pilotarbuza.com в настройках сайта в браузере.' })]);
    } else if (sub && perm === 'granted') {
      status = el('section', { class: 'nt-card nt-card--on card' }, [
        el('div', { class: 'nt-on' }, [el('span', { class: 'pulse', 'aria-hidden': 'true' }), el('h2', { text: `Включены на этом устройстве (${device()})` })]),
        el('div', { class: 'pl-row' }, [
          el('button', { type: 'button', class: 'btn btn--primary btn--sm', text: 'Прислать проверочное', onclick: () => sendNow('test') }),
          el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Прислать сводку сейчас', onclick: () => sendNow('digest') }),
        ]),
        el('button', { type: 'button', class: 'pl-del', text: 'Выключить на этом устройстве', onclick: disable }),
      ]);
    } else {
      status = el('section', { class: 'nt-card card' }, [
        el('h2', { text: 'Получать сводку и напоминания на это устройство' }),
        el('p', { class: 'pl-hint', text: 'Телефон спросит разрешение. Выключить можно здесь же или в настройках телефона.' }),
        el('button', { type: 'button', class: 'btn btn--primary', text: 'Включить уведомления', onclick: () => enable().catch(e => PA.toast('Не получилось: ' + e.message, true)) }),
      ]);
    }
    parts_.push(status);

    const s = info.settings;
    const toggle = (key, title, hint) => {
      const on = el('input', { type: 'checkbox', checked: s[key + '_on'], class: 'nt-switch', role: 'switch', 'aria-label': title });
      const time = el('input', { class: 'fld-in nt-time', type: 'time', value: s[key + '_time'], step: 300, 'aria-label': `Время: ${title.toLowerCase()}` });
      on.addEventListener('change', () => saveSetting({ [key + '_on']: on.checked }));
      time.addEventListener('change', () => { if (time.value) saveSetting({ [key + '_time']: time.value.slice(0, 5) }); });
      return el('div', { class: 'nt-opt' }, [el('label', { class: 'nt-opt__t' }, [on, el('span', {}, [el('b', { text: title }), el('span', { class: 'pl-hint', text: hint })])]), time]);
    };
    parts_.push(el('section', { class: 'nt-card card' }, [
      el('h2', { text: 'Что и когда присылать' }),
      toggle('digest', 'Утренняя сводка', 'Просроченное, сроки на сегодня, ворота и дедлайны через неделю, шаги по контактам'),
      toggle('evening', 'Напоминание накануне', 'Если на завтра есть срок задачи, дедлайн или шаг по контакту'),
      el('p', { class: 'pl-hint', text: 'Время турецкое (UTC+3). Пустую сводку сервер не присылает.' }),
    ]));
    const subs = info.subscriptions || [];
    parts_.push(el('section', { class: 'nt-card card' }, [
      el('h2', { text: 'Подписанные устройства' }),
      subs.length ? el('ul', { class: 'nt-devs' }, subs.map(d => el('li', {}, [
        el('span', {}, [el('b', { text: d.ua || 'Устройство' }), el('span', { class: 'pl-hint', text: ` ${HOST(d.host)}, с ${fmt(d.created_at.slice(0, 10), true)}` }), sub && sub.endpoint.split('/')[2] === d.host && d.ua === device() ? el('span', { class: 'nt-this', text: 'это' }) : null]),
        el('button', { type: 'button', class: 'pl-del', text: 'Убрать', onclick: async () => { await PA.api('push/unsubscribe', { method: 'POST', body: JSON.stringify({ id: d.id }) }); await loadInfo(); PA.render(); } }),
      ]))) : el('p', { class: 'pl-hint', text: 'Пока ни одного.' }),
    ]));
    return parts_;
  }

  PA.push = { isIOS, standalone, supported };
})();
