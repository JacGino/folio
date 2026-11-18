// Folio v2 — Connection Charge Calculator (Project Details → Connection Charge).
// Guideline-driven estimate of the customer's connection charges, saved as versions against the project.
// No bill tracking: no bill number, status, issuance, payment or invoice — the supervisor issues the bill.
import * as D from './data.js';
import * as DB from './db.js';
import * as E from './entities.js';
import { h, icon, menu, sheet, toast, confirmBox, promptBox, textbox } from './ui.js';
import { formatDate } from './dates.js';
import { render, now as NOW, download, L as LBL } from './app.js';
import { guessSide } from './checklists.js';
import { longText, layoutFor, NTK_TYPES, ntkTypeFor, LAYOUTS, RM as RMS, applicantsOf } from './longtext.js';
import { badge, optPill } from './project.js';
import { GUIDELINE, RATE, PREMISES, PREMISE, COMPONENTS, TABLE51_NOTES } from './ccrates.js';
import { CATS, SCOPES, METHODS, ELIGIBLE_PROJECT_CATS, methodology, calculate, contributionEligible, itemsFor, upgradeMin, serviceCableSplit, perCircuit, snapshot, rm } from './ccengine.js';

export const ccEligible = cats => cats.some(c => ELIGIBLE_PROJECT_CATS.includes(c));
const COMP_ORDER = ['perhouse', 'lt', 'ltstreet', 'ht', 'htexcess', 'substation', 'scc', 'lcc', 'meter', 'admin', 'testing', 'controlled', 'engfee'];
const g = E.g;
const uid = () => 'l' + Math.random().toString(36).slice(2, 9);

// ---------- saved calculations (Project → Connection Charge Calculations → line items) ----------
export const calcsOf = rowId => D.all('ccalc', c => D.val(c, 'project') === rowId).sort((a, b) => D.val(b, 'version', 0) - D.val(a, 'version', 0));
const nextVersion = rowId => Math.max(0, ...D.all('ccalc', c => D.val(c, 'project') === rowId).map(c => D.val(c, 'version', 0))) + 1;

// ---------- the calculation being edited (per project, kept until you leave the app) ----------
const WORK = new Map();
const blank = () => ({ inputs: { basis: 'practice', cat: '', method: 'normal', scope: '', phase: 3, premise: '', applied: '', units: 1, contribution: false }, lines: [], notRequired: {}, loadedId: null, dirty: false });
function fromSaved(c) { const s = D.val(c, 'snap'); return { inputs: { basis: 'guideline', ...s.inputs }, lines: s.lines.filter(l => !l.auto).map(l => ({ id: l.id || uid(), comp: l.comp, code: l.code, qty: l.qty, override: l.override || null, note: l.note || '' })), notRequired: { ...(s.notRequired || {}) }, loadedId: c.id, dirty: false }; }
function work(row) {
  let w = WORK.get(row.id);
  if (!w) { const last = calcsOf(row.id)[0]; w = last ? fromSaved(last) : fromCustomer(row); WORK.set(row.id, w); }
  return w;
}
/** a new calculation starts with the customer's Meter Type and Premise Type (you can still change them) */
function fromCustomer(row) {
  const w = blank(), c = E.customerOf(row); if (!c) return w;
  const meter = g(c, 'meter'), prem = PREMISES.find(p => p.label === g(c, 'premise'));
  if (meter) w.inputs.phase = meter === '1-Phase' ? 1 : 3;
  if (prem) w.inputs.premise = prem.key;
  return w;
}
const touch = w => { w.dirty = true; };

// =====================================================================================
// The tab
// =====================================================================================
export function ccTab(row, info) {
  const w = work(row); autoUnits(w, info); const res = calculate(w);
  const wrap = h('div', { class: 'ccgrid' }, left(row, info, w, res), right(row, info, w, res));
  wrap.dataset.row = row.id;
  return wrap;
}
/** while typing a quantity: update that row's amount, the formulas and the total, but not the box you are typing in */
function refreshTotals(row, box, id) {
  const host = document.querySelector('.ccgrid'); if (!host) return;
  const w = work(row), res = calculate(w), l = res.lines.find(x => x.id === id);
  const r = box.closest('.ccr'); if (r && l) r.querySelector('.amt').textContent = money(l.amount);
  host.querySelector('.cctotal')?.replaceWith(totalBox(res));
}
/** redraw only the results column (used while typing, so the field you are in keeps its cursor) */
function refreshResults(row, info) {
  const host = document.querySelector('.ccgrid'); if (!host || host.dataset.row !== row.id) return;
  const w = work(row), res = calculate(w);
  host.querySelector('.ccright')?.replaceWith(right(row, info, w, res));
  host.querySelector('.ccdyn')?.replaceWith(loadResult(w, res)); // only the result part: the field you are typing in stays
}

// ---------- left: configuration ----------
const segs = (opts, cur, set, label) => h('div', { class: 'ccseg', role: 'radiogroup', 'aria-label': label }, opts.map(([v, l]) => h('button', { class: cur === v ? 'on' : '', role: 'radio', 'aria-checked': cur === v ? 'true' : 'false', onclick: () => set(v) }, l)));
const pickBtn = (label, cur, opts, set, ph = 'Choose…') => {
  const b = h('button', { class: 'ccsel' + (cur ? '' : ' empty'), 'aria-label': label + ': ' + ((opts.find(o => o[0] === cur) || [])[1] || 'not chosen'), onclick: () => menu(b, opts.map(([v, l]) => ({ label: l, checked: v === cur, run: () => set(v) })), { width: Math.min(420, innerWidth - 24) }) },
    h('span', {}, (opts.find(o => o[0] === cur) || [])[1] || ph), icon('chevd', 15));
  return b;
};
const numBox = (val, label, onval, unit) => {
  const t = textbox({ value: val ?? '', cls: 'ccnum', label, attrs: { inputmode: 'decimal' }, oninput: () => onval(t.value.replace(/[^0-9.]/g, '')), onkeydown: e => { if (e.key === 'Enter') t.blur(); } });
  return h('label', { class: 'ccinp' }, t, unit ? h('span', { class: 'ccu' }, unit) : null);
};
/** several applicants on the customer list: the number of units starts at that count (once, it can still be changed) */
function autoUnits(w, info) {
  const I = w.inputs, n = applicantsOf(info.title).length;
  if (n >= 2 && !I.unitsAuto && (+I.units || 1) === 1 && I.premise !== 'publight') { I.units = n; I.unitsAuto = true; }
}
/** one ECX application, several applicants (e.g. a longhouse): an applied load for each one; + adds an applicant (units follow) */
function applicantLoads(I, p, w, row, info) {
  const units = Math.max(1, Math.floor(+I.units || 1));
  if (I.premise === 'publight') { I.perApplicant = false; return []; }
  const ap = applicantsOf(info.title);
  if (!Array.isArray(I.loads)) I.loads = [];
  const add = h('button', { class: 'btn ccapl-add', type: 'button', 'aria-label': 'Add applicant load', onclick: () => { I.units = units + 1; I.perApplicant = true; touch(w); render(); } }, icon('plus', 15), units < 2 ? 'Different load per applicant' : 'Add applicant');
  if (units < 2) { I.perApplicant = false; return [h('div', { class: 'ccapl-solo' }, add)]; }
  I.perApplicant = true;
  const name = i => ap[i] ? ap[i].name : 'Applicant ' + (i + 1);
  return [h('div', { class: 'ccapl' }, h('p', { class: 'ccapl-h' }, h('b', {}, `Applied load of each applicant (${units})`),
      h('small', {}, 'Each applicant is charged at the Table 5.1 minimum, or their own load if higher. The total is used for the capacity charge. Empty boxes use the Applied Load above.')),
    ...Array.from({ length: units }, (_, i) =>
      h('div', { class: 'ccapl-r' }, h('span', { class: 'ccapl-n' }, (i + 1) + ')'), h('span', { class: 'ccapl-name' }, name(i)),
        numBox(I.loads[i] ?? '', `Applied Load, applicant ${i + 1}`, v => { I.loads[i] = v; touch(w); refreshResults(row, info); }, 'kVA'),
        h('button', { class: 'iconbtn sm', type: 'button', 'aria-label': `Remove applicant load ${i + 1}`, onclick: () => { I.loads.splice(i, 1); I.units = units - 1; touch(w); render(); } }, icon('close', 15)))),
    add)];
}
const tog = (on, set, label) => h('button', { class: 'cctog' + (on ? ' on' : ''), role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label, onclick: () => set(!on) }, h('i'));
const frow = (label, control, hint) => h('div', { class: 'ccrow' }, h('span', { class: 'ccl' }, label, hint ? h('small', {}, hint) : null), h('div', { class: 'ccc' }, control));

function left(row, info, w, res) {
  const I = w.inputs, m = res.method;
  const set = (k, v) => { I[k] = v; touch(w); render(); };
  const has = k => m.comps.some(c => c.key === k);
  const eligibleCats = info.category.filter(c => ELIGIBLE_PROJECT_CATS.includes(c));
  const showDedicated = +I.cat === 1 && I.scope === 'ltnew' && I.method === 'normal';
  const showZone = (I.scope === 'ltnew' || I.scope === 'ht') && +I.cat !== 4 && !(+I.cat === 2 && I.method === 'normal' && false);
  const houseTypes = Object.values(RATE).filter(r => r.comp === 'perhouse' && (!r.phase || r.phase === I.phase)).map(r => [r.code, r.desc]);
  const config = h('section', { class: 'ccsec' },
    h('h3', { class: 'ccsh' }, h('span', { class: 'ccn' }, '1'), 'Charging Configuration'),
    frow('Project Category', h('div', { class: 'ccro' }, eligibleCats.map(c => optPill('Project Category', c)), h('small', {}, 'from the project'))),
    frow('Connection Charging Category', pickBtn('Connection Charging Category', I.cat ? String(I.cat) : '', Object.entries(CATS), v => set('cat', +v), 'Choose the category of this application')),
    h('p', { class: 'cchint' }, 'Choose from the actual application — the project category does not decide the charging category.'),
    frow('Charging Method', segs([['normal', 'Normal'], ['turnkey', 'Turnkey']], I.method, v => set('method', v), 'Charging Method')),
    frow('Scope of Work', pickBtn('Scope of Work', I.scope, Object.entries(SCOPES), v => set('scope', v))),
    frow('Supply Phase', segs([[1, 'Single Phase'], [3, 'Three Phase']], I.phase, v => set('phase', v), 'Supply Phase')),
    frow('Premise Type', pickBtn('Premise Type', I.premise, PREMISES.map(p => [p.key, p.label + (p.mal ? ` — ${p.mal}kVA` : '')]), v => set('premise', v)), 'Table 5.1'),
    PREMISE[I.premise]?.fn ? h('p', { class: 'cchint' }, TABLE51_NOTES[PREMISE[I.premise].fn]) : null,
    frow(I.premise === 'publight' ? 'Number of LED 70W units' : +I.cat === 2 ? 'Number of houses / units' : 'Number of premises / units', numBox(I.units, 'Number of units', v => { I.units = v; touch(w); refreshResults(row, info); })),
    has('perhouse') ? frow('House type', pickBtn('House type (Per House Fee)', I.houseType || '', houseTypes, v => set('houseType', v)), 'Table 4.2') : null,
    showDedicated ? frow('Dedicated new substation', tog(!!I.dedicated, v => set('dedicated', v), 'Dedicated new substation'), 'Footnote [1] · Section 3.1.3') : null,
    showZone ? frow('New HT line from Zone Substation', tog(!!I.fromZone, v => set('fromZone', v), 'New HT line from Zone Substation'), 'Footnote [2]') : null,
    (+I.cat === 2 && I.scope === 'ltnew' && I.method === 'normal') ? frow('Extension of existing HV line', numBox(I.htLen, 'HT extension distance', v => { I.htLen = v; touch(w); }, 'm'), 'within / beyond 1000m') : null,
    I.method === 'turnkey' ? frow('Turnkey after Normal charges released', tog(!!I.engAfterRelease, v => set('engAfterRelease', v), 'Engineering Fee'), 'Engineering Fee RM3,000 · Section 3.1.14') : null);
  // commit numeric fields that change which fields show (HT distance) when you leave them
  config.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement?.closest?.('.ccgrid')) render(); }, 150));
  return h('div', { class: 'ccleft' },
    h('header', { class: 'cchead' }, h('span', { class: 'ccic' }, icon('table', 22)), h('div', {}, h('h2', {}, 'Connection Charge Calculator'), h('p', {}, `Based on ${GUIDELINE.name} (${GUIDELINE.rev})`))),
    h('p', { class: 'ccref' }, icon('info', 14), 'Rates are reference values from this guideline version, exclusive of Service Tax and subject to review. Not verified as currently effective.'),
    config, loadSection(row, info, w, res));
}
function loadSection(row, info, w, res) {
  const I = w.inputs, L = res.load, m = res.method;
  const needs = m.comps.some(c => c.key === 'scc' || c.key === 'lcc');
  const p = PREMISE[I.premise];
  const elig = contributionEligible(I);
  return h('section', { class: 'ccsec ccload' },
    h('h3', { class: 'ccsh' }, h('span', { class: 'ccn' }, icon('play', 13)), '2. Load / Capacity'),
    I.premise === 'publight' ? null : frow('Applied Load', numBox(I.applied, 'Applied Load', v => { I.applied = v; touch(w); refreshResults(row, info); }, 'kVA'), p && p.listed ? 'Per unit. Charged at the Table 5.1 minimum, or the applied load if higher' : 'Maximum demand declared by the customer (per unit)'),
    frow('Load basis', segs([['practice', 'Your rule'], ['guideline', 'Guideline 5.2']], I.basis === 'guideline' ? 'guideline' : 'practice', v => { I.basis = v; touch(w); render(); }, 'Load basis'),
      I.basis === 'guideline' ? 'Table 5.1 / Section 5.2 as written' : '1-phase min 5 kVA · 3-phase min 10 kVA · Table 5.1 for Longhouse & upgrading'),
    ...applicantLoads(I, p, w, row, info),
    frow('Supply upgrading (existing customer)', tog(!!I.upgrade, v => { I.upgrade = v; touch(w); render(); }, 'Supply upgrading'), 'Section 5.2.3'),
    I.upgrade && upgradeMin(I, p) == null ? frow('Existing capacity', numBox(I.existing, 'Existing capacity', v => { I.existing = v; touch(w); refreshResults(row, info); }, 'kVA'), 'No Table 5.1 minimum for this premise: charged on the difference') : null,
    I.upgrade && upgradeMin(I, p) != null ? h('p', { class: 'muted small note' }, `Upgrading is charged on Applied Load − Minimum Assigned Load (${upgradeMin(I, p)} kVA per unit).`) : null,
    loadResult(w, res),
    elig && needs ? frow('Apply SESCO Contribution', tog(!!I.contribution, v => { I.contribution = v; touch(w); render(); }, 'SESCO Contribution'), 'Section 3.1.17(a): capacity charges borne by SESCO') : null);
}

function loadResult(w, res) {
  const L = res.load, needs = res.method.comps.some(c => c.key === 'scc' || c.key === 'lcc');
  return h('div', { class: 'ccdyn' },
    frow('Chargeable Load (for Capacity Charge)', h('div', { class: 'ccout' + (L && L.total != null && !L.errors.length ? '' : ' muted') }, L && L.total != null && !L.errors.length ? Number(L.total).toFixed(2) + ' kVA' : '—'), needs ? null : 'Capacity charges are not part of this methodology'),
    L && L.basis && !L.errors.length ? h('p', { class: 'ccinfo' }, icon('info', 14), h('span', {}, L.basis + ' — ' + L.ref)) : null,
    ...(L ? L.errors.map(e => h('p', { class: 'ccwarn' }, icon('info', 14), e)) : []), ...(L ? L.warnings.map(e => h('p', { class: 'ccinfo amber' }, icon('info', 14), e)) : []));
}
// ---------- right: breakdown, formulas, total, actions ----------
function right(row, info, w, res) {
  const m = res.method;
  const head = h('header', { class: 'ccbh' }, h('span', { class: 'ccic sm' }, icon('layers', 18)), h('h2', {}, '3. Charge Breakdown'),
    h('div', { class: 'ccacts' }, h('button', { class: 'sbtn', onclick: e => addItemSheet(row, info, w, res) , disabled: m.na || m.missing ? true : null }, icon('plus', 14), 'Add Item'),
      h('button', { class: 'sbtn', onclick: () => resetUnsaved(row, info) }, icon('undo', 14), 'Reset')));
  if (m.missing) return h('div', { class: 'ccright' }, h('section', { class: 'hcard pcard ccpanel' }, head, h('p', { class: 'hempty' }, 'Choose the Connection Charging Category, Charging Method and Scope of Work to see the charges that apply.')), actions(row, info, w, res));
  if (res.na) return h('div', { class: 'ccright' }, h('section', { class: 'hcard pcard ccpanel' }, head, h('p', { class: 'ccna' }, icon('xcircle', 16), res.na)), actions(row, info, w, res));
  const lines = [...res.lines].sort((a, b) => COMP_ORDER.indexOf(a.comp) - COMP_ORDER.indexOf(b.comp));
  const sel = w.sel || (w.sel = new Set());
  const qtyCell = l => {
    if (l.auto) return h('span', { class: 'ccq' }, fmtQ(l.qty));
    const src = w.lines.find(x => x.id === l.id);
    const t = textbox({ value: String(src.qty), cls: 'ccnum q', label: 'Quantity for ' + l.desc, attrs: { inputmode: 'decimal' }, oninput: () => { src.qty = t.value.replace(/[^0-9.]/g, ''); touch(w); clearTimeout(t._t); t._t = setTimeout(() => refreshTotals(row, t, l.id), 300); }, onkeydown: e => { if (e.key === 'Enter') t.blur(); } });
    return t;
  };
  const table = h('div', { class: 'cctable', role: 'table', 'aria-label': 'Charge breakdown' },
    h('div', { class: 'ccr cchd', role: 'row' }, h('span', {}, h('input', { type: 'checkbox', class: 'hchk', 'aria-label': 'Select all items', checked: lines.length && lines.filter(l => !l.auto).every(l => sel.has(l.id)) ? true : null, onchange: e => { lines.filter(l => !l.auto).forEach(l => e.target.checked ? sel.add(l.id) : sel.delete(l.id)); render(); } })),
      h('span', {}, 'Charge Item'), h('span', {}, 'Specification / Description'), h('span', { class: 'r' }, 'Qty'), h('span', {}, 'Unit'), h('span', { class: 'r' }, 'Rate (RM)'), h('span', { class: 'r' }, 'Amount (RM)'), h('span')),
    ...lines.map(l => h('div', { class: 'ccr' + (l.override ? ' ovr' : ''), role: 'row' },
      h('span', {}, l.auto ? h('span', { class: 'ccauto', title: 'Added by the methodology' }, icon('check', 13)) : h('input', { type: 'checkbox', class: 'hchk', 'aria-label': 'Select ' + l.desc, checked: sel.has(l.id) ? true : null, onchange: e => { e.target.checked ? sel.add(l.id) : sel.delete(l.id); render(); } })),
      h('b', { class: 'cci' }, COMPONENTS[l.comp] || l.comp),
      h('span', { class: 'ccd' }, l.spec || l.desc, h('small', {}, l.code + ' · ' + l.source + (l.override ? ' · rate overridden: ' + l.override.reason : ''))),
      // quantity, unit and rate: separate columns on a wide screen, one line under the item on a narrow one
      h('span', { class: 'ccqur' }, h('span', { class: 'r' }, qtyCell(l)), h('span', { class: 'ccunit' }, l.unit),
        h('span', { class: 'r num ccrate' + (l.override ? ' ovr' : '') }, money(l.rate))), h('span', { class: 'r num amt' }, money(l.amount)),
      l.auto ? h('span') : h('button', { class: 'c-act ebtn', 'aria-label': 'More for ' + l.desc, onclick: e => lineMenu(e.currentTarget, row, info, w, l) }, icon('more', 16)))),
    lines.length ? null : h('p', { class: 'hempty' }, 'No charge items yet. Use Add Item.'));
  const pending = m.comps.filter(c => c.mode === 'items' && !res.lines.some(l => l.comp === c.key));
  const comps = pending.length ? h('div', { class: 'ccpend' }, pending.map(c => {
    const nr = w.notRequired[c.key];
    return h('div', { class: 'ccpi' + (nr ? ' nr' : c.required ? ' need' : '') }, h('b', {}, c.label + (c.factor ? ' (50%)' : '')),
      h('span', {}, nr ? 'Not required — ' + nr : c.required ? 'Required by the methodology' + (c.excess ? ` · ${c.excess}m in excess of 1000m` : '') : 'Where applicable'),
      nr ? h('button', { class: 'link sm', onclick: () => { delete w.notRequired[c.key]; touch(w); render(); } }, 'Undo')
        : [h('button', { class: 'link sm', onclick: () => addItemSheet(row, info, w, res, c.key) }, 'Add'), c.required ? h('button', { class: 'link sm', onclick: async () => { const r = (await promptBox('Why is ' + c.label + ' not required?', '', 'Reason (kept with the calculation)'))?.trim(); if (r) { w.notRequired[c.key] = r; touch(w); render(); } } }, 'Not required…') : null]);
  })) : null;
  const bulk = sel.size ? h('div', { class: 'hbulk' }, h('b', {}, sel.size + ' selected'), h('button', { class: 'btn', onclick: () => { w.lines = w.lines.filter(l => !sel.has(l.id)); sel.clear(); touch(w); render(); } }, icon('trash', 14), 'Remove'), h('button', { class: 'btn', onclick: () => { sel.clear(); render(); } }, 'Clear')) : null;
  const excluded = res.excluded.length ? h('div', { class: 'ccwarn' }, icon('info', 14), h('span', {}, `${res.excluded.length} item${res.excluded.length > 1 ? 's are' : ' is'} not counted: ` + res.excluded.map(x => `${x.desc} (${x.why})`).join('; '), ' ', h('button', { class: 'link sm', onclick: () => { const ids = new Set(res.excluded.map(x => x.id)); w.lines = w.lines.filter(l => !ids.has(l.id)); touch(w); render(); } }, 'Remove them'))) : null;
  return h('div', { class: 'ccright' },
    h('section', { class: 'hcard pcard ccpanel' }, head, bulk, table, comps, excluded,
      res.notes?.length ? h('ul', { class: 'ccnotes' }, res.notes.map(n => h('li', {}, n))) : null, ...res.warnings.map(x => h('p', { class: 'ccinfo amber' }, icon('info', 14), x))),
    h('div', { class: 'ccbottom' }, totalBox(res)), // the Calculation Formula card was merged into the breakdown (its rows show the same working)
    actions(row, info, w, res));
}
const money = n => Number(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQ = q => Number(q).toLocaleString('en-MY', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(+q) ? 0 : 2 });
function totalBox(res) {
  const ok = res.complete && !res.na;
  return h('section', { class: 'hcard cctotal' + (ok ? '' : ' inc') }, h('h3', {}, icon('layers', 16), 'Total Connection Charge'),
    h('div', { class: 'cctot' }, rm(res.total)),
    h('dl', {}, h('dt', {}, 'Charge items'), h('dd', {}, String(res.lines.length)), h('dt', {}, 'Subtotal'), h('dd', {}, rm(res.subtotal)),
      ...res.adjustments.flatMap(a => [h('dt', {}, a.label, a.rule ? h('small', {}, a.rule) : null), h('dd', {}, rm(a.amount))])),
    ok ? h('p', { class: 'ccok' }, icon('okcircle', 14), 'Complete · ' + GUIDELINE.id) : h('div', { class: 'ccincomplete' }, h('b', {}, 'Calculation Incomplete'), h('span', {}, 'Not a final amount. Missing:'), h('ul', {}, res.incomplete.map(x => h('li', {}, x)))));
}

// ---------- adding items ----------
function addItemSheet(row, info, w, res, onlyComp) {
  const m = res.method, comps = m.comps.filter(c => c.mode === 'items' && (!onlyComp || c.key === onlyComp));
  const q = h('input', { class: 'field', placeholder: 'Search items, codes or units', 'aria-label': 'Search items', oninput: () => draw() });
  const list = h('div', { class: 'ccadd' });
  const draw = () => {
    const s = q.value.trim().toLowerCase();
    list.replaceChildren(...comps.map(c => {
      const items = itemsFor(c.key, w.inputs).filter(r => !s || (r.desc + ' ' + r.code + ' ' + r.unit).toLowerCase().includes(s));
      return items.length ? h('div', { class: 'ccag' }, h('h4', {}, c.label + (c.required ? '' : ' (where applicable)')), items.map(r => h('button', { class: 'ccai', onclick: () => { sh.close(); addItem(row, info, w, res, c, r); } },
        h('span', {}, r.desc, h('small', {}, `${r.code} · Table ${r.table}, page ${r.page}`)), h('span', { class: 'ccar' }, money(r.rate), h('small', {}, r.unit))))) : null;
    }).filter(Boolean));
    if (!list.childElementCount) list.append(h('p', { class: 'hempty' }, 'No applicable items match.'));
  };
  const sh = sheet('Add Item', h('div', {}, h('p', { class: 'muted small' }, 'Only items that apply to this methodology are listed. Rates: ' + GUIDELINE.id + '.'), q, list), { done: 'Close', wide: true });
  draw();
}
async function addItem(row, info, w, res, c, r) {
  if (w.lines.some(l => l.code === r.code && l.comp === c.key)) {
    const why = (await promptBox('This item is already in the breakdown. Why add it again?', '', 'Reason (kept with the calculation)'))?.trim();
    if (!why) { toast('Not added'); return; }
    return push(w, c.key, r.code, 1, 'Added again: ' + why, row, info);
  }
  if (r.pair) { // service cable: first 30m + per m beyond 30m
    const len = await promptBox('Service cable length (m)', '', 'e.g. 45'); if (len == null) return;
    const parts = serviceCableSplit(r.code, len); if (!parts) { toast('Enter the length in metres'); return; }
    parts.forEach(p => w.lines.push({ id: uid(), comp: c.key, code: p.code, qty: p.qty, note: 'Length ' + len + 'm' })); touch(w); render(); return;
  }
  if (r.per) { // administration fee per 1km / per 500m circuit
    const len = await promptBox(`Circuit length (m) — charged ${r.unit.toLowerCase()}`, '', 'e.g. 1200'); if (len == null) return;
    const qn = perCircuit(r.code, len); if (qn == null) { toast('Enter the length in metres'); return; }
    return push(w, c.key, r.code, qn, `${len}m circuit ÷ ${r.per}m, rounded up to whole units`, row, info);
  }
  const def = c.excess && /meter/.test(r.unit) ? c.excess : 1;
  push(w, c.key, r.code, def, c.excess ? `${c.excess}m in excess of 1000m` : '', row, info);
}
function push(w, comp, code, qty, note, row, info) { w.lines.push({ id: uid(), comp, code, qty, note }); touch(w); render(); }
function lineMenu(anchor, row, info, w, l) {
  const src = w.lines.find(x => x.id === l.id);
  menu(anchor, [
    { label: src.override ? 'Change rate override' : 'Override rate…', icon: 'pencil', run: async () => {
      const rate = await promptBox(`Rate for ${l.code} (guideline rate ${money(RATE[l.code].rate)})`, src.override ? String(src.override.rate) : '', 'RM'); if (rate == null) return;
      if (isNaN(+rate) || rate === '') { toast('Enter a number'); return; }
      const reason = (await promptBox('Reason for the override (required)', src.override?.reason || '', 'Reason'))?.trim(); if (!reason) { toast('An override needs a reason'); return; }
      src.override = { rate: +rate, reason }; touch(w); render(); } },
    ...(src.override ? [{ label: 'Use guideline rate', icon: 'undo', run: () => { src.override = null; touch(w); render(); } }] : []),
    { label: 'Remove item', icon: 'trash', danger: true, run: () => { w.lines = w.lines.filter(x => x.id !== l.id); touch(w); render(); } }]);
}

// ---------- save, history, export ----------
function actions(row, info, w, res) {
  const n = calcsOf(row.id).length;
  const btn = (ic, l, run, extra = {}) => h('button', { class: 'ccbtn', onclick: run, ...extra }, icon(ic, 17), h('span', {}, l));
  return h('div', { class: 'ccsave' },
    w.dirty ? h('span', { class: 'ccdirty' }, 'Unsaved changes') : w.loadedId ? h('span', { class: 'ccdirty saved' }, 'Showing ' + label(D.live(w.loadedId))) : null,
    btn('page', 'Save as Draft', () => save(row, info, w, 'Draft')),
    btn('star', 'Save Final', () => save(row, info, w, 'Final')),
    btn('export', 'Export PDF', () => exportPdf(row, info, w)),
    btn('page', 'Long Text (.txt)', () => longTextSheet(row, info, w)),
    btn('history', `Calculation History (${n})`, () => historySheet(row, info)),
    btn('pages', 'Duplicate', () => { w.loadedId = null; touch(w); toast('Copied as a new unsaved calculation'); render(); }));
}
const label = c => c ? `v${D.val(c, 'version')} · ${D.val(c, 'status')}` : '';
function save(row, info, w, status) {
  const res = calculate(w);
  if (status === 'Final' && (!res.complete || res.na)) { toast('Calculation Incomplete — complete it before saving as Final. Save as Draft keeps your work.', 4200); return; }
  const loaded = w.loadedId && D.live(w.loadedId);
  const meta = { projectId: row.id, projectCategory: info.category.join(', '), chargingCategory: CATS[w.inputs.cat] || '', method: METHODS[w.inputs.method] || '', scope: SCOPES[w.inputs.scope] || '', premise: PREMISE[w.inputs.premise]?.label || '', appliedLoad: w.inputs.applied, status };
  const snap = snapshot(w, res, meta), t = Date.now();
  let rec;
  if (loaded && D.val(loaded, 'status') === 'Draft') { rec = loaded; D.update(rec.id, { snap, status, updated: t, total: res.total }); } // a draft is updated (or becomes Final); a Final is never changed
  else rec = D.create('ccalc', row.sh, { project: row.id, version: nextVersion(row.id), status, snap, total: res.total, created: t, updated: t, guideline: GUIDELINE.id });
  w.loadedId = rec.id; w.dirty = false;
  E.log(row, 'Connection charge', `Connection charge calculation v${D.val(rec, 'version')} saved (${status}): ${rm(res.total)}${res.complete ? '' : ' — incomplete'}.`);
  toast(`Saved v${D.val(rec, 'version')} (${status})`); render();
}
function resetUnsaved(row, info) {
  const w = work(row); const c = w.loadedId && D.live(w.loadedId);
  WORK.set(row.id, c ? fromSaved(c) : blank()); toast(c ? 'Back to ' + label(c) : 'Cleared'); render();
}
function historySheet(row, info) {
  const list = calcsOf(row.id);
  const body = h('div', { class: 'cchist' });
  if (!list.length) body.append(h('p', { class: 'hempty' }, 'No saved calculations yet. Save as Draft or Save Final to keep a version.'));
  list.forEach((c, i) => {
    const s = D.val(c, 'snap'), prev = list[i + 1] && D.val(list[i + 1], 'snap');
    const delta = prev ? s.total - prev.total : null;
    body.append(h('div', { class: 'cchr' },
      h('div', {}, h('b', {}, 'v' + D.val(c, 'version')), badge(D.val(c, 'status'), D.val(c, 'status') === 'Final' ? 'green' : 'gray', false), s.complete ? null : badge('Incomplete', 'orange', false)),
      h('div', { class: 'cchm' }, h('b', {}, rm(s.total)), delta != null ? h('small', { class: delta > 0 ? 'up' : delta < 0 ? 'down' : '' }, (delta > 0 ? '+' : '') + rm(delta) + ' vs v' + D.val(list[i + 1], 'version')) : null,
        h('small', {}, [s.chargingCategory, s.method, s.scope].filter(Boolean).join(' · ')), h('small', {}, 'Saved ' + formatDate(new Date(D.val(c, 'updated', 0)), 'DD/MM/YYYY') + ' ' + new Date(D.val(c, 'updated', 0)).toTimeString().slice(0, 5) + ' · ' + s.guideline)),
      h('div', { class: 'cchb' },
        h('button', { class: 'sbtn', onclick: () => { WORK.set(row.id, fromSaved(c)); sh.close(); render(); } }, 'Open'),
        h('button', { class: 'sbtn', onclick: () => { const w = fromSaved(c); w.loadedId = null; w.dirty = true; WORK.set(row.id, w); sh.close(); toast('Duplicated as a new unsaved calculation'); render(); } }, 'Duplicate'),
        list.length > 1 ? h('button', { class: 'sbtn', onclick: e => menu(e.currentTarget, list.filter(x => x !== c).map(x => ({ label: 'Compare with ' + label(x) + ' · ' + rm(D.val(x, 'snap').total), run: () => compareSheet(c, x) }))) }, 'Compare') : null)));
  });
  const sh = sheet('Calculation History', body, { done: 'Close', wide: true });
}
function compareSheet(a, b) {
  const A = D.val(a, 'snap'), B = D.val(b, 'snap');
  const key = l => l.comp + '|' + l.code;
  const map = s => new Map(s.lines.map(l => [key(l) + '|' + (l.id || ''), l]));
  const byKey = s => { const m = new Map(); for (const l of s.lines) { const k = key(l); m.set(k, (m.get(k) || []).concat(l)); } return m; };
  const ma = byKey(A), mb = byKey(B), keys = [...new Set([...ma.keys(), ...mb.keys()])];
  const sum = (arr, f) => (arr || []).reduce((x, l) => x + f(l), 0);
  const rows = keys.map(k => { const la = ma.get(k), lb = mb.get(k), x = la?.[0] || lb[0];
    const qa = sum(la, l => +l.qty), qb = sum(lb, l => +l.qty), aa = sum(la, l => l.amount), ab = sum(lb, l => l.amount);
    if (aa === ab && qa === qb) return null;
    return h('div', { class: 'ccr cmp' }, h('span', {}, x.desc, h('small', {}, x.code)), h('span', { class: 'r' }, lb ? fmtQ(qb) + ' × ' + money(lb[0].rate) : '—'), h('span', { class: 'r' }, la ? fmtQ(qa) + ' × ' + money(la[0].rate) : '—'), h('b', { class: 'r' }, (aa - ab >= 0 ? '+' : '') + money(aa - ab))); }).filter(Boolean);
  const inp = ['chargingCategory', 'method', 'scope', 'premise', 'appliedLoad', 'chargeableLoad'].filter(k => String(A[k] ?? '') !== String(B[k] ?? '')).map(k => h('li', {}, `${k.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${B[k] ?? '—'} → ${A[k] ?? '—'}`));
  sheet(`Compare ${label(b)} → ${label(a)}`, h('div', { class: 'cchist' },
    h('div', { class: 'cmpt' }, h('span', {}, label(b), h('b', {}, rm(B.total))), icon('chevr', 16), h('span', {}, label(a), h('b', {}, rm(A.total))), h('b', { class: A.total - B.total > 0 ? 'up' : 'down' }, (A.total - B.total >= 0 ? '+' : '') + rm(A.total - B.total))),
    inp.length ? h('ul', { class: 'ccnotes' }, inp) : null,
    rows.length ? h('div', { class: 'cctable' }, h('div', { class: 'ccr cmp cchd' }, h('span', {}, 'Item'), h('span', { class: 'r' }, label(b)), h('span', { class: 'r' }, label(a)), h('span', { class: 'r' }, 'Change')), rows) : h('p', { class: 'hempty' }, 'The charge items are the same.')), { done: 'Close', wide: true });
}

// ---------- PDF: Calculation Summary (printed through the system "Save as PDF") ----------
function exportPdf(row, info, w) {
  const res = calculate(w), c = w.loadedId && D.live(w.loadedId), I = w.inputs;
  const ref = P => DB.propByName(DB.kpiDb(), P);
  const pref = DB.projectRef(row);
  const doc = h('div', { id: 'ccprint' },
    h('h1', {}, 'Connection Charge — Calculation Summary'),
    h('p', { class: 'cpn' }, 'Estimate prepared from ' + GUIDELINE.name + ' (' + GUIDELINE.rev + '). This is not an invoice or bill. Rates are reference values from this guideline version, exclusive of Service Tax and subject to review.'),
    h('table', { class: 'kv' }, [['Customer', info.title], ['Project reference', pref || '—'], ['Project category', info.category.join(', ')], ['Connection charging category', CATS[I.cat] || '—'], ['Charging method', METHODS[I.method] || '—'], ['Scope of work', SCOPES[I.scope] || '—'],
      ['Supply phase', I.phase === 1 ? 'Single Phase' : 'Three Phase'], ['Premise type', PREMISE[I.premise]?.label || '—'], ['Applied load', I.applied ? I.applied + ' kVA' : '—'], ['Load basis', I.basis === 'guideline' ? 'Guideline Section 5.2 / Table 5.1' : 'Your rule: 1-phase min 5 kVA, 3-phase min 10 kVA; Table 5.1 for Longhouse & upgrading'], ['Chargeable load', res.load && res.load.total != null ? res.load.total + ' kVA (' + res.load.ref + ')' : '—'],
      ['Calculation', c ? label(c) : 'Unsaved'], ['Prepared', formatDate(new Date(NOW()), 'DD/MM/YYYY')]].map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v)))),
    h('table', { class: 'items' }, h('thead', {}, h('tr', {}, ['Charge component', 'Specification / Description', 'Qty', 'Unit', 'Rate (RM)', 'Amount (RM)', 'Source'].map(x => h('th', {}, x)))),
      h('tbody', {}, res.lines.map(l => h('tr', {}, h('td', {}, COMPONENTS[l.comp]), h('td', {}, l.spec || l.desc, l.override ? h('div', { class: 'o' }, 'Rate overridden (guideline ' + money(l.catalogueRate) + '): ' + l.override.reason) : null), h('td', { class: 'r' }, fmtQ(l.qty)), h('td', {}, l.unit), h('td', { class: 'r' }, money(l.rate)), h('td', { class: 'r' }, money(l.amount)), h('td', {}, l.code + ' · ' + l.source))))),
    h('table', { class: 'tot' }, h('tr', {}, h('th', {}, 'Subtotal'), h('td', {}, rm(res.subtotal))), ...res.adjustments.map(a => h('tr', {}, h('th', {}, a.label + ' — ' + a.rule), h('td', {}, rm(a.amount)))), h('tr', { class: 'g' }, h('th', {}, 'Total Connection Charge'), h('td', {}, rm(res.total)))),
    res.complete ? null : h('p', { class: 'warn' }, 'CALCULATION INCOMPLETE — not a final amount. Missing: ' + res.incomplete.join('; ')),
    Object.keys(w.notRequired).length ? h('p', {}, 'Marked not required: ' + Object.entries(w.notRequired).map(([k, v]) => COMPONENTS[k] + ' (' + v + ')').join('; ')) : null,
    h('h2', {}, 'Formulas'), h('ul', {}, res.lines.map(l => h('li', {}, COMPONENTS[l.comp] + ': ' + l.formula + ' — ' + l.source + (l.rule ? ' — ' + l.rule : '')))),
    res.notes?.length ? h('ul', {}, res.notes.map(n => h('li', {}, n))) : null);
  document.getElementById('ccprint')?.remove(); document.body.append(doc); document.body.classList.add('cc-printing');
  const done = () => { document.body.classList.remove('cc-printing'); doc.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); setTimeout(() => window.print(), 50); setTimeout(done, 60000);
}

// ---------- ECX long text (.txt) ----------
const ltRemember = k => { try { return localStorage.getItem('folio-lt-' + k) || ''; } catch { return ''; } };
const ltKeep = (k, v) => { try { localStorage.setItem('folio-lt-' + k, v); } catch {} };
/** a residential customer: Domestic tariff, or no tariff and a residential premise type */
function isResidential(row) {
  const c = E.customerOf(row), t = c ? String(g(c, 'tariff') || '') : '';
  if (t) return /domestic|residential/i.test(t);
  return guessSide(c ? g(c, 'premise', '') : '', '') === 'residential';
}
function ltDefaults(row, info, w, res) {
  const c = E.customerOf(row), P = n => DB.propByName(DB.kpiDb(), n), pv = n => P(n) ? DB.value(row, P(n)) : '';
  const ecx = E.ecxOf(row.id)[0], tariff = c && g(c, 'tariff'), sub = c && g(c, 'subsidy');
  const d = new Date(NOW());
  return { shortTitle: '', ref: DB.refParts(row).ecx || (ecx && g(ecx, 'number')) || '', projectRef: DB.refParts(row).wbs || (E.ecparOf(row) && g(E.ecparOf(row), 'ref')) || '', title: '', consultant: (c && g(c, 'pic')) || '', client: info.title, ic: '', contact: (c && g(c, 'phone')) || '',
    appType: tariff || 'Domestic', load: w.inputs.applied || '', target: String(d.getFullYear()), cat: w.inputs.cat || '', use: '', scheme: '', // typed in by hand (not drafted from the charge items)
    ntkType: ntkTypeFor(info.title, tariff),
    // SST: 6% for everyone except Residential (0%); an SST relief letter makes it 0% — same for NTK, SAL100KW, UOS and TOS
    costOH: '', costNoOH: '', sst: (info.category || []).includes('Non Turnkey') ? NTK_TYPES[ntkTypeFor(info.title, tariff)].sst : isResidential(row) ? '0' : '6', subsidy: tariff === 'Commercial' || sub === 'No' ? 'none' : sub === 'Yes' && g(c, 'subsidyPct') ? (g(c, 'subsidyPct') === '70%' ? '70' : '100') : 'auto',
    subsidyBV: ltRemember('subsidyBV') || 'PLS-260221', cdpBV: ltRemember('cdpBV') || 'PLS-260205', source: '', feeder: 'RYB', r: '', y: '', b: '',
    submittedBy: ltRemember('submittedBy') || LBL('profile.name', ''), date: d.toLocaleString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase(), remarks: '', desc: {},
    // layout by project category (TK2 / TOS / UOS / SAL100KW / NTK), and the fields only some layouts use
    layout: layoutFor(info.category || [], tariff, sub), ...upgradeLT(w.inputs), extras: [],
    hvLen: '', ltOhLen: '', ltUgLen: '', trafoKva: '', bondRate: '50', bondTrafoYears: 'two (2)', bondOtherYears: 'one (1)', material: '' };
}
/** Long Text 'ACTUAL DECLARE LOAD − MINIMUM ASSIGNED LOAD (…)': the premise's Table 5.1 minimum, or the existing capacity typed in */
function upgradeLT(I) {
  const p = PREMISE[I.premise], mal = upgradeMin(I, p);
  if (mal != null) return { existing: String(mal), existingLabel: 'Minimum assigned load (' + p.label + ')' };
  return { existing: I.existing != null && I.existing !== '' ? String(I.existing) : '', existingLabel: 'Minimum assigned load' };
}
/** '1) SELIMAH AK JARAK (720308-…) 2) GLORIA …' → 'SELIMAH AK JARAK + 7 more' (one ECX application, many applicants — common for longhouses) */
export function shortApplicants(t = '') {
  const parts = String(t).split(/(?:^|\s)\d{1,2}\s*[).]\s+/).map(x => x.replace(/\s*\([^)]*\)\s*$/, '').trim()).filter(Boolean);
  if (parts.length > 1) return parts[0] + ' + ' + (parts.length - 1) + ' more';
  return String(t).length > 60 ? String(t).slice(0, 57).trimEnd() + '…' : String(t);
}
function longTextSheet(row, info, w) {
  let res = calculate(w);
  w.inputs.lt = { ...ltDefaults(row, info, w, res), ...(w.inputs.lt || {}) };
  const f = w.inputs.lt;
  if (f.cat !== w.inputs.cat && w.inputs.cat) f.cat = w.inputs.cat;
  if (w.inputs.applied && !f.load) f.load = w.inputs.applied;
  { const u = upgradeLT(w.inputs); if (u.existing !== '') { f.existing = u.existing; f.existingLabel = u.existingLabel; } }
  if (!f.layout) f.layout = layoutFor(info.category || []);
  { const rp = DB.refParts(row), src = rp.ecx + '|' + rp.wbs; if (f.refSrc !== src) { f.ref = rp.ecx || f.ref; f.projectRef = rp.wbs || f.projectRef; f.refSrc = src; } } // Reference No / Project Reference follow the project
  if (f.clientSrc !== info.title) { f.client = info.title; f.clientSrc = info.title; } // the customer list changed: Long Text follows it
  const pre = h('textarea', { class: 'field ltpre', rows: 18, spellcheck: 'false', 'aria-label': 'Long text preview' });
  const warn = h('div', { class: 'ltwarn' }), sums = h('div', { class: 'ltsum' });
  let edited = false;
  pre.addEventListener('input', () => { edited = true; });
  const draw = () => {
    res = calculate(w); const out = longText(f, res);
    if (!edited) pre.value = out.text;
    const t = out.totals;
    const subs = f.layout === 'subsidy' || !f.layout;
    sums.replaceChildren(...[[f.layout === 'tk2' ? 'Material price' : 'Connection cost (c)', f.layout === 'tk2' ? t.mat : t.c], ...(f.layout === 'tk2' ? [['Administration fee', t.adm]] : []), ['Capacity charge', t.d], ['Meter fee', t.e], ['Total (without SST)', t.total], ['CDP to seek', t.cdpSeek],
      ...(subs ? [[t.pct ? `Government subsidy ${t.pct}%` : 'Government subsidy', t.gov], ['Customer', t.cust]] : [['Total with SST', t.h]])]
      .map(([k, v]) => h('span', {}, h('small', {}, k), h('b', {}, RMS(v)))));
    warn.replaceChildren(...out.warnings.map(x => h('p', { class: 'ccinfo amber' }, icon('info', 14), x)));
  };
  const set = (k, v) => { f[k] = v; if (['subsidyBV', 'cdpBV', 'submittedBy'].includes(k)) ltKeep(k, v); touch(w); edited = false; draw(); };
  const inp = (k, label, o = {}) => h('label', { class: 'ltf' + (o.wide ? ' wide' : ''), 'data-k': k }, h('span', {}, label),
    o.area ? h('textarea', { class: 'field', rows: o.rows || 3, value: f[k] ?? '', oninput: e => set(k, e.target.value) }, f[k] ?? '')
      : o.opts ? h('select', { class: 'field', onchange: e => set(k, e.target.value) }, o.opts.map(([v, l]) => h('option', { value: v, selected: String(f[k]) === v ? true : null }, l)))
      : h('input', { class: 'field', value: f[k] ?? '', inputmode: o.num ? 'decimal' : null, placeholder: o.ph || '', list: o.list ? 'ltl-' + k : null, oninput: e => set(k, e.target.value) }),
    o.list ? h('datalist', { id: 'ltl-' + k }, o.list.map(v => h('option', { value: v }))) : null);
  // extra items not in the Guidelines catalogue (e.g. road reinstatement): included in the connection cost of the long text
  const extrasBox = h('div', { class: 'ltextras wide' });
  const drawExtras = () => {
    const list = f.extras || (f.extras = []);
    const cell = (x, k, ph, num) => h('input', { class: 'field', value: x[k] ?? '', placeholder: ph, inputmode: num ? 'decimal' : null, 'aria-label': ph, oninput: e => { x[k] = e.target.value; touch(w); edited = false; draw(); } });
    extrasBox.replaceChildren(h('span', { class: 'ltxl' }, 'Extra items not in the Guidelines (e.g. road reinstatement)'),
      ...list.map((x, i) => h('div', { class: 'ltxrow' }, cell(x, 'desc', 'Description'), cell(x, 'rate', 'Rate (RM)', 1), cell(x, 'markup', 'Mark-up % (e.g. 115)', 1), cell(x, 'qty', 'Qty', 1), cell(x, 'unit', 'Unit (meter)'), f.layout === 'ntk' ? h('select', { class: 'field', 'aria-label': 'Cost group', onchange: e => { x.group = e.target.value; touch(w); edited = false; draw(); } }, [['lt', 'LT'], ['ht', 'HT'], ['substation', 'Substation']].map(([v, l]) => h('option', { value: v, selected: (x.group || 'lt') === v ? true : null }, l))) : null,
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Remove this item', onclick: () => { list.splice(i, 1); touch(w); edited = false; drawExtras(); draw(); } }, icon('close', 16)))),
      h('button', { class: 'btn', type: 'button', onclick: () => { list.push({ desc: 'Reinstate Road Surface for cable laying work', rate: '55', markup: '115', qty: '', unit: 'meter' }); touch(w); drawExtras(); } }, icon('plus', 15), 'Add extra item'));
  };
  drawExtras();
  // fields that only some layouts use
  const only = (layouts, ...els) => els.map(el => { el.dataset.only = layouts; return el; });
  const vis = () => body.querySelectorAll('[data-only]').forEach(el => { el.hidden = !el.dataset.only.split(' ').includes(f.layout); });
  const txt = () => pre.value.replace(/\r?\n/g, '\r\n');
  const name = () => (String(f.shortTitle || f.ref || info.title).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Connection charge') + ' Long Text.txt';
  const body = h('div', { class: 'ltwrap' },
    h('div', { class: 'ltform' },
      h('label', { class: 'ltf wide ltlayout' }, h('span', {}, 'Layout (from the project category)'), h('select', { class: 'field', 'aria-label': 'Layout', onchange: e => { f.layout = e.target.value; touch(w); edited = false; vis(); drawExtras(); draw(); } },
        Object.entries(LAYOUTS).map(([k, l]) => h('option', { value: k, selected: f.layout === k ? true : null }, l)))),
      h('h4', {}, 'Project'), inp('shortTitle', 'Short title', { wide: true, ph: 'e.g. BTU-D-SF SL TO AISYAH AT KG PENAN MUSLIM' }), inp('ref', 'REF. NO (ECX)'), inp('projectRef', 'Project ref'),
      inp('title', 'Project title', { wide: true, area: true, rows: 2 }), inp('consultant', 'Consultant / contractor'), inp('client', 'Developer / client'), inp('ic', 'IC / company no.'), inp('contact', 'Contact number'),
      ...only('ntk', h('label', { class: 'ltf wide' }, h('span', {}, 'NTK application type (who pays)'), h('select', { class: 'field', 'aria-label': 'NTK application type', onchange: e => {
        const t = NTK_TYPES[e.target.value]; f.ntkType = e.target.value; f.appType = t.appType; f.sst = f.sstExempt && e.target.value !== 'residential' ? '0' : t.sst; touch(w); edited = false;
        body.querySelectorAll('.ltform input').forEach(i => { const k = i.closest('label')?.dataset.k; if (k && f[k] != null) i.value = f[k]; }); draw(); } },
        Object.entries(NTK_TYPES).map(([k, t]) => h('option', { value: k, selected: (f.ntkType || 'commercial') === k ? true : null }, t.label))))),
      // a client with an SST relief letter pays 0% (Section 34 note); without one every type except Residential pays 6%
      ...only('ntk standard tos uos', h('label', { class: 'ltf wide ltchk' }, h('input', { type: 'checkbox', class: 'hchk', 'aria-label': 'SST relief letter attached', checked: f.sstExempt ? true : null, onchange: e => {
        f.sstExempt = e.target.checked; f.sst = e.target.checked ? '0' : f.layout === 'ntk' ? (NTK_TYPES[f.ntkType] || NTK_TYPES.commercial).sst : isResidential(row) ? '0' : '6'; touch(w); edited = false;
        const b = body.querySelector('.ltform label[data-k="sst"] input'); if (b) b.value = f.sst; draw(); } }), h('span', {}, 'SST relief letter attached (0% SST, Section 34)'))),
      h('h4', {}, 'Application'), inp('appType', 'Type of application', { list: ['Domestic', 'Commercial', 'Commercial + Residential', 'Commercial 1 (C1)', 'Industrial'] }), inp('load', 'Estimated connected load (kVA)', { num: true }),
      inp('target', 'Target date of supply'), inp('cat', 'Category'), inp('use', 'Type of use', { ph: 'e.g. DWELLING' }), inp('scheme', 'Scheme of supply', { wide: true, area: true, rows: 7 }),
      h('h4', {}, 'Costs & funding'), inp('costOH', '(a) Cost of project with OH (RM)', { num: true }), inp('costNoOH', '(b) Cost of project without OH (RM)', { num: true }), inp('sst', 'SST %', { num: true }),
      ...only('subsidy', inp('subsidy', 'Government subsidy (Domestic only)', { opts: [['auto', 'By amount (≤ RM5,000 100% · ≤ RM10,000 70%)'], ['100', '100%'], ['70', '70%'], ['none', 'No subsidy']] }), inp('subsidyBV', 'Subsidy BV no.')),
      inp('cdpBV', 'CDP BV no.'),
      ...only('uos', inp('existing', 'Existing / minimum assigned load (kVA)', { num: true }), inp('existingLabel', 'Wording for the existing load', { wide: true, ph: 'Minimum assigned load (Terrace/Quadrant house up to 3-storey)' })),
      ...only('tk2', h('h4', {}, 'Turnkey (TK2)'), inp('hvLen', 'HV U/G cable total length (m)', { num: true }), inp('ltOhLen', 'LT O/H line total length (m)', { num: true }), inp('ltUgLen', 'LT U/G line total length (m)', { num: true }),
        inp('material', 'Material price (RM, blank = controlled items)', { num: true }), inp('trafoKva', 'Transformer kVA (performance bond)', { num: true }), inp('bondRate', 'Bond rate (RM/kVA)', { num: true }),
        inp('bondTrafoYears', 'Transformer bond valid for'), inp('bondOtherYears', 'Other installation bond valid for')),
      ...only('standard ntk tos uos', extrasBox),
      h('h4', {}, 'Source of supply'), inp('source', 'Existing substation', { wide: true, ph: 'e.g. P/M KG PENAN MUSLIM 2 11KV S/S (DS71115)' }), inp('feeder', 'Feeder'), inp('r', 'R (A)', { num: true }), inp('y', 'Y (A)', { num: true }), inp('b', 'B (A)', { num: true }),
      h('h4', {}, 'Submission'), inp('submittedBy', 'Submitted by'), inp('date', 'Date of submission'), inp('remarks', 'Remarks (blank = automatic)', { wide: true })),
    h('div', { class: 'ltout' }, sums, warn, h('div', { class: 'lthead' }, h('b', {}, 'Preview'), h('small', {}, 'You can edit the text here before saving. Changing a field above rebuilds it.')), pre,
      h('div', { class: 'ccsave' },
        h('button', { class: 'ccbtn', onclick: () => { navigator.clipboard.writeText(txt()).then(() => toast('Copied'), () => toast('Could not copy')); } }, icon('pages', 17), h('span', {}, 'Copy')),
        navigator.share ? h('button', { class: 'ccbtn', onclick: () => { const file = new File([txt()], name(), { type: 'text/plain' }); (navigator.canShare && navigator.canShare({ files: [file] }) ? navigator.share({ files: [file], title: name() }) : navigator.share({ title: name(), text: txt() })).catch(() => {}); } }, icon('export', 17), h('span', {}, 'Share')) : null,
        h('button', { class: 'ccbtn primary', onclick: () => { download(name(), txt(), 'text/plain;charset=utf-8'); E.log(row, 'Connection charge', 'Long text saved as .txt: ' + name()); toast('Saved ' + name()); } }, icon('export', 17), h('span', {}, 'Save .txt')))));
  draw(); vis();
  sheet('Long Text — ' + shortApplicants(info.title), body, { done: 'Close', wide: true, onDone: () => render() });
}
