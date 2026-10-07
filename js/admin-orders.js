/* Signel Services — dashboard: Orders (plugs into src/js/admin.js). Every cart sent from the
   website is an order (src/js/shop.js placeOrder): paid by card online, or invoiced by Signel.
   Delivery follows Signel's transport rules:
     carrier  the customer's carrier and account number; Signel arranges it, at their cost
     pickup   customer pickup, carrier pickup, immediate pickup (+ fee) or Signel installation;
              the customer is told when the order is ready
     billed   delivery calculated per order and billed on a second invoice
   Kept in this browser ('signel.orders') until the back end exists, in the same shape. */
(function () {
  'use strict';
  var A = window.SignelAdmin; if (!A) return;
  var $ = A.$, $$ = A.$$, esc = A.esc;
  var ORDERS = 'signel.orders';
  var STATUSES = [['new', 'New'], ['confirmed', 'Confirmed'], ['preparing', 'Preparing'], ['ready', 'Ready / shipped'], ['completed', 'Completed']];
  var TONE = { new: 'blue', confirmed: 'violet', preparing: 'amber', ready: 'green', completed: 'ok', cancelled: 'gray' };
  var PICKUP = { client: 'Customer pickup', carrier: 'Pickup by their carrier', immediate: 'Immediate pickup (+ fee)', install: 'Installation by Signel' };
  var orders = function () { return A.store.get(ORDERS, []); };
  var put = function (list) { A.store.set(ORDERS, list); A.badges(); };
  var cad = function (n) { return n == null ? 'To quote' : A.money(n); };
  var when = function (iso) { return new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }); };
  var statusLabel = function (s) { var x = STATUSES.filter(function (y) { return y[0] === s; })[0]; return x ? x[1] : s === 'cancelled' ? 'Cancelled' : s; };
  var chip = function (text, tone) { return '<em class="ad-chip ad-chip--' + tone + '">' + esc(text) + '</em>'; };
  function payChip(o) { var p = o.payment || {}; return p.status === 'paid' ? chip(p.method === 'card' ? 'Paid by card' : 'Paid', 'green') : p.status === 'invoiced' ? chip('Invoiced', 'blue') : chip('To invoice', 'amber'); }
  function deliveryText(o) { var d = o.delivery || {}; return d.method === 'carrier' ? 'Their carrier: ' + d.carrier : d.method === 'pickup' ? PICKUP[d.pickup] || 'Pickup' : 'Delivery billed separately'; }
  function transportDue(o) { return o.status !== 'cancelled' && (o.delivery || {}).method === 'billed' && !(o.transport && o.transport.sentAt); }
  function deliveryChip(o) {
    var d = o.delivery || {};
    if (d.method === 'billed') return chip(o.transport && o.transport.paidAt ? 'Transport paid' : o.transport && o.transport.sentAt ? '2nd invoice sent' : '2nd invoice to send', o.transport && o.transport.sentAt ? 'blue' : 'amber');
    return chip(d.method === 'carrier' ? d.carrier : 'Pickup', 'gray');
  }
  function log(o, text) { (o.history = o.history || []).push({ at: new Date().toISOString(), by: A.me.email, text: text }); }
  function update(id, fn) { var all = orders(); all.forEach(function (o) { if (o.id === id) fn(o); }); put(all); }
  var items = function (o) { return o.lines.reduce(function (n, l) { return n + l.qty; }, 0); };

  var OF = { status: 'open', pay: '', q: '' };
  function show(args) {
    var all = orders();
    A.view.innerHTML = '<div class="ad-page ad-page--wide"><div class="ad-head"><div><h1>Orders</h1><p class="ad-muted">Every cart sent from the website. Paid by card online, or invoiced by your team; delivery as the customer chose it.</p></div>' +
      '<div class="ad-head-tools"><div class="ad-chips" role="group" aria-label="Status">' +
      [['open', 'Open'], ['new', 'New'], ['ready', 'Ready / shipped'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['all', 'All']].map(function (x) { return '<button type="button" class="ad-chip-btn' + (OF.status === x[0] ? ' on' : '') + '" data-of="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<div class="ad-chips" role="group" aria-label="Payment">' + [['', 'Any payment'], ['card', 'Paid by card'], ['invoice', 'To invoice'], ['transport', '2nd invoice to send']].map(function (x) { return '<button type="button" class="ad-chip-btn' + (OF.pay === x[0] ? ' on' : '') + '" data-op="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<label class="ad-search ad-search--in"><input type="search" placeholder="Order, customer or PO" value="' + esc(OF.q) + '" data-oq></label></div></div>' +
      '<div data-olist></div></div><div class="ad-drawer-scrim" data-drawer-scrim hidden></div><aside class="ad-drawer ad-drawer--wide" data-drawer aria-hidden="true" tabindex="-1"></aside>';
    $$('[data-of]', A.view).forEach(function (b) { b.addEventListener('click', function () { OF.status = b.getAttribute('data-of'); show(); }); });
    $$('[data-op]', A.view).forEach(function (b) { b.addEventListener('click', function () { OF.pay = b.getAttribute('data-op'); show(); }); });
    $('[data-oq]', A.view).addEventListener('input', function (e) { OF.q = e.target.value; paint(); });
    $('[data-drawer-scrim]').addEventListener('click', close);
    paint();
    if (args && args[0]) open(decodeURIComponent(args[0]));
  }
  function paint() {
    var box = $('[data-olist]'); if (!box) return;
    var all = orders(), q = A.norm(OF.q);
    if (!all.length) {
      box.innerHTML = '<div class="ad-empty-state">' + A.ICON.inbox + '<h2>No orders yet</h2><p>Orders sent from the website\'s cart appear here. Until the back end is connected, only those sent from this browser show.</p><button type="button" class="ad-btn" data-oex>Add example orders to try it</button></div>';
      $('[data-oex]').addEventListener('click', function () { put(examples()); show(); });
      return;
    }
    var list = all.filter(function (o) {
      var st = OF.status === 'all' || (OF.status === 'open' ? ['completed', 'cancelled'].indexOf(o.status) < 0 : o.status === OF.status);
      var pay = !OF.pay || (OF.pay === 'card' ? o.payment.method === 'card' : OF.pay === 'invoice' ? o.payment.method === 'invoice' && o.payment.status !== 'paid' : transportDue(o));
      return st && pay && (!q || A.norm([o.number, o.customer.company, o.customer.name, o.customer.email, o.po].join(' ')).indexOf(q) >= 0);
    });
    box.innerHTML = list.length ? '<div class="ad-card ad-card--flush"><table class="ad-table ad-orders"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Delivery</th><th>Status</th></tr></thead><tbody>' + list.map(function (o) {
      return '<tr data-open-o="' + esc(o.id) + '" tabindex="0"><td><b>' + esc(o.number) + '</b>' + (o.example ? ' <em class="ad-chip">Example</em>' : '') + '<small>' + when(o.at) + '</small></td>' +
        '<td><b>' + esc(o.customer.company || o.customer.name || o.customer.email) + '</b><small>' + esc([o.customer.name, o.customer.cls ? 'class ' + o.customer.cls : o.customer.account ? '' : 'no account'].filter(Boolean).join(' · ')) + '</small></td>' +
        '<td>' + A.plural(items(o), 'item', 'items') + '<small>' + A.plural(o.lines.length, 'line', 'lines') + '</small></td><td>' + cad(o.subtotal) + '</td><td>' + payChip(o) + '</td><td>' + deliveryChip(o) + '<small>' + esc(deliveryText(o)) + '</small></td><td>' + chip(statusLabel(o.status), TONE[o.status] || 'gray') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<p class="ad-muted">No order matches.</p>';
    $$('[data-open-o]', box).forEach(function (r) {
      r.addEventListener('click', function () { open(r.getAttribute('data-open-o')); });
      r.addEventListener('keydown', function (e) { if (e.key === 'Enter') open(r.getAttribute('data-open-o')); });
    });
  }
  function open(id) {
    var o = orders().filter(function (x) { return x.id === id; })[0], dr = $('[data-drawer]'); if (!o || !dr) return;
    var c = o.customer, d = o.delivery || {}, p = o.payment || {}, tr = o.transport || {};
    var contact = [['Email', c.email, c.email ? 'mailto:' + c.email : ''], ['Phone', c.phone, c.phone ? 'tel:' + String(c.phone).replace(/[^\d+]/g, '') : ''], ['Company', c.company], ['Price class', c.cls], ['Account', c.account ? 'Yes' : 'Ordered without an account'], ['PO / reference', o.po]].filter(function (x) { return x[1]; });
    var done = STATUSES.map(function (s) { return s[0]; }).indexOf(o.status);
    // what the team does next for this delivery
    var delivery = d.method === 'carrier'
      ? '<dl class="ad-dl"><div><dt>Carrier</dt><dd>' + esc(d.carrier) + '</dd></div><div><dt>Their account no.</dt><dd>' + esc(d.account) + '</dd></div></dl>' +
        '<div class="ad-review-row"><label><span>Tracking number</span><input class="ad-input" data-track value="' + esc(o.tracking || '') + '"></label><button type="button" class="ad-btn" data-save-track>Save</button></div>'
      : d.method === 'pickup'
        ? '<p><b>' + esc(PICKUP[d.pickup] || 'Pickup') + '</b></p><p class="ad-muted">The customer is told when the order is ready.' + (o.notifiedAt ? ' Told on ' + when(o.notifiedAt) + '.' : '') + '</p>' +
          '<div class="ad-review-row"><a class="ad-btn ad-btn--primary" data-notify href="mailto:' + esc(c.email || '') + '?subject=' + encodeURIComponent('Votre commande ' + o.number + ' est prête / Your order ' + o.number + ' is ready') + '">Tell the customer it is ready</a></div>'
        : '<p><b>Delivery billed separately</b>: calculate it by region and weight, then send the second invoice.</p>' +
          (tr.sentAt ? '<p>' + chip('Second invoice sent', 'blue') + ' ' + A.money(tr.amount) + ' on ' + when(tr.sentAt) + (tr.paidAt ? ' · ' + chip('Paid', 'green') : '') + '</p>' +
            (tr.paidAt ? '' : '<div class="ad-review-row"><button type="button" class="ad-btn" data-tr-paid>Mark the transport paid</button></div>')
          : '<div class="ad-review-row"><label><span>Transport amount ($)</span><input class="ad-input" type="number" min="0" step="0.01" data-tr-amount></label><button type="button" class="ad-btn ad-btn--primary" data-tr-sent>Record the second invoice as sent</button></div>');
    var payment = p.method === 'card'
      ? '<p>' + payChip(o) + ' ' + (o.subtotal != null ? A.money(o.subtotal) : '') + ' online' + (d.method === 'billed' ? '; delivery comes on the second invoice.' : '.') + '</p>'
      : '<p>' + payChip(o) + ' Invoiced by your team.</p><div class="ad-review-row">' + (p.status === 'to_invoice' ? '<button type="button" class="ad-btn" data-pay="invoiced">Mark invoiced</button>' : '') + (p.status !== 'paid' ? '<button type="button" class="ad-btn" data-pay="paid">Mark paid</button>' : '') + '</div>';
    dr.innerHTML = '<header class="ad-drawer-head"><div>' + chip(statusLabel(o.status), TONE[o.status] || 'gray') + (o.example ? ' <em class="ad-chip">Example</em>' : '') + '<h2>Order ' + esc(o.number) + '</h2><small class="ad-muted">' + when(o.at) + ' · ' + esc(c.company || c.name || '') + '</small></div><button type="button" class="ad-icon-btn" data-dclose aria-label="Close">' + A.ICON.x + '</button></header>' +
      '<div class="ad-drawer-body">' +
      (o.status === 'cancelled' ? '<p class="ad-muted">This order is cancelled.</p>' : '<div class="ad-steps">' + STATUSES.map(function (s, i) { return '<button type="button" class="' + (i < done ? 'is-done' : i === done ? 'is-on' : '') + '" data-ostatus="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div>') +
      '<dl class="ad-dl">' + contact.map(function (x) { return '<div><dt>' + x[0] + '</dt><dd>' + (x[2] ? '<a href="' + esc(x[2]) + '">' + esc(x[1]) + '</a>' : esc(x[1])) + '</dd></div>'; }).join('') + '</dl>' +
      '<h3>Items</h3><ul class="ad-lines">' + o.lines.map(function (l) {
        return '<li>' + (l.img ? '<img src="' + esc(A.ROOT + l.img) + '" alt="">' : '<span class="ad-thumb ad-thumb--none">' + A.ICON.pic + '</span>') + '<span><b>' + l.qty + ' × ' + esc(l.name) + '</b><small>' + esc([l.sku].concat((l.opts || []).map(function (x) { return x[0] + ': ' + x[1]; })).filter(Boolean).join(' · ')) + '</small></span>' + (l.unit != null ? '<em>' + A.money(l.unit * l.qty) + '</em>' : '<em class="ad-muted">' + (l.rental ? 'Rental, to quote' : 'To quote') + '</em>') + '</li>';
      }).join('') + '</ul>' + (o.subtotal != null ? '<p class="ad-total">Subtotal: <b>' + A.money(o.subtotal) + '</b> <span class="ad-muted">before taxes and delivery</span></p>' : '') +
      '<h3>Delivery</h3><div class="ad-review">' + delivery + '</div>' +
      '<h3>Payment</h3><div class="ad-review">' + payment + '</div>' +
      (o.note ? '<h3>Customer\'s note</h3><blockquote>' + esc(o.note) + '</blockquote>' : '') +
      '<h3>Internal notes</h3><ul class="ad-notes">' + (o.notes || []).map(function (n) { return '<li><p>' + esc(n.text) + '</p><small>' + when(n.at) + (n.by ? ' · ' + esc(n.by) : '') + '</small></li>'; }).join('') + '</ul>' +
      '<div class="ad-note-add"><textarea class="ad-input" rows="2" placeholder="Called the customer, weight confirmed, PO received…" data-onote></textarea><button type="button" class="ad-btn" data-onote-add>Add note</button></div>' +
      ((o.history || []).length ? '<h3>History</h3><ul class="ad-history">' + o.history.slice().reverse().map(function (h) { return '<li><b>' + esc(h.text) + '</b><small>' + when(h.at) + (h.by ? ' · ' + esc(h.by) : '') + '</small></li>'; }).join('') + '</ul>' : '') +
      '</div><footer class="ad-drawer-foot">' + (c.email ? '<a class="ad-btn ad-btn--primary" href="mailto:' + esc(c.email) + '?subject=' + encodeURIComponent('Commande / Order ' + o.number) + '">Email ' + esc((c.name || c.email).split(' ')[0]) + '</a>' : '') +
      (o.status !== 'cancelled' && o.status !== 'completed' ? '<button type="button" class="ad-btn ad-btn--danger-ghost" data-cancel>Cancel the order</button>' : '') + '</footer>';
    dr.setAttribute('aria-hidden', 'false'); dr.classList.add('on'); $('[data-drawer-scrim]').hidden = false; dr.focus();
    var redo = function (msg) { paint(); open(id); if (msg) A.toast(msg); };
    dr.onclick = function (e) {
      var t = e.target;
      if (t.closest('[data-dclose]')) return close();
      var s = t.closest('[data-ostatus]');
      if (s) { var to = s.getAttribute('data-ostatus'); update(id, function (x) { if (x.status !== to) { x.status = to; log(x, 'Status: ' + statusLabel(to)); } }); return redo(); }
      if (t.closest('[data-cancel]')) { if (!confirm('Cancel order ' + o.number + '?')) return; update(id, function (x) { x.status = 'cancelled'; log(x, 'Cancelled'); }); return redo('Order cancelled.'); }
      var py = t.closest('[data-pay]');
      if (py) { var st = py.getAttribute('data-pay'); update(id, function (x) { x.payment.status = st; log(x, st === 'paid' ? 'Payment received' : 'Invoice sent'); }); return redo(); }
      if (t.closest('[data-tr-sent]')) {
        var amt = parseFloat(($('[data-tr-amount]', dr) || {}).value);
        if (!(amt >= 0)) { A.toast('Enter the transport amount first.'); return; }
        update(id, function (x) { x.transport = { amount: amt, sentAt: new Date().toISOString() }; log(x, 'Second invoice (transport) sent: ' + A.money(amt)); });
        return redo('Second invoice recorded.');
      }
      if (t.closest('[data-tr-paid]')) { update(id, function (x) { x.transport.paidAt = new Date().toISOString(); log(x, 'Transport paid'); }); return redo(); }
      if (t.closest('[data-notify]')) { update(id, function (x) { x.notifiedAt = new Date().toISOString(); if (['new', 'confirmed', 'preparing'].indexOf(x.status) >= 0) x.status = 'ready'; log(x, 'Customer told the order is ready'); }); setTimeout(function () { redo(); }, 50); return; }
      if (t.closest('[data-save-track]')) { var tk = $('[data-track]', dr).value.trim(); update(id, function (x) { x.tracking = tk; log(x, 'Tracking number: ' + tk); }); return redo('Saved.'); }
      if (t.closest('[data-onote-add]')) { var ta = $('[data-onote]', dr); if (!ta.value.trim()) return; update(id, function (x) { (x.notes = x.notes || []).push({ at: new Date().toISOString(), by: A.me.email, text: ta.value.trim() }); }); return redo(); }
    };
  }
  function close() { var dr = $('[data-drawer]'); if (!dr) return; dr.classList.remove('on'); dr.setAttribute('aria-hidden', 'true'); var s = $('[data-drawer-scrim]'); if (s) s.hidden = true; }

  // a few orders marked "Example", one per delivery choice, to try the section
  function examples() {
    var pick = function (q) { return A.products().filter(function (p) { return A.norm(p.name).indexOf(q) >= 0; })[0] || A.products()[0]; };
    var line = function (p, qty, unit) { return { id: p.id, sku: p.sku, name: p.name, url: p.url, img: (p.images || [])[0] || '', qty: qty, opts: [], unit: unit, rental: false }; };
    var t = function (h) { return new Date(Date.now() - h * 3600000).toISOString(); };
    return [
      { id: 'EX-1', number: 'W-EX-1', example: true, at: t(2), status: 'new', customer: { name: 'Example buyer', company: 'Example municipality', email: 'buyer@example.com', phone: '(450) 555-0101', cls: 'P2', account: true },
        lines: [line(pick('cone'), 50, 18.5)], subtotal: 925, delivery: { method: 'billed' }, payment: { method: 'card', status: 'paid' }, po: 'PO-2291' },
      { id: 'EX-2', number: 'W-EX-2', example: true, at: t(26), status: 'confirmed', customer: { name: 'Example contractor', company: 'Example construction', email: 'contractor@example.com', account: true, cls: 'P1' },
        lines: [line(pick('rad62'), 1, null)], subtotal: null, delivery: { method: 'carrier', carrier: 'Purolator', account: '4471-220' }, payment: { method: 'invoice', status: 'to_invoice' } },
      { id: 'EX-3', number: 'W-EX-3', example: true, at: t(50), status: 'preparing', customer: { name: 'Example guest', email: 'guest@example.com', phone: '(514) 555-0199', account: false },
        lines: [line(pick('stop'), 4, null)], subtotal: null, delivery: { method: 'pickup', pickup: 'client' }, payment: { method: 'invoice', status: 'to_invoice' } }
    ];
  }

  A.section('orders', {
    show: show,
    badge: function () { return orders().filter(function (o) { return o.status === 'new'; }).length; },
    tiles: function () {
      var all = orders(), fresh = all.filter(function (o) { return o.status === 'new'; }).length, due = all.filter(transportDue).length;
      var bag = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>';
      var truck = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>';
      return [A.tile('orders', bag, 'New orders', fresh, fresh ? 'To confirm' : 'None waiting', fresh ? 'blue' : ''),
              A.tile('orders', truck, 'Transport to invoice', due, due ? 'Second invoices to send' : 'All sent', due ? 'warn' : '')];
    },
    cards: function () {
      var all = orders().slice(0, 6);
      return ['<section class="ad-card"><div class="ad-card-head"><h2>Latest orders</h2><button type="button" class="ad-link" data-go="orders">All orders</button></div>' +
        (all.length ? '<ul class="ad-mini-list">' + all.map(function (o) {
          return '<li><button type="button" data-go="orders/' + esc(encodeURIComponent(o.id)) + '">' + payChip(o) + '<span class="ad-mini-t"><b>' + esc(o.number + ' · ' + (o.customer.company || o.customer.name || '')) + '</b><small>' + esc(cad(o.subtotal) + ' · ' + deliveryText(o)) + '</small></span><span class="ad-mini-s">' + chip(statusLabel(o.status), TONE[o.status] || 'gray') + '</span></button></li>';
        }).join('') + '</ul>' : '<p class="ad-muted">No orders yet.</p>') + '</section>'];
    }
  });
})();
