/* pilotarbuza.com/me — разделы бывшего «Плана» (/admin/plan/) внутри приложения: Университет, Календарь и Анемос
   (сегодня, обзор, Гант, доска, контакты, команда), уведомления. Сами разделы рисует код assets/plan/*.js (объект PA)
   в контейнер #view; здесь — шапка приложения над ним, загрузка данных и адреса (#uni, #calendar, #gantt, #crm/12…). */
(() => {
  const { el, state, screen, navBtn, go } = ME;
  const host = document.getElementById('view');
  let loaded = null;
  const load = () => loaded || (loaded = PA.load().then(() => { state.plan = PA.state; }).catch(e => { loaded = null; throw e; }));
  ME.loadPlan = async () => { loaded = null; try { await load(); if (ME.cur.view === 'home') ME.render(); } catch (e) { /* план недоступен — на главной его просто не будет */ } };
  PA.setAuthLost(() => { location.reload(); });

  const ANEMOS = [['today', 'Сегодня'], ['overview', 'Обзор'], ['gantt', 'Гант'], ['board', 'Доска'], ['crm', 'Контакты'], ['team', 'Команда']];
  const switcher = cur => el('nav', { class: 'pl-sw', 'aria-label': 'Анемос' }, ANEMOS.map(([v, t]) => el('a', { href: '#' + v, text: t, 'aria-current': v === cur ? 'page' : 'false' })));
  const newTask = () => navBtn('plus', () => PA.openTask(null), { 'aria-label': 'Новая задача' });
  const SCREENS = {
    uni: { title: 'Университет', right: () => [] },
    calendar: { title: 'Календарь', right: () => [newTask()] },
    notify: { title: 'Уведомления', back: '#more', backText: 'Ещё' },
  };
  ANEMOS.forEach(([v]) => { SCREENS[v] = { title: 'Анемос', anemos: true, right: () => [newTask()] }; });

  function show(box, view, args) {
    const sc = SCREENS[view];
    const body = screen(box, { title: '', back: sc.back || (sc.anemos ? '#more' : null), backText: sc.backText || (sc.anemos ? 'Ещё' : null), right: sc.right ? sc.right() : [], large: false });
    if (sc.anemos) body.append(switcher(view));
    body.append(host);
    host.hidden = false;
    PA.state.view = view;
    if (view === 'crm') PA.state.sel = args[0] ? { contact: Number(args[0]) } : (PA.state.sel && PA.state.sel.newContact ? PA.state.sel : null);
    PA.closeDrawer();
    const draw = () => { if (ME.cur.view === view && host.isConnected) PA.render(); };
    if (PA.state.projects.length || PA.state.lessons.length) draw();
    else host.replaceChildren(el('p', { class: 'pl-hint', style: 'padding:24px 0;text-align:center', text: 'Загружаю…' }));
    load().then(draw).catch(e => { if (ME.cur.view === view) host.replaceChildren(ME.empty('План не загрузился', e.message)); });
  }
  Object.keys(SCREENS).forEach(v => { ME.views[v] = (box, args) => show(box, v, args); });
})();
