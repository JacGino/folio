// Folio v2 — Connection Charge engine (no screen code, so it can be unit-tested on its own).
// Methodology: Section 3.2 (pages 8–9) with its footnotes. Capacity charges: Sections 5.1, 5.2 (pages 13–15).
// SESCO Contribution: Section 3.1.17. Engineering Fee: 3.1.14. All rates come from ccrates.js (Guidelines 2019 Rev 1.0).
import { RATE, RATES, PREMISE, COMPONENTS, GUIDELINE } from './ccrates.js';

export const ELIGIBLE_PROJECT_CATS = ['SAL100KW', 'Upgrading of Supply', 'Temporary Supply', 'Non Turnkey', 'Turnkey Stage 2'];
export const CATS = { 1: 'Category 1 — Individual (Residential)', 2: 'Category 2 — Housing & Shophouse Developments', 3: 'Category 3 — Other Individual and Development', 4: 'Category 4 — Temporary' };
export const SCOPES = { lt: 'Low Tension Only', ltup: 'Low Tension with Upgrading of Existing Substation and/or HT Line', ltnew: 'Low Tension with New Substation and/or Extension HT Line', ht: 'High Tension Only' };
export const METHODS = { normal: 'Normal', turnkey: 'Turnkey' };

const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
export const rm = n => 'RM' + (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = v => v === '' || v == null || isNaN(+v) ? null : +v;

// ---------- Section 3.2 matrix ----------
// tokens: "?" = where applicable (optional); "^1" footnote 1 (dedicated substation); "^2" footnote 2 (new HT line from Zone Substation);
// "ht50" = 50% High Tension Extension Cost (Category 1); "htx" = Category 2 HT extension within / beyond 1000m.
const TK_LT = ['admin', 'testing', 'scc', 'lcc', 'controlled', 'meter'], TK_UP = ['admin', 'testing', 'lcc', 'controlled', 'meter'], TK_NEW = ['admin', 'testing', 'lcc^2', 'controlled', 'meter'];
const TK_TEMP = ['admin', 'testing', 'controlled', 'meter'];
const MATRIX = {
  1: { lt: { normal: ['lt', 'scc', 'lcc', 'meter'], turnkey: TK_LT }, ltup: { normal: ['lt', 'scc', 'lcc', 'meter'], turnkey: TK_UP },
       ltnew: { normal: ['lt', 'scc^1', 'lcc^2', 'ht50', 'meter'], turnkey: TK_NEW }, ht: null },
  2: { lt: { normal: ['perhouse', 'ltstreet?', 'lcc', 'meter'], turnkey: TK_LT }, ltup: { normal: ['perhouse', 'ltstreet?', 'lcc', 'meter'], turnkey: TK_UP },
       ltnew: { normal: ['perhouse', 'ltstreet?', 'lcc^2', 'htx', 'meter'], turnkey: TK_NEW }, ht: null },
  3: { lt: { normal: ['lt', 'scc', 'lcc', 'meter'], turnkey: TK_LT }, ltup: { normal: ['lt', 'scc', 'lcc', 'meter'], turnkey: TK_UP },
       ltnew: { normal: ['lt', 'substation', 'lcc^2', 'ht', 'meter'], turnkey: TK_NEW }, ht: { normal: ['ht', 'substation?', 'lcc^2', 'meter'], turnkey: TK_NEW } },
  4: { lt: { normal: ['lt', 'meter'], turnkey: TK_TEMP }, ltup: { normal: ['lt', 'substation', 'meter'], turnkey: TK_TEMP },
       ltnew: { normal: ['lt', 'substation', 'ht', 'meter'], turnkey: TK_TEMP }, ht: { normal: ['ht', 'substation?', 'meter'], turnkey: TK_TEMP } },
};
const AUTO = new Set(['scc', 'lcc', 'perhouse', 'engfee']);

/** which charge components apply. inp: { cat, method, scope, dedicated, fromZone, htLen, engAfterRelease } */
export function methodology(inp) {
  const cat = +inp.cat, row = MATRIX[cat], ref = `Section 3.2, ${CATS[cat] || ''} — ${SCOPES[inp.scope] || ''} (${METHODS[inp.method] || ''})`;
  if (!row || !SCOPES[inp.scope] || !METHODS[inp.method]) return { na: null, missing: true, comps: [], notes: [], ref };
  const cell = row[inp.scope];
  if (!cell) return { na: `${SCOPES[inp.scope]} is Not Applicable for ${CATS[cat]} (Section 3.2).`, comps: [], notes: [], ref };
  const comps = [], notes = [];
  // a Temporary Supply project: Substation and Line Capacity Charges are waived, whatever the charging category
  if (inp.tos && cat !== 4) notes.push('Temporary Supply: Substation Capacity Charge and Line Capacity Charge are waived.');
  const add = (key, extra = {}) => comps.push({ key, label: COMPONENTS[key], mode: AUTO.has(key) ? 'auto' : 'items', required: true, ...extra });
  for (const t of cell[inp.method]) {
    const optional = t.endsWith('?'), base = t.replace(/[?]|\^\d/g, '');
    if (inp.tos && (base === 'scc' || base === 'lcc') && !(t.includes('^1') && inp.dedicated)) continue; // waived for Temporary Supply (a dedicated substation is still its full cost)
    if (t.includes('^1')) { // [1] If new substation is dedicated, full Substation Cost is charged instead of Substation Capacity Charge.
      if (inp.dedicated) { add('substation', { rule: 'Footnote [1]: new substation is dedicated — full Substation Cost instead of Substation Capacity Charge.' }); notes.push('Footnote [1] applied: Substation Capacity Charge replaced by full Substation Cost.'); }
      else add('scc', { rule: 'Footnote [1]: shared new substation — Substation Capacity Charge.' });
      continue;
    }
    if (t.includes('^2')) { // [2] If new high tension line is constructed from Zone Substation, Line Capacity Charge is not applicable.
      if (inp.fromZone) notes.push('Footnote [2] applied: new high tension line is constructed from Zone Substation, so Line Capacity Charge is not applicable.');
      else add(base, { rule: 'Footnote [2]: Line Capacity Charge applies unless the new HT line is constructed from Zone Substation.' });
      continue;
    }
    if (base === 'ht50') { add('ht', { factor: 0.5, rule: 'Category 1 (Normal): 50% High Tension Extension Cost (Section 3.2).' }); continue; }
    if (base === 'htx') {
      const len = num(inp.htLen);
      if (len == null) add('htexcess', { required: true, needsLen: true, rule: 'Category 2: HT extension within 1000m is covered by the Per House Fee; beyond 1000m, High Tension Cost in excess of 1000m is charged (Sections 3.1.10, 3.2).' });
      else if (len > 1000) add('htexcess', { excess: len - 1000, rule: `Category 2: extension of existing HV line is ${len}m, beyond 1000m — charge High Tension Cost for the ${len - 1000}m in excess of 1000m (Section 3.2).` });
      else notes.push(`Category 2: extension of existing HV line is ${len}m (within 1000m) — HT extension is covered by the Per House Fee (Sections 3.1.10, 3.2).`);
      continue;
    }
    add(base, optional ? { required: false, rule: 'Where applicable (Section 3.2).' } : {});
  }
  if (cat === 2 && inp.method === 'normal') notes.push('Category 2: Substation Capacity Charge is inclusive in the Per House Fee (Section 5.2.1 a; Section 3.1.10), so it is not charged separately.');
  if (cat === 4) notes.push('Category 4 (Temporary): capacity charges are not part of this methodology (Section 3.2).');
  if (inp.method === 'turnkey' && inp.engAfterRelease) add('engfee', { rule: 'Section 3.1.14: Turnkey chosen after SESCO released the Normal Project Connection Charges.' });
  return { na: null, comps, notes, ref };
}

// ---------- Sections 5.1 / 5.2: chargeable load ----------
/** minimum assigned load used for supply upgrading: the premise's Table 5.1 value; null when the premise has none */
export function upgradeMin(inp, p = PREMISE[inp.premise]) {
  if (!p || p.perLamp) return null;
  return p.listed && p.mal != null ? p.mal : null; // Table 5.1, single or three phase (e.g. BTU-260499: 18.65 − 3 kVA terrace)
}
/** the minimum assigned load is a floor: when the customer applies for more (per unit), the actual applied load is charged */
function atLeastMin(out, applied, min, minText) {
  if (applied != null && applied > min) { out.perUnit = applied; out.basis = `Applied Load ${applied} kVA is more than the minimum (${minText}), so the actual applied load is charged`; }
  else { out.perUnit = min; out.basis = minText; }
}
/** inp: { phase: 1|3, premise, applied, units, upgrade, existing } → { perUnit, units, total, basis, ref, errors, warnings } */
/** chargeable load. With a different applied load per applicant (inp.perApplicant + inp.loads), each applicant is worked out
 *  on its own with the same rules (minimum / actual / upgrading) and the results are added up; an empty box uses inp.applied. */
export function chargeableLoad(inp) {
  const units = Math.max(1, Math.floor(num(inp.units) || 1));
  const loads = inp.premise !== 'publight' && Array.isArray(inp.loads) ? inp.loads.slice(0, units) : null;
  if (!loads || units < 2 || !loads.some(v => num(v) != null)) return chargeableOne(inp);
  const parts = [];
  for (let i = 0; i < units; i++) { const a = num(loads[i]) != null ? loads[i] : inp.applied; parts.push({ applied: num(a), r: chargeableOne({ ...inp, applied: a, units: 1, perApplicant: false, loads: null }) }); }
  const first = parts[0].r, out = { perUnit: null, units, total: null, basis: '', ref: first.ref, mode: first.mode, errors: [], warnings: [], perApplicant: true, items: [] };
  for (const [i, x] of parts.entries()) { for (const e of x.r.errors) if (!out.errors.includes(e)) out.errors.push(x.applied == null ? `Applied Load for applicant ${i + 1}` : e); for (const w of x.r.warnings) if (!out.warnings.includes(w)) out.warnings.push(w); }
  if (out.errors.length) return out;
  out.items = parts.map(x => x.r.total);
  out.total = r2(out.items.reduce((s2, v) => s2 + v, 0));
  if (parts.every(x => x.r.gross != null && x.r.minus != null)) { out.gross = r2(parts.reduce((s2, x) => s2 + x.r.gross, 0)); out.minus = r2(parts.reduce((s2, x) => s2 + x.r.minus, 0)); }
  const fmt = v => String(+(+v).toFixed(3));
  out.basis = `Different load per applicant: ${parts.map((x, i) => `${i + 1}) ${x.applied == null ? '—' : fmt(x.applied)} → ${fmt(x.r.total)}`).join(', ')} kVA; total ${fmt(out.total)} kVA (each charged at the minimum, or the applied load if higher${inp.upgrade ? '; upgrading = applied − minimum' : ''})`;
  return out;
}
function chargeableOne(inp) {
  const p = PREMISE[inp.premise], applied = num(inp.applied), units = Math.max(1, Math.floor(num(inp.units) || 1));
  const out = { perUnit: null, units, total: null, basis: '', ref: '', errors: [], warnings: [] };
  if (!p) { out.errors.push('Premise Type'); return out; }
  if (inp.phase !== 1 && inp.phase !== 3) { out.errors.push('Supply Phase'); return out; }
  if (applied != null && applied <= 0) out.errors.push('Applied Load must be more than 0 kVA');
  const basis = inp.basis === 'guideline' ? 'guideline' : 'practice';
  if (p.perLamp) { // public lighting: charge actual — LED 70W = 0.08 kVA per unit, no minimum
    out.mode = basis; out.perUnit = p.perLamp; out.basis = `Public lighting LED 70W: ${p.perLamp} kVA per unit (charge actual, no minimum)`; out.ref = 'Your rule: public lighting charged actual';
    out.total = r2(out.perUnit * units); if (units > 1) out.basis += ` × ${units} units`; return out;
  }
  out.mode = basis;
  if (basis === 'practice') {
    // Your rule: single phase charged at least 5 kVA, three phase at least 10 kVA.
    // Table 5.1 Minimum Assigned Load is used only for Longhouse units and for supply upgrading.
    const lh = inp.premise === 'lh1' || inp.premise === 'lh2';
    if (inp.phase === 1 && p.listed && p.threeOnly) { out.errors.push(`${p.label} at minimum requires three phase supply (Section 5.2.1 a)`); return out; }
    if (applied != null && applied > 10) { out.perUnit = applied; out.basis = `Applied Load ${applied} kVA is more than 10 kVA, so the actual applied load is charged`; out.ref = 'Your rule: above 10 kVA, charge actual'; }
    else if (inp.phase === 1 && (lh || inp.upgrade) && p.listed) { atLeastMin(out, applied, p.mal, `Minimum Assigned Load for ${p.label} = ${p.mal} kVA (${lh ? 'Longhouse' : 'supply upgrading'})`); out.ref = 'Table 5.1; your rule'; }
    else {
      if (applied == null) { out.errors.push('Applied Load (kVA)'); return out; }
      const min = inp.phase === 1 ? 5 : 10;
      out.perUnit = Math.max(applied, min);
      out.basis = applied < min ? `Applied Load ${applied} kVA is below ${min} kVA, so ${min} kVA is charged (${inp.phase === 1 ? 'single' : 'three'} phase)` : `Applied Load ${applied} kVA (${inp.phase === 1 ? 'single phase, 5 kVA minimum' : 'three phase, 10 kVA minimum'})`;
      out.ref = 'Your rule: 1-phase min 5 kVA, 3-phase min 10 kVA';
    }
  } else if (inp.phase === 1) {
    if (p.listed && p.threeOnly) { out.errors.push(`${p.label} at minimum requires three phase supply (Section 5.2.1 a)`); return out; }
    if (p.listed) { atLeastMin(out, applied, p.mal, `Minimum Assigned Load for ${p.label} = ${p.mal} kVA`); out.ref = 'Table 5.1; Section 5.2.1(a)'; }
    else { if (applied == null) { out.errors.push('Applied Load (kVA) — premise is not listed in Table 5.1'); return out; } out.perUnit = applied; out.basis = 'Applied Load (premise not listed in Table 5.1)'; out.ref = 'Section 5.2.1(b)'; }
  } else if (p.res && p.listed) { atLeastMin(out, applied, 10, `Three phase residential premise listed in Table 5.1 = 10 kVA`); out.ref = 'Section 5.2.2(a)'; }
  else {
    if (applied == null) { out.errors.push('Applied Load (kVA)'); return out; }
    out.perUnit = Math.max(applied, 10); out.basis = `Higher of Applied Load (${applied} kVA) or 10 kVA`; out.ref = 'Section 5.2.2(b)';
    if (p.res && !p.listed) out.warnings.push('Residential premise not listed in Table 5.1 on three phase: Section 5.2.2(a) covers listed residential premises only, so the Section 5.2.2(b) basis (higher of Applied Load or 10 kVA) is used. Please confirm.');
  }
  // Table 5.1 footnotes [1], [2]: above 2kVA or three phase → classify as Detached / Semi-Detached / Terrace
  if ((p.fn === 1 || p.fn === 2) && (inp.phase === 3 || (applied != null && applied > 2))) out.errors.push(`${p.label} applies only up to 2kVA on single phase. Choose Detached, Semi-Detached or Terrace/Quadrant House (Table 5.1 footnotes)`);
  out.total = r2(out.perUnit * units);
  if (units > 1) out.basis += ` × ${units} units`;
  if (inp.upgrade) { // supply upgrading: Applied Load − Minimum Assigned Load (per unit) — your rule; Section 5.2.3 charges only the increase
    const mal = upgradeMin(inp, p);
    if (mal != null) {
      if (applied == null) { out.errors.push('Applied Load (kVA) for supply upgrading'); return out; }
      const per = r2(Math.max(0, applied - mal));
      out.perUnit = per; out.total = r2(per * units); out.gross = r2(applied * units); out.minus = r2(mal * units); // for the Long Text line
      out.basis = `Supply upgrading: Applied Load ${applied} kVA − Minimum Assigned Load ${mal} kVA = ${per} kVA` + (units > 1 ? ` × ${units} units` : '');
      out.ref = 'Table 5.1; Section 5.2.3; your rule';
      if (per === 0) out.warnings.push('Applied Load is not more than the Minimum Assigned Load: no extra capacity to charge for the upgrade.');
      return out;
    }
    const ex = num(inp.existing);
    if (ex == null) { out.errors.push('Existing capacity (kVA) for supply upgrading — this premise has no Table 5.1 minimum'); return out; }
    const diff = r2(Math.max(0, out.total - ex));
    out.basis += ` − existing ${ex} kVA (supply upgrading)`; out.ref += '; Section 5.2.3'; out.total = diff;
    if (diff === 0) out.warnings.push('New capacity requirement is not more than the existing capacity: no incremental capacity to charge (Section 5.2.3).');
  }
  return out;
}

/** Section 3.1.17(a)/(c): SESCO contribution for small residential loads (≤ 2kVA per unit) */
export function contributionEligible(inp) {
  const p = PREMISE[inp.premise]; if (!p || !p.contrib) return false;
  const each = inp.perApplicant && Array.isArray(inp.loads) ? inp.loads.slice(0, Math.max(1, Math.floor(num(inp.units) || 1))).map(v => num(v) != null ? num(v) : num(inp.applied)) : [num(inp.applied)];
  return each.every(a => { const per = a != null ? a : p.mal; return per != null && per <= 2; });
}

/** items you may add for a component (only applicable items from the catalogue) */
export function itemsFor(comp, inp) {
  const cat = +inp.cat;
  const table = { lt: 'lt', ltstreet: 'lt', ht: 'ht', htexcess: 'ht', substation: 'substation', controlled: 'controlled', admin: 'admin', testing: 'testing', meter: 'meter' }[comp];
  if (!table) return [];
  return RATES.filter(r => r.comp === table && (comp !== 'ltstreet' || r.street) && (!r.cats || r.cats.includes(cat))
    && (comp !== 'meter' || !r.phase || r.phase === inp.phase || (r.phase === 3 && inp.scope === 'ht')) && (!r.contributionOnly || contributionEligible(inp)));
}

// ---------- the whole calculation ----------
/** state: { inputs, lines: [{ id, comp, code, qty, override: { rate, reason } }], notRequired: { comp: reason } } */
export function calculate(state) {
  const inp = state.inputs || {}, m = methodology(inp), res = { method: m, lines: [], adjustments: [], subtotal: 0, total: 0, incomplete: [], warnings: [], excluded: [], load: null, guideline: GUIDELINE.id };
  const need = (cond, msg) => { if (cond) res.incomplete.push(msg); };
  need(!inp.cat, 'Connection Charging Category'); need(!inp.method, 'Charging Method'); need(!inp.scope, 'Scope of Work'); need(inp.phase !== 1 && inp.phase !== 3, 'Supply Phase'); need(!inp.premise, 'Premise Type');
  if (m.na) { res.na = m.na; return res; }
  const has = k => m.comps.some(c => c.key === k), comp = k => m.comps.find(c => c.key === k);
  // capacity charges
  if ((has('scc') || has('lcc')) && inp.premise && (inp.phase === 1 || inp.phase === 3)) {
    const L = chargeableLoad(inp); res.load = L; L.errors.forEach(e => res.incomplete.push(e)); res.warnings.push(...L.warnings);
    if (L.total != null && !L.errors.length) for (const k of ['scc', 'lcc']) if (has(k)) {
      const rate = RATE[k === 'scc' ? 'CC-01' : 'CC-02'];
      res.lines.push(line(rate, L.total, { auto: true, spec: `${rm(rate.rate)}/kVA × ${fmtQ(L.total)} kVA`, rule: `${L.basis} (${L.ref})` + (comp(k).rule ? ' · ' + comp(k).rule : '') }));
    }
  } else if (inp.premise && (inp.phase === 1 || inp.phase === 3)) { const L = chargeableLoad(inp); res.load = L; }
  // per house fee (Category 2, Normal)
  if (has('perhouse')) {
    const r = RATE[inp.houseType];
    if (!r) res.incomplete.push('House type (Table 4.2 Per House Fee)');
    else {
      if (r.phase && (inp.phase === 1 || inp.phase === 3) && r.phase !== inp.phase) res.incomplete.push(`House type "${r.desc}" does not match ${inp.phase === 1 ? 'Single' : 'Three'} Phase supply`);
      else res.lines.push(line(r, Math.max(1, Math.floor(num(inp.units) || 1)), { auto: true, spec: r.desc, rule: 'Per House Fee covers low tension, substation capacity charges and HT extension up to 1km circuit length (Section 3.1.10).' }));
    }
  }
  if (has('engfee')) res.lines.push(line(RATE['EF-01'], 1, { auto: true, rule: comp('engfee').rule }));
  // itemised components (from the catalogue)
  for (const l of state.lines || []) {
    const r = RATE[l.code]; if (!r) { res.incomplete.push(`Rate ${l.code} is not in ${GUIDELINE.id}`); continue; }
    const c = comp(l.comp);
    if (!c || !itemsFor(l.comp, inp).some(x => x.code === l.code)) { res.excluded.push({ ...l, desc: r.desc, why: c ? 'This item is not applicable to the current inputs.' : `${COMPONENTS[l.comp]} is not part of this methodology.` }); continue; }
    const q = num(l.qty);
    if (q == null || q < 0) { res.incomplete.push(`Quantity for ${r.desc}`); continue; }
    res.lines.push(line(r, q, { id: l.id, comp: l.comp, override: l.override, rule: c.rule || '', note: l.note }));
  }
  // every required itemised component needs items (or an explicit "not required" with a reason)
  for (const c of m.comps) if (c.mode === 'items' && c.required && !res.lines.some(x => x.comp === c.key) && !(state.notRequired || {})[c.key])
    res.incomplete.push(c.needsLen ? 'HT extension distance (m) — within or beyond 1000m (Category 2)' : `${c.label}: add at least one item, or mark it as not required with a reason`);
  if (has('htexcess') && comp('htexcess').needsLen) {} // reported above
  // adjustments supported by the guideline
  const sum = k => res.lines.filter(x => x.comp === k).reduce((a, x) => a + x.amount, 0);
  if (comp('ht')?.factor === 0.5 && sum('ht')) res.adjustments.push({ label: 'Less 50% of High Tension Extension Cost', amount: r2(-0.5 * sum('ht')), rule: 'Category 1 (Normal), Low Tension with New Substation and/or Extension HT Line: 50% High Tension Extension Cost (Section 3.2).' });
  if (inp.contribution && contributionEligible(inp) && (sum('scc') || sum('lcc'))) res.adjustments.push({ label: 'SESCO Contribution — capacity charges', amount: r2(-(sum('scc') + sum('lcc'))), rule: 'Capacity charges for the residential types in Section 3.1.17(a) with applied load not exceeding 2kVA per unit are borne by SESCO.' });
  res.subtotal = r2(res.lines.reduce((a, x) => a + x.amount, 0));
  res.total = r2(res.subtotal + res.adjustments.reduce((a, x) => a + x.amount, 0));
  res.notes = m.notes; res.complete = !res.incomplete.length;
  return res;
}
const fmtQ = q => Number(q).toLocaleString('en-MY', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(+q) ? 0 : 2 });
function line(r, qty, extra = {}) {
  const rate = extra.override && num(extra.override.rate) != null ? +extra.override.rate : r.rate;
  const amount = r2(qty * rate);
  return { id: extra.id || 'auto-' + r.code, comp: extra.comp || r.comp, code: r.code, desc: r.desc, unit: r.unit, rate, catalogueRate: r.rate, qty, amount, auto: !!extra.auto, override: extra.override || null,
    spec: extra.spec || r.desc, source: `Table ${r.table}, page ${r.page}`.replace('Table 3.1.14', 'Section 3.1.14'), rule: [extra.rule, r.cond].filter(Boolean).join(' · '), note: extra.note || '',
    formula: `${rm(rate)}${r.unit.startsWith('RM/') ? '/kVA' : ''} × ${fmtQ(qty)} ${r.unit.startsWith('RM/') ? 'kVA' : r.unit} = ${rm(amount)}` };
}

/** quantity helpers for units with thresholds */
export function serviceCableSplit(code, length) { // first 30m (each) + per m beyond 30m
  const r = RATE[code], len = num(length); if (!r || !r.pair || len == null) return null;
  return [{ code, qty: 1 }, ...(len > r.first ? [{ code: r.pair, qty: r2(len - r.first) }] : [])];
}
export const perCircuit = (code, lengthM) => { const r = RATE[code]; return r && r.per && num(lengthM) != null ? Math.ceil(num(lengthM) / r.per) : null; }; // e.g. Per 1km circuit, Per 500m circuit

/** a saved calculation: everything needed to show it again exactly, even if the catalogue changes later */
export function snapshot(state, res, meta = {}) {
  return { guideline: GUIDELINE.id, inputs: JSON.parse(JSON.stringify(state.inputs || {})), notRequired: { ...(state.notRequired || {}) },
    lines: res.lines.map(l => ({ id: l.id, comp: l.comp, code: l.code, desc: l.desc, unit: l.unit, qty: l.qty, rate: l.rate, catalogueRate: l.catalogueRate, amount: l.amount, auto: l.auto, override: l.override, formula: l.formula, source: l.source, rule: l.rule, note: l.note })),
    adjustments: res.adjustments, subtotal: res.subtotal, total: res.total, chargeableLoad: res.load ? res.load.total : null, loadBasis: res.load ? res.load.basis : '', incomplete: res.incomplete, notes: res.notes || [], complete: res.complete, ...meta };
}
/** check a saved calculation still adds up from its own stored rates and quantities */
export function verifySnapshot(s) {
  const sub = r2(s.lines.reduce((a, l) => a + r2(l.qty * l.rate), 0)), tot = r2(sub + (s.adjustments || []).reduce((a, x) => a + x.amount, 0));
  return sub === s.subtotal && tot === s.total && s.lines.every(l => r2(l.qty * l.rate) === l.amount);
}
