// Folio v2 — Notion-style formula engine (tokenizer, Pratt parser, evaluator).
import { parseDate, isDate, dateAdd, dateBetween, formatDate, startOfDay } from './dates.js';

export class FormulaError extends Error {}

function tokenize(src) {
  const t = []; let i = 0;
  const two = ['==', '!=', '<=', '>=', '&&', '||'];
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === "'" || c === '“' || c === '”') {
      const close = c === '“' ? '”' : c; let j = i + 1, s = '';
      while (j < src.length && src[j] !== close && !(close === '”' && src[j] === '"')) { if (src[j] === '\\' && j + 1 < src.length) { s += src[++j]; j++; continue; } s += src[j++]; }
      if (j >= src.length) throw new FormulaError('Unclosed text');
      t.push({ k: 'str', v: s }); i = j + 1; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) { const m = src.slice(i).match(/^\d*\.?\d+(e[+-]?\d+)?/i); t.push({ k: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if (/[A-Za-z_]/.test(c)) { const m = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/); t.push({ k: 'id', v: m[0] }); i += m[0].length; continue; }
    const p2 = src.substr(i, 2);
    if (two.includes(p2)) { t.push({ k: 'op', v: p2 }); i += 2; continue; }
    if ('+-*/%^<>!(),?:.[]'.includes(c)) { t.push({ k: 'op', v: c }); i++; continue; }
    throw new FormulaError(`Unexpected "${c}"`);
  }
  t.push({ k: 'end' }); return t;
}

const BP = { '||': 1, 'or': 1, '&&': 2, 'and': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '^': 7, '?': 0.5, '.': 9 };

function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p], next = () => tokens[p++];
  const expect = v => { const t = next(); if (t.v !== v) throw new FormulaError(`Expected "${v}"`); };
  function opOf(t) { if (t.k === 'op') return t.v; if (t.k === 'id' && (t.v === 'and' || t.v === 'or')) return t.v; return null; }
  function nud(t) {
    if (t.k === 'num') return { n: 'lit', v: t.v };
    if (t.k === 'str') return { n: 'lit', v: t.v };
    if (t.k === 'op' && t.v === '(') { const e = expr(0); expect(')'); return e; }
    if (t.k === 'op' && t.v === '[') { const items = []; if (peek().v !== ']') { do { items.push(expr(0)); } while (peek().v === ',' && next()); } expect(']'); return { n: 'list', items }; }
    if (t.k === 'op' && (t.v === '-' || t.v === '!')) return { n: 'un', op: t.v, a: expr(6.5) };
    if (t.k === 'id') {
      if (t.v === 'not') return { n: 'un', op: '!', a: expr(2.5) };
      if (t.v === 'true' || t.v === 'false') return { n: 'lit', v: t.v === 'true' };
      if (peek().v === '(') { next(); const args = []; if (peek().v !== ')') { do { args.push(expr(0)); } while (peek().v === ',' && next()); } expect(')'); return { n: 'call', f: t.v, args }; }
      return { n: 'call', f: t.v, args: [] };
    }
    throw new FormulaError('Unexpected end of formula');
  }
  function expr(rbp) {
    let left = nud(next());
    for (;;) {
      const op = opOf(peek()); if (!op || !(op in BP) || BP[op] <= rbp) break;
      next();
      if (op === '?') { const a = expr(0); expect(':'); const b = expr(0.4); left = { n: 'call', f: 'if', args: [left, a, b] }; continue; }
      if (op === '.') { const m = next(); if (m.k !== 'id') throw new FormulaError('Expected a method'); const args = [left]; if (peek().v === '(') { next(); if (peek().v !== ')') { do { args.push(expr(0)); } while (peek().v === ',' && next()); } expect(')'); } left = { n: 'call', f: m.v, args }; continue; }
      left = { n: 'bin', op, a: left, b: expr(op === '^' ? BP[op] - 0.01 : BP[op]) };
    }
    return left;
  }
  const e = expr(0); if (peek().k !== 'end') throw new FormulaError(`Unexpected "${peek().v}"`); return e;
}

const isEmpty = v => v == null || v === '' || (Array.isArray(v) && v.length === 0);
function toStr(v) {
  if (v == null) return '';
  if (isDate(v)) return formatDate(v, v.getHours() || v.getMinutes() ? 'MMMM D, YYYY HH:mm' : 'MMMM D, YYYY');
  if (Array.isArray(v)) return v.map(toStr).join(', ');
  if (typeof v === 'number') return String(Math.round(v * 1e10) / 1e10);
  return String(v);
}
const toNum = v => v == null || v === '' ? null : typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : isDate(v) ? v.getTime() : (isNaN(+v) ? null : +v);
function cmp(a, b) {
  if (a == null || b == null || a === '' || b === '') return null;
  if (isDate(a) || isDate(b)) { const x = parseDate(a), y = parseDate(b); return x && y ? x - y : null; }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const x = toStr(a), y = toStr(b); return x < y ? -1 : x > y ? 1 : 0;
}
function eq(a, b) {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (isDate(a) || isDate(b)) { const x = parseDate(a), y = parseDate(b); return !!x && !!y && x.getTime() === y.getTime(); }
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
  return toStr(a) === toStr(b);
}
const truthy = v => !(v == null || v === false || v === 0 || v === '' || (Array.isArray(v) && !v.length));

const FN = {
  if: null, ifs: null, and: null, or: null, // lazy, handled in eval
  not: a => !truthy(a), empty: a => isEmpty(a),
  format: a => toStr(a), toNumber: a => toNum(a), length: a => Array.isArray(a) ? a.length : toStr(a).length,
  abs: a => a == null ? null : Math.abs(toNum(a)), round: (a, d = 0) => a == null ? null : Math.round(toNum(a) * 10 ** d) / 10 ** d,
  floor: a => a == null ? null : Math.floor(toNum(a)), ceil: a => a == null ? null : Math.ceil(toNum(a)), sqrt: a => Math.sqrt(toNum(a)),
  min: (...a) => Math.min(...a.flat().map(toNum).filter(x => x != null)), max: (...a) => Math.max(...a.flat().map(toNum).filter(x => x != null)),
  sum: (...a) => a.flat().map(toNum).reduce((s, x) => s + (x || 0), 0),
  concat: (...a) => a.every(Array.isArray) ? a.flat() : a.map(toStr).join(''), join: (list, sep = '') => (Array.isArray(list) ? list : [list]).map(toStr).join(toStr(sep)),
  contains: (a, b) => Array.isArray(a) ? a.some(x => eq(x, b)) : toStr(a).includes(toStr(b)),
  test: (a, re) => new RegExp(toStr(re)).test(toStr(a)), replace: (a, re, s) => toStr(a).replace(new RegExp(toStr(re)), toStr(s)), replaceAll: (a, re, s) => toStr(a).replace(new RegExp(toStr(re), 'g'), toStr(s)),
  lower: a => toStr(a).toLowerCase(), upper: a => toStr(a).toUpperCase(), trim: a => toStr(a).trim(),
  slice: (a, s, e) => toStr(a).slice(s, e ?? undefined), substring: (a, s, e) => toStr(a).substring(s, e ?? undefined),
  now: (ctx) => new Date(ctx.now), today: (ctx) => startOfDay(new Date(ctx.now)),
  dateAdd: (d, n, u) => dateAdd(d, toNum(n), u), dateSubtract: (d, n, u) => dateAdd(d, -toNum(n), u),
  dateBetween: (a, b, u) => dateBetween(a, b, u), formatDate: (d, f) => d == null ? '' : formatDate(d, f ? convertFmt(toStr(f)) : undefined),
  parseDate: a => parseDate(a), dateStart: a => parseDate(a), dateEnd: a => parseDate(a),
  year: d => parseDate(d)?.getFullYear() ?? null, month: d => { const x = parseDate(d); return x ? x.getMonth() + 1 : null; }, date: d => parseDate(d)?.getDate() ?? null,
  day: d => parseDate(d)?.getDay() ?? null, hour: d => parseDate(d)?.getHours() ?? null, minute: d => parseDate(d)?.getMinutes() ?? null,
  timestamp: d => parseDate(d)?.getTime() ?? null, fromTimestamp: n => new Date(toNum(n)),
  at: (list, i) => Array.isArray(list) ? list.at(toNum(i)) ?? null : null, first: l => Array.isArray(l) ? l[0] ?? null : l, last: l => Array.isArray(l) ? l.at(-1) ?? null : l,
  unique: l => [...new Set(l)], sort: l => [...l].sort((a, b) => cmp(a, b) ?? 0), reverse: l => [...l].reverse(),
  style: a => a, unstyle: a => a, id: (ctx) => ctx.rowId ?? '', toString: a => toStr(a)
};
const CTX_FN = new Set(['now', 'today', 'id']);
// Notion/moment-ish formats -> ours (YYYY MMMM MMM MM DD D dddd ddd HH mm are shared)
const convertFmt = f => f.replace(/Do/g, 'D').replace(/hh/g, 'HH');

function ev(node, ctx) {
  switch (node.n) {
    case 'lit': return node.v;
    case 'list': return node.items.map(x => ev(x, ctx));
    case 'un': { const a = ev(node.a, ctx); return node.op === '!' ? !truthy(a) : a == null ? null : -toNum(a); }
    case 'bin': {
      const { op } = node;
      if (op === '&&' || op === 'and') return truthy(ev(node.a, ctx)) && truthy(ev(node.b, ctx));
      if (op === '||' || op === 'or') return truthy(ev(node.a, ctx)) || truthy(ev(node.b, ctx));
      const a = ev(node.a, ctx), b = ev(node.b, ctx);
      if (op === '==') return eq(a, b);
      if (op === '!=') return !eq(a, b);
      if ('<><=>='.includes(op)) { const c = cmp(a, b); if (c == null) return false; return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0; }
      if (op === '+') {
        if (typeof a === 'string' || typeof b === 'string') return toStr(a) + toStr(b);
        if (a == null || b == null) return null;
        return toNum(a) + toNum(b);
      }
      const x = toNum(a), y = toNum(b); if (x == null || y == null) return null;
      return op === '-' ? x - y : op === '*' ? x * y : op === '/' ? (y === 0 ? null : x / y) : op === '%' ? x % y : x ** y;
    }
    case 'call': {
      const f = node.f, A = node.args;
      if (f === 'prop') return ctx.prop(toStr(ev(A[0], ctx)));
      if (f === 'if') return truthy(ev(A[0], ctx)) ? ev(A[1], ctx) : (A[2] ? ev(A[2], ctx) : null);
      if (f === 'ifs') { for (let i = 0; i + 1 < A.length; i += 2) if (truthy(ev(A[i], ctx))) return ev(A[i + 1], ctx); return A.length % 2 ? ev(A.at(-1), ctx) : null; }
      if (f === 'and') return A.every(x => truthy(ev(x, ctx)));
      if (f === 'or') return A.some(x => truthy(ev(x, ctx)));
      if (f === 'e') return Math.E; if (f === 'pi') return Math.PI;
      if (f === 'let') { const name = A[0].f; const v = ev(A[1], ctx); return ev(A[2], { ...ctx, vars: { ...ctx.vars, [name]: v } }); }
      if (ctx.vars && f in ctx.vars && !A.length) return ctx.vars[f];
      const fn = FN[f]; if (!fn) throw new FormulaError(`Unknown function "${f}"`);
      if (CTX_FN.has(f)) return fn(ctx);
      return fn(...A.map(x => ev(x, ctx)));
    }
  }
  throw new FormulaError('Bad formula');
}

const cache = new Map();
/** compile(src) -> (prop, opts) => value. prop(name) returns the row's typed value. */
export function compile(src) {
  if (cache.has(src)) return cache.get(src);
  const ast = parse(tokenize(src));
  const run = (prop, opts = {}) => ev(ast, { prop, now: opts.now ?? Date.now(), rowId: opts.rowId });
  cache.set(src, run); return run;
}

/** Evaluate safely: returns { value } or { error }. */
export function evaluate(src, prop, opts) {
  try { return { value: compile(src)(prop, opts) }; } catch (e) { return { error: e.message || String(e) }; }
}

export { toStr as formulaToText };
