// Folio v2 — GitHub Contents API client (private repo folio-data).
import { b64, unb64 } from './crypto.js';
const te = new TextEncoder(), td = new TextDecoder();
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function client({ owner, repo, token, fetchFn = (...a) => fetch(...a), wait = sleep }) {
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const url = path => `${base}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  async function call(method, path, body, accept = 'application/vnd.github+json') {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchFn(path === null ? base : url(path), {
        method, cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined
      });
      if ((res.status === 403 || res.status === 429) && attempt < 3 && (res.headers.get('retry-after') || res.headers.get('x-ratelimit-remaining') === '0' || res.status === 429)) {
        const ra = +res.headers.get('retry-after') || 60; await wait(Math.min(ra, 120) * 1000); continue;
      }
      return res;
    }
  }
  async function fail(res, what) {
    let msg = ''; try { msg = (await res.json()).message || ''; } catch {}
    const e = new Error(`${what}: GitHub ${res.status}${msg ? ' — ' + msg : ''}`); e.status = res.status; throw e;
  }
  return {
    async check() { const r = await call('GET', null); if (!r.ok) await fail(r, 'Repository'); const j = await r.json(); return { private: j.private, name: j.full_name }; },
    async getJSON(path) {
      const r = await call('GET', path); if (r.status === 404) return null; if (!r.ok) await fail(r, path);
      const j = await r.json(); let text;
      if (j.content && j.encoding === 'base64') text = td.decode(unb64(j.content.replace(/\n/g, '')));
      else { const raw = await call('GET', path, null, 'application/vnd.github.raw+json'); if (!raw.ok) await fail(raw, path); text = await raw.text(); }
      return { data: JSON.parse(text), sha: j.sha };
    },
    async getBytes(path) {
      const r = await call('GET', path, null, 'application/vnd.github.raw+json'); if (r.status === 404) return null; if (!r.ok) await fail(r, path);
      return new Uint8Array(await r.arrayBuffer());
    },
    async put(path, bytes, sha, message) {
      const r = await call('PUT', path, { message: message || `Folio: ${path}`, content: b64(bytes), ...(sha ? { sha } : {}) });
      if (r.status === 409 || r.status === 422) { const e = new Error('conflict'); e.conflict = true; e.status = r.status; throw e; }
      if (!r.ok) await fail(r, path); const j = await r.json(); return j.content.sha;
    },
    putJSON(path, data, sha) { return this.put(path, te.encode(JSON.stringify(data)), sha); },
    async list(dir) { const r = await call('GET', dir); if (r.status === 404) return []; if (!r.ok) await fail(r, dir); const j = await r.json(); return Array.isArray(j) ? j.map(x => ({ name: x.name, path: x.path, sha: x.sha, size: x.size })) : []; },
    /** start a GitHub Actions workflow (needs Actions: Read and write on the key); returns the HTTP status */
    async dispatch(file, ref = 'main') {
      const r = await fetchFn(`${base}/actions/workflows/${encodeURIComponent(file)}/dispatches`, { method: 'POST', cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ ref }) });
      return r.status;
    },
    async remove(path, sha) { const r = await call('DELETE', path, { message: `Folio: remove ${path}`, sha }); if (!r.ok && r.status !== 404) await fail(r, path); }
  };
}
