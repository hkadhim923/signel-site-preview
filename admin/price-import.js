// Reading the Excel price list back: which prices, quantity breaks and display choices
// changed, and what could not be read. Shared by the import tool (tools/price-sheet.mjs
// import) and the dashboard's Prices page, which loads this same file from
// /admin/price-import.js. No Node or browser APIs here.
//
//   checkPriceSheet(sheets, ref) -> { next, changes, cells, warnings, errors, read }
//     sheets  what readXlsx returns: [{ name, rows: [[...]] }]
//     ref     the price list as published: { rows: [{ kind, pid, vid, parent, child, name, options, qty,
//             prices: [P1..P7], code, note, breaks: [q2, q3] | null, display, source }] }
//             (src/model/price-sheet.js priceRows; /admin/price-list.json in the dashboard)
//     next    the new price list (data/prices/prix.json without its header):
//             { products, versions, quantities, breaks, display, sources, codes, notes }
//     changes one entry per row that changed: { code, name, options, cells: [{ cls, from, to }],
//             qty, breaks: { from, to } | null, display: { from, to } | null }
//
// The workbook has one tab per pricing source, because Signel prices three groups of
// products three ways:
//   general products   prices from Dynacom (the tab "Liste de prix", or "..._all")
//   road signs         the sign pricing generator (a tab whose name has "panneaux")
//   reflective sheeting a calculation (a tab whose name has "pellicule")
// A row can sit in the general tab and in its own source's tab (Signel keeps every product
// in the general list): the source's tab then gives its prices and quantity breaks, the
// general tab the rest (price category, Code SIGNEL, comment).
//
// A row is found by its ID version, else its ID produit, else its code (when only one row
// has it), so columns can be moved, rows sorted or filtered, and the ID columns even
// deleted. A WooCommerce export (ID, Sku, one column per price class) reads the same way.
// An empty class price takes the price of the class before it on the site. Rows left out of
// the file, and columns missing from it, keep their values.

export const SHEET_NAME = 'Liste de prix';
export const CLASS_NAMES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
export const HEAD = {
  family: 'Famille', parent: 'Code parent', code: 'Code SIGNEL', child: 'Code enfant', note: 'Regine Comment', kind: 'Type',
  name: 'Produit', options: 'Options', category: 'Catégorie', subcategory: 'Sous-catégorie', display: 'Price Category',
  qty: 'Quantité', q2: 'QTY2', q3: 'QTY3', pid: 'ID produit', vid: 'ID version'
};
// other names the same columns go by (Signel's own edits of the file)
const ALIASES = { note: ['regine comment', 'commentaire', 'comment', 'remarque'], display: ['price category', 'affichage du prix', 'categorie de prix'],
  code: ['code signel', 'code dynacom'], q2: ['qty2', 'q2', 'palier 2'], q3: ['qty3', 'q3', 'palier 3'] };
export const KIND = { parent: 'Parent (non vendu)', child: 'Enfant', item: 'Article', variant: 'Variante' };
// how each product's price is shown on the site, in the words of the Price Category column
export const DISPLAY = { show: 'show price', login: 'login to see price', quote: 'ask for quote', remove: 'remove from website' };
export const SOURCE = { dynacom: 'Dynacom', signs: 'Générateur de prix (panneaux)', sheeting: 'Calcul (pellicules)' };

const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const HEAD_FOLD = Object.fromEntries(Object.entries(HEAD).map(([k, v]) => [k, fold(v)]));
/** "P3", "Prix P3", "role_base_price_p3" -> 2; a lone "Prix" column (the first price list) is P1 */
const classOf = h => { const m = /(?:^| )p ?([1-7])$/.exec(h) || /^role .*([1-7])$/.exec(h); return m ? +m[1] - 1 : -1; };
const lonePrice = h => /^prix\b/.test(h) && !/[0-9]/.test(h);

/** Which source a tab prices: its name says so ("Liste de prix _ panneaux", "..._Pellicule"). */
export const sheetSource = name => (/panneau/.test(fold(name)) ? 'signs' : /pellicul/.test(fold(name)) ? 'sheeting' : 'general');

/** "show price", "Prix affiché", "login to see price", "ask for quote", "remove from website" -> show|login|quote|remove; "" -> ""; unreadable -> null */
export function readDisplay(v) {
  const t = fold(v);
  if (!t || t === '0') return '';
  if (/remove|retir|enlev/.test(t)) return 'remove';
  if (/quote|soumission|sur demande/.test(t)) return 'quote';
  if (/login|connexion|connect/.test(t)) return 'login';
  if (/show|affich|visible/.test(t)) return 'show';
  return null;
}

/** "1 234,50 $", "1,234.50", 1234.5 -> 1234.5; "" -> null; anything else -> NaN */
export function readPrice(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[\s  $]|CAD|CA/gi, '');
  if (!s || s === '-' || s === '—') return null;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');        // 1,234.50
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');  // 1.234,50
  s = s.replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** "1-24", "25 à 124", "125+" -> the same text tidied ("25-124", "125+"); "" -> ""; unreadable -> null */
export function readQty(v) {
  const t = String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return '';
  let m = /^(\d+) ?(?:-|–|à|a|to) ?(\d+)$/.exec(t);
  if (m && +m[2] >= +m[1]) return `${+m[1]}-${+m[2]}`;
  m = /^(\d+) ?(?:\+|et plus|and up|and more|ou plus)$/.exec(t);
  return m ? `${+m[1]}+` : null;
}

/** QTY2 and QTY3 -> [q2, q3] (tier 1: 1 to q2-1, tier 2: q2 to q3-1, tier 3: q3 and more); null when there are none; 'bad' when they do not make tiers */
export function readBreaks(a, b) {
  const n = v => { const x = readPrice(v); return x == null || x === 0 ? null : x; };
  const q2 = n(a), q3 = n(b);
  if (q2 == null && q3 == null) return null;
  if ([q2, q3].some(x => x != null && (Number.isNaN(x) || x !== Math.round(x) || x < 2))) return 'bad';
  if (q2 == null || (q3 != null && q3 <= q2)) return 'bad';
  return [q2, q3];
}

const round = n => Math.round(n * 100) / 100;
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
// a product's display from its rows: the most common; a tie goes to the more careful choice
const ORDER = ['remove', 'quote', 'login', 'show'];
const pick = list => {
  const n = {}; for (const d of list) n[d] = (n[d] || 0) + 1;
  return Object.keys(n).sort((a, b) => n[b] - n[a] || ORDER.indexOf(a) - ORDER.indexOf(b))[0] || '';
};

export function checkPriceSheet(sheets, ref) {
  const errors = [], warnings = [];
  const isHeader = r => (r || []).some(c => classOf(fold(c)) >= 0 || lonePrice(fold(c)));
  const headerAt = rows => rows.slice(0, 15).findIndex(isHeader);
  // every tab with price columns; the general one first, so a source's own tab speaks last
  const tabs = sheets.filter(s => headerAt(s.rows) >= 0)
    .sort((a, b) => (sheetSource(a.name) !== 'general') - (sheetSource(b.name) !== 'general'));
  if (!tabs.length) return { errors: ['Aucune colonne de prix (P1 à P7) trouvée. Utilisez la liste de prix exportée du site.'], warnings, changes: [], cells: 0, next: null, read: 0 };

  const byV = new Map(), byP = new Map(), byCode = new Map();
  const once = (m, k, r) => { if (k) m.set(k, m.has(k) ? null : r); };
  for (const r of ref.rows) {
    if (r.vid) byV.set(String(r.vid), r); else byP.set(String(r.pid), r);
    once(byCode, (r.child || (r.vid ? '' : r.parent)).toUpperCase(), r);
  }
  const text = v => (v == null ? '' : String(v).trim());
  const id = v => text(v).replace(/\.0+$/, '');
  const keyOf = r => (r.vid ? 'v' + r.vid : 'p' + r.pid);

  const seen = new Map();          // row key -> what the file says, merged over the tabs
  const notesOn = new Map();       // parent rows carry comments too
  let parentPrices = 0, sold = 0;
  for (const sheet of tabs) {
    const source = sheetSource(sheet.name);
    const h = headerAt(sheet.rows), head = sheet.rows[h].map(fold);
    const col = {};
    for (const [k, f] of Object.entries(HEAD_FOLD)) col[k] = head.indexOf(f);
    for (const [k, names] of Object.entries(ALIASES)) if (col[k] < 0) col[k] = head.findIndex(c => names.includes(c));
    if (col.qty < 0) col.qty = head.findIndex(c => /^quantite s?$/.test(c));
    col.id = head.indexOf('id');                                     // a WooCommerce export: product or version id
    if (col.child < 0 && col.parent < 0) col.code = head.findIndex(c => c === 'sku' || c === 'ugs' || c === 'code');
    // P1...P7; a lone "Prix" column is P1 only when there is no P1 column ("Prix ($ CA)" next to P1 is the old site price)
    const classCols = CLASS_NAMES.map((_, i) => head.findIndex(c => classOf(c) === i));
    if (classCols[0] < 0) classCols[0] = head.findIndex(lonePrice);
    const missingCols = CLASS_NAMES.filter((_, i) => classCols[i] < 0);
    if (missingCols.length && missingCols.length < CLASS_NAMES.length) warnings.push(`${tabs.length > 1 ? sheet.name + ' : c' : 'C'}olonnes absentes du fichier : ${missingCols.join(', ')}. Ces prix ne changent pas.`);
    const cell = (row, k) => (col[k] >= 0 ? row[col[k]] : null);

    for (let i = h + 1; i < sheet.rows.length; i++) {
      const row = sheet.rows[i] || [], line = `${sheet.name} ligne ${i + 1}`;
      if (!row.some(c => text(c))) continue;
      const vid = id(cell(row, 'vid')), pid = id(cell(row, 'pid')), any = id(cell(row, 'id'));
      const child = text(cell(row, 'child')).toUpperCase();
      const code = (child || (col.code >= 0 && col.child < 0 ? text(cell(row, 'code')) : '') || text(cell(row, 'parent'))).toUpperCase();
      let r = (vid && byV.get(vid)) || (pid && !vid && byP.get(pid)) || (any && (byV.get(any) || byP.get(any))) || null;
      if (!r && code) r = byCode.get(code) || null;
      if (!r) { warnings.push(`${line} : ${code || 'sans code'} ne correspond à aucun article du site (ignorée).`); continue; }
      const note = col.note >= 0 ? text(cell(row, 'note')) : undefined;
      if (r.kind === 'parent') {
        if (classCols.some(c => c >= 0 && text(row[c]))) parentPrices++;
        if (note !== undefined && (note || !notesOn.has(r.pid))) notesOn.set(r.pid, note);
        const d = col.display >= 0 ? readDisplay(cell(row, 'display')) : '';
        if (d) (seen.get('parent' + r.pid) || seen.set('parent' + r.pid, { r, displays: [] }).get('parent' + r.pid)).displays.push(d);
        continue;
      }
      const k = keyOf(r), e = seen.get(k) || { r, line, prices: null, qty: undefined, breaks: undefined, code: undefined, note: undefined, display: undefined, source: 'general', bad: false };
      if (!seen.has(k)) { seen.set(k, e); sold++; }
      else if (e.lastSheet === sheet.name) warnings.push(`${line} : ${r.child || r.parent} est aussi à la ${e.line}; la ${line} est retenue.`);
      e.lastSheet = sheet.name;

      // prices: a source's own tab replaces what the general tab said, and the general tab
      // leaves alone the products another tab prices (their cells there read "→ Panneaux routiers")
      const mine = source !== 'general' || (e.source === 'general' && !(r.source && r.source !== 'dynacom'));
      if (classCols.some(c => c >= 0) && mine) {
        const prices = (e.prices || r.prices).slice();
        classCols.forEach((c, ci) => {
          if (c < 0) return;                                        // column not in the file: unchanged
          const raw = row[c], v = readPrice(raw);
          if (Number.isNaN(v) || (v != null && v < 0)) { errors.push(`${line} (${r.child || r.parent || r.name}), ${CLASS_NAMES[ci]} : « ${text(raw)} » n'est pas un prix. Prix inchangé.`); return; }
          prices[ci] = v == null || v === 0 ? null : round(v);
        });
        e.prices = prices;
        if (source !== 'general') { e.source = source; e.line = line; }
      }
      if (col.q2 >= 0 || col.q3 >= 0) {
        const b = readBreaks(cell(row, 'q2'), cell(row, 'q3'));
        if (b === 'bad') { if (text(cell(row, 'q2')) !== '0') warnings.push(`${line} (${r.child || r.parent}) : QTY2 « ${text(cell(row, 'q2'))} » et QTY3 « ${text(cell(row, 'q3'))} » ne forment pas des paliers (ex. 25 et 125). Paliers inchangés.`); }
        else if (mine) e.breaks = b;
      }
      if (col.qty >= 0 && r.kind === 'child') {
        const q = readQty(cell(row, 'qty'));
        if (q == null) errors.push(`${line} (${r.child}) : « ${text(cell(row, 'qty'))} » n'est pas une quantité (ex. 1-24 ou 125+). Quantité inchangée.`);
        else e.qty = q;
      }
      if (col.code >= 0 && col.child >= 0) { const c = text(cell(row, 'code')).toUpperCase(); if (c || e.code === undefined) e.code = c || e.code || ''; }
      if (note !== undefined && (note || e.note === undefined)) e.note = note;
      if (col.display >= 0) {
        const raw = cell(row, 'display'), d = readDisplay(raw);
        if (d == null) warnings.push(`${line} (${r.child || r.parent}) : affichage « ${text(raw)} » inconnu (show price, login to see price, ask for quote ou remove from website).`);
        else if (d) e.display = d;
      }
    }
  }
  if (parentPrices) warnings.push(`${parentPrices} lignes « ${KIND.parent} » avaient des prix : ignorés, seules les lignes vendues (enfants, articles, variantes) ont un prix.`);

  // the list as published, then what the file changes
  const next = { products: {}, versions: {}, quantities: {}, breaks: {}, display: {}, sources: {}, codes: {}, notes: {} };
  const rowKey = r => (r.vid ? String(r.vid) : 'p' + r.pid);
  const byPid = new Map();
  for (const r of ref.rows) {
    (byPid.get(r.pid) || byPid.set(r.pid, []).get(r.pid)).push(r);
    if (r.kind === 'parent') { if (r.note) next.notes['p' + r.pid] = r.note; continue; }
    if (r.prices.some(Boolean)) (r.vid ? next.versions : next.products)[r.vid || r.pid] = r.prices.slice();
    if (r.vid && r.qty) next.quantities[r.vid] = r.qty;
    if (r.breaks) next.breaks[rowKey(r)] = r.breaks;
    if (r.code) next.codes[rowKey(r)] = r.code;
    if (r.note) next.notes[rowKey(r)] = r.note;
  }
  for (const [pid, rs] of byPid) {
    const r = rs.find(x => x.kind !== 'parent') || rs[0];
    if (r.display) next.display[pid] = r.display;
    if (r.source && r.source !== 'dynacom') next.sources[pid] = r.source;
  }

  const changes = [];
  let cells = 0, notes = 0, codes = 0;
  const shown = new Set();
  for (const [k, e] of seen) {
    if (k.startsWith('parent')) continue;
    const { r } = e;
    const prices = e.prices || r.prices, qty = e.qty === undefined ? r.qty || '' : e.qty;
    const breaks = e.breaks === undefined ? r.breaks || null : e.breaks;
    const diff = CLASS_NAMES.map((cls, i) => ({ cls, from: r.prices[i] || null, to: prices[i] || null })).filter(d => d.from !== d.to);
    const q = r.vid && (r.qty || '') !== qty ? { from: r.qty || '', to: qty } : null;
    const b = same(r.breaks || null, breaks) ? null : { from: r.breaks || null, to: breaks };
    if (e.code !== undefined && e.code !== (r.code || '')) codes++;
    if (e.note !== undefined && e.note !== (r.note || '')) notes++;
    if (diff.length || q || b) { changes.push({ code: r.child || r.parent || '', name: r.name, options: r.options || '', cells: diff, qty: q, breaks: b, display: null, pid: r.pid, vid: r.vid || null }); cells += diff.length; }
    const bag = r.vid ? next.versions : next.products, id = r.vid || r.pid, rk = rowKey(r);
    if (prices.some(Boolean)) bag[id] = prices; else delete bag[id];
    if (r.vid) { if (qty) next.quantities[r.vid] = qty; else delete next.quantities[r.vid]; }
    if (breaks) next.breaks[rk] = breaks; else delete next.breaks[rk];
    if (e.code !== undefined) { if (e.code) next.codes[rk] = e.code; else delete next.codes[rk]; }
    if (e.note !== undefined) { if (e.note) next.notes[rk] = e.note; else delete next.notes[rk]; }
    if (e.source !== 'general') next.sources[r.pid] = e.source;
    shown.add(r.pid);
  }
  for (const [pid, note] of notesOn) { if (note !== (next.notes['p' + pid] || '')) notes++; if (note) next.notes['p' + pid] = note; else delete next.notes['p' + pid]; }

  // a product's display: what its rows say (most of them), else what it had
  const mixed = [];
  for (const pid of new Set([...shown, ...[...seen.keys()].filter(k => k.startsWith('parent')).map(k => +k.slice(6))])) {
    const rows = byPid.get(pid) || [];
    const said = rows.map(r => seen.get(r.kind === 'parent' ? 'parent' + pid : (r.vid ? 'v' + r.vid : 'p' + r.pid))).filter(Boolean)
      .flatMap(e => (e.displays ? e.displays : e.display ? [e.display] : []));
    if (!said.length) continue;
    const d = pick(said), was = (rows.find(x => x.kind !== 'parent') || rows[0] || {}).display || '';
    if (new Set(said).size > 1) mixed.push(`${(rows[0] || {}).parent || pid} (${[...new Set(said)].join(', ')})`);
    if (d !== (was || 'login')) {                                    // no category is login
      const r0 = rows.find(x => x.kind !== 'parent') || rows[0];
      const c = changes.find(x => x.pid === pid && !x.display);
      if (c) c.display = { from: was, to: d };
      else changes.push({ code: r0.parent || r0.child || '', name: r0.name, options: '', cells: [], qty: null, breaks: null, display: { from: was, to: d }, pid, vid: null });
    }
    next.display[pid] = d;
  }
  if (mixed.length) warnings.push(`${mixed.length} produits ont plusieurs affichages selon leurs lignes; le plus fréquent est retenu : ${mixed.slice(0, 8).join(' · ')}${mixed.length > 8 ? '…' : ''}`);
  if (codes) warnings.push(`${codes} codes SIGNEL ajoutés ou modifiés.`);
  if (notes) warnings.push(`${notes} commentaires ajoutés ou modifiés.`);
  const missing = ref.rows.filter(r => r.kind !== 'parent' && !seen.has(r.vid ? 'v' + r.vid : 'p' + r.pid)).length;
  if (missing) warnings.push(`${missing} articles du site ne sont pas dans le fichier : leurs prix ne changent pas.`);
  return { next, changes, cells, warnings, errors, read: sold };
}
