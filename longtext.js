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
export function longText(f, res) {
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
