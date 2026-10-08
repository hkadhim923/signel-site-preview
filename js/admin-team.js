/* Signel Services — dashboard sections for people (plugs into src/js/admin.js).
     Members  customer accounts: every account created on the site waits for review; Sales or
              Administration approves it with its price class (P1 to P7) or refuses it.
     Users    staff accounts and their role (Administration only); the roles and what each opens
              are in src/model/admin-roles.js.
   Kept in this browser until the back end exists ('signel.members', 'signel.admin.users'),
   in the shapes the back end will use. */
(function () {
  'use strict';
  var A = window.SignelAdmin; if (!A) return;
  var $ = A.$, $$ = A.$$, esc = A.esc;
  var CLASSES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
  var MEMBERS = 'signel.members';
  var when = function (iso) { return iso ? new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'; };

  /* ---------- Members ---------- */
  // An account is what the visitor entered at sign-up (the 'account' request) plus the review
  // kept here: { email: { status: pending|approved|refused, cls, at, by, note } }.
  function reviews() { return A.store.get(MEMBERS, {}); }
  function members() {
    var rv = reviews(), seen = {}, out = [];
    A.requests().filter(function (r) { return r.type === 'account'; }).forEach(function (r) {
      var c = (r.data || {}).customer || {}, k = (c.email || r.id).toLowerCase();
      if (seen[k]) return; seen[k] = true;
      out.push(Object.assign({ key: k, applied: r.at, example: !!r.example, request: r.id }, c, rv[k] || { status: 'pending' }));
    });
    // the account signed in on this browser, if it never went through the sign-up form
    var acc = A.store.get('signel.account', null);
    if (acc && acc.email && !seen[acc.email.toLowerCase()]) out.push(Object.assign({ key: acc.email.toLowerCase(), applied: null }, acc, rv[acc.email.toLowerCase()] || { status: acc.status || 'approved', cls: acc.cls || 'P1' }));
    return out.sort(function (a, b) { return (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || String(b.applied).localeCompare(String(a.applied)); });
  }
  var STATUS = { pending: ['To review', 'amber'], approved: ['Approved', 'green'], refused: ['Refused', 'gray'] };
  var chip = function (st) { var s = STATUS[st] || STATUS.pending; return '<em class="ad-chip ad-chip--' + s[1] + '">' + s[0] + '</em>'; };
  window.SignelMembers = { statusOf: function (email) { var m = email && reviews()[email.toLowerCase()]; return m ? (m.status === 'approved' ? 'Approved · ' + m.cls : STATUS[m.status][0]) : null; } };

  function review(key, patch) {
    var rv = reviews();
    rv[key] = Object.assign({ status: 'pending' }, rv[key] || {}, patch, { at: new Date().toISOString(), by: A.me.email });
    A.store.set(MEMBERS, rv);
    // demo: the account on this browser follows the review; the back end will update the real one
    var acc = A.store.get('signel.account', null);
    if (acc && acc.email && acc.email.toLowerCase() === key) {
      acc.status = rv[key].status === 'approved' ? 'approved' : 'pending'; if (rv[key].cls) acc.cls = rv[key].cls;
      A.store.set('signel.account', acc);
    }
    A.badges();
  }

  var MF = { status: 'pending', q: '' };
  function showMembers(args) {
    var open = args && args[0] ? decodeURIComponent(args[0]).toLowerCase() : null;
    var all = members();
    if (open) MF.status = 'all';
    var counts = { pending: 0, approved: 0, refused: 0 }; all.forEach(function (m) { counts[m.status] = (counts[m.status] || 0) + 1; });
    A.view.innerHTML = '<div class="ad-page ad-page--wide"><div class="ad-head"><div><h1>Members</h1><p class="ad-muted">Customer accounts. Each new account waits here until it is approved and given its price class (P1 to P7); until then the customer sees no prices.</p></div>' +
      '<div class="ad-head-tools"><div class="ad-chips" role="group" aria-label="Status">' +
      [['pending', 'To review'], ['approved', 'Approved'], ['refused', 'Refused'], ['all', 'All']].map(function (x) { return '<button type="button" class="ad-chip-btn' + (MF.status === x[0] ? ' on' : '') + '" data-mf="' + x[0] + '">' + x[1] + (x[0] !== 'all' ? ' <small>' + (counts[x[0]] || 0) + '</small>' : '') + '</button>'; }).join('') + '</div>' +
      '<label class="ad-search ad-search--in"><input type="search" placeholder="Find a customer" value="' + esc(MF.q) + '" data-mq></label></div></div>' +
      '<div data-mlist></div></div>' +
      '<div class="ad-drawer-scrim" data-drawer-scrim hidden></div><aside class="ad-drawer" data-drawer aria-hidden="true" tabindex="-1"></aside>';
    $$('[data-mf]', A.view).forEach(function (b) { b.addEventListener('click', function () { MF.status = b.getAttribute('data-mf'); showMembers(); }); });
    $('[data-mq]', A.view).addEventListener('input', function (e) { MF.q = e.target.value; paint(); });
    $('[data-drawer-scrim]').addEventListener('click', close);
    paint();
    if (open) openMember(open);
  }
  function paint() {
    var box = $('[data-mlist]'); if (!box) return;
    var all = members(), q = A.norm(MF.q);
    if (!all.length) {
      box.innerHTML = '<div class="ad-empty-state">' + A.ICON.inbox + '<h2>No accounts yet</h2><p>Accounts created on the website appear here for review. Until the back end is connected, only those created in this browser show.</p><button type="button" class="ad-btn" data-mex>Add example accounts to try it</button></div>';
      $('[data-mex]').addEventListener('click', function () {
        var t = function (h) { return new Date(Date.now() - h * 3600000).toISOString(); };
        A.saveRequests(A.requests().concat([
          { id: 'mx1', example: true, type: 'account', status: 'new', at: t(3), data: { customer: { name: 'Example buyer', company: 'Example municipality', email: 'buyer@example.com', phone: '(450) 555-0101', type: 'City or municipality', customer: 'yes', customer_no: 'C-1042' } } },
          { id: 'mx2', example: true, type: 'account', status: 'new', at: t(30), data: { customer: { name: 'Example contractor', company: 'Example construction', email: 'contractor@example.com', type: 'Construction', customer: 'no' } } }
        ]));
        showMembers();
      });
      return;
    }
    var list = all.filter(function (m) { return (MF.status === 'all' || m.status === MF.status) && (!q || A.norm([m.name, m.company, m.email, m.customer_no].join(' ')).indexOf(q) >= 0); });
    box.innerHTML = list.length ? '<div class="ad-card ad-card--flush"><table class="ad-table"><thead><tr><th>Customer</th><th>Type</th><th>Applied</th><th>Status</th><th>Class</th></tr></thead><tbody>' + list.map(function (m) {
      return '<tr data-open-m="' + esc(m.key) + '" tabindex="0"><td><b>' + esc(m.company || m.name || m.email) + '</b><small>' + esc([m.name, m.email].filter(Boolean).join(' · ')) + '</small></td><td>' + esc(m.type || '—') + (m.customer === 'yes' ? '<small>Existing customer' + (m.customer_no ? ' · ' + esc(m.customer_no) : '') + '</small>' : '') + '</td><td>' + when(m.applied) + '</td><td>' + chip(m.status) + (m.example ? ' <em class="ad-chip">Example</em>' : '') + '</td><td>' + (m.status === 'approved' ? '<b>' + esc(m.cls || 'P1') + '</b>' : '—') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<p class="ad-muted">No account matches.</p>';
    $$('[data-open-m]', box).forEach(function (r) {
      r.addEventListener('click', function () { openMember(r.getAttribute('data-open-m')); });
      r.addEventListener('keydown', function (e) { if (e.key === 'Enter') openMember(r.getAttribute('data-open-m')); });
    });
  }
  function openMember(key) {
    var m = members().filter(function (x) { return x.key === key; })[0], dr = $('[data-drawer]'); if (!m || !dr) return;
    var rows = [['Email', m.email, m.email ? 'mailto:' + m.email : ''], ['Phone', m.phone], ['Company', m.company], ['Type', m.type], ['Role', m.position], ['Address', m.address],
      ['Existing customer', m.customer === 'yes' ? 'Yes' + (m.customer_no ? ', no. ' + m.customer_no : '') : m.customer === 'no' ? 'No' : ''], ['Newsletter', m.news ? 'Yes' : '']].filter(function (x) { return x[1]; });
    dr.innerHTML = '<header class="ad-drawer-head"><div>' + chip(m.status) + '<h2>' + esc(m.company || m.name || m.email) + '</h2><small class="ad-muted">' + esc(m.name || '') + (m.applied ? ' · applied ' + when(m.applied) : '') + '</small></div><button type="button" class="ad-icon-btn" data-dclose aria-label="Close">' + A.ICON.x + '</button></header>' +
      '<div class="ad-drawer-body"><dl class="ad-dl">' + rows.map(function (x) { return '<div><dt>' + x[0] + '</dt><dd>' + (x[2] ? '<a href="' + esc(x[2]) + '">' + esc(x[1]) + '</a>' : esc(x[1])) + '</dd></div>'; }).join('') + '</dl>' +
      (m.message ? '<h3>Their message</h3><blockquote>' + esc(m.message) + '</blockquote>' : '') +
      '<h3>Review</h3><div class="ad-review' + (m.status === 'approved' ? ' is-done' : '') + '">' +
      (m.status === 'approved' ? '<p><b>Approved, class ' + esc(m.cls) + '</b>' + (m.at ? ' <small class="ad-muted">' + when(m.at) + (m.by ? ' by ' + esc(m.by) : '') + '</small>' : '') + '</p>'
        : m.status === 'refused' ? '<p><b>Refused</b>' + (m.note ? ': ' + esc(m.note) : '') + '</p>' : '<p class="ad-muted">Choose the price class this customer gets. They see their prices as soon as the account is approved.</p>') +
      '<div class="ad-review-row"><label><span>Price class</span><select class="ad-input" data-cls>' + CLASSES.map(function (k) { return '<option' + ((m.cls || 'P1') === k ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '</select></label>' +
      '<button type="button" class="ad-btn ad-btn--primary" data-approve>' + (m.status === 'approved' ? 'Change class' : 'Approve account') + '</button>' +
      (m.status !== 'refused' ? '<button type="button" class="ad-btn" data-refuse>' + (m.status === 'approved' ? 'Suspend' : 'Refuse') + '</button>' : '') + '</div></div>' +
      '<p class="ad-muted ad-small">At launch, approving or refusing also emails the customer.</p></div>' +
      '<footer class="ad-drawer-foot">' + (m.email ? '<a class="ad-btn ad-btn--primary" href="mailto:' + esc(m.email) + '?subject=' + encodeURIComponent('Your Signel account') + '">Email ' + esc((m.name || m.email).split(' ')[0]) + '</a>' : '') + '</footer>';
    dr.setAttribute('aria-hidden', 'false'); dr.classList.add('on'); $('[data-drawer-scrim]').hidden = false; dr.focus();
    dr.onclick = function (e) {
      if (e.target.closest('[data-dclose]')) return close();
      if (e.target.closest('[data-approve]')) { var cls = $('[data-cls]', dr).value; review(key, { status: 'approved', cls: cls }); A.toast('Approved in class ' + cls + '.'); paint(); openMember(key); return; }
      if (e.target.closest('[data-refuse]')) {
        var why = prompt('Why? (kept with the account; optional)', '') ; if (why === null) return;
        review(key, { status: 'refused', note: why }); A.toast('Account refused.'); paint(); openMember(key);
      }
    };
  }
  function close() { var dr = $('[data-drawer]'); if (!dr) return; dr.classList.remove('on'); dr.setAttribute('aria-hidden', 'true'); var s = $('[data-drawer-scrim]'); if (s) s.hidden = true; }

  A.section('members', {
    show: showMembers,
    badge: function () { return members().filter(function (m) { return m.status === 'pending'; }).length; },
    tiles: function () {
      var n = members().filter(function (m) { return m.status === 'pending'; }).length;
      return [A.tile('members', '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/></svg>', 'Accounts to review', n, n ? 'Approve them with their class' : 'All reviewed', n ? 'blue' : '')];
    }
  });

  /* ---------- Users: staff and their role (Administration) ----------
     With the back end, these are the real accounts (backend/data/staff.json): a new user and
     a new password come with a password shown once, to hand over. Without it (the demo), the
     list is kept in this browser and everyone signs in with the demo password. */
  function showUsers() {
    if (A.backend()) {
      A.view.innerHTML = '<div class="ad-page"><div class="ad-loading">Loading the users…</div></div>';
      A.api('GET', 'staff').then(function (d) { drawUsers(d.staff, true); }).catch(function (e) { A.view.innerHTML = '<div class="ad-page"><p class="ad-bad">' + esc(e.message) + '</p></div>'; });
    } else drawUsers(A.staff(), false);
  }
  // a password to hand over, shown once
  function handOver(u, pw) {
    var box = $('[data-upw]', A.view);
    box.innerHTML = '<div class="ad-card ad-pwcard"><h2>Password for ' + esc(u.name) + '</h2><p class="ad-muted">Give it to ' + esc(u.name) + ' (' + esc(u.email) + '). It is shown only now; they change it after signing in (the key next to their name).</p><p class="ad-pw"><code>' + esc(pw) + '</code></p></div>';
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function drawUsers(list, server) {
    var roles = A.roles;
    var sections = JSON.parse($('#admin-access').textContent).sections;
    A.view.innerHTML = '<div class="ad-page"><div class="ad-head"><div><h1>Users</h1><p class="ad-muted">The staff who sign in to this dashboard and what each one can open. ' +
      (server ? 'Each person has their own password; a new user gets one here, to hand over.' : 'This is the demo dashboard: the list is kept in this browser and everyone signs in with the demo password.') + '</p></div></div>' +
      '<div data-upw></div>' +
      '<div class="ad-card ad-card--flush"><table class="ad-table ad-users"><thead><tr><th>Person</th><th>Role</th><th>Access</th><th></th></tr></thead><tbody>' + list.map(function (u, i) {
        var self = u.email === A.me.email;
        return '<tr' + (u.active ? '' : ' class="is-off"') + '><td><b>' + esc(u.name) + (self ? ' <em class="ad-chip">You</em>' : '') + '</b><small>' + esc(u.email) + (server && !u.changedAt ? ' · has not chosen a password yet' : '') + '</small></td>' +
          '<td><select class="ad-input" data-urole="' + i + '"' + (self ? ' disabled title="You cannot change your own role"' : '') + '>' + Object.keys(roles).map(function (k) { return '<option value="' + k + '"' + (u.role === k ? ' selected' : '') + '>' + esc(roles[k].label) + '</option>'; }).join('') + '</select></td>' +
          '<td><label class="ad-switch"><input type="checkbox" data-uactive="' + i + '"' + (u.active ? ' checked' : '') + (self ? ' disabled' : '') + '><span></span>' + (u.active ? 'Can sign in' : 'Switched off') + '</label></td>' +
          '<td><div class="ad-user-acts">' + (server && !self ? '<button type="button" class="ad-btn" data-upass="' + i + '">New password</button>' : '') + (self ? '' : '<button type="button" class="ad-icon-btn" data-udel="' + i + '" title="Remove" aria-label="Remove">' + A.ICON.x + '</button>') + '</div></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<form class="ad-card ad-user-add" data-uadd><h2>Add a user</h2><div class="ad-user-add-row">' +
      '<label><span>Name</span><input class="ad-input" name="name" required></label><label><span>Work email</span><input class="ad-input" name="email" type="email" required></label>' +
      '<label><span>Role</span><select class="ad-input" name="role">' + Object.keys(roles).map(function (k) { return '<option value="' + k + '">' + esc(roles[k].label) + '</option>'; }).join('') + '</select></label>' +
      '<button type="submit" class="ad-btn ad-btn--primary">Add user</button></div></form>' +
      '<div class="ad-card"><h2>What each role opens</h2><div class="ad-roles">' + Object.keys(roles).map(function (k) {
        return '<div class="ad-role"><b>' + esc(roles[k].label) + '</b><small>' + esc(roles[k].hint) + '</small><ul>' + sections.filter(function (s) { return s.roles.indexOf(k) >= 0; }).map(function (s) { return '<li>' + esc(s.label) + '</li>'; }).join('') + '</ul></div>';
      }).join('') + '</div></div></div>';
    // the same actions on either store
    var op = server ? {
      patch: function (u, ch, done) { A.api('PATCH', 'staff/' + encodeURIComponent(u.email), ch).then(function (d) { done && done(d); if (!(d && d.password)) showUsers(); }).catch(function (e) { A.toast(e.message); showUsers(); }); },
      remove: function (u) { A.api('DELETE', 'staff/' + encodeURIComponent(u.email)).then(showUsers).catch(function (e) { A.toast(e.message); }); },
      add: function (u) { A.api('POST', 'staff', u).then(function (d) { A.api('GET', 'staff').then(function (x) { drawUsers(x.staff, true); handOver(d.user, d.password); }); A.toast('User added.'); }).catch(function (e) { A.toast(e.message); }); }
    } : {
      patch: function (u, ch) { var l = A.staff(); Object.assign(l.filter(function (x) { return x.email === u.email; })[0], ch); A.store.set(A.USERS, l); showUsers(); },
      remove: function (u) { A.store.set(A.USERS, A.staff().filter(function (x) { return x.email !== u.email; })); showUsers(); },
      add: function (u) { var l = A.staff(); if (l.some(function (x) { return x.email.toLowerCase() === u.email; })) { A.toast('That email already has an account.'); return; } l.push(Object.assign({ active: true }, u)); A.store.set(A.USERS, l); showUsers(); A.toast('User added.'); }
    };
    $$('[data-urole]', A.view).forEach(function (sel) { sel.addEventListener('change', function () { op.patch(list[+sel.getAttribute('data-urole')], { role: sel.value }); A.toast('Role changed.'); }); });
    $$('[data-uactive]', A.view).forEach(function (cb) { cb.addEventListener('change', function () { op.patch(list[+cb.getAttribute('data-uactive')], { active: cb.checked }); }); });
    $$('[data-udel]', A.view).forEach(function (b) { b.addEventListener('click', function () { var u = list[+b.getAttribute('data-udel')]; if (!confirm('Remove ' + u.name + '? They will not be able to sign in.')) return; op.remove(u); }); });
    $$('[data-upass]', A.view).forEach(function (b) { b.addEventListener('click', function () {
      var u = list[+b.getAttribute('data-upass')]; if (!confirm('Give ' + u.name + ' a new password? The current one stops working.')) return;
      op.patch(u, { resetPassword: true }, function (d) { handOver(u, d.password); });
    }); });
    $('[data-uadd]', A.view).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      op.add({ name: f.name.value.trim(), email: f.email.value.trim().toLowerCase(), role: f.role.value });
    });
  }
  A.section('users', { show: showUsers });
})();
