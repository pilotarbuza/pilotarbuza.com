/* pilotarbuza.com/shop — каталог мерча и форма предзаказа. Тексты в assets/i18n.js (ключи sp.*, f.*, cw.*, pr.*). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const t = k => (window.t ? window.t(k) : k);

  // Принты: id совпадает с именем файла assets/img/shop/<id>-<расцветка>.webp и со списком в server/orders.py.
  const PRINTS = [
    { id: 'buttons', name: 'JUST press BUTTONS', cw: 'sky_on_cloud' },
    { id: 'flap', name: 'CERTIFIED FLAP OPERATOR', cw: 'cloud_on_bordo' },
    { id: 'autopilot', name: 'CERTIFIED AUTOPILOT SUPERVISOR', cw: 'high_on_night' },
    { id: 'holding', name: "I'M NOT LOST, I'M HOLDING", cw: 'white_on_sky' },
    { id: '1500', name: '1500 FLIGHT HOURS / 0 SLEEP', cw: 'bordo_on_cloud' },
  ];
  // Расцветки: [цвет принта, цвет футболки] из брендбука 2.1.
  const CW = {
    sky_on_cloud: ['#4A5AD6', '#F3EFE6'], bordo_on_cloud: ['#7B2233', '#F3EFE6'], cloud_on_bordo: ['#F3EFE6', '#7B2233'],
    high_on_night: ['#C9D2F4', '#2B2F45'], white_on_sky: ['#FFFFFF', '#4A5AD6'],
  };
  const TG = 'https://t.me/pilot_arbuza';
  const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const src = (id, cw) => `/assets/img/shop/${id}-${cw}.webp`;
  const swatches = () => Object.keys(CW).map(k => `<button type="button" data-cw="${k}" style="--tee:${CW[k][1]};--ink-c:${CW[k][0]}"></button>`).join('');
  const tgLink = (name, cw) => `${TG}?text=${encodeURIComponent(t('sp.msg').replace('{p}', name).replace('{c}', t('cw.' + cw)))}`;

  /* ---------- часы, год, шапка, меню ---------- */
  const tick = () => {
    let v = '--:--';
    try { v = new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }); } catch (e) {}
    $$('.clock').forEach(el => { el.textContent = v; });
  };
  tick(); setInterval(tick, 15000);
  const y = $('#year'); if (y) y.textContent = new Date().getFullYear();
  const top = $('#top'), hero = $('#hero');
  if (top && hero) new IntersectionObserver(([e]) => top.classList.toggle('top--light', !e.isIntersecting), { rootMargin: '-64px 0px 0px 0px', threshold: 0 }).observe(hero);
  const burger = $('#burger'), menu = $('#menu');
  if (burger && menu) {
    const set = open => { menu.classList.toggle('menu--open', open); burger.setAttribute('aria-expanded', open); document.body.style.overflow = open ? 'hidden' : ''; };
    burger.addEventListener('click', () => set(!menu.classList.contains('menu--open')));
    $$('a', menu).forEach(a => a.addEventListener('click', () => set(false)));
  }

  /* ---------- каталог ---------- */
  const grid = $('#catalog');
  if (!grid) return;
  const how = $('.sp-how', grid);
  PRINTS.forEach((p, i) => {
    const el = document.createElement('article');
    el.className = 'sp-card card'; el.id = p.id;
    el.innerHTML = `
      <div class="sp-card__stage"><img src="${src(p.id, p.cw)}" width="900" height="840" alt="" ${i > 2 ? 'loading="lazy"' : ''}><span class="sp-card__n doto">0${i + 1} / 0${PRINTS.length}</span><span class="sp-card__badge"></span></div>
      <h2>${esc(p.name)}</h2>
      <p class="sp-card__d"></p>
      <div class="sp-card__cw"><small></small><div class="sw" role="group">${swatches()}</div></div>
      <div class="sp-card__buy"><div class="sp-card__btns"><button type="button" class="btn btn--primary sp-pre"></button><a class="btn btn--ghost sp-tg" target="_blank" rel="noopener">Telegram</a></div></div>`;
    grid.insertBefore(el, how);
    p.el = el;
    const img = $('img', el);
    $$('.sw button', el).forEach(b => b.addEventListener('click', () => {
      if (p.cw === b.dataset.cw) return;
      p.cw = b.dataset.cw;
      img.classList.add('swap');
      const next = new Image();
      next.onload = next.onerror = () => { img.src = next.src; img.classList.remove('swap'); };
      next.src = src(p.id, p.cw);
      paint(p);
    }));
    $('.sp-pre', el).addEventListener('click', () => openForm(p.id, p.cw));
  });

  function paintSw(box, cw) {
    box.setAttribute('aria-label', t('sp.color'));
    $$('button', box).forEach(b => { b.setAttribute('aria-pressed', b.dataset.cw === cw); b.setAttribute('aria-label', t('cw.' + b.dataset.cw)); b.title = t('cw.' + b.dataset.cw); });
  }
  function paint(p) {
    const el = p.el, cw = t('cw.' + p.cw);
    $('img', el).alt = `${p.name} — ${cw}`;
    $('.sp-card__badge', el).textContent = t('sp.badge');
    $('.sp-card__d', el).textContent = t('pr.' + p.id);
    $('.sp-card__cw small', el).innerHTML = `${t('sp.color')}: <b>${esc(cw)}</b>`;
    paintSw($('.sw', el), p.cw);
    $('.sp-pre', el).textContent = t('sp.pre');
    $('.sp-tg', el).href = tgLink(p.name, p.cw);
  }

  /* ---------- форма предзаказа ---------- */
  const dlg = $('#preorder'), form = $('#pf-form');
  const sel = { print: PRINTS[0].id, cw: PRINTS[0].cw };
  function paintForm() {
    if (!form) return;
    const p = PRINTS.find(x => x.id === sel.print);
    $('#pf-img').src = src(sel.print, sel.cw);
    $('#pf-img').alt = `${p.name} — ${t('cw.' + sel.cw)}`;
    $('#pf-cw').textContent = t('cw.' + sel.cw);
    paintSw($('#pf-sw'), sel.cw);
    form.elements.print.value = sel.print;
    form.elements.contact.placeholder = t('f.ph.' + form.elements.contact_type.value);
    const fb = $('#pf-fallback'); if (fb) fb.href = tgLink(p.name, sel.cw);
  }
  function openForm(print, cw) {
    if (!dlg || !dlg.showModal) { location.href = tgLink(PRINTS.find(x => x.id === print).name, cw); return; }
    sel.print = print; sel.cw = cw;
    $('#pf-done').hidden = true; form.hidden = false; $('#pf-err').hidden = true;
    paintForm();
    dlg.showModal();
  }
  if (dlg && form) {
    form.elements.print.innerHTML = PRINTS.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    $('#pf-sw').innerHTML = swatches();
    $$('#pf-sw button').forEach(b => b.addEventListener('click', () => { sel.cw = b.dataset.cw; paintForm(); }));
    form.elements.print.addEventListener('change', e => { sel.print = e.target.value; paintForm(); });
    form.elements.contact_type.addEventListener('change', paintForm);
    $$('[data-close]', dlg).forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    $$('[data-preorder]').forEach(b => b.addEventListener('click', () => openForm(sel.print, sel.cw)));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('#pf-send'), err = $('#pf-err'), f = form.elements;
      const body = {
        print: sel.print, colorway: sel.cw, size: f.size.value, qty: +f.qty.value || 1, name: f.name.value, contact_type: f.contact_type.value,
        contact: f.contact.value, city: f.city.value, comment: f.comment.value, website: f.website.value, lang: window.LANG || 'en',
      };
      btn.disabled = true; btn.textContent = t('f.sending'); err.hidden = true;
      try {
        const r = await fetch('/api/preorders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await r.json().catch(() => null);
        if (!r.ok || !d || !d.ok) throw new Error(r.status);
        $('#pf-num').textContent = d.id ? `№ ${d.id}` : '';
        form.hidden = true; $('#pf-done').hidden = false;
        ['comment', 'qty'].forEach(k => { f[k].value = f[k].defaultValue; });
      } catch (ex) {
        err.hidden = false;
      }
      btn.disabled = false; btn.textContent = t('f.send');
    });
  }

  document.addEventListener('langchange', () => { PRINTS.forEach(paint); paintForm(); });
  PRINTS.forEach(paint); paintForm();

  // якорь вида /shop/#holding: карточки появляются после загрузки, доскролливаем вручную
  const target = location.hash && document.getElementById(location.hash.slice(1));
  if (target) { const go = () => target.scrollIntoView({ behavior: 'instant', block: 'start' }); go(); addEventListener('load', go, { once: true }); }
})();
