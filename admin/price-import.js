// Reading the Excel price list back: which prices changed, and what could not be read.
// Shared by the import tool (tools/price-sheet.mjs import) and the dashboard's Prices page,
// which loads this same file from /admin/price-import.js. No Node or browser APIs here.
//
//   checkPriceSheet(sheets, ref) -> { next, changes, warnings, errors, read }
//     sheets  what readXlsx returns: [{ name, rows: [[...]] }]
//     ref     the price list as published: { rows: [{ kind, pid, vid, parent, child, name, options, price }] }
//             (src/model/price-sheet.js priceRows; /admin/price-list.json in the dashboard)
//     next    the new price list: { products: { id: price }, versions: { id: price } }
//
// A row is found by its ID version, else its ID produit, else its code (when only one row has
// it), so columns can be moved, rows sorted or filtered, and the ID columns even deleted.
// An empty price means "Prix sur demande". Rows left out of the file keep their price.

export const SHEET_NAME = 'Liste de prix';
export const HEAD = {
  family: 'Famille', parent: 'Code parent', child: 'Code enfant', kind: 'Type', name: 'Produit',
  options: 'Options', category: 'Catégorie', price: 'Prix ($ CA)', pid: 'ID produit', vid: 'ID version'
};
export const KIND = { parent: 'Parent (non vendu)', child: 'Enfant', item: 'Article', variant: 'Variante' };

const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const HEAD_FOLD = Object.fromEntries(Object.entries(HEAD).map(([k, v]) => [k, fold(v)]));

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

const round = n => Math.round(n * 100) / 100;

export function checkPriceSheet(sheets, ref) {
  const errors = [], warnings = [];
  // the sheet: the one named "Liste de prix", else the first with a price column
  const headerAt = rows => rows.slice(0, 15).findIndex(r => (r || []).some(c => fold(c) === HEAD_FOLD.price || /^prix\b/.test(fold(c))));
  const sheet = sheets.find(s => fold(s.name) === fold(SHEET_NAME) && headerAt(s.rows) >= 0) || sheets.find(s => headerAt(s.rows) >= 0);
  if (!sheet) return { errors: [`Aucune colonne « ${HEAD.price} » trouvée. Utilisez la liste de prix exportée du site.`], warnings, changes: [], next: null, read: 0 };
  const h = headerAt(sheet.rows), head = sheet.rows[h].map(fold);
  const col = {};
  for (const [k, f] of Object.entries(HEAD_FOLD)) col[k] = head.indexOf(f);
  if (col.price < 0) col.price = head.findIndex(c => /^prix\b/.test(c));

  // what each id and code points to
  const byV = new Map(), byP = new Map(), byChild = new Map(), byParent = new Map();
  for (const r of ref.rows) {
    if (r.vid) byV.set(String(r.vid), r);
    else byP.set(String(r.pid), r);
    if (r.child) byChild.set(r.child.toUpperCase(), byChild.has(r.child.toUpperCase()) ? null : r);
    if (r.parent && !r.vid) byParent.set(r.parent.toUpperCase(), byParent.has(r.parent.toUpperCase()) ? null : r);
  }
  const cell = (row, k) => (col[k] >= 0 ? row[col[k]] : null);
  const text = v => (v == null ? '' : String(v).trim());
  const id = v => text(v).replace(/\.0+$/, '');

  const seen = new Map(), changes = [];
  let read = 0, parentPrices = 0;
  for (let i = h + 1; i < sheet.rows.length; i++) {
    const row = sheet.rows[i] || [], line = i + 1;
    if (!row.some(c => text(c))) continue;
    const vid = id(cell(row, 'vid')), pid = id(cell(row, 'pid')), child = text(cell(row, 'child')).toUpperCase(), parent = text(cell(row, 'parent')).toUpperCase();
    let r = (vid && byV.get(vid)) || (pid && !vid && byP.get(pid)) || null;
    if (!r && child) r = byChild.get(child) || null;
    if (!r && parent && !child) r = byParent.get(parent) || null;
    if (!r) { warnings.push(`Ligne ${line} : ${[parent, child].filter(Boolean).join(' / ') || 'sans code'} ne correspond à aucun article du site (ignorée).`); continue; }
    const raw = cell(row, 'price'), price = readPrice(raw);
    if (r.kind === 'parent') {
      if (price != null && !Number.isNaN(price)) parentPrices++;
      continue;
    }
    read++;
    if (Number.isNaN(price) || (price != null && price < 0)) { errors.push(`Ligne ${line} (${r.child || r.parent || r.name}) : « ${text(raw)} » n'est pas un prix. Prix inchangé.`); continue; }
    const key = r.vid ? 'v' + r.vid : 'p' + r.pid;
    const value = price == null || price === 0 ? null : round(price);
    if (seen.has(key)) {
      if (seen.get(key).value !== value) warnings.push(`Ligne ${line} : ${r.child || r.parent} est aussi à la ligne ${seen.get(key).line} avec un autre prix; la ligne ${line} est retenue.`);
    }
    seen.set(key, { line, value, r });
  }
  if (parentPrices) warnings.push(`${parentPrices} prix inscrits sur des lignes « ${KIND.parent} » ont été ignorés : seules les lignes vendues (enfants, articles, variantes) ont un prix.`);

  const next = { products: {}, versions: {} };
  for (const r of ref.rows) if (r.kind !== 'parent' && r.price) (r.vid ? next.versions : next.products)[r.vid || r.pid] = r.price;
  for (const { value, r } of seen.values()) {
    const from = r.price || null;
    if (from !== value) changes.push({ code: r.child || r.parent || '', name: r.name, options: r.options || '', from, to: value, pid: r.pid, vid: r.vid || null });
    const bag = r.vid ? next.versions : next.products, k = r.vid || r.pid;
    if (value) bag[k] = value; else delete bag[k];
  }
  const missing = ref.rows.filter(r => r.kind !== 'parent' && !seen.has(r.vid ? 'v' + r.vid : 'p' + r.pid)).length;
  if (missing) warnings.push(`${missing} articles du site ne sont pas dans le fichier : leur prix ne change pas.`);
  return { next, changes, warnings, errors, read };
}
