/* RUM-BUS: дані, ціни, маршрути, форми, анімації.
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
  var POPULAR = [
    { from: 'Київ', to: 'Варшава', img: 'city-warsaw' },
    { from: 'Львів', to: 'Прага', img: 'city-prague' },
    { from: 'Київ', to: 'Краків', img: 'city-krakow' }
  ];
  var PERK_ICONS = [
    [/місц|крісл/i, 'seat'], [/wi-?fi/i, 'wifi'], [/заряд|розет/i, 'plug'], [/клімат|кондиц/i, 'snow'],
    [/воді/i, 'wheel'], [/чай|кав/i, 'coffee'], [/прям|пересад/i, 'route'], [/плед|подуш/i, 'pillow'],
    [/адрес/i, 'home'], [/доплат/i, 'check']
  ];

  var P = {
    eur_rate: 51.449, extra_hours: 3,
    tiers: [[6,8,90,120],[8,10,100,140],[10,12,130,170],[12,14,140,180],[14,16,150,190],[16,18,160,200],[18,20,160,200],[20,22,170,210],[22,24,180,220],[24,27,190,230],[27,30,200,240],[30,33,210,250],[33,36,210,250],[36,39,220,260],[39,42,230,270],[42,45,240,280],[45,999,250,290]]
  };
  var DATA = {}, DUR = {}, cls = 'comfort';
  try { if (localStorage.getItem('rb_class') === 'lux') cls = 'lux'; } catch (e) {}
  var reduceMotion = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var $ = function (s, r) { return (r || d).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icon(id) { return '<svg class="ic" aria-hidden="true"><use href="#i-' + id + '"/></svg>'; }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function uah(n) { return fmt(n) + ' грн'; }
  function plain(s) { return String(s).replace(/ /g, ' '); }
  function round50(n) { return Math.round(n / 50) * 50; }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').replace(/\(.*?\)/g, '').trim(); }
  function bump(el) { if (!el || reduceMotion) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function safeUrl(u) { return /^https:\/\//i.test(String(u || '')) ? String(u) : ''; }

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
    return { hours: hh.hours, km: hh.km, open: t[1] >= 999, comfort: { eur: t[2], uah: toUah(t[2]) }, lux: { eur: t[3], uah: toUah(t[3]) } };
  }
  function fmtHours(h) { var H = Math.floor(h), M = Math.round((h - H) * 60); if (M === 60) { H++; M = 0; } return M ? H + ' год ' + M + ' хв' : H + ' год'; }
  function fares(base) { return { adult: base, child: round50(base * (1 - DISC.child)), pens: round50(base * (1 - DISC.pens)) }; }
  function visibleRoutes() { return (DATA.routes || []).filter(function (r) { return r.visible !== false; }); }

  /* ---------------- class switch ---------------- */
  function setClass(c) {
    c = c === 'lux' ? 'lux' : 'comfort';
    var changed = c !== cls; cls = c;
    try { localStorage.setItem('rb_class', cls); } catch (e) {}
    $$('input[name="cls"], input[name="f-cls"]').forEach(function (i) { i.checked = i.value === cls; });
    renderSearch(changed); renderRoutes(true); updateBookingSum(changed);
  }
  d.addEventListener('change', function (e) { if (e.target.name === 'cls' || e.target.name === 'f-cls') setClass(e.target.value); });

  /* ---------------- search card ---------------- */
  var sFrom = $('#s-from'), sTo = $('#s-to'), sDate = $('#s-date');
  function optionsHtml(value) {
    return '<option value="">Оберіть місто</option>' + GEO.search.map(function (c) { return '<option' + (c === value ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
  }
  function today() { var t = new Date(); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 10); }
  function renderSearch(animate) {
    var meta = $('#s-meta'), price = $('#s-price');
    var f = sFrom.value, t = sTo.value, q = quote(f, t), html;
    if (!f || !t) { meta.textContent = 'Оберіть міста'; html = '—'; }
    else if (f === t) { meta.textContent = 'Оберіть різні міста'; html = '—'; }
    else if (!q) { meta.textContent = 'Ціну назве менеджер'; html = 'за запитом'; }
    else {
      meta.textContent = '≈ ' + plain(fmt(q.km)) + ' км · ~' + plain(fmtHours(q.hours)) + ' · ' + CLASS_NAME[cls];
      html = uah(q[cls].uah) + '<small>≈ €' + q[cls].eur + (q.open ? '+' : '') + '</small>';
    }
    if (price.innerHTML !== html) { price.innerHTML = html; if (animate !== false) bump(price); }
  }
  function initSearch() {
    sFrom.innerHTML = optionsHtml('Київ');
    sTo.innerHTML = optionsHtml('Варшава');
    sDate.min = today(); sDate.value = today();
    sFrom.addEventListener('change', function () { renderSearch(); });
    sTo.addEventListener('change', function () { renderSearch(); });
    sDate.addEventListener('change', function () { if (!sDate.value || sDate.value < today()) sDate.value = today(); });
    $('#s-swap').addEventListener('click', function () { var a = sFrom.value; sFrom.value = sTo.value; sTo.value = a; renderSearch(); });
    $('#search').addEventListener('submit', function (e) { e.preventDefault(); openForm('booking', { from: sFrom.value, to: sTo.value, date: sDate.value }); });
    $$('input[name="cls"]').forEach(function (i) { i.checked = i.value === cls; });
    renderSearch(false);
  }
  d.addEventListener('click', function (e) {
    var b = e.target.closest('[data-pick-class]'); if (!b) return;
    setClass(b.getAttribute('data-pick-class'));
    $('#search').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  });

  /* ---------------- popular + routes ---------------- */
  var LIMIT = 9, showAll = false, filterText = '', origin = 'all';
  var CHIPS = [['all', 'Усі'], ['Київ', 'З Києва'], ['Львів', 'Зі Львова'], ['Одеса', 'З Одеси'], ['eu', 'З Європи']];
  function isUa(n) { return !!GEO.ua[norm(n)]; }
  function routeList() {
    var list = visibleRoutes();
    if (origin === 'eu') list = list.filter(function (r) { return !isUa(r.from); });
    else if (origin !== 'all') list = list.filter(function (r) { return r.from === origin; });
    if (filterText) { var f = filterText.toLowerCase(); list = list.filter(function (r) { return (r.from + ' ' + r.to).toLowerCase().indexOf(f) !== -1; }); }
    return list;
  }
  function priceBox(q, c) {
    return '<span class="route__price' + (cls === c ? ' is-current' : '') + '"><small>' + icon(c === 'lux' ? 'moon' : 'sun') + CLASS_NAME[c] + ' · ' + CLASS_TIME[c] + '</small><b>' + (q ? uah(q[c].uah) : 'за запитом') + '</b></span>';
  }
  function renderRoutes(quiet) {
    var host = $('#routes-list'); if (!host) return;
    var cols = w.innerWidth <= 720 ? 1 : w.innerWidth <= 980 ? 2 : 3;
    LIMIT = cols === 1 ? 6 : cols === 2 ? 8 : 9;
    var list = routeList(), shown = showAll || filterText ? list : list.slice(0, LIMIT);
    host.innerHTML = shown.map(function (r, i) {
      var q = quote(r.from, r.to);
      return '<article class="route" style="--i:' + (i % LIMIT) + (quiet ? ';animation:none' : '') + '">' +
        '<div class="route__line"><span class="route__city">' + esc(r.from) + '</span><span class="route__track" role="img" aria-label="до">' + icon('bus') + '</span><span class="route__city route__city--to">' + esc(r.to) + '</span></div>' +
        (q ? '<div class="route__meta"><span>' + icon('clock') + '~' + fmtHours(q.hours) + '</span><span>' + icon('route') + '≈ ' + fmt(q.km) + ' км</span></div>' : '') +
        '<div class="route__prices">' + priceBox(q, 'comfort') + priceBox(q, 'lux') + '</div>' +
        '<button class="btn btn--blue btn--block" type="button" data-book="' + esc(r.from) + '|' + esc(r.to) + '">Забронювати</button>' +
      '</article>';
    }).join('');
    var more = $('#r-more');
    more.hidden = !!filterText || list.length <= LIMIT;
    more.textContent = showAll ? 'Згорнути' : 'Показати всі маршрути (' + list.length + ')';
    $('#r-empty').hidden = list.length > 0;
    renderPopular(); updateMins();
  }
  function renderPopular() {
    var host = $('#popular'); if (!host) return;
    var html = POPULAR.map(function (p, i) {
      var q = quote(p.from, p.to);
      return '<button type="button" class="pop" data-reveal style="--d:' + (i * 0.08) + 's" data-book="' + esc(p.from) + '|' + esc(p.to) + '" aria-label="Забронювати ' + esc(p.from) + ' – ' + esc(p.to) + '">' +
        '<picture><source srcset="images/' + p.img + '.webp" type="image/webp"><img src="images/' + p.img + '.jpg" alt="" loading="lazy"></picture>' +
        '<span class="pop__tag">' + icon('star') + 'Популярний</span><span class="pop__go">' + icon('arrow') + '</span>' +
        '<span class="pop__route">' + esc(p.from) + icon('arrow') + esc(p.to) + '</span>' +
        '<span class="pop__price"><span>' + (q ? '~' + fmtHours(q.hours) + ' у дорозі' : '') + '</span><span>від <b>' + (q ? uah(q.comfort.uah) : '—') + '</b></span></span>' +
      '</button>';
    }).join('');
    if (host.getAttribute('data-html') === html) return;
    host.setAttribute('data-html', html);
    host.innerHTML = html;
    observeReveal(host);
  }
  function updateMins() {
    var min = { comfort: Infinity, lux: Infinity };
    visibleRoutes().forEach(function (r) { var q = quote(r.from, r.to); if (!q) return; if (q.comfort.uah < min.comfort) min.comfort = q.comfort.uah; if (q.lux.uah < min.lux) min.lux = q.lux.uah; });
    $$('[data-min]').forEach(function (n) { var v = min[n.getAttribute('data-min')]; n.textContent = isFinite(v) ? uah(v) : '—'; });
    $('#dock-min').textContent = isFinite(min[cls]) ? 'від ' + uah(min[cls]) : '';
  }
  function initRoutes() {
    $('#r-chips').innerHTML = CHIPS.map(function (c) { return '<button type="button" class="chip" data-origin="' + c[0] + '" aria-pressed="' + (c[0] === origin) + '">' + c[1] + '</button>'; }).join('');
    $('#r-chips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      origin = b.getAttribute('data-origin'); showAll = false;
      $$('.chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      renderRoutes();
    });
    var t; $('#r-filter').addEventListener('input', function (e) { clearTimeout(t); t = setTimeout(function () { filterText = e.target.value.trim(); renderRoutes(); }, 150); });
    $('#r-more').addEventListener('click', function () {
      showAll = !showAll; renderRoutes();
      if (!showAll) $('#routes-list').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
    d.addEventListener('click', function (e) {
      var b = e.target.closest('[data-book]'); if (!b) return;
      var p = b.getAttribute('data-book').split('|');
      openForm('booking', { from: p[0], to: p[1], date: sDate.value });
    });
  }

  /* ---------------- tariff ---------------- */
  function renderTariff() {
    $('#tariff').innerHTML = P.tiers.map(function (t) {
      var span = t[1] >= 999 ? 'від ' + t[0] + ' год' : t[0] + '–' + t[1] + ' год';
      return '<tr><td>' + span + '</td><td>' + uah(toUah(t[2])) + '<small>€' + t[2] + '</small></td><td>' + uah(toUah(t[3])) + '<small>€' + t[3] + '</small></td></tr>';
    }).join('');
    $$('[data-eur-rate]').forEach(function (n) { n.textContent = P.eur_rate.toFixed(2).replace('.', ','); });
    $$('[data-extra-hours]').forEach(function (n) { n.textContent = String(P.extra_hours).replace('.', ','); });
    $$('[data-disc="child"]').forEach(function (n) { n.textContent = '−' + Math.round(DISC.child * 100) + '%'; });
    $$('[data-disc="pens"]').forEach(function (n) { n.textContent = '−' + Math.round(DISC.pens * 100) + '%'; });
  }

  /* ---------------- content ---------------- */
  function prettyPhone(p) {
    var x = String(p).replace(/\D/g, '');
    if (x.length === 12 && x.indexOf('380') === 0) return '+380 ' + x.slice(3, 5) + ' ' + x.slice(5, 8) + ' ' + x.slice(8, 10) + ' ' + x.slice(10);
    return String(p);
  }
  function renderContent() {
    var c = DATA.contacts || {};
    if (c.phone) {
      var tel = '+' + String(c.phone).replace(/\D/g, '');
      $$('[data-phone-link]').forEach(function (a) { a.href = 'tel:' + tel; });
      $$('[data-phone-display]').forEach(function (a) { a.textContent = c.phone_display || prettyPhone(c.phone); });
    }
    if (safeUrl(c.telegram)) $$('[data-tg-link]').forEach(function (a) { a.href = c.telegram; });
    if (safeUrl(c.whatsapp)) $$('[data-wa-link]').forEach(function (a) { a.href = c.whatsapp; });

    $('#perks').innerHTML = (DATA.advantages || []).map(function (a, i) {
      var ic = 'check'; PERK_ICONS.some(function (m) { if (m[0].test(a)) { ic = m[1]; return true; } return false; });
      return '<li class="perk" data-reveal style="--d:' + (i % 5) * 0.06 + 's"><span class="perk__icon">' + icon(ic) + '</span><span>' + esc(a) + '</span></li>';
    }).join('');

    $('#reviews-list').innerHTML = (DATA.reviews || []).map(function (r, i) {
      var n = Math.max(1, Math.min(5, Math.round(+(r.stars || r.rating || 5)))), stars = '';
      for (var k = 0; k < n; k++) stars += icon('star');
      return '<article class="review" data-reveal style="--d:' + (i % 3) * 0.08 + 's">' +
        '<div class="review__stars" role="img" aria-label="Оцінка ' + n + ' з 5">' + stars + '</div>' +
        '<p>' + esc(r.text) + '</p>' +
        '<div class="review__who"><span class="review__ava" aria-hidden="true">' + esc(String(r.name || '?').charAt(0)) + '</span><span><b>' + esc(r.name) + '</b>' + (r.date ? '<small>' + esc(r.date) + '</small>' : '') + '</span></div>' +
      '</article>';
    }).join('');

    $('#faq-list').innerHTML = (DATA.faq || []).map(function (f, i) {
      return '<div class="qa' + (i === 0 ? ' is-open' : '') + '" data-reveal style="--d:' + (i % 6) * 0.05 + 's">' +
        '<button class="qa__q" type="button" id="qq' + i + '" aria-expanded="' + (i === 0) + '" aria-controls="qa' + i + '">' + esc(f.q) + '<span class="qa__plus" aria-hidden="true">' + icon('x') + '</span></button>' +
        '<div class="qa__a" id="qa' + i + '" role="region" aria-labelledby="qq' + i + '"><div><p>' + esc(f.a) + '</p></div></div></div>';
    }).join('');

    $('#managers').innerHTML = (DATA.managers || []).map(function (m, i) {
      var digits = String(m.phone || '').replace(/\D/g, '');
      return '<article class="mgr" data-reveal style="--d:' + (i % 4) * 0.07 + 's">' +
        '<div class="mgr__head"><span class="mgr__ava" aria-hidden="true">' + esc(String(m.name || '?').charAt(0)) + '</span><div><p class="mgr__name">' + esc(m.name) + '</p><p class="mgr__role">' + esc(m.role || 'Менеджер') + '</p></div></div>' +
        (digits ? '<a class="mgr__phone" href="tel:+' + digits + '">' + icon('phone') + esc(prettyPhone(m.phone)) + '</a>' : '') +
        '<div class="mgr__links">' +
          (safeUrl(m.telegram) ? '<a class="btn btn--tg" href="' + esc(m.telegram) + '" target="_blank" rel="noopener">' + icon('tg') + 'Telegram</a>' : '') +
          (safeUrl(m.whatsapp) ? '<a class="btn btn--wa" href="' + esc(m.whatsapp) + '" target="_blank" rel="noopener">' + icon('wa') + 'WhatsApp</a>' : '') +
        '</div></article>';
    }).join('');
    observeReveal(d);
  }
  d.addEventListener('click', function (e) {
    var q = e.target.closest('.qa__q'); if (!q) return;
    var item = q.parentElement, open = !item.classList.contains('is-open');
    $$('.qa.is-open').forEach(function (x) { if (x !== item) { x.classList.remove('is-open'); $('.qa__q', x).setAttribute('aria-expanded', 'false'); } });
    item.classList.toggle('is-open', open); q.setAttribute('aria-expanded', String(open));
  });

  /* ---------------- data loading ---------------- */
  var lastJson = '', rateDone = false, rateLive = false;
  function applyData(data, raw) {
    if (!data || !Array.isArray(data.routes)) return false;
    if (raw === lastJson) return true;
    lastJson = raw; DATA = data;
    if (data.pricing) {
      if (data.pricing.tiers && data.pricing.tiers.length) P.tiers = data.pricing.tiers;
      if (data.pricing.eur_rate && !rateLive) P.eur_rate = +data.pricing.eur_rate;
      if (data.pricing.extra_hours != null) P.extra_hours = +data.pricing.extra_hours;
      (data.pricing.discounts || []).forEach(function (x) {
        if (/діт/i.test(x.label)) DISC.child = x.pct / 100;
        if (/пенс/i.test(x.label)) DISC.pens = x.pct / 100;
      });
    }
    if (data.durations) DUR = data.durations;
    if (data.bridge && w.RB_bridge) w.RB_bridge.configure(data.bridge);
    renderContent(); renderTariff(); renderSearch(false); renderRoutes(); updateBookingSum(false);
    if (!data.pricing || data.pricing.rate_auto !== false) fetchRate();
    return true;
  }
  function load(i) {
    i = i || 0; if (i >= SOURCES.length) return Promise.resolve(false);
    var url = SOURCES[i] + '?v=' + Math.floor(Date.now() / 60000);
    return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (txt) { return applyData(JSON.parse(txt), txt) || load(i + 1); })
      .catch(function () { return load(i + 1); });
  }
  function fetchRate() {
    if (rateDone) return; rateDone = true;
    fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&json').then(function (r) { return r.json(); }).then(function (j) {
      var r = j && j[0] && +j[0].rate;
      if (r && r > 20 && r < 200) { rateLive = true; if (Math.abs(r - P.eur_rate) > 0.0001) { P.eur_rate = r; renderTariff(); renderSearch(false); renderRoutes(true); updateBookingSum(false); } }
    }).catch(function () { rateDone = false; });
  }

  /* ---------------- modal + forms ---------------- */
  var modal = $('#modal'), form = $('#lead-form'), current = null;
  var FORMS = {
    booking: { title: 'Бронювання місця', type: 'booking', submit: 'Забронювати' },
    delivery: { title: 'Відправити посилку', type: 'delivery', submit: 'Надіслати заявку' },
    transfer: { title: 'Трансфер з аеропорту', type: 'transfer', submit: 'Замовити трансфер' },
    callback: { title: 'Передзвонимо вам', type: 'callback', submit: 'Чекаю на дзвінок' },
    review: { title: 'Ваш відгук', type: 'review', submit: 'Надіслати відгук' }
  };
  function citySelect(name, label, value) { return '<label>' + label + '<select name="' + name + '" required>' + optionsHtml(value) + '</select></label>'; }
  var nameField = '<label>Ваше ім\'я<input name="name" autocomplete="name" required maxlength="60"></label>';
  var phoneField = '<label>Телефон<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+380" required maxlength="20"></label>';
  function dateField(name, label, value) { var v = value && value >= today() ? value : today(); return '<label>' + label + '<input type="date" name="' + name + '" min="' + today() + '" value="' + v + '" required></label>'; }
  function stepper(key, label, hint, val) {
    return '<div class="pax__row"><span>' + label + (hint ? '<small>' + hint + '</small>' : '') + '</span>' +
      '<span class="step"><button type="button" data-step="' + key + '" data-d="-1" aria-label="Менше: ' + label + '">−</button>' +
      '<output data-pax="' + key + '" aria-live="polite">' + val + '</output>' +
      '<button type="button" data-step="' + key + '" data-d="1" aria-label="Більше: ' + label + '">+</button></span></div>';
  }
  function build(kind, pre) {
    pre = pre || {};
    var h = '';
    if (kind === 'booking') {
      h = '<div class="form__grid">' + citySelect('from', 'Звідки', pre.from) + citySelect('to', 'Куди', pre.to) + '</div>' +
        dateField('date', 'Дата поїздки', pre.date) +
        '<div class="form__label">Клас і виїзд<div class="seg">' +
          '<label><input type="radio" name="f-cls" value="comfort"' + (cls === 'comfort' ? ' checked' : '') + '><span>' + icon('sun') + '<b>Comfort</b><small>08:00</small></span></label>' +
          '<label><input type="radio" name="f-cls" value="lux"' + (cls === 'lux' ? ' checked' : '') + '><span>' + icon('moon') + '<b>Lux</b><small>18:00</small></span></label></div></div>' +
        '<div class="pax">' + stepper('adults', 'Дорослі', '', 1) + stepper('children', 'Діти до 16 років', 'знижка ' + Math.round(DISC.child * 100) + '%', 0) + stepper('pens', 'Пенсіонери', 'знижка ' + Math.round(DISC.pens * 100) + '%', 0) + '</div>' +
        '<div class="sum" id="f-sum" aria-live="polite"></div>' +
        '<div class="form__grid">' + nameField + phoneField + '</div>';
    } else if (kind === 'delivery') {
      h = '<div class="form__grid">' + citySelect('from', 'Звідки', pre.from) + citySelect('to', 'Куди', pre.to) + '</div>' +
        '<div class="form__grid"><label>Що відправляєте<select name="what"><option>Документи</option><option>Особисті речі</option><option>Техніка</option><option>Інше</option></select></label>' + dateField('date', 'Коли відправити') + '</div>' +
        '<div class="form__grid">' + nameField + phoneField + '</div>';
    } else if (kind === 'transfer') {
      h = '<label>Аеропорт<input name="airport" required maxlength="80" placeholder="Наприклад, Варшава Шопен"></label>' +
        '<label>Куди відвезти<input name="dest" required maxlength="120" placeholder="Місто або адреса"></label>' +
        '<div class="form__grid">' + dateField('date', 'Дата') + '<label>Пасажирів<input name="pax" type="number" inputmode="numeric" min="1" max="' + PAX_MAX + '" value="1" required></label></div>' +
        '<div class="form__grid">' + nameField + phoneField + '</div>';
    } else if (kind === 'callback') {
      h = '<div class="form__grid">' + nameField + phoneField + '</div><label>Коментар (необов\'язково)<textarea name="comment" maxlength="500" placeholder="Куди і коли плануєте поїздку"></textarea></label>';
    } else if (kind === 'review') {
      h = nameField + '<div class="form__label">Оцінка<div class="stars-input">' +
        [5, 4, 3, 2, 1].map(function (n) { return '<input type="radio" name="stars" id="st' + n + '" value="' + n + '"' + (n === 5 ? ' checked' : '') + '><label for="st' + n + '" aria-label="' + n + ' з 5">' + icon('star') + '</label>'; }).join('') +
        '</div></div><label>Відгук<textarea name="text" required maxlength="1000"></textarea></label>';
    }
    h += '<p class="form__err" id="f-err" role="alert"></p><button class="btn btn--amber btn--lg btn--block" type="submit">' + FORMS[kind].submit + '</button>';
    form.innerHTML = h;
  }
  function lock(on) { d.body.classList.toggle('is-locked', on); }
  function openForm(kind, pre) {
    if (!FORMS[kind]) return;
    current = kind;
    $('#modal-title').textContent = FORMS[kind].title;
    build(kind, pre);
    form.hidden = false; $('#modal-done').hidden = true;
    if (kind === 'booking') { syncSteppers(); updateBookingSum(false); }
    if (!modal.open) { if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open', ''); }
    lock(true); form.scrollTop = 0;
    var first = kind === 'booking' ? form.querySelector('select:invalid, input[name="name"]') : form.querySelector('input, select, textarea');
    if (first && w.matchMedia('(pointer: fine)').matches) first.focus();
  }
  function closeModal() { if (modal.open) { if (typeof modal.close === 'function') modal.close(); else modal.removeAttribute('open'); } lock(false); }
  modal.addEventListener('close', function () { lock(false); });
  modal.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) { closeModal(); return; }
    if (e.target === modal) {
      var r = modal.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeModal();
    }
  });
  d.addEventListener('click', function (e) {
    var b = e.target.closest('[data-open]'); if (!b) return;
    e.preventDefault();
    var k = b.getAttribute('data-open');
    openForm(k, k === 'booking' ? { from: sFrom.value, to: sTo.value, date: sDate.value } : null);
  });

  function pax() {
    var g = function (k) { var o = form.querySelector('[data-pax="' + k + '"]'); return o ? +o.textContent : 0; };
    return { adults: g('adults'), children: g('children'), pens: g('pens') };
  }
  function syncSteppers() {
    var p = pax(), total = p.adults + p.children + p.pens;
    $$('[data-step]', form).forEach(function (b) {
      var k = b.getAttribute('data-step'), up = +b.getAttribute('data-d') > 0;
      b.disabled = up ? total >= PAX_MAX : p[k] <= (k === 'adults' ? 1 : 0);
    });
    var note = form.querySelector('.pax');
    if (note) note.setAttribute('title', total >= PAX_MAX ? 'У мікроавтобусі ' + PAX_MAX + ' місць' : '');
  }
  form.addEventListener('click', function (e) {
    var b = e.target.closest('[data-step]'); if (!b || b.disabled) return;
    var k = b.getAttribute('data-step'), o = form.querySelector('[data-pax="' + k + '"]');
    o.textContent = +o.textContent + (+b.getAttribute('data-d') > 0 ? 1 : -1);
    syncSteppers(); updateBookingSum();
    var p = pax(); if (p.adults + p.children + p.pens >= PAX_MAX) toast('У мікроавтобусі ' + PAX_MAX + ' місць. Для більшої групи напишіть менеджеру.');
  });
  form.addEventListener('change', function (e) {
    if (current === 'booking' && (e.target.name === 'from' || e.target.name === 'to')) updateBookingSum();
    if (e.target.classList.contains('is-bad') && String(e.target.value).trim()) e.target.classList.remove('is-bad');
  });
  form.addEventListener('input', function (e) { if (e.target.classList.contains('is-bad')) e.target.classList.remove('is-bad'); });

  function bookingCalc() {
    if (current !== 'booking' || !form.elements.from) return null;
    var q = quote(form.elements.from.value, form.elements.to.value), p = pax();
    if (!q) return { q: null, p: p };
    var f = fares(q[cls].uah), total = p.adults * f.adult + p.children * f.child + p.pens * f.pens;
    var full = (p.adults + p.children + p.pens) * f.adult;
    return { q: q, p: p, f: f, total: total, discount: full - total };
  }
  function updateBookingSum(animate) {
    var box = d.getElementById('f-sum'); if (!box) return;
    var c = bookingCalc(); if (!c) return;
    var F = form.elements;
    if (!F.from.value || !F.to.value) { box.innerHTML = '<p class="sum__note">Оберіть міста, щоб побачити суму.</p>'; return; }
    if (F.from.value === F.to.value) { box.innerHTML = '<p class="sum__note">Оберіть різні міста.</p>'; return; }
    if (!c.q) { box.innerHTML = '<p class="sum__note">Ціну на цей напрямок назве менеджер після заявки.</p>'; return; }
    box.innerHTML = '<div class="sum__total"><span>До сплати</span><b>' + uah(c.total) + '</b></div>' +
      '<p class="sum__note">' + CLASS_NAME[cls] + ', виїзд ' + CLASS_TIME[cls] + ', ~' + fmtHours(c.q.hours) + ' у дорозі. Квиток ' + uah(c.f.adult) +
      (c.p.children ? ', дитячий ' + uah(c.f.child) : '') + (c.p.pens ? ', пенсійний ' + uah(c.f.pens) : '') +
      (c.discount > 0 ? '. Знижка ' + uah(c.discount) : '') + '.</p>';
    if (animate !== false) bump(box.querySelector('b'));
  }

  function validPhone(v) { var x = String(v).replace(/\D/g, ''); return x.length >= 10 && x.length <= 15; }
  function phoneNorm(v) { var x = String(v).replace(/\D/g, ''); if (x.length === 10 && x[0] === '0') x = '38' + x; return '+' + x; }
  function dmy(v) { return String(v || '').split('-').reverse().join('.'); }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var F = form.elements, err = $('#f-err'); err.textContent = '';
    $$('.is-bad', form).forEach(function (x) { x.classList.remove('is-bad'); });
    var bad = $$('input[required], select[required], textarea[required]', form).filter(function (i) { return !String(i.value).trim() || !i.checkValidity(); });
    var phoneBad = F.phone && F.phone.value.trim() && !validPhone(F.phone.value);
    if (phoneBad && bad.indexOf(F.phone) === -1) bad.push(F.phone);
    var sameCity = F.from && F.to && F.from.value && F.from.value === F.to.value;
    if (sameCity && bad.indexOf(F.to) === -1) bad.push(F.to);
    if (bad.length) {
      bad.forEach(function (i) { i.classList.add('is-bad'); });
      err.textContent = phoneBad ? 'Перевірте номер телефону: потрібно 10–15 цифр.' : sameCity ? 'Оберіть різні міста.' : 'Заповніть позначені поля.';
      bad[0].focus(); return;
    }
    var L = {}, ctx = { 'Сайт': SITE_TAG };
    if (F.name) L['Імʼя'] = F.name.value.trim();
    if (F.phone) L['Телефон'] = phoneNorm(F.phone.value);
    if (current === 'booking') {
      var c = bookingCalc();
      L['Звідки'] = F.from.value; L['Куди'] = F.to.value;
      L['Дата рейсу'] = dmy(F.date.value);
      L['Час відправлення'] = CLASS_TIME[cls]; L['Клас'] = CLASS_NAME[cls];
      L['Дорослі пасажири'] = String(c.p.adults); L['Діти до 16 років'] = String(c.p.children); L['Пенсіонери'] = String(c.p.pens);
      L['Усього пасажирів'] = String(c.p.adults + c.p.children + c.p.pens);
      if (c.q) {
        L['Час у дорозі'] = '~' + plain(fmtHours(c.q.hours));
        L['Ціна за 1 квиток'] = plain(uah(c.f.adult));
        if (c.p.children) L['Дитячий квиток (-' + Math.round(DISC.child * 100) + '%)'] = plain(uah(c.f.child));
        if (c.p.pens) L['Пенсійний квиток (-' + Math.round(DISC.pens * 100) + '%)'] = plain(uah(c.f.pens));
        if (c.discount > 0) L['Загальна знижка'] = plain(uah(c.discount));
        L['Сума до оплати'] = plain(uah(c.total));
      } else L['Сума до оплати'] = 'уточнити';
    } else if (current === 'delivery') {
      L['Звідки'] = F.from.value; L['Куди'] = F.to.value; L['Тип посилки'] = F.what.value; L['Дата відправлення'] = dmy(F.date.value);
    } else if (current === 'transfer') {
      L['Звідки'] = F.airport.value.trim(); L['Куди'] = F.dest.value.trim(); L['Дата'] = dmy(F.date.value); L['Пасажирів'] = F.pax.value;
    } else if (current === 'callback') {
      if (F.comment.value.trim()) L['Коментар'] = F.comment.value.trim();
    } else if (current === 'review') {
      L['Оцінка'] = (form.querySelector('input[name="stars"]:checked') || { value: 5 }).value + ' з 5';
      L['Відгук'] = F.text.value.trim();
    }
    var btn = form.querySelector('button[type="submit"]'), label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Надсилаємо…';
    var send = w.RB_bridge && w.RB_bridge.ready() ? w.RB_bridge.lead({ type: FORMS[current].type, fields: L, context: ctx }) : Promise.resolve(false);
    send.then(function (ok) {
      btn.disabled = false; btn.textContent = label;
      if (ok) { form.hidden = true; $('#modal-done').hidden = false; return; }
      err.innerHTML = 'Не вдалося надіслати заявку. Перевірте інтернет і спробуйте ще раз або напишіть нам у <a href="' + esc(safeUrl((DATA.contacts || {}).telegram) || 'https://t.me/pereviznyk001') + '" target="_blank" rel="noopener">Telegram</a>.';
    });
  });

  /* ---------------- UI ---------------- */
  var toastT;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('is-on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('is-on'); }, 3400); }

  var revealIO = 'IntersectionObserver' in w && !reduceMotion ? new IntersectionObserver(function (es) {
    es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); revealIO.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 }) : null;
  function observeReveal(root) {
    $$('[data-reveal]:not(.is-in)', root).forEach(function (el) { if (revealIO) revealIO.observe(el); else el.classList.add('is-in'); });
  }
  function countUp(el) {
    var end = +el.getAttribute('data-count'); if (!end || reduceMotion) return;
    var t0 = null;
    function step(t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / 1400); el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); }
    el.textContent = '0'; requestAnimationFrame(step);
  }
  function initUi() {
    var top = $('#top'), burger = $('#burger'), nav = $('#nav'), dock = $('.dock');
    function onScroll() { top.classList.toggle('is-solid', w.scrollY > 24); }
    onScroll(); w.addEventListener('scroll', onScroll, { passive: true });
    function setMenu(open) {
      nav.classList.toggle('is-open', open); top.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open)); burger.setAttribute('aria-label', open ? 'Закрити меню' : 'Меню');
      lock(open);
    }
    burger.addEventListener('click', function () { setMenu(!nav.classList.contains('is-open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); burger.focus(); } });
    var lastCols = 0, rt;
    w.addEventListener('resize', function () {
      if (w.innerWidth > 980 && nav.classList.contains('is-open')) setMenu(false);
      clearTimeout(rt); rt = setTimeout(function () { var c = w.innerWidth <= 720 ? 1 : w.innerWidth <= 980 ? 2 : 3; if (lastCols && c !== lastCols && !showAll) renderRoutes(true); lastCols = c; }, 150);
    });
    lastCols = w.innerWidth <= 720 ? 1 : w.innerWidth <= 980 ? 2 : 3;
    if ('IntersectionObserver' in w) {
      var links = {}; $$('a', nav).forEach(function (a) { var h = a.getAttribute('href'); if (h && h.charAt(0) === '#') links[h.slice(1)] = a; });
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting && links[en.target.id]) { $$('a.is-active', nav).forEach(function (a) { a.classList.remove('is-active'); }); links[en.target.id].classList.add('is-active'); } });
      }, { rootMargin: '-45% 0px -50% 0px' });
      Object.keys(links).forEach(function (id) { var s = d.getElementById(id); if (s) io.observe(s); });
      var dio = new IntersectionObserver(function (es) { dock.classList.toggle('is-hidden', es[0].isIntersecting); }, { threshold: 0.25 });
      dio.observe($('#search'));
    }
    $$('[data-count]').forEach(countUp);
    $('#year').textContent = new Date().getFullYear();
    observeReveal(d);
  }

  initUi(); initSearch(); initRoutes(); renderTariff();
  load();
  setInterval(function () { if (!d.hidden) load(); }, 5 * 60 * 1000);
})(window, document);
