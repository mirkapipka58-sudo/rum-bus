/* Заявки з сайту → Telegram-бот (той самий канал, що й у Eurotour).
   Транспорт: ntfy.sh. Топік публічний, тому кожне повідомлення шифрується:
   ECDH P-256 (ефемерний ключ) + HKDF-SHA256 + AES-256-GCM. Приватний ключ є лише у бота.
   Без WebCrypto нічого не надсилається — відкритого тексту немає. */
(function (w) {
  'use strict';
  var NTFY = 'https://ntfy.sh/';
  var INFO = new TextEncoder().encode('eurotour-bridge-v2');
  var subtle = w.crypto && w.crypto.subtle;
  var cfg = { inbox: '', pub: '' };

  function b64(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(str) { var s = atob(str), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function rnd(n) { return w.crypto.getRandomValues(new Uint8Array(n)); }
  function store(key, make) {
    var v = null;
    try { v = localStorage.getItem(key); } catch (e) {}
    if (!v) { v = make(); try { localStorage.setItem(key, v); } catch (e) {} }
    return v;
  }
  var SID = store('rb_sid', function () { return Array.prototype.map.call(rnd(8), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); });
  var RK = store('rb_rk', function () { return b64(rnd(32)); });

  function seal(obj) {
    if (!subtle || !cfg.pub) return Promise.reject(new Error('crypto unavailable'));
    var curve = { name: 'ECDH', namedCurve: 'P-256' };
    var inner = Object.assign({}, obj, { rk: RK });
    return Promise.all([subtle.importKey('raw', unb64(cfg.pub), curve, false, []), subtle.generateKey(curve, true, ['deriveBits'])])
      .then(function (r) {
        var eph = r[1];
        return subtle.deriveBits({ name: 'ECDH', public: r[0] }, eph.privateKey, 256)
          .then(function (bits) { return subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']); })
          .then(function (ikm) { return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: INFO }, ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt']); })
          .then(function (key) {
            var iv = rnd(12);
            return Promise.all([subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(JSON.stringify(inner))), subtle.exportKey('raw', eph.publicKey)])
              .then(function (x) { return JSON.stringify({ v: 2, e: b64(x[1]), i: b64(iv), c: b64(x[0]) }); });
          });
      });
  }

  function publish(payload) {
    if (!cfg.inbox) return Promise.resolve(false);
    return seal(payload).then(function (body) {
      return fetch(NTFY + cfg.inbox, { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' } });
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  var QKEY = 'rb_lead_queue';
  var waiters = [];
  function whenReady(ms) {
    if (cfg.inbox) return Promise.resolve(true);
    return new Promise(function (res) {
      var t = setTimeout(function () { res(false); }, ms);
      waiters.push(function () { clearTimeout(t); res(true); });
    });
  }
  function keyOf(lead) { try { return JSON.stringify(lead); } catch (e) { return ''; } }
  function queue(fn) { var q = []; try { q = JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch (e) {} q = fn(q) || q; try { localStorage.setItem(QKEY, JSON.stringify(q.slice(-10))); } catch (e) {} }
  function unqueue(ts) { queue(function (q) { return q.filter(function (x) { return x.ts !== ts; }); }); }

  w.RB_bridge = {
    configure: function (c) {
      var first = !cfg.inbox;
      if (c && c.inbox && c.pub) cfg = { inbox: c.inbox, pub: c.pub };
      if (first && cfg.inbox) { // повторно відправити заявки, що не пішли раніше
        waiters.splice(0).forEach(function (f) { f(); });
        try { JSON.parse(localStorage.getItem(QKEY) || '[]').forEach(function (p) { var b = Object.assign({}, p); delete b.key; publish(b).then(function (ok) { if (ok) unqueue(p.ts); }); }); } catch (e) {}
      }
    },
    ready: function () { return !!(subtle && cfg.inbox && cfg.pub); },
    supported: function () { return !!subtle; },
    /* Same lead submitted again (e.g. after a failed try) reuses the queued payload,
       so the bot never receives a duplicate. Waits up to 8 s for site.json to load. */
    lead: function (lead) {
      if (!subtle) return Promise.resolve(false);
      var key = keyOf(lead), payload = null;
      queue(function (q) {
        // a corrected re-submission of the same form replaces the older unsent one
        q = q.filter(function (x) { return x.key === key || !(x.lead && lead && x.lead.type === lead.type && x.sid === SID); });
        payload = q.filter(function (x) { return x.key === key; })[0] || null;
        if (!payload) {
          payload = { kind: 'lead', sid: SID, page: location.href, ua: navigator.userAgent.slice(0, 120), lang: navigator.language,
            ts: new Date().toISOString(), ref: document.referrer || '', lead: lead, key: key };
          q.push(payload);
        }
        return q;
      });
      var body = Object.assign({}, payload); delete body.key; delete body.sent;
      return whenReady(8000).then(function (ok) {
        if (!ok) return false;
        return publish(body).then(function (sent) { if (sent) unqueue(payload.ts); return sent; });
      });
    }
  };
})(window);
