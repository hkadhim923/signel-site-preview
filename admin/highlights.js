// A product's short description: the most important part of its description, shown between
// its name and its price (src/components/highlights.js). What goes there is taken OUT of the
// full description below it, so nothing is said twice.
//
// The rule, first match wins:
//   1. Points set in the dashboard or sent by the API (p.highlights): they are the top; the
//      full description stays whole below.
//   2. A split marker in the description, <!--more--> (the dashboard's "Split here" button):
//      everything before it is the top, everything after it the full description.
//   3. Automatic, by what each part of the description IS, not where it sits:
//        top      the opening paragraphs (what the product is, what it does for you), at most
//                 2 (the second only while the first is short), and the first list of real
//                 points (not a choice or reference list, not links, not bare values like
//                 "4 in"), at most 5; a used-product notice always goes on top.
//        below    options, materials, dimensions, codes, related products, spare parts,
//                 inputs/outputs, "Info +", links: they stay in the full description.
//        specs    specification lists are used for the top only when there is nothing else.
//   4. No description: the options and specifications, as short points; nothing is removed.
// The result says which rule applied (source: 'set' | 'split' | 'auto' | 'specs').
//
// No imports on purpose: the build also serves this file as /admin/highlights.js, so the
// dashboard's preview applies exactly the same rule while a description is being edited.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', ndash: '–', mdash: '—', deg: '°' };
const decodeEntities = s => s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m);
const MAX_POINTS = 5, MAX_LEAD = 2, LEAD_CHARS = 200, LEN = 170;
export const SPLIT = /<!--\s*more\s*-->/i;

const plain = h => decodeEntities(String(h || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const clip = t => (t.length > LEN ? t.slice(0, LEN).replace(/\s+\S*$/, '') + '…' : t).replace(/[.;,:]$/, '');
const list = (v, or = 'or') => v.length > 1 ? `${v.slice(0, -1).join(', ')} ${or} ${v[v.length - 1]}` : v[0];

// what a section is, from its heading (or the "Label:" paragraph just before a list)
const REFERENCE = /option|material|dimension|size|code|related|accessor|spare|part|input|output|info\s*\+|pin down|download|document|comparison|programm|warranty|contact|price|order/i;
const SPECS = /spec|electri|mechan|technical|standard|characteristic|power|feature list/i;
const USED = /this product is used/i;

/** Top-level blocks of an HTML fragment: headings, paragraphs, lists, anything else. */
export function blocks(html) {
  const out = []; let i = 0; const s = String(html || '');
  const tagAt = /<(h[1-6]|p|ul|ol|div|table|blockquote|figure|section|dl)\b[^>]*>/gi;
  while (i < s.length) {
    tagAt.lastIndex = i;
    const m = tagAt.exec(s);
    if (!m) { if (s.slice(i).trim()) out.push({ kind: 'other', html: s.slice(i) }); break; }
    if (s.slice(i, m.index).trim()) out.push({ kind: 'other', html: s.slice(i, m.index) });
    const tag = m[1].toLowerCase(), open = new RegExp(`<${tag}\\b[^>]*>`, 'gi'), close = new RegExp(`</${tag}>`, 'gi');
    // find the matching close tag, counting nested tags of the same name (lists in lists)
    let depth = 1, j = m.index + m[0].length;
    while (depth && j < s.length) {
      open.lastIndex = j; close.lastIndex = j;
      const o = open.exec(s), c = close.exec(s);
      if (!c) { j = s.length; break; }
      if (o && o.index < c.index) { depth++; j = o.index + o[0].length; } else { depth--; j = c.index + c[0].length; }
    }
    const html = s.slice(m.index, j);
    const kind = /^h\d$/.test(tag) ? 'heading' : tag === 'p' ? 'para' : tag === 'ul' || tag === 'ol' ? 'list' : 'other';
    out.push({ kind, html });
    i = j;
  }
  return out;
}

const itemsOf = listHtml => {
  const inner = listHtml.replace(/^<(ul|ol)\b[^>]*>/i, '').replace(/<\/(ul|ol)>\s*$/i, '');
  return blocks(inner.replace(/<li\b/gi, '<p data-li').replace(/<\/li>/gi, '</p>')).filter(b => b.kind === 'para')
    .map(b => plain(b.html)).filter(t => t.length > 2);
};

/** { intro: html, items: [text], rest: html | null, source } for a product and its view. */
export function highlightsOf(p, view) {
  const desc = view.description || '';
  if (Array.isArray(p.highlights) && p.highlights.length)
    return { intro: view.summary || '', items: p.highlights.map(String).filter(Boolean), rest: null, source: 'set' };

  if (SPLIT.test(desc)) {
    const [top, ...after] = desc.split(SPLIT);
    return { intro: top.trim(), items: [], rest: after.join('').trim(), source: 'split' };
  }

  if (!desc.trim()) return fromSpecs(view);

  // 3. automatic: walk the blocks with the section each one sits in
  const bs = blocks(desc);
  let section = '', label = '';
  for (const b of bs) {
    if (b.kind === 'heading') { section = plain(b.html); label = ''; b.section = section; continue; }
    b.section = label || section;
    if (b.kind === 'para' && /:\s*$/.test(plain(b.html)) && plain(b.html).length < 60) { label = plain(b.html); b.isLabel = true; continue; }
    if (b.kind === 'para') label = '';
  }
  const kindOf = b => REFERENCE.test(b.section) ? 'reference' : SPECS.test(b.section) ? 'specs' : 'lead';
  const take = new Set(); let intro = [], items = [];
  // the used-product notice, wherever it is
  for (const b of bs) if ((b.kind === 'para' || b.kind === 'heading') && USED.test(plain(b.html))) { intro.push(`<p>${plain(b.html)}</p>`); take.add(b); }
  // opening paragraphs: sentences, not labels or links, before any reference or specs section;
  // a second one only while the top is still short
  let lead = 0, said = 0;
  for (const b of bs) {
    if (lead >= MAX_LEAD || said > LEAD_CHARS) break;
    if (b.kind === 'heading' && kindOf(b) !== 'lead') break;
    if (b.kind !== 'para' || b.isLabel || take.has(b) || kindOf(b) !== 'lead') continue;
    const t = plain(b.html);
    if (t.length < 25 || /^[\W\d]+$/.test(t) || /\.pdf|»»|^https?:/i.test(b.html)) continue;
    intro.push(b.html); take.add(b); lead++; said += t.length;
  }
  // the first list that is not a choice or reference list; specs only when nothing else
  // a list of links (guides, documents) or of bare values (sizes, codes: "a) 4 in") is not a list of points
  const points = b => { const it = itemsOf(b.html); return it.length && !/<a\b|»»/i.test(b.html) && it.join('').length / it.length >= 15; };
  const pick = want => bs.find(b => b.kind === 'list' && !take.has(b) && kindOf(b) === want && points(b));
  const main = pick('lead') || (!intro.length ? pick('specs') : null);
  if (main) {
    const all = itemsOf(main.html);
    items = all.slice(0, MAX_POINTS).map(clip);
    if (all.length <= MAX_POINTS) take.add(main);
    else main.html = '<ul>' + all.slice(MAX_POINTS).map(t => `<li>${t}</li>`).join('') + '</ul>';   // the rest of a long list stays below
    // the label that introduced the list goes with it ("Specifications:")
    const at = bs.indexOf(main); if (take.has(main) && bs[at - 1] && bs[at - 1].isLabel) take.add(bs[at - 1]);
  }
  if (!intro.length && !items.length) return fromSpecs(view, desc);

  // the full description is what is left, without headings whose section is now empty
  const left = bs.filter(b => !take.has(b));
  const rest = left.filter((b, i) => b.kind !== 'heading' || (left[i + 1] && left[i + 1].kind !== 'heading')).map(b => b.html).join('\n').trim();
  return { intro: intro.join('\n'), items, rest: plain(rest) ? rest : '', source: 'auto' };
}

function fromSpecs(view, rest = null) {
  const items = [
    ...view.options.map(o => `Choice of ${o.label.toLowerCase()}: ${list(o.values.map(v => v.label))}`),
    ...view.specs.filter(s => !view.options.some(o => o.label === s.label)).map(s => `${s.label}: ${list(s.values, 'and')}`)
  ].map(clip).slice(0, MAX_POINTS);
  return { intro: '', items, rest, source: 'specs' };
}
