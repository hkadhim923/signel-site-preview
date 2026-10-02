/* Signel Services - /create-account/ (src/pages/register.js).
 * Three steps; each field is checked when it is left and again on Continue. The postal code
 * fills in the province. A draft (everything but the password) is kept on this device so a
 * closed tab loses nothing. Until a back end exists, finishing signs the visitor in on this
 * device, the same as /login/ (localStorage 'signel.account', read by src/js/shop.js). */
(function () {
  'use strict';
  var root = document.querySelector('[data-register]'); if (!root) return;
  var ROOT = document.documentElement.getAttribute('data-root') || '';
  var form = root.querySelector('[data-rg-form]'), DRAFT = 'signel.register.draft', step = 1;
  var $ = function (s, el) { return (el || root).querySelector(s); }, $$ = function (s, el) { return Array.prototype.slice.call((el || root).querySelectorAll(s)); };
  var msg = function (k) { return root.getAttribute('data-err-' + k) || ''; };

  // Canadian postal codes: the first letter is the province
  // (codes: the province list's values are the same in both languages)
  var PROV = { A: 'NL', B: 'NS', C: 'PE', E: 'NB', G: 'QC', H: 'QC', J: 'QC', K: 'ON', L: 'ON', M: 'ON', N: 'ON', P: 'ON', R: 'MB', S: 'SK', T: 'AB', V: 'BC', Y: 'YT' };

  function errorOf(inp) {
    var v = (inp.value || '').trim();
    if (inp.type === 'radio') return form.querySelector('input[name="' + inp.name + '"]:checked') ? '' : msg('type');
    if (inp.type === 'checkbox') return inp.required && !inp.checked ? msg('consent') : '';
    if (inp.required && !v) return msg('required');
    if (inp.type === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v)) return msg('email');
    if (inp.name === 'password' && v.length < 8) return msg('password');
    if (inp.name === 'postal' && v && !/^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$/.test(v)) return msg('postal');
    return '';
  }
  function show(inp, err) {
    var box = inp.closest('.rg-f, .rg-consent'), out = box && box.querySelector('.rg-err');
    if (out) out.textContent = err;
    if (box) box.classList.toggle('is-bad', !!err);
    if (inp.type !== 'radio') inp.setAttribute('aria-invalid', err ? 'true' : 'false');
  }
  function checkStep(n) {
    var fs = $('[data-rg-step="' + n + '"]'), first = null, seen = {};
    $$('input, textarea', fs).forEach(function (inp) {
      if (inp.closest('[hidden]') && inp.closest('[hidden]') !== fs) return;
      if (inp.type === 'radio') { if (!inp.required || seen[inp.name]) return; seen[inp.name] = 1; }
      var err = errorOf(inp); show(inp, err); if (err && !first) first = inp;
    });
    if (first) { first.focus(); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    return !first;
  }
  function go(n) {
    step = n;
    $$('[data-rg-step]').forEach(function (fs) { fs.hidden = +fs.getAttribute('data-rg-step') !== n; });
    $$('[data-rg-dot]').forEach(function (d) {
      var k = +d.getAttribute('data-rg-dot');
      d.classList.toggle('on', k === n); d.classList.toggle('done', k < n);
      if (k === n) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
    });
    $('[data-rg-back]').hidden = n === 1;
    $('[data-rg-next]').hidden = n === 3;
    $('[data-rg-submit]').hidden = n !== 3;
    var f = $('[data-rg-step="' + n + '"] input:not([type=radio]):not([type=checkbox])'); if (f && !f.value) f.focus({ preventScroll: true });
    root.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // a finished step's dot takes you back to it
  $$('[data-rg-dot]').forEach(function (d) { d.addEventListener('click', function () { var k = +d.getAttribute('data-rg-dot'); if (k < step) go(k); }); });
  $('[data-rg-next]').addEventListener('click', function () { if (checkStep(step)) go(step + 1); });
  $('[data-rg-back]').addEventListener('click', function () { go(step - 1); });
  form.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && step < 3) { e.preventDefault(); $('[data-rg-next]').click(); }
  });
  form.addEventListener('focusout', function (e) {
    var inp = e.target; if (!inp.matches || !inp.matches('input, textarea') || inp.type === 'radio') return;
    if (inp.value || inp.closest('.is-bad')) show(inp, errorOf(inp));
  });
  form.addEventListener('change', function (e) {
    var t = e.target;
    if (t.name === 'type') show(t, '');
    if (t.name === 'consent') show(t, errorOf(t));
    if (t.name === 'customer') $('[data-rg-custno]').hidden = t.value !== 'yes';
    saveDraft();
  });
  form.addEventListener('input', function (e) {
    var t = e.target;
    if (t.name === 'postal') {
      var raw = t.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      t.value = raw.length > 3 ? raw.slice(0, 3) + ' ' + raw.slice(3) : raw;
      var p = PROV[raw.charAt(0)]; if (p) form.province.value = p;
      if (raw.charAt(0) === 'X') form.province.value = 'NT';
    }
    if (t.name === 'phone') {
      var d = t.value.replace(/\D/g, ''); if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
      if (d.length === 10 && !/[()]/.test(t.value)) t.value = '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
    }
    if (t.closest('.is-bad')) show(t, errorOf(t));
    saveDraft();
  });
  $('[data-rg-eye]').addEventListener('click', function (e) {
    var b = e.currentTarget, pw = form.password, on = pw.type === 'password';
    pw.type = on ? 'text' : 'password'; b.textContent = root.getAttribute(on ? 'data-hide' : 'data-show'); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  // draft: every field but the password, kept on this device
  var timer;
  function saveDraft() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var d = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || el.name === 'password') return;
        if (el.type === 'radio') { if (el.checked) d[el.name] = el.value; }
        else if (el.type === 'checkbox') d[el.name] = el.checked;
        else d[el.name] = el.value;
      });
      try { localStorage.setItem(DRAFT, JSON.stringify(d)); $('[data-rg-saved]').hidden = false; } catch (e) {}
    }, 300);
  }
  try {
    var d = JSON.parse(localStorage.getItem(DRAFT) || 'null');
    if (d) Object.keys(d).forEach(function (k) {
      var els = form.querySelectorAll('[name="' + k + '"]');
      Array.prototype.forEach.call(els, function (el) {
        if (el.type === 'radio') el.checked = el.value === d[k];
        else if (el.type === 'checkbox') el.checked = !!d[k];
        else el.value = d[k];
      });
      if (k === 'customer') $('[data-rg-custno]').hidden = d[k] !== 'yes';
    });
  } catch (e) {}

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    for (var n = 1; n <= 3; n++) { if (!checkStep(n)) { if (n !== step) { go(n); checkStep(n); } return; } }
    var f = new FormData(form), get = function (k) { return (f.get(k) || '').toString().trim(); };
    var acc = { email: get('email'), name: (get('first_name') + ' ' + get('last_name')).trim(), company: get('company'), phone: get('phone') + (get('ext') ? ' ext. ' + get('ext') : ''),
                type: get('type'), position: get('position'), address: [get('address'), get('city'), (form.province.selectedOptions[0] || {}).text || get('province'), get('postal')].filter(Boolean).join(', '),
                customer: get('customer'), customer_no: get('customer_no'), news: !!f.get('news'), message: get('message') };
    try { localStorage.setItem('signel.account', JSON.stringify(acc)); localStorage.removeItem(DRAFT); } catch (err) {}
    if (window.signelRequest) window.signelRequest('account', { customer: acc });
    form.hidden = true;
    var done = $('[data-rg-done]'); done.hidden = false;
    $('[data-rg-done-title]').textContent = root.getAttribute('data-done').replace('{name}', get('first_name'));
    done.scrollIntoView({ block: 'center', behavior: 'smooth' });
    var next = new URLSearchParams(location.search).get('next');
    if (next && next.charAt(0) === '/') setTimeout(function () { location.href = ROOT + next; }, 1400);
  });
})();
