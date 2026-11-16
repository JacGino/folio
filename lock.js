// Folio v2 — app lock: Face ID / Touch ID / Windows Hello (WebAuthn) with a 6-digit PIN fallback.
import * as S from './store.js';
import { hashPin, b64, unb64 } from './crypto.js';
import { h, icon, logo, sheet, group, row, toast } from './ui.js';

let locked = false;
const cfg = async () => (await S.meta.get('lock')) || { on: false };

export async function initLock() {
  // asks only when Folio is opened fresh (closed and reopened); switching to other apps and back does not lock it
  const c = await cfg(); if (c.on) await showLock();
}
export const isLocked = () => locked;

const bioName = () => /Windows/.test(navigator.userAgent) ? 'Windows Hello' : /iPhone|iPad/.test(navigator.userAgent) ? 'Face ID or Touch ID' : 'Touch ID';
async function platformOK() { try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; } }

async function enrol() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'Folio' },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'folio', displayName: 'Folio' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000 } });
  return b64(new Uint8Array(cred.rawId));
}
async function verifyBio(id) {
  const a = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: unb64(id), transports: ['internal'] }], userVerification: 'required', timeout: 60000 } });
  return !!a;
}

export async function showLock() {
  if (locked) return; locked = true;
  const c = await cfg(); let tries = c.tries || 0;
  const msg = h('p', { role: 'status', 'aria-live': 'polite' }, 'Attachments stay encrypted until you unlock.');
  const pinRow = h('form', { class: 'pin', onsubmit: e => e.preventDefault() });
  const done = () => { locked = false; el.remove(); S.meta.set('lock', { ...c, tries: 0 }); };
  const tryBio = async () => { try { if (await verifyBio(c.cred)) done(); } catch { msg.textContent = `${bioName()} did not unlock. Try again or use your PIN.`; } };
  const showPin = () => {
    pinRow.replaceChildren(...[...Array(6)].map((_, i) => h('input', { inputmode: 'numeric', maxlength: 1, 'aria-label': `PIN digit ${i + 1}`, autocomplete: 'off',
      oninput: e => { e.target.value = e.target.value.replace(/\D/g, ''); if (e.target.value && e.target.nextSibling) e.target.nextSibling.focus(); check(); },
      onkeydown: e => { if (e.key === 'Backspace' && !e.target.value && e.target.previousSibling) e.target.previousSibling.focus(); } })));
    pinRow.firstChild.focus();
  };
  const check = async () => {
    const ins = [...pinRow.querySelectorAll('input')]; const pin = ins.map(i => i.value).join(''); if (pin.length < 6) return;
    if (c.waitUntil && Date.now() < c.waitUntil) { msg.textContent = `Too many tries. Wait ${Math.ceil((c.waitUntil - Date.now()) / 1000)} seconds.`; ins.forEach(i => i.value = ''); return; }
    const { hash } = await hashPin(pin, c.pin.salt);
    if (hash === c.pin.hash) return done();
    tries++; const patch = { tries }; if (tries % 5 === 0) patch.waitUntil = Date.now() + 30000;
    Object.assign(c, patch); await S.meta.set('lock', c);
    msg.textContent = tries % 5 === 0 ? 'Wrong PIN 5 times. Wait 30 seconds.' : 'Wrong PIN. Try again.'; ins.forEach(i => i.value = ''); ins[0].focus();
  };
  const el = h('div', { id: 'lock', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Folio is locked' },
    h('div', { class: 'mid' }, logo(104), h('h1', {}, 'Folio is locked'), msg, pinRow),
    h('div', { class: 'acts' },
      c.cred ? h('button', { class: 'btn primary block', onclick: tryBio }, icon('face', 22), 'Unlock with ' + bioName()) : null,
      c.pin ? h('button', { class: 'link', style: { fontSize: '16px', height: '44px' }, onclick: showPin }, 'Use PIN instead') : null));
  document.body.append(el);
  if (!c.cred && c.pin) showPin(); else if (c.cred) setTimeout(tryBio, 300);
}

export async function lockSettings() {
  const c = await cfg(); const can = await platformOK();
  const body = h('div');
  const paint = async () => { const c = await cfg(); body.replaceChildren(
    h('p', { class: 'muted' }, 'Folio asks for your face, fingerprint or PIN each time you open it. Switching to another app and back does not lock it.'),
    group(
      row({ icon: 'face', label: c.cred ? `${bioName()}: on` : `Turn on ${bioName()}`, chev: false, onclick: async () => {
        if (!can) return toast(`${bioName()} is not available in this browser. Use a PIN.`);
        try { const id = await enrol(); await S.meta.set('lock', { ...c, on: true, cred: id }); toast(`${bioName()} is on`); if (!c.pin) setPin(paint); paint(); } catch (e) { toast('Not turned on: ' + (e.message || 'cancelled')); } } }),
      row({ icon: 'lock', label: c.pin ? 'Change PIN' : 'Set a 6-digit PIN', chev: false, onclick: () => setPin(paint) }),
      c.on ? row({ icon: 'lock', label: 'Lock now', chev: false, onclick: () => { sheetRef.close(); showLock(); } }) : null,
      c.on ? row({ icon: 'trash', label: 'Turn off app lock', danger: true, chev: false, onclick: async () => { await S.meta.set('lock', { on: false }); toast('App lock is off'); paint(); } }) : null)); };
  const sheetRef = sheet('App lock', body); paint();
}
function setPin(after) {
  const a = h('input', { class: 'field', inputmode: 'numeric', maxlength: 6, placeholder: '6 digits', autocomplete: 'off', type: 'password' });
  const b = h('input', { class: 'field', inputmode: 'numeric', maxlength: 6, placeholder: 'Repeat', autocomplete: 'off', type: 'password', style: { marginTop: '10px' } });
  const msg = h('p', { class: 'muted', role: 'status' });
  const s = sheet('PIN', h('form', { onsubmit: async e => { e.preventDefault();
    if (!/^\d{6}$/.test(a.value)) { msg.textContent = 'Use exactly 6 digits.'; return; }
    if (a.value !== b.value) { msg.textContent = 'The two PINs are different.'; return; }
    const c = await cfg(); await S.meta.set('lock', { ...c, on: true, pin: await hashPin(a.value), tries: 0 }); s.close(); toast('PIN saved'); after && after(); } },
    a, b, h('button', { class: 'btn primary block', type: 'submit' }, 'Save PIN'), msg));
}
