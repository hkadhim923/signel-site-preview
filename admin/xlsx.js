// Excel workbooks (.xlsx) without a library: written by the build (the price list,
// tools/price-sheet.mjs) and read both by the import tool (Node) and by the dashboard (the
// browser loads this same file from /admin/xlsx.js), so a fix applies to both.
// Compression is passed in: Node gives zlib, the browser gives DecompressionStream.
//
//   writeXlsx({ sheets, styles }, deflateRaw)  -> Uint8Array
//   await readXlsx(bytes, inflateRaw)          -> [{ name, rows: [[value, ...], ...] }]
//
// A sheet: { name, cols: [{ width, hidden }], rows: [{ cells: [value | { v, s }], level, height }],
//            freeze: 'C2', filter: 'A1:K9', validations: [{ sqref, type, op, f1, title, text }],
//            merges: ['A1:D1'], tab: 'RRGGBB' }
// A style (referred to by its index in `styles`, 0 = plain):
//   { bold, italic, size, color, fill, fmt, h, v, wrap, border, indent }

/* ---------- zip ---------- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const enc = s => new TextEncoder().encode(s);
const dec = b => new TextDecoder().decode(b);

function zip(files, deflateRaw) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const raw = enc(text), data = deflateRaw(raw), nm = enc(name), crc = crc32(raw);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 8, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, raw.length, true); h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 8, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, raw.length, true); c.setUint16(28, nm.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nm);
    offset += 30 + nm.length + data.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0));
  let p = 0; for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}

async function unzip(bytes, inflateRaw) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = bytes.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not an Excel file (.xlsx)');
  const n = v.getUint16(e + 10, true);
  let p = v.getUint32(e + 16, true);
  const files = new Map();
  for (let i = 0; i < n; i++) {
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const name = dec(bytes.subarray(p + 46, p + 46 + nl));
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    files.set(name, { method, data: bytes.subarray(start, start + csize) });
    p += 46 + nl + xl + cl;
  }
  return async name => {
    const f = files.get(name);
    if (!f) return null;
    return dec(f.method === 0 ? f.data : await inflateRaw(f.data));
  };
}

/* ---------- XML ---------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const unesc = s => s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1))
    : { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }[e.toLowerCase()]);
const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? unesc(m[1]) : null; };
export const colName = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
const colIndex = ref => { let n = 0; for (const ch of /^[A-Z]+/.exec(ref)[0]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

/* ---------- write ---------- */
function stylesXml(styles) {
  const fonts = [], fills = [], fmts = [], xfs = [];
  const idx = (list, key) => { let i = list.indexOf(key); if (i < 0) { list.push(key); i = list.length - 1; } return i; };
  const font = s => `<font>${s.bold ? '<b/>' : ''}${s.italic ? '<i/>' : ''}<sz val="${s.size || 10}"/><color rgb="FF${s.color || '1F2933'}"/><name val="Arial"/><family val="2"/></font>`;
  const fill = s => s.fill ? `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill}"/><bgColor indexed="64"/></patternFill></fill>` : null;
  idx(fonts, font({}));
  fills.push('<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>');
  for (const s of [{}, ...styles]) {
    const f = idx(fonts, font(s));
    const fl = s.fill ? idx(fills, fill(s)) : 0;
    const nf = s.fmt ? 164 + idx(fmts, s.fmt) : 0;
    const al = s.h || s.v || s.wrap || s.indent
      ? `<alignment${s.h ? ` horizontal="${s.h}"` : ''} vertical="${s.v || 'center'}"${s.wrap ? ' wrapText="1"' : ''}${s.indent ? ` indent="${s.indent}"` : ''}/>`
      : '<alignment vertical="center"/>';
    xfs.push(`<xf numFmtId="${nf}" fontId="${f}" fillId="${fl}" borderId="${s.border ? 1 : 0}" xfId="0" applyFont="1"${fl ? ' applyFill="1"' : ''}${nf ? ' applyNumberFormat="1"' : ''}${s.border ? ' applyBorder="1"' : ''} applyAlignment="1">${al}</xf>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    (fmts.length ? `<numFmts count="${fmts.length}">${fmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('')}</numFmts>` : '') +
    `<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills>` +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD5DBE1"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function sheetXml(sh, strings) {
  const str = s => { let i = strings.map.get(s); if (i == null) { i = strings.list.length; strings.list.push(s); strings.map.set(s, i); } return i; };
  const anyLevel = sh.rows.some(r => r.level);
  const rows = sh.rows.map((r, ri) => {
    const cells = (r.cells || []).map((c, ci) => {
      const { v, s = 0 } = c !== null && typeof c === 'object' ? c : { v: c };
      const ref = colName(ci) + (ri + 1), st = s ? ` s="${s}"` : '';
      if (v == null || v === '') return s ? `<c r="${ref}"${st}/>` : '';
      if (typeof v === 'number') return `<c r="${ref}"${st}><v>${v}</v></c>`;
      return `<c r="${ref}"${st} t="s"><v>${str(String(v))}</v></c>`;
    }).join('');
    return `<row r="${ri + 1}"${r.height ? ` ht="${r.height}" customHeight="1"` : ''}${r.level ? ` outlineLevel="${r.level}"` : ''}${r.hidden ? ' hidden="1"' : ''}>${cells}</row>`;
  }).join('');
  const [fc, fr] = sh.freeze ? [colIndex(sh.freeze), +/\d+/.exec(sh.freeze)[0] - 1] : [0, 0];
  const pane = sh.freeze ? `<pane${fc ? ` xSplit="${fc}"` : ''}${fr ? ` ySplit="${fr}"` : ''} topLeftCell="${sh.freeze}" activePane="${fc && fr ? 'bottomRight' : fr ? 'bottomLeft' : 'topRight'}" state="frozen"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetPr>${sh.tab ? `<tabColor rgb="FF${sh.tab}"/>` : ''}${anyLevel ? '<outlinePr summaryBelow="0"/>' : ''}</sheetPr>` +
    `<sheetViews><sheetView workbookViewId="0"${sh.zoom ? ` zoomScale="${sh.zoom}"` : ''}${sh.grid === false ? ' showGridLines="0"' : ''}>${pane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="16"${anyLevel ? ' outlineLevelRow="1"' : ''}/>` +
    (sh.cols ? `<cols>${sh.cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 12}" customWidth="1"${c.hidden ? ' hidden="1"' : ''}/>`).join('')}</cols>` : '') +
    `<sheetData>${rows}</sheetData>` +
    (sh.filter ? `<autoFilter ref="${sh.filter}"/>` : '') +
    (sh.merges?.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '') +
    (sh.validations?.length ? `<dataValidations count="${sh.validations.length}">${sh.validations.map(d =>
      `<dataValidation type="${d.type}"${d.op ? ` operator="${d.op}"` : ''} allowBlank="1" showInputMessage="1" showErrorMessage="1"${d.title ? ` errorTitle="${esc(d.title)}" promptTitle="${esc(d.title)}"` : ''}${d.text ? ` error="${esc(d.text)}" prompt="${esc(d.prompt || d.text)}"` : ''} sqref="${d.sqref}"><formula1>${d.f1}</formula1></dataValidation>`).join('')}</dataValidations>` : '') +
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
}

export function writeXlsx({ sheets, styles = [], title = '' }, deflateRaw) {
  const strings = { list: [], map: new Map() };
  const sheetFiles = sheets.map((sh, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sh, strings)]);
  const names = sheets.map(s => s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  const filters = sheets.map((s, i) => s.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${names[i].replace(/'/g, "''")}'!$${s.filter.replace(':', ':$').replace(/(\d+)/g, '$$$1')}</definedName>` : '').join('');
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>Signel Services</dc:creator></cp:coreProperties>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${filters ? `<definedNames>${filters}</definedNames>` : ''}</workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`],
    ['xl/styles.xml', stylesXml(styles)],
    ...sheetFiles,
    ['xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.list.length}" uniqueCount="${strings.list.length}">${strings.list.map(s => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`]
  ], deflateRaw);
}

/* ---------- read ---------- */
// Values come back as Excel holds them: numbers as numbers, text as text, formulas as their
// last computed value. Workbooks saved again by Excel, LibreOffice or Google Sheets all work.
export async function readXlsx(bytes, inflateRaw) {
  const get = await unzip(bytes, inflateRaw);
  const wb = await get('xl/workbook.xml');
  if (!wb) throw new Error('not an Excel file (.xlsx)');
  const rels = (await get('xl/_rels/workbook.xml.rels')) || '';
  const target = id => {
    const m = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map(x => x[0]).find(t => attr(t, 'Id') === id);
    const t = m ? attr(m, 'Target') : null;
    return t ? (t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '')) : null;
  };
  const sst = [];
  const ss = await get('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) sst.push(unesc([...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')));
  const out = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const xml = await get(target(attr(m[0], 'r:id')));
    if (!xml) continue;
    const rows = [];
    for (const r of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const ri = +attr(r[0], 'r') - 1 || rows.length, row = [];
      for (const c of (r[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[0], 'r'), t = attr(c[0], 't') || 'n', body = c[2] || '';
        const v = /<v>([\s\S]*?)<\/v>/.exec(body);
        let val = null;
        if (t === 's') val = v ? sst[+v[1]] ?? null : null;
        else if (t === 'inlineStr') val = unesc([...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
        else if (t === 'str' || t === 'e') val = v ? unesc(v[1]) : null;
        else if (t === 'b') val = v ? v[1] === '1' : null;
        else val = v && v[1] !== '' ? Number(v[1]) : null;
        row[ref ? colIndex(ref) : row.length] = val;
      }
      rows[ri] = row;
    }
    out.push({ name: attr(m[0], 'name'), rows: Array.from(rows, r => r || []) });
  }
  return out;
}
