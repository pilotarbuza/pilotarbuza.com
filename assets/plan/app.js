/* pilotarbuza.com/admin/plan — вход, загрузка данных и переключение разделов по адресу (#gantt, #crm/12). */
(() => {
  const { $, state, api } = PA;
  const login = $('#login'), app = $('#app');
  const VIEWS = ['overview', 'gantt', 'calendar', 'board', 'crm', 'team'];

  const show = authed => { login.hidden = authed; app.hidden = !authed; if (!authed) $('#password').focus(); };
  PA.setAuthLost(() => { PA.closeDrawer(); show(false); $('#login-msg').textContent = 'Сессия закончилась, войдите снова.'; });

  function route() {
    const [v, id] = location.hash.replace('#', '').split('/');
    state.view = VIEWS.includes(v) ? v : 'overview';
    if (state.view === 'crm') state.sel = id ? { contact: Number(id) } : (state.sel?.newContact ? state.sel : null);
    PA.closeDrawer();
    PA.render();
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

  login.addEventListener('submit', async e => {
    e.preventDefault();
    const out = $('#login-msg'), pw = $('#password');
    out.textContent = '';
    let r;
    try { r = await api('login', { method: 'POST', body: JSON.stringify({ password: pw.value }) }); } catch (ex) { out.textContent = 'Сервер недоступен.'; return; }
    pw.value = '';
    if (r.ok) { show(true); return start(); }
    out.textContent = r.status === 429 ? 'Слишком много попыток. Подождите 15 минут.' : r.status === 401 ? 'Неверный пароль.' : 'Сервер недоступен.';
  });
  $('#logout').addEventListener('click', async () => { await api('logout', { method: 'POST', body: '{}' }).catch(() => {}); location.reload(); });
  $('#new-task').addEventListener('click', () => PA.openTask(null));
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', e => {
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !PA.drawer.open && !app.hidden) { e.preventDefault(); PA.openTask(null); }
  });
  document.addEventListener('click', e => { const m = document.querySelector('.pl-more[open]'); if (m && !m.contains(e.target)) m.open = false; });

  fetch('/api/admin/me', { credentials: 'same-origin' }).then(r => r.json()).then(d => { show(!!d.auth); if (d.auth) start(); })
    .catch(() => { show(false); $('#login-msg').textContent = 'Сервер недоступен.'; });
})();
