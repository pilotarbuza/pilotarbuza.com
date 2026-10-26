/* pilotarbuza.com/me — вход, загрузка данных, разделы по адресу (#notes/n/5), service worker. */
(() => {
  const { $ } = ME;
  const login = $('#login'), app = $('#app');
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const show = authed => { login.hidden = authed; app.hidden = !authed; if (!authed) $('#password').focus(); };
  ME.setAuthLost(() => { ME.closeSheet(); show(false); $('#login-msg').textContent = 'Сессия закончилась, войдите снова.'; });
  $('#remember').checked = true;

  async function start() {
    try { await ME.load(); } catch (e) {
      if (e.message === 'auth') return;
      $('#view').replaceChildren(ME.empty('Данные не загрузились', `${e.message}. Если сайт только что обновился, перезапустите службу: sudo systemctl restart pilotarbuza-orders`));
      return;
    }
    ME.route();
  }
  window.addEventListener('hashchange', ME.route);
  // «+» в нижнем меню — быстро добавить что угодно
  $('#tabs-add').addEventListener('click', () => ME.menu('Добавить', [
    { icon: 'compose', text: 'Заметку', fn: () => ME.notes.newNote() },
    { icon: 'money', text: 'Расход или доход', fn: () => { ME.go('money'); setTimeout(() => ME.fin.txSheet(), 50); } },
    { icon: 'location', text: 'Где я сейчас', fn: () => ME.countries.here() },
    { icon: 'calendar', text: 'Дни в стране', fn: () => { ME.go('countries'); setTimeout(() => ME.countries.addMenu(), 50); } },
    { icon: 'doc', text: 'Документ', fn: () => { ME.go('docs'); setTimeout(() => ME.docs.edit(), 50); } },
    { icon: 'repeat', text: 'Подписку', fn: () => { ME.go('money/subs'); setTimeout(() => ME.fin.subSheet(), 50); } },
  ]));

  // данные могли поменяться на другом устройстве или прийти из «Быстрых команд» — обновить при возвращении
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (app.hidden || $('#sheet').open || ME.cur.view === 'notes' && ME.cur.args[0] === 'n' || Date.now() - hiddenAt < 60000) return;
    try { await ME.load(); ME.render(); } catch (e) { /* сессия кончилась — покажет вход */ }
  });

  const NO_NET = 'Нет связи с сервером — проверьте интернет.';
  login.addEventListener('submit', async e => {
    e.preventDefault();
    const out = $('#login-msg'), pw = $('#password');
    out.textContent = '';
    let r;
    try { r = await ME.api('admin/login', { method: 'POST', body: JSON.stringify({ password: pw.value, remember: $('#remember').checked }) }); } catch (ex) { out.textContent = NO_NET; return; }
    pw.value = '';
    if (r.ok) { show(true); return start(); }
    out.textContent = r.status === 429 ? 'Слишком много попыток. Подождите 15 минут.' : r.status === 401 ? 'Неверный пароль.' : `Сервер недоступен (ошибка ${r.status}).`;
  });

  (async () => {
    let authed = false;
    try { const r = await fetch('/api/admin/me', { credentials: 'same-origin' }); authed = r.ok && (await r.json()).auth; } catch (e) { /* офлайн — покажем вход */ }
    show(authed);
    if (authed) start();
  })();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/me/sw.js', { scope: '/me/' }).catch(() => {});
  if (standalone()) document.documentElement.classList.add('standalone');
})();
