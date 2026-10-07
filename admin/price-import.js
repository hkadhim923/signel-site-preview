// Reading the Excel price list back: which prices and quantities changed, and what could
// not be read. Shared by the import tool (tools/price-sheet.mjs import) and the dashboard's
// Prices page, which loads this same file from /admin/price-import.js. No Node or browser
// APIs here.
//
//   checkPriceSheet(sheets, ref) -> { next, changes, cells, warnings, errors, read }
//     sheets  what readXlsx returns: [{ name, rows: [[...]] }]
//     ref     the price list as published: { rows: [{ kind, pid, vid, parent, child, name, options, qty, prices: [P1..P7] }] }
//             (src/model/price-sheet.js priceRows; /admin/price-list.json in the dashboard)
//     next    the new price list: { products: { id: [P1..P7] }, versions: { id: [P1..P7] }, quantities: { id: "25-124" } }
//     changes one entry per row that changed: { code, name, options, cells: [{ cls, from, to }], qty: { from, to } | null }
//
// A row is found by its ID version, else its ID produit, else its code (when only one row
// has it), so columns can be moved, rows sorted or filtered, and the ID columns even
// deleted. A WooCommerce export (ID, Sku, one column per price class) reads the same way.
// An empty class price takes the price of the class before it on the site. Rows left out of
// the file, and class columns missing from it, keep their prices.

export const SHEET_NAME = 'Liste de prix';
export const CLASS_NAMES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
export const HEAD = {
  family: 'Famille', parent: 'Code parent', child: 'Code enfant', kind: 'Type', name: 'Produit',
  options: 'Options', qty: 'Quantité', category: 'Catégorie', pid: 'ID produit', vid: 'ID version'
};
export const KIND = { parent: 'Parent (non vendu)', child: 'Enfant', item: 'Article', variant: 'Variante' };

const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const HEAD_FOLD = Object.fromEntries(Object.entries(HEAD).map(([k, v]) => [k, fold(v)]));
/** "P3", "Prix P3", "role_base_price_p3" -> 2; a lone "Prix" column (the first price list) is P1 */
const classOf = h => { const m = /(?:^| )p ?([1-7])$/.exec(h) || /^role .*([1-7])$/.exec(h); return m ? +m[1] - 1 : /^prix\b/.test(h) && !/[0-9]/.test(h) ? 0 : -1; };

/** "1 234,50 $", "1,234.50", 1234.5 -> 1234.5; "" -> null; anything else -> NaN */
export function readPrice(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[\s  $]|CAD|CA/gi, '');
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

const round = n => Math.round(n * 100) / 100;

export function checkPriceSheet(sheets, ref) {
  const errors = [], warnings = [];
  const isHeader = r => (r || []).some(c => classOf(fold(c)) >= 0);
  const headerAt = rows => rows.slice(0, 15).findIndex(isHeader);
  const sheet = sheets.find(s => fold(s.name) === fold(SHEET_NAME) && headerAt(s.rows) >= 0) || sheets.find(s => headerAt(s.rows) >= 0);
  if (!sheet) return { errors: ['Aucune colonne de prix (P1 à P7) trouvée. Utilisez la liste de prix exportée du site.'], warnings, changes: [], cells: 0, next: null, read: 0 };
  const h = headerAt(sheet.rows), head = sheet.rows[h].map(fold);
  const col = {};
  for (const [k, f] of Object.entries(HEAD_FOLD)) col[k] = head.indexOf(f);
  if (col.qty < 0) col.qty = head.findIndex(c => /\bquantit/.test(c));
  col.id = head.indexOf('id');                                   // a WooCommerce export: product or version id
  if (col.child < 0 && col.parent < 0) col.code = head.findIndex(c => c === 'sku' || c === 'ugs' || c === 'code');
  const classCols = CLASS_NAMES.map((_, i) => head.findIndex(c => classOf(c) === i));

  const byV = new Map(), byP = new Map(), byCode = new Map();
  const once = (m, k, r) => { if (k) m.set(k, m.has(k) ? null : r); };
  for (const r of ref.rows) {
    if (r.vid) byV.set(String(r.vid), r); else byP.set(String(r.pid), r);
    once(byCode, (r.child || (r.vid ? '' : r.parent)).toUpperCase(), r);
  }
  const cell = (row, k) => (col[k] >= 0 ? row[col[k]] : null);
  const text = v => (v == null ? '' : String(v).trim());
  const id = v => text(v).replace(/\.0+$/, '');

  const seen = new Map();
  let read = 0, parentPrices = 0;
  for (let i = h + 1; i < sheet.rows.length; i++) {
    const row = sheet.rows[i] || [], line = i + 1;
    if (!row.some(c => text(c))) continue;
    const vid = id(cell(row, 'vid')), pid = id(cell(row, 'pid')), any = id(cell(row, 'id'));
    const code = (text(cell(row, 'child')) || text(cell(row, 'code')) || text(cell(row, 'parent'))).toUpperCase();
    let r = (vid && byV.get(vid)) || (pid && !vid && byP.get(pid)) || (any && (byV.get(any) || byP.get(any))) || null;
    if (!r && code) r = byCode.get(code) || null;
    if (!r) { warnings.push(`Ligne ${line} : ${code || 'sans code'} ne correspond à aucun article du site (ignorée).`); continue; }
    if (r.kind === 'parent') { if (classCols.some(c => c >= 0 && text(row[c]))) parentPrices++; continue; }
    read++;
    const prices = r.prices.slice();
    let bad = false;
    classCols.forEach((c, ci) => {
      if (c < 0) return;                                          // column not in the file: unchanged
      const raw = row[c], v = readPrice(raw);
      if (Number.isNaN(v) || (v != null && v < 0)) { errors.push(`Ligne ${line} (${r.child || r.parent || r.name}), ${CLASS_NAMES[ci]} : « ${text(raw)} » n'est pas un prix. Prix inchangé.`); bad = true; return; }
      prices[ci] = v == null || v === 0 ? null : round(v);
    });
    let qty = r.qty || '';
    if (col.qty >= 0 && r.kind === 'child') {
      const q = readQty(cell(row, 'qty'));
      if (q == null) errors.push(`Ligne ${line} (${r.child}) : « ${text(cell(row, 'qty'))} » n'est pas une quantité (ex. 1-24 ou 125+). Quantité inchangée.`);
      else qty = q;
    }
    const key = r.vid ? 'v' + r.vid : 'p' + r.pid;
    if (seen.has(key)) warnings.push(`Ligne ${line} : ${r.child || r.parent} est aussi à la ligne ${seen.get(key).line}; la ligne ${line} est retenue.`);
    seen.set(key, { line, prices, qty, r, bad });
  }
  if (parentPrices) warnings.push(`${parentPrices} lignes « ${KIND.parent} » avaient des prix : ignorés, seules les lignes vendues (enfants, articles, variantes) ont un prix.`);
  const missingCols = CLASS_NAMES.filter((_, i) => classCols[i] < 0);
  if (missingCols.length && missingCols.length < CLASS_NAMES.length) warnings.push(`Colonnes absentes du fichier : ${missingCols.join(', ')}. Ces prix ne changent pas.`);

  const next = { products: {}, versions: {}, quantities: {} };
  for (const r of ref.rows) {
    if (r.kind === 'parent') continue;
    if (r.prices.some(Boolean)) (r.vid ? next.versions : next.products)[r.vid || r.pid] = r.prices.slice();
    if (r.vid && r.qty) next.quantities[r.vid] = r.qty;
  }
  const changes = [];
  let cells = 0;
  for (const { prices, qty, r } of seen.values()) {
    const diff = CLASS_NAMES.map((cls, i) => ({ cls, from: r.prices[i] || null, to: prices[i] || null })).filter(d => d.from !== d.to);
    const q = r.vid && (r.qty || '') !== qty ? { from: r.qty || '', to: qty } : null;
    if (diff.length || q) { changes.push({ code: r.child || r.parent || '', name: r.name, options: r.options || '', cells: diff, qty: q, pid: r.pid, vid: r.vid || null }); cells += diff.length; }
    const bag = r.vid ? next.versions : next.products, k = r.vid || r.pid;
    if (prices.some(Boolean)) bag[k] = prices; else delete bag[k];
    if (r.vid) { if (qty) next.quantities[r.vid] = qty; else delete next.quantities[r.vid]; }
  }
  const missing = ref.rows.filter(r => r.kind !== 'parent' && !seen.has(r.vid ? 'v' + r.vid : 'p' + r.pid)).length;
  if (missing) warnings.push(`${missing} articles du site ne sont pas dans le fichier : leurs prix ne changent pas.`);
  return { next, changes, cells, warnings, errors, read };
}
