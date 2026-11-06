/* RUM-BUS: дані, ціни, маршрути, форми.
   Ціни, напрямки й контакти беруться з того самого data/site.json, що й у Eurotour
   (його редагує адмін-бот), тож зміни там одразу видно і тут. */
(function (w, d) {
  'use strict';

  var SOURCES = [
    'https://raw.githubusercontent.com/Pashawilliams/site/main/data/site.json',
    'data/site.json'
  ];
  var SITE_TAG = 'RUM-BUS';
  var GEO = w.RB_GEO || { ua: {}, eu: {}, search: [] };
  var PAX_MAX = 7;
  var DISC = { child: 0.15, pens: 0.10 };
  var CLASS_TIME = { comfort: '08:00', lux: '18:00' };
  var CLASS_NAME = { comfort: 'Comfort', lux: 'Lux' };

  var P = {
    eur_rate: 51.449, extra_hours: 3,
    tiers: [[6,8,90,120],[8,10,100,140],[10,12,130,170],[12,14,140,180],[14,16,150,190],[16,18,160,200],[18,20,160,200],[20,22,170,210],[22,24,180,220],[24,27,190,230],[27,30,200,240],[30,33,210,250],[33,36,210,250],[36,39,220,260],[39,42,230,270],[42,45,240,280],[45,999,250,290]]
  };
  var DATA = {};
  var DUR = {};
  var cls = 'comfort';
  try { if (localStorage.getItem('rb_class') === 'lux') cls = 'lux'; } catch (e) {}

  var $ = function (s, r) { return (r || d).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function uah(n) { return fmt(n) + ' грн'; }
  function round50(n) { return Math.round(n / 50) * 50; }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').replace(/\(.*?\)/g, '').trim(); }

  /* ---------------- pricing (те саме, що js/pricing.js у Eurotour) ---------------- */
  function coords(name) { name = norm(name); return GEO.ua[name] || GEO.eu[name] || null; }
  function haversine(a, b) {
    var R = 6371, t = Math.PI / 180, dLat = (b[0] - a[0]) * t, dLon = (b[1] - a[1]) * t;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function hours(from, to) {
    from = norm(from); to = norm(to);
    var k = DUR[from + '|' + to] || DUR[to + '|' + from];
    if (k && k.hours) return { hours: k.hours, km: k.km };
    var a = coords(from), b = coords(to);
    if (!a || !b) return null;
    var km = haversine(a, b) * 1.25;
    return { hours: Math.round((km / 78 + P.extra_hours) * 10) / 10, km: Math.round(km) };
  }
  function tier(h) {
    if (h < P.tiers[0][0]) return P.tiers[0];
    for (var i = 0; i < P.tiers.length; i++) if (h >= P.tiers[i][0] && h < P.tiers[i][1]) return P.tiers[i];
    return P.tiers[P.tiers.length - 1];
  }
  function toUah(eur) { return round50(eur * P.eur_rate); }
  function quote(from, to) {
    if (!from || !to || norm(from) === norm(to)) return null;
    var hh = hours(from, to); if (!hh) return null;
    var t = tier(hh.hours);
    return { hours: hh.hours, km: hh.km, open: t[1] >= 999,
      comfort: { eur: t[2], uah: toUah(t[2]) }, lux: { eur: t[3], uah: toUah(t[3]) } };
  }
  function fmtHours(h) { var H = Math.floor(h), M = Math.round((h - H) * 60); if (M === 60) { H++; M = 0; } return M ? H + ' год ' + M + ' хв' : H + ' год'; }
  function fares(base) { return { adult: base, child: round50(base * (1 - DISC.child)), pens: round50(base * (1 - DISC.pens)) }; }

  /* ---------------- class switch (Comfort 08:00 / Lux 18:00) ---------------- */
  function setClass(c) {
    cls = c === 'lux' ? 'lux' : 'comfort';
    try { localStorage.setItem('rb_class', cls); } catch (e) {}
    $$('input[name="cls"], input[name="f-cls"]').forEach(function (i) { i.checked = i.value === cls; });
    renderSearch(); renderRoutes(); updateBookingSum();
  }
  d.addEventListener('change', function (e) {
    if (e.target.name === 'cls' || e.target.name === 'f-cls') setClass(e.target.value);
  });

  /* ---------------- search sign ---------------- */
  var sFrom = $('#s-from'), sTo = $('#s-to'), sDate = $('#s-date');
  function cityOptions(sel, placeholder, value) {
    sel.innerHTML = '<option value="">' + placeholder + '</option>' + GEO.search.map(function (c) { return '<option' + (c === value ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
  }
  function today() { var t = new Date(); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 10); }
  function renderSearch() {
    var q = quote(sFrom.value, sTo.value), meta = $('#s-meta'), price = $('#s-price strong');
    if (!sFrom.value || !sTo.value) { meta.textContent = 'Оберіть міста, і ми покажемо час у дорозі та ціну'; price.textContent = '—'; return; }
    if (sFrom.value === sTo.value) { meta.textContent = 'Оберіть різні міста'; price.textContent = '—'; return; }
    if (!q) { meta.textContent = 'Ціну на цей напрямок назве менеджер'; price.textContent = 'за запитом'; return; }
    meta.textContent = '≈ ' + fmt(q.km) + ' км · у дорозі ~' + fmtHours(q.hours).replace(/ /g, ' ');
    price.innerHTML = uah(q[cls].uah) + ' <small>≈ €' + q[cls].eur + (q.open ? '+' : '') + '</small>';
  }
  function initSearch() {
    cityOptions(sFrom, 'Оберіть місто', 'Київ');
    cityOptions(sTo, 'Оберіть місто', 'Варшава');
    sDate.min = today(); sDate.value = today();
    sFrom.addEventListener('change', renderSearch);
    sTo.addEventListener('change', renderSearch);
    $('#s-swap').addEventListener('click', function () { var a = sFrom.value; sFrom.value = sTo.value; sTo.value = a; renderSearch(); });
    $('#search').addEventListener('submit', function (e) {
      e.preventDefault();
      openForm('booking', { from: sFrom.value, to: sTo.value, date: sDate.value });
    });
    $$('input[name="cls"]').forEach(function (i) { i.checked = i.value === cls; });
    renderSearch();
  }

  /* ---------------- routes list ---------------- */
  var LIMIT = 12, showAll = false, filterText = '', origin = 'all';
  var UA_NAMES = function (n) { return !!GEO.ua[norm(n)]; };
  var CHIPS = [['all', 'Усі напрямки'], ['Київ', 'З Києва'], ['Львів', 'Зі Львова'], ['Одеса', 'З Одеси'], ['eu', 'З Європи']];
  function routeList() {
    var list = (DATA.routes || []).filter(function (r) { return r.visible !== false; });
    if (origin === 'eu') list = list.filter(function (r) { return !UA_NAMES(r.from); });
    else if (origin !== 'all') list = list.filter(function (r) { return r.from === origin; });
    if (filterText) { var f = filterText.toLowerCase(); list = list.filter(function (r) { return (r.from + ' ' + r.to).toLowerCase().indexOf(f) !== -1; }); }
    return list;
  }
  function renderRoutes() {
    var host = $('#routes-list'); if (!host) return;
    var list = routeList(), shown = showAll || filterText ? list : list.slice(0, LIMIT);
    host.innerHTML = '<div class="route routes__head" aria-hidden="true"><span>Напрямок</span><span>У дорозі</span><span><b>Comfort</b><small>виїзд 08:00</small></span><span><b>Lux</b><small>виїзд 18:00</small></span><span></span></div>' +
      shown.map(function (r) {
        var q = quote(r.from, r.to);
        var price = function (c) {
          return q ? '<b>' + uah(q[c].uah) + '</b>' : '<b>за запитом</b>';
        };
        return '<div class="route" role="listitem">' +
          '<span class="route__name">' + esc(r.from) + ' <span class="route__arrow" aria-label="до">→</span> ' + esc(r.to) + '</span>' +
          '<span class="route__time">' + (q ? '~' + fmtHours(q.hours) : '') + '</span>' +
          '<span class="route__price route__price--c' + (cls === 'comfort' ? ' is-current' : '') + '"><small>Comfort</small>' + price('comfort') + '</span>' +
          '<span class="route__price route__price--l' + (cls === 'lux' ? ' is-current' : '') + '"><small>Lux</small>' + price('lux') + '</span>' +
          '<button class="btn btn--blue" type="button" data-book="' + esc(r.from) + '|' + esc(r.to) + '">Забронювати</button>' +
        '</div>';
      }).join('');
    var more = $('#r-more');
    more.hidden = !!filterText || list.length <= LIMIT;
    more.textContent = showAll ? 'Згорнути список' : 'Показати всі маршрути (' + list.length + ')';
    $('#r-empty').hidden = list.length > 0;
    updateDock();
  }
  function initRoutes() {
    $('#r-chips').innerHTML = CHIPS.map(function (c) { return '<button type="button" class="chip" data-origin="' + c[0] + '" aria-pressed="' + (c[0] === origin) + '">' + c[1] + '</button>'; }).join('');
    $('#r-chips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      origin = b.getAttribute('data-origin'); showAll = false;
      $$('.chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      renderRoutes();
    });
    var t; $('#r-filter').addEventListener('input', function (e) { clearTimeout(t); t = setTimeout(function () { filterText = e.target.value.trim(); renderRoutes(); }, 120); });
    $('#r-more').addEventListener('click', function () {
      showAll = !showAll; renderRoutes();
      if (!showAll) $('#routes').scrollIntoView();
    });
    d.addEventListener('click', function (e) {
      var b = e.target.closest('[data-book]'); if (!b) return;
      var p = b.getAttribute('data-book').split('|');
      openForm('booking', { from: p[0], to: p[1], date: sDate.value });
    });
  }
  function updateDock() {
    var min = Infinity;
    (DATA.routes || []).forEach(function (r) { if (r.visible === false) return; var q = quote(r.from, r.to); if (q && q.comfort.uah < min) min = q.comfort.uah; });
    $('#dock-min').textContent = isFinite(min) ? 'від ' + uah(min) : '';
  }

  /* ---------------- tariff table ---------------- */
  function renderTariff() {
    $('#tariff').innerHTML = P.tiers.map(function (t) {
      var span = t[1] >= 999 ? 'від ' + t[0] + ' год' : t[0] + '–' + t[1] + ' год';
      return '<tr><td>' + span + '</td><td>' + uah(toUah(t[2])) + '<small>€' + t[2] + '</small></td><td>' + uah(toUah(t[3])) + '<small>€' + t[3] + '</small></td></tr>';
    }).join('');
    $$('[data-eur-rate]').forEach(function (n) { n.textContent = P.eur_rate.toFixed(2).replace('.', ','); });
    $$('[data-extra-hours]').forEach(function (n) { n.textContent = String(P.extra_hours).replace('.', ','); });
  }

  /* ---------------- content blocks ---------------- */
  function renderContent() {
    var c = DATA.contacts || {};
    if (c.phone) {
      $$('[data-phone-link]').forEach(function (a) { a.href = 'tel:' + c.phone; });
      $$('[data-phone-display]').forEach(function (a) { a.textContent = c.phone_display || c.phone; });
    }
    if (c.telegram) $$('[data-tg-link]').forEach(function (a) { a.href = c.telegram; });
    if (c.whatsapp) $$('[data-wa-link]').forEach(function (a) { a.href = c.whatsapp; });

    var adv = DATA.advantages || [];
    if (adv.length) $('#perks').innerHTML = adv.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('');

    var rv = DATA.reviews || [];
    $('#reviews-list').innerHTML = rv.map(function (r) {
      var n = Math.max(1, Math.min(5, +(r.stars || r.rating || 5)));
      return '<article class="review"><div class="review__stars" aria-label="Оцінка ' + n + ' з 5">' + '★★★★★'.slice(0, n) + '</div>' +
        '<p>' + esc(r.text) + '</p><div class="review__who">' + esc(r.name) + (r.date ? '<span>' + esc(r.date) + '</span>' : '') + '</div></article>';
    }).join('');

    $('#faq-list').innerHTML = (DATA.faq || []).map(function (f, i) {
      return '<details' + (i === 0 ? ' open' : '') + '><summary>' + esc(f.q) + '</summary><p>' + esc(f.a) + '</p></details>';
    }).join('');

    var mg = DATA.managers || [];
    $('#managers').innerHTML = mg.map(function (m) {
      var digits = String(m.phone || '').replace(/\D/g, '');
      return '<article class="mgr"><p class="mgr__name">' + esc(m.name) + '</p><p class="mgr__role">' + esc(m.role || 'Менеджер') + '</p>' +
        (m.phone ? '<a class="mgr__phone" href="tel:+' + digits + '">' + esc(prettyPhone(m.phone)) + '</a>' : '') +
        '<div class="mgr__links">' +
          (m.telegram ? '<a style="background:var(--tg)" href="' + esc(m.telegram) + '" target="_blank" rel="noopener">Telegram</a>' : '') +
          (m.whatsapp ? '<a style="background:var(--wa)" href="' + esc(m.whatsapp) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
        '</div></article>';
    }).join('');

    var an = {}, bar = $('#notice'); // оголошення Eurotour ведуть на бренд Eurotour, тут їх не показуємо
    if (an.enabled && an.text) {
      var link = $('#notice-link'); link.textContent = an.text;
      if (an.link) { link.href = an.link; link.target = '_blank'; link.rel = 'noopener'; } else link.removeAttribute('href');
      bar.hidden = false;
    } else bar.hidden = true;
  }
  function prettyPhone(p) {
    var x = String(p).replace(/\D/g, '');
    if (x.length === 12 && x.indexOf('380') === 0) return '+380 ' + x.slice(3, 5) + ' ' + x.slice(5, 8) + ' ' + x.slice(8, 10) + ' ' + x.slice(10);
    return p;
  }

  /* ---------------- data loading ---------------- */
  function applyData(data) {
    if (!data || !data.routes) return false;
    DATA = data;
    if (data.pricing) {
      if (data.pricing.tiers && data.pricing.tiers.length) P.tiers = data.pricing.tiers;
      if (data.pricing.eur_rate) P.eur_rate = +data.pricing.eur_rate;
      if (data.pricing.extra_hours != null) P.extra_hours = +data.pricing.extra_hours;
      if (data.pricing.discounts) data.pricing.discounts.forEach(function (x) {
        if (/діт/i.test(x.label)) DISC.child = x.pct / 100;
        if (/пенс/i.test(x.label)) DISC.pens = x.pct / 100;
      });
    }
    if (data.durations) DUR = data.durations;
    if (data.bridge && w.RB_bridge) w.RB_bridge.configure(data.bridge);
    renderContent(); renderTariff(); renderSearch(); renderRoutes(); updateBookingSum();
    if (!data.pricing || data.pricing.rate_auto !== false) fetchRate();
    return true;
  }
  function load(i) {
    i = i || 0; if (i >= SOURCES.length) return Promise.resolve(false);
    var url = SOURCES[i] + '?v=' + Math.floor(Date.now() / 60000);
    return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { return applyData(j) || load(i + 1); })
      .catch(function () { return load(i + 1); });
  }
  var rateDone = false;
  function fetchRate() {
    if (rateDone) return; rateDone = true;
    fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&json').then(function (r) { return r.json(); }).then(function (j) {
      var r = j && j[0] && +j[0].rate;
      if (r && r > 20 && r < 200 && Math.abs(r - P.eur_rate) > 0.01) { P.eur_rate = r; renderTariff(); renderSearch(); renderRoutes(); updateBookingSum(); }
    }).catch(function () {});
  }

  /* ---------------- forms ---------------- */
  var modal = $('#modal'), form = $('#lead-form'), current = null;
  var FORMS = {
    booking: { title: 'Бронювання місця', type: 'booking', submit: 'Забронювати' },
    delivery: { title: 'Відправити посилку', type: 'delivery', submit: 'Надіслати заявку' },
    transfer: { title: 'Трансфер з аеропорту', type: 'transfer', submit: 'Замовити трансфер' },
    callback: { title: 'Передзвонимо вам', type: 'callback', submit: 'Чекаю на дзвінок' },
    review: { title: 'Ваш відгук', type: 'review', submit: 'Надіслати відгук' }
  };
  function citySelect(name, label, value) {
    return '<label>' + label + '<select name="' + name + '" required><option value="">Оберіть місто</option>' +
      GEO.search.map(function (c) { return '<option' + (c === value ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label>';
  }
  var nameField = '<label>Ваше ім\'я<input name="name" autocomplete="name" required maxlength="60"></label>';
  var phoneField = '<label>Телефон<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+380 __ ___ __ __" required maxlength="20"></label>';
  function dateField(name, label, value) { return '<label>' + label + '<input type="date" name="' + name + '" min="' + today() + '" value="' + (value || today()) + '" required></label>'; }
  function stepper(key, label, hint, val) {
    return '<div class="pax__row"><span>' + label + (hint ? '<small>' + hint + '</small>' : '') + '</span>' +
      '<span class="step"><button type="button" data-step="' + key + '" data-d="-1" aria-label="Менше: ' + label + '">−</button>' +
      '<output data-pax="' + key + '">' + val + '</output>' +
      '<button type="button" data-step="' + key + '" data-d="1" aria-label="Більше: ' + label + '">+</button></span></div>';
  }
  function build(kind, pre) {
    pre = pre || {};
    var h = '';
    if (kind === 'booking') {
      h = '<div class="form__grid">' + citySelect('from', 'Звідки', pre.from) + citySelect('to', 'Куди', pre.to) + '</div>' +
        '<div class="form__grid">' + dateField('date', 'Дата поїздки', pre.date) +
        '<div><span style="font-size:14px;font-weight:700">Клас і виїзд</span><div class="form__cls">' +
          '<label><input type="radio" name="f-cls" value="comfort"' + (cls === 'comfort' ? ' checked' : '') + '><span><b>Comfort</b><small>виїзд 08:00</small></span></label>' +
          '<label><input type="radio" name="f-cls" value="lux"' + (cls === 'lux' ? ' checked' : '') + '><span><b>Lux</b><small>виїзд 18:00</small></span></label></div></div></div>' +
        '<div class="pax">' + stepper('adults', 'Дорослі', '', 1) + stepper('children', 'Діти до 16 років', 'знижка ' + Math.round(DISC.child * 100) + '%', 0) + stepper('pens', 'Пенсіонери', 'знижка ' + Math.round(DISC.pens * 100) + '%', 0) + '</div>' +
        '<div class="sum" id="f-sum"></div>' +
        '<div class="form__grid">' + nameField + phoneField + '</div>';
    } else if (kind === 'delivery') {
      h = '<div class="form__grid">' + citySelect('from', 'Звідки', pre.from) + citySelect('to', 'Куди', pre.to) + '</div>' +
        '<div class="form__grid"><label>Що відправляєте<select name="what"><option>Документи</option><option>Особисті речі</option><option>Техніка</option><option>Інше</option></select></label>' + dateField('date', 'Коли відправити') + '</div>' +
        '<div class="form__grid">' + nameField + phoneField + '</div>';
    } else if (kind === 'transfer') {
      h = '<label>Аеропорт<input name="airport" required maxlength="80" placeholder="Наприклад, Варшава Шопен"></label>' +
        '<label>Куди відвезти<input name="dest" required maxlength="120" placeholder="Місто або адреса"></label>' +
        '<div class="form__grid">' + dateField('date', 'Дата') + '<label>Пасажирів<input name="pax" type="number" min="1" max="' + PAX_MAX + '" value="1" required></label></div>' +
        '<div class="form__grid">' + nameField + phoneField + '</div>';
    } else if (kind === 'callback') {
      h = nameField + phoneField + '<label>Коментар (необов\'язково)<textarea name="comment" maxlength="500"></textarea></label>';
    } else if (kind === 'review') {
      h = nameField + '<div><span style="font-size:14px;font-weight:700">Оцінка</span><div class="stars-input">' +
        [5, 4, 3, 2, 1].map(function (n) { return '<input type="radio" name="stars" id="st' + n + '" value="' + n + '"' + (n === 5 ? ' checked' : '') + '><label for="st' + n + '" title="' + n + '">★</label>'; }).join('') +
        '</div></div><label>Відгук<textarea name="text" required maxlength="1000"></textarea></label>';
    }
    h += '<p class="form__err" id="f-err" role="alert"></p><button class="btn btn--amber" type="submit">' + FORMS[kind].submit + '</button>';
    form.innerHTML = h;
  }
  function openForm(kind, pre) {
    current = kind;
    $('#modal-title').textContent = FORMS[kind].title;
    build(kind, pre);
    form.hidden = false; $('#modal-done').hidden = true;
    if (kind === 'booking') updateBookingSum();
    if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open', '');
    var first = form.querySelector('select:invalid, input:invalid, input, select');
    if (first && w.matchMedia('(pointer:fine)').matches) first.focus();
  }
  w.RB_openForm = openForm;
  d.addEventListener('click', function (e) {
    var b = e.target.closest('[data-open]'); if (!b) return;
    e.preventDefault();
    openForm(b.getAttribute('data-open'), b.getAttribute('data-open') === 'booking' ? { from: sFrom.value, to: sTo.value, date: sDate.value } : null);
  });
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.close(); });

  function pax() {
    var g = function (k) { var o = form.querySelector('[data-pax="' + k + '"]'); return o ? +o.textContent : 0; };
    return { adults: g('adults'), children: g('children'), pens: g('pens') };
  }
  form.addEventListener('click', function (e) {
    var b = e.target.closest('[data-step]'); if (!b) return;
    var k = b.getAttribute('data-step'), o = form.querySelector('[data-pax="' + k + '"]'), p = pax();
    var total = p.adults + p.children + p.pens, v = +o.textContent + (+b.getAttribute('data-d'));
    if (v < (k === 'adults' ? 1 : 0)) return;
    if (+b.getAttribute('data-d') > 0 && total >= PAX_MAX) { toast('У мікроавтобусі ' + PAX_MAX + ' місць. Для більшої групи напишіть менеджеру.'); return; }
    o.textContent = v; updateBookingSum();
  });
  form.addEventListener('change', function (e) { if (current === 'booking' && (e.target.name === 'from' || e.target.name === 'to')) updateBookingSum(); });

  function bookingCalc() {
    if (current !== 'booking' || !form.from) return null;
    var q = quote(form.from.value, form.to.value), p = pax();
    if (!q) return { q: null, p: p };
    var f = fares(q[cls].uah), total = p.adults * f.adult + p.children * f.child + p.pens * f.pens;
    var full = (p.adults + p.children + p.pens) * f.adult;
    return { q: q, p: p, f: f, total: total, discount: full - total };
  }
  function updateBookingSum() {
    var box = d.getElementById('f-sum'); if (!box) return;
    var c = bookingCalc(); if (!c) return;
    if (!form.from.value || !form.to.value) { box.innerHTML = '<p class="sum__note">Оберіть міста, щоб побачити суму.</p>'; return; }
    if (!c.q) { box.innerHTML = '<p class="sum__note">Ціну на цей напрямок назве менеджер після заявки.</p>'; return; }
    box.innerHTML = '<div class="sum__total"><span>До сплати</span><span>' + uah(c.total) + '</span></div>' +
      '<p class="sum__note">' + CLASS_NAME[cls] + ', виїзд ' + CLASS_TIME[cls] + ', у дорозі ~' + fmtHours(c.q.hours) + '. Квиток: ' + uah(c.f.adult) +
      (c.p.children ? ', дитячий ' + uah(c.f.child) : '') + (c.p.pens ? ', пенсійний ' + uah(c.f.pens) : '') +
      (c.discount > 0 ? '. Знижка ' + uah(c.discount) : '') + '.</p>';
  }

  function validPhone(v) { var x = String(v).replace(/\D/g, ''); return x.length >= 10 && x.length <= 15; }
  function phoneNorm(v) { var x = String(v).replace(/\D/g, ''); if (x.length === 10 && x[0] === '0') x = '38' + x; return '+' + x; }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('#f-err'); err.textContent = '';
    $$('.is-bad', form).forEach(function (x) { x.classList.remove('is-bad'); });
    var bad = $$('input[required], select[required], textarea[required]', form).filter(function (i) { return !String(i.value).trim() || !i.checkValidity(); });
    if (form.phone && form.phone.value && !validPhone(form.phone.value)) bad.push(form.phone);
    if (form.from && form.to && form.from.value && form.from.value === form.to.value) bad.push(form.to);
    if (bad.length) {
      bad.forEach(function (i) { i.classList.add('is-bad'); });
      err.textContent = bad.indexOf(form.phone) !== -1 && form.phone.value ? 'Перевірте номер телефону: потрібно 10–15 цифр.' : 'Заповніть позначені поля.';
      bad[0].focus(); return;
    }
    var F = {}, ctx = { 'Сайт': SITE_TAG };
    if (form.name) F['Імʼя'] = form.name.value.trim();
    if (form.phone) F['Телефон'] = phoneNorm(form.phone.value);
    if (current === 'booking') {
      var c = bookingCalc();
      F['Звідки'] = form.from.value; F['Куди'] = form.to.value;
      F['Дата рейсу'] = form.date.value.split('-').reverse().join('.');
      F['Час відправлення'] = CLASS_TIME[cls]; F['Клас'] = CLASS_NAME[cls];
      F['Дорослі пасажири'] = String(c.p.adults); F['Діти до 16 років'] = String(c.p.children); F['Пенсіонери'] = String(c.p.pens);
      F['Усього пасажирів'] = String(c.p.adults + c.p.children + c.p.pens);
      if (c.q) {
        F['Час у дорозі'] = '~' + fmtHours(c.q.hours).replace(/ /g, ' ');
        F['Ціна за 1 квиток'] = uah(c.f.adult).replace(/ /g, ' ');
        if (c.p.children) F['Дитячий квиток (-' + Math.round(DISC.child * 100) + '%)'] = uah(c.f.child).replace(/ /g, ' ');
        if (c.p.pens) F['Пенсійний квиток (-' + Math.round(DISC.pens * 100) + '%)'] = uah(c.f.pens).replace(/ /g, ' ');
        if (c.discount > 0) F['Загальна знижка'] = uah(c.discount).replace(/ /g, ' ');
        F['Сума до оплати'] = uah(c.total).replace(/ /g, ' ');
      } else F['Сума до оплати'] = 'уточнити';
    } else if (current === 'delivery') {
      F['Звідки'] = form.from.value; F['Куди'] = form.to.value; F['Тип посилки'] = form.what.value;
      F['Дата відправлення'] = form.date.value.split('-').reverse().join('.');
    } else if (current === 'transfer') {
      F['Звідки'] = form.airport.value.trim(); F['Куди'] = form.dest.value.trim();
      F['Дата'] = form.date.value.split('-').reverse().join('.'); F['Пасажирів'] = form.pax.value;
    } else if (current === 'callback') {
      if (form.comment.value.trim()) F['Коментар'] = form.comment.value.trim();
    } else if (current === 'review') {
      F['Оцінка'] = (form.querySelector('input[name="stars"]:checked') || { value: 5 }).value + ' з 5';
      F['Відгук'] = form.text.value.trim();
    }
    var btn = form.querySelector('button[type="submit"]'); btn.disabled = true;
    var send = w.RB_bridge && w.RB_bridge.ready() ? w.RB_bridge.lead({ type: FORMS[current].type, fields: F, context: ctx }) : Promise.resolve(false);
    send.then(function (ok) {
      btn.disabled = false;
      if (ok) { form.hidden = true; $('#modal-done').hidden = false; return; }
      err.innerHTML = 'Не вдалося надіслати заявку: немає з\'єднання. Спробуйте ще раз або напишіть нам у <a href="' + esc((DATA.contacts || {}).telegram || 'https://t.me/pereviznyk001') + '" target="_blank" rel="noopener">Telegram</a>.';
    });
  });

  /* ---------------- misc ---------------- */
  var toastT;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('is-on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('is-on'); }, 3200); }

  function initNav() {
    var burger = $('#burger'), nav = $('#nav');
    burger.addEventListener('click', function () { var open = nav.classList.toggle('is-open'); burger.setAttribute('aria-expanded', String(open)); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) { nav.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); } });
    if ('IntersectionObserver' in w) {
      var links = {}; $$('a', nav).forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting && links[en.target.id]) { $$('a', nav).forEach(function (a) { a.classList.remove('is-active'); }); links[en.target.id].classList.add('is-active'); } });
      }, { rootMargin: '-40% 0px -55% 0px' });
      Object.keys(links).forEach(function (id) { var s = d.getElementById(id); if (s) io.observe(s); });
    }
    $('#year').textContent = new Date().getFullYear();
  }

  initNav(); initSearch(); initRoutes(); renderTariff();
  load();
  setInterval(function () { if (!d.hidden) load(); }, 5 * 60 * 1000);
})(window, document);
