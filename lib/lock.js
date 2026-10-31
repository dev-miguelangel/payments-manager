// Password lock for the extension's pages. The password is set on first use and asked each
// time the side panel opens. While a panel is open and unlocked, the "unlocked" flag in
// chrome.storage.session lets the summary page open without asking again; the background
// clears it when the last panel closes. This hides the UI; it does not encrypt stored data.

import { clearFileData } from './files.js';

export const PANEL_PORT = 'panel';

const ITERATIONS = 310000;
const MIN_LENGTH = 4;

const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

async function getLock() {
  const { lock } = await chrome.storage.local.get('lock');
  return lock ?? null;
}

export async function hasPassword() {
  return Boolean(await getLock());
}

// Reason a new password can't be used, or null.
export function passwordProblem(password, confirmation) {
  if (password.length < MIN_LENGTH) return `La clave debe tener al menos ${MIN_LENGTH} caracteres.`;
  if (password !== confirmation) return 'Las claves no coinciden.';
  return null;
}

export async function setPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  await chrome.storage.local.set({ lock: { salt: toBase64(salt), hash: toBase64(hash), iterations: ITERATIONS } });
}

export async function checkPassword(password) {
  const lock = await getLock();
  if (!lock) return false;
  const hash = await derive(password, fromBase64(lock.salt), lock.iterations);
  const expected = fromBase64(lock.hash);
  // Compare every byte so the time doesn't depend on where they differ.
  let diff = hash.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= hash[i] ^ expected[i];
  return diff === 0;
}

export async function isUnlocked() {
  const { unlocked } = await chrome.storage.session.get('unlocked');
  return Boolean(unlocked) && await hasPassword();
}

async function unlock() {
  await chrome.storage.session.set({ unlocked: true });
}

export async function lockNow() {
  await chrome.storage.session.remove('unlocked');
}

// Tells the background this panel is open, so it can lock when the last one closes. The port
// drops if the service worker restarts, so it reconnects.
export function trackPanel() {
  chrome.runtime.connect({ name: PANEL_PORT }).onDisconnect.addListener(() => setTimeout(trackPanel, 500));
}

// Every open page (panel, summary) goes back to the lock screen when one of them locks
// or the password is reset.
export function reloadOnLock() {
  chrome.storage.onChanged.addListener((changes, area) => {
    const gone = (change) => change && !change.newValue;
    if ((area === 'session' && gone(changes.unlocked)) || (area === 'local' && gone(changes.lock))) location.reload();
  });
}

// "Forgot password": deletes payments, settings and the password, so the next screen asks
// for a new one. Receipts already saved in the folder are left alone. The background returns
// each site's permission when it sees the payments go.
export async function resetEverything() {
  await clearFileData().catch(() => {});
  await chrome.permissions.remove({ origins: ['<all_urls>'] }).catch(() => {});
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
}

const RESET_WORD = 'BORRAR';

// Second step of "Forgot password": says what is lost and asks to type BORRAR.
function resetForm(onCancel) {
  const form = document.createElement('form');
  form.className = 'lock-form';
  const title = document.createElement('h1');
  title.textContent = '¿Borrar todo y empezar de nuevo?';
  const text = document.createElement('p');
  text.className = 'lock-text';
  text.textContent = 'Se borran todos los pagos, montos, datos, notas, la configuración y la clave. '
    + 'Los comprobantes ya guardados en tu carpeta no se tocan. No se puede deshacer.';
  const confirm = document.createElement('label');
  confirm.textContent = `Escribe ${RESET_WORD} para confirmar`;
  const input = document.createElement('input');
  input.autocomplete = 'off';
  input.required = true;
  confirm.append(input);
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'danger';
  submit.textContent = 'Borrar todo';
  submit.disabled = true;
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'lock-link';
  cancel.textContent = 'Cancelar';
  cancel.addEventListener('click', onCancel);
  input.addEventListener('input', () => {
    submit.disabled = input.value.trim().toUpperCase() !== RESET_WORD;
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    submit.textContent = 'Borrando…';
    await resetEverything();
    location.reload();
  });
  form.append(title, text, confirm, submit, cancel);
  setTimeout(() => input.focus());
  return form;
}

function field(label, autocomplete) {
  const wrap = document.createElement('label');
  wrap.textContent = label;
  const input = document.createElement('input');
  input.type = 'password';
  input.autocomplete = autocomplete;
  input.required = true;
  wrap.append(input);
  return { wrap, input };
}

// Shows the lock screen in `screen` (create the password on first use, ask for it otherwise)
// and calls onUnlock once it's open. Skips the screen if the session is already unlocked,
// unless `always` (the panel asks every time it opens).
export async function requireUnlock(screen, onUnlock, { always = false } = {}) {
  if (!always && await isUnlocked()) {
    onUnlock();
    return;
  }
  const creating = !(await hasPassword());
  const form = document.createElement('form');
  form.className = 'lock-form';
  const title = document.createElement('h1');
  title.textContent = creating ? 'Crea una clave' : 'Pagos está bloqueado';
  const text = document.createElement('p');
  text.className = 'lock-text';
  text.textContent = creating
    ? 'Se pedirá cada vez que abras Pagos. Guárdala bien: si la olvidas no se puede recuperar.'
    : 'Ingresa tu clave para ver tus pagos.';
  const password = field('Clave', creating ? 'new-password' : 'current-password');
  const confirmation = creating ? field('Repite la clave', 'new-password') : null;
  const error = document.createElement('p');
  error.className = 'lock-error';
  error.hidden = true;
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = creating ? 'Guardar clave' : 'Desbloquear';
  form.append(title, text, password.wrap, ...(confirmation ? [confirmation.wrap] : []), error, submit);
  if (!creating) {
    const forgot = document.createElement('button');
    forgot.type = 'button';
    forgot.className = 'lock-link';
    forgot.textContent = 'Olvidé mi clave';
    forgot.addEventListener('click', () => screen.replaceChildren(resetForm(() => {
      screen.replaceChildren(form);
      password.input.focus();
    })));
    form.append(forgot);
  }

  const showError = (message) => {
    error.textContent = message;
    error.hidden = !message;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    if (creating) {
      const problem = passwordProblem(password.input.value, confirmation.input.value);
      if (problem) return showError(problem);
    }
    submit.disabled = true;
    try {
      if (creating) {
        await setPassword(password.input.value);
      } else if (!(await checkPassword(password.input.value))) {
        password.input.value = '';
        password.input.focus();
        return showError('Clave incorrecta.');
      }
      await unlock();
      screen.hidden = true;
      screen.replaceChildren();
      onUnlock();
    } finally {
      submit.disabled = false;
    }
  });

  screen.replaceChildren(form);
  screen.hidden = false;
  password.input.focus();
}
