/* pilotarbuza.com/me — «Заметки», по образцу приложения «Заметки» на iPhone:
   папки и теги, закреплённые, группы по датам, свайпы, редактор с форматированием «Aa», чек-листы, фото,
   «Недавно удалённые» на 30 дней. Адреса: #notes (все заметки), #notes/folders, #notes/f/<id|all|deleted|tag:слово>, #notes/n/<id>, #notes/new/<папка>. */
(() => {
  const { el, icon, state, screen, navBtn, group, row, sheet, closeSheet, menu, ask, toast, save, remove, go, plural, MON_G, MONTHS, WDL, dn, today, iso } = ME;

  const live = () => state.notes.filter(n => !n.deleted);
  const deleted = () => state.notes.filter(n => n.deleted);
  const stamp = n => n.edited || n.updated_at || n.created_at || '';
  const folderName = id => (id === 'all' ? 'Все заметки' : id === 'deleted' ? 'Недавно удалённые' : String(id).startsWith('tag:') ? '#' + decodeURIComponent(String(id).slice(4)) : (state.folders.find(f => f.id === Number(id)) || {}).name || 'Заметки');
  const TAG_RE = /(^|\s)#([\p{L}\d_]{2,40})/gu;
  const tagsOf = n => [...new Set([...(n.text || '').matchAll(TAG_RE)].map(m => m[2].toLowerCase()))];
  const lines = n => (n.text || '').split('\n').map(s => s.trim()).filter(Boolean);
  const titleOf = n => n.title || lines(n)[0] || 'Новая заметка';
  const preview = n => lines(n).slice(1).join(' ') || 'Нет дополнительного текста';
  const localDay = s => dn(ME.localIso(new Date(s)));
  const when = s => {
    if (!s) return '';
    const d = new Date(s), n = localDay(s), t0 = today();
    if (n === t0) return ME.hm(s);
    if (n === t0 - 1) return 'Вчера';
    if (t0 - n < 7) return WDL[ME.wday(n)].replace(/^./, c => c.toUpperCase());
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(2)}`;
  };
  const bucket = s => {
    const n = localDay(s), t0 = today(), p = ME.parts(n), py = ME.parts(t0).y;
    if (n === t0) return 'Сегодня';
    if (n === t0 - 1) return 'Вчера';
    if (t0 - n < 7) return 'Предыдущие 7 дней';
    if (t0 - n < 30) return 'Предыдущие 30 дней';
    return p.y === py ? MONTHS[p.m].replace(/^./, c => c.toUpperCase()) : String(p.y);
  };
  const sorted = list => [...list].sort((a, b) => stamp(b).localeCompare(stamp(a)));

  // ---------- свайп строки ----------
  let openSwipe = null;
  function swipe(body, left = [], right = []) {
    const acts = (list, side) => el('div', {}, list.map(a => el('button', { type: 'button', style: `background:${a.color}`, 'aria-label': a.text, onclick: e => { e.stopPropagation(); close(); a.fn(); } }, [icon(a.icon), el('span', { text: a.text })])));
    const wrap = el('div', { class: 'swipe' }, [el('div', { class: 'swipe__acts' }, [acts(right, 'r'), acts(left, 'l')]), el('div', { class: 'swipe__body' }, body)]);
    const b = wrap.lastChild, wl = left.length * 74, wr = right.length * 74;
    let x0 = null, y0 = 0, dx = 0, base = 0, horiz = null;
    const set = v => { b.style.transform = v ? `translateX(${v}px)` : ''; wrap.classList.toggle('opened', !!v); };
    const close = () => { base = 0; set(0); if (openSwipe === close) openSwipe = null; };
    wrap.addEventListener('touchstart', e => { if (openSwipe && openSwipe !== close) openSwipe(); x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; horiz = null; dx = 0; }, { passive: true });
    wrap.addEventListener('touchmove', e => {
      if (x0 === null) return;
      const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
      if (horiz === null && Math.abs(mx) + Math.abs(my) > 8) horiz = Math.abs(mx) > Math.abs(my);
      if (!horiz) return;
      dx = Math.max(-wl - 40, Math.min(wr + 40, base + mx));
      if ((dx < 0 && !wl) || (dx > 0 && !wr)) dx = 0;
      wrap.classList.add('dragging'); set(dx);
    }, { passive: true });
    wrap.addEventListener('touchend', () => {
      wrap.classList.remove('dragging');
      if (horiz) {
        if (dx < -wl - 20 && left.length) { close(); left[left.length - 1].fn(); }
        else if (dx > wr + 20 && right.length) { close(); right[0].fn(); }
        else if (dx < -40) { base = -wl; set(base); openSwipe = close; }
        else if (dx > 40) { base = wr; set(base); openSwipe = close; }
        else close();
      }
      x0 = null;
    });
    b.addEventListener('click', e => { if (base) { e.preventDefault(); e.stopPropagation(); close(); } }, true);
    return wrap;
  }
  document.addEventListener('touchstart', e => { if (openSwipe && !e.target.closest('.swipe')) openSwipe(); }, { passive: true });

  // ---------- действия с заметками ----------
  async function togglePin(n) { if (await save('notes', n.id, { pinned: !n.pinned })) { ME.render(); toast(n.pinned ? 'Закреплено' : 'Откреплено'); } }
  async function trash(n) {
    if (!await save('notes', n.id, { deleted: ME.todayIso(), pinned: false })) return;
    ME.render();
    toast('Перемещено в «Недавно удалённые»', false, { label: 'Вернуть', fn: async () => { if (await save('notes', n.id, { deleted: null })) ME.render(); } });
  }
  function moveTo(n, after) {
    sheet({ title: 'Переместить', body: group(null, [
      ...state.folders.map(f => row({ icon: 'folder', color: 'var(--notes)', title: f.name, value: f.id === n.folder ? icon('check') : null, chev: false, onclick: async () => {
        closeSheet(); if (await save('notes', n.id, { folder: f.id, deleted: null })) { toast(`В папке «${f.name}»`); after ? after() : ME.render(); }
      } })),
      row({ icon: 'newfolder', color: 'var(--notes)', title: 'Новая папка…', chev: false, onclick: () => newFolder(async f => { if (await save('notes', n.id, { folder: f.id, deleted: null })) { toast(`В папке «${f.name}»`); after ? after() : ME.render(); } }) }),
    ]) });
  }
  function newFolder(then, folder) {
    const inp = el('input', { class: 'l', value: folder ? folder.name : '', placeholder: 'Название', maxLength: 80 });
    sheet({ title: folder ? 'Переименовать папку' : 'Новая папка', doneText: 'Готово', body: group(null, [el('div', { class: 'row' }, inp)]), done: async () => {
      const name = inp.value.trim();
      if (!name) { inp.focus(); return false; }
      const f = await save('folders', folder ? folder.id : null, folder ? { name } : { name, order: (Math.max(0, ...state.folders.map(x => x.order || 0)) + 10) });
      if (!f) return false;
      closeSheet(); then ? then(f) : ME.render(); return true;
    } });
    setTimeout(() => inp.focus(), 250);
  }
  async function newNote(folder) {
    const f = Number(folder) || (state.folders[0] && state.folders[0].id) || null;
    go(`notes/n/new${f ? '-' + f : ''}`);
  }

  const noteRow = (n, showFolder) => {
    const body = el('a', { class: 'row nt-row', href: `#notes/n/${n.id}`, style: '--inset:16px' }, [
      el('span', { class: 'row__main' }, [
        el('span', { class: 'row__t', text: titleOf(n) }),
        el('span', { class: 'nt-row__s' }, [el('time', { text: n.deleted ? `${Math.max(0, 30 - (today() - dn(n.deleted)))} дн.` : when(stamp(n)) }), el('span', { text: preview(n) })]),
        showFolder && n.folder ? el('span', { class: 'nt-row__f' }, [icon('folder'), folderName(n.folder)]) : null,
      ]),
    ]);
    if (n.deleted) return body;
    return swipe(body,
      [{ text: 'Папка', icon: 'move', color: 'var(--purple)', fn: () => moveTo(n) }, { text: 'Удалить', icon: 'trash', color: 'var(--red)', fn: () => trash(n) }],
      [{ text: n.pinned ? 'Открепить' : 'Закрепить', icon: 'pin', color: 'var(--orange)', fn: () => togglePin(n) }]);
  };

  const toolbar = (left, center, right) => el('div', { class: 'toolbar' }, el('div', { class: 'toolbar__row' }, [left || el('span'), el('span', { text: center || '' }), right || el('span')]));

  // ---------- папки ----------
  function folders(box) {
    const body = screen(box, { title: 'Папки', back: '#notes', backText: 'Заметки', cls: 'notes', right: [navBtn('compose', () => newNote(), { 'aria-label': 'Новая заметка' })] });
    const q = el('input', { type: 'search', placeholder: 'Поиск', value: state.ui.noteQ || '' });
    const res = el('div');
    const draw = () => {
      const s = q.value.trim().toLowerCase();
      state.ui.noteQ = q.value;
      if (s) {
        const hits = sorted(live().filter(n => (n.text || '').toLowerCase().includes(s) || titleOf(n).toLowerCase().includes(s)));
        res.replaceChildren(hits.length ? group(`Заметки · ${hits.length}`, hits.map(n => noteRow(n, true))) : ME.empty('Нет результатов', `По запросу «${q.value.trim()}» ничего не нашлось.`));
        return;
      }
      const count = id => live().filter(n => n.folder === id).length;
      const tags = [...new Set(live().flatMap(tagsOf))].sort();
      res.replaceChildren(...[
        group(null, [
          row({ icon: 'folder', color: 'var(--notes)', title: 'Все заметки', value: String(live().length), href: '#notes' }),
          ...[...state.folders].sort((a, b) => (a.order || 0) - (b.order || 0) || a.id - b.id).map(f => swipe(
            row({ icon: 'folder', color: 'var(--notes)', title: f.name, value: String(count(f.id)), href: `#notes/f/${f.id}` }),
            [{ text: 'Имя', icon: 'compose', color: 'var(--gray)', fn: () => newFolder(null, f) }, { text: 'Удалить', icon: 'trash', color: 'var(--red)', fn: async () => {
              const n = count(f.id);
              if (!await ask(n ? `Удалить папку «${f.name}»? ${n} ${plural(n, 'заметка попадёт', 'заметки попадут', 'заметок попадут')} в «Недавно удалённые».` : `Удалить папку «${f.name}»?`, 'Удалить папку')) return;
              if (await remove('folders', f.id)) { ME.render(); toast('Папка удалена'); }
            } }])),
          deleted().length ? row({ icon: 'trash', color: 'var(--notes)', title: 'Недавно удалённые', value: String(deleted().length), href: '#notes/f/deleted' }) : null,
        ]),
        tags.length ? el('section', { class: 'group' }, [el('h2', { class: 'group__h group__h--big', text: 'Теги' }), el('div', { class: 'list tags' }, tags.map(t => el('a', { href: `#notes/f/tag:${encodeURIComponent(t)}`, text: '#' + t })))]) : null,
      ].filter(Boolean));
    };
    q.addEventListener('input', draw);
    body.append(el('div', { class: 'search' }, [icon('search'), q]), res);
    draw();
    box.append(toolbar(navBtn('newfolder', () => newFolder(), { 'aria-label': 'Новая папка' }), '', navBtn('compose', () => newNote(), { 'aria-label': 'Новая заметка' })));
  }

  // ---------- список заметок ----------
  function list(box, id) {
    const isDel = id === 'deleted', isTag = String(id).startsWith('tag:'), tag = isTag ? decodeURIComponent(id.slice(4)) : null;
    const folder = state.folders.find(f => f.id === Number(id));
    const all = isDel ? deleted() : live().filter(n => id === 'all' || (isTag ? tagsOf(n).includes(tag) : n.folder === Number(id)));
    const right = [];
    if (folder) right.push(navBtn('more', () => menu(folder.name, [
      { icon: 'compose', text: 'Переименовать', fn: () => newFolder(null, folder) },
      { icon: 'trash', text: 'Удалить папку', danger: true, fn: async () => { if (await ask(`Удалить папку «${folder.name}»?`, 'Удалить папку') && await remove('folders', folder.id)) go('notes/folders'); } },
    ]), { 'aria-label': 'Действия с папкой' }));
    const body = screen(box, { title: folderName(id), back: '#notes/folders', backText: 'Папки', cls: 'notes', right });
    const q = el('input', { type: 'search', placeholder: 'Поиск' });
    const res = el('div');
    const draw = () => {
      const s = q.value.trim().toLowerCase();
      const items = sorted(all.filter(n => !s || (n.text || '').toLowerCase().includes(s)));
      if (!items.length) { res.replaceChildren(...[ME.empty(s ? 'Нет результатов' : isDel ? 'Здесь пусто' : 'Нет заметок', isDel ? 'Удалённые заметки хранятся здесь 30 дней.' : null)].filter(Boolean)); return; }
      const out = [];
      const pinned = isDel || s ? [] : items.filter(n => n.pinned);
      if (pinned.length) out.push(group('Закреплённые', pinned.map(n => noteRow(n, id === 'all' || isTag))));
      const rest = items.filter(n => !pinned.includes(n));
      const groups = new Map();
      rest.forEach(n => { const b = isDel ? 'Удалены, хранятся 30 дней' : bucket(stamp(n)); if (!groups.has(b)) groups.set(b, []); groups.get(b).push(n); });
      groups.forEach((ns, b) => out.push(group(el('h2', { class: 'group__h group__h--big', text: b }), ns.map(n => isDel ? row({ title: titleOf(n), sub: `Осталось ${Math.max(0, 30 - (today() - dn(n.deleted)))} дн. · ${preview(n)}`, onclick: () => deletedMenu(n) }) : noteRow(n, id === 'all' || isTag)))));
      res.replaceChildren(...out);
    };
    q.addEventListener('input', draw);
    body.append(el('div', { class: 'search' }, [icon('search'), q]), res);
    draw();
    const n = all.length;
    box.append(isDel
      ? toolbar(null, `${n} ${plural(n, 'заметка', 'заметки', 'заметок')}`, n ? navBtn(el('span', { text: 'Удалить все' }), async () => {
        if (!await ask(`Удалить ${n} ${plural(n, 'заметку', 'заметки', 'заметок')} навсегда? Это действие нельзя отменить.`, 'Удалить навсегда')) return;
        for (const x of all) await remove('notes', x.id);
        ME.render();
      }) : null)
      : toolbar(null, `${n} ${plural(n, 'заметка', 'заметки', 'заметок')}`, navBtn('compose', () => newNote(folder ? folder.id : null), { 'aria-label': 'Новая заметка' })));
  }
  const deletedMenu = n => menu(titleOf(n), [
    { icon: 'restore', text: 'Восстановить', fn: () => moveTo(n) },
    { icon: 'trash', text: 'Удалить навсегда', danger: true, fn: async () => { if (await ask('Удалить заметку навсегда?', 'Удалить') && await remove('notes', n.id)) ME.render(); } },
  ]);

  // ---------- редактор ----------
  const exec = (cmd, val) => document.execCommand(cmd, false, val);
  const blockOf = node => { let n = node && node.nodeType === 3 ? node.parentNode : node; while (n && n.parentNode && !n.parentNode.classList?.contains('ed__body')) n = n.parentNode; return n; };
  const closest = (sel) => { const s = getSelection(); if (!s.rangeCount) return null; const n = s.anchorNode; return (n && (n.nodeType === 3 ? n.parentNode : n)).closest(sel); };

  function editor(box, arg) {
    let note = state.notes.find(n => n.id === Number(arg));
    const newFolderId = String(arg).startsWith('new') ? Number(String(arg).split('-')[1]) || null : null;
    if (!note && !String(arg).startsWith('new')) { go('notes'); return; }
    document.body.classList.add('no-tabs');
    const backTo = note ? (note.deleted ? '#notes/f/deleted' : state.ui.noteBack || (note.folder ? `#notes/f/${note.folder}` : '#notes')) : (newFolderId ? `#notes/f/${newFolderId}` : '#notes');
    const ed = el('div', { class: 'ed__body', contenteditable: note && note.deleted ? 'false' : 'true', spellcheck: 'true', 'data-ph': 'Новая заметка', autocapitalize: 'sentences' });
    ed.innerHTML = note ? ME.cleanHtml(note.body) : '';
    const dateLine = el('p', { class: 'ed__date' });
    const drawDate = () => { const d = new Date(note ? stamp(note) : Date.now()); dateLine.textContent = `${d.getDate()} ${MON_G[d.getMonth()]} ${d.getFullYear()} г. в ${ME.hm(d)}`; };
    drawDate();
    const doneBtn = navBtn(el('span', { text: 'Готово' }), () => ed.blur(), { bold: true, hidden: true });
    const right = [navBtn('share', () => share(), { 'aria-label': 'Поделиться' }), navBtn('more', () => noteMenu(), { 'aria-label': 'Ещё' }), doneBtn];
    const body = screen(box, { title: '', back: backTo, backText: note && note.deleted ? 'Удалённые' : folderName(note ? (note.folder || 'all') : (newFolderId || 'all')), right, large: false, full: true, cls: 'notes' });
    body.append(el('div', { class: 'ed' }, [dateLine, ed]));

    // сохранение: через 0,7 с после последней правки и при уходе с экрана
    let timer = null, saving = null, dirty = false;
    const snapshot = () => {
      const text = ed.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      const first = text.split('\n').map(s => s.trim()).find(Boolean) || '';
      return { body: ME.cleanHtml(ed.innerHTML), text, title: first.slice(0, 200), edited: new Date().toISOString().slice(0, 19) + 'Z' };
    };
    const flush = async () => {
      clearTimeout(timer);
      if (!dirty) return saving;
      dirty = false;
      const data = snapshot();
      await saving;
      if (!note && !data.text && !ed.querySelector('img')) return;
      saving = (async () => {
        const rec = await save('notes', note ? note.id : null, note ? data : { ...data, folder: newFolderId || (state.folders[0] && state.folders[0].id) || null }, true);
        if (rec) { note = rec; drawDate(); if (String(arg).startsWith('new')) history.replaceState(null, '', `#notes/n/${rec.id}`); }
        else { dirty = true; toast('Не сохранилось — проверьте связь', true); }
      })();
      return saving;
    };
    const changed = () => { dirty = true; clearTimeout(timer); timer = setTimeout(flush, 700); };
    ed.addEventListener('input', changed);
    ed.addEventListener('focus', () => { doneBtn.hidden = false; if (!ed.firstChild) { ed.innerHTML = '<div><br></div>'; placeCaret(ed.firstChild); } kb.hidden = false; });
    ed.addEventListener('blur', () => { doneBtn.hidden = true; flush(); });
    exec('defaultParagraphSeparator', 'div');
    // переход по ссылке из режима чтения; галочка чек-листа — касание слева от пункта
    ed.addEventListener('click', e => {
      const li = e.target.closest('ul.cl > li');
      if (li && e.clientX < li.getBoundingClientRect().left + 2) { e.preventDefault(); li.classList.toggle('done'); changed(); return; }
      const a = e.target.closest('a[href]');
      if (a && document.activeElement !== ed) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
    });
    ed.addEventListener('paste', e => {
      const html = e.clipboardData.getData('text/html'), text = e.clipboardData.getData('text/plain');
      e.preventDefault();
      if (html) exec('insertHTML', ME.cleanHtml(html)); else exec('insertText', text);
    });
    ed.addEventListener('keydown', e => {
      // Enter в пустом пункте чек-листа — выйти из списка, как на iPhone
      if (e.key === 'Enter') { const li = closest('li'); if (li && !li.textContent.trim()) { e.preventDefault(); exec('outdent'); } }
    });
    // уходим со страницы — сохранить; пустая новая заметка не создаётся
    const leave = () => {
      if (dirty) flush();
      window.removeEventListener('hashchange', leave); window.removeEventListener('pagehide', leave);
      document.removeEventListener('selectionchange', keepRange);
      if (vv) { vv.removeEventListener('resize', place); vv.removeEventListener('scroll', place); }
      const f = document.querySelector('.fmt'); if (f) f.remove();
    };
    window.addEventListener('hashchange', leave);
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); }, { once: true });

    // ---------- панель над клавиатурой ----------
    const kb = el('div', { class: 'kb', hidden: !(note && note.deleted) ? false : true }, el('div', { class: 'kb__row' }, [
      el('button', { type: 'button', 'aria-label': 'Формат', onmousedown: e => e.preventDefault(), onclick: () => formatPanel() }, el('b', { text: 'Aa' })),
      el('button', { type: 'button', 'aria-label': 'Чек-лист', onmousedown: e => e.preventDefault(), onclick: () => toggleList('cl') }, icon('checklist')),
      el('button', { type: 'button', 'aria-label': 'Таблица', onmousedown: e => e.preventDefault(), onclick: () => { focusEd(); exec('insertHTML', '<table><tbody><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr></tbody></table><div><br></div>'); changed(); } }, icon('table')),
      el('button', { type: 'button', 'aria-label': 'Фото', onmousedown: e => e.preventDefault(), onclick: () => addPhoto() }, icon('camera')),
      el('button', { type: 'button', 'aria-label': 'Новая заметка', onmousedown: e => e.preventDefault(), onclick: async () => { await flush(); go(`notes/n/new${note && note.folder ? '-' + note.folder : ''}`); } }, icon('compose')),
    ]));
    if (note && note.deleted) kb.hidden = true;
    box.append(kb);
    const vv = window.visualViewport;
    const place = () => { if (!vv) return; const off = Math.max(0, window.innerHeight - vv.height - vv.offsetTop); kb.style.transform = off ? `translateY(${-off}px)` : ''; kb.style.paddingBottom = off ? '0' : ''; };
    if (vv) { vv.addEventListener('resize', place); vv.addEventListener('scroll', place); }

    let savedRange = null;
    function keepRange() { const s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); }
    document.addEventListener('selectionchange', keepRange);
    const focusEd = () => { if (document.activeElement !== ed) { ed.focus(); if (savedRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); } } };
    const placeCaret = node => { const r = document.createRange(); r.selectNodeContents(node); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };

    function toggleList(kind) {
      focusEd();
      const ul = closest('ul, ol');
      const isKind = ul && (kind === 'ol' ? ul.tagName === 'OL' : ul.tagName === 'UL' && (kind === 'ul' ? !ul.classList.length : ul.classList.contains(kind)));
      if (isKind) { exec(kind === 'ol' ? 'insertOrderedList' : 'insertUnorderedList'); changed(); return; }
      if (ul && ul.tagName === 'UL' && kind !== 'ol') { ul.className = kind === 'ul' ? '' : kind; changed(); return; }
      exec(kind === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
      const n = closest('ul');
      if (n && kind !== 'ol') n.className = kind === 'ul' ? '' : kind;
      changed();
    }
    function formatPanel() {
      focusEd();
      const old = document.querySelector('.fmt'); if (old) { old.remove(); return; }
      const blk = blockOf(getSelection().anchorNode);
      const tag = blk && blk.tagName;
      const st = q => { try { return document.queryCommandState(q); } catch (e) { return false; } };
      const b = (content, fn, on, cls) => el('button', { type: 'button', class: cls, 'aria-pressed': String(!!on), onmousedown: e => e.preventDefault(), onclick: () => { focusEd(); fn(); changed(); p.remove(); formatPanel(); } }, content);
      const style = (label, tg, css) => b(el('span', { text: label, style: css }), () => exec('formatBlock', tg), tag === tg.toUpperCase() || (tg === 'div' && !['H1', 'H2', 'H3', 'PRE'].includes(tag)));
      const p = el('div', { class: 'fmt' }, [
        el('div', { class: 'fmt__head' }, [el('span', { text: 'Формат' }), el('button', { type: 'button', 'aria-label': 'Закрыть', onmousedown: e => e.preventDefault(), onclick: () => p.remove() }, icon('x'))]),
        el('div', { class: 'fmt__styles' }, [
          style('Заголовок', 'h1', 'font-weight:700;font-size:20px'), style('Подзаголовок', 'h2', 'font-weight:700'), style('Подраздел', 'h3', 'font-weight:600'),
          style('Основной текст', 'div'), style('Моноширинный', 'pre', 'font-family:var(--mono);font-size:15px'),
        ]),
        el('div', { class: 'fmt__grid' }, [
          el('div', { class: 'fmt__w2' }, [
            b(el('b', { text: 'B' }), () => exec('bold'), st('bold')), b(el('i', { text: 'I', style: 'font-family:Georgia,serif' }), () => exec('italic'), st('italic')),
            b(el('u', { text: 'U' }), () => exec('underline'), st('underline')), b(el('s', { text: 'S' }), () => exec('strikeThrough'), st('strikeThrough')),
          ]),
          el('div', { class: 'fmt__w2' }, [
            b(el('mark', { text: 'A', style: 'padding:0 4px;border-radius:3px;background:color-mix(in srgb,var(--notes) 50%,transparent);color:inherit' }), () => { const m = closest('mark'); if (m) m.replaceWith(...m.childNodes); else exec('insertHTML', `<mark>${(getSelection().toString() || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</mark>`); }, !!closest('mark')),
            b(icon('outdent'), () => exec('outdent')), b(icon('indent'), () => exec('indent')),
          ]),
          el('div', { class: 'fmt__w2' }, [
            b(icon('list'), () => toggleList('ul'), (() => { const u = closest('ul'); return u && !u.className; })()),
            b(icon('dash'), () => toggleList('dash'), !!closest('ul.dash')),
            b(icon('numlist'), () => toggleList('ol'), !!closest('ol')),
          ]),
          el('div', { class: 'fmt__w2' }, [b(icon('checklist'), () => toggleList('cl'), !!closest('ul.cl')), b(icon('table'), () => exec('insertHTML', '<table><tbody><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr></tbody></table><div><br></div>'))]),
        ]),
      ]);
      document.body.append(p);
    }
    async function addPhoto() {
      const files = await ME.pickFiles('image/*', true);
      if (!files.length) return;
      if (!note) { dirty = true; ed.focus(); if (!ed.innerText.trim()) ed.innerHTML = '<div>Фото</div>'; await flush(); }
      if (!note) return;
      for (const f of files) {
        const up = await ME.upload(await ME.shrink(f), note.id);
        if (up) { focusEd(); exec('insertHTML', `<img src="/api/me/files/${up.id}" alt=""><div><br></div>`); changed(); }
      }
    }
    async function share() {
      await flush();
      const text = ed.innerText.trim();
      if (navigator.share) { try { await navigator.share({ title: text.split('\n')[0], text }); } catch (e) { /* отменили */ } } else ME.copy(text);
    }
    function noteMenu() {
      if (!note) { toast('Сначала напишите что-нибудь'); return; }
      if (note.deleted) { deletedMenu(note); return; }
      menu(titleOf(note), [
        { icon: 'pin', text: note.pinned ? 'Открепить' : 'Закрепить', fn: async () => { const r = await save('notes', note.id, { pinned: !note.pinned }); if (r) { note = r; toast(r.pinned ? 'Закреплено' : 'Откреплено'); } } },
        { icon: 'move', text: 'Переместить', fn: () => moveTo(note, () => {}) },
        { icon: 'copy', text: 'Скопировать текст', fn: () => ME.copy(ed.innerText.trim()) },
        { icon: 'trash', text: 'Удалить', danger: true, fn: async () => { await flush(); await trash(note); go(backTo.slice(1)); } },
      ]);
    }
    if (!note) setTimeout(() => ed.focus(), 50);
  }

  ME.views.notes = (box, args) => {
    if (args[0] === 'n') return editor(box, args[1]);
    if (args[0] === 'f' && args[1] !== 'all') { state.ui.noteBack = '#notes/f/' + args[1]; return list(box, args[1]); }
    if (args[0] === 'folders') return folders(box);
    // основной экран раздела — «Все заметки», как на iPhone; папки — по кнопке «‹ Папки»
    state.ui.noteBack = '#notes';
    return list(box, 'all');
  };
  ME.notes = { titleOf, preview, stamp, newNote, live };
})();
