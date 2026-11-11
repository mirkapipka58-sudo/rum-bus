/* RUM-BUS: дані, ціни, маршрути, форми.
   Ціни, маршрути, відгуки й питання беруться з data/site.json (його редагує адмін-бот),
   контакти, менеджери й ключ заявок — з data/rumbus.json. */
(function (w, d) {
  'use strict';

  var DATA_URL = 'data/site.json';
  var OVERRIDE_URL = 'data/rumbus.json';
  var SITE_TAG = 'RUM-BUS';
  var GEO = w.RB_GEO || { ua: {}, eu: {}, search: [] };
  var PAX_MAX = 7;
  var ROUTES_LIMIT = 8;
  var BOOKING_CUTOFF_MIN = 60; // за скільки хвилин до виїзду рейс на сьогодні вже не пропонуємо
  var DISC = { child: 0.15, pens: 0.10 };
  var CLASS_TIME = { comfort: '08:00', lux: '18:00' };
  var CLASS_DEPART = { comfort: 8 * 60, lux: 18 * 60 };
  var CLASS_NAME = { comfort: 'Comfort', lux: 'Lux' };
  var POPULAR = [
    { from: 'Київ', to: 'Варшава', img: 'city-warsaw', w: 1200, h: 800 },
    { from: 'Львів', to: 'Прага', img: 'city-prague', w: 1200, h: 800 },
    { from: 'Київ', to: 'Краків', img: 'city-krakow', w: 1200, h: 675 }
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
  var NBSP = ' ';

  var $ = function (s, r) { return (r || d).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icon(id) { return '<svg class="ic" aria-hidden="true"><use href="#i-' + id + '"/></svg>'; }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP); }
  function uah(n) { return fmt(n) + NBSP + 'грн'; }
  function plain(s) { return String(s).replace(/ /g, ' '); }
  function round50(n) { return Math.round(n / 50) * 50; }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').replace(/\(.*?\)/g, '').trim(); }
  function bump(el) { if (!el || reduceMotion) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function safeUrl(u) { return /^https:\/\//i.test(String(u || '')) ? String(u) : ''; }
  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b === 1) return one;
    if (b >= 2 && b <= 4) return few;
    return many;
  }

  /* ---------------- dates (за київським часом) ---------------- */
  function kyivNow() {
    try {
      var parts = {};
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kiev', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
      if (parts.year && parts.month && parts.day) {
        return { date: parts.year + '-' + parts.month + '-' + parts.day, minutes: (+parts.hour % 24) * 60 + (+parts.minute) };
      }
    } catch (e) {}
    var t = new Date(), iso = new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    return { date: iso, minutes: t.getHours() * 60 + t.getMinutes() };
  }
  function addDays(iso, n) {
    var p = iso.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10);
  }
  function today() { return kyivNow().date; }
  /* Найближча дата, на яку ще можна забронювати рейс цього класу. */
  function minDate(c) {
    var now = kyivNow();
    return now.minutes >= CLASS_DEPART[c] - BOOKING_CUTOFF_MIN ? addDays(now.date, 1) : now.date;
  }
  function clampDate(input, min) {
    if (!input) return;
    input.min = min;
    if (!input.value || input.value < min) input.value = min;
  }
  function syncDates() {
    var min = minDate(cls);
    clampDate(sDate, min);
    if (current === 'booking' && form.elements.date) clampDate(form.elements.date, min);
    var note = $('#s-note');
    if (note) {
      note.hidden = min <= today();
      note.textContent = 'Сьогоднішній рейс ' + CLASS_NAME[cls] + ' о ' + CLASS_TIME[cls] + ' уже не приймає бронювань. Найближча дата: завтра.';
    }
  }

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
  function fmtHours(h) { var H = Math.floor(h), M = Math.round((h - H) * 60); if (M === 60) { H++; M = 0; } return M ? H + NBSP + 'год ' + M + NBSP + 'хв' : H + NBSP + 'год'; }
  function fares(base) { return { adult: base, child: round50(base * (1 - DISC.child)), pens: round50(base * (1 - DISC.pens)) }; }
  function visibleRoutes() { return (DATA.routes || []).filter(function (r) { return r && r.from && r.to && r.visible !== false; }); }

  /* ---------------- class switch ---------------- */
  function setClass(c) {
    c = c === 'lux' ? 'lux' : 'comfort';
    var changed = c !== cls; cls = c;
    try { localStorage.setItem('rb_class', cls); } catch (e) {}
    d.documentElement.setAttribute('data-cls', cls);
    $$('input[name="cls"], input[name="f-cls"]').forEach(function (i) { i.checked = i.value === cls; });
    syncDates(); renderSearch(changed); renderRoutes(); updateBookingSum(changed);
  }
  d.addEventListener('change', function (e) { if (e.target.name === 'cls' || e.target.name === 'f-cls') setClass(e.target.value); });

  /* ---------------- cities ---------------- */
  var sFrom = $('#s-from'), sTo = $('#s-to'), sDate = $('#s-date');
  var KPP_RE = /КПП|МАПП|Мапп|^Чоп$|Шегині|Рава-Руська|Медика|Захонь/i;
  var cityGroups = [], cityKey = '';
  function coordsKnown(c) { return !!(GEO.ua[c] || GEO.eu[c]); }
  function cityLabel(c) { return String(c).replace(/^Мапп /, 'МАПП '); }
  /* Список міст = міста пошуку + усі міста з маршрутів, щоб будь-який рейс можна було обрати у формі. */
  function buildCities() {
    var seen = {}, all = [];
    GEO.search.concat(visibleRoutes().reduce(function (acc, r) { acc.push(r.from, r.to); return acc; }, [])).forEach(function (c) {
      c = norm(c); if (c && !seen[c]) { seen[c] = 1; all.push(c); }
    });
    var key = all.join('|');
    if (key === cityKey) return false;
    cityKey = key;
    var g = { ua: [], eu: [], kpp: [] };
    all.forEach(function (c) {
      if (KPP_RE.test(c) && !coordsKnown(c)) g.kpp.push(c);
      else if (GEO.ua[c] || /Броди|Дубно/.test(c)) g.ua.push(c);
      else g.eu.push(c);
    });
    Object.keys(g).forEach(function (k) { g[k].sort(function (a, b) { return a.localeCompare(b, 'uk'); }); });
    cityGroups = [['Україна', g.ua], ['Європа', g.eu], ['Пункти пропуску', g.kpp]];
    return true;
  }
  function optionsHtml(value) {
    value = norm(value);
    return '<option value="">Оберіть місто</option>' + cityGroups.filter(function (g) { return g[1].length; }).map(function (g) {
      return '<optgroup label="' + g[0] + '">' + g[1].map(function (c) { return '<option value="' + esc(c) + '"' + (c === value ? ' selected' : '') + '>' + esc(cityLabel(c)) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
  }
  function fillCitySelects() {
    [sFrom, sTo].concat(current === 'booking' || current === 'delivery' ? [form.elements.from, form.elements.to] : []).forEach(function (sel) {
      if (sel && sel.tagName === 'SELECT') sel.innerHTML = optionsHtml(sel.value);
    });
  }

  /* ---------------- search ticket ---------------- */
  function renderSearch(animate) {
    var meta = $('#s-meta'), price = $('#s-price');
    var f = sFrom.value, t = sTo.value, q = quote(f, t), html;
    if (!ready) {
      if (loadFailed) { meta.textContent = 'Ціни зараз недоступні, менеджер назве ціну'; price.textContent = 'за запитом'; }
      else { meta.textContent = 'Рахуємо ціну…'; price.innerHTML = '<span class="skeleton"></span>'; }
      return;
    }
    if (!f || !t) { meta.textContent = 'Оберіть міста'; html = '—'; }
    else if (f === t) { meta.textContent = 'Оберіть різні міста'; html = '—'; }
    else if (!q) { meta.textContent = 'Ціну назве менеджер'; html = 'за запитом'; }
    else {
      meta.textContent = CLASS_NAME[cls] + ', ~' + plain(fmtHours(q.hours)) + ' у дорозі, ' + plain(fmt(q.km)) + ' км';
      html = uah(q[cls].uah) + '<small>≈ €' + q[cls].eur + (q.open ? '+' : '') + '</small>';
    }
    if (price.innerHTML !== html) { price.innerHTML = html; if (animate !== false) bump(price); }
  }
  function initSearch() {
    buildCities();
    sFrom.innerHTML = optionsHtml('Київ');
    sTo.innerHTML = optionsHtml('Варшава');
    syncDates();
    sFrom.addEventListener('change', function () { renderSearch(); });
    sTo.addEventListener('change', function () { renderSearch(); });
    sDate.addEventListener('change', syncDates);
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

  /* ---------------- popular + routes board ---------------- */
  var showAll = false, filterText = '', origin = 'all';
  var CHIPS = [['all', 'Усі'], ['Київ', 'З Києва'], ['Львів', 'Зі Львова'], ['Одеса', 'З Одеси'], ['eu', 'З Європи']];
  function isUa(n) { return !!GEO.ua[norm(n)]; }
  function routeList(o) {
    o = o || origin;
    var list = visibleRoutes();
    if (o === 'eu') list = list.filter(function (r) { return !isUa(r.from); });
    else if (o !== 'all') list = list.filter(function (r) { return norm(r.from) === o; });
    if (filterText) { var f = filterText.toLowerCase(); list = list.filter(function (r) { return (r.from + ' ' + r.to).toLowerCase().indexOf(f) !== -1; }); }
    return list;
  }
  function priceCell(q, c) {
    // ціна є кнопкою: натискання обирає клас для всього сайту
    return '<button type="button" class="trip__price' + (cls === c ? ' is-current' : '') + '" data-set-class="' + c + '" aria-pressed="' + (cls === c) + '">' +
      '<small>' + CLASS_NAME[c] + ', ' + CLASS_TIME[c] + '</small><b>' + (q ? uah(q[c].uah) : 'за запитом') + '</b></button>';
  }
  function renderRoutes() {
    var host = $('#routes-list'); if (!host) return;
    var more = $('#r-more'), empty = $('#r-empty');
    if (!ready) {
      more.hidden = true;
      host.innerHTML = loadFailed ? '' : new Array(5).join('<div class="trip trip--skeleton"><span class="skeleton"></span></div>');
      empty.hidden = !loadFailed;
      if (loadFailed) empty.textContent = 'Не вдалося завантажити розклад. Оновіть сторінку або напишіть менеджеру, він назве ціну.';
      return;
    }
    var list = routeList(), shown = showAll || filterText ? list : list.slice(0, ROUTES_LIMIT);
    host.innerHTML = shown.map(function (r) {
      var q = quote(r.from, r.to);
      return '<article class="trip">' +
        '<h3 class="trip__route"><span>' + esc(r.from) + '</span>' + icon('arrow') + '<span class="sr"> – </span><span>' + esc(r.to) + '</span></h3>' +
        '<p class="trip__time">' + (q ? '~' + fmtHours(q.hours) + '<small>' + fmt(q.km) + NBSP + 'км</small>' : '<small>уточнюється</small>') + '</p>' +
        priceCell(q, 'comfort') + priceCell(q, 'lux') +
        '<button class="btn btn--accent btn--sm" type="button" data-book data-from="' + esc(r.from) + '" data-to="' + esc(r.to) + '" aria-label="Забронювати ' + esc(r.from) + ' – ' + esc(r.to) + '">Забронювати</button>' +
      '</article>';
    }).join('');
    more.hidden = !!filterText || list.length <= ROUTES_LIMIT;
    more.textContent = showAll ? 'Згорнути список' : 'Показати всі маршрути (' + list.length + ')';
    empty.hidden = list.length > 0;
    if (!list.length) empty.innerHTML = origin !== 'all' && filterText && routeList('all').length
      ? 'У вибраному фільтрі такого напрямку немає. <button type="button" class="linklike" data-chip-all>Шукати серед усіх маршрутів</button>'
      : 'Такого міста в розкладі немає. Напишіть менеджеру: підберемо рейс або індивідуальний трансфер.';
    renderPopular(); updateMins();
  }
  function renderPopular() {
    var host = $('#popular'); if (!host) return;
    var html = POPULAR.map(function (p) {
      var q = quote(p.from, p.to);
      return '<button type="button" class="pop" data-book data-from="' + esc(p.from) + '" data-to="' + esc(p.to) + '" aria-label="Забронювати ' + esc(p.from) + ' – ' + esc(p.to) + (q ? ', ' + CLASS_NAME[cls] + ' ' + plain(uah(q[cls].uah)) : '') + '">' +
        '<picture><source srcset="images/' + p.img + '-640.webp 640w, images/' + p.img + '.webp 1200w" sizes="(max-width: 760px) 80vw, 400px" type="image/webp"><img src="images/' + p.img + '.jpg" alt="" loading="lazy" width="' + p.w + '" height="' + p.h + '"></picture>' +
        '<span class="pop__route">' + esc(p.from) + icon('arrow') + esc(p.to) + '</span>' +
        '<span class="pop__info">' + (q ? '<span>~' + fmtHours(q.hours) + '</span><span>' + CLASS_NAME[cls] + ' <b>' + uah(q[cls].uah) + '</b></span>' : '<span>Ціну назве менеджер</span>') + '</span>' +
      '</button>';
    }).join('');
    if (host.getAttribute('data-html') === html) return;
    host.setAttribute('data-html', html);
    host.innerHTML = html;
  }
  function updateMins() {
    var min = { comfort: Infinity, lux: Infinity };
    visibleRoutes().forEach(function (r) { var q = quote(r.from, r.to); if (!q) return; if (q.comfort.uah < min.comfort) min.comfort = q.comfort.uah; if (q.lux.uah < min.lux) min.lux = q.lux.uah; });
    $$('[data-min]').forEach(function (n) { var v = min[n.getAttribute('data-min')]; n.textContent = isFinite(v) ? uah(v) : '—'; });
    $('#dock-min').textContent = ready && isFinite(min[cls]) ? 'від ' + uah(min[cls]) : '';
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
      if (!showAll) $('#routes').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
    d.addEventListener('click', function (e) {
      if (e.target.closest('[data-chip-all]')) { $('.chip[data-origin="all"]').click(); return; }
      var pc = e.target.closest('[data-set-class]');
      if (pc) {
        var row = pc.closest('.trip'), rows = $$('#routes-list .trip'), at = rows.indexOf(row), c = pc.getAttribute('data-set-class');
        var topBefore = row.getBoundingClientRect().top;
        setClass(c);
        // список перемальовано: повертаємо фокус на ту саму ціну і тримаємо картку на місці,
        // навіть якщо вище на сторінці змінилася висота (підказка про дату в пошуку)
        var again = $$('#routes-list .trip')[at], btn = again && $('[data-set-class="' + c + '"]', again);
        if (again) { var shift = again.getBoundingClientRect().top - topBefore; if (Math.abs(shift) > 1) w.scrollBy(0, shift); }
        if (btn) btn.focus({ preventScroll: true });
        return;
      }
      var b = e.target.closest('[data-book]'); if (!b) return;
      openForm('booking', { from: b.getAttribute('data-from'), to: b.getAttribute('data-to'), date: sDate.value });
    });
    renderRoutes();
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
  function initial(name) { return esc(String(name || '?').trim().charAt(0).toUpperCase() || '?'); }
  function renderContent() {
    var c = DATA.contacts || {};
    if (c.phone) {
      var tel = '+' + String(c.phone).replace(/\D/g, '');
      $$('[data-phone-link]').forEach(function (a) { a.href = 'tel:' + tel; });
      $$('[data-phone-display]').forEach(function (a) { a.textContent = c.phone_display || prettyPhone(c.phone); });
    }

    $('#perks').innerHTML = (DATA.advantages || []).map(function (a) {
      var ic = 'check'; PERK_ICONS.some(function (m) { if (m[0].test(a)) { ic = m[1]; return true; } return false; });
      return '<li>' + icon(ic) + '<span>' + esc(a) + '</span></li>';
    }).join('');

    $('#reviews-list').innerHTML = (DATA.reviews || []).filter(function (r) { return r && r.text; }).map(function (r) {
      var n = Math.max(1, Math.min(5, Math.round(+(r.stars || r.rating || 5)) || 5)), stars = '';
      for (var k = 0; k < 5; k++) stars += '<span' + (k < n ? ' class="is-on"' : '') + '>' + icon('star') + '</span>';
      return '<article class="review">' +
        '<div class="review__stars" role="img" aria-label="Оцінка ' + n + ' з 5">' + stars + '</div>' +
        '<p class="review__text">' + esc(r.text) + '</p>' +
        '<p class="review__who"><b>' + esc(r.name || 'Пасажир') + '</b>' + (r.date ? '<small>' + esc(r.date) + '</small>' : '') + '</p>' +
      '</article>';
    }).join('');

    $('#faq-list').innerHTML = (DATA.faq || []).filter(function (f) { return f && f.q; }).map(function (f, i) {
      return '<details class="qa" name="faq"' + (i === 0 ? ' open' : '') + '><summary>' + esc(f.q) + icon('down') + '</summary><div class="qa__a"><p>' + esc(f.a) + '</p></div></details>';
    }).join('');

    var managers = (DATA.managers || []).filter(function (m) { return m && m.name; });
    $('#managers').innerHTML = managers.map(function (m) {
      var digits = String(m.phone || '').replace(/\D/g, '');
      return '<article class="mgr">' +
        '<span class="mgr__ava" aria-hidden="true">' + initial(m.name) + '</span>' +
        '<div class="mgr__who"><p class="mgr__name">' + esc(m.name) + '</p><p class="mgr__role">' + esc(m.role || 'Менеджер') + '</p></div>' +
        (digits ? '<a class="mgr__phone" href="tel:+' + digits + '">' + esc(prettyPhone(m.phone)) + '</a>' : '') +
        (safeUrl(m.whatsapp) ? '<a class="mgr__wa" href="' + esc(m.whatsapp) + '" target="_blank" rel="noopener" aria-label="Написати у WhatsApp: ' + esc(m.name) + '">' + icon('wa') + '</a>' : '') +
      '</article>';
    }).join('');

    waTargets = managers.filter(function (m) { return safeUrl(m.whatsapp); });
    if (!waTargets.length && safeUrl(c.whatsapp)) waTargets = [{ name: 'Менеджер', phone: c.phone || '', whatsapp: c.whatsapp }];
    $('#wa-pick-list').innerHTML = waTargets.map(function (m) {
      return '<a class="wa-item" href="' + esc(m.whatsapp) + '" target="_blank" rel="noopener">' +
        '<span class="mgr__ava" aria-hidden="true">' + initial(m.name) + '</span>' +
        '<span class="wa-item__who"><b>' + esc(m.name) + '</b><small>' + esc(prettyPhone(m.phone)) + '</small></span>' +
        icon('wa') + '</a>';
    }).join('');
  }

  /* ---------------- data loading ---------------- */
  var lastJson = '', rateLive = false, rateBusy = false, ready = false, rateTries = 0, rateAuto = true;
  var loadFailed = false, retryT = null, waTargets = [];
  function num(x) { var n = +x; return isFinite(n) ? n : NaN; }
  function cleanTiers(t) {
    if (!Array.isArray(t)) return null;
    var out = t.map(function (r) { return Array.isArray(r) ? r.slice(0, 4).map(num) : []; })
      .filter(function (r) { return r.length === 4 && r.every(function (n) { return !isNaN(n) && n >= 0; }); });
    return out.length ? out : null;
  }
  function cleanDur(o) {
    var out = {};
    if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { var v = o[k] || {}, h = num(v.hours), km = num(v.km); if (h > 0) out[k] = { hours: h, km: km > 0 ? km : 0 }; });
    return out;
  }
  function renderAll(animate) {
    ready = true;
    if (buildCities()) fillCitySelects();
    renderContent(); renderTariff(); renderSearch(animate); renderRoutes(); updateBookingSum(false);
  }
  function applyData(data, raw) {
    if (!data || !Array.isArray(data.routes)) return false;
    if (raw === lastJson) return true;
    var first = !lastJson;
    lastJson = raw;
    // Контакти, менеджери й ключ заявок у RUM-BUS свої (data/rumbus.json);
    // ціни, маршрути й тривалості беруться з data/site.json.
    var ov = w.RB_OVERRIDE;
    if (ov && typeof ov === 'object') {
      Object.keys(ov).forEach(function (k) {
        if (k === 'routes' || k === 'pricing' || k === 'durations' || k === 'updated_at') return;
        if (ov[k] != null) data[k] = ov[k];
      });
    }
    DATA = data;
    var pr = data.pricing || {};
    var tiers = cleanTiers(pr.tiers); if (tiers) P.tiers = tiers;
    if (num(pr.eur_rate) > 20 && num(pr.eur_rate) < 200 && !rateLive) P.eur_rate = num(pr.eur_rate);
    if (num(pr.extra_hours) >= 0) P.extra_hours = num(pr.extra_hours);
    (Array.isArray(pr.discounts) ? pr.discounts : []).forEach(function (x) {
      var v = num(x && x.pct); if (!(v >= 0 && v < 100)) return;
      if (/діт/i.test(x.label)) DISC.child = v / 100;
      if (/пенс/i.test(x.label)) DISC.pens = v / 100;
    });
    DUR = cleanDur(data.durations);
    if (data.bridge && w.RB_bridge) w.RB_bridge.configure(data.bridge);
    rateAuto = pr.rate_auto !== false;
    var n = visibleRoutes().length;
    $$('[data-routes-count]').forEach(function (el) { el.textContent = n; });
    $$('[data-routes-word]').forEach(function (el) { el.textContent = plural(n, 'напрямок', 'напрямки', 'напрямків'); });
    if (first && rateAuto) fetchRate(1500).then(function () { renderAll(false); });
    else { renderAll(!first); if (rateAuto) fetchRate(); }
    return true;
  }
  function fetchText(url, ms) {
    var ctrl = 'AbortController' in w ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(t); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }, function (e) { clearTimeout(t); throw e; });
  }
  function load() {
    clearTimeout(retryT);
    return fetchText(DATA_URL + '?v=' + Math.floor(Date.now() / 60000), 8000)
      .then(function (txt) { if (!applyData(JSON.parse(txt), txt)) throw new Error('bad data'); loadFailed = false; })
      .catch(function () {
        if (lastJson) return; // уже є дані з попереднього завантаження, показуємо їх далі
        loadFailed = true; renderSearch(false); renderRoutes(); updateBookingSum(false);
        retryT = setTimeout(load, 20000);
      });
  }
  /* Курс НБУ. Проміс виконується, коли курс прийшов або минуло `wait` мс. */
  function fetchRate(wait) {
    if (rateLive || rateBusy) return Promise.resolve();
    rateBusy = true;
    var p = fetchText('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&json', 8000).then(function (txt) {
      var j = JSON.parse(txt), r = j && j[0] && +j[0].rate;
      if (r && r > 20 && r < 200) {
        rateLive = true;
        if (Math.abs(r - P.eur_rate) > 0.0001) { P.eur_rate = r; if (ready) { renderTariff(); renderSearch(false); renderRoutes(); updateBookingSum(false); } }
      } else throw new Error('bad rate');
    }).catch(function () { if (++rateTries < 4) setTimeout(function () { if (!rateLive) fetchRate(); }, 15000); }).then(function () { rateBusy = false; });
    return wait ? Promise.race([p, new Promise(function (res) { setTimeout(res, wait); })]) : p;
  }

  /* ---------------- dialogs ---------------- */
  var locks = 0;
  function lock(on) {
    locks = Math.max(0, locks + (on ? 1 : -1));
    d.documentElement.classList.toggle('is-locked', locks > 0);
  }
  function openDialog(dlg) {
    if (!dlg || dlg.open) return;
    closeMenu();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    lock(true);
  }
  function closeDialog(dlg) {
    if (!dlg || !dlg.open) return;
    if (typeof dlg.close === 'function') dlg.close(); else { dlg.removeAttribute('open'); lock(false); }
  }
  function outside(el, e) { var r = el.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; }
  /* Закриття по хрестику і по кліку на затемнення (лише якщо й натиснули, й відпустили поза вікном). */
  function wireDialog(dlg) {
    var down = false;
    dlg.addEventListener('close', function () { lock(false); });
    dlg.addEventListener('pointerdown', function (e) { down = e.target === dlg && outside(dlg, e); });
    dlg.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]') || (down && e.target === dlg && outside(dlg, e))) closeDialog(dlg);
      down = false;
    });
  }

  var modal = $('#modal'), form = $('#lead-form'), waDlg = $('#wa-pick'), current = null;
  wireDialog(modal); wireDialog(waDlg);
  waDlg.addEventListener('click', function (e) { if (e.target.closest('.wa-item')) closeDialog(waDlg); });
  d.addEventListener('click', function (e) {
    if (!e.target.closest('[data-wa-pick]')) return;
    e.preventDefault();
    // один менеджер: відкриваємо чат одразу, без вибору
    if (waTargets.length === 1) { closeMenu(); w.open(waTargets[0].whatsapp, '_blank', 'noopener'); return; }
    if (!waTargets.length) { toast('Номер WhatsApp ще завантажується. Спробуйте за кілька секунд або зателефонуйте.'); return; }
    openDialog(waDlg);
  });

  /* ---------------- forms ---------------- */
  var FORMS = {
    booking: { title: 'Бронювання місця', type: 'booking', submit: 'Забронювати', done: 'Бронювання надіслано' },
    delivery: { title: 'Відправити посилку', type: 'delivery', submit: 'Надіслати заявку', done: 'Заявку надіслано' },
    transfer: { title: 'Трансфер з аеропорту', type: 'transfer', submit: 'Замовити трансфер', done: 'Заявку надіслано' },
    callback: { title: 'Передзвонимо вам', type: 'callback', submit: 'Чекаю на дзвінок', done: 'Заявку надіслано' },
    review: { title: 'Ваш відгук', type: 'review', submit: 'Надіслати відгук', done: 'Відгук надіслано' }
  };
  var DONE_TEXT = { review: 'Дякуємо! Відгук з\'явиться на сайті після перевірки.' };
  function citySelect(name, label, value) { return '<label>' + label + '<select name="' + name + '" required>' + optionsHtml(value) + '</select></label>'; }
  var nameField = '<label>Ваше ім\'я<input name="name" autocomplete="name" required maxlength="60"></label>';
  var phoneField = '<label>Телефон<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+380" required maxlength="20"></label>';
  function dateField(name, label, value, min) { min = min || today(); var v = value && value >= min ? value : min; return '<label>' + label + '<input type="date" name="' + name + '" min="' + min + '" value="' + v + '" required></label>'; }
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
        dateField('date', 'Дата поїздки', pre.date, minDate(cls)) +
        '<fieldset><legend>Клас і виїзд</legend><div class="seg">' +
          '<label><input type="radio" name="f-cls" value="comfort"' + (cls === 'comfort' ? ' checked' : '') + '><span>' + icon('sun') + '<b>Comfort</b><small>08:00</small></span></label>' +
          '<label><input type="radio" name="f-cls" value="lux"' + (cls === 'lux' ? ' checked' : '') + '><span>' + icon('moon') + '<b>Lux</b><small>18:00</small></span></label></div></fieldset>' +
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
      h = nameField + '<fieldset><legend>Оцінка</legend><div class="stars-input">' +
        [5, 4, 3, 2, 1].map(function (n) { return '<input type="radio" name="stars" id="st' + n + '" value="' + n + '"' + (n === 5 ? ' checked' : '') + '><label for="st' + n + '" aria-label="' + n + ' з 5">' + icon('star') + '</label>'; }).join('') +
        '</div></fieldset><label>Відгук<textarea name="text" required maxlength="1000"></textarea></label>';
    }
    h += '<p class="form__err" id="f-err" role="alert"></p><button class="btn btn--accent btn--lg btn--block" type="submit">' + FORMS[kind].submit + '</button>';
    form.innerHTML = h;
  }
  function openForm(kind, pre) {
    if (!FORMS[kind]) return;
    current = kind;
    $('#modal-title').textContent = FORMS[kind].title;
    build(kind, pre);
    form.hidden = false; $('#modal-done').hidden = true;
    if (kind === 'booking') { syncSteppers(); updateBookingSum(false); }
    openDialog(modal);
    modal.scrollTop = 0;
    var first = kind === 'booking' ? form.querySelector('select:invalid, input[name="name"]') : form.querySelector('input, select, textarea');
    if (first && w.matchMedia('(pointer: fine)').matches) first.focus();
  }
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
    if (!ready) return { q: null, p: pax(), pending: true };
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
    if (c.pending) { box.innerHTML = '<p class="sum__note">' + (loadFailed ? 'Не вдалося завантажити ціни. Залиште заявку, менеджер назве суму.' : 'Рахуємо суму…') + '</p>'; return; }
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
    if (current === 'booking') syncDates(); // після півночі або після часу виїзду дата могла застаріти
    $$('.is-bad', form).forEach(function (x) { x.classList.remove('is-bad'); });
    $$('input, select, textarea', form).forEach(function (i) { i.removeAttribute('aria-invalid'); i.removeAttribute('aria-describedby'); });
    var bad = $$('input[required], select[required], textarea[required]', form).filter(function (i) { return !String(i.value).trim() || !i.checkValidity(); });
    var add = function (el) { if (el && bad.indexOf(el) === -1) bad.push(el); };
    var phoneBad = F.phone && F.phone.value.trim() && !validPhone(F.phone.value);
    if (phoneBad) add(F.phone);
    var sameCity = F.from && F.to && F.from.value && F.from.value === F.to.value;
    if (sameCity) add(F.to);
    var paxBad = F.pax && !new RegExp('^[1-' + PAX_MAX + ']$').test(String(F.pax.value).trim());
    if (paxBad) add(F.pax);
    var dateBad = F.date && F.date.value && F.date.min && F.date.value < F.date.min;
    if (dateBad) add(F.date);
    if (bad.length) {
      var msgs = [];
      if (bad.some(function (i) { return !String(i.value).trim(); })) msgs.push('Заповніть позначені поля.');
      if (phoneBad) msgs.push('Номер телефону має містити 10–15 цифр.');
      if (sameCity) msgs.push('Оберіть різні міста.');
      if (paxBad && String(F.pax.value).trim()) msgs.push('Пасажирів може бути від 1 до ' + PAX_MAX + '.');
      if (dateBad) msgs.push('Оберіть дату не раніше ' + dmy(F.date.min) + '.');
      bad.forEach(function (i) { i.classList.add('is-bad'); i.setAttribute('aria-invalid', 'true'); i.setAttribute('aria-describedby', 'f-err'); });
      err.textContent = msgs.join(' ') || 'Перевірте позначені поля.';
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
    var kind = current, btn = form.querySelector('button[type="submit"]'), label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Надсилаємо…';
    var send = w.RB_bridge && w.RB_bridge.supported() ? w.RB_bridge.lead({ type: FORMS[kind].type, fields: L, context: ctx }) : Promise.resolve(false);
    send.then(function (ok) {
      btn.disabled = false; btn.textContent = label;
      if (current !== kind) return; // за цей час відкрили іншу форму
      if (ok) {
        form.hidden = true;
        var done = $('#modal-done');
        $('.modal__done-title', done).textContent = FORMS[kind].done;
        $('p:not(.modal__done-title)', done).textContent = DONE_TEXT[kind] || 'Менеджер зв\'яжеться з вами найближчим часом.';
        done.hidden = false; $('[data-close]', done).focus();
        return;
      }
      var c2 = DATA.contacts || {}, tel = '+' + String(c2.phone || '+380634460657').replace(/\D/g, '');
      err.innerHTML = 'Заявка не надіслалася. Перевірте інтернет і спробуйте ще раз або зателефонуйте: <a href="tel:' + esc(tel) + '">' + esc(c2.phone_display || prettyPhone(tel)) + '</a>.';
    });
  });

  /* ---------------- UI ---------------- */
  var toastT;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('is-on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('is-on'); }, 3600); }

  var closeMenu = function () {};
  function initUi() {
    var top = $('#top'), burger = $('#burger'), nav = $('#nav'), dock = $('.dock');
    function onScroll() { top.classList.toggle('is-solid', w.scrollY > 24); }
    onScroll(); w.addEventListener('scroll', onScroll, { passive: true });
    var bg = [$('main'), $('.foot'), dock, $('.skip')];
    function setMenu(open) {
      if (open === nav.classList.contains('is-open')) return;
      nav.classList.toggle('is-open', open); top.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open)); burger.setAttribute('aria-label', open ? 'Закрити меню' : 'Меню');
      bg.forEach(function (el) { if (el) el.inert = open; });
      lock(open);
    }
    closeMenu = function () { setMenu(false); };
    // Tab не виходить за межі відкритого меню
    d.addEventListener('keydown', function (e) {
      if (!nav.classList.contains('is-open')) return;
      if (e.key === 'Escape') { setMenu(false); burger.focus(); return; }
      if (e.key !== 'Tab') return;
      var items = [burger].concat($$('a, button', nav)), n = items.length, i = items.indexOf(d.activeElement);
      e.preventDefault();
      items[i === -1 ? 0 : (i + (e.shiftKey ? -1 : 1) + n) % n].focus();
    });
    burger.addEventListener('click', function () { setMenu(!nav.classList.contains('is-open')); });
    top.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    w.addEventListener('resize', function () { if (w.innerWidth > 980) setMenu(false); });
    if ('IntersectionObserver' in w) {
      var links = {}; $$('a', nav).forEach(function (a) { var h = a.getAttribute('href'); if (h && h.charAt(0) === '#') links[h.slice(1)] = a; });
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting && links[en.target.id]) { $$('a.is-active', nav).forEach(function (a) { a.classList.remove('is-active'); }); links[en.target.id].classList.add('is-active'); } });
      }, { rootMargin: '-45% 0px -50% 0px' });
      Object.keys(links).forEach(function (id) { var s = d.getElementById(id); if (s) io.observe(s); });
      // нижня панель не дублює кнопку, поки видно форму пошуку
      var dio = new IntersectionObserver(function (es) { dock.classList.toggle('is-hidden', es[0].isIntersecting); }, { threshold: 0.25 });
      dio.observe($('#search'));
    }
    $('#year').textContent = new Date().getFullYear();
  }

  /* ---------------- gallery lightbox ---------------- */
  function initGallery() {
    var lb = $('#lightbox'), img = $('#lb-img'), count = $('#lb-count'), items = $$('#gallery .gallery__item'), idx = 0, opener = null;
    if (!lb || !items.length) return;
    function show(i) {
      idx = (i + items.length) % items.length;
      var it = items[idx];
      img.src = it.getAttribute('data-full'); img.alt = $('img', it).getAttribute('alt') || '';
      count.textContent = (idx + 1) + ' / ' + items.length;
    }
    items.forEach(function (it, i) { it.addEventListener('click', function () { opener = it; show(i); openDialog(lb); }); });
    lb.addEventListener('close', function () { lock(false); img.removeAttribute('src'); if (opener) opener.focus({ preventScroll: true }); });
    lb.addEventListener('click', function (e) {
      var b = e.target.closest('[data-lb]');
      if (b) { var a = b.getAttribute('data-lb'); if (a === 'close') closeDialog(lb); else show(idx + (a === 'next' ? 1 : -1)); return; }
      if (e.target === lb) closeDialog(lb);
    });
    lb.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
    });
    var x0 = null;
    lb.addEventListener('touchstart', function (e) { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
    });
  }

  initUi(); initSearch(); initRoutes(); renderTariff(); initGallery();
  // Спершу власні контакти й ключ заявок RUM-BUS, потім ціни й маршрути.
  fetchText(OVERRIDE_URL + '?v=' + Math.floor(Date.now() / 60000), 4000)
    .then(function (t) { try { w.RB_OVERRIDE = JSON.parse(t); } catch (e) {} }, function () {})
    .then(load);
  setInterval(function () { if (d.hidden) return; syncDates(); load(); if (rateAuto && ready && !rateLive) fetchRate(); }, 5 * 60 * 1000);
  d.addEventListener('visibilitychange', function () { if (!d.hidden) syncDates(); });
})(window, document);
