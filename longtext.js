// Folio v2 — ECX "Long Text" for the connection charge (same layout as the user's Subsidy 100% / 70% examples).
// Pure text from the calculation result + a few project fields; no screen code, so it can be tested on its own.

const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
export const RM = n => (n < 0 ? '- ' : '') + 'RM ' + Math.abs(r2(n)).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kv = n => Number(n).toLocaleString('en-MY', { maximumFractionDigits: 2 });
const num = v => v === '' || v == null || isNaN(+v) ? null : +v;

// unit wording used in the long text
export const unitLabel = u => ({ 'per span with pole': 'per pole span', 'per span without pole': 'per span', meter: 'per m', 'meter (circuit length)': 'per m circuit length' }[u] || u);
export const qtyUnit = u => /span/i.test(u) ? 'span' : /^meter/i.test(u) ? 'm' : u === 'each' ? 'ea' : u === 'set' ? 'set' : /unit/i.test(u) ? 'unit' : /house/i.test(u) ? 'house' : /substation/i.test(u) ? 'substation' : /km/i.test(u) ? 'km' : /panel/i.test(u) ? 'panel' : 'no';
const GROUP = { lt: 'LOW TENSION COST', ltstreet: 'LOW TENSION COST FOR STREET LIGHTING', ht: 'HIGH TENSION COST', htexcess: 'HIGH TENSION COST IN EXCESS OF 1000M', substation: 'SUBSTATION COST',
  perhouse: 'PER HOUSE FEE', admin: 'ADMINISTRATION FEE', testing: 'TESTING FEE', controlled: 'CONTROLLED ITEMS', engfee: 'ENGINEERING FEE' };
export const SUBSIDY_RULE = ['(i) Connection Charge Subsidy 2020:', '(1) Connection Charge up to RM 5,000.00, 100% subsidy from State Government', '(2) Connection Charge above RM 5,000.00 to RM 10,000.00,', '70% subsidy from State Government & 30% borne by customer'];

/** which subsidy applies to an amount under the Connection Charge Subsidy 2020 rules: 1 (100%), 2 (70%) or null (above RM10,000) */
export const subsidyBand = total => total <= 5000 ? 1 : total <= 10000 ? 2 : null;

/** draft "scheme of supply" from the charge items (you can edit it) */
export function schemeDraft(lines) {
  const erect = [], install = [];
  for (const l of lines) {
    if (['scc', 'lcc'].includes(l.comp)) continue;
    const d = l.desc.replace(/\s*\(.*?\)\s*$/, m => /phase|wire|twin/i.test(m) ? m : '');
    if (/span/i.test(l.unit)) erect.push(`- To erect ${kv(l.qty)} span ${d}.`);
    else if (/^meter/i.test(l.unit)) erect.push(`- To lay ${kv(l.qty)}m ${d}.`);
    else if (l.comp === 'meter') install.push(`- ${kv(l.qty)} no ${/single|1-phase/i.test(l.desc) ? '1-phase' : '3-phase'} Meter`);
    else install.push(`- ${kv(l.qty)} no ${d}`);
  }
  return [erect.length ? 'a. At the existing LT OHL Pole ID ____ :\r\n' + erect.join('\r\n') : null, install.length ? (erect.length ? 'b' : 'a') + '. To install :\r\n' + install.join('\r\n') : null].filter(Boolean).join('\r\n\r\n');
}

/**
 * f: { shortTitle, ref, projectRef, title, consultant, client, ic, contact, appType, load, target, cat, use, scheme,
 *      costOH, costNoOH, sst, subsidy: 'auto'|'100'|'70'|'none', subsidyBV, cdpBV, source, feeder, r, y, b, submittedBy, date, remarks, desc: { [lineId]: text } }
 * res: calculate() result. Returns { text, totals, warnings }.
 */
/** the original layout: Domestic with government subsidy (the user's Subsidy 100% / 70% examples) */
function subsidyText(f, res) {
  const W = [], out = [], P = (...x) => out.push(...x);
  const lines = res.lines, desc = l => (f.desc || {})[l.id] || l.desc;
  const conn = lines.filter(l => !['scc', 'lcc', 'meter'].includes(l.comp)), cap = lines.filter(l => l.comp === 'scc' || l.comp === 'lcc'), met = lines.filter(l => l.comp === 'meter');
  const adjCap = res.adjustments.filter(a => /Contribution/i.test(a.label)), adjConn = res.adjustments.filter(a => !/Contribution/i.test(a.label));
  const sum = (a, k = 'amount') => r2(a.reduce((x, l) => x + l[k], 0));
  const c = r2(sum(conn) + sum(adjConn)), d = r2(sum(cap) + sum(adjCap)), e = sum(met), total = r2(c + d + e);
  if (Math.abs(total - res.total) > 0.005) W.push('The long text total does not match the calculator total.');
  if (!res.complete) W.push('The calculation is incomplete: ' + res.incomplete.join('; '));
  const b = num(f.costNoOH), oh = num(f.costOH) ?? 0, sst = num(f.sst) ?? 0;
  if (b == null) W.push('Enter (b) Total cost of project (without OH) for the CDP line.');
  P(String(f.shortTitle || '').toUpperCase(), '', `REF. NO : ${f.ref || ''}`, `PROJECT REF: ${f.projectRef || ''}`, `PROJECT TITLE : ${String(f.title || '').toUpperCase()}`, '',
    `CONSULTANT/CONTRACTOR : ${String(f.consultant || '').toUpperCase()}`, `DEVELOPER/CLIENT : ${String(f.client || '').toUpperCase()}${f.ic ? ` (${f.ic})` : ''}`, `CONTACT NUM : ${f.contact || ''}`, '',
    `1 ) TYPE OF APPLICATION : ${String(f.appType || '').toUpperCase()}`, `2 ) ESTIMATED CONNECTED LOAD : ${f.load ?? ''} KVA`, `3 ) TARGET DATE OF SUPPLY : ${f.target || ''}`, `4 ) CATEGORY : ${f.cat || ''}`,
    `5 ) TYPE OF USE : ${String(f.use || '').toUpperCase()}`, '6 ) SCHEME OF SUPPLY (with drawing attached):', '', ...(String(f.scheme || '').split(/\r?\n/)), '',
    '7 ) CONNECTION CHARGE CALCULATIONS :', `(a) TOTAL COST OF PROJECT (WITH OH) : ${RM(oh)}`, `(b) TOTAL COST OF PROJECT (WITHOUT OH) : ${RM(b ?? 0)}`, '(c) CONNECTION COST:', '');
  // (c) grouped by component
  const groups = [...new Set(conn.map(l => l.comp))];
  for (const g of groups) {
    const gl = conn.filter(l => l.comp === g);
    P(`${GROUP[g] || g.toUpperCase()} :`, '', ...gl.map(l => `- ${RM(l.rate)} ${desc(l)} (${unitLabel(l.unit)}) x ${kv(l.qty)} ${qtyUnit(l.unit)} = ${RM(l.amount)}`), '');
  }
  for (const a of adjConn) P(`- LESS ${a.label.replace(/^Less /i, '')} = ${RM(a.amount)}`, '');
  const parts = [...conn.map(l => l.amount), ...adjConn.map(a => a.amount)];
  P(conn.length ? `TOTAL COST : ${parts.map(RM).join(' + ').replace(/\+ - /g, '- ')} = ${RM(c)}` : 'TOTAL COST : RM 0.00', '');
  // (d) capacity charge
  if (cap.length) {
    const names = cap.map(l => l.comp === 'scc' ? 'SUBSTATION CAPACITY CHARGE' : 'LINE CAPACITY CHARGE').join(' + ');
    P(`(d) CAPACITY CHARGE : ${names}`, `= [${cap.map(l => `(${kv(l.qty)} kVA x ${RM(l.rate)})`).join(' + ')}] = ${RM(sum(cap))}`);
    for (const a of adjCap) P(`LESS ${a.label} = ${RM(a.amount)}`, `CAPACITY CHARGE PAYABLE = ${RM(d)}`);
  } else P('(d) CAPACITY CHARGE : NOT APPLICABLE = RM 0.00');
  P('');
  // (e) meter fee
  const meterName = l => /single|1-phase/i.test(l.desc) ? '1-Phase Meter' : /Three Phase whole current/i.test(l.desc) ? '3-Phase Meter' : desc(l);
  P(met.length ? `(e) NON-TAXABLE ITEM (METER FEE) : ${met.map(l => l.qty === 1 ? `${RM(l.rate)} (${meterName(l)})` : `${RM(l.rate)} x ${kv(l.qty)} (${meterName(l)}) = ${RM(l.amount)}`).join(' + ')}${met.length > 1 ? ' = ' + RM(e) : ''}` : '(e) NON-TAXABLE ITEM (METER FEE) : RM 0.00', '');
  P(`(f) TOTAL CUSTOMER CONNECTION CHARGE : (c) + (d) + (e) = ${RM(total)}`);
  const cdp = b == null ? 0 : r2(b - c - d), cdpSeek = Math.max(0, cdp);
  P(`(g) CAPACITY DEVELOPMENT BV (CDP) : (b) - (c) - (d) = ${RM(cdp)}`, '', `*To seek ${RM(cdpSeek)} from Capacity Development BV ${f.cdpBV || ''}.*`, '');
  const taxable = r2(total - e), sstAmt = r2(taxable * sst / 100), h = r2(total + sstAmt);
  P(`(h) TOTAL CUSTOMER CONNECTION CHARGE + ${kv(sst)}% SST BEFORE SUBSIDY:`, `(c) + (d) + (e)${sst ? ` + ${kv(sst)}% SST` : ''} = ${RM(h)}`, '');
  // (i)–(k) subsidy (Domestic only)
  let band = null, pct = 0;
  if (f.subsidy === 'none') band = null;
  else if (f.subsidy === '100') band = 1; else if (f.subsidy === '70') band = 2; else band = subsidyBand(h);
  const auto = subsidyBand(h);
  if (f.subsidy && f.subsidy !== 'none' && f.subsidy !== 'auto' && auto !== band) W.push(`The amount ${RM(h)} falls under subsidy (${auto ?? 'none — above RM 10,000.00'}), but ${f.subsidy}% was chosen.`);
  if (f.subsidy !== 'none' && auto == null && f.subsidy === 'auto') W.push(`${RM(h)} is above RM 10,000.00, which the Connection Charge Subsidy 2020 rules above do not cover: no subsidy is applied. Choose 100% or 70% if it should apply.`);
  pct = band === 1 ? 100 : band === 2 ? 70 : 0;
  const gov = r2(h * pct / 100), cust = r2(h - gov);
  if (pct) {
    P(...SUBSIDY_RULE, '', `*This project falls under (${band}).`, '',
      '(j) TOTAL CUSTOMER CONNECTION CHARGE (LESS GOVERNMENT SUBSIDY) :', `Subsidy (${band})`, `= ${pct}% x ${RM(h)} = ${RM(gov)}`, `To seek : ${RM(gov)} from BV ${f.subsidyBV || ''}.`, '',
      '(k) TOTAL CUSTOMER CONNECTION CHARGE (AFTER LESS GOVERNMENT SUBSIDY) :', `= ${100 - pct}% x ${RM(h)} = ${RM(cust)}`, `To seek : ${RM(cust)} from Customer.`, '');
  } else P('(i) Connection Charge Subsidy 2020 : NOT APPLICABLE', '', '(j) TOTAL CUSTOMER CONNECTION CHARGE (NO GOVERNMENT SUBSIDY) :', `= 100% x ${RM(h)} = ${RM(cust)}`, `To seek : ${RM(cust)} from Customer.`, '');
  P('(l) BUDGET ALLOCATION SUMMARY:', `i) TOTAL CCG W/O SST = ${RM(total)}`, `ii) TOTAL NON-TAXABLE ITEM-TAX CODE S0 = ${RM(e)} (METER FEE)`,
    `iii) TOTAL TAXABLE ITEM-TAX CODE S0 : (i - ii) + ${kv(sst)}% = ${RM(taxable)} + ${kv(sst)}% (${RM(sstAmt)}) = ${RM(r2(taxable + sstAmt))}`,
    `iv) TOTAL CCG INCLUSIVE OF SERVICE TAX ${kv(sst)}% = ${RM(h)}`, `v) CDP BV ${f.cdpBV || ''} = ${RM(cdpSeek)}`,
    ...(pct ? [`vi) GOVERNMENT SUBSIDY BV ${f.subsidyBV || ''} (${pct}%) = ${RM(gov)}`] : []), `${pct ? 'vii' : 'vi'}) CUSTOMER CONTRIBUTION (${100 - pct}%) = ${RM(cust)}`, '');
  const src = String(f.source || '').toUpperCase();
  P(`8) SOURCE OF SUPPLY IS FROM EXISTING : ${src}`);
  if (f.feeder || f.r || f.y || f.b) P(`FEEDER = ${f.feeder || 'RYB'}`, `R - ${f.r ?? ''} A`, `Y - ${f.y ?? ''} A`, `B - ${f.b ?? ''} A`);
  const funds = [pct && gov ? `GOVERNMENT SUBSIDY BV ${f.subsidyBV || ''}` : null, cdpSeek ? `CDP BV ${f.cdpBV || ''}` : null, cust ? 'CUSTOMER' : null].filter(Boolean);
  const remark = f.remarks || (funds.length ? 'FUND TO BE SOUGHT FROM ' + funds.join(', ').replace(/, ([^,]*)$/, funds.length > 1 ? ' & $1' : ', $1') + '.' : '');
  P('', `9 ) SUBMITTED BY : ${String(f.submittedBy || '').toUpperCase()}`, '', `10 ) DATE OF SUBMISSION : ${String(f.date || '').toUpperCase()}`, '', `11) REMARKS : ${remark.toUpperCase()}`);
  return { text: out.join('\r\n'), totals: { c, d, e, total, cdp, cdpSeek, h, pct, gov, cust, band }, warnings: W };
}

// =====================================================================================
// Layouts by project category (the user's TK2, SAL100KW, TOS and UOS examples)
// =====================================================================================
export const LAYOUTS = { subsidy: 'Domestic with government subsidy', standard: 'Standard (SAL100KW / NTK)', tos: 'Temporary Supply (TOS)', uos: 'Upgrading of Supply (UOS)', tk2: 'Turnkey Stage 2 (TK2)' };
/** which layout fits a project: by its category, and for SAL100KW by tariff and subsidy */
export function layoutFor(cats = [], tariff = '', subsidy = '') {
  const has = c => cats.includes(c);
  if (has('Turnkey Stage 2')) return 'tk2';
  if (has('Temporary Supply')) return 'tos';
  if (has('Upgrading of Supply')) return 'uos';
  if (has('SAL100KW') && tariff !== 'Commercial' && subsidy === 'Yes') return 'subsidy';
  return 'standard';
}
const up = v => String(v ?? '').toUpperCase();
const kvRM = n => 'RM ' + kv(n); // "RM 445" as written in the UOS example
const meterShort = l => /single|1-phase/i.test(l.desc) ? '1PH METER' : /Three Phase whole current/i.test(l.desc) ? '3PH METER' : l.desc;
const unitWord = u => u === 'each' ? ' each' : '';
const qtyWord = u => u === 'each' ? 'ea' : /^meter/i.test(u) ? 'meter' : qtyUnit(u);
const ceilDiv = (len, per) => Math.ceil(len / per);
/** extra items that are not in the Guidelines catalogue (e.g. road reinstatement): { desc, rate, markup (%), qty, unit } */
function extras(f) {
  return (f.extras || []).map(x => ({ desc: String(x.desc || '').trim(), rate: num(x.rate), markup: num(x.markup), qty: num(x.qty), unit: String(x.unit || 'meter').trim() }))
    .filter(x => x.desc && x.rate != null && x.qty != null)
    .map(x => { const r = x.markup ? r2(x.rate * x.markup / 100) : x.rate; return { ...x, unitRate: r, amount: r2(r * x.qty) }; });
}
const extraLines = xs => xs.flatMap(x => x.markup
  ? [`- ${x.desc} : ${RM(x.rate)} x ${kv(x.markup)}% = ${RM(x.unitRate)}`, `  ${RM(x.unitRate)} x ${kv(x.qty)} ${x.unit} = ${RM(x.amount)}`]
  : [`- ${x.desc} : ${RM(x.rate)} x ${kv(x.qty)} ${x.unit} = ${RM(x.amount)}`]);
/** pieces shared by the layouts: what goes in (c), (d), (e) and the totals */
function parts(f, res) {
  const lines = res.lines, desc = l => (f.desc || {})[l.id] || l.desc;
  const conn = lines.filter(l => !['scc', 'lcc', 'meter', 'admin', 'testing', 'controlled'].includes(l.comp)), cap = lines.filter(l => l.comp === 'scc' || l.comp === 'lcc');
  const met = lines.filter(l => l.comp === 'meter'), admin = lines.filter(l => l.comp === 'admin'), test = lines.filter(l => l.comp === 'testing'), ctrl = lines.filter(l => l.comp === 'controlled');
  const adjCap = res.adjustments.filter(a => /Contribution/i.test(a.label)), adjConn = res.adjustments.filter(a => !/Contribution/i.test(a.label));
  const sum = (a, k = 'amount') => r2(a.reduce((x, l) => x + l[k], 0));
  const xs = extras(f);
  const c = r2(sum(conn) + sum(adjConn) + sum(xs)), d = r2(sum(cap) + sum(adjCap)), e = sum(met), adm = sum(admin), tst = sum(test), mat = sum(ctrl);
  return { desc, conn, cap, met, admin, test, ctrl, adjCap, adjConn, xs, c, d, e, adm, tst, mat, sum };
}
function common(f, res, P, W) {
  if (!res.complete) W.push('The calculation is incomplete: ' + res.incomplete.join('; '));
  const b = num(f.costNoOH), oh = num(f.costOH) ?? 0, sst = num(f.sst) ?? 0;
  if (b == null) W.push('Enter (b) Total cost of project (without OH) for the CDP line.');
  return { b, oh, sst };
}
function capText(p, style) { // (d) for the standard / TOS / UOS layouts
  const scc = p.cap.find(l => l.comp === 'scc'), lcc = p.cap.find(l => l.comp === 'lcc');
  const names = [lcc && 'LINE CAPACITY CHARGE', scc && 'SUBSTATION CAPACITY CHARGE'].filter(Boolean);
  const ordered = [scc, lcc].filter(Boolean);
  return { names, ordered };
}
function budget(P, total, e, sst, cdpBV, cdpSeek, { na = true } = {}) {
  const taxable = r2(total - e), sstAmt = r2(taxable * sst / 100), withTax = r2(taxable + sstAmt), grand = r2(withTax + e);
  P(`a) TOTAL CCG W/O SST = ${RM(total)}`, `b) TOTAL NON-TAXABLE ITEM-TAX CODE S0 = ${RM(e)} (METER FEE)`,
    sst ? `c) TOTAL TAXABLE ITEM-TAX CODE S1 : (a - b) + ${kv(sst)}% = ${RM(taxable)} + ${kv(sst)}% (${RM(sstAmt)}) = ${RM(withTax)}`
        : `c) TOTAL TAXABLE ITEM-TAX CODE S0 (DOMESTIC) : (a - b) + 0% = ${RM(taxable)} + 0% = ${RM(withTax)}`,
    `d) TOTAL CCG INCLUSIVE OF SERVICE TAX ${kv(sst)}% (c + b) = ${RM(grand)}`, `e) BV CDP ${cdpBV || ''} = ${cdpSeek ? RM(cdpSeek) : na ? 'N/A' : RM(0)}`);
  return { taxable, sstAmt, grand };
}
const remarkOf = (f, sst) => f.remarks || ('FUND TO BE SOUGHT FROM CUSTOMER' + (sst ? ` + ${kv(sst)}% SST.` : '.'));

/** SAL100KW (Commercial), NTK and TOS: the user's SAL100KW / TOS examples */
function standardText(f, res, tos = false) {
  const W = [], out = [], P = (...x) => out.push(...x), p = parts(f, res), { b, oh, sst } = common(f, res, P, W);
  P(up(f.shortTitle), '', `REF. NO : ${f.ref || ''}`, `PROJECT REF: ${f.projectRef || ''}`, `PROJECT TITLE : ${up(f.title)}`, '',
    `CONSULTANT/CONTRACTOR : ${up(f.consultant)}`, `DEVELOPER/CLIENT : ${up(f.client)}${f.ic ? ` (${f.ic})` : ''}`, `CONTACT NO : ${f.contact || ''}`, '',
    `1 ) TYPE OF APPLICATION : ${up(f.appType)}`, `2 ) ESTIMATED CONNECTED LOAD : ${f.load ?? ''} KVA`, `3 ) TARGET DATE OF SUPPLY : ${f.target || ''}`, `4 ) CATEGORY : ${f.cat || ''}`,
    `5 ) TYPE OF USE : ${up(f.use)}`, '6 ) SCHEME OF SUPPLY (with drawing attached):', '', ...String(f.scheme || '').split(/\r?\n/), '',
    '7 ) CONNECTION CHARGE CALCULATIONS:', `(a) TOTAL COST OF PROJECT (WITH OH) : ${RM(oh)}`, `(b) TOTAL COST OF PROJECT (WITHOUT OH) : ${RM(b ?? 0)}`, '(c) CONNECTION COST:', '');
  const items = [...p.conn.map(l => `- ${RM(l.rate)} ${p.desc(l)}${unitWord(l.unit)} x ${kv(l.qty)} ${qtyWord(l.unit)} = ${RM(l.amount)}`), ...p.adjConn.map(a => `- LESS ${a.label.replace(/^Less /i, '')} = ${RM(a.amount)}`)];
  const amounts = [...p.conn.map(l => l.amount), ...p.adjConn.map(a => a.amount), ...p.xs.map(x => x.amount)];
  if (tos) {
    P('LT COST:', ...items, ...(p.xs.length ? ['', ...extraLines(p.xs)] : []), '', `Total LT Cost : ${amounts.map(RM).join(' + ').replace(/\+ - /g, '- ')} = ${RM(p.c)}`, '');
  } else {
    P(...items, ...(p.xs.length ? ['', ...extraLines(p.xs)] : []), '', `Total = ${amounts.length > 1 ? amounts.map(RM).join(' + ').replace(/\+ - /g, '- ') + ' = ' : ''}${RM(p.c)}`, '');
  }
  const { names, ordered } = capText(p);
  if (ordered.length) {
    P(`(d) CAPACITY CHARGE : ${names.join(' + ')}`, `= ${ordered.map(l => `(${kv(l.qty)} kVA X ${RM(l.rate)})`).join(' + ')} = ${RM(p.sum(p.cap))}`);
    for (const a of p.adjCap) P(`LESS ${a.label} = ${RM(a.amount)}`, `CAPACITY CHARGE PAYABLE = ${RM(p.d)}`);
  } else P(tos ? '(d) CAPACITY CHARGE : LINE CAPACITY CHARGE + SUBSTATION CAPACITY CHARGE' : '(d) CAPACITY CHARGE : NOT APPLICABLE', tos ? '= WAIVE FOR TEMPORARY SUPPLY' : '= RM 0.00');
  P('', p.met.length ? `(e) METER FEE : ${p.met.map(l => l.qty === 1 ? `${RM(l.rate)} (${meterShort(l)})` : `${RM(l.rate)} x ${kv(l.qty)} (${meterShort(l)}) = ${RM(l.amount)}`).join(' + ')}` : '(e) METER FEE : RM 0.00', '');
  const total = r2(p.c + p.d + p.e), cdp = b == null ? 0 : r2(b - p.c - p.d), cdpSeek = Math.max(0, cdp);
  P(`(f) TOTAL CUSTOMER CONNECTION CHARGE : (c) + (d) + (e) = ${RM(total)}`, `(g) CAPACITY DEVELOPMENT BV (CDP) : (b) - (c) - (d) = ${RM(cdp)}`, `To seek from ${RM(cdpSeek)} Capacity Development BV ${f.cdpBV || ''}.`, '', '(h) BUDGET ALLOCATION SUMMARY:');
  const bt = budget(P, total, p.e, sst, f.cdpBV, cdpSeek);
  P('', `10 ) SUPPLY TAKEN FROM THE EXISTING : ${up(f.source)}`);
  if (f.feeder || f.r || f.y || f.b) P(`FEEDER : ${f.feeder || ''}`, `R - ${f.r ?? ''} A`, `Y - ${f.y ?? ''} A`, `B - ${f.b ?? ''} A`);
  P('', `11 ) REMARKS : ${up(remarkOf(f, sst))}`, '', `12 ) SUBMITTED BY : ${up(f.submittedBy)}`, '', `13 ) DATE OF SUBMISSION : ${up(f.date)}`);
  check(W, res, total, p);
  return { text: out.join('\r\n'), totals: { c: p.c, d: p.d, e: p.e, total, cdp, cdpSeek, h: bt.grand, pct: 0, gov: 0, cust: bt.grand, band: null }, warnings: W };
}
function check(W, res, total, p) {
  const xs = p.sum(p.xs);
  if (Math.abs(total - xs - res.total) > 0.005) W.push('The long text total does not match the calculator total.');
  if (p.xs.length) W.push(`Extra items not in the Guidelines (${RM(xs)}) are added to the connection cost; they are not in the calculator total.`);
}

/** Upgrading of Supply: the user's UOS example (capacity = actual declared load − existing / minimum assigned load) */
function uosText(f, res) {
  const W = [], out = [], P = (...x) => out.push(...x), p = parts(f, res), { b, oh, sst } = common(f, res, P, W);
  P(up(f.shortTitle), '', `1) REF. NO : ${f.ref || ''}`, `2) PROJECT REF : ${f.projectRef || ''}`, `3) PROJECT TITLE : ${up(f.title)}`, '',
    `4) CONSULTANT/CONTRACTOR : ${up(f.consultant)}`, `5) DEVELOPER/CLIENT : ${up(f.client)}${f.ic ? ` (${f.ic})` : ''}`, `6) CONTACT NO : ${f.contact || ''}`, '',
    `7) TYPE OF APPLICATION: ${up(f.appType)}`, `8) ESTIMATED CONNECTED LOAD: ${f.load ?? ''} kVA`, `9) TARGET DATE OF SUPPLY: ${f.target || ''}`, `10) CATEGORY: ${f.cat || ''}`,
    `11) TYPE OF USE: ${up(f.use)}`, '12) SCHEME OF SUPPLY (With drawing attached)', '', ...String(f.scheme || '').split(/\r?\n/), '',
    '13) CONNECTION CHARGE CALCULATIONS:', `(a) TOTAL COST OF PROJECT (WITH OH): ${RM(oh)}`, `(b) TOTAL COST OF PROJECT (WITHOUT OH): ${RM(b ?? 0)}`, '(c) CONNECTION COST:', '', 'LT Cost:', '',
    ...p.conn.map(l => l.qty === 1 && l.unit === 'each' ? `- ${p.desc(l)} = ${RM(l.amount)}` : `- ${p.desc(l)} : ${RM(l.rate)} x ${kv(l.qty)} ${qtyWord(l.unit)} = ${RM(l.amount)}`),
    ...p.adjConn.map(a => `- LESS ${a.label.replace(/^Less /i, '')} = ${RM(a.amount)}`), ...(p.xs.length ? ['', ...extraLines(p.xs)] : []));
  const amounts = [...p.conn.map(l => l.amount), ...p.adjConn.map(a => a.amount), ...p.xs.map(x => x.amount)];
  P('', `Total = ${amounts.length > 1 ? amounts.map(RM).join(' + ').replace(/\+ - /g, '- ') + ' = ' : ''}${RM(p.c)}`, '');
  const scc = p.cap.find(l => l.comp === 'scc'), lcc = p.cap.find(l => l.comp === 'lcc');
  if (p.cap.length) {
    const L = res.load || {}, ex = num(f.existing), q = p.cap[0].qty;
    P(`(d) CAPACITY CHARGE: ${[scc && 'SUBSTATION CAPACITY CHARGE', lcc && 'LINE CAPACITY CHARGE'].filter(Boolean).join(' + ')}`);
    if (ex != null && L.perUnit != null) P(`= ACTUAL DECLARE LOAD - ${up(f.existingLabel || 'MINIMUM ASSIGNED LOAD')}`, `= ${kv(L.perUnit * (L.units || 1))} kVA - ${kv(ex)} kVA = ${kv(q)} kVA`);
    P(`=[${[scc, lcc].filter(Boolean).map(l => `(${kvRM(l.rate)} x ${kv(l.qty)} kVA)`).join(' + ')}]`, `= ${RM(p.sum(p.cap))}`);
    for (const a of p.adjCap) P(`LESS ${a.label} = ${RM(a.amount)}`, `CAPACITY CHARGE PAYABLE = ${RM(p.d)}`);
  } else P('(d) CAPACITY CHARGE: NOT APPLICABLE = RM 0.00');
  P('', p.met.length ? `(e) METER FEE: ${p.met.map(l => l.qty === 1 ? RM(l.rate) : `${RM(l.rate)} x ${kv(l.qty)} = ${RM(l.amount)}`).join(' + ')}` : '(e) METER FEE: RM 0.00', '');
  const total = r2(p.c + p.d + p.e), cdp = b == null ? 0 : r2(b - p.c - p.d), cdpSeek = Math.max(0, cdp);
  P(`(f) TOTAL CUSTOMER CONNECTION CHARGE: (c) + (d) + (e) = ${RM(total)}`, `(g) CAPACITY DEVELOPMENT BV (CDP): (b) - (c) - (d) = ${RM(cdp)}`, `     To seek ${RM(cdpSeek)} from Capacity Development BV.`, '', '(h) BUDGET ALLOCATION SUMMARY:');
  const bt = budget(P, total, p.e, sst, f.cdpBV, cdpSeek, { na: false });
  P('', `14) SUPPLY TAKEN FROM EXISTING: ${up(f.source)}`);
  if (f.feeder || f.r || f.y || f.b) P(`FEEDER : ${f.feeder || ''}`, `R - ${f.r ?? ''} A   Y - ${f.y ?? ''} A   B - ${f.b ?? ''} A`);
  P('', `15) SUBMITTED BY : ${up(f.submittedBy)}`, '', `16) REMARKS : ${up(remarkOf(f, sst))}`, '', `17) DATE OF SUBMISSION : ${up(f.date)}`);
  if (p.cap.length && num(f.existing) == null) W.push('Upgrading of Supply: enter the existing / minimum assigned load in the calculator to show "actual declared load − existing load".');
  check(W, res, total, p);
  return { text: out.join('\r\n'), totals: { c: p.c, d: p.d, e: p.e, total, cdp, cdpSeek, h: bt.grand, pct: 0, gov: 0, cust: bt.grand, band: null }, warnings: W };
}

/** Turnkey Stage 2: the user's TK2 example (meters, turnkey administration fee, capacity charge, performance bonds, connection cost, budget) */
function tk2Text(f, res) {
  const W = [], out = [], P = (...x) => out.push(...x), p = parts(f, res), { b, sst } = common(f, res, P, W);
  P(up(f.shortTitle), '', `REF. NO.: ${f.ref || ''}`, `PROJECT REF: ${f.projectRef || ''}`, `PROJECT TITLE: ${up(f.title)}`, '',
    `CONSULTANT / CONTRACTOR : ${up(f.consultant)}`, `DEVELOPER/CLIENT : ${up(f.client)}${f.ic ? ` (${f.ic})` : ''}`,
    `1 ) TYPE OF APPLICATION : ${up(f.appType)}`, `2 ) ESTIMATED CONNECTED LOAD : ${f.load ?? ''} kVA`, `3 ) TARGET DATE OF SUPPLY : ${f.target || ''}`, `4 ) CATEGORY : ${f.cat || ''}`,
    `5) TYPE OF USE: ${up(f.use)}`, '6) SCHEME OF SUPPLY (with drawing attached):', '', ...String(f.scheme || '').split(/\r?\n/), '');
  // meters charged under the connection charge
  if (p.met.length) {
    P('*THE FOLLOWING METERS SHALL BE SUPPLIED BY SYARIKAT SESCO BERHAD AND SHALL BE CHARGED UNDER THE CONNECTION CHARGE: -',
      ...p.met.map((l, i) => `${i + 1}. ${RM(l.rate)} ${p.desc(l)} (each) x ${kv(l.qty)} ea = ${RM(l.amount)}`), '',
      `Total : ${p.met.length > 1 ? p.met.map(l => RM(l.amount)).join(' + ') + ' = ' : ''}${RM(p.e)}`, '');
  }
  // turnkey administration fee
  const af = code => p.admin.find(l => l.code === code), roman = ['i.', 'ii.', 'iii.', 'iv.', 'v.'];
  const len = k => num(f[k]);
  P('7). TURNKEY ADMINISTRATION FEE:-');
  const civ = af('AF-01'), ele = af('AF-02'), hv = af('AF-03'), lv = af('AF-04'), shown = [];
  P(civ ? `${roman[0]}   SUBSTATION CIVIL WORKS - ${RM(civ.rate)} X ${kv(civ.qty)} Nos. = ${RM(civ.amount)}` : `${roman[0]}   SUBSTATION CIVIL WORKS - N/A`);
  P(ele ? `${roman[1]}  SUBSTATION ELECTRICAL WORKS - ${RM(ele.rate)} X ${kv(ele.qty)} Nos. = ${RM(ele.amount)}` : `${roman[1]}  SUBSTATION ELECTRICAL WORKS - N/A`);
  const lenLines = (label, l, m, per, unitTxt, rateTxt) => {
    if (m == null && !l) return [`${label} TOTAL LENGTHS = N/A`];
    const n = m != null ? ceilDiv(m, per) : l.qty, rate = l ? l.rate : null;
    const outL = [`${label} TOTAL LENGTHS = ${m != null ? kv(m) + 'm' : 'N/A'}`];
    if (m != null) outL.push(`     Total = ${kv(m)}m/${unitTxt} = (${kv(r2(m / per))}) Roundup to next whole number = ${n}`);
    if (rate != null) outL.push(`           = (${rateTxt}) = ${RM(rate)} x ${n} = ${RM(r2(rate * n))}`);
    return outL;
  };
  const hvM = len('hvLen'), ohM = len('ltOhLen'), ugM = len('ltUgLen');
  P(...lenLines(`${roman[2]} HIGH VOLTAGE U/G CABLES`, hv, hvM, 1000, '1km', `RM ${hv ? kv(hv.rate) : 500}/Per 1km circuit`).map((x, i) => i ? x : x.replace(/^iii\. /, 'iii. ')));
  P(...lenLines(`${roman[3]}  LOW VOLTAGE LT O/H LINES`, ohM != null ? lv : null, ohM, 500, '500m', `RM ${lv ? kv(lv.rate) : 200}/Per 500m circuit`));
  P(...lenLines(`${roman[4]}   LOW VOLTAGE LT U/G LINES`, ugM != null ? lv : null, ugM, 500, '500m', `RM ${lv ? kv(lv.rate) : 200}/Per 500m circuit`));
  if (hv && hvM != null && ceilDiv(hvM, 1000) !== hv.qty) W.push(`HV length ${hvM}m gives ${ceilDiv(hvM, 1000)} circuit(s), but the calculator has ${hv.qty}.`);
  const lvN = (ohM != null ? ceilDiv(ohM, 500) : 0) + (ugM != null ? ceilDiv(ugM, 500) : 0);
  if (lv && (ohM != null || ugM != null) && lvN !== lv.qty) W.push(`LT lengths give ${lvN} circuit(s), but the calculator has ${lv.qty}.`);
  if (lv && ohM == null && ugM == null) W.push('Enter the LT O/H or U/G length to show the low voltage administration fee working.');
  P('', `TOTAL : ${p.admin.length ? p.admin.map(l => RM(l.amount)).join(' + ') + ' = ' : ''}${RM(p.adm)}`, '(to be translated into salary, transportation & miscellaneous charges)', '');
  // capacity charge
  P('CAPACITY CHARGE :');
  const lcc = p.cap.find(l => l.comp === 'lcc'), scc = p.cap.find(l => l.comp === 'scc');
  if (scc) P(`SUBSTATION CAPACITY CHARGE : ${kv(scc.qty)} kVA X ${RM(scc.rate)} = ${RM(scc.amount)}`);
  P(lcc ? `8) LINE CAPACITY CHARGE : ${kv(lcc.qty)} kVA X ${RM(lcc.rate)} = ${RM(lcc.amount)}` : '8) LINE CAPACITY CHARGE : N/A');
  for (const a of p.adjCap) P(`LESS ${a.label} = ${RM(a.amount)}`);
  // performance bonds
  const bond = num(f.bondRate) ?? 50, tr = num(f.trafoKva), ld = num(f.load);
  P('', '9 ) PERFORMANCE BOND FOR TRANSFORMER :-', tr != null ? `    RM${kv(bond)}/KVA X ${kv(tr)} kVA = ${RM(bond * tr)} , made valid for ${f.bondTrafoYears || 'two (2)'} years.` : '    N/A', '',
    '    PERFORMANCE BOND FOR OTHER INSTALLATION :-', ld != null ? `    RM${kv(bond)}/KVA X ${kv(ld)} kVA = ${RM(bond * ld)} , made valid for ${f.bondOtherYears || 'one (1)'} year.` : '    N/A', '');
  // testing fee
  P(p.test.length ? '10) TESTING FEE :' : '10) TESTING FEE : N/A', ...p.test.map(l => `    - ${RM(l.rate)} ${p.desc(l)} x ${kv(l.qty)} = ${RM(l.amount)}`), ...(p.test.length > 1 ? [`    TOTAL : ${RM(p.tst)}`] : []), '');
  // connection cost
  const matOv = num(f.material), mat = matOv ?? p.mat;
  if (matOv != null && Math.abs(matOv - p.mat) > 0.005) W.push(`Material price ${RM(matOv)} was typed in; the calculator's controlled items come to ${RM(p.mat)}.`);
  const cdp = b == null ? 0 : r2(b - mat - p.tst - p.d - p.adm), cdpSeek = Math.max(0, cdp);
  P('11 ) CONNECTION COST :', `    b) TOTAL COST OF PROJECT (WITHOUT OH) = ${RM(b ?? 0)}`, `    c) MATERIAL PRICE = ${RM(mat)}`, `    d) TESTING FEE = ${p.test.length ? RM(p.tst) : 'N/A'}`,
    `    e) CAPACITY CHARGE = ${RM(p.d)}`, `    f) ADMINISTRATION FEE = ${RM(p.adm)}`, `    g) METER FEE = ${RM(p.e)}`, `    h) CDP(${f.cdpBV || ''}): (b) - (c) - (d) - (e) - (f) = ${RM(cdp)}`, '',
    `*To seek ${RM(cdpSeek)} from Capacity Development BV.`, '');
  // budget: meter fee + material are not taxable; testing + capacity + administration are
  const total = r2(mat + p.tst + p.d + p.adm + p.e + p.c), s0 = r2(p.e + mat), taxable = r2(p.tst + p.d + p.adm + p.c), sstAmt = r2(taxable * sst / 100), grand = r2(s0 + taxable + sstAmt);
  P('12) BUDGET ALLOCATION SUMMARY:', `a) TOTAL CCG W/O SST = ${RM(total)}`, `b) TOTAL NON-TAXABLE ITEM-TAX CODE S0 = METER FEE + MATERIAL PRICE = ${RM(p.e)} + ${RM(mat)} = ${RM(s0)}`,
    `c) TOTAL TAXABLE ITEM-TAX CODE ${sst ? 'S1' : 'S0'}: ((d) + (e) + (f)) + ${kv(sst)}% = ${RM(taxable)} + ${kv(sst)}% (${RM(sstAmt)} ) = ${RM(r2(taxable + sstAmt))}`,
    `d) TOTAL CCG INCLUSIVE OF SERVICE TAX ${kv(sst)}% (b + c) = ${RM(grand)}`, `e) ${f.cdpBV || ''} BV CDP = ${RM(cdpSeek)}`, '',
    `13) SUBMITTED BY: ${up(f.submittedBy)}`, '', `14) DATE OF SUBMISSION: ${up(f.date)}`, '', `15) REMARKS : ${up(remarkOf(f, 0))}`);
  if (p.conn.length) W.push('This Turnkey project also has normal connection cost items; they are included in the totals but not listed in the TK2 layout.');
  if (matOv == null) check(W, res, total, p);
  return { text: out.join('\r\n'), totals: { c: r2(mat + p.c), d: p.d, e: p.e, total, cdp, cdpSeek, h: grand, pct: 0, gov: 0, cust: grand, band: null, adm: p.adm, tst: p.tst, mat }, warnings: W };
}

/** f.layout picks the layout (see LAYOUTS); without it, the subsidy layout (the original one) */
export function longText(f, res) {
  switch (f.layout) {
    case 'standard': return standardText(f, res, false);
    case 'tos': return standardText(f, res, true);
    case 'uos': return uosText(f, res);
    case 'tk2': return tk2Text(f, res);
    default: return subsidyText(f, res);
  }
}
