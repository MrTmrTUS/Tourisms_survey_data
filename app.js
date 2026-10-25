/* Khảo sát P1.6.1 — bản online.
   Câu hỏi, bản dịch, thứ tự cột: survey_data.js (sinh từ _build_P1.2/make_web161.py, không sửa tay). Cấu hình: config.js.
   Mã hóa theo codebook: thang 1–7; NB = 98; bỏ trống = 99; không hiển thị vì đã dừng ở câu sàng lọc = 97; MODE = 2.
   Phải trả lời đủ câu trên trang mới sang trang. Tiến độ chỉ lưu trên máy (làm tiếp trong 12 giờ); chỉ gửi khi bấm Gửi
   (SUBMITTED = 1), nên phiếu bỏ dở không vào sheet. Chưa tới được máy chủ thì bản ghi nằm trong hàng đợi trên máy và gửi lại. */
(function () {
  'use strict';
  var S = window.SURVEY, C = window.SURVEY_CONFIG || {};
  var K_STATE = 'p161_state', K_QUEUE = 'p161_queue', K_DONE = 'p161_done', K_SEQ = 'p161_seq';
  var params = new URLSearchParams(location.search);
  var STAFF = params.get('staff') === '1', ADMIN = params.get('admin') === '1';
  var app = document.getElementById('app');
  var st = null, timerId = null, netState = '', flushing = false, flushAgain = false, curCtl = null, everFailed = false, uid = 0;

  // ---------------- lưu trên máy (mọi thao tác đều bọc try/catch) ----------------
  function get(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bộ nhớ đầy hoặc bị chặn */ } }
  function del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function save() { if (st) { st.savedAt = Date.now(); set(K_STATE, st); } }

  // ---------------- chữ ----------------
  function lang() { return (st && st.lang) || 'en'; }
  function t(key, vars) {
    var e = S.text[key], s = e ? (e[lang()] || e.en) : key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rich(s) { return esc(s).replace(/\[A\]/g, '<b class="ax">A</b>').replace(/\[X\]/g, '<b class="ax">X</b>'); }
  // đoạn văn cách nhau bằng xuống dòng; dòng bắt đầu bằng "- " thành gạch đầu dòng
  function paras(s) {
    var out = '', li = [];
    String(s || '').split(/\n+/).forEach(function (line) {
      line = line.trim(); if (!line) return;
      if (/^- /.test(line)) { li.push('<li>' + rich(line.slice(2)) + '</li>'); return; }
      if (li.length) { out += '<ul>' + li.join('') + '</ul>'; li = []; }
      out += '<p>' + rich(line) + '</p>';
    });
    return out + (li.length ? '<ul>' + li.join('') + '</ul>' : '');
  }
  // độ cao đầu trang thật (đổi theo cỡ chữ, cỡ màn hình) để dải A, X và thông báo nằm ngay dưới
  function syncTop() { var h = document.querySelector('.top'); if (h) document.documentElement.style.setProperty('--top-h', h.offsetHeight + 'px'); }
  function htmlLang(c) { return c === 'zh' ? 'zh-Hans' : c; }
  function langOf(c) { return S.langs.filter(function (l) { return l.code === c; })[0]; }
  function flag(code, cls) {
    uid += 1;
    var svg = (S.flags[code] || '').replace(/id="(\w+)"/g, function (m, id) { return 'id="' + id + uid + '"'; })
      .replace(/url\(#(\w+)\)/g, function (m, id) { return 'url(#' + id + uid + ')'; });
    return '<span class="flag ' + (cls || '') + '" aria-hidden="true">' + svg + '</span>';
  }

  // ---------------- tiện ích ----------------
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function isoLocal(d) {
    var o = -d.getTimezoneOffset(), a = Math.abs(o);
    return ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + (o >= 0 ? '+' : '-') + pad(Math.floor(a / 60)) + ':' + pad(a % 60);
  }
  function rnd(n) { var u = new Uint32Array(1); window.crypto.getRandomValues(u); return u[0] % n; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function makeId(d) {
    var abc = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ', r = '';
    for (var i = 0; i < 6; i++) r += abc[rnd(abc.length)];
    return 'W' + String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + r;
  }
  function cleanSession(s) { return s && /^[A-Za-z0-9_-]{1,40}$/.test(s) ? s : ''; }
  function deviceType() {
    var ua = navigator.userAgent;
    if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))) return 'tablet';
    if (/Mobi|iPhone|Android/i.test(ua)) return 'mobile';
    return 'desktop';
  }
  function toast(msg) {
    var d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 3500);
  }
  function modal(title, body, b1, b2, f1, f2) {     // b2 = null: hộp thoại một nút
    var m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = '<div class="modal-card" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3><p>' + esc(body) + '</p><div class="acts">' +
      (b2 == null ? '<button class="btn primary" data-a="1">' + esc(b1) + '</button>'
        : '<button class="btn ghost" data-a="1">' + esc(b1) + '</button><button class="btn primary" data-a="2">' + esc(b2) + '</button>') + '</div></div>';
    document.body.appendChild(m);
    m.querySelector('[data-a="1"]').onclick = function () { m.remove(); f1(); };
    if (b2 != null) m.querySelector('[data-a="2"]').onclick = function () { m.remove(); f2(); };
    m.querySelector(b2 == null ? '[data-a="1"]' : '[data-a="2"]').focus();
  }

  // ---------------- trạng thái ----------------
  function newState(code) {
    var now = new Date();
    return { v: S.web_version, lang: code, id: makeId(now), startTs: isoLocal(now), startMs: now.getTime(), date: ymd(now),
      page: 0, maxPage: 0, ans: {}, ord: {}, times: {}, enter: Date.now(), done: false, stopVar: null, endTs: null, endMs: null,
      compl: STAFF ? null : 1, session: cleanSession(params.get('s')), device: deviceType(), savedAt: Date.now() };
  }
  function visible(b) {
    if (!b.show_if) return true;
    return Object.keys(b.show_if).every(function (k) { return st.ans[k] === b.show_if[k]; });
  }
  function ensureOrders(p) {        // đảo thứ tự trong từng nhóm câu (nhóm cố định: ATTN) và lưu vào ORD_Bk
    p.blocks.forEach(function (b) {
      if (b.type !== 'likert' || st.ord[b.order]) return;
      var gs = b.groups.map(function (g) { return g.fixed ? g.items.slice() : shuffle(g.items); });
      st.ord[b.order + '_g'] = gs;
      st.ord[b.order] = [].concat.apply([], gs);
      save();
    });
  }

  // ---------------- mã hóa một bản ghi theo codebook ----------------
  function record(final) {
    var r = {};
    S.columns.forEach(function (c) { r[c] = ''; });
    r.RESP_ID = st.id; r.MODE = 2; r.LANG = langOf(st.lang).LANG; r.SURVEY_DATE = st.date; r.SESSION_ID = st.session;
    r.COMPL_MODE = st.compl != null ? st.compl : (final ? 99 : '');
    r.DURATION_SEC = final ? Math.round((st.endMs - st.startMs) / 1000) : '';
    r.SUBMITTED = final ? 1 : 0;
    Object.keys(st.ord).forEach(function (k) { if (!/_g$/.test(k) && k in r) r[k] = st.ord[k].join(','); });
    var stopIdx = -1;
    if (st.stopVar) S.vars.forEach(function (v, i) { if (v.name === st.stopVar) stopIdx = i; });
    S.vars.forEach(function (v, i) {
      var a = st.ans[v.name];
      if (stopIdx >= 0 && i > stopIdx) r[v.name] = S.codes.routed;          // 97: không hiển thị do đã dừng
      else if (a != null) r[v.name] = a;
      else if (final || v.page < st.page) r[v.name] = S.codes.blank;         // 99: đã qua trang mà bỏ trống
      else r[v.name] = '';                                                   // bản lưu dở: chưa tới trang này
    });
    r.START_TS = st.startTs; r.END_TS = final ? st.endTs : '';
    r.PAGE_TIMES = Object.keys(st.times).map(function (k) { return k + ':' + Math.round(st.times[k]); }).join(';');
    r.DEVICE = st.device; r.WEB_VERSION = S.web_version;
    return r;
  }

  // ---------------- gửi dữ liệu ----------------
  function enqueue(rec) {
    var seq = get(K_SEQ, 0) + 1; set(K_SEQ, seq);
    var q = get(K_QUEUE, []).filter(function (x) { return x.rec.RESP_ID !== rec.RESP_ID; });
    q.push({ seq: seq, rec: rec }); set(K_QUEUE, q);
  }
  function keepDone(rec) {         // bản sao phiếu đã xong: chỉ trên máy của nhóm hoặc chế độ thử
    if (!STAFF && C.ENDPOINT) return;
    var d = get(K_DONE, []); d.push(rec); if (d.length > 3000) d.shift(); set(K_DONE, d);
  }
  function flush() {
    var q0 = get(K_QUEUE, []);
    if (flushing) { flushAgain = true; return Promise.resolve(); }     // đang gửi: gửi tiếp ngay khi xong lượt này
    if (!q0.length || !C.ENDPOINT) { showNet(); return Promise.resolve(); }
    flushing = true; flushAgain = false; netState = 'saving'; showNet();
    var chain = Promise.resolve();
    q0.forEach(function (item) {
      chain = chain.then(function () {
        // mạng chặn Google (vd. SIM Trung Quốc chuyển vùng) thường treo chứ không báo lỗi: quá 15 giây thì coi là chưa gửi được
        var ctl = window.AbortController ? new AbortController() : null, tm = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : null;
        curCtl = ctl;
        return fetch(C.ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, keepalive: true,   // vẫn gửi khi trang đã đóng
          signal: ctl ? ctl.signal : undefined,
          body: JSON.stringify({ token: C.TOKEN, columns: S.columns, string_cols: S.string_cols, record: item.rec }) })
          .then(function (res) { return res.json(); })
          .then(function (j) {
            clearTimeout(tm);
            if (!j.ok) throw new Error(j.error || 'server');
            set(K_QUEUE, get(K_QUEUE, []).filter(function (x) { return !(x.rec.RESP_ID === item.rec.RESP_ID && x.seq === item.seq); }));
          }, function (e) { clearTimeout(tm); throw e; });
      });
    });
    return chain.then(function () { netState = 'saved'; }, function () { netState = 'offline'; everFailed = true; })
      .then(function () {
        flushing = false; curCtl = null;
        // có yêu cầu gửi lại trong lúc đang gửi (bản ghi mới, nút Gửi lại): gửi thêm một lượt, kể cả khi lượt vừa rồi thất bại
        if (flushAgain || (netState !== 'offline' && get(K_QUEUE, []).length)) return flush();
        showNet();
      });
  }
  // trang kết thúc: chỉ báo "đã ghi nhận" khi hàng đợi trống; đã thử mà chưa tới được máy chủ thì giữ lời dặn
  // (giữ trang mở, nối Wi-Fi) và nút Gửi lại cho tới khi gửi được, kể cả trong lúc website tự thử lại
  function showNet() {
    var el = document.getElementById('net'), body = document.getElementById('endbody');
    var ico = document.getElementById('endico'), retry = document.getElementById('retry');
    var pending = !!C.ENDPOINT && get(K_QUEUE, []).length > 0;
    if (!pending) everFailed = false;
    var unsent = pending && everFailed;
    if (body) body.textContent = !pending ? body.getAttribute('data-done') : (unsent ? t('ui.unsent_body') : t('ui.saving'));
    if (ico) { ico.textContent = unsent ? '!' : '✓'; ico.className = 'ico' + (unsent ? ' warn' : ''); }
    if (retry) retry.hidden = !unsent;
    if (!el) return;
    el.className = 'netmsg';
    if (!C.ENDPOINT) el.textContent = (st && st.done) ? 'TEST MODE — no server configured; data kept on this device (?admin=1).' : '';
    else if (!body) el.textContent = '';
    else if (!pending) el.textContent = netState === 'saved' ? t('ui.saved') : '';
    else el.textContent = unsent && netState === 'saving' ? t('ui.saving') : '';
  }

  // ---------------- đồng hồ ----------------
  function tick() {
    var el = document.getElementById('timer'); if (!el || !st) return;
    var s = Math.max(0, Math.floor((Date.now() - st.startMs) / 1000));
    el.textContent = pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  }
  function startTimer() { stopTimer(); if (C.SHOW_TIMER) { tick(); timerId = setInterval(tick, 1000); } }
  function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }

  // ---------------- màn hình chọn ngôn ngữ ----------------
  function renderLang() {
    document.documentElement.lang = 'en';
    var titles = S.langs.map(function (l) { return S.text['ui.lang_title'][l.code]; });
    app.innerHTML = '<div class="lang-screen"><div class="lang-card"><h1>' + esc(S.text.title.en) + '</h1>' +
      '<p class="sub">' + titles.map(esc).join(' · ') + '</p><div class="lang-list">' +
      S.langs.map(function (l) {
        return '<button class="lang-btn" data-lang="' + l.code + '" lang="' + htmlLang(l.code) + '">' + flag(l.flag) +
          '<span>' + esc(l.name) + '</span><span class="arrow">›</span></button>';
      }).join('') + '</div></div></div>';
    app.querySelectorAll('.lang-btn').forEach(function (b) {
      b.addEventListener('click', function () { st = newState(b.getAttribute('data-lang')); save(); renderPage(); });
    });
  }

  // ---------------- trang câu hỏi ----------------
  function header(p) {
    var L = langOf(st.lang), pct = Math.round(st.page / S.pages.length * 100);
    var prog = p.part ? t('ui.progress', { p: p.part, n: S.n_parts }) : '';
    var langPart = st.page === 0
      ? '<button class="linkbtn lang" id="chlang" title="' + esc(t('ui.lang_title')) + '">' + flag(L.flag, 'sm') + '<span>' + esc(L.name) + '</span></button>'
      : '<span class="lang">' + flag(L.flag, 'sm') + '<span>' + esc(L.name) + '</span></span>';
    return '<header class="top"><div class="top-in"><div class="brand">' + esc(t('title')) + '</div><div class="meta">' +
      (C.SHOW_TIMER ? '<span class="timer" id="timer" title="' + esc(t('ui.elapsed')) + '">00:00</span>' : '') + langPart + '</div></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="progress-txt"><span>' + esc(prog) + '</span><span>' + esc(t('ui.percent', { pct: pct })) + '</span></div></header>';
  }
  function intro() {
    var da = C.DATA_ACCESS;
    var data = typeof da === 'string' ? da : (da ? (da[st.lang] || da.en || '') : '');
    var rows = [['lbl.team', C.RESEARCH_TEAM], ['lbl.contact', C.CONTACT_EMAIL], ['lbl.data', data]].map(function (r) {
      return r[1] ? '<div><b>' + esc(t(r[0])) + ':</b> ' + esc(r[1]) + '</div>' : '';   // mục để trống trong config.js thì không hiện
    }).join('');
    return '<h1 class="title">' + esc(t('title')) + '</h1><div class="card intro">' + paras(t('intro')) +
      (rows ? '<div class="contacts">' + rows + '</div>' : '') + '</div>';
  }
  function choiceHtml(b) {
    var opts = b.opts.map(function (o) { return { v: o[0], txt: t(o[1]) }; });
    var inline = opts.length <= 3 && opts.every(function (o) { return o.txt.length <= 16; });
    var cur = st.ans[b.var];
    return '<fieldset class="q" data-var="' + b.var + '"' + (visible(b) ? '' : ' hidden') + '><legend>' +
      (b.label ? '<span class="qno">' + esc(b.label) + '</span>' : '') + rich(t(b.key)) + '</legend>' +
      (b.note ? '<p class="note">' + rich(t(b.note)) + '</p>' : '') +
      '<div class="opts' + (inline ? ' inline' : '') + '">' + opts.map(function (o) {
        return '<label class="row"><input type="radio" name="' + b.var + '" value="' + o.v + '"' + (cur === o.v ? ' checked' : '') + '>' +
          '<span class="dot"></span><span>' + rich(o.txt) + '</span></label>';
      }).join('') + '</div><p class="err" hidden>' + esc(t('ui.please_answer')) + '</p></fieldset>';
  }
  function chosenTxt(v) { return v == null ? '' : (v === 98 ? 'NB' : v + ' · ' + t('scale.' + v)); }
  function itemHtml(code, nb) {
    var cur = st.ans[code], s = '<div class="item" data-var="' + code + '"><p class="stmt">' + rich(t('item.' + code)) + '</p><div class="scale" role="radiogroup">';
    for (var i = 1; i <= 7; i++) {
      s += '<label class="pt" title="' + esc(t('scale.' + i)) + '"><input type="radio" name="' + code + '" value="' + i + '"' + (cur === i ? ' checked' : '') +
        ' aria-label="' + i + ' ' + esc(t('scale.' + i)) + '"><span>' + i + '</span></label>';
    }
    var nbh = function (x) { return esc(x).replace(/-/g, '&#8209;'); };      // không ngắt dòng ở "(-на)"
    s += '</div><div class="anchors"><span>1 · ' + nbh(t('scale.1')) + '</span><span>7 · ' + nbh(t('scale.7')) + '</span></div><div class="nbrow">';
    s += nb ? '<label class="nb"><input type="radio" name="' + code + '" value="98"' + (cur === 98 ? ' checked' : '') + '><span>NB · ' + esc(t('scale.NB')) + '</span></label>' : '<span></span>';
    return s + '<span class="chosen">' + esc(chosenTxt(cur)) + '</span></div></div>';
  }
  function likertHtml(b) {
    var s = '<div class="legend">';
    for (var i = 1; i <= 7; i++) s += '<span><b>' + i + '</b> ' + esc(t('scale.' + i)) + '</span>';
    if (b.nb) s += '<span><b>NB</b> ' + esc(t('scale.NB')) + '</span>';
    s += '</div>';
    var gs = st.ord[b.order + '_g'];
    b.groups.forEach(function (g, gi) {
      if (g.lead) s += '<p class="lead">' + rich(t(g.lead)) + '</p>';
      gs[gi].forEach(function (code) { s += itemHtml(code, b.nb); });
    });
    return s;
  }
  function blockHtml(b) {
    switch (b.type) {
      case 'intro': return intro();
      case 'box': return '<div class="box"><p>' + rich(t(b.key)) + '</p></div>';
      case 'box2': return '<div class="box"><p><b>' + rich(t('p2.lead')) + '</b></p><p>' + rich(t('p2.body')) + '</p><p>' + rich(t('p2.defs')) + '</p></div>';
      case 'instr': return '<p class="instr">' + rich(t(b.key)) + '</p>';
      case 'choice': return choiceHtml(b);
      case 'likert': return likertHtml(b);
    }
    return '';
  }
  function renderPage() {
    var p = S.pages[st.page];
    document.documentElement.lang = htmlLang(st.lang);
    ensureOrders(p);
    var last = st.page === S.pages.length - 1, h = header(p) + '<main>';
    if (p.heading) h += '<h2 class="part">' + rich(t(p.heading)) + '</h2>';
    if (st.page >= 3) h += '<div class="ax-chip">' + rich(t('p2.defs')) + '</div>';       // nhắc A, X (bản online không chèn tên)
    p.blocks.forEach(function (b) { h += blockHtml(b); });
    h += '</main><div class="nav"><div class="nav-in">' + (st.page > 0 ? '<button class="btn ghost" id="back">' + esc(t('ui.back')) + '</button>' : '') +
      '<button class="btn primary" id="next">' + esc(last ? t('ui.submit') : t('ui.next')) + '</button></div><div class="netmsg" id="net"></div></div>';
    app.innerHTML = h;
    app.querySelectorAll('input[type=radio]').forEach(function (inp) { inp.addEventListener('change', onAnswer); });
    document.getElementById('next').addEventListener('click', function () { next(p); });
    var bb = document.getElementById('back'); if (bb) bb.addEventListener('click', back);
    var cl = document.getElementById('chlang'); if (cl) cl.addEventListener('click', function () { st = null; del(K_STATE); stopTimer(); renderLang(); });
    startTimer(); showNet(); syncTop();
  }
  function onAnswer(e) {
    var name = e.target.name, v = parseInt(e.target.value, 10);
    st.ans[name] = v; save();
    var wrap = e.target.closest('[data-var]');
    if (wrap) {
      wrap.classList.remove('missing');
      var er = wrap.querySelector('.err'); if (er) er.hidden = true;
      var ch = wrap.querySelector('.chosen'); if (ch) ch.textContent = chosenTxt(v);
    }
    S.pages[st.page].blocks.forEach(function (b) {            // câu hiện theo điều kiện (S2 sau khi S1 = Có)
      if (b.type !== 'choice' || !b.show_if || !(name in b.show_if)) return;
      var fs = app.querySelector('fieldset[data-var="' + b.var + '"]'), vis = visible(b);
      fs.hidden = !vis;
      if (!vis) { delete st.ans[b.var]; fs.querySelectorAll('input').forEach(function (i) { i.checked = false; }); save(); }
    });
  }
  function unanswered(p) {
    var out = [];
    p.blocks.forEach(function (b) {
      if (b.type === 'choice' && visible(b) && st.ans[b.var] == null) out.push(b.var);
      if (b.type === 'likert') st.ord[b.order].forEach(function (c) { if (st.ans[c] == null) out.push(c); });
    });
    return out;
  }
  function leavePage(p) { st.times[p.id] = (st.times[p.id] || 0) + (Date.now() - st.enter) / 1000; st.enter = Date.now(); }
  function mark(vars) {
    vars.forEach(function (v) { var el = app.querySelector('[data-var="' + v + '"]'); if (el) el.classList.add('missing'); });
    var first = app.querySelector('[data-var="' + vars[0] + '"]'); if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function next(p) {
    var req = p.blocks.filter(function (b) { return b.type === 'choice' && b.required && visible(b) && st.ans[b.var] == null; });
    if (req.length) {
      req.forEach(function (b) { app.querySelector('fieldset[data-var="' + b.var + '"] .err').hidden = false; });
      return mark(req.map(function (b) { return b.var; }));
    }
    for (var i = 0; i < p.blocks.length; i++) {               // điểm dừng: C0 không đồng ý, S1/S2 trả lời Không
      var b = p.blocks[i];
      if (b.type === 'choice' && b.stop != null && visible(b) && st.ans[b.var] === b.stop) return finish(b.var);
    }
    var miss = unanswered(p);                                // bắt buộc trả lời đủ câu trên trang (câu thang đo có NB để thoát)
    if (miss.length) return modal(t('ui.unanswered_title'), t('ui.unanswered_body'), t('ui.answer_them'), null, function () { mark(miss); });
    leavePage(p);
    if (st.page === S.pages.length - 1) return finish(null);
    st.page += 1; st.maxPage = Math.max(st.maxPage, st.page); save();
    try { history.pushState({ p: st.page }, ''); } catch (e) { }
    renderPage(); window.scrollTo(0, 0);                   // không gửi bản lưu dở: chỉ gửi khi bấm Gửi (phiếu bỏ dở không vào sheet)
  }
  function back() {
    if (!st || st.done || st.page === 0) return;
    leavePage(S.pages[st.page]); st.page -= 1; save(); renderPage(); window.scrollTo(0, 0);
  }

  // ---------------- kết thúc ----------------
  function finish(stopVar) {
    leavePage(S.pages[st.page]);
    var now = new Date();
    st.stopVar = stopVar; st.endTs = isoLocal(now); st.endMs = now.getTime(); st.done = true; save();
    stopTimer();
    if (STAFF && !stopVar) return renderStaff();
    submitFinal();
  }
  function submitFinal() { var rec = record(true); keepDone(rec); enqueue(rec); save(); renderEnd(); flush(); }
  function renderStaff() {
    var T = S.staff;
    app.innerHTML = '<header class="top"><div class="top-in"><div class="brand">' + esc(T.title[0]) + ' · ' + esc(T.title[1]) + '</div></div></header><main>' +
      '<div class="card staff"><p><b>' + esc(T.body[0]) + '</b><br>' + esc(T.body[1]) + '</p>' +
      '<fieldset class="q" style="box-shadow:none;border:0;padding:0"><legend>' + esc(T.q[0]) + ' · ' + esc(T.q[1]) + '</legend><div class="opts">' +
      T.compl.map(function (o) {
        return '<label class="row"><input type="radio" name="COMPL_MODE" value="' + o[0] + '"><span class="dot"></span><span>' + o[0] + ' · ' + esc(o[1]) + ' / ' + esc(o[2]) + '</span></label>';
      }).join('') + '</div></fieldset><button class="btn primary" id="staffsave" style="width:100%;margin-top:14px">' + esc(T.save[0]) + ' · ' + esc(T.save[1]) + '</button></div></main>';
    document.getElementById('staffsave').onclick = function () {
      var c = app.querySelector('input[name=COMPL_MODE]:checked');
      if (!c) return;
      st.compl = parseInt(c.value, 10); save(); submitFinal();
    };
  }
  function renderEnd() {
    stopTimer();
    var stopped = !!st.stopVar, decline = st.stopVar === 'CONSENT';
    var title = stopped ? t('ui.stop_title') : t('thanks');
    var body = decline ? t('ui.decline_body') : (stopped ? t('ui.stop_body') : t('ui.thanks_body'));
    document.documentElement.lang = htmlLang(st.lang);
    app.innerHTML = '<header class="top"><div class="top-in"><div class="brand">' + esc(t('title')) + '</div></div><div class="bar"><i style="width:100%"></i></div></header>' +
      '<main><div class="card end"><div class="ico" id="endico">✓</div><h1>' + esc(title) + '</h1><p id="endbody" data-done="' + esc(body) + '"></p>' +
      '<button class="btn primary" id="retry" hidden>' + esc(t('ui.retry')) + '</button><p class="netmsg" id="net"></p>' +
      (STAFF ? '<button class="btn primary" id="newq" style="margin-top:16px">' + esc(S.staff['new'][0]) + ' · ' + esc(S.staff['new'][1]) + '</button>' : '') +
      '</div></main>';
    showNet();
    document.getElementById('retry').onclick = function () {      // bỏ lượt đang treo (nếu có) và gửi ngay một lượt mới
      netState = 'saving'; showNet();
      if (flushing) { flushAgain = true; if (curCtl) curCtl.abort(); } else flush();
    };
    var nq = document.getElementById('newq');
    if (nq) nq.onclick = function () { del(K_STATE); st = null; renderLang(); };
  }

  // ---------------- trang quản trị (?admin=1): hàng đợi, tải CSV, đếm phiếu, tạo link ----------------
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function renderAdmin() {
    var q = get(K_QUEUE, []), d = get(K_DONE, []);
    app.innerHTML = '<header class="top"><div class="top-in"><div class="brand">P1.6.1 · Trang quản trị (admin)</div></div></header><main class="admin">' +
      '<div class="card"><table><tr><td>Phiên bản</td><td>' + esc(S.web_version) + '</td></tr>' +
      '<tr><td>Máy chủ (ENDPOINT)</td><td>' + (C.ENDPOINT ? 'đã cấu hình' : '<b>chưa cấu hình — chế độ thử</b>') + '</td></tr>' +
      '<tr><td>Bản ghi chờ gửi trên máy này</td><td>' + q.length + '</td></tr>' +
      '<tr><td>Phiếu đã xong lưu trên máy này</td><td>' + d.length + '</td></tr>' +
      '<tr><td>Phiếu trên máy chủ</td><td id="srv">—</td></tr></table>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="aflush">Gửi lại ngay</button>' +
      '<button class="btn ghost" id="acsv">Tải CSV (dữ liệu trên máy này)</button><button class="btn ghost" id="acount">Đếm phiếu trên máy chủ</button></div></div>' +
      '<div class="card"><b>Tạo link cho một phiên tiếp cận</b><p class="note">Mã phiên trùng sổ tiếp cận (ví dụ HA-1105-A). Đánh dấu nếu dùng máy của nhóm.</p>' +
      '<input type="text" id="asess" placeholder="HA-1105-A"><p><label><input type="checkbox" id="astaff"> Máy của nhóm (staff=1)</label></p><p class="mono" id="alink"></p></div></main>';
    function link() {
      var s = cleanSession(document.getElementById('asess').value.trim());
      var u = location.origin + location.pathname + (s ? '?s=' + encodeURIComponent(s) : '') + (document.getElementById('astaff').checked ? (s ? '&' : '?') + 'staff=1' : '');
      document.getElementById('alink').textContent = u;
    }
    document.getElementById('asess').oninput = link; document.getElementById('astaff').onchange = link; link();
    document.getElementById('aflush').onclick = function () { flush().then(renderAdmin); };
    document.getElementById('acount').onclick = function () {
      if (!C.ENDPOINT) return;
      fetch(C.ENDPOINT + '?action=count&token=' + encodeURIComponent(C.TOKEN)).then(function (r) { return r.json(); })
        .then(function (j) { document.getElementById('srv').textContent = (j.submitted || 0) + ' đã gửi / ' + (j.rows || 0) + ' dòng'; })
        .catch(function () { document.getElementById('srv').textContent = 'không kết nối được'; });
    };
    document.getElementById('acsv').onclick = function () {
      var byId = {};
      get(K_QUEUE, []).forEach(function (x) { byId[x.rec.RESP_ID] = x.rec; });
      get(K_DONE, []).forEach(function (r) { byId[r.RESP_ID] = r; });
      var lines = [S.columns.join(',')];
      Object.keys(byId).forEach(function (k) { lines.push(S.columns.map(function (c) { return csvCell(byId[k][c]); }).join(',')); });
      var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'P1.6.1_online_local_' + ymd(new Date()) + '.csv'; a.click();
    };
  }

  // ---------------- khởi động ----------------
  function init() {
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) flush(); });   // quay lại trang (vd. sau khi nối Wi-Fi)
    window.addEventListener('resize', syncTop);
    setInterval(flush, 60000);
    if (ADMIN) { renderAdmin(); return; }
    if (params.get('new') === '1') del(K_STATE);
    var s = get(K_STATE, null), fresh = s && s.v === S.web_version && Date.now() - (s.savedAt || 0) < 12 * 3600 * 1000;
    if (fresh && !s.done) { st = s; st.enter = Date.now(); renderPage(); toast(t('ui.resumed')); }
    else if (fresh && s.done && !STAFF) { st = s; renderEnd(); }
    else { st = null; renderLang(); }
    window.addEventListener('popstate', function () { if (st && !st.done && st.page > 0) back(); });
    flush();
  }
  window.__P161 = { record: function (f) { return st && record(!!f); }, state: function () { return st; } };   // phục vụ kiểm thử
  init();
})();
