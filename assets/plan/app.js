/* pilotarbuza.com/admin/plan — вход, загрузка данных, разделы по адресу (#gantt, #crm/12), меню телефона, service worker. */
(() => {
  const { $, state, api } = PA;
  const login = $('#login'), app = $('#app'), sheet = $('#sheet');
  const VIEWS = ['today', 'overview', 'gantt', 'calendar', 'board', 'crm', 'team', 'notify', 'uni'];
  const phone = () => window.matchMedia('(max-width: 860px)').matches;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  const show = authed => { login.hidden = authed; app.hidden = !authed; if (!authed) $('#password').focus(); };
  PA.setAuthLost(() => { PA.closeDrawer(); show(false); $('#login-msg').textContent = 'Сессия закончилась, войдите снова.'; });
  $('#remember').checked = standalone() || phone();

  function route() {
    const [v, id] = location.hash.replace('#', '').split('/');
    state.view = VIEWS.includes(v) ? v : (phone() || standalone() ? 'today' : 'overview');
    if (state.view === 'crm') state.sel = id ? { contact: Number(id) } : (state.sel?.newContact ? state.sel : null);
    PA.closeDrawer();
    if (sheet.open) sheet.close();
    PA.render();
    document.querySelectorAll('#bnav a, #sheet a[data-view]').forEach(a => a.setAttribute('aria-current', a.dataset.view === state.view ? 'page' : 'false'));
    $('#bnav-more').setAttribute('aria-current', ['crm', 'overview', 'gantt', 'board', 'team', 'notify'].includes(state.view) ? 'page' : 'false');
    window.scrollTo(0, 0);
  }

  async function start() {
    try { await PA.load(); } catch (e) {
      if (e.message === 'auth') return;
      $('#view').replaceChildren(PA.el('div', { class: 'pl-empty card' }, [
        PA.el('h1', { text: 'План не загрузился' }),
        PA.el('p', { text: e.message }),
        PA.el('p', { class: 'pl-hint', text: 'Если сайт только что обновился, службу заказов нужно перезапустить на сервере: sudo systemctl restart pilotarbuza-orders' }),
      ]));
      return;
    }
    const p = state.projects[0];
    if (p) $('#project-name').textContent = p.name;
    route();
  }

  // данные могли поменяться на другом устройстве — обновить, когда приложение снова на экране
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (app.hidden || PA.drawer.open || Date.now() - hiddenAt < 60000) return;
    try { await PA.load(); PA.render(); } catch (e) { /* сессия кончилась — покажет форму входа */ }
  });

  // Причина видна сразу: нет связи у телефона или сервер ответил ошибкой (502 — служба заказов не отвечает Caddy).
  const NO_NET = 'Нет связи с сервером — проверьте интернет и попробуйте ещё раз.';
  const down = status => 'Сервер недоступен (ошибка ' + status + ')' + (status === 502 || status === 503 ? ': служба заказов не отвечает.' : '.');

  login.addEventListener('submit', async e => {
    e.preventDefault();
    const out = $('#login-msg'), pw = $('#password');
    out.textContent = '';
    let r;
    try { r = await api('login', { method: 'POST', body: JSON.stringify({ password: pw.value, remember: $('#remember').checked }) }); } catch (ex) { out.textContent = NO_NET; return; }
    pw.value = '';
    if (r.ok) { show(true); return start(); }
    out.textContent = r.status === 429 ? 'Слишком много попыток. Подождите 15 минут.' : r.status === 401 ? 'Неверный пароль.' : down(r.status);
  });
  document.querySelectorAll('[data-logout]').forEach(b => b.addEventListener('click', async () => { await api('logout', { method: 'POST', body: '{}' }).catch(() => {}); location.reload(); }));
  $('#new-task').addEventListener('click', () => PA.openTask(null));
  $('#bnav-add').addEventListener('click', () => PA.openTask(null));
  $('#bnav-more').addEventListener('click', () => sheet.showModal());
  sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('a')) sheet.close(); });
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', e => {
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !PA.drawer.open && !app.hidden) { e.preventDefault(); PA.openTask(null); }
  });
  document.addEventListener('click', e => { const m = document.querySelector('.pl-more[open]'); if (m && !m.contains(e.target)) m.open = false; });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/admin/plan/sw.js', { scope: '/admin/plan/' }).catch(() => {});

  fetch('/api/admin/me', { credentials: 'same-origin' })
    .then(r => r.ok ? r.json() : Promise.reject(new Error(down(r.status))))
    .then(d => { show(!!d.auth); if (d.auth) start(); })
    .catch(e => { show(false); $('#login-msg').textContent = e.message.startsWith('Сервер') ? e.message : NO_NET; });
})();
