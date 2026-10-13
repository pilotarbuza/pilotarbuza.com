/* pilotarbuza.com/shop — каталог, страницы принтов, размерная сетка и форма предзаказа.
   Тексты в assets/i18n.js (ключи sp.*, pp.*, f.*, sz.*, l2.*, cw.*, pr.*). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const t = k => (window.t ? window.t(k) : k);

  // Принты: id совпадает с папкой shop/<id>/, файлами assets/img/shop/<id>-<расцветка>.webp и списком в server/orders.py.
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
  // Размерная сетка: [размер, ширина по груди, длина], см, изделие разложено на столе.
  // ЗАМЕНИТЕ на замеры реальных футболок от поставщика — сейчас здесь типовые значения.
  const SIZES = [['XS', 46, 66], ['S', 49, 69], ['M', 52, 72], ['L', 55, 74], ['XL', 58, 76], ['XXL', 61, 78]];
  const TG = 'https://t.me/pilot_arbuza';
  const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const src = (id, cw) => `/assets/img/shop/${id}-${cw}.webp`;
  const url = (id, cw) => `/shop/${id}/${cw ? '?c=' + cw : ''}`;
  const byId = id => PRINTS.find(p => p.id === id);
  const swatches = () => Object.keys(CW).map(k => `<button type="button" data-cw="${k}" style="--tee:${CW[k][1]};--ink-c:${CW[k][0]}"></button>`).join('');
  const tg = text => `${TG}?text=${encodeURIComponent(text)}`;
  const tgLink = (name, cw) => tg(t('sp.msg').replace('{p}', name).replace('{c}', t('cw.' + cw)));
  const swap = (img, to) => {
    img.classList.add('swap');
    const next = new Image();
    next.onload = next.onerror = () => { img.src = next.src; img.classList.remove('swap'); };
    next.src = to;
  };
  function paintSw(box, cw) {
    box.setAttribute('aria-label', t('sp.color'));
    $$('button', box).forEach(b => { b.setAttribute('aria-pressed', b.dataset.cw === cw); b.setAttribute('aria-label', t('cw.' + b.dataset.cw)); b.title = t('cw.' + b.dataset.cw); });
  }

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

  /* ---------- окна: предзаказ и размерная сетка (общие для всех страниц магазина) ---------- */
  document.body.insertAdjacentHTML('beforeend', `
  <dialog class="pf" id="preorder" aria-labelledby="pf-h">
    <div class="pf__head"><h2 id="pf-h" data-i18n="f.title">Preorder</h2><button type="button" class="pf__x" data-close data-i18n-aria="lb.close" aria-label="Close">×</button></div>
    <form id="pf-form" class="pf__form">
      <div class="pf__pick">
        <img id="pf-img" src="${src(PRINTS[0].id, PRINTS[0].cw)}" width="900" height="840" alt="">
        <div class="pf__pickr">
          <label class="fld"><span data-i18n="f.print">Print</span><select name="print">${PRINTS.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
          <div class="fld"><span><span data-i18n="sp.color">Colourway</span>: <b id="pf-cw"></b></span><div class="sw" id="pf-sw" role="group">${swatches()}</div></div>
        </div>
      </div>
      <div class="pf__row">
        <label class="fld"><span class="fld__top"><span data-i18n="f.size">Size</span><button type="button" class="lnk" data-sizes data-i18n="sz.open">Size guide</button></span>
          <select name="size" required>${SIZES.map(s => `<option${s[0] === 'M' ? ' selected' : ''}>${s[0]}</option>`).join('')}</select></label>
        <label class="fld"><span data-i18n="f.qty">Quantity</span><input name="qty" type="number" min="1" max="10" value="1" inputmode="numeric" required></label>
      </div>
      <label class="fld"><span data-i18n="f.name">Your name</span><input name="name" type="text" minlength="2" maxlength="80" autocomplete="name" required></label>
      <div class="pf__row pf__row--contact">
        <label class="fld"><span data-i18n="f.via">Contact via</span>
          <select name="contact_type"><option value="telegram">Telegram</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></label>
        <label class="fld"><span data-i18n="f.contact">Contact</span><input name="contact" type="text" minlength="3" maxlength="120" required></label>
      </div>
      <label class="fld"><span data-i18n="f.city">City and country</span><input name="city" type="text" maxlength="120" autocomplete="address-level2"></label>
      <label class="fld"><span data-i18n="f.comment">Comment</span><textarea name="comment" rows="2" maxlength="600"></textarea></label>
      <label class="pf__hp" aria-hidden="true">Website<input name="website" type="text" tabindex="-1" autocomplete="off"></label>
      <p class="pf__err" id="pf-err" role="alert" hidden><span data-i18n="f.err">Could not send the form. Message me on Telegram instead:</span> <a id="pf-fallback" href="${TG}" target="_blank" rel="noopener">@pilot_arbuza</a></p>
      <button type="submit" class="btn btn--primary" id="pf-send" data-i18n="f.send">Send preorder</button>
      <p class="pf__note" data-i18n="f.note">Nothing to pay now. Your contact is used only to confirm this order.</p>
    </form>
    <div class="pf__done" id="pf-done" hidden>
      <span class="doto" id="pf-num"></span>
      <h3 data-i18n="f.ok.h">Preorder received</h3>
      <p data-i18n="f.ok.p">Thank you! I’ll get in touch to confirm the size, price and delivery.</p>
      <button type="button" class="btn btn--primary" data-close data-i18n="f.ok.btn">Back to the catalogue</button>
    </div>
  </dialog>
  <dialog class="pf pf--sz" id="sizes" aria-labelledby="sz-h">
    <div class="pf__head"><h2 id="sz-h" data-i18n="sz.title">Size guide</h2><button type="button" class="pf__x" data-close data-i18n-aria="lb.close" aria-label="Close">×</button></div>
    <table class="sz">
      <thead><tr><th data-i18n="f.size">Size</th><th data-i18n="sz.w">Chest width</th><th data-i18n="sz.l">Length</th></tr></thead>
      <tbody>${SIZES.map(s => `<tr><th>${s[0]}</th><td>${s[1]}</td><td>${s[2]}</td></tr>`).join('')}</tbody>
    </table>
    <p class="pf__note" data-i18n="sz.note">In centimetres, T-shirt laid flat. Approximate — I’ll confirm the exact numbers with you before printing.</p>
  </dialog>`);

  const dlg = $('#preorder'), form = $('#pf-form'), sizes = $('#sizes');
  const sel = { print: PRINTS[0].id, cw: PRINTS[0].cw };
  function paintForm() {
    const p = byId(sel.print);
    $('#pf-img').src = src(sel.print, sel.cw);
    $('#pf-img').alt = `${p.name} — ${t('cw.' + sel.cw)}`;
    $('#pf-cw').textContent = t('cw.' + sel.cw);
    paintSw($('#pf-sw'), sel.cw);
    form.elements.print.value = sel.print;
    form.elements.contact.placeholder = t('f.ph.' + form.elements.contact_type.value);
    $('#pf-fallback').href = tgLink(p.name, sel.cw);
  }
  function openForm(print, cw) {
    if (!dlg.showModal) { location.href = tgLink(byId(print).name, cw); return; }
    sel.print = print; sel.cw = cw;
    $('#pf-done').hidden = true; form.hidden = false; $('#pf-err').hidden = true;
    paintForm();
    dlg.showModal();
  }
  $$('#pf-sw button').forEach(b => b.addEventListener('click', () => { sel.cw = b.dataset.cw; paintForm(); }));
  form.elements.print.addEventListener('change', e => { sel.print = e.target.value; paintForm(); });
  form.elements.contact_type.addEventListener('change', paintForm);
  [dlg, sizes].forEach(d => {
    $$('[data-close]', d).forEach(b => b.addEventListener('click', () => d.close()));
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
  });
  document.addEventListener('click', e => {
    if (e.target.closest('[data-sizes]')) { e.preventDefault(); if (sizes.showModal) sizes.showModal(); }
    else if (e.target.closest('[data-preorder]')) openForm(sel.print, sel.cw);
  });
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

  /* ---------- каталог: /shop/ ---------- */
  const grid = $('#catalog');
  if (grid) {
    const how = $('.sp-how', grid);
    PRINTS.forEach((p, i) => {
      const el = document.createElement('article');
      el.className = 'sp-card card'; el.id = p.id;
      el.innerHTML = `
        <a class="sp-card__stage" href="${url(p.id)}"><img src="${src(p.id, p.cw)}" width="900" height="840" alt="" ${i > 2 ? 'loading="lazy"' : ''}><span class="sp-card__n doto">0${i + 1} / 0${PRINTS.length}</span><span class="sp-card__badge"></span></a>
        <h2><a href="${url(p.id)}">${esc(p.name)}</a></h2>
        <p class="sp-card__d"></p>
        <div class="sp-card__cw"><small></small><div class="sw" role="group">${swatches()}</div></div>
        <div class="sp-card__buy"><div class="sp-card__btns"><button type="button" class="btn btn--primary sp-pre"></button><a class="btn btn--ghost sp-more"></a></div></div>`;
      grid.insertBefore(el, how);
      p.el = el;
      $$('.sw button', el).forEach(b => b.addEventListener('click', () => {
        if (p.cw === b.dataset.cw) return;
        p.cw = b.dataset.cw;
        swap($('img', el), src(p.id, p.cw));
        paintCard(p);
      }));
      $('.sp-pre', el).addEventListener('click', () => openForm(p.id, p.cw));
    });
  }
  function paintCard(p) {
    const el = p.el, cw = t('cw.' + p.cw);
    $('img', el).alt = `${p.name} — ${cw}`;
    $('.sp-card__badge', el).textContent = t('sp.badge');
    $('.sp-card__d', el).textContent = t('pr.' + p.id);
    $('.sp-card__cw small', el).innerHTML = `${t('sp.color')}: <b>${esc(cw)}</b>`;
    paintSw($('.sw', el), p.cw);
    $('.sp-pre', el).textContent = t('sp.pre');
    $('.sp-more', el).textContent = t('sp.more');
    $$('a[href^="/shop/"]', el).forEach(a => { a.href = url(p.id, p.cw); });
  }
  const l2 = $('#l2-btn');

  /* ---------- страница принта: /shop/<id>/ ---------- */
  const cur = byId(document.body.dataset.print);
  if (cur) {
    let c = '';
    try { c = new URLSearchParams(location.search).get('c'); } catch (e) {}
    if (CW[c]) cur.cw = c;
    sel.print = cur.id; sel.cw = cur.cw;
    $('#pp-sw').innerHTML = swatches();
    $('#pp-img').src = src(cur.id, cur.cw);
    $$('#pp-sw button').forEach(b => b.addEventListener('click', () => {
      if (cur.cw === b.dataset.cw) return;
      cur.cw = sel.cw = b.dataset.cw;
      swap($('#pp-img'), src(cur.id, cur.cw));
      try { history.replaceState(null, '', url(cur.id, cur.cw)); } catch (e) {}
      paintPage();
    }));
    $('#pp-pre').addEventListener('click', () => openForm(cur.id, cur.cw));
    $('#pp-share').addEventListener('click', async e => {
      const b = e.currentTarget, link = location.origin + url(cur.id, cur.cw);
      try { if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: cur.name, url: link }); return; } await navigator.clipboard.writeText(link); } catch (ex) { return; }
      b.textContent = t('pp.copied'); setTimeout(() => { b.textContent = t('pp.share'); }, 1600);
    });
    $('#pp-more').innerHTML = PRINTS.filter(p => p !== cur).map(p => `<a class="pp-mini card" href="${url(p.id)}"><img src="${src(p.id, p.cw)}" width="900" height="840" loading="lazy" alt=""><span>${esc(p.name)}</span></a>`).join('');
  }
  function paintPage() {
    const cw = t('cw.' + cur.cw);
    document.title = `${cur.name} — pilot_arbuza`;
    $('#pp-img').alt = `${cur.name} — ${cw}`;
    $('#pp-cw').innerHTML = `${t('sp.color')}: <b>${esc(cw)}</b>`;
    paintSw($('#pp-sw'), cur.cw);
    $('#pp-tg').href = tgLink(cur.name, cur.cw);
  }

  const repaint = () => {
    if (grid) PRINTS.forEach(paintCard);
    if (cur) paintPage();
    if (l2) l2.href = tg(t('l2.msg'));
    paintForm();
  };
  document.addEventListener('langchange', repaint);
  repaint();

  // старые ссылки вида /shop/#holding ведут на страницу принта
  if (grid && byId(location.hash.slice(1))) location.replace(url(location.hash.slice(1)));
})();
